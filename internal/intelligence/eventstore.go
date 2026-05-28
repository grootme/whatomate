package intelligence

import (
        "context"
        "encoding/json"
        "fmt"
        "sync"
        "time"

        "github.com/google/uuid"
        "github.com/redis/go-redis/v9"
        "github.com/zerodha/logf"
        "gorm.io/gorm"
)

// IntelEvent is the PostgreSQL model for persisted intelligence events
type IntelEvent struct {
        ID            uuid.UUID       `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
        EventType     string          `gorm:"size:100;index;not null" json:"eventType"`
        AggregateID   string          `gorm:"size:255;index;not null" json:"aggregateId"`
        AggregateType string          `gorm:"size:100;index;not null" json:"aggregateType"`
        Stream        string          `gorm:"size:255;index;not null" json:"stream"`
        Payload       json.RawMessage `gorm:"type:jsonb;default:'{}'" json:"payload"`
        Metadata      json.RawMessage `gorm:"type:jsonb;default:'{}'" json:"metadata"`
        Timestamp     time.Time       `gorm:"index;not null" json:"timestamp"`
        Processed     bool            `gorm:"default:false" json:"processed"`
        CreatedAt     time.Time       `gorm:"autoCreateTime" json:"createdAt"`
}

func (IntelEvent) TableName() string {
        return "intel_events"
}

// EventStore implements dual-write event sourcing with Redis Streams + PostgreSQL
type EventStore struct {
        db    *gorm.DB
        redis *redis.Client
        log   logf.Logger
        mu    sync.RWMutex
}

// NewEventStore creates a new EventStore with dual-write capabilities
func NewEventStore(db *gorm.DB, rdb *redis.Client, log logf.Logger) *EventStore {
        es := &EventStore{
                db:    db,
                redis: rdb,
                log:   log,
        }

        // Auto-migrate the PostgreSQL events table
        if err := db.AutoMigrate(&IntelEvent{}); err != nil {
                log.Error("Failed to auto-migrate intel_events table", "error", err)
        }

        return es
}

// Append writes an event to both Redis Stream and PostgreSQL (dual-write)
func (es *EventStore) Append(ctx context.Context, stream string, event IntelligenceEvent) error {
        if event.ID == "" {
                event.ID = uuid.New().String()
        }
        if event.Timestamp.IsZero() {
                event.Timestamp = time.Now()
        }
        event.Stream = stream

        // Serialize payload and metadata
        payloadBytes, err := json.Marshal(event.Payload)
        if err != nil {
                return fmt.Errorf("failed to marshal event payload: %w", err)
        }
        metadataBytes, err := json.Marshal(event.Metadata)
        if err != nil {
                return fmt.Errorf("failed to marshal event metadata: %w", err)
        }

        // Write to PostgreSQL first (durable store)
        pgEvent := IntelEvent{
                ID:            uuid.New(),
                EventType:     event.EventType,
                AggregateID:   event.AggregateID,
                AggregateType: event.AggregateType,
                Stream:        stream,
                Payload:       payloadBytes,
                Metadata:      metadataBytes,
                Timestamp:     event.Timestamp,
                Processed:     event.Processed,
        }

        if err := es.db.WithContext(ctx).Create(&pgEvent).Error; err != nil {
                es.log.Error("Failed to write event to PostgreSQL", "error", err, "stream", stream)
                // Continue - Redis write is the primary
        }

        // Write to Redis Stream (real-time)
        if es.redis != nil {
                values := map[string]interface{}{
                        "id":            event.ID,
                        "eventType":     event.EventType,
                        "aggregateId":   event.AggregateID,
                        "aggregateType": event.AggregateType,
                        "payload":       string(payloadBytes),
                        "metadata":      string(metadataBytes),
                        "timestamp":     event.Timestamp.Format(time.RFC3339Nano),
                        "processed":     fmt.Sprintf("%v", event.Processed),
                }

                _, err = es.redis.XAdd(ctx, &redis.XAddArgs{
                        Stream: stream,
                        Values: values,
                        MaxLen: 10000, // Keep last 10k events per stream
                        Approx: true,  // Use ~ for approximate trimming
                }).Result()

                if err != nil {
                        es.log.Error("Failed to write event to Redis Stream", "error", err, "stream", stream)
                        // PostgreSQL already has the event, so this is not fatal
                }
        }

        return nil
}

// Load reads all events for a given aggregateID from PostgreSQL
func (es *EventStore) Load(ctx context.Context, aggregateID string) ([]IntelligenceEvent, error) {
        var pgEvents []IntelEvent
        if err := es.db.WithContext(ctx).
                Where("aggregate_id = ?", aggregateID).
                Order("timestamp ASC").
                Find(&pgEvents).Error; err != nil {
                return nil, fmt.Errorf("failed to load events for aggregate %s: %w", aggregateID, err)
        }

        events := make([]IntelligenceEvent, 0, len(pgEvents))
        for _, pg := range pgEvents {
                events = append(events, es.pgToEvent(pg))
        }
        return events, nil
}

// GetRecent retrieves recent events from a Redis Stream (fast path)
// Falls back to PostgreSQL if Redis is unavailable
func (es *EventStore) GetRecent(ctx context.Context, stream string, count int64) ([]IntelligenceEvent, error) {
        if es.redis != nil {
                messages, err := es.redis.XRevRange(ctx, stream, "+", "-").Result()
                if err != nil && err != redis.Nil {
                        es.log.Warn("Redis XRevRange failed, falling back to PostgreSQL", "error", err, "stream", stream)
                } else if err == nil {
                        return es.messagesToEvents(messages, count), nil
                }
        }

        // Fallback to PostgreSQL
        var pgEvents []IntelEvent
        if err := es.db.WithContext(ctx).
                Where("stream = ?", stream).
                Order("timestamp DESC").
                Limit(int(count)).
                Find(&pgEvents).Error; err != nil {
                return nil, fmt.Errorf("failed to get recent events from PostgreSQL: %w", err)
        }

        events := make([]IntelligenceEvent, 0, len(pgEvents))
        for _, pg := range pgEvents {
                events = append(events, es.pgToEvent(pg))
        }
        return events, nil
}

// ReadNew reads new events from a consumer group (blocking read)
func (es *EventStore) ReadNew(ctx context.Context, stream, consumerGroup, consumer string, count int64, block time.Duration) ([]IntelligenceEvent, error) {
        if es.redis == nil {
                return nil, fmt.Errorf("Redis unavailable for consumer group read")
        }

        // Ensure consumer group exists
        err := es.redis.XGroupCreateMkStream(ctx, stream, consumerGroup, "0").Err()
        if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
                es.log.Warn("Failed to create consumer group", "error", err, "stream", stream, "group", consumerGroup)
                // Don't return - the group may already exist
        }

        streams, err := es.redis.XReadGroup(ctx, &redis.XReadGroupArgs{
                Group:    consumerGroup,
                Consumer: consumer,
                Streams:  []string{stream, ">"},
                Count:    count,
                Block:    block,
        }).Result()

        if err != nil {
                if err == redis.Nil {
                        return nil, nil
                }
                return nil, fmt.Errorf("failed to read from stream: %w", err)
        }

        var events []IntelligenceEvent
        for _, s := range streams {
                events = append(events, es.messagesToEvents(s.Messages, count)...)
        }
        return events, nil
}

// Ack acknowledges processing of an event in a consumer group
func (es *EventStore) Ack(ctx context.Context, stream, consumerGroup, eventID string) error {
        if es.redis == nil {
                return nil // Redis unavailable, nothing to ack
        }
        return es.redis.XAck(ctx, stream, consumerGroup, eventID).Err()
}

// MarkProcessed marks an event as processed in PostgreSQL
func (es *EventStore) MarkProcessed(ctx context.Context, eventID string) error {
        // Try to parse as UUID first (PostgreSQL primary key format)
        if _, err := uuid.Parse(eventID); err != nil {
                // Not a UUID - could be a Redis stream ID, try to find by aggregate_id
                result := es.db.WithContext(ctx).
                        Model(&IntelEvent{}).
                        Where("aggregate_id = ?", eventID).
                        Update("processed", true)
                if result.Error != nil {
                        return fmt.Errorf("failed to mark event %s as processed: %w", eventID, result.Error)
                }
                if result.RowsAffected == 0 {
                        // Not found by aggregate_id either - may only exist in Redis
                        es.log.Debug("Event not found in PostgreSQL for marking as processed", "id", eventID)
                }
                return nil
        }

        result := es.db.WithContext(ctx).
                Model(&IntelEvent{}).
                Where("id = ?", eventID).
                Update("processed", true)
        if result.Error != nil {
                return fmt.Errorf("failed to mark event %s as processed: %w", eventID, result.Error)
        }
        if result.RowsAffected == 0 {
                return fmt.Errorf("event %s not found for marking as processed", eventID)
        }
        return nil
}

// GetStreamInfo returns information about a stream
func (es *EventStore) GetStreamInfo(ctx context.Context, stream string) (*StreamInfo, error) {
        info := &StreamInfo{Name: stream}

        if es.redis != nil {
                streamInfo, err := es.redis.XInfoStream(ctx, stream).Result()
                if err == nil {
                        info.Length = streamInfo.Length
                        info.LastEventID = streamInfo.LastGeneratedID

                        groups, err := es.redis.XInfoGroups(ctx, stream).Result()
                        if err == nil {
                                info.ConsumerGroups = len(groups)
                        }
                        return info, nil
                }
        }

        // Fallback to PostgreSQL count
        var count int64
        es.db.WithContext(ctx).Model(&IntelEvent{}).Where("stream = ?", stream).Count(&count)
        info.Length = count
        return info, nil
}

// GetAllStreamInfo returns info for all known streams
func (es *EventStore) GetAllStreamInfo(ctx context.Context) map[string]*StreamInfo {
        streams := []string{
                StreamWhatsAppMessages, StreamTelegramMessages, StreamOSINTEvents,
                StreamAnalyzedMessages, StreamIntelEvents, StreamThreatAssessments,
                StreamAlerts, StreamDecisions, StreamPatterns, StreamPredictions, StreamReports,
        }

        result := make(map[string]*StreamInfo)
        for _, s := range streams {
                info, err := es.GetStreamInfo(ctx, s)
                if err != nil {
                        result[s] = &StreamInfo{Name: s, Length: 0}
                        continue
                }
                result[s] = info
        }
        return result
}

// ReplayEvents replays events from a given timestamp
func (es *EventStore) ReplayEvents(ctx context.Context, stream string, from time.Time, count int) ([]IntelligenceEvent, error) {
        var pgEvents []IntelEvent
        if err := es.db.WithContext(ctx).
                Where("stream = ? AND timestamp >= ?", stream, from).
                Order("timestamp ASC").
                Limit(count).
                Find(&pgEvents).Error; err != nil {
                return nil, fmt.Errorf("failed to replay events: %w", err)
        }

        events := make([]IntelligenceEvent, 0, len(pgEvents))
        for _, pg := range pgEvents {
                events = append(events, es.pgToEvent(pg))
        }
        return events, nil
}

// GetUnprocessedEvents retrieves unprocessed events from PostgreSQL
func (es *EventStore) GetUnprocessedEvents(ctx context.Context, stream string, limit int) ([]IntelligenceEvent, error) {
        var pgEvents []IntelEvent
        if err := es.db.WithContext(ctx).
                Where("stream = ? AND processed = false", stream).
                Order("timestamp ASC").
                Limit(limit).
                Find(&pgEvents).Error; err != nil {
                return nil, fmt.Errorf("failed to get unprocessed events: %w", err)
        }

        events := make([]IntelligenceEvent, 0, len(pgEvents))
        for _, pg := range pgEvents {
                events = append(events, es.pgToEvent(pg))
        }
        return events, nil
}

// CountByStream returns event counts grouped by stream
func (es *EventStore) CountByStream(ctx context.Context) map[string]int64 {
        streams := []string{
                StreamWhatsAppMessages, StreamTelegramMessages, StreamOSINTEvents,
                StreamAnalyzedMessages, StreamIntelEvents, StreamThreatAssessments,
                StreamAlerts, StreamDecisions, StreamPatterns, StreamPredictions, StreamReports,
        }

        result := make(map[string]int64)
        for _, s := range streams {
                var count int64
                es.db.WithContext(ctx).Model(&IntelEvent{}).Where("stream = ?", s).Count(&count)
                result[s] = count
        }
        return result
}

// pgToEvent converts a PostgreSQL IntelEvent to an IntelligenceEvent
func (es *EventStore) pgToEvent(pg IntelEvent) IntelligenceEvent {
        var payload map[string]interface{}
        if pg.Payload != nil {
                _ = json.Unmarshal(pg.Payload, &payload)
        }
        var metadata map[string]interface{}
        if pg.Metadata != nil {
                _ = json.Unmarshal(pg.Metadata, &metadata)
        }

        return IntelligenceEvent{
                ID:            pg.ID.String(),
                EventType:     pg.EventType,
                AggregateID:   pg.AggregateID,
                AggregateType: pg.AggregateType,
                Stream:        pg.Stream,
                Payload:       payload,
                Metadata:      metadata,
                Timestamp:     pg.Timestamp,
                Processed:     pg.Processed,
        }
}

// messagesToEvents converts Redis XMessage slice to IntelligenceEvent slice
func (es *EventStore) messagesToEvents(messages []redis.XMessage, limit int64) []IntelligenceEvent {
        if limit > 0 && int64(len(messages)) > limit {
                messages = messages[:limit]
        }

        events := make([]IntelligenceEvent, 0, len(messages))
        for _, msg := range messages {
                event := IntelligenceEvent{
                        ID: msg.ID,
                }
                if v, ok := msg.Values["eventType"]; ok {
                        event.EventType, _ = v.(string)
                }
                if v, ok := msg.Values["aggregateId"]; ok {
                        event.AggregateID, _ = v.(string)
                }
                if v, ok := msg.Values["aggregateType"]; ok {
                        event.AggregateType, _ = v.(string)
                }
                if v, ok := msg.Values["payload"]; ok {
                        if s, ok := v.(string); ok {
                                _ = json.Unmarshal([]byte(s), &event.Payload)
                        }
                }
                if v, ok := msg.Values["metadata"]; ok {
                        if s, ok := v.(string); ok {
                                _ = json.Unmarshal([]byte(s), &event.Metadata)
                        }
                }
                if v, ok := msg.Values["timestamp"]; ok {
                        if s, ok := v.(string); ok {
                                event.Timestamp, _ = time.Parse(time.RFC3339Nano, s)
                        }
                }
                if v, ok := msg.Values["processed"]; ok {
                        if s, ok := v.(string); ok {
                                event.Processed = s == "true"
                        }
                }
                events = append(events, event)
        }
        return events
}
