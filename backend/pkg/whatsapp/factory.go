package whatsapp

import (
	"fmt"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/internal/websocket"
	"github.com/zerodha/logf"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"gorm.io/gorm"
)

// ClientFactory creates instances of ClientInterface based on account configuration.
type ClientFactory struct {
	log            logf.Logger
	db             *gorm.DB
	whatsmeowStore *sqlstore.Container
	wshub          *websocket.Hub
	metaClient     *MetaClientAdapter // Reusable Meta client adapter
}

// NewClientFactory creates a new ClientFactory.
func NewClientFactory(log logf.Logger, db *gorm.DB, whatsmeowStore *sqlstore.Container, wshub *websocket.Hub) *ClientFactory {
	return &ClientFactory{
		log:            log,
		db:             db,
		whatsmeowStore: whatsmeowStore,
		wshub:          wshub,
		metaClient:     NewMetaClientAdapter(log),
	}
}

// GetClient returns a ClientInterface for the given account.
func (f *ClientFactory) GetClient(account *models.WhatsAppAccount) (ClientInterface, error) {
	switch account.ClientType {
	case MetaClientType:
		return f.metaClient, nil
	case WhatsmeowClientType:
		if f.whatsmeowStore == nil {
			return nil, fmt.Errorf("whatsmeow store is not initialized")
		}
		// In a real scenario, you might want to reuse the adapter or create a new one.
		// For now, creating a new adapter for each whatsmeow client.
		return NewWhatsmeowClientAdapter(f.log, f.db, f.whatsmeowStore, f.wshub), nil
	default:
		// Default to Meta for backward compatibility
		return f.metaClient, nil
	}
}
