package intelligence

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/zerodha/logf"
)

// AlertNotifier manages real-time alert notifications via WebSocket and Redis Pub/Sub
type AlertNotifier struct {
	redis    *redis.Client
	log      logf.Logger
	handlers []AlertNotificationHandler
	mu       sync.RWMutex
}

// AlertNotificationHandler is the interface for receiving alert notifications
type AlertNotificationHandler interface {
	OnAlert(alert Alert)
}

// NotificationMessage represents a real-time notification message
type NotificationMessage struct {
	Type      string      `json:"type"` // "alert", "threat_level_change", "pattern_detected", "correlation_found"
	Timestamp time.Time   `json:"timestamp"`
	Payload   interface{} `json:"payload"`
}

// NewAlertNotifier creates a new alert notifier
func NewAlertNotifier(rdb *redis.Client, log logf.Logger) *AlertNotifier {
	return &AlertNotifier{
		redis: rdb,
		log:   log,
	}
}

// RegisterHandler registers a handler for alert notifications
func (an *AlertNotifier) RegisterHandler(handler AlertNotificationHandler) {
	an.mu.Lock()
	defer an.mu.Unlock()
	an.handlers = append(an.handlers, handler)
}

// NotifyAlert sends an alert notification through all registered handlers and Redis Pub/Sub
func (an *AlertNotifier) NotifyAlert(ctx context.Context, alert Alert) {
	// Notify local handlers
	an.mu.RLock()
	handlers := make([]AlertNotificationHandler, len(an.handlers))
	copy(handlers, an.handlers)
	an.mu.RUnlock()

	for _, handler := range handlers {
		func() {
			defer func() {
				if r := recover(); r != nil {
					an.log.Error("Alert notification handler panicked", "error", r)
				}
			}()
			handler.OnAlert(alert)
		}()
	}

	// Publish to Redis for cross-process notifications
	if an.redis != nil {
		msg := NotificationMessage{
			Type:      "alert",
			Timestamp: time.Now(),
			Payload:   alert,
		}

		data, err := json.Marshal(msg)
		if err != nil {
			an.log.Error("Failed to marshal alert notification", "error", err)
			return
		}

		if err := an.redis.Publish(ctx, "whatomate:notifications", string(data)).Err(); err != nil {
			an.log.Error("Failed to publish alert notification to Redis", "error", err)
		}
	}
}

// NotifyThreatLevelChange sends a threat level change notification
func (an *AlertNotifier) NotifyThreatLevelChange(ctx context.Context, oldLevel, newLevel string, score int) {
	if an.redis == nil {
		return
	}

	msg := NotificationMessage{
		Type:      "threat_level_change",
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"oldLevel": oldLevel,
			"newLevel": newLevel,
			"score":    score,
		},
	}

	data, err := json.Marshal(msg)
	if err != nil {
		an.log.Error("Failed to marshal threat level notification", "error", err)
		return
	}

	if err := an.redis.Publish(ctx, "whatomate:notifications", string(data)).Err(); err != nil {
		an.log.Error("Failed to publish threat level notification", "error", err)
	}
}

// NotifyPatternDetected sends a pattern detection notification
func (an *AlertNotifier) NotifyPatternDetected(ctx context.Context, pattern PatternDetection) {
	if an.redis == nil {
		return
	}

	msg := NotificationMessage{
		Type:      "pattern_detected",
		Timestamp: time.Now(),
		Payload:   pattern,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		an.log.Error("Failed to marshal pattern notification", "error", err)
		return
	}

	if err := an.redis.Publish(ctx, "whatomate:notifications", string(data)).Err(); err != nil {
		an.log.Error("Failed to publish pattern notification", "error", err)
	}
}

// NotifyCorrelationFound sends a correlation found notification
func (an *AlertNotifier) NotifyCorrelationFound(ctx context.Context, correlation CorrelationResult) {
	if an.redis == nil {
		return
	}

	msg := NotificationMessage{
		Type:      "correlation_found",
		Timestamp: time.Now(),
		Payload:   correlation,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		an.log.Error("Failed to marshal correlation notification", "error", err)
		return
	}

	if err := an.redis.Publish(ctx, "whatomate:notifications", string(data)).Err(); err != nil {
		an.log.Error("Failed to publish correlation notification", "error", err)
	}
}

// Subscribe subscribes to real-time notifications from Redis Pub/Sub
func (an *AlertNotifier) Subscribe(ctx context.Context) error {
	if an.redis == nil {
		return nil
	}

	sub := an.redis.Subscribe(ctx, "whatomate:notifications")
	_, err := sub.Receive(ctx)
	if err != nil {
		return err
	}

	go func() {
		ch := sub.Channel()
		for {
			select {
			case <-ctx.Done():
				sub.Close()
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}

				var notification NotificationMessage
				if err := json.Unmarshal([]byte(msg.Payload), &notification); err != nil {
					an.log.Error("Failed to unmarshal notification", "error", err)
					continue
				}

				an.log.Debug("Received notification", "type", notification.Type)

				// Dispatch to handlers based on type
				switch notification.Type {
				case "alert":
					if alertData, err := json.Marshal(notification.Payload); err == nil {
						var alert Alert
						if err := json.Unmarshal(alertData, &alert); err == nil {
							an.mu.RLock()
							for _, h := range an.handlers {
								h.OnAlert(alert)
							}
							an.mu.RUnlock()
						}
					}
				}
			}
		}
	}()

	an.log.Info("Subscribed to real-time notifications")
	return nil
}
