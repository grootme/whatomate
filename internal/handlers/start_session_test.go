package handlers_test

import (
        "context"
        "encoding/json"
        "fmt"
        "net/http"
        "testing"
        "time"

        "github.com/google/uuid"
        "github.com/shridarpatil/whatomate/internal/config"
        "github.com/shridarpatil/whatomate/internal/handlers"
        "github.com/shridarpatil/whatomate/internal/models"
        "github.com/shridarpatil/whatomate/pkg/whatsapp"
        "github.com/shridarpatil/whatomate/test/testutil"
        factories "github.com/shridarpatil/whatomate/test/fixtures/models"
        "github.com/stretchr/testify/assert"
        "github.com/stretchr/testify/require"
        "github.com/valyala/fasthttp"
        "github.com/zerodha/fastglue"
)

// newTestAppWithMockWhatsApp creates a test App with a mock WhatsApp client
func newTestAppWithMockWhatsApp(t *testing.T, mockWA *testutil.MockClientInterface) *handlers.App {
        t.Helper()

        db := testutil.SetupTestDB(t)
        log := testutil.NopLogger()

        redisClient := testutil.SetupTestRedis(t)
        if redisClient == nil {
                t.Skip("TEST_REDIS_URL not set, skipping test")
        }

        cfg := &config.Config{
                JWT: config.JWTConfig{
                        Secret:            testutil.TestJWTSecret,
                        AccessExpiryMins:  15,
                        RefreshExpiryDays: 7,
                },
                App: config.AppConfig{
                        EncryptionKey: "test-encryption-key-must-be-32chars!!",
                },
                WhatsApp: config.WhatsAppConfig{
                        APIVersion: "v21.0",
                },
        }

        app := &handlers.App{
                Config:     cfg,
                DB:         db,
                Log:        log,
                Redis:      redisClient,
                WhatsApp:   mockWA,
                HTTPClient: &http.Client{Timeout: 30 * time.Second},
        }

        return app
}

// makeAccountRequest creates a fastglue request for account operations
func makeAccountRequest(method string, path string, body interface{}, orgID, userID uuid.UUID) (*fastglue.Request, *fasthttp.Response) {
        var reqBody []byte
        if body != nil {
                reqBody, _ = json.Marshal(body)
        }

        ctx := &fasthttp.RequestCtx{}
        ctx.Request.SetRequestURI(path)
        ctx.Request.Header.SetMethod(method)
        if reqBody != nil {
                ctx.Request.SetBody(reqBody)
                ctx.Request.Header.SetContentType("application/json")
        }
        ctx.SetUserValue("organization_id", orgID)
        ctx.SetUserValue("user_id", userID)

        glueReq := &fastglue.Request{RequestCtx: ctx}
        return glueReq, &ctx.Response
}

// ========== CreateAccount Tests (WhatsApp) ==========

func TestCreateAccount_MetaType_Success(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        user := testutil.CreateTestUser(t, app.DB, org.ID)

        req, _ := makeAccountRequest("POST", "/api/accounts", handlers.AccountRequest{
                Name:       "test-meta-account",
                ClientType: whatsapp.MetaClientType,
                PhoneID:    "123456789",
                BusinessID: "987654321",
                AccessToken: "test-access-token",
        }, org.ID, user.ID)

        err := app.CreateAccount(req)
        require.NoError(t, err)

        var resp map[string]interface{}
        respBody := req.RequestCtx.Response.Body()
        require.NoError(t, json.Unmarshal(respBody, &resp))

        data, ok := resp["data"].(map[string]interface{})
        require.True(t, ok, "Response should have data field")

        assert.Equal(t, "test-meta-account", data["name"])
        assert.Equal(t, whatsapp.MetaClientType, data["client_type"])
        assert.Equal(t, "active", data["status"], "Meta accounts should start as active")
        assert.True(t, data["has_access_token"].(bool))
}

func TestCreateAccount_WhatsmeowType_Success(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        user := testutil.CreateTestUser(t, app.DB, org.ID)

        req, _ := makeAccountRequest("POST", "/api/accounts", handlers.AccountRequest{
                Name:       "test-whatsmeow-account",
                ClientType: whatsapp.WhatsmeowClientType,
                PhoneID:    "1234567890@s.whatsapp.net",
        }, org.ID, user.ID)

        err := app.CreateAccount(req)
        require.NoError(t, err)

        var resp map[string]interface{}
        respBody := req.RequestCtx.Response.Body()
        require.NoError(t, json.Unmarshal(respBody, &resp))

        data, ok := resp["data"].(map[string]interface{})
        require.True(t, ok, "Response should have data field")

        assert.Equal(t, "test-whatsmeow-account", data["name"])
        assert.Equal(t, whatsapp.WhatsmeowClientType, data["client_type"])
        assert.Equal(t, "disconnected", data["status"],
                "Whatsmeow accounts should start as disconnected (need QR pairing)")
        assert.Empty(t, data["qr_code"], "QR code should be empty initially")
}

func TestCreateAccount_MetaType_MissingBusinessID(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        user := testutil.CreateTestUser(t, app.DB, org.ID)

        req, _ := makeAccountRequest("POST", "/api/accounts", handlers.AccountRequest{
                Name:       "test-meta-no-business",
                ClientType: whatsapp.MetaClientType,
                PhoneID:    "123456789",
                AccessToken: "test-token",
                // BusinessID missing
        }, org.ID, user.ID)

        err := app.CreateAccount(req)
        require.NoError(t, err) // Error is sent via envelope

        assert.Equal(t, fasthttp.StatusBadRequest, req.RequestCtx.Response.StatusCode())
}

func TestCreateAccount_DefaultClientType_IsMeta(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        user := testutil.CreateTestUser(t, app.DB, org.ID)

        req, _ := makeAccountRequest("POST", "/api/accounts", handlers.AccountRequest{
                Name:       "test-default-type",
                PhoneID:    "123456789",
                BusinessID: "987654321",
                AccessToken: "test-token",
                // ClientType not set - should default to meta
        }, org.ID, user.ID)

        err := app.CreateAccount(req)
        require.NoError(t, err)

        var resp map[string]interface{}
        respBody := req.RequestCtx.Response.Body()
        require.NoError(t, json.Unmarshal(respBody, &resp))

        data, ok := resp["data"].(map[string]interface{})
        require.True(t, ok)

        assert.Equal(t, whatsapp.MetaClientType, data["client_type"],
                "Default client_type should be 'meta'")
}

func TestCreateAccount_Unauthorized(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        req, _ := makeAccountRequest("POST", "/api/accounts", handlers.AccountRequest{
                Name:    "test-no-auth",
                PhoneID: "123456789",
        }, uuid.Nil, uuid.Nil)

        err := app.CreateAccount(req)
        require.NoError(t, err)

        assert.Equal(t, fasthttp.StatusUnauthorized, req.RequestCtx.Response.StatusCode())
}

// ========== StartWhatsAppSession Tests (QR Pairing) ==========

func TestStartWhatsAppSession_WhatsmeowAccount_Success(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()

        app := newTestAppWithMockWhatsApp(t, mockWA)

        mockWA.StartSessionFunc = func(ctx context.Context, account *models.WhatsAppAccount) error {
                // Simulate QR code being saved to DB
                app.DB.Model(&models.WhatsAppAccount{}).Where("id = ?", account.ID).Update("qr_code", "mock-qr-code-123")
                return nil
        }

        org := testutil.CreateTestOrganization(t, app.DB)
        user := testutil.CreateTestUser(t, app.DB, org.ID)

        // Create a whatsmeow account in the DB
        account := factories.NewWhatsAppAccount(org.ID).
                WithName("test-qr-account").
                WithPhoneID("1234567890@s.whatsapp.net").
                Build()
        account.ClientType = whatsapp.WhatsmeowClientType
        account.Status = "disconnected"
        require.NoError(t, app.DB.Create(&account).Error)

        req, _ := makeAccountRequest("POST",
                "/api/accounts/"+account.ID.String()+"/start-session",
                nil, org.ID, user.ID)

        // Set path param
        req.RequestCtx.SetUserValue("id", account.ID.String())

        err := app.StartWhatsAppSession(req)
        require.NoError(t, err)

        var resp map[string]interface{}
        respBody := req.RequestCtx.Response.Body()
        require.NoError(t, json.Unmarshal(respBody, &resp))

        data, ok := resp["data"].(map[string]interface{})
        require.True(t, ok, "Response should have data field")

        assert.True(t, data["success"].(bool))
        assert.Equal(t, "mock-qr-code-123", data["qr_code"],
                "QR code should be returned after starting session")
        assert.Equal(t, "disconnected", data["status"],
                "Status should still be disconnected until pair success")

        // Verify StartSession was called
        assert.Equal(t, 1, mockWA.CallCount("StartSession"))
}

func TestStartWhatsAppSession_MetaAccount_ReturnsError(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        user := testutil.CreateTestUser(t, app.DB, org.ID)

        // Create a Meta account
        account := factories.NewWhatsAppAccount(org.ID).
                WithName("test-meta-session-account").
                WithPhoneID("123456789").
                WithBusinessID("987654321").
                Build()
        account.ClientType = whatsapp.MetaClientType
        account.Status = "active"
        require.NoError(t, app.DB.Create(&account).Error)

        req, _ := makeAccountRequest("POST",
                "/api/accounts/"+account.ID.String()+"/start-session",
                nil, org.ID, user.ID)

        req.RequestCtx.SetUserValue("id", account.ID.String())

        err := app.StartWhatsAppSession(req)
        require.NoError(t, err)

        // Should return 400 because only whatsmeow accounts can start sessions
        assert.Equal(t, fasthttp.StatusBadRequest, req.RequestCtx.Response.StatusCode())

        // StartSession should NOT have been called
        assert.Equal(t, 0, mockWA.CallCount("StartSession"))
}

func TestStartWhatsAppSession_StartSessionError(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        mockWA.StartSessionFunc = func(ctx context.Context, account *models.WhatsAppAccount) error {
                return fmt.Errorf("failed to connect to WhatsApp servers")
        }

        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        user := testutil.CreateTestUser(t, app.DB, org.ID)

        account := factories.NewWhatsAppAccount(org.ID).
                WithName("test-session-error").
                WithPhoneID("1234567890@s.whatsapp.net").
                Build()
        account.ClientType = whatsapp.WhatsmeowClientType
        account.Status = "disconnected"
        require.NoError(t, app.DB.Create(&account).Error)

        req, _ := makeAccountRequest("POST",
                "/api/accounts/"+account.ID.String()+"/start-session",
                nil, org.ID, user.ID)

        req.RequestCtx.SetUserValue("id", account.ID.String())

        err := app.StartWhatsAppSession(req)
        require.NoError(t, err)

        // Should return 500 because StartSession failed
        assert.Equal(t, fasthttp.StatusInternalServerError, req.RequestCtx.Response.StatusCode())
}

func TestStartWhatsAppSession_Unauthorized(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        account := factories.NewWhatsAppAccount(uuid.New()).
                WithName("test-no-auth-session").
                Build()

        req, _ := makeAccountRequest("POST",
                "/api/accounts/"+account.ID.String()+"/start-session",
                nil, uuid.Nil, uuid.Nil)

        err := app.StartWhatsAppSession(req)
        require.NoError(t, err)
        assert.Equal(t, fasthttp.StatusUnauthorized, req.RequestCtx.Response.StatusCode())
}

func TestStartWhatsAppSession_AccountNotFound(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        user := testutil.CreateTestUser(t, app.DB, org.ID)

        fakeID := uuid.New()
        req, _ := makeAccountRequest("POST",
                "/api/accounts/"+fakeID.String()+"/start-session",
                nil, org.ID, user.ID)

        req.RequestCtx.SetUserValue("id", fakeID.String())

        err := app.StartWhatsAppSession(req)
        require.NoError(t, err)
        // Should return 404 because account doesn't exist
        assert.Equal(t, fasthttp.StatusNotFound, req.RequestCtx.Response.StatusCode())
}

func TestStartWhatsAppSession_OrgIsolation(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org1 := testutil.CreateTestOrganization(t, app.DB)
        org2 := testutil.CreateTestOrganization(t, app.DB)
        user1 := testutil.CreateTestUser(t, app.DB, org1.ID)

        // Create account in org2
        account := factories.NewWhatsAppAccount(org2.ID).
                WithName("org2-account").
                WithPhoneID("1234567890@s.whatsapp.net").
                Build()
        account.ClientType = whatsapp.WhatsmeowClientType
        account.Status = "disconnected"
        require.NoError(t, app.DB.Create(&account).Error)

        // Try to start session from org1 user
        req, _ := makeAccountRequest("POST",
                "/api/accounts/"+account.ID.String()+"/start-session",
                nil, org1.ID, user1.ID)

        req.RequestCtx.SetUserValue("id", account.ID.String())

        err := app.StartWhatsAppSession(req)
        require.NoError(t, err)

        // Should return 404 because account belongs to different org
        assert.Equal(t, fasthttp.StatusNotFound, req.RequestCtx.Response.StatusCode())
}

// ========== AccountResponse Tests ==========

func TestAccountResponse_WhatsmeowQRCodeIncluded(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)

        // Create whatsmeow account with QR code
        account := factories.NewWhatsAppAccount(org.ID).
                WithName("test-qr-display").
                WithPhoneID("1234567890@s.whatsapp.net").
                Build()
        account.ClientType = whatsapp.WhatsmeowClientType
        account.Status = "disconnected"
        account.QRCode = "2@abc123QR_CODE_DATA"
        require.NoError(t, app.DB.Create(&account).Error)

        user := testutil.CreateTestUser(t, app.DB, org.ID)

        req, _ := makeAccountRequest("GET",
                "/api/accounts/"+account.ID.String(),
                nil, org.ID, user.ID)

        req.RequestCtx.SetUserValue("id", account.ID.String())

        err := app.GetAccount(req)
        require.NoError(t, err)

        var resp map[string]interface{}
        respBody := req.RequestCtx.Response.Body()
        require.NoError(t, json.Unmarshal(respBody, &resp))

        data, ok := resp["data"].(map[string]interface{})
        require.True(t, ok)

        assert.Equal(t, "2@abc123QR_CODE_DATA", data["qr_code"],
                "QR code should be included in the response for whatsmeow accounts")
        assert.Equal(t, "disconnected", data["status"])
        assert.Equal(t, whatsapp.WhatsmeowClientType, data["client_type"])
}

// ========== ListAccounts Tests ==========

func TestListAccounts_MixedClientTypes(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        user := testutil.CreateTestUser(t, app.DB, org.ID)

        // Create meta account
        metaAccount := factories.NewWhatsAppAccount(org.ID).
                WithName("meta-account").
                WithPhoneID("phone-meta").
                WithBusinessID("business-meta").
                WithAccessToken("test-token").
                Build()
        metaAccount.ClientType = whatsapp.MetaClientType
        metaAccount.Status = "active"
        require.NoError(t, app.DB.Create(&metaAccount).Error)

        // Create whatsmeow account
        wsAccount := factories.NewWhatsAppAccount(org.ID).
                WithName("whatsmeow-account").
                WithPhoneID("1234567890@s.whatsapp.net").
                Build()
        wsAccount.ClientType = whatsapp.WhatsmeowClientType
        wsAccount.Status = "disconnected"
        wsAccount.QRCode = "test-qr-code"
        require.NoError(t, app.DB.Create(&wsAccount).Error)

        req, _ := makeAccountRequest("GET", "/api/accounts", nil, org.ID, user.ID)

        err := app.ListAccounts(req)
        require.NoError(t, err)

        var resp map[string]interface{}
        respBody := req.RequestCtx.Response.Body()
        require.NoError(t, json.Unmarshal(respBody, &resp))

        data, ok := resp["data"].(map[string]interface{})
        require.True(t, ok)

        accounts, ok := data["accounts"].([]interface{})
        require.True(t, ok)
        assert.Len(t, accounts, 2, "Should have 2 accounts")

        // Find each account by type
        var metaFound, wsFound bool
        for _, acc := range accounts {
                a := acc.(map[string]interface{})
                if a["client_type"] == whatsapp.MetaClientType {
                        metaFound = true
                        assert.Equal(t, "active", a["status"])
                }
                if a["client_type"] == whatsapp.WhatsmeowClientType {
                        wsFound = true
                        assert.Equal(t, "disconnected", a["status"])
                        assert.Equal(t, "test-qr-code", a["qr_code"])
                }
        }
        assert.True(t, metaFound, "Meta account should be in list")
        assert.True(t, wsFound, "Whatsmeow account should be in list")
}

// ========== DeleteAccount Tests ==========

func TestDeleteAccount_InvalidatesCache(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        user := testutil.CreateTestUser(t, app.DB, org.ID)

        account := factories.NewWhatsAppAccount(org.ID).
                WithName("to-delete-account").
                WithPhoneID("phone-to-delete").
                Build()
        require.NoError(t, app.DB.Create(&account).Error)

        req, _ := makeAccountRequest("DELETE",
                "/api/accounts/"+account.ID.String(),
                nil, org.ID, user.ID)

        req.RequestCtx.SetUserValue("id", account.ID.String())

        err := app.DeleteAccount(req)
        require.NoError(t, err)

        // Verify account is soft-deleted
        var count int64
        app.DB.Model(&models.WhatsAppAccount{}).Where("id = ?", account.ID).Count(&count)
        assert.Equal(t, int64(0), count, "Account should be deleted")
}
