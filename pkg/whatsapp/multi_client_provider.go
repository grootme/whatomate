package whatsapp

import (
	"context"
	"fmt"

	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/internal/websocket"
	"github.com/zerodha/logf"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"gorm.io/gorm"
)

// MultiClientProvider implements ClientInterface and delegates to the appropriate adapter.
type MultiClientProvider struct {
	log            logf.Logger
	metaAdapter    *MetaClientAdapter
	whatsmeowAdapter *WhatsmeowClientAdapter
}

// NewMultiClientProvider creates a new MultiClientProvider.
func NewMultiClientProvider(log logf.Logger, db *gorm.DB, whatsmeowStore *sqlstore.Container, wshub *websocket.Hub) *MultiClientProvider {
	return &MultiClientProvider{
		log:            log,
		metaAdapter:    NewMetaClientAdapter(log),
		whatsmeowAdapter: NewWhatsmeowClientAdapter(log, db, whatsmeowStore, wshub),
	}
}

func (p *MultiClientProvider) getAdapter(account *models.WhatsAppAccount) (ClientInterface, error) {
	switch account.ClientType {
	case MetaClientType:
		return p.metaAdapter, nil
	case WhatsmeowClientType:
		return p.whatsmeowAdapter, nil
	default:
		// Default to Meta for backward compatibility
		return p.metaAdapter, nil
	}
}

func (p *MultiClientProvider) ValidateCredentials(ctx context.Context, account *models.WhatsAppAccount) error {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return err
	}
	return adapter.ValidateCredentials(ctx, account)
}

func (p *MultiClientProvider) SendTextMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, message string, replyToMessageID string) (string, error) {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return "", err
	}
	return adapter.SendTextMessage(ctx, account, recipient, message, replyToMessageID)
}

func (p *MultiClientProvider) SendImageMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID, caption string) (string, error) {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return "", err
	}
	return adapter.SendImageMessage(ctx, account, recipient, mediaID, caption)
}

func (p *MultiClientProvider) SendVideoMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID, caption string) (string, error) {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return "", err
	}
	return adapter.SendVideoMessage(ctx, account, recipient, mediaID, caption)
}

func (p *MultiClientProvider) SendAudioMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID string) (string, error) {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return "", err
	}
	return adapter.SendAudioMessage(ctx, account, recipient, mediaID)
}

func (p *MultiClientProvider) SendDocumentMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID, filename, caption string) (string, error) {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return "", err
	}
	return adapter.SendDocumentMessage(ctx, account, recipient, mediaID, filename, caption)
}

func (p *MultiClientProvider) SendInteractiveButtons(ctx context.Context, account *models.WhatsAppAccount, recipient, bodyText string, buttons []Button) (string, error) {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return "", err
	}
	return adapter.SendInteractiveButtons(ctx, account, recipient, bodyText, buttons)
}

func (p *MultiClientProvider) SendCTAURLButton(ctx context.Context, account *models.WhatsAppAccount, recipient, bodyText, buttonText, url string) (string, error) {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return "", err
	}
	return adapter.SendCTAURLButton(ctx, account, recipient, bodyText, buttonText, url)
}

func (p *MultiClientProvider) SendTemplateMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, templateName, language string, params map[string]string) (string, error) {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return "", err
	}
	return adapter.SendTemplateMessage(ctx, account, recipient, templateName, language, params)
}

func (p *MultiClientProvider) SendFlowMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, flowID, flowHeader, bodyText, ctaButtonText, flowToken, flowFirstScreen string) (string, error) {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return "", err
	}
	return adapter.SendFlowMessage(ctx, account, recipient, flowID, flowHeader, bodyText, ctaButtonText, flowToken, flowFirstScreen)
}

func (p *MultiClientProvider) SendReaction(ctx context.Context, account *models.WhatsAppAccount, recipient, messageID, reaction string) (string, error) {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return "", err
	}
	return adapter.SendReaction(ctx, account, recipient, messageID, reaction)
}

func (p *MultiClientProvider) SendStickerMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID string) (string, error) {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return "", err
	}
	return adapter.SendStickerMessage(ctx, account, recipient, mediaID)
}

func (p *MultiClientProvider) MarkMessageRead(ctx context.Context, account *models.WhatsAppAccount, messageID string) error {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return err
	}
	return adapter.MarkMessageRead(ctx, account, messageID)
}

func (p *MultiClientProvider) UploadMedia(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType, filename string) (string, error) {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return "", err
	}
	return adapter.UploadMedia(ctx, account, data, mimeType, filename)
}

func (p *MultiClientProvider) GetMediaURL(ctx context.Context, mediaID string, account *models.WhatsAppAccount) (string, error) {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return "", err
	}
	return adapter.GetMediaURL(ctx, mediaID, account)
}

func (p *MultiClientProvider) DownloadMedia(ctx context.Context, mediaURL string, accessToken string) ([]byte, error) {
	// DownloadMedia is somewhat generic but Meta's needs the token.
	// For whatsmeow, it might be different. For now, we use Meta adapter's generic logic.
	return p.metaAdapter.DownloadMedia(ctx, mediaURL, accessToken)
}

func (p *MultiClientProvider) ResumableUpload(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType, filename string) (string, error) {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return "", err
	}
	return adapter.ResumableUpload(ctx, account, data, mimeType, filename)
}

func (p *MultiClientProvider) GetBusinessProfile(ctx context.Context, account *models.WhatsAppAccount) (*models.BusinessProfile, error) {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return nil, err
	}
	return adapter.GetBusinessProfile(ctx, account)
}

func (p *MultiClientProvider) UpdateBusinessProfile(ctx context.Context, account *models.WhatsAppAccount, input models.BusinessProfileInput) error {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return err
	}
	return adapter.UpdateBusinessProfile(ctx, account, input)
}

func (p *MultiClientProvider) UploadProfilePicture(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType string) (string, error) {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return "", err
	}
	return adapter.UploadProfilePicture(ctx, account, data, mimeType)
}

func (p *MultiClientProvider) SubscribeApp(ctx context.Context, account *models.WhatsAppAccount) error {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return err
	}
	return adapter.SubscribeApp(ctx, account)
}

func (p *MultiClientProvider) SetIncomingMessageHandler(handler func(account *models.WhatsAppAccount, data interface{})) {
	p.metaAdapter.SetIncomingMessageHandler(handler)
	p.whatsmeowAdapter.SetIncomingMessageHandler(handler)
}

func (p *MultiClientProvider) HandleIncomingMessage(ctx context.Context, wabaID, messageID string) error {
	// This is tricky because we might not have the account object here.
	// We might need to find the account by wabaID first.
	return fmt.Errorf("HandleIncomingMessage not implemented for MultiClientProvider")
}

func (p *MultiClientProvider) StartSession(ctx context.Context, account *models.WhatsAppAccount) error {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return err
	}
	return adapter.StartSession(ctx, account)
}

func (p *MultiClientProvider) CloseSession(ctx context.Context, account *models.WhatsAppAccount) error {
	adapter, err := p.getAdapter(account)
	if err != nil {
		return err
	}
	return adapter.CloseSession(ctx, account)
}
