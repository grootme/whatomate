package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/crypto"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/pkg/whatsapp"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

// AccountRequest represents the request body for creating/updating an account
type AccountRequest struct {
	Name               string `json:"name" validate:"required"`
	ClientType         string `json:"client_type"` // meta, whatsmeow
	AppID              string `json:"app_id"`
	PhoneID            string `json:"phone_id" validate:"required"`
	BusinessID         string `json:"business_id" validate:"required"`
	AccessToken        string `json:"access_token" validate:"required"`
	AppSecret          string `json:"app_secret"` // Meta App Secret for webhook signature verification
	WebhookVerifyToken string `json:"webhook_verify_token"`
	APIVersion         string `json:"api_version"`
	IsDefaultIncoming  bool   `json:"is_default_incoming"`
	IsDefaultOutgoing  bool   `json:"is_default_outgoing"`
	AutoReadReceipt    bool   `json:"auto_read_receipt"`
}

// AccountResponse represents the response for an account (without sensitive data)
type AccountResponse struct {
	ID                 uuid.UUID `json:"id"`
	Name               string    `json:"name"`
	ClientType         string    `json:"client_type"`
	AppID              string    `json:"app_id"`
	PhoneID            string    `json:"phone_id"`
	BusinessID         string    `json:"business_id"`
	WebhookVerifyToken string    `json:"webhook_verify_token"`
	APIVersion         string    `json:"api_version"`
	IsDefaultIncoming  bool      `json:"is_default_incoming"`
	IsDefaultOutgoing  bool      `json:"is_default_outgoing"`
	AutoReadReceipt    bool      `json:"auto_read_receipt"`
	Status             string    `json:"status"`
	HasAccessToken     bool      `json:"has_access_token"`
	HasAppSecret       bool      `json:"has_app_secret"`
	PhoneNumber        string    `json:"phone_number,omitempty"`
	DisplayName        string    `json:"display_name,omitempty"`
	QRCode             string    `json:"qr_code,omitempty"`
	CreatedAt          string    `json:"created_at"`
	UpdatedAt          string    `json:"updated_at"`
}

// ListAccounts returns all WhatsApp accounts for the organization
func (a *App) ListAccounts(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	var accounts []models.WhatsAppAccount
	if err := a.DB.Where("organization_id = ?", orgID).Order("created_at DESC").Find(&accounts).Error; err != nil {
		a.Log.Error("Failed to list accounts", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list accounts", nil, "")
	}

	// Convert to response format (hide sensitive data)
	response := make([]AccountResponse, len(accounts))
	for i, acc := range accounts {
		response[i] = accountToResponse(acc)
	}

	return r.SendEnvelope(map[string]interface{}{
		"accounts": response,
	})
}

// CreateAccount creates a new WhatsApp account
func (a *App) CreateAccount(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	var req AccountRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}

	// Validate required fields based on client type
	clientType := req.ClientType
	if clientType == "" {
		clientType = whatsapp.MetaClientType
	}

	if req.Name == "" || req.PhoneID == "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Name and phone_id are required", nil, "")
	}

	if clientType == whatsapp.MetaClientType && (req.BusinessID == "" || req.AccessToken == "") {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Business_id and access_token are required for Meta API", nil, "")
	}

	encKey := a.Config.App.EncryptionKey
	var encAccessToken, encAppSecret string

	if req.AccessToken != "" {
		enc, err := crypto.Encrypt(req.AccessToken, encKey)
		if err != nil {
			a.Log.Error("Failed to encrypt access token", "error", err)
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to create account", nil, "")
		}
		encAccessToken = enc
	}

	if req.AppSecret != "" {
		enc, err := crypto.Encrypt(req.AppSecret, encKey)
		if err != nil {
			a.Log.Error("Failed to encrypt app secret", "error", err)
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to create account", nil, "")
		}
		encAppSecret = enc
	}

	webhookVerifyToken := req.WebhookVerifyToken
	if webhookVerifyToken == "" {
		webhookVerifyToken = generateVerifyToken()
	}

	apiVersion := req.APIVersion
	if apiVersion == "" {
		apiVersion = a.Config.WhatsApp.APIVersion
	}

	account := models.WhatsAppAccount{
		OrganizationID:     orgID,
		Name:               req.Name,
		ClientType:         clientType,
		AppID:              req.AppID,
		PhoneID:            req.PhoneID,
		BusinessID:         req.BusinessID,
		AccessToken:        encAccessToken,
		AppSecret:          encAppSecret,
		WebhookVerifyToken: webhookVerifyToken,
		APIVersion:         apiVersion,
		IsDefaultIncoming:  req.IsDefaultIncoming,
		IsDefaultOutgoing:  req.IsDefaultOutgoing,
		AutoReadReceipt:    req.AutoReadReceipt,
		Status:             "active",
	}

	// If this is set as default, unset other defaults
	if req.IsDefaultIncoming {
		a.DB.Model(&models.WhatsAppAccount{}).
			Where("organization_id = ? AND is_default_incoming = ?", orgID, true).
			Update("is_default_incoming", false)
	}
	if req.IsDefaultOutgoing {
		a.DB.Model(&models.WhatsAppAccount{}).
			Where("organization_id = ? AND is_default_outgoing = ?", orgID, true).
			Update("is_default_outgoing", false)
	}

	if err := a.DB.Create(&account).Error; err != nil {
		a.Log.Error("Failed to create account", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to create account", nil, "")
	}

	return r.SendEnvelope(accountToResponse(account))
}

// GetAccount returns a single WhatsApp account
func (a *App) GetAccount(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	id, err := parsePathUUID(r, "id", "account")
	if err != nil {
		return nil
	}

	account, err := findByIDAndOrg[models.WhatsAppAccount](a.DB, r, id, orgID, "Account")
	if err != nil {
		return nil
	}

	return r.SendEnvelope(accountToResponse(*account))
}

// UpdateAccount updates a WhatsApp account
func (a *App) UpdateAccount(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	id, err := parsePathUUID(r, "id", "account")
	if err != nil {
		return nil
	}

	account, err := findByIDAndOrg[models.WhatsAppAccount](a.DB, r, id, orgID, "Account")
	if err != nil {
		return nil
	}
	a.decryptAccountSecrets(account)

	var req AccountRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}

	// Update fields if provided
	if req.Name != "" {
		account.Name = req.Name
	}
	if req.ClientType != "" {
		account.ClientType = req.ClientType
	}
	if req.AppID != "" {
		account.AppID = req.AppID
	}
	if req.PhoneID != "" {
		account.PhoneID = req.PhoneID
	}
	if req.BusinessID != "" {
		account.BusinessID = req.BusinessID
	}
	if req.AccessToken != "" {
		enc, err := crypto.Encrypt(req.AccessToken, a.Config.App.EncryptionKey)
		if err != nil {
			a.Log.Error("Failed to encrypt access token", "error", err)
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update account", nil, "")
		}
		account.AccessToken = enc
	}
	if req.AppSecret != "" {
		enc, err := crypto.Encrypt(req.AppSecret, a.Config.App.EncryptionKey)
		if err != nil {
			a.Log.Error("Failed to encrypt app secret", "error", err)
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update account", nil, "")
		}
		account.AppSecret = enc
	}
	if req.WebhookVerifyToken != "" {
		account.WebhookVerifyToken = req.WebhookVerifyToken
	}
	if req.APIVersion != "" {
		account.APIVersion = req.APIVersion
	}
	account.AutoReadReceipt = req.AutoReadReceipt

	// Handle default flags
	if req.IsDefaultIncoming && !account.IsDefaultIncoming {
		a.DB.Model(&models.WhatsAppAccount{}).
			Where("organization_id = ? AND is_default_incoming = ?", orgID, true).
			Update("is_default_incoming", false)
	}
	if req.IsDefaultOutgoing && !account.IsDefaultOutgoing {
		a.DB.Model(&models.WhatsAppAccount{}).
			Where("organization_id = ? AND is_default_outgoing = ?", orgID, true).
			Update("is_default_outgoing", false)
	}
	account.IsDefaultIncoming = req.IsDefaultIncoming
	account.IsDefaultOutgoing = req.IsDefaultOutgoing

	if err := a.DB.Save(account).Error; err != nil {
		a.Log.Error("Failed to update account", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update account", nil, "")
	}

	// Invalidate cache
	a.InvalidateWhatsAppAccountCache(account.PhoneID)

	return r.SendEnvelope(accountToResponse(*account))
}

// DeleteAccount deletes a WhatsApp account
func (a *App) DeleteAccount(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	id, err := parsePathUUID(r, "id", "account")
	if err != nil {
		return nil
	}

	// Get account first for cache invalidation
	account, err := findByIDAndOrg[models.WhatsAppAccount](a.DB, r, id, orgID, "Account")
	if err != nil {
		return nil
	}

	if err := a.DB.Delete(account).Error; err != nil {
		a.Log.Error("Failed to delete account", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete account", nil, "")
	}

	// Invalidate cache
	a.InvalidateWhatsAppAccountCache(account.PhoneID)

	return r.SendEnvelope(map[string]string{"message": "Account deleted successfully"})
}

// TestAccountConnection tests the WhatsApp API connection
// This validates both PhoneID and BusinessID to ensure all credentials are correct
func (a *App) TestAccountConnection(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	id, err := parsePathUUID(r, "id", "account")
	if err != nil {
		return nil
	}

	account, err := findByIDAndOrg[models.WhatsAppAccount](a.DB, r, id, orgID, "Account")
	if err != nil {
		return nil
	}
	a.decryptAccountSecrets(account)

	// Use the comprehensive validation function
	if err := a.validateAccountCredentials(account); err != nil {
		a.Log.Error("Account test failed", "error", err, "account", account.Name)
		return r.SendEnvelope(map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("Account credential validation failed: %v", err),
		})
	}

	// For Meta, fetch additional details for display
	if account.ClientType == "meta" || account.ClientType == "" {
		url := fmt.Sprintf("%s/%s/%s?fields=display_phone_number,verified_name,code_verification_status,account_mode,quality_rating,messaging_limit_tier",
			a.Config.WhatsApp.BaseURL, account.APIVersion, account.PhoneID)

		req, _ := http.NewRequest(http.MethodGet, url, nil)
		req.Header.Set("Authorization", "Bearer "+account.AccessToken)

		resp, err := a.HTTPClient.Do(req)
		if err != nil {
			a.Log.Error("Failed to connect to WhatsApp API", "error", err)
			return r.SendEnvelope(map[string]interface{}{
				"success": false,
				"error":   "Failed to connect to WhatsApp API",
			})
		}
		defer func() { _ = resp.Body.Close() }()

		body, _ := io.ReadAll(resp.Body)

		if resp.StatusCode != 200 {
			var errorResp map[string]interface{}
			_ = json.Unmarshal(body, &errorResp)
			return r.SendEnvelope(map[string]interface{}{
				"success": false,
				"error":   "API error",
				"details": errorResp,
			})
		}

		var result map[string]interface{}
		_ = json.Unmarshal(body, &result)

		// Check if this is a test/sandbox number
		accountMode, _ := result["account_mode"].(string)
		isTestNumber := accountMode == "SANDBOX"

		// Prepare response
		response := map[string]interface{}{
			"success":                  true,
			"display_phone_number":     result["display_phone_number"],
			"verified_name":            result["verified_name"],
			"quality_rating":           result["quality_rating"],
			"messaging_limit_tier":     result["messaging_limit_tier"],
			"code_verification_status": result["code_verification_status"],
			"account_mode":             result["account_mode"],
			"is_test_number":           isTestNumber,
		}

		// Add warning for test/sandbox numbers or expired verification
		if isTestNumber {
			response["warning"] = "This is a test/sandbox number. Not suitable for production use."
		} else if verificationStatus, ok := result["code_verification_status"].(string); ok && verificationStatus == "EXPIRED" {
			response["warning"] = "Phone verification has expired. Consider re-verifying at: https://business.facebook.com/wa/manage/phone-numbers/"
		}

		return r.SendEnvelope(response)
	}

	// For other clients (like whatsmeow), simple success is enough for now
	return r.SendEnvelope(map[string]interface{}{
		"success": true,
		"message": "Connection tested successfully",
	})
}

// Helper functions

func accountToResponse(acc models.WhatsAppAccount) AccountResponse {
	return AccountResponse{
		ID:                 acc.ID,
		Name:               acc.Name,
		ClientType:         acc.ClientType,
		AppID:              acc.AppID,
		PhoneID:            acc.PhoneID,
		BusinessID:         acc.BusinessID,
		WebhookVerifyToken: acc.WebhookVerifyToken,
		APIVersion:         acc.APIVersion,
		IsDefaultIncoming:  acc.IsDefaultIncoming,
		IsDefaultOutgoing:  acc.IsDefaultOutgoing,
		AutoReadReceipt:    acc.AutoReadReceipt,
		Status:             acc.Status,
		HasAccessToken:     acc.AccessToken != "",
		HasAppSecret:       acc.AppSecret != "",
		QRCode:             acc.QRCode,
		CreatedAt:          acc.CreatedAt.Format("2006-01-02T15:04:05Z"),
		UpdatedAt:          acc.UpdatedAt.Format("2006-01-02T15:04:05Z"),
	}
}

func generateVerifyToken() string {
	bytes := make([]byte, 32)
	_, _ = rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// validateAccountCredentials validates WhatsApp account credentials
func (a *App) validateAccountCredentials(account *models.WhatsAppAccount) error {
	ctx := context.Background()
	err := a.WhatsApp.ValidateCredentials(ctx, account)
	if err != nil {
		return err
	}
	a.Log.Info("Account credentials validated successfully", "account", account.Name)
	return nil
}

// SubscribeApp subscribes the app to webhooks for the WhatsApp Business Account.
// This is required after phone number registration to receive incoming messages from Meta.
func (a *App) SubscribeApp(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	id, err := parsePathUUID(r, "id", "account")
	if err != nil {
		return nil
	}

	account, err := findByIDAndOrg[models.WhatsAppAccount](a.DB, r, id, orgID, "Account")
	if err != nil {
		return nil
	}
	a.decryptAccountSecrets(account)

	// Subscribe the app to webhooks
	ctx := context.Background()
	if err := a.WhatsApp.SubscribeApp(ctx, account); err != nil {
		a.Log.Error("Failed to subscribe app to webhooks", "error", err, "account", account.Name)
		return r.SendEnvelope(map[string]interface{}{
			"success": false,
			"error":   "Failed to subscribe app to webhooks. Check your credentials.",
		})
	}

	a.Log.Info("App subscribed to webhooks successfully", "account", account.Name, "business_id", account.BusinessID)
	return r.SendEnvelope(map[string]interface{}{
		"success": true,
		"message": "App subscribed to webhooks successfully. You should now receive incoming messages.",
	})
}

// StartWhatsAppSession initiates a whatsmeow session and returns the QR code.
func (a *App) StartWhatsAppSession(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	id, err := parsePathUUID(r, "id", "account")
	if err != nil {
		return nil
	}

	account, err := findByIDAndOrg[models.WhatsAppAccount](a.DB, r, id, orgID, "Account")
	if err != nil {
		return nil
	}

	if account.ClientType != whatsapp.WhatsmeowClientType {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Only whatsmeow accounts can start sessions this way", nil, "")
	}

	// Try to start the session. The QR code will be updated in the DB via the adapter's event handler.
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second) // Allow time for QR generation
	defer cancel()

	if err := a.WhatsApp.StartSession(ctx, account); err != nil {
		a.Log.Error("Failed to start whatsmeow session", "error", err, "account", account.Name)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, fmt.Sprintf("Failed to start WhatsApp session: %v", err), nil, "")
	}

	// Fetch the updated account to get the latest QR code
	updatedAccount, err := findByIDAndOrg[models.WhatsAppAccount](a.DB, r, id, orgID, "Account")
	if err != nil {
		return nil
	}

	return r.SendEnvelope(map[string]interface{}{
		"success": true,
		"message": "WhatsApp session initiated. Scan the QR code.",
		"qr_code": updatedAccount.QRCode,
		"status":  updatedAccount.Status,
	})
}
