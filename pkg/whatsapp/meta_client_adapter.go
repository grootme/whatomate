package whatsapp

import (
        "context"
        "fmt"

        "github.com/shridarpatil/whatomate/internal/models"
        "github.com/zerodha/logf"
)

// MetaClientAdapter implements the ClientInterface for Meta's WhatsApp Cloud API.
// It wraps the existing Client.
type MetaClientAdapter struct {
        client *Client // The underlying Meta Cloud API client
}

// NewMetaClientAdapter creates a new adapter for the Meta Cloud API.
func NewMetaClientAdapter(log logf.Logger) *MetaClientAdapter {
        return &MetaClientAdapter{
                client: New(log), // Use the existing New function
        }
}

// ValidateCredentials validates Meta API credentials.
func (m *MetaClientAdapter) ValidateCredentials(ctx context.Context, account *models.WhatsAppAccount) error {
        if account.AccessToken == "" || account.PhoneID == "" || account.BusinessID == "" {
                return fmt.Errorf("access_token, phone_id, and business_id are required for Meta API")
        }
        _, err := m.client.ValidateCredentials(ctx, account.PhoneID, account.BusinessID, account.AccessToken, account.APIVersion)
        if err != nil {
                return fmt.Errorf("meta API credential validation failed: %w", err)
        }
        return nil
}

// SendTextMessage sends a text message via Meta API.
func (m *MetaClientAdapter) SendTextMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, message string, replyToMessageID string) (string, error) {
        if account.AccessToken == "" || account.PhoneID == "" {
                return "", fmt.Errorf("access_token and phone_id are required for Meta API")
        }
        return m.client.SendTextMessage(ctx, toMetaAccount(account), recipient, message, replyToMessageID)
}

// SendImageMessage sends an image message via Meta API.
func (m *MetaClientAdapter) SendImageMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID, caption string) (string, error) {
        if account.AccessToken == "" || account.PhoneID == "" {
                return "", fmt.Errorf("access_token and phone_id are required for Meta API")
        }
        return m.client.SendImageMessage(ctx, toMetaAccount(account), recipient, mediaID, caption)
}

// SendVideoMessage sends a video message via Meta API.
func (m *MetaClientAdapter) SendVideoMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID, caption string) (string, error) {
        if account.AccessToken == "" || account.PhoneID == "" {
                return "", fmt.Errorf("access_token and phone_id are required for Meta API")
        }
        return m.client.SendVideoMessage(ctx, toMetaAccount(account), recipient, mediaID, caption)
}

// SendAudioMessage sends an audio message via Meta API.
func (m *MetaClientAdapter) SendAudioMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID string) (string, error) {
        if account.AccessToken == "" || account.PhoneID == "" {
                return "", fmt.Errorf("access_token and phone_id are required for Meta API")
        }
        return m.client.SendAudioMessage(ctx, toMetaAccount(account), recipient, mediaID)
}

// SendDocumentMessage sends a document message via Meta API.
func (m *MetaClientAdapter) SendDocumentMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID, filename, caption string) (string, error) {
        if account.AccessToken == "" || account.PhoneID == "" {
                return "", fmt.Errorf("access_token and phone_id are required for Meta API")
        }
        return m.client.SendDocumentMessage(ctx, toMetaAccount(account), recipient, mediaID, filename, caption)
}

// SendInteractiveButtons sends an interactive button message via Meta API.
func (m *MetaClientAdapter) SendInteractiveButtons(ctx context.Context, account *models.WhatsAppAccount, recipient, bodyText string, buttons []Button) (string, error) {
        if account.AccessToken == "" || account.PhoneID == "" {
                return "", fmt.Errorf("access_token and phone_id are required for Meta API")
        }
        return m.client.SendInteractiveButtons(ctx, toMetaAccount(account), recipient, bodyText, buttons)
}

// SendCTAURLButton sends a CTA URL button message via Meta API.
func (m *MetaClientAdapter) SendCTAURLButton(ctx context.Context, account *models.WhatsAppAccount, recipient, bodyText, buttonText, url string) (string, error) {
        if account.AccessToken == "" || account.PhoneID == "" {
                return "", fmt.Errorf("access_token and phone_id are required for Meta API")
        }
        return m.client.SendCTAURLButton(ctx, toMetaAccount(account), recipient, bodyText, buttonText, url)
}

// SendTemplateMessage sends a template message via Meta API.
func (m *MetaClientAdapter) SendTemplateMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, templateName, language string, params map[string]string) (string, error) {
        if account.AccessToken == "" || account.PhoneID == "" {
                return "", fmt.Errorf("access_token and phone_id are required for Meta API")
        }
        return m.client.SendTemplateMessage(ctx, toMetaAccount(account), recipient, templateName, language, params)
}

// SendFlowMessage sends a WhatsApp Flow message via Meta API.
func (m *MetaClientAdapter) SendFlowMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, flowID, flowHeader, bodyText, ctaButtonText, flowToken, flowFirstScreen string) (string, error) {
        if account.AccessToken == "" || account.PhoneID == "" {
                return "", fmt.Errorf("access_token and phone_id are required for Meta API")
        }
        return m.client.SendFlowMessage(ctx, toMetaAccount(account), recipient, flowID, flowHeader, bodyText, ctaButtonText, flowToken, flowFirstScreen)
}

// SendReaction sends a reaction via Meta API.
func (m *MetaClientAdapter) SendReaction(ctx context.Context, account *models.WhatsAppAccount, recipient, messageID, reaction string) (string, error) {
        if account.AccessToken == "" || account.PhoneID == "" {
                return "", fmt.Errorf("access_token and phone_id are required for Meta API")
        }
        return m.client.SendReaction(ctx, toMetaAccount(account), recipient, messageID, reaction)
}

// SendStickerMessage sends a sticker message via Meta API.
func (m *MetaClientAdapter) SendStickerMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID string) (string, error) {
        if account.AccessToken == "" || account.PhoneID == "" {
                return "", fmt.Errorf("access_token and phone_id are required for Meta API")
        }
        return m.client.SendStickerMessage(ctx, toMetaAccount(account), recipient, mediaID)
}

// MarkMessageRead marks a message as read via Meta API.
func (m *MetaClientAdapter) MarkMessageRead(ctx context.Context, account *models.WhatsAppAccount, messageID string) error {
        if account.AccessToken == "" || account.PhoneID == "" {
                return fmt.Errorf("access_token and phone_id are required for Meta API")
        }
        return m.client.MarkMessageRead(ctx, toMetaAccount(account), messageID)
}

// UploadMedia uploads media via Meta API.
func (m *MetaClientAdapter) UploadMedia(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType, filename string) (string, error) {
        if account.AccessToken == "" || account.PhoneID == "" {
                return "", fmt.Errorf("access_token and phone_id are required for Meta API")
        }
        return m.client.UploadMedia(ctx, toMetaAccount(account), data, mimeType, filename)
}

// GetMediaURL retrieves a media URL via Meta API.
func (m *MetaClientAdapter) GetMediaURL(ctx context.Context, mediaID string, account *models.WhatsAppAccount) (string, error) {
        if account.AccessToken == "" {
                return "", fmt.Errorf("access_token is required for Meta API")
        }
        return m.client.GetMediaURL(ctx, mediaID, toMetaAccount(account))
}

// DownloadMedia downloads media content.
func (m *MetaClientAdapter) DownloadMedia(ctx context.Context, mediaURL string, accessToken string) ([]byte, error) {
        return m.client.DownloadMedia(ctx, mediaURL, accessToken)
}

// ResumableUpload performs a resumable upload via Meta API.
func (m *MetaClientAdapter) ResumableUpload(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType, filename string) (string, error) {
        if account.AccessToken == "" || account.AppID == "" {
                return "", fmt.Errorf("access_token and app_id are required for Meta API resumable upload")
        }
        return m.client.ResumableUpload(ctx, toMetaAccount(account), data, mimeType, filename)
}

// GetBusinessProfile retrieves business profile via Meta API.
func (m *MetaClientAdapter) GetBusinessProfile(ctx context.Context, account *models.WhatsAppAccount) (*models.BusinessProfile, error) {
        if account.AccessToken == "" || account.PhoneID == "" {
                return nil, fmt.Errorf("access_token and phone_id are required for Meta API")
        }
        profile, err := m.client.GetBusinessProfile(ctx, toMetaAccount(account))
        if err != nil {
                return nil, fmt.Errorf("failed to get business profile via Meta API: %w", err)
        }
        
        // Map internal BusinessProfile to models.BusinessProfile
        return &models.BusinessProfile{
                About:            profile.About,
                Address:          profile.Address,
                Description:      profile.Description,
                Vertical:         profile.Vertical,
                Email:            profile.Email,
                Websites:         profile.Websites,
                ProfilePicture:   profile.ProfilePicture,
                MessagingProduct: profile.MessagingProduct,
        }, nil
}

// UpdateBusinessProfile updates business profile via Meta API.
func (m *MetaClientAdapter) UpdateBusinessProfile(ctx context.Context, account *models.WhatsAppAccount, input models.BusinessProfileInput) error {
        if account.AccessToken == "" || account.PhoneID == "" {
                return fmt.Errorf("access_token and phone_id are required for Meta API")
        }
        
        metaInput := BusinessProfileInput{
                MessagingProduct:     input.MessagingProduct,
                Address:              input.Address,
                Description:          input.Description,
                Vertical:             input.Vertical,
                Email:                input.Email,
                Websites:             input.Websites,
                ProfilePictureHandle: input.ProfilePictureHandle,
                About:                input.About,
        }
        
        err := m.client.UpdateBusinessProfile(ctx, toMetaAccount(account), metaInput)
        if err != nil {
                return fmt.Errorf("failed to update business profile via Meta API: %w", err)
        }
        return nil
}

// UploadProfilePicture uploads a profile picture via Meta API.
func (m *MetaClientAdapter) UploadProfilePicture(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType string) (string, error) {
        if account.AccessToken == "" || account.PhoneID == "" {
                return "", fmt.Errorf("access_token and phone_id are required for Meta API")
        }
        return m.client.UploadProfilePicture(ctx, toMetaAccount(account), data, mimeType)
}

// SubscribeApp subscribes the app to webhooks via Meta API.
func (m *MetaClientAdapter) SubscribeApp(ctx context.Context, account *models.WhatsAppAccount) error {
        if account.AccessToken == "" || account.BusinessID == "" {
                return fmt.Errorf("access_token and business_id are required for Meta API webhook subscription")
        }
        err := m.client.SubscribeApp(ctx, toMetaAccount(account))
        if err != nil {
                return fmt.Errorf("failed to subscribe app via Meta API: %w", err)
        }
        return nil
}

// SetIncomingMessageHandler is a no-op for Meta API as it uses webhooks.
func (m *MetaClientAdapter) SetIncomingMessageHandler(handler func(account *models.WhatsAppAccount, data interface{})) {
        // Not needed for Meta API
}

// HandleIncomingMessage is not directly supported by the Meta client's current public methods.
func (m *MetaClientAdapter) HandleIncomingMessage(ctx context.Context, wabaID, messageID string) error {
        return fmt.Errorf("HandleIncomingMessage not implemented for Meta API adapter")
}

// StartSession is not applicable for Meta Cloud API.
func (m *MetaClientAdapter) StartSession(ctx context.Context, account *models.WhatsAppAccount) error {
        return fmt.Errorf("StartSession (QR code login) is not supported by Meta Cloud API adapter")
}

// CloseSession is not applicable for Meta Cloud API.
func (m *MetaClientAdapter) CloseSession(ctx context.Context, account *models.WhatsAppAccount) error {
        return nil
}

// DownloadMediaCustom is not supported by Meta API adapter (use DownloadMedia instead).
func (m *MetaClientAdapter) DownloadMediaCustom(ctx context.Context, account *models.WhatsAppAccount, msg interface{}) ([]byte, error) {
        return nil, fmt.Errorf("DownloadMediaCustom not supported by Meta API adapter, use DownloadMedia instead")
}

// CreateCatalog creates a new product catalog via Meta API.
func (m *MetaClientAdapter) CreateCatalog(ctx context.Context, account *models.WhatsAppAccount, name string) (string, error) {
        if account.AccessToken == "" || account.BusinessID == "" {
                return "", fmt.Errorf("access_token and business_id are required for Meta API")
        }
        return m.client.CreateCatalog(ctx, toMetaAccount(account), name)
}

// DeleteCatalog deletes a catalog via Meta API.
func (m *MetaClientAdapter) DeleteCatalog(ctx context.Context, account *models.WhatsAppAccount, catalogID string) error {
        if account.AccessToken == "" {
                return fmt.Errorf("access_token is required for Meta API")
        }
        return m.client.DeleteCatalog(ctx, toMetaAccount(account), catalogID)
}

// ListCatalogs lists all catalogs via Meta API.
func (m *MetaClientAdapter) ListCatalogs(ctx context.Context, account *models.WhatsAppAccount) ([]CatalogInfo, error) {
        if account.AccessToken == "" || account.BusinessID == "" {
                return nil, fmt.Errorf("access_token and business_id are required for Meta API")
        }
        return m.client.ListCatalogs(ctx, toMetaAccount(account))
}

// CreateProduct creates a product via Meta API.
func (m *MetaClientAdapter) CreateProduct(ctx context.Context, account *models.WhatsAppAccount, catalogID string, product *ProductInput) (string, error) {
        if account.AccessToken == "" || account.BusinessID == "" {
                return "", fmt.Errorf("access_token and business_id are required for Meta API")
        }
        return m.client.CreateProduct(ctx, toMetaAccount(account), catalogID, product)
}

// UpdateProduct updates a product via Meta API.
func (m *MetaClientAdapter) UpdateProduct(ctx context.Context, account *models.WhatsAppAccount, productID string, product *ProductInput) error {
        if account.AccessToken == "" {
                return fmt.Errorf("access_token is required for Meta API")
        }
        return m.client.UpdateProduct(ctx, toMetaAccount(account), productID, product)
}

// DeleteProduct deletes a product via Meta API.
func (m *MetaClientAdapter) DeleteProduct(ctx context.Context, account *models.WhatsAppAccount, productID string) error {
        if account.AccessToken == "" {
                return fmt.Errorf("access_token is required for Meta API")
        }
        return m.client.DeleteProduct(ctx, toMetaAccount(account), productID)
}

// GetFlow fetches a single flow via Meta API.
func (m *MetaClientAdapter) GetFlow(ctx context.Context, account *models.WhatsAppAccount, flowID string) (*FlowGetResponse, error) {
        if account.AccessToken == "" {
                return nil, fmt.Errorf("access_token is required for Meta API")
        }
        return m.client.GetFlow(ctx, toMetaAccount(account), flowID)
}

// DeleteFlow deletes a flow via Meta API.
func (m *MetaClientAdapter) DeleteFlow(ctx context.Context, account *models.WhatsAppAccount, flowID string) error {
        if account.AccessToken == "" {
                return fmt.Errorf("access_token is required for Meta API")
        }
        return m.client.DeleteFlow(ctx, toMetaAccount(account), flowID)
}

// CreateFlow creates a new flow via Meta API.
func (m *MetaClientAdapter) CreateFlow(ctx context.Context, account *models.WhatsAppAccount, name string, categories []string) (string, error) {
        if account.AccessToken == "" || account.BusinessID == "" {
                return "", fmt.Errorf("access_token and business_id are required for Meta API")
        }
        return m.client.CreateFlow(ctx, toMetaAccount(account), name, categories)
}

// UpdateFlowJSON updates a flow's JSON definition via Meta API.
func (m *MetaClientAdapter) UpdateFlowJSON(ctx context.Context, account *models.WhatsAppAccount, flowID string, flowJSON *FlowJSON) error {
        if account.AccessToken == "" {
                return fmt.Errorf("access_token is required for Meta API")
        }
        return m.client.UpdateFlowJSON(ctx, toMetaAccount(account), flowID, flowJSON)
}

// PublishFlow publishes a flow via Meta API.
func (m *MetaClientAdapter) PublishFlow(ctx context.Context, account *models.WhatsAppAccount, flowID string) error {
        if account.AccessToken == "" {
                return fmt.Errorf("access_token is required for Meta API")
        }
        return m.client.PublishFlow(ctx, toMetaAccount(account), flowID)
}

// DeprecateFlow deprecates a flow via Meta API.
func (m *MetaClientAdapter) DeprecateFlow(ctx context.Context, account *models.WhatsAppAccount, flowID string) error {
        if account.AccessToken == "" {
                return fmt.Errorf("access_token is required for Meta API")
        }
        return m.client.DeprecateFlow(ctx, toMetaAccount(account), flowID)
}

// ListFlows lists all flows via Meta API.
func (m *MetaClientAdapter) ListFlows(ctx context.Context, account *models.WhatsAppAccount) ([]FlowGetResponse, error) {
        if account.AccessToken == "" || account.BusinessID == "" {
                return nil, fmt.Errorf("access_token and business_id are required for Meta API")
        }
        return m.client.ListFlows(ctx, toMetaAccount(account))
}

// GetFlowAssets fetches flow JSON assets via Meta API.
func (m *MetaClientAdapter) GetFlowAssets(ctx context.Context, account *models.WhatsAppAccount, flowID string) (*FlowJSON, error) {
        if account.AccessToken == "" {
                return nil, fmt.Errorf("access_token is required for Meta API")
        }
        return m.client.GetFlowAssets(ctx, toMetaAccount(account), flowID)
}

// SubmitTemplate submits a template via Meta API.
func (m *MetaClientAdapter) SubmitTemplate(ctx context.Context, account *models.WhatsAppAccount, template *TemplateSubmission) (string, error) {
        if account.AccessToken == "" || account.BusinessID == "" {
                return "", fmt.Errorf("access_token and business_id are required for Meta API")
        }
        return m.client.SubmitTemplate(ctx, toMetaAccount(account), template)
}

// FetchTemplates fetches templates via Meta API.
func (m *MetaClientAdapter) FetchTemplates(ctx context.Context, account *models.WhatsAppAccount) ([]MetaTemplate, error) {
        if account.AccessToken == "" || account.BusinessID == "" {
                return nil, fmt.Errorf("access_token and business_id are required for Meta API")
        }
        return m.client.FetchTemplates(ctx, toMetaAccount(account))
}

// DeleteTemplate deletes a template via Meta API.
func (m *MetaClientAdapter) DeleteTemplate(ctx context.Context, account *models.WhatsAppAccount, templateName string) error {
        if account.AccessToken == "" || account.BusinessID == "" {
                return fmt.Errorf("access_token and business_id are required for Meta API")
        }
        return m.client.DeleteTemplate(ctx, toMetaAccount(account), templateName)
}

// GetAnalytics fetches analytics via Meta API.
func (m *MetaClientAdapter) GetAnalytics(ctx context.Context, account *models.WhatsAppAccount, analyticsType AnalyticsType, req *AnalyticsRequest) (*MetaAnalyticsResponse, error) {
        if account.AccessToken == "" || account.BusinessID == "" {
                return nil, fmt.Errorf("access_token and business_id are required for Meta API")
        }
        return m.client.GetAnalytics(ctx, toMetaAccount(account), analyticsType, req)
}

// toMetaAccount converts models.WhatsAppAccount to Account for the Meta client.
func toMetaAccount(account *models.WhatsAppAccount) *Account {
        return &Account{
                PhoneID:     account.PhoneID,
                BusinessID:  account.BusinessID,
                AppID:       account.AppID,
                APIVersion:  account.APIVersion,
                AccessToken: account.AccessToken,
                AppSecret:   account.AppSecret,
        }
}
