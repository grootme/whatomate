package whatsapp

import (
        "context"

        "github.com/shridarpatil/whatomate/internal/models"
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
        ResumableUpload(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType, filename string) (string, error)

        // Business Profile
        GetBusinessProfile(ctx context.Context, account *models.WhatsAppAccount) (*models.BusinessProfile, error)
        UpdateBusinessProfile(ctx context.Context, account *models.WhatsAppAccount, input models.BusinessProfileInput) error
        UploadProfilePicture(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType string) (string, error)

        // App Subscription
        SubscribeApp(ctx context.Context, account *models.WhatsAppAccount) error

        // Incoming Messages
        SetIncomingMessageHandler(handler func(account *models.WhatsAppAccount, data interface{}))
        HandleIncomingMessage(ctx context.Context, wabaID, messageID string) error

        // Session Management (Whatsmeow specific)
        StartSession(ctx context.Context, account *models.WhatsAppAccount) error
        CloseSession(ctx context.Context, account *models.WhatsAppAccount) error
}

// TemplateCard represents a card in a Meta template component (for carousels)
type TemplateCard struct {
        CardIndex  int                 `json:"card_index"`
        Components []TemplateComponent `json:"components"`
}

// TemplateComponentExample holds example values for a component
type TemplateComponentExample struct {
        HeaderText            []string            `json:"header_text,omitempty"`
        HeaderTextNamedParams []map[string]string `json:"header_text_named_params,omitempty"`
        BodyText              [][]string          `json:"body_text,omitempty"`
        BodyTextNamedParams   []map[string]string `json:"body_text_named_params,omitempty"`
        HeaderHandle          []string            `json:"header_handle,omitempty"`
}

// TemplateQualityScore represents the quality score of a template
type TemplateQualityScore struct {
        Score string `json:"score"` // GREEN, YELLOW, RED
}
