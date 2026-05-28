package intelligence

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/zerodha/logf"
)

// WebSocketAlertBridge bridges the intelligence alert system to WebSocket clients
// It implements the AlertNotificationHandler interface and manages WebSocket message broadcasting
type WebSocketAlertBridge struct {
	hub        WSClientBroadcaster
	log        logf.Logger
	clients    map[string]*WSClient
	mu         sync.RWMutex
	msgBuffer  []WSMessage
	maxBuffer  int
}

// WSClientBroadcaster is the interface for broadcasting messages to WebSocket clients
type WSClientBroadcaster interface {
	Broadcast(messageType string, payload interface{})
}

// WSClient represents a connected WebSocket client interested in intelligence alerts
type WSClient struct {
	ID         string    `json:"id"`
	Connected  time.Time `json:"connected"`
	LastActive time.Time `json:"lastActive"`
	Filters    WSFilter  `json:"filters"`
}

// WSFilter represents client-side filtering preferences for WebSocket notifications
type WSFilter struct {
	Severities []string `json:"severities,omitempty"` // Only receive alerts of these severities
	Types      []string `json:"types,omitempty"`      // Only receive these notification types
	MinScore   int      `json:"minScore,omitempty"`   // Minimum threat score to receive
}

// WSMessage represents a WebSocket message sent to clients
type WSMessage struct {
	ID        string      `json:"id"`
	Type      string      `json:"type"` // "alert", "threat_change", "pattern", "correlation", "metrics"
	Payload   interface{} `json:"payload"`
	Timestamp time.Time   `json:"timestamp"`
}

// NewWebSocketAlertBridge creates a new WebSocket alert bridge
func NewWebSocketAlertBridge(hub WSClientBroadcaster, log logf.Logger) *WebSocketAlertBridge {
	return &WebSocketAlertBridge{
		hub:       hub,
		log:       log,
		clients:   make(map[string]*WSClient),
		maxBuffer: 100,
	}
}

// OnAlert implements AlertNotificationHandler - broadcasts alerts to WebSocket clients
func (wsb *WebSocketAlertBridge) OnAlert(alert Alert) {
	ctx := context.Background()
	msg := WSMessage{
		ID:        uuid.New().String(),
		Type:      "alert",
		Payload:   alert,
		Timestamp: time.Now(),
	}

	wsb.bufferMessage(msg)
	wsb.broadcastFiltered(ctx, msg)
}

// BroadcastThreatChange broadcasts a threat level change to all WebSocket clients
func (wsb *WebSocketAlertBridge) BroadcastThreatChange(ctx context.Context, oldLevel, newLevel string, score int) {
	msg := WSMessage{
		ID:   uuid.New().String(),
		Type: "threat_change",
		Payload: map[string]interface{}{
			"oldLevel": oldLevel,
			"newLevel": newLevel,
			"score":    score,
		},
		Timestamp: time.Now(),
	}

	wsb.bufferMessage(msg)
	wsb.broadcastFiltered(ctx, msg)
}

// BroadcastPattern broadcasts a pattern detection to WebSocket clients
func (wsb *WebSocketAlertBridge) BroadcastPattern(ctx context.Context, pattern PatternDetection) {
	msg := WSMessage{
		ID:        uuid.New().String(),
		Type:      "pattern",
		Payload:   pattern,
		Timestamp: time.Now(),
	}

	wsb.bufferMessage(msg)
	wsb.broadcastFiltered(ctx, msg)
}

// BroadcastCorrelation broadcasts a correlation finding to WebSocket clients
func (wsb *WebSocketAlertBridge) BroadcastCorrelation(ctx context.Context, correlation CorrelationResult) {
	msg := WSMessage{
		ID:        uuid.New().String(),
		Type:      "correlation",
		Payload:   correlation,
		Timestamp: time.Now(),
	}

	wsb.bufferMessage(msg)
	wsb.broadcastFiltered(ctx, msg)
}

// BroadcastMetrics broadcasts periodic metrics updates
func (wsb *WebSocketAlertBridge) BroadcastMetrics(ctx context.Context, metrics map[string]interface{}) {
	msg := WSMessage{
		ID:        uuid.New().String(),
		Type:      "metrics",
		Payload:   metrics,
		Timestamp: time.Now(),
	}

	wsb.bufferMessage(msg)
	wsb.broadcastFiltered(ctx, msg)
}

// RegisterClient registers a new WebSocket client
func (wsb *WebSocketAlertBridge) RegisterClient(clientID string, filters WSFilter) {
	wsb.mu.Lock()
	defer wsb.mu.Unlock()

	wsb.clients[clientID] = &WSClient{
		ID:         clientID,
		Connected:  time.Now(),
		LastActive: time.Now(),
		Filters:    filters,
	}

	wsb.log.Info("WebSocket client registered for alerts", "clientId", clientID)
}

// UnregisterClient removes a WebSocket client
func (wsb *WebSocketAlertBridge) UnregisterClient(clientID string) {
	wsb.mu.Lock()
	defer wsb.mu.Unlock()

	delete(wsb.clients, clientID)
	wsb.log.Info("WebSocket client unregistered from alerts", "clientId", clientID)
}

// UpdateClientFilters updates the filters for a WebSocket client
func (wsb *WebSocketAlertBridge) UpdateClientFilters(clientID string, filters WSFilter) {
	wsb.mu.Lock()
	defer wsb.mu.Unlock()

	if client, ok := wsb.clients[clientID]; ok {
		client.Filters = filters
		client.LastActive = time.Now()
	}
}

// GetConnectedClients returns the list of connected clients
func (wsb *WebSocketAlertBridge) GetConnectedClients() []WSClient {
	wsb.mu.RLock()
	defer wsb.mu.RUnlock()

	clients := make([]WSClient, 0, len(wsb.clients))
	for _, c := range wsb.clients {
		clients = append(clients, *c)
	}
	return clients
}

// GetMessageBuffer returns the buffered messages for clients that need to catch up
func (wsb *WebSocketAlertBridge) GetMessageBuffer() []WSMessage {
	wsb.mu.RLock()
	defer wsb.mu.RUnlock()

	result := make([]WSMessage, len(wsb.msgBuffer))
	copy(result, wsb.msgBuffer)
	return result
}

// broadcastFiltered sends a message to the WebSocket hub if there are interested clients
func (wsb *WebSocketAlertBridge) broadcastFiltered(ctx context.Context, msg WSMessage) {
	wsb.mu.RLock()
	hasClients := len(wsb.clients) > 0
	wsb.mu.RUnlock()

	if !hasClients && wsb.hub == nil {
		return
	}

	if wsb.hub != nil {
		wsb.hub.Broadcast(msg.Type, msg.Payload)
	}

	wsb.log.Debug("WebSocket alert broadcast", "type", msg.Type, "id", msg.ID)
}

// bufferMessage adds a message to the circular buffer for replay
func (wsb *WebSocketAlertBridge) bufferMessage(msg WSMessage) {
	wsb.mu.Lock()
	defer wsb.mu.Unlock()

	wsb.msgBuffer = append(wsb.msgBuffer, msg)
	if len(wsb.msgBuffer) > wsb.maxBuffer {
		wsb.msgBuffer = wsb.msgBuffer[len(wsb.msgBuffer)-wsb.maxBuffer:]
	}
}

// SendReplay sends buffered messages to a specific client for catch-up
func (wsb *WebSocketAlertBridge) SendReplay(ctx context.Context, clientID string, since time.Time) error {
	wsb.mu.RLock()
	defer wsb.mu.RUnlock()

	if _, ok := wsb.clients[clientID]; !ok {
		return nil
	}

	// Filter messages since the given time
	var replayMsgs []WSMessage
	for _, msg := range wsb.msgBuffer {
		if msg.Timestamp.After(since) {
			replayMsgs = append(replayMsgs, msg)
		}
	}

	if len(replayMsgs) == 0 {
		return nil
	}

	// Send replay as a single batch message
	if wsb.hub != nil {
		wsb.hub.Broadcast("replay", map[string]interface{}{
			"clientId":  clientID,
			"messages":  replayMsgs,
			"count":     len(replayMsgs),
		})
	}

	return nil
}

// GetStats returns WebSocket alert bridge statistics
func (wsb *WebSocketAlertBridge) GetStats() map[string]interface{} {
	wsb.mu.RLock()
	defer wsb.mu.RUnlock()

	return map[string]interface{}{
		"connectedClients": len(wsb.clients),
		"bufferedMessages": len(wsb.msgBuffer),
	}
}

// NoOpBroadcaster is a no-op implementation of WSClientBroadcaster for when no hub is available
type NoOpBroadcaster struct{}

// Broadcast implements WSClientBroadcaster with no-op
func (n *NoOpBroadcaster) Broadcast(messageType string, payload interface{}) {
	// No-op
}

// MarshalJSON helps serialize WSMessage for WebSocket transport
func (m WSMessage) MarshalJSON() ([]byte, error) {
	type Alias WSMessage
	return json.Marshal(&struct {
		Alias
	}{
		Alias: Alias(m),
	})
}
