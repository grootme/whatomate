package whatsapp

import (
        "context"

        "github.com/shridarpatil/whatomate/internal/models"
        events "go.mau.fi/whatsmeow/types/events"
)

// ClientInterface defines the common interface for WhatsApp clients.
type ClientInterface interface {
        ValidateCredentials(ctx context.Context, account *models.WhatsAppAccount) error

        // Messaging
        SendTextMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, message string, replyToMessageID string) (string, error)
        SendImageMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID, caption string) (string, error)
        SendVideoMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID, caption string) (string, error)
        SendAudioMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID string) (string, error)
        SendDocumentMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID, filename, caption string) (string, error)
        SendInteractiveButtons(ctx context.Context, account *models.WhatsAppAccount, recipient, bodyText string, buttons []Button) (string, error)
        SendCTAURLButton(ctx context.Context, account *models.WhatsAppAccount, recipient, bodyText, buttonText, url string) (string, error)
        SendTemplateMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, templateName, language string, params map[string]string) (string, error)
        SendFlowMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, flowID, flowHeader, bodyText, ctaButtonText, flowToken, flowFirstScreen string) (string, error)

        // SendReaction sends a reaction to a specific message.
        SendReaction(ctx context.Context, account *models.WhatsAppAccount, recipient, messageID, reaction string) (string, error)

        // SendStickerMessage sends a sticker message.
        SendStickerMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID string) (string, error)

        // Message Management
        MarkMessageRead(ctx context.Context, account *models.WhatsAppAccount, messageID string) error

        // Media
        UploadMedia(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType, filename string) (string, error)
        GetMediaURL(ctx context.Context, mediaID string, account *models.WhatsAppAccount) (string, error)
        DownloadMedia(ctx context.Context, mediaURL string, accessToken string) ([]byte, error)
        DownloadMediaCustom(ctx context.Context, account *models.WhatsAppAccount, msg *events.Message) ([]byte, error)
        ResumableUpload(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType, filename string) (string, error)

        // Business Profile
        GetBusinessProfile(ctx context.Context, account *models.WhatsAppAccount) (*models.BusinessProfile, error)
        UpdateBusinessProfile(ctx context.Context, account *models.WhatsAppAccount, input models.BusinessProfileInput) error
        UploadProfilePicture(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType string) (string, error)

        // App Subscription
        SubscribeApp(ctx context.Context, account *models.WhatsAppAccount) error

        // Catalog
        CreateCatalog(ctx context.Context, account *models.WhatsAppAccount, name string) (string, error)
        DeleteCatalog(ctx context.Context, account *models.WhatsAppAccount, catalogID string) error
        ListCatalogs(ctx context.Context, account *models.WhatsAppAccount) ([]CatalogInfo, error)

        // Products
        CreateProduct(ctx context.Context, account *models.WhatsAppAccount, catalogID string, product *ProductInput) (string, error)
        UpdateProduct(ctx context.Context, account *models.WhatsAppAccount, productID string, product *ProductInput) error
        DeleteProduct(ctx context.Context, account *models.WhatsAppAccount, productID string) error

        // Flows
        CreateFlow(ctx context.Context, account *models.WhatsAppAccount, name string, categories []string) (string, error)
        UpdateFlowJSON(ctx context.Context, account *models.WhatsAppAccount, flowID string, flowJSON *FlowJSON) error
        PublishFlow(ctx context.Context, account *models.WhatsAppAccount, flowID string) error
        DeprecateFlow(ctx context.Context, account *models.WhatsAppAccount, flowID string) error
        DeleteFlow(ctx context.Context, account *models.WhatsAppAccount, flowID string) error
        GetFlow(ctx context.Context, account *models.WhatsAppAccount, flowID string) (*FlowGetResponse, error)
        GetFlowAssets(ctx context.Context, account *models.WhatsAppAccount, flowID string) (*FlowJSON, error)
        ListFlows(ctx context.Context, account *models.WhatsAppAccount) ([]FlowGetResponse, error)

        // Templates
        SubmitTemplate(ctx context.Context, account *models.WhatsAppAccount, template *TemplateSubmission) (string, error)
        FetchTemplates(ctx context.Context, account *models.WhatsAppAccount) ([]MetaTemplate, error)
        DeleteTemplate(ctx context.Context, account *models.WhatsAppAccount, templateName string) error

        // Analytics
        GetAnalytics(ctx context.Context, account *models.WhatsAppAccount, analyticsType AnalyticsType, req *AnalyticsRequest) (*MetaAnalyticsResponse, error)

        // Incoming Messages
        SetIncomingMessageHandler(handler func(account *models.WhatsAppAccount, data interface{}))
        HandleIncomingMessage(ctx context.Context, wabaID, messageID string) error

        // Session Management (Whatsmeow specific)
        StartSession(ctx context.Context, account *models.WhatsAppAccount) error
        CloseSession(ctx context.Context, account *models.WhatsAppAccount) error
}
