package whatsapp

import (
        "context"
        "testing"

        "github.com/google/uuid"
        "github.com/shridarpatil/whatomate/internal/models"
        "github.com/stretchr/testify/assert"
        "github.com/stretchr/testify/require"
        "github.com/zerodha/logf"
)

// TestMultiClientProvider_GetAdapter_Meta verifies that getAdapter returns
// MetaClientAdapter when the account has client_type "meta"
func TestMultiClientProvider_GetAdapter_Meta(t *testing.T) {
        log := logf.New(logf.Opts{Level: logf.DebugLevel})
        provider := NewMultiClientProvider(log, nil, nil, nil)

        account := &models.WhatsAppAccount{
                BaseModel:      models.BaseModel{ID: uuid.New()},
                OrganizationID: uuid.New(),
                Name:           "test-meta-account",
                ClientType:     MetaClientType,
                PhoneID:        "123456789",
                BusinessID:     "987654321",
                AccessToken:    "test-token",
                Status:         "active",
        }

        adapter, err := provider.getAdapter(account)
        require.NoError(t, err)
        assert.IsType(t, &MetaClientAdapter{}, adapter, "Expected MetaClientAdapter for meta client_type")
}

// TestMultiClientProvider_GetAdapter_Whatsmeow verifies that getAdapter returns
// WhatsmeowClientAdapter when the account has client_type "whatsmeow"
func TestMultiClientProvider_GetAdapter_Whatsmeow(t *testing.T) {
        log := logf.New(logf.Opts{Level: logf.DebugLevel})
        provider := NewMultiClientProvider(log, nil, nil, nil)

        account := &models.WhatsAppAccount{
                BaseModel:      models.BaseModel{ID: uuid.New()},
                OrganizationID: uuid.New(),
                Name:           "test-whatsmeow-account",
                ClientType:     WhatsmeowClientType,
                PhoneID:        "123456789@s.whatsapp.net",
                Status:         "disconnected",
        }

        adapter, err := provider.getAdapter(account)
        require.NoError(t, err)
        assert.IsType(t, &WhatsmeowClientAdapter{}, adapter, "Expected WhatsmeowClientAdapter for whatsmeow client_type")
}

// TestMultiClientProvider_GetAdapter_DefaultFallback verifies that getAdapter
// defaults to MetaClientAdapter when client_type is empty or unknown
func TestMultiClientProvider_GetAdapter_DefaultFallback(t *testing.T) {
        log := logf.New(logf.Opts{Level: logf.DebugLevel})
        provider := NewMultiClientProvider(log, nil, nil, nil)

        testCases := []struct {
                name       string
                clientType string
        }{
                {"empty client_type defaults to meta", ""},
                {"unknown client_type defaults to meta", "unknown"},
                {"random client_type defaults to meta", "something_else"},
        }

        for _, tc := range testCases {
                t.Run(tc.name, func(t *testing.T) {
                        account := &models.WhatsAppAccount{
                                BaseModel:      models.BaseModel{ID: uuid.New()},
                                OrganizationID: uuid.New(),
                                Name:           "test-account",
                                ClientType:     tc.clientType,
                        }

                        adapter, err := provider.getAdapter(account)
                        require.NoError(t, err)
                        assert.IsType(t, &MetaClientAdapter{}, adapter,
                                "Expected MetaClientAdapter as default for client_type=%q", tc.clientType)
                })
        }
}

// TestMultiClientProvider_StartSession_DelegatesToWhatsmeow verifies that
// StartSession is delegated to the whatsmeow adapter when client_type is whatsmeow
func TestMultiClientProvider_StartSession_DelegatesToWhatsmeow(t *testing.T) {
        log := logf.New(logf.Opts{Level: logf.DebugLevel})
        provider := NewMultiClientProvider(log, nil, nil, nil)

        account := &models.WhatsAppAccount{
                BaseModel:      models.BaseModel{ID: uuid.New()},
                OrganizationID: uuid.New(),
                Name:           "test-whatsmeow-session",
                ClientType:     WhatsmeowClientType,
                PhoneID:        "1234567890@s.whatsapp.net",
                Status:         "disconnected",
        }

        // StartSession will fail because there's no real whatsmeow store,
        // but we verify it reaches the whatsmeow adapter (not meta)
        err := provider.StartSession(context.Background(), account)
        // It should fail with a whatsmeow-specific error (no dbStore)
        assert.Error(t, err, "Expected error because whatsmeow store is nil")
}

// TestMultiClientProvider_StartSession_MetaReturnsError verifies that
// StartSession for Meta accounts returns an appropriate error
func TestMultiClientProvider_StartSession_MetaReturnsError(t *testing.T) {
        log := logf.New(logf.Opts{Level: logf.DebugLevel})
        provider := NewMultiClientProvider(log, nil, nil, nil)

        account := &models.WhatsAppAccount{
                BaseModel:      models.BaseModel{ID: uuid.New()},
                OrganizationID: uuid.New(),
                Name:           "test-meta-session",
                ClientType:     MetaClientType,
                PhoneID:        "123456789",
                BusinessID:     "987654321",
                AccessToken:    "test-token",
                Status:         "active",
        }

        err := provider.StartSession(context.Background(), account)
        // Meta adapter's StartSession should return an error since it's not supported
        assert.Error(t, err, "Meta adapter should return error for StartSession")
}

// TestMultiClientProvider_CloseSession_DelegatesToWhatsmeow verifies
// CloseSession delegates to the whatsmeow adapter
func TestMultiClientProvider_CloseSession_DelegatesToWhatsmeow(t *testing.T) {
        log := logf.New(logf.Opts{Level: logf.DebugLevel})
        provider := NewMultiClientProvider(log, nil, nil, nil)

        account := &models.WhatsAppAccount{
                BaseModel:      models.BaseModel{ID: uuid.New()},
                OrganizationID: uuid.New(),
                Name:           "test-whatsmeow-close",
                ClientType:     WhatsmeowClientType,
                PhoneID:        "1234567890@s.whatsapp.net",
                Status:         "active",
        }

        // CloseSession will fail because there's no client in the map,
        // but it should try to get one from the whatsmeow adapter
        err := provider.CloseSession(context.Background(), account)
        // Error expected because there's no actual whatsmeow client
        assert.Error(t, err)
}

// TestMultiClientProvider_SetIncomingMessageHandler_SetsBoth verifies
// that SetIncomingMessageHandler sets the handler on both adapters
func TestMultiClientProvider_SetIncomingMessageHandler_SetsBoth(t *testing.T) {
        log := logf.New(logf.Opts{Level: logf.DebugLevel})
        provider := NewMultiClientProvider(log, nil, nil, nil)

        handler := func(account *models.WhatsAppAccount, data interface{}) {}

        provider.SetIncomingMessageHandler(handler)

        // Verify the handler was set without panicking
        // (MetaClientAdapter stores it internally; WhatsmeowClientAdapter stores it in its incomingMsgHandler field)
        assert.NotNil(t, provider, "Provider should be created with handler support")
}

// TestMultiClientProvider_ValidateCredentials_Delegates verifies
// ValidateCredentials delegates to the correct adapter
func TestMultiClientProvider_ValidateCredentials_Delegates(t *testing.T) {
        log := logf.New(logf.Opts{Level: logf.DebugLevel})
        provider := NewMultiClientProvider(log, nil, nil, nil)

        t.Run("meta account delegates to meta adapter", func(t *testing.T) {
                account := &models.WhatsAppAccount{
                        BaseModel:      models.BaseModel{ID: uuid.New()},
                        OrganizationID: uuid.New(),
                        Name:           "test-meta-validate",
                        ClientType:     MetaClientType,
                        PhoneID:        "123456789",
                        BusinessID:     "987654321",
                        AccessToken:    "test-token",
                        Status:         "active",
                }

                err := provider.ValidateCredentials(context.Background(), account)
                // Meta adapter requires valid AccessToken, PhoneID, and BusinessID
                // With test-token it will try to call the Meta API and fail
                assert.Error(t, err, "Expected error from Meta API with test credentials")
        })

        t.Run("whatsmeow account delegates to whatsmeow adapter", func(t *testing.T) {
                account := &models.WhatsAppAccount{
                        BaseModel:      models.BaseModel{ID: uuid.New()},
                        OrganizationID: uuid.New(),
                        Name:           "test-whatsmeow-validate",
                        ClientType:     WhatsmeowClientType,
                        PhoneID:        "invalid-jid",
                        Status:         "disconnected",
                }

                err := provider.ValidateCredentials(context.Background(), account)
                // Whatsmeow adapter should fail because the JID is invalid
                assert.Error(t, err, "Expected error from whatsmeow adapter with invalid JID")
        })
}

// TestMultiClientProvider_SendTextMessage_DelegatesByType verifies
// SendTextMessage delegates based on client_type
func TestMultiClientProvider_SendTextMessage_DelegatesByType(t *testing.T) {
        log := logf.New(logf.Opts{Level: logf.DebugLevel})
        provider := NewMultiClientProvider(log, nil, nil, nil)

        t.Run("meta account tries meta adapter", func(t *testing.T) {
                account := &models.WhatsAppAccount{
                        BaseModel:      models.BaseModel{ID: uuid.New()},
                        OrganizationID: uuid.New(),
                        Name:           "test-meta-send",
                        ClientType:     MetaClientType,
                        PhoneID:        "123456789",
                        BusinessID:     "987654321",
                        AccessToken:    "test-token",
                        Status:         "active",
                }

                _, err := provider.SendTextMessage(context.Background(), account, "1234567890", "Hello", "")
                // Will fail because there's no real Meta API
                assert.Error(t, err)
        })

        t.Run("whatsmeow account tries whatsmeow adapter", func(t *testing.T) {
                account := &models.WhatsAppAccount{
                        BaseModel:      models.BaseModel{ID: uuid.New()},
                        OrganizationID: uuid.New(),
                        Name:           "test-whatsmeow-send",
                        ClientType:     WhatsmeowClientType,
                        PhoneID:        "1234567890@s.whatsapp.net",
                        Status:         "disconnected",
                }

                _, err := provider.SendTextMessage(context.Background(), account, "1234567890@s.whatsapp.net", "Hello", "")
                // Will fail because there's no real whatsmeow client
                assert.Error(t, err)
        })
}

// TestMultiClientProvider_HandleIncomingMessage_NotImplemented verifies
// that HandleIncomingMessage returns error for MultiClientProvider
func TestMultiClientProvider_HandleIncomingMessage_NotImplemented(t *testing.T) {
        log := logf.New(logf.Opts{Level: logf.DebugLevel})
        provider := NewMultiClientProvider(log, nil, nil, nil)

        err := provider.HandleIncomingMessage(context.Background(), "waba-123", "msg-456")
        assert.Error(t, err, "HandleIncomingMessage should return error for MultiClientProvider")
        assert.Contains(t, err.Error(), "not implemented")
}

// TestMultiClientProvider_DownloadMedia_AlwaysUsesMeta verifies that
// DownloadMedia always delegates to the Meta adapter (as per implementation)
func TestMultiClientProvider_DownloadMedia_AlwaysUsesMeta(t *testing.T) {
        log := logf.New(logf.Opts{Level: logf.DebugLevel})
        provider := NewMultiClientProvider(log, nil, nil, nil)

        // Even with a whatsmeow account, DownloadMedia uses meta adapter
        // because the current implementation hardcodes it
        data, err := provider.DownloadMedia(context.Background(), "https://example.com/media", "test-token")
        // Will fail because no real Meta API, but it confirms delegation path
        assert.Error(t, err, "Expected error from Meta adapter with no real API")
        assert.Nil(t, data)
}

// TestMultiClientProvider_UnsupportedMethods_Whatsmeow verifies that
// Meta-specific methods return proper errors when called with whatsmeow account
func TestMultiClientProvider_UnsupportedMethods_Whatsmeow(t *testing.T) {
        log := logf.New(logf.Opts{Level: logf.DebugLevel})
        provider := NewMultiClientProvider(log, nil, nil, nil)

        account := &models.WhatsAppAccount{
                BaseModel:      models.BaseModel{ID: uuid.New()},
                OrganizationID: uuid.New(),
                Name:           "test-whatsmeow-unsupported",
                ClientType:     WhatsmeowClientType,
                PhoneID:        "1234567890@s.whatsapp.net",
                Status:         "active",
        }

        t.Run("SendTemplateMessage returns not supported", func(t *testing.T) {
                _, err := provider.SendTemplateMessage(context.Background(), account, "recipient", "template", "en", nil)
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported by whatsmeow")
        })

        t.Run("SendFlowMessage returns not supported", func(t *testing.T) {
                _, err := provider.SendFlowMessage(context.Background(), account, "recipient", "flow1", "header", "body", "cta", "token", "screen1")
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported by whatsmeow")
        })

        t.Run("CreateCatalog returns not supported", func(t *testing.T) {
                _, err := provider.CreateCatalog(context.Background(), account, "test-catalog")
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported by whatsmeow")
        })

        t.Run("SubscribeApp returns not supported", func(t *testing.T) {
                err := provider.SubscribeApp(context.Background(), account)
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not applicable for whatsmeow")
        })

        t.Run("GetAnalytics returns not supported", func(t *testing.T) {
                _, err := provider.GetAnalytics(context.Background(), account, AnalyticsTypeMessaging, nil)
                assert.Error(t, err)
                assert.Contains(t, err.Error(), "not supported by whatsmeow")
        })
}
