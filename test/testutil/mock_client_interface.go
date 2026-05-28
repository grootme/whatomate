package testutil

import (
	"context"
	"sync"

	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/pkg/whatsapp"
)

// MockClientInterface is a mock implementation of whatsapp.ClientInterface for testing.
type MockClientInterface struct {
	mu sync.Mutex

	// Call tracking
	calls map[string]int

	// Configurable function overrides
	ValidateCredentialsFunc   func(ctx context.Context, account *models.WhatsAppAccount) error
	SendTextMessageFunc       func(ctx context.Context, account *models.WhatsAppAccount, recipient, message string, replyToMessageID string) (string, error)
	SendImageMessageFunc      func(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID, caption string) (string, error)
	SendVideoMessageFunc      func(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID, caption string) (string, error)
	SendAudioMessageFunc      func(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID string) (string, error)
	SendDocumentMessageFunc   func(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID, filename, caption string) (string, error)
	SendInteractiveButtonsFunc func(ctx context.Context, account *models.WhatsAppAccount, recipient, bodyText string, buttons []whatsapp.Button) (string, error)
	SendCTAURLButtonFunc      func(ctx context.Context, account *models.WhatsAppAccount, recipient, bodyText, buttonText, url string) (string, error)
	SendTemplateMessageFunc   func(ctx context.Context, account *models.WhatsAppAccount, recipient, templateName, language string, params map[string]string) (string, error)
	SendFlowMessageFunc       func(ctx context.Context, account *models.WhatsAppAccount, recipient, flowID, flowHeader, bodyText, ctaButtonText, flowToken, flowFirstScreen string) (string, error)
	SendReactionFunc          func(ctx context.Context, account *models.WhatsAppAccount, recipient, messageID, reaction string) (string, error)
	SendStickerMessageFunc    func(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID string) (string, error)
	MarkMessageReadFunc       func(ctx context.Context, account *models.WhatsAppAccount, messageID string) error
	UploadMediaFunc           func(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType, filename string) (string, error)
	GetMediaURLFunc           func(ctx context.Context, mediaID string, account *models.WhatsAppAccount) (string, error)
	DownloadMediaFunc         func(ctx context.Context, mediaURL string, accessToken string) ([]byte, error)
	DownloadMediaCustomFunc   func(ctx context.Context, account *models.WhatsAppAccount, msg interface{}) ([]byte, error)
	ResumableUploadFunc       func(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType, filename string) (string, error)
	GetBusinessProfileFunc    func(ctx context.Context, account *models.WhatsAppAccount) (*models.BusinessProfile, error)
	UpdateBusinessProfileFunc func(ctx context.Context, account *models.WhatsAppAccount, input models.BusinessProfileInput) error
	UploadProfilePictureFunc  func(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType string) (string, error)
	SubscribeAppFunc          func(ctx context.Context, account *models.WhatsAppAccount) error
	SetIncomingMessageHandlerFunc func(handler func(account *models.WhatsAppAccount, data interface{}))
	HandleIncomingMessageFunc func(ctx context.Context, wabaID, messageID string) error
	StartSessionFunc          func(ctx context.Context, account *models.WhatsAppAccount) error
	CloseSessionFunc          func(ctx context.Context, account *models.WhatsAppAccount) error
	CreateCatalogFunc         func(ctx context.Context, account *models.WhatsAppAccount, name string) (string, error)
	DeleteCatalogFunc         func(ctx context.Context, account *models.WhatsAppAccount, catalogID string) error
	ListCatalogsFunc          func(ctx context.Context, account *models.WhatsAppAccount) ([]whatsapp.CatalogInfo, error)
	CreateProductFunc         func(ctx context.Context, account *models.WhatsAppAccount, catalogID string, product *whatsapp.ProductInput) (string, error)
	UpdateProductFunc         func(ctx context.Context, account *models.WhatsAppAccount, productID string, product *whatsapp.ProductInput) error
	DeleteProductFunc         func(ctx context.Context, account *models.WhatsAppAccount, productID string) error
	GetFlowFunc               func(ctx context.Context, account *models.WhatsAppAccount, flowID string) (*whatsapp.FlowGetResponse, error)
	DeleteFlowFunc            func(ctx context.Context, account *models.WhatsAppAccount, flowID string) error
	CreateFlowFunc            func(ctx context.Context, account *models.WhatsAppAccount, name string, categories []string) (string, error)
	UpdateFlowJSONFunc        func(ctx context.Context, account *models.WhatsAppAccount, flowID string, flowJSON *whatsapp.FlowJSON) error
	PublishFlowFunc           func(ctx context.Context, account *models.WhatsAppAccount, flowID string) error
	DeprecateFlowFunc         func(ctx context.Context, account *models.WhatsAppAccount, flowID string) error
	ListFlowsFunc             func(ctx context.Context, account *models.WhatsAppAccount) ([]whatsapp.FlowGetResponse, error)
	GetFlowAssetsFunc         func(ctx context.Context, account *models.WhatsAppAccount, flowID string) (*whatsapp.FlowJSON, error)
	SubmitTemplateFunc        func(ctx context.Context, account *models.WhatsAppAccount, template *whatsapp.TemplateSubmission) (string, error)
	FetchTemplatesFunc        func(ctx context.Context, account *models.WhatsAppAccount) ([]whatsapp.MetaTemplate, error)
	DeleteTemplateFunc        func(ctx context.Context, account *models.WhatsAppAccount, templateName string) error
	GetAnalyticsFunc          func(ctx context.Context, account *models.WhatsAppAccount, analyticsType whatsapp.AnalyticsType, req *whatsapp.AnalyticsRequest) (*whatsapp.MetaAnalyticsResponse, error)
}

// NewMockClientInterface creates a new MockClientInterface.
func NewMockClientInterface() *MockClientInterface {
	return &MockClientInterface{
		calls: make(map[string]int),
	}
}

// CallCount returns the number of times a method was called.
func (m *MockClientInterface) CallCount(method string) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.calls[method]
}

func (m *MockClientInterface) recordCall(method string) {
	m.mu.Lock()
	m.calls[method]++
	m.mu.Unlock()
}

// ValidateCredentials mock
func (m *MockClientInterface) ValidateCredentials(ctx context.Context, account *models.WhatsAppAccount) error {
	m.recordCall("ValidateCredentials")
	if m.ValidateCredentialsFunc != nil {
		return m.ValidateCredentialsFunc(ctx, account)
	}
	return nil
}

// SendTextMessage mock
func (m *MockClientInterface) SendTextMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, message string, replyToMessageID string) (string, error) {
	m.recordCall("SendTextMessage")
	if m.SendTextMessageFunc != nil {
		return m.SendTextMessageFunc(ctx, account, recipient, message, replyToMessageID)
	}
	return "wamid.mock_" + generateMockID(), nil
}

// SendImageMessage mock
func (m *MockClientInterface) SendImageMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID, caption string) (string, error) {
	m.recordCall("SendImageMessage")
	if m.SendImageMessageFunc != nil {
		return m.SendImageMessageFunc(ctx, account, recipient, mediaID, caption)
	}
	return "wamid.mock_image_" + generateMockID(), nil
}

// SendVideoMessage mock
func (m *MockClientInterface) SendVideoMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID, caption string) (string, error) {
	m.recordCall("SendVideoMessage")
	if m.SendVideoMessageFunc != nil {
		return m.SendVideoMessageFunc(ctx, account, recipient, mediaID, caption)
	}
	return "wamid.mock_video_" + generateMockID(), nil
}

// SendAudioMessage mock
func (m *MockClientInterface) SendAudioMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID string) (string, error) {
	m.recordCall("SendAudioMessage")
	if m.SendAudioMessageFunc != nil {
		return m.SendAudioMessageFunc(ctx, account, recipient, mediaID)
	}
	return "wamid.mock_audio_" + generateMockID(), nil
}

// SendDocumentMessage mock
func (m *MockClientInterface) SendDocumentMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID, filename, caption string) (string, error) {
	m.recordCall("SendDocumentMessage")
	if m.SendDocumentMessageFunc != nil {
		return m.SendDocumentMessageFunc(ctx, account, recipient, mediaID, filename, caption)
	}
	return "wamid.mock_doc_" + generateMockID(), nil
}

// SendInteractiveButtons mock
func (m *MockClientInterface) SendInteractiveButtons(ctx context.Context, account *models.WhatsAppAccount, recipient, bodyText string, buttons []whatsapp.Button) (string, error) {
	m.recordCall("SendInteractiveButtons")
	if m.SendInteractiveButtonsFunc != nil {
		return m.SendInteractiveButtonsFunc(ctx, account, recipient, bodyText, buttons)
	}
	return "wamid.mock_buttons_" + generateMockID(), nil
}

// SendCTAURLButton mock
func (m *MockClientInterface) SendCTAURLButton(ctx context.Context, account *models.WhatsAppAccount, recipient, bodyText, buttonText, url string) (string, error) {
	m.recordCall("SendCTAURLButton")
	if m.SendCTAURLButtonFunc != nil {
		return m.SendCTAURLButtonFunc(ctx, account, recipient, bodyText, buttonText, url)
	}
	return "wamid.mock_cta_" + generateMockID(), nil
}

// SendTemplateMessage mock
func (m *MockClientInterface) SendTemplateMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, templateName, language string, params map[string]string) (string, error) {
	m.recordCall("SendTemplateMessage")
	if m.SendTemplateMessageFunc != nil {
		return m.SendTemplateMessageFunc(ctx, account, recipient, templateName, language, params)
	}
	return "wamid.mock_template_" + generateMockID(), nil
}

// SendFlowMessage mock
func (m *MockClientInterface) SendFlowMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, flowID, flowHeader, bodyText, ctaButtonText, flowToken, flowFirstScreen string) (string, error) {
	m.recordCall("SendFlowMessage")
	if m.SendFlowMessageFunc != nil {
		return m.SendFlowMessageFunc(ctx, account, recipient, flowID, flowHeader, bodyText, ctaButtonText, flowToken, flowFirstScreen)
	}
	return "wamid.mock_flow_" + generateMockID(), nil
}

// SendReaction mock
func (m *MockClientInterface) SendReaction(ctx context.Context, account *models.WhatsAppAccount, recipient, messageID, reaction string) (string, error) {
	m.recordCall("SendReaction")
	if m.SendReactionFunc != nil {
		return m.SendReactionFunc(ctx, account, recipient, messageID, reaction)
	}
	return "", nil
}

// SendStickerMessage mock
func (m *MockClientInterface) SendStickerMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID string) (string, error) {
	m.recordCall("SendStickerMessage")
	if m.SendStickerMessageFunc != nil {
		return m.SendStickerMessageFunc(ctx, account, recipient, mediaID)
	}
	return "wamid.mock_sticker_" + generateMockID(), nil
}

// MarkMessageRead mock
func (m *MockClientInterface) MarkMessageRead(ctx context.Context, account *models.WhatsAppAccount, messageID string) error {
	m.recordCall("MarkMessageRead")
	if m.MarkMessageReadFunc != nil {
		return m.MarkMessageReadFunc(ctx, account, messageID)
	}
	return nil
}

// UploadMedia mock
func (m *MockClientInterface) UploadMedia(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType, filename string) (string, error) {
	m.recordCall("UploadMedia")
	if m.UploadMediaFunc != nil {
		return m.UploadMediaFunc(ctx, account, data, mimeType, filename)
	}
	return "media-mock-" + generateMockID(), nil
}

// GetMediaURL mock
func (m *MockClientInterface) GetMediaURL(ctx context.Context, mediaID string, account *models.WhatsAppAccount) (string, error) {
	m.recordCall("GetMediaURL")
	if m.GetMediaURLFunc != nil {
		return m.GetMediaURLFunc(ctx, mediaID, account)
	}
	return "https://cdn.example.com/media/" + mediaID, nil
}

// DownloadMedia mock
func (m *MockClientInterface) DownloadMedia(ctx context.Context, mediaURL string, accessToken string) ([]byte, error) {
	m.recordCall("DownloadMedia")
	if m.DownloadMediaFunc != nil {
		return m.DownloadMediaFunc(ctx, mediaURL, accessToken)
	}
	return []byte("mock-media-content"), nil
}

// DownloadMediaCustom mock
func (m *MockClientInterface) DownloadMediaCustom(ctx context.Context, account *models.WhatsAppAccount, msg interface{}) ([]byte, error) {
	m.recordCall("DownloadMediaCustom")
	if m.DownloadMediaCustomFunc != nil {
		return m.DownloadMediaCustomFunc(ctx, account, msg)
	}
	return []byte("mock-media-content"), nil
}

// ResumableUpload mock
func (m *MockClientInterface) ResumableUpload(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType, filename string) (string, error) {
	m.recordCall("ResumableUpload")
	if m.ResumableUploadFunc != nil {
		return m.ResumableUploadFunc(ctx, account, data, mimeType, filename)
	}
	return "upload-handle-mock-" + generateMockID(), nil
}

// GetBusinessProfile mock
func (m *MockClientInterface) GetBusinessProfile(ctx context.Context, account *models.WhatsAppAccount) (*models.BusinessProfile, error) {
	m.recordCall("GetBusinessProfile")
	if m.GetBusinessProfileFunc != nil {
		return m.GetBusinessProfileFunc(ctx, account)
	}
	return &models.BusinessProfile{}, nil
}

// UpdateBusinessProfile mock
func (m *MockClientInterface) UpdateBusinessProfile(ctx context.Context, account *models.WhatsAppAccount, input models.BusinessProfileInput) error {
	m.recordCall("UpdateBusinessProfile")
	if m.UpdateBusinessProfileFunc != nil {
		return m.UpdateBusinessProfileFunc(ctx, account, input)
	}
	return nil
}

// UploadProfilePicture mock
func (m *MockClientInterface) UploadProfilePicture(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType string) (string, error) {
	m.recordCall("UploadProfilePicture")
	if m.UploadProfilePictureFunc != nil {
		return m.UploadProfilePictureFunc(ctx, account, data, mimeType)
	}
	return "upload-handle-mock", nil
}

// SubscribeApp mock
func (m *MockClientInterface) SubscribeApp(ctx context.Context, account *models.WhatsAppAccount) error {
	m.recordCall("SubscribeApp")
	if m.SubscribeAppFunc != nil {
		return m.SubscribeAppFunc(ctx, account)
	}
	return nil
}

// SetIncomingMessageHandler mock
func (m *MockClientInterface) SetIncomingMessageHandler(handler func(account *models.WhatsAppAccount, data interface{})) {
	m.recordCall("SetIncomingMessageHandler")
	if m.SetIncomingMessageHandlerFunc != nil {
		m.SetIncomingMessageHandlerFunc(handler)
	}
}

// HandleIncomingMessage mock
func (m *MockClientInterface) HandleIncomingMessage(ctx context.Context, wabaID, messageID string) error {
	m.recordCall("HandleIncomingMessage")
	if m.HandleIncomingMessageFunc != nil {
		return m.HandleIncomingMessageFunc(ctx, wabaID, messageID)
	}
	return nil
}

// StartSession mock
func (m *MockClientInterface) StartSession(ctx context.Context, account *models.WhatsAppAccount) error {
	m.recordCall("StartSession")
	if m.StartSessionFunc != nil {
		return m.StartSessionFunc(ctx, account)
	}
	return nil
}

// CloseSession mock
func (m *MockClientInterface) CloseSession(ctx context.Context, account *models.WhatsAppAccount) error {
	m.recordCall("CloseSession")
	if m.CloseSessionFunc != nil {
		return m.CloseSessionFunc(ctx, account)
	}
	return nil
}

// CreateCatalog mock
func (m *MockClientInterface) CreateCatalog(ctx context.Context, account *models.WhatsAppAccount, name string) (string, error) {
	m.recordCall("CreateCatalog")
	if m.CreateCatalogFunc != nil {
		return m.CreateCatalogFunc(ctx, account, name)
	}
	return "catalog-mock-" + generateMockID(), nil
}

// DeleteCatalog mock
func (m *MockClientInterface) DeleteCatalog(ctx context.Context, account *models.WhatsAppAccount, catalogID string) error {
	m.recordCall("DeleteCatalog")
	if m.DeleteCatalogFunc != nil {
		return m.DeleteCatalogFunc(ctx, account, catalogID)
	}
	return nil
}

// ListCatalogs mock
func (m *MockClientInterface) ListCatalogs(ctx context.Context, account *models.WhatsAppAccount) ([]whatsapp.CatalogInfo, error) {
	m.recordCall("ListCatalogs")
	if m.ListCatalogsFunc != nil {
		return m.ListCatalogsFunc(ctx, account)
	}
	return []whatsapp.CatalogInfo{}, nil
}

// CreateProduct mock
func (m *MockClientInterface) CreateProduct(ctx context.Context, account *models.WhatsAppAccount, catalogID string, product *whatsapp.ProductInput) (string, error) {
	m.recordCall("CreateProduct")
	if m.CreateProductFunc != nil {
		return m.CreateProductFunc(ctx, account, catalogID, product)
	}
	return "product-mock-" + generateMockID(), nil
}

// UpdateProduct mock
func (m *MockClientInterface) UpdateProduct(ctx context.Context, account *models.WhatsAppAccount, productID string, product *whatsapp.ProductInput) error {
	m.recordCall("UpdateProduct")
	if m.UpdateProductFunc != nil {
		return m.UpdateProductFunc(ctx, account, productID, product)
	}
	return nil
}

// DeleteProduct mock
func (m *MockClientInterface) DeleteProduct(ctx context.Context, account *models.WhatsAppAccount, productID string) error {
	m.recordCall("DeleteProduct")
	if m.DeleteProductFunc != nil {
		return m.DeleteProductFunc(ctx, account, productID)
	}
	return nil
}

// GetFlow mock
func (m *MockClientInterface) GetFlow(ctx context.Context, account *models.WhatsAppAccount, flowID string) (*whatsapp.FlowGetResponse, error) {
	m.recordCall("GetFlow")
	if m.GetFlowFunc != nil {
		return m.GetFlowFunc(ctx, account, flowID)
	}
	return &whatsapp.FlowGetResponse{}, nil
}

// DeleteFlow mock
func (m *MockClientInterface) DeleteFlow(ctx context.Context, account *models.WhatsAppAccount, flowID string) error {
	m.recordCall("DeleteFlow")
	if m.DeleteFlowFunc != nil {
		return m.DeleteFlowFunc(ctx, account, flowID)
	}
	return nil
}

// CreateFlow mock
func (m *MockClientInterface) CreateFlow(ctx context.Context, account *models.WhatsAppAccount, name string, categories []string) (string, error) {
	m.recordCall("CreateFlow")
	if m.CreateFlowFunc != nil {
		return m.CreateFlowFunc(ctx, account, name, categories)
	}
	return "flow-mock-" + generateMockID(), nil
}

// UpdateFlowJSON mock
func (m *MockClientInterface) UpdateFlowJSON(ctx context.Context, account *models.WhatsAppAccount, flowID string, flowJSON *whatsapp.FlowJSON) error {
	m.recordCall("UpdateFlowJSON")
	if m.UpdateFlowJSONFunc != nil {
		return m.UpdateFlowJSONFunc(ctx, account, flowID, flowJSON)
	}
	return nil
}

// PublishFlow mock
func (m *MockClientInterface) PublishFlow(ctx context.Context, account *models.WhatsAppAccount, flowID string) error {
	m.recordCall("PublishFlow")
	if m.PublishFlowFunc != nil {
		return m.PublishFlowFunc(ctx, account, flowID)
	}
	return nil
}

// DeprecateFlow mock
func (m *MockClientInterface) DeprecateFlow(ctx context.Context, account *models.WhatsAppAccount, flowID string) error {
	m.recordCall("DeprecateFlow")
	if m.DeprecateFlowFunc != nil {
		return m.DeprecateFlowFunc(ctx, account, flowID)
	}
	return nil
}

// ListFlows mock
func (m *MockClientInterface) ListFlows(ctx context.Context, account *models.WhatsAppAccount) ([]whatsapp.FlowGetResponse, error) {
	m.recordCall("ListFlows")
	if m.ListFlowsFunc != nil {
		return m.ListFlowsFunc(ctx, account)
	}
	return []whatsapp.FlowGetResponse{}, nil
}

// GetFlowAssets mock
func (m *MockClientInterface) GetFlowAssets(ctx context.Context, account *models.WhatsAppAccount, flowID string) (*whatsapp.FlowJSON, error) {
	m.recordCall("GetFlowAssets")
	if m.GetFlowAssetsFunc != nil {
		return m.GetFlowAssetsFunc(ctx, account, flowID)
	}
	return &whatsapp.FlowJSON{}, nil
}

// SubmitTemplate mock
func (m *MockClientInterface) SubmitTemplate(ctx context.Context, account *models.WhatsAppAccount, template *whatsapp.TemplateSubmission) (string, error) {
	m.recordCall("SubmitTemplate")
	if m.SubmitTemplateFunc != nil {
		return m.SubmitTemplateFunc(ctx, account, template)
	}
	return "template-mock-" + generateMockID(), nil
}

// FetchTemplates mock
func (m *MockClientInterface) FetchTemplates(ctx context.Context, account *models.WhatsAppAccount) ([]whatsapp.MetaTemplate, error) {
	m.recordCall("FetchTemplates")
	if m.FetchTemplatesFunc != nil {
		return m.FetchTemplatesFunc(ctx, account)
	}
	return []whatsapp.MetaTemplate{}, nil
}

// DeleteTemplate mock
func (m *MockClientInterface) DeleteTemplate(ctx context.Context, account *models.WhatsAppAccount, templateName string) error {
	m.recordCall("DeleteTemplate")
	if m.DeleteTemplateFunc != nil {
		return m.DeleteTemplateFunc(ctx, account, templateName)
	}
	return nil
}

// GetAnalytics mock
func (m *MockClientInterface) GetAnalytics(ctx context.Context, account *models.WhatsAppAccount, analyticsType whatsapp.AnalyticsType, req *whatsapp.AnalyticsRequest) (*whatsapp.MetaAnalyticsResponse, error) {
	m.recordCall("GetAnalytics")
	if m.GetAnalyticsFunc != nil {
		return m.GetAnalyticsFunc(ctx, account, analyticsType, req)
	}
	return &whatsapp.MetaAnalyticsResponse{}, nil
}

// generateMockID returns a short mock ID for test message IDs.
func generateMockID() string {
	return "mock1234"
}
