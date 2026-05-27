package whatsapp

import (
        "testing"

        "github.com/google/uuid"
        "github.com/shridarpatil/whatomate/internal/models"
        "github.com/stretchr/testify/assert"
        "go.mau.fi/whatsmeow"
)

// ========== WhatsmeowClientAdapter Unit Tests ==========

// TestWhatsmeowClientType_Constants verifies the client type constants
func TestWhatsmeowClientType_Constants(t *testing.T) {
        assert.Equal(t, "whatsmeow", WhatsmeowClientType)
        assert.Equal(t, "meta", MetaClientType)
}

// TestWhatsmeowMediaData_Struct verifies the WhatsmeowMediaData struct
func TestWhatsmeowMediaData_Struct(t *testing.T) {
        data := WhatsmeowMediaData{
                URL:           "https://example.com/media",
                DirectPath:    "/v/t62.7/mime",
                MediaKey:      []byte("key"),
                FileEncSHA256: []byte("encsha"),
                FileSHA256:    []byte("sha"),
                FileLength:    1024,
        }
        assert.Equal(t, "https://example.com/media", data.URL)
        assert.Equal(t, uint64(1024), data.FileLength)
}

// TestWhatsmeowClientAdapter_UnsupportedMethods verifies that all
// Meta-specific methods return proper "not supported" errors
func TestWhatsmeowClientAdapter_UnsupportedMethods(t *testing.T) {
        adapter := &WhatsmeowClientAdapter{
                clients: make(map[string]*whatsmeow.Client),
        }

        account := &models.WhatsAppAccount{
                BaseModel:      models.BaseModel{ID: uuid.New()},
                OrganizationID: uuid.New(),
                Name:           "test-unsupported",
                PhoneID:        "1234567890@s.whatsapp.net",
                ClientType:     WhatsmeowClientType,
        }

        t.Run("SendTemplateMessage not supported", func(t *testing.T) {
                _, err := adapter.SendTemplateMessage(nil, account, "recipient", "template", "en", nil)
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported by whatsmeow")
        })

        t.Run("SendFlowMessage not supported", func(t *testing.T) {
                _, err := adapter.SendFlowMessage(nil, account, "recipient", "flow1", "header", "body", "cta", "token", "screen1")
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported by whatsmeow")
        })

        t.Run("GetMediaURL not supported", func(t *testing.T) {
                _, err := adapter.GetMediaURL(nil, "media-id", account)
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "Meta-specific")
        })

        t.Run("DownloadMedia not supported", func(t *testing.T) {
                _, err := adapter.DownloadMedia(nil, "url", "token")
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "requires a whatsmeow.Download call")
        })

        t.Run("ResumableUpload not applicable", func(t *testing.T) {
                _, err := adapter.ResumableUpload(nil, account, []byte("data"), "image/jpeg", "file.jpg")
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not applicable")
        })

        t.Run("GetBusinessProfile not implemented", func(t *testing.T) {
                _, err := adapter.GetBusinessProfile(nil, account)
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not implemented")
        })

        t.Run("SubscribeApp not applicable", func(t *testing.T) {
                err := adapter.SubscribeApp(nil, account)
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not applicable")
        })

        t.Run("HandleIncomingMessage not implemented", func(t *testing.T) {
                err := adapter.HandleIncomingMessage(nil, "waba", "msg")
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not implemented")
        })

        t.Run("CreateCatalog not supported", func(t *testing.T) {
                _, err := adapter.CreateCatalog(nil, account, "catalog")
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported")
        })

        t.Run("DeleteCatalog not supported", func(t *testing.T) {
                err := adapter.DeleteCatalog(nil, account, "cat-123")
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported")
        })

        t.Run("ListCatalogs not supported", func(t *testing.T) {
                _, err := adapter.ListCatalogs(nil, account)
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported")
        })

        t.Run("CreateProduct not supported", func(t *testing.T) {
                _, err := adapter.CreateProduct(nil, account, "cat-123", nil)
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported")
        })

        t.Run("UpdateProduct not supported", func(t *testing.T) {
                err := adapter.UpdateProduct(nil, account, "prod-123", nil)
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported")
        })

        t.Run("DeleteProduct not supported", func(t *testing.T) {
                err := adapter.DeleteProduct(nil, account, "prod-123")
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported")
        })

        t.Run("CreateFlow not supported", func(t *testing.T) {
                _, err := adapter.CreateFlow(nil, account, "flow", []string{"SURVEY"})
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported")
        })

        t.Run("UpdateFlowJSON not supported", func(t *testing.T) {
                err := adapter.UpdateFlowJSON(nil, account, "flow-123", nil)
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported")
        })

        t.Run("PublishFlow not supported", func(t *testing.T) {
                err := adapter.PublishFlow(nil, account, "flow-123")
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported")
        })

        t.Run("DeprecateFlow not supported", func(t *testing.T) {
                err := adapter.DeprecateFlow(nil, account, "flow-123")
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported")
        })

        t.Run("DeleteFlow not supported", func(t *testing.T) {
                err := adapter.DeleteFlow(nil, account, "flow-123")
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported")
        })

        t.Run("GetFlow not supported", func(t *testing.T) {
                _, err := adapter.GetFlow(nil, account, "flow-123")
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported")
        })

        t.Run("GetFlowAssets not supported", func(t *testing.T) {
                _, err := adapter.GetFlowAssets(nil, account, "flow-123")
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported")
        })

        t.Run("ListFlows not supported", func(t *testing.T) {
                _, err := adapter.ListFlows(nil, account)
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported")
        })

        t.Run("SubmitTemplate not supported", func(t *testing.T) {
                _, err := adapter.SubmitTemplate(nil, account, nil)
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported")
        })

        t.Run("FetchTemplates not supported", func(t *testing.T) {
                _, err := adapter.FetchTemplates(nil, account)
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported")
        })

        t.Run("DeleteTemplate not supported", func(t *testing.T) {
                err := adapter.DeleteTemplate(nil, account, "template-name")
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported")
        })

        t.Run("GetAnalytics not supported", func(t *testing.T) {
                _, err := adapter.GetAnalytics(nil, account, AnalyticsTypeMessage, nil)
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported")
        })
}

// TestWhatsmeowClientAdapter_MarkMessageRead_NoError verifies that
// MarkMessageRead is a no-op for whatsmeow (logs but doesn't error)
func TestWhatsmeowClientAdapter_MarkMessageRead_NoError(t *testing.T) {
        adapter := &WhatsmeowClientAdapter{
                clients: make(map[string]*whatsmeow.Client),
        }

        account := &models.WhatsAppAccount{
                Name:   "test-account",
                Status: "active",
        }

        // Should not return an error (whatsmeow doesn't support this directly)
        err := adapter.MarkMessageRead(nil, account, "msg-id")
        assert.NoError(t, err, "MarkMessageRead should not error for whatsmeow")
}

// TestWhatsmeowClientAdapter_GetClient_RequiresPhoneID verifies that
// GetClient returns an error when PhoneID is empty
func TestWhatsmeowClientAdapter_GetClient_RequiresPhoneID(t *testing.T) {
        adapter := &WhatsmeowClientAdapter{
                clients: make(map[string]*whatsmeow.Client),
        }

        account := &models.WhatsAppAccount{
                Name:    "test-no-phone",
                PhoneID: "", // Empty PhoneID
        }

        _, err := adapter.GetClient(account)
        assert.Error(t, err, "GetClient should error when PhoneID is empty")
        assert.Contains(t, err.Error(), "phone_id")
}

// TestWhatsmeowClientAdapter_GetClient_InvalidJID verifies that
// GetClient returns an error when PhoneID is not a valid JID
func TestWhatsmeowClientAdapter_GetClient_InvalidJID(t *testing.T) {
        adapter := &WhatsmeowClientAdapter{
                clients: make(map[string]*whatsmeow.Client),
        }

        account := &models.WhatsAppAccount{
                Name:    "test-invalid-jid",
                PhoneID: "not-a-valid-jid",
        }

        _, err := adapter.GetClient(account)
        assert.Error(t, err, "GetClient should error with invalid JID")
        assert.Contains(t, err.Error(), "invalid phone_id")
}

// TestWhatsmeowClientAdapter_SendImageMessage_InvalidMediaID verifies
// that SendImageMessage errors when mediaID is not valid JSON
func TestWhatsmeowClientAdapter_SendImageMessage_InvalidMediaID(t *testing.T) {
        adapter := &WhatsmeowClientAdapter{
                clients: make(map[string]*whatsmeow.Client),
        }

        account := &models.WhatsAppAccount{
                Name:   "test-account",
                Status: "active",
        }

        _, err := adapter.SendImageMessage(nil, account, "recipient", "not-json", "caption")
        assert.Error(t, err, "SendImageMessage should error with invalid mediaID JSON")
        assert.Contains(t, err.Error(), "invalid mediaID")
}

// TestWhatsmeowClientAdapter_SendVideoMessage_InvalidMediaID verifies
// that SendVideoMessage errors when mediaID is not valid JSON
func TestWhatsmeowClientAdapter_SendVideoMessage_InvalidMediaID(t *testing.T) {
        adapter := &WhatsmeowClientAdapter{
                clients: make(map[string]*whatsmeow.Client),
        }

        account := &models.WhatsAppAccount{
                Name:   "test-account",
                Status: "active",
        }

        _, err := adapter.SendVideoMessage(nil, account, "recipient", "not-json", "caption")
        assert.Error(t, err, "SendVideoMessage should error with invalid mediaID JSON")
}

// TestWhatsmeowClientAdapter_SendAudioMessage_InvalidMediaID verifies
// that SendAudioMessage errors when mediaID is not valid JSON
func TestWhatsmeowClientAdapter_SendAudioMessage_InvalidMediaID(t *testing.T) {
        adapter := &WhatsmeowClientAdapter{
                clients: make(map[string]*whatsmeow.Client),
        }

        account := &models.WhatsAppAccount{
                Name:   "test-account",
                Status: "active",
        }

        _, err := adapter.SendAudioMessage(nil, account, "recipient", "not-json")
        assert.Error(t, err, "SendAudioMessage should error with invalid mediaID JSON")
}

// TestWhatsmeowClientAdapter_SendDocumentMessage_InvalidMediaID verifies
// that SendDocumentMessage errors when mediaID is not valid JSON
func TestWhatsmeowClientAdapter_SendDocumentMessage_InvalidMediaID(t *testing.T) {
        adapter := &WhatsmeowClientAdapter{
                clients: make(map[string]*whatsmeow.Client),
        }

        account := &models.WhatsAppAccount{
                Name:   "test-account",
                Status: "active",
        }

        _, err := adapter.SendDocumentMessage(nil, account, "recipient", "not-json", "file.pdf", "caption")
        assert.Error(t, err, "SendDocumentMessage should error with invalid mediaID JSON")
}

// TestWhatsmeowClientAdapter_SendStickerMessage_InvalidMediaID verifies
// that SendStickerMessage errors when mediaID is not valid JSON
func TestWhatsmeowClientAdapter_SendStickerMessage_InvalidMediaID(t *testing.T) {
        adapter := &WhatsmeowClientAdapter{
                clients: make(map[string]*whatsmeow.Client),
        }

        account := &models.WhatsAppAccount{
                Name:   "test-account",
                Status: "active",
        }

        _, err := adapter.SendStickerMessage(nil, account, "recipient", "not-json")
        assert.Error(t, err, "SendStickerMessage should error with invalid mediaID JSON")
}

// TestWhatsmeowClientAdapter_UploadProfilePicture_NotSupported verifies
// that UploadProfilePicture returns an error for whatsmeow
func TestWhatsmeowClientAdapter_UploadProfilePicture_NotSupported(t *testing.T) {
        adapter := &WhatsmeowClientAdapter{
                clients: make(map[string]*whatsmeow.Client),
        }

        account := &models.WhatsAppAccount{
                Name:   "test-account",
                Status: "active",
        }

        _, err := adapter.UploadProfilePicture(nil, account, []byte("image-data"), "image/jpeg")
        assert.Error(t, err, "UploadProfilePicture should error for whatsmeow")
        assert.Contains(t, err.Error(), "not directly supported")
}

// TestWhatsmeowClientAdapter_SetIncomingMessageHandler verifies
// that the handler is properly stored
func TestWhatsmeowClientAdapter_SetIncomingMessageHandler(t *testing.T) {
        adapter := &WhatsmeowClientAdapter{
                clients: make(map[string]*whatsmeow.Client),
        }

        handlerCalled := false
        handler := func(account *models.WhatsAppAccount, data interface{}) {
                handlerCalled = true
        }

        adapter.SetIncomingMessageHandler(handler)
        assert.NotNil(t, adapter.incomingMessageHandler, "Handler should be set")
}

// TestWhatsmeowClientAdapter_GetQRChannel returns a read-only channel
func TestWhatsmeowClientAdapter_GetQRChannel(t *testing.T) {
        adapter := &WhatsmeowClientAdapter{
                clients:   make(map[string]*whatsmeow.Client),
                qrChannel: make(chan string),
        }

        ch := adapter.GetQRChannel()
        assert.NotNil(t, ch, "QR channel should not be nil")
}

// TestWhatsmeowClientAdapter_NewWhatsmeowClientAdapter verifies constructor
func TestWhatsmeowClientAdapter_NewWhatsmeowClientAdapter(t *testing.T) {
        adapter := NewWhatsmeowClientAdapter(nil, nil, nil, nil)
        assert.NotNil(t, adapter, "Adapter should not be nil")
        assert.NotNil(t, adapter.clients, "Clients map should be initialized")
        assert.NotNil(t, adapter.qrChannel, "QR channel should be initialized")
}
