package intelligence

import (
        "context"
        "encoding/json"
        "fmt"
        "os"
        "time"

        "github.com/redis/go-redis/v9"
        "github.com/zerodha/logf"
)

// OSINTStreamConsumer consumes OSINT events from Redis Streams
// and processes them through the intelligence pipeline
type OSINTStreamConsumer struct {
        eventStore  *EventStore
        redis       *redis.Client
        log         logf.Logger
        osintClient *OSINTClient
        consumerID  string
}

// NewOSINTStreamConsumer creates a new OSINT stream consumer
func NewOSINTStreamConsumer(es *EventStore, rdb *redis.Client, osintClient *OSINTClient, log logf.Logger) *OSINTStreamConsumer {
        hostname, _ := os.Hostname()
        consumerID := fmt.Sprintf("osint-consumer-%s-%d", hostname, time.Now().UnixMilli())

        return &OSINTStreamConsumer{
                eventStore:  es,
                redis:       rdb,
                osintClient: osintClient,
                log:         log,
                consumerID:  consumerID,
        }
}

// Start begins consuming OSINT events from Redis Streams
func (osc *OSINTStreamConsumer) Start(ctx context.Context) error {
        if osc.redis == nil {
                return fmt.Errorf("Redis not available for OSINT stream consumer")
        }

        // Ensure consumer group exists
        groupName := "intelligence-osint-consumers"
        err := osc.redis.XGroupCreateMkStream(ctx, StreamOSINTEvents, groupName, "0").Err()
        if err != nil {
                // Ignore BUSYGROUP error - group already exists
                if err.Error() != "BUSYGROUP Consumer Group name already exists" {
                        return fmt.Errorf("failed to create OSINT consumer group: %w", err)
                }
        }

        osc.log.Info("OSINT stream consumer started", "consumer_id", osc.consumerID, "group", groupName)

        go func() {
                for {
                        select {
                        case <-ctx.Done():
                                osc.log.Info("OSINT stream consumer stopped")
                                return
                        default:
                        }

                        streams, err := osc.redis.XReadGroup(ctx, &redis.XReadGroupArgs{
                                Group:    groupName,
                                Consumer: osc.consumerID,
                                Streams:  []string{StreamOSINTEvents, ">"},
                                Count:    10,
                                Block:    5 * time.Second,
                        }).Result()

                        if err != nil {
                                if err == redis.Nil {
                                        continue // No new messages
                                }
                                if ctx.Err() != nil {
                                        return
                                }
                                osc.log.Error("Failed to read OSINT stream", "error", err)
                                time.Sleep(time.Second)
                                continue
                        }

                        for _, stream := range streams {
                                for _, msg := range stream.Messages {
                                        if err := osc.processOSINTEvent(ctx, msg); err != nil {
                                                osc.log.Error("Failed to process OSINT event", "error", err, "message_id", msg.ID)
                                                continue
                                        }

                                        // Acknowledge the message
                                        if err := osc.redis.XAck(ctx, StreamOSINTEvents, groupName, msg.ID).Err(); err != nil {
                                                osc.log.Error("Failed to ACK OSINT event", "error", err, "message_id", msg.ID)
                                        }
                                }
                        }
                }
        }()

        return nil
}

// processOSINTEvent processes a single OSINT event from Redis
func (osc *OSINTStreamConsumer) processOSINTEvent(ctx context.Context, msg redis.XMessage) error {
        eventType, _ := msg.Values["event_type"].(string)
        source, _ := msg.Values["source"].(string)
        timestamp, _ := msg.Values["timestamp"].(string)

        osc.log.Debug("Processing OSINT event", "event_type", eventType, "source", source, "id", msg.ID)

        switch eventType {
        case "osint.data_refreshed":
                return osc.handleDataRefreshed(ctx, msg)
        case "osint.snapshot_ready":
                return osc.handleSnapshotReady(ctx, msg)
        default:
                osc.log.Warn("Unknown OSINT event type", "event_type", eventType)
                // Still store it as an event
                return osc.eventStore.Append(ctx, StreamOSINTEvents, IntelligenceEvent{
                        EventType:     EventTypeOSINTFetched,
                        AggregateID:   msg.ID,
                        AggregateType: "osint_event",
                        Payload: map[string]interface{}{
                                "eventType":  eventType,
                                "source":     source,
                                "timestamp":  timestamp,
                                "messageId":  msg.ID,
                        },
                        Timestamp: time.Now(),
                })
        }
}

// handleDataRefreshed processes an OSINT data refresh event
func (osc *OSINTStreamConsumer) handleDataRefreshed(ctx context.Context, msg redis.XMessage) error {
        dataJSON, _ := msg.Values["data_json"].(string)

        var data map[string]interface{}
        if err := json.Unmarshal([]byte(dataJSON), &data); err != nil {
                return fmt.Errorf("failed to unmarshal OSINT data: %w", err)
        }

        // Extract threat level from OSINT data
        threatLevel := "low"
        if tl, ok := data["threat_level"]; ok {
                if tlStr, ok := tl.(string); ok {
                        threatLevel = tlStr
                }
        }

        // Count events by category
        eventCounts := make(map[string]int)
        categories := []string{"earthquakes", "military_flights", "firms_fires", "gps_jamming", "uavs", "liveuamap", "sigint"}
        for _, cat := range categories {
                if arr, ok := data[cat]; ok {
                        if arrSlice, ok := arr.([]interface{}); ok {
                                eventCounts[cat] = len(arrSlice)
                        }
                }
        }

        // Store the processed OSINT event
        return osc.eventStore.Append(ctx, StreamOSINTEvents, IntelligenceEvent{
                EventType:     EventTypeOSINTFetched,
                AggregateID:   msg.ID,
                AggregateType: "osint_data",
                Payload: map[string]interface{}{
                        "threatLevel":  threatLevel,
                        "eventCounts":  eventCounts,
                        "source":       "shadowbroker-osint",
                        "redisMessageId": msg.ID,
                },
                Timestamp: time.Now(),
        })
}

// handleSnapshotReady processes an OSINT snapshot event
func (osc *OSINTStreamConsumer) handleSnapshotReady(ctx context.Context, msg redis.XMessage) error {
        dataJSON, _ := msg.Values["data_json"].(string)

        // Parse the snapshot
        var snapshot OSINTSnapshot
        if err := json.Unmarshal([]byte(dataJSON), &snapshot); err != nil {
                return fmt.Errorf("failed to unmarshal OSINT snapshot: %w", err)
        }

        // Store the snapshot event with counts
        return osc.eventStore.Append(ctx, StreamOSINTEvents, IntelligenceEvent{
                EventType:     EventTypeOSINTFetched,
                AggregateID:   msg.ID,
                AggregateType: "osint_snapshot",
                Payload: map[string]interface{}{
                        "earthquakeCount": len(snapshot.Earthquakes),
                        "flightCount":     len(snapshot.Flights),
                        "fireCount":       len(snapshot.Fires),
                        "shipCount":       len(snapshot.Ships),
                        "gdeltCount":      len(snapshot.GDELT),
                        "newsCount":       len(snapshot.News),
                        "gpsJamCount":     len(snapshot.GPSJamming),
                        "uavCount":        len(snapshot.UAVs),
                        "liveuamapCount":  len(snapshot.LiveUAMap),
                        "sigintCount":     len(snapshot.SIGINT),
                        "source":          "shadowbroker-osint-snapshot",
                },
                Timestamp: time.Now(),
        })
}
