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

// Button represents an interactive button for WhatsApp messages
type Button struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// MediaURLResponse represents the response for a media URL request
type MediaURLResponse struct {
	URL string `json:"url"`
}

// UploadMediaResponse represents the response for a media upload
type UploadMediaResponse struct {
	ID string `json:"id"`
}

// ResumableUploadResponse represents the response for initiating a resumable upload session
type ResumableUploadResponse struct {
	ID string `json:"id"`
}

// ResumableUploadFinishResponse represents the response for finishing a resumable upload
type ResumableUploadFinishResponse struct {
	Handle string `json:"h"`
}

// TemplateResponse represents the response for template submission
type TemplateResponse struct {
	ID string `json:"id"`
}

// TemplateListResponse represents the response for fetching templates
type TemplateListResponse struct {
	Data []MetaTemplate `json:"data"`
}

// MetaTemplate represents a WhatsApp message template from Meta API
type MetaTemplate struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	Language     string                 `json:"language"`
	Category     string                 `json:"category"`
	Status       string                 `json:"status"`
	Components   []TemplateComponent    `json:"components"`
	QualityScore TemplateQualityScore   `json:"quality_score"`
	RejectedReason string               `json:"rejected_reason,omitempty"`
	LastUpdated  time.Time              `json:"last_updated,omitempty"`
}

// TemplateComponent represents a component of a Meta template
type TemplateComponent struct {
	Type       string                   `json:"type"`
	Text       string                   `json:"text,omitempty"`
	Format     string                   `json:"format,omitempty"`
	Buttons    []TemplateButton         `json:"buttons,omitempty"`
	Cards      []TemplateCard           `json:"cards,omitempty"`
	Example    TemplateComponentExample `json:"example,omitempty"`
}

// TemplateButton represents a button in a Meta template component
type TemplateButton struct {
	Type           string                 `json:"type"`
	Text           string                 `json:"text,omitempty"`
	URL            string                 `json:"url,omitempty"`
	PhoneNumber    string                 `json:"phone_number,omitempty"`
	ButtonID       string                 `json:"button_id,omitempty"`
	Example        []string               `json:"example,omitempty"`
	CouponCode     string                 `json:"coupon_code,omitempty"`
	AutofillText   string                 `json:"autofill_text,omitempty"`
	PackageName    string                 `json:"package_name,omitempty"`
	Signature      string                 `json:"signature,omitempty"`
	FlowCTA        string                 `json:"flow_cta,omitempty"`
	FlowAction     string                 `json:"flow_action,omitempty"`
	FlowActionData map[string]interface{} `json:"flow_action_data,omitempty"`
}

// TemplateCard represents a card in a Meta template component (for carousels)
type TemplateCard struct {
	CardIndex  int                 `json:"card_index"`
	Components []TemplateComponent `json:"components"`
}

// TemplateComponentExample holds example values for a component
type TemplateComponentExample struct {
	HeaderText          []string            `json:"header_text,omitempty"`
	HeaderTextNamedParams []map[string]string `json:"header_text_named_params,omitempty"`
	BodyText            [][]string          `json:"body_text,omitempty"`
	BodyTextNamedParams []map[string]string `json:"body_text_named_params,omitempty"`
	HeaderHandle        []string            `json:"header_handle,omitempty"`
}

// TemplateQualityScore represents the quality score of a template
type TemplateQualityScore struct {
	Score string `json:"score"` // GREEN, YELLOW, RED
}

// MetaAPIResponse is a common response structure for Meta API calls
type MetaAPIResponse struct {
	MessagingProduct string `json:"messaging_product"`
	Contacts         []struct {
		Input string `json:"input"`
		WaID  string `json:"wa_id"`
	} `json:"contacts,omitempty"`
	Messages []struct {
		ID string `json:"id"`
	} `json:"messages,omitempty"`
}

// MetaAPIError represents an error response from Meta API
type MetaAPIError struct {
	Error struct {
		Message    string `json:"message"`
		Type       string `json:"type"`
		Code       int    `json:"code"`
		ErrorSubcode int    `json:"error_subcode"`
		FbtraceID  string `json:"fbtrace_id"`
		ErrorData struct {
			MessagingProduct string `json:"messaging_product"`
			Details          string `json:"details"`
		} `json:"error_data"`
		ErrorUserTitle string `json:"error_user_title"`
		ErrorUserMsg   string `json:"error_user_msg"`
	} `json:"error"`
}

// CredentialsValidationResult represents the result of WhatsApp credential validation
type CredentialsValidationResult struct {
	PhoneNumber            string `json:"phone_number"`
	VerifiedName           string `json:"verified_name"`
	AccountMode            string `json:"account_mode"`
	IsTestNumber           bool   `json:"is_test_number"`
	QualityRating          string `json:"quality_rating"`
	CodeVerificationStatus string `json:"code_verification_status"`
	Warning                string `json:"warning,omitempty"`
}

// SubscribeAppResponse represents the response for app subscription
type SubscribeAppResponse struct {
	Success bool `json:"success"`
}
