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
)

// StreamConsumerManager manages multiple Redis Stream consumer groups
// and provides a unified interface for consuming events from various streams
type StreamConsumerManager struct {
	redis      *redis.Client
	eventStore *EventStore
	log        logf.Logger
	consumers  map[string]*StreamConsumer
	mu         sync.RWMutex
}

// StreamConsumer represents a single consumer reading from a Redis Stream
type StreamConsumer struct {
	Stream       string
	Group        string
	ConsumerID   string
	Handler      func(ctx context.Context, event IntelligenceEvent) error
	Running      bool
	EventsRead   int64
	LastReadTime *time.Time
	cancel       context.CancelFunc
}

// NewStreamConsumerManager creates a new stream consumer manager
func NewStreamConsumerManager(rdb *redis.Client, es *EventStore, log logf.Logger) *StreamConsumerManager {
	return &StreamConsumerManager{
		redis:      rdb,
		eventStore: es,
		log:        log,
		consumers:  make(map[string]*StreamConsumer),
	}
}

// RegisterConsumer registers a new stream consumer
func (scm *StreamConsumerManager) RegisterConsumer(stream, group, consumerID string, handler func(ctx context.Context, event IntelligenceEvent) error) error {
	if scm.redis == nil {
		return fmt.Errorf("Redis not available for stream consumer")
	}

	// Ensure consumer group exists
	err := scm.redis.XGroupCreateMkStream(context.Background(), stream, group, "0").Err()
	if err != nil {
		if err.Error() != "BUSYGROUP Consumer Group name already exists" {
			return fmt.Errorf("failed to create consumer group %s for stream %s: %w", group, stream, err)
		}
	}

	consumer := &StreamConsumer{
		Stream:     stream,
		Group:      group,
		ConsumerID: consumerID,
		Handler:    handler,
	}

	scm.mu.Lock()
	scm.consumers[stream+":"+group] = consumer
	scm.mu.Unlock()

	scm.log.Info("Stream consumer registered", "stream", stream, "group", group, "consumer", consumerID)
	return nil
}

// StartConsumer starts consuming from a registered stream
func (scm *StreamConsumerManager) StartConsumer(ctx context.Context, stream, group string) error {
	scm.mu.RLock()
	key := stream + ":" + group
	consumer, ok := scm.consumers[key]
	scm.mu.RUnlock()

	if !ok {
		return fmt.Errorf("consumer not registered for stream %s group %s", stream, group)
	}

	if consumer.Running {
		return nil // Already running
	}

	ctx, cancel := context.WithCancel(ctx)
	consumer.cancel = cancel
	consumer.Running = true

	go func() {
		defer func() {
			consumer.Running = false
		}()

		for {
			select {
			case <-ctx.Done():
				return
			default:
			}

			streams, err := scm.redis.XReadGroup(ctx, &redis.XReadGroupArgs{
				Group:    consumer.Group,
				Consumer: consumer.ConsumerID,
				Streams:  []string{consumer.Stream, ">"},
				Count:    10,
				Block:    5 * time.Second,
			}).Result()

			if err != nil {
				if err == redis.Nil {
					continue
				}
				if ctx.Err() != nil {
					return
				}
				scm.log.Error("Stream consumer read error", "stream", consumer.Stream, "error", err)
				time.Sleep(time.Second)
				continue
			}

			for _, s := range streams {
				for _, msg := range s.Messages {
					event := scm.messageToEvent(msg)

					if err := consumer.Handler(ctx, event); err != nil {
						scm.log.Error("Stream consumer handler error", "stream", consumer.Stream, "error", err)
						continue
					}

					// Acknowledge
					if err := scm.redis.XAck(ctx, consumer.Stream, consumer.Group, msg.ID).Err(); err != nil {
						scm.log.Error("Stream consumer ACK error", "stream", consumer.Stream, "error", err)
					}

					now := time.Now()
					consumer.EventsRead++
					consumer.LastReadTime = &now
				}
			}
		}
	}()

	scm.log.Info("Stream consumer started", "stream", stream, "group", group)
	return nil
}

// StartAllConsumers starts all registered consumers
func (scm *StreamConsumerManager) StartAllConsumers(ctx context.Context) error {
	scm.mu.RLock()
	defer scm.mu.RUnlock()

	for key, consumer := range scm.consumers {
		if err := scm.StartConsumer(ctx, consumer.Stream, consumer.Group); err != nil {
			scm.log.Error("Failed to start consumer", "key", key, "error", err)
		}
	}
	return nil
}

// StopConsumer stops a specific consumer
func (scm *StreamConsumerManager) StopConsumer(stream, group string) {
	scm.mu.Lock()
	defer scm.mu.Unlock()

	key := stream + ":" + group
	if consumer, ok := scm.consumers[key]; ok {
		if consumer.cancel != nil {
			consumer.cancel()
		}
		consumer.Running = false
	}
}

// StopAllConsumers stops all running consumers
func (scm *StreamConsumerManager) StopAllConsumers() {
	scm.mu.Lock()
	defer scm.mu.Unlock()

	for _, consumer := range scm.consumers {
		if consumer.cancel != nil {
			consumer.cancel()
		}
		consumer.Running = false
	}
}

// GetConsumerStats returns statistics for all consumers
func (scm *StreamConsumerManager) GetConsumerStats() []map[string]interface{} {
	scm.mu.RLock()
	defer scm.mu.RUnlock()

	var stats []map[string]interface{}
	for _, c := range scm.consumers {
		stat := map[string]interface{}{
			"stream":     c.Stream,
			"group":      c.Group,
			"consumerId": c.ConsumerID,
			"running":    c.Running,
			"eventsRead": c.EventsRead,
		}
		if c.LastReadTime != nil {
			stat["lastReadTime"] = c.LastReadTime.Format(time.RFC3339)
		}
		stats = append(stats, stat)
	}
	return stats
}

// messageToEvent converts a Redis XMessage to an IntelligenceEvent
func (scm *StreamConsumerManager) messageToEvent(msg redis.XMessage) IntelligenceEvent {
	event := IntelligenceEvent{ID: msg.ID}

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

	return event
}

// PublishToStream publishes an event to a Redis Stream (helper for external services)
func (scm *StreamConsumerManager) PublishToStream(ctx context.Context, stream string, event IntelligenceEvent) error {
	if scm.redis == nil {
		return fmt.Errorf("Redis not available")
	}

	if event.ID == "" {
		event.ID = uuid.New().String()
	}
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now()
	}

	payloadBytes, err := json.Marshal(event.Payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}
	metadataBytes, err := json.Marshal(event.Metadata)
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	values := map[string]interface{}{
		"id":            event.ID,
		"eventType":     event.EventType,
		"aggregateId":   event.AggregateID,
		"aggregateType": event.AggregateType,
		"payload":       string(payloadBytes),
		"metadata":      string(metadataBytes),
		"timestamp":     event.Timestamp.Format(time.RFC3339Nano),
	}

	_, err = scm.redis.XAdd(ctx, &redis.XAddArgs{
		Stream: stream,
		Values: values,
		MaxLen: 10000,
		Approx: true,
	}).Result()

	return err
}
