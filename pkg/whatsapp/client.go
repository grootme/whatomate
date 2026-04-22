package whatsapp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/zerodha/logf"
)

const (
	// DefaultTimeout for HTTP requests
	DefaultTimeout = 30 * time.Second
	// BaseURL for Meta Graph API
	BaseURL = "https://graph.facebook.com"
)

// Client is the WhatsApp Cloud API client
type Client struct {
	HTTPClient *http.Client
	Log        logf.Logger
	baseURL    string // For testing with mock servers
}

// New creates a new WhatsApp client
func New(log logf.Logger) *Client {
	return &Client{
		HTTPClient: &http.Client{
			Timeout: DefaultTimeout,
		},
		Log:     log,
		baseURL: BaseURL,
	}
}

// NewWithTimeout creates a new WhatsApp client with custom timeout
func NewWithTimeout(log logf.Logger, timeout time.Duration) *Client {
	return &Client{
		HTTPClient: &http.Client{
			Timeout: timeout,
		},
		Log:     log,
		baseURL: BaseURL,
	}
}

// NewWithBaseURL creates a new WhatsApp client with a custom base URL (for testing)
func NewWithBaseURL(log logf.Logger, baseURL string) *Client {
	return &Client{
		HTTPClient: &http.Client{
			Timeout: DefaultTimeout,
		},
		Log:     log,
		baseURL: baseURL,
	}
}

// getBaseURL returns the base URL for API requests
func (c *Client) getBaseURL() string {
	if c.baseURL != "" {
		return c.baseURL
	}
	return BaseURL
}

// doRequest performs an HTTP request to the Meta API
func (c *Client) doRequest(ctx context.Context, method, url string, body interface{}, accessToken string) ([]byte, error) {
	var reqBody io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		reqBody = bytes.NewBuffer(jsonBody)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		var apiErr MetaAPIError
		if err := json.Unmarshal(respBody, &apiErr); err == nil && apiErr.Error.Message != "" {
			errMsg := fmt.Sprintf("API error %d: %s", apiErr.Error.Code, apiErr.Error.Message)
			if apiErr.Error.ErrorData.Details != "" {
				errMsg += " - Details: " + apiErr.Error.ErrorData.Details
			}
			if apiErr.Error.ErrorUserMsg != "" {
				errMsg += " - " + apiErr.Error.ErrorUserMsg
			}
			return nil, fmt.Errorf("%s", errMsg)
		}
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}


// ValidateCredentials validates WhatsApp account credentials with Meta API
func (c *Client) ValidateCredentials(ctx context.Context, phoneID, businessID, accessToken, apiVersion string) (*CredentialsValidationResult, error) {
	phoneURL := fmt.Sprintf("%s/%s/%s?fields=display_phone_number,verified_name,code_verification_status,account_mode,quality_rating",
		c.getBaseURL(), apiVersion, phoneID)
	phoneBody, err := c.doRequest(ctx, http.MethodGet, phoneURL, nil, accessToken)
	if err != nil {
		return nil, fmt.Errorf("invalid phone_id or access_token: %w", err)
	}

	var phoneResult struct {
		DisplayPhoneNumber     string `json:"display_phone_number"`
		VerifiedName           string `json:"verified_name"`
		AccountMode            string `json:"account_mode"`
		CodeVerificationStatus string `json:"code_verification_status"`
		QualityRating          string `json:"quality_rating"`
	}
	if err := json.Unmarshal(phoneBody, &phoneResult); err != nil {
		return nil, fmt.Errorf("failed to parse phone response: %w", err)
	}

	isTestNumber := phoneResult.AccountMode == "SANDBOX"
	var warning string
	if !isTestNumber {
		if phoneResult.CodeVerificationStatus == "NOT_VERIFIED" {
			return nil, fmt.Errorf("phone number is not verified")
		}
		if phoneResult.CodeVerificationStatus == "EXPIRED" {
			warning = "Phone verification has expired"
		}
	}

	businessURL := fmt.Sprintf("%s/%s/%s?fields=id,name", c.getBaseURL(), apiVersion, businessID)
	if _, err := c.doRequest(ctx, http.MethodGet, businessURL, nil, accessToken); err != nil {
		return nil, fmt.Errorf("invalid business_id: %w", err)
	}

	phonesURL := fmt.Sprintf("%s/%s/%s/phone_numbers", c.getBaseURL(), apiVersion, businessID)
	phonesBody, err := c.doRequest(ctx, http.MethodGet, phonesURL, nil, accessToken)
	if err != nil {
		return nil, fmt.Errorf("failed to verify phone-business relationship: %w", err)
	}

	var phonesResult struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(phonesBody, &phonesResult); err != nil {
		return nil, fmt.Errorf("failed to parse phone numbers list: %w", err)
	}

	phoneFound := false
	for _, phone := range phonesResult.Data {
		if phone.ID == phoneID {
			phoneFound = true
			break
		}
	}
	if !phoneFound {
		return nil, fmt.Errorf("phone_id '%s' does not belong to business_id '%s'", phoneID, businessID)
	}

	return &CredentialsValidationResult{
		PhoneNumber:            phoneResult.DisplayPhoneNumber,
		VerifiedName:           phoneResult.VerifiedName,
		AccountMode:            phoneResult.AccountMode,
		IsTestNumber:           isTestNumber,
		QualityRating:          phoneResult.QualityRating,
		CodeVerificationStatus: phoneResult.CodeVerificationStatus,
		Warning:                warning,
	}, nil
}

// buildMessagesURL builds the messages endpoint URL
func (c *Client) buildMessagesURL(account *Account) string {
	return fmt.Sprintf("%s/%s/%s/messages", c.getBaseURL(), account.APIVersion, account.PhoneID)
}

// buildTemplatesURL builds the message_templates endpoint URL
func (c *Client) buildTemplatesURL(account *Account) string {
	return fmt.Sprintf("%s/%s/%s/message_templates", c.getBaseURL(), account.APIVersion, account.BusinessID)
}

// SendTextMessage sends a text message
func (c *Client) SendTextMessage(ctx context.Context, account *Account, recipient, message, replyToMessageID string) (string, error) {
	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"recipient_type":    "individual",
		"to":                recipient,
		"type":              "text",
		"text": map[string]interface{}{
			"body": message,
		},
	}

	if replyToMessageID != "" {
		payload["context"] = map[string]interface{}{
			"message_id": replyToMessageID,
		}
	}

	url := c.buildMessagesURL(account)
	respBody, err := c.doRequest(ctx, "POST", url, payload, account.AccessToken)
	if err != nil {
		return "", err
	}

	var resp MetaAPIResponse
	if err := json.Unmarshal(respBody, &resp); err != nil {
		return "", err
	}

	if len(resp.Messages) == 0 {
		return "", fmt.Errorf("no message ID in response")
	}

	return resp.Messages[0].ID, nil
}

// GetMediaURL retrieves the download URL for a media file
func (c *Client) GetMediaURL(ctx context.Context, mediaID string, account *Account) (string, error) {
	url := fmt.Sprintf("%s/%s/%s", c.getBaseURL(), account.APIVersion, mediaID)
	respBody, err := c.doRequest(ctx, http.MethodGet, url, nil, account.AccessToken)
	if err != nil {
		return "", err
	}

	var mediaResp MediaURLResponse
	if err := json.Unmarshal(respBody, &mediaResp); err != nil {
		return "", err
	}

	return mediaResp.URL, nil
}

// DownloadMedia downloads media content
func (c *Client) DownloadMedia(ctx context.Context, mediaURL string, accessToken string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, mediaURL, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("media download failed with status %d", resp.StatusCode)
	}

	return io.ReadAll(resp.Body)
}

// UploadMedia uploads media and returns the media ID
func (c *Client) UploadMedia(ctx context.Context, account *Account, data []byte, mimeType, filename string) (string, error) {
	url := fmt.Sprintf("%s/%s/%s/media", c.getBaseURL(), account.APIVersion, account.PhoneID)

	body := &bytes.Buffer{}
	boundary := "----WebKitFormBoundary7MA4YWxkTrZu0gW"
	fmt.Fprintf(body, "--%s\r\n", boundary)
	body.WriteString("Content-Disposition: form-data; name=\"messaging_product\"\r\n\r\nwhatsapp\r\n")
	fmt.Fprintf(body, "--%s\r\n", boundary)
	fmt.Fprintf(body, "Content-Disposition: form-data; name=\"file\"; filename=\"%s\"\r\n", filename)
	fmt.Fprintf(body, "Content-Type: %s\r\n\r\n", mimeType)
	body.Write(data)
	body.WriteString("\r\n")
	fmt.Fprintf(body, "--%s--\r\n", boundary)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, body)
	if err != nil {
		return "", err
	}

	req.Header.Set("Authorization", "Bearer "+account.AccessToken)
	req.Header.Set("Content-Type", "multipart/form-data; boundary="+boundary)

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var uploadResp UploadMediaResponse
	if err := json.Unmarshal(respBody, &uploadResp); err != nil {
		return "", err
	}

	return uploadResp.ID, nil
}

// SendImageMessage sends an image message
func (c *Client) SendImageMessage(ctx context.Context, account *Account, phoneNumber, mediaID, caption string) (string, error) {
	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"to":                phoneNumber,
		"type":              "image",
		"image": map[string]interface{}{
			"id":      mediaID,
			"caption": caption,
		},
	}
	return c.sendMessage(ctx, account, payload)
}

// SendDocumentMessage sends a document message
func (c *Client) SendDocumentMessage(ctx context.Context, account *Account, phoneNumber, mediaID, filename, caption string) (string, error) {
	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"to":                phoneNumber,
		"type":              "document",
		"document": map[string]interface{}{
			"id":       mediaID,
			"filename": filename,
			"caption":  caption,
		},
	}
	return c.sendMessage(ctx, account, payload)
}

// SendVideoMessage sends a video message
func (c *Client) SendVideoMessage(ctx context.Context, account *Account, phoneNumber, mediaID, caption string) (string, error) {
	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"to":                phoneNumber,
		"type":              "video",
		"video": map[string]interface{}{
			"id":      mediaID,
			"caption": caption,
		},
	}
	return c.sendMessage(ctx, account, payload)
}

// SendAudioMessage sends an audio message
func (c *Client) SendAudioMessage(ctx context.Context, account *Account, phoneNumber, mediaID string) (string, error) {
	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"to":                phoneNumber,
		"type":              "audio",
		"audio": map[string]interface{}{
			"id": mediaID,
		},
	}
	return c.sendMessage(ctx, account, payload)
}

// SendReaction sends a reaction
func (c *Client) SendReaction(ctx context.Context, account *Account, recipient, messageID, reaction string) (string, error) {
	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"recipient_type":    "individual",
		"to":                recipient,
		"type":              "reaction",
		"reaction": map[string]interface{}{
			"message_id": messageID,
			"emoji":      reaction,
		},
	}
	return c.sendMessage(ctx, account, payload)
}

// SendStickerMessage sends a sticker message
func (c *Client) SendStickerMessage(ctx context.Context, account *Account, recipient, mediaID string) (string, error) {
	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"to":                recipient,
		"type":              "sticker",
		"sticker": map[string]interface{}{
			"id": mediaID,
		},
	}
	return c.sendMessage(ctx, account, payload)
}

// SendInteractiveButtons sends interactive buttons
func (c *Client) SendInteractiveButtons(ctx context.Context, account *Account, recipient, bodyText string, buttons []Button) (string, error) {
	waButtons := make([]map[string]interface{}, len(buttons))
	for i, b := range buttons {
		waButtons[i] = map[string]interface{}{
			"type": "reply",
			"reply": map[string]interface{}{
				"id":    b.ID,
				"title": b.Title,
			},
		}
	}

	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"to":                recipient,
		"type":              "interactive",
		"interactive": map[string]interface{}{
			"type": "button",
			"body": map[string]interface{}{
				"text": bodyText,
			},
			"action": map[string]interface{}{
				"buttons": waButtons,
			},
		},
	}
	return c.sendMessage(ctx, account, payload)
}

// SendCTAURLButton sends a CTA URL button
func (c *Client) SendCTAURLButton(ctx context.Context, account *Account, recipient, bodyText, buttonText, url string) (string, error) {
	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"to":                recipient,
		"type":              "interactive",
		"interactive": map[string]interface{}{
			"type": "cta_url",
			"body": map[string]interface{}{
				"text": bodyText,
			},
			"action": map[string]interface{}{
				"name": "cta_url",
				"parameters": map[string]interface{}{
					"display_text": buttonText,
					"url":          url,
				},
			},
		},
	}
	return c.sendMessage(ctx, account, payload)
}

// SendTemplateMessage sends a template message
func (c *Client) SendTemplateMessage(ctx context.Context, account *Account, recipient, templateName, language string, params map[string]string) (string, error) {
	components := []map[string]interface{}{}
	if len(params) > 0 {
		parameters := []map[string]interface{}{}
		for _, v := range params {
			parameters = append(parameters, map[string]interface{}{
				"type": "text",
				"text": v,
			})
		}
		components = append(components, map[string]interface{}{
			"type":       "body",
			"parameters": parameters,
		})
	}

	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"to":                recipient,
		"type":              "template",
		"template": map[string]interface{}{
			"name": templateName,
			"language": map[string]interface{}{
				"code": language,
			},
			"components": components,
		},
	}
	return c.sendMessage(ctx, account, payload)
}

// SendFlowMessage sends a flow message
func (c *Client) SendFlowMessage(ctx context.Context, account *Account, recipient, flowID, flowHeader, bodyText, ctaButtonText, flowToken, flowFirstScreen string) (string, error) {
	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"to":                recipient,
		"type":              "interactive",
		"interactive": map[string]interface{}{
			"type": "nfm_reply",
			"header": map[string]interface{}{
				"type": "text",
				"text": flowHeader,
			},
			"body": map[string]interface{}{
				"text": bodyText,
			},
			"action": map[string]interface{}{
				"name": "flow",
				"parameters": map[string]interface{}{
					"flow_message_version": "3",
					"flow_token":           flowToken,
					"flow_id":              flowID,
					"flow_cta":             ctaButtonText,
					"flow_action":          "navigate",
					"flow_action_payload": map[string]interface{}{
						"screen": flowFirstScreen,
					},
				},
			},
		},
	}
	return c.sendMessage(ctx, account, payload)
}

// MarkMessageRead sends a read receipt
func (c *Client) MarkMessageRead(ctx context.Context, account *Account, messageID string) error {
	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"status":            "read",
		"message_id":        messageID,
	}
	_, err := c.doRequest(ctx, "POST", c.buildMessagesURL(account), payload, account.AccessToken)
	return err
}

// ResumableUpload performs a resumable upload
func (c *Client) ResumableUpload(ctx context.Context, account *Account, data []byte, mimeType, filename string) (string, error) {
	sessionURL := fmt.Sprintf("%s/%s/%s/uploads", c.getBaseURL(), account.APIVersion, account.AppID)
	sessionPayload := map[string]interface{}{
		"file_length": len(data),
		"file_type":   mimeType,
		"file_name":   filename,
	}

	sessionResp, err := c.doRequest(ctx, http.MethodPost, sessionURL, sessionPayload, account.AccessToken)
	if err != nil {
		return "", err
	}

	var uploadSession ResumableUploadResponse
	json.Unmarshal(sessionResp, &uploadSession)

	uploadURL := fmt.Sprintf("%s/%s/%s", c.getBaseURL(), account.APIVersion, uploadSession.ID)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, uploadURL, bytes.NewReader(data))
	req.Header.Set("Authorization", "OAuth "+account.AccessToken)
	req.Header.Set("file_offset", "0")
	req.Header.Set("Content-Type", "application/octet-stream")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var finishResp ResumableUploadFinishResponse
	json.Unmarshal(respBody, &finishResp)

	return finishResp.Handle, nil
}

// GetBusinessProfile retrieves the business profile
func (c *Client) GetBusinessProfile(ctx context.Context, account *Account) (*BusinessProfile, error) {
	fields := "about,address,description,email,profile_picture_url,websites,vertical,messaging_product"
	url := fmt.Sprintf("%s/%s/%s/whatsapp_business_profile?fields=%s", c.getBaseURL(), account.APIVersion, account.PhoneID, fields)
	respBody, err := c.doRequest(ctx, http.MethodGet, url, nil, account.AccessToken)
	if err != nil {
		return nil, err
	}

	var response BusinessProfileResponse
	json.Unmarshal(respBody, &response)
	if len(response.Data) == 0 {
		return nil, fmt.Errorf("no profile found")
	}
	return &response.Data[0], nil
}

// UpdateBusinessProfile updates the business profile
func (c *Client) UpdateBusinessProfile(ctx context.Context, account *Account, input BusinessProfileInput) error {
	url := fmt.Sprintf("%s/%s/%s/whatsapp_business_profile", c.getBaseURL(), account.APIVersion, account.PhoneID)
	input.MessagingProduct = "whatsapp"
	_, err := c.doRequest(ctx, http.MethodPost, url, input, account.AccessToken)
	return err
}

// UploadProfilePicture uploads a profile picture
func (c *Client) UploadProfilePicture(ctx context.Context, account *Account, data []byte, mimeType string) (string, error) {
	handle, err := c.ResumableUpload(ctx, account, data, mimeType, "profile_picture")
	if err != nil {
		return "", err
	}

	input := BusinessProfileInput{
		MessagingProduct:     "whatsapp",
		ProfilePictureHandle: handle,
	}
	err = c.UpdateBusinessProfile(ctx, account, input)
	return handle, err
}

// SubscribeApp subscribes the app to webhooks
func (c *Client) SubscribeApp(ctx context.Context, account *Account) error {
	url := fmt.Sprintf("%s/%s/%s/subscribed_apps", c.getBaseURL(), account.APIVersion, account.BusinessID)
	respBody, err := c.doRequest(ctx, http.MethodPost, url, nil, account.AccessToken)
	if err != nil {
		return err
	}

	var resp SubscribeAppResponse
	json.Unmarshal(respBody, &resp)
	if !resp.Success {
		return fmt.Errorf("subscription failed")
	}
	return nil
}

func (c *Client) sendMessage(ctx context.Context, account *Account, payload interface{}) (string, error) {
	respBody, err := c.doRequest(ctx, "POST", c.buildMessagesURL(account), payload, account.AccessToken)
	if err != nil {
		return "", err
	}

	var resp MetaAPIResponse
	json.Unmarshal(respBody, &resp)
	if len(resp.Messages) == 0 {
		return "", fmt.Errorf("no message ID in response")
	}
	return resp.Messages[0].ID, nil
}
