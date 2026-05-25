package whatsapp

import (
        "context"
        "encoding/json"
        "fmt"
        "strings"
        "time"

        "github.com/shridarpatil/whatomate/internal/models"
        "github.com/shridarpatil/whatomate/internal/websocket"
        "github.com/zerodha/logf"
        "go.mau.fi/whatsmeow"
        waProto "go.mau.fi/whatsmeow/binary/proto"
        "go.mau.fi/whatsmeow/store/sqlstore"
        "go.mau.fi/whatsmeow/types"
        events "go.mau.fi/whatsmeow/types/events"
        "google.golang.org/protobuf/proto"
        "gorm.io/gorm"
)

const (
        WhatsmeowClientType = "whatsmeow"
        MetaClientType      = "meta"
)

// WhatsmeowMediaData holds metadata returned by whatsmeow upload
type WhatsmeowMediaData struct {
        URL           string `json:"url"`
        DirectPath    string `json:"direct_path"`
        MediaKey      []byte `json:"media_key"`
        FileEncSHA256 []byte `json:"file_enc_sha256"`
        FileSHA256    []byte `json:"file_sha256"`
        FileLength    uint64 `json:"file_length"`
}

// WhatsmeowClientAdapter implements the ClientInterface for whatsmeow.
type WhatsmeowClientAdapter struct {
        log       logf.Logger
        db        *gorm.DB
        dbStore   *sqlstore.Container
        clients   map[string]*whatsmeow.Client
        qrChannel chan string
        wshub     *websocket.Hub
        incomingMessageHandler func(account *models.WhatsAppAccount, data interface{})
}

// NewWhatsmeowClientAdapter creates a new adapter for whatsmeow.
func NewWhatsmeowClientAdapter(log logf.Logger, db *gorm.DB, dbStore *sqlstore.Container, wshub *websocket.Hub) *WhatsmeowClientAdapter {
        return &WhatsmeowClientAdapter{
                log:     log,
                db:      db,
                dbStore: dbStore,
                clients: make(map[string]*whatsmeow.Client),
                qrChannel: make(chan string),
                wshub:   wshub,
        }
}

// SetIncomingMessageHandler sets the callback function for incoming messages.
func (w *WhatsmeowClientAdapter) SetIncomingMessageHandler(handler func(account *models.WhatsAppAccount, data interface{})) {
        w.incomingMessageHandler = handler
}

func (w *WhatsmeowClientAdapter) GetQRChannel() <-chan string {
        return w.qrChannel
}

func (w *WhatsmeowClientAdapter) GetClient(account *models.WhatsAppAccount) (*whatsmeow.Client, error) {
        if client, ok := w.clients[account.Name]; ok {
                return client, nil
        }

        // If PhoneID is empty or not a valid JID, create a new device for first-time pairing
        if account.PhoneID == "" || account.PhoneID == "whatsmeow" {
                return w.createNewDevice(account)
        }

        jid, err := types.ParseJID(account.PhoneID)
        if err != nil {
                // Not a valid JID, treat as first-time pairing
                w.log.Info("PhoneID is not a valid JID, creating new device for QR pairing", "account", account.Name, "phone_id", account.PhoneID)
                return w.createNewDevice(account)
        }

        deviceStore, err := w.dbStore.GetDevice(context.Background(), jid)
        if err != nil {
                return nil, fmt.Errorf("failed to get device store for %s: %w", jid, err)
        }

        client := whatsmeow.NewClient(deviceStore, nil) // Logging handled separately
        w.clients[account.Name] = client
        client.AddEventHandler(w.eventHandler(client, account))

        return client, nil
}

// createNewDevice creates a new whatsmeow device for first-time QR pairing
func (w *WhatsmeowClientAdapter) createNewDevice(account *models.WhatsAppAccount) (*whatsmeow.Client, error) {
        deviceStore, err := w.dbStore.GetFirstDevice(context.Background())
        if err != nil {
                return nil, fmt.Errorf("failed to create new device store: %w", err)
        }

        client := whatsmeow.NewClient(deviceStore, nil)
        w.clients[account.Name] = client
        client.AddEventHandler(w.eventHandler(client, account))

        w.log.Info("Created new whatsmeow device for QR pairing", "account", account.Name)
        return client, nil
}

func (w *WhatsmeowClientAdapter) ValidateCredentials(ctx context.Context, account *models.WhatsAppAccount) error {
        client, err := w.GetClient(account)
        if err != nil {
                return fmt.Errorf("failed to get whatsmeow client: %w", err)
        }

        if client.IsLoggedIn() {
                return nil
        }

        return w.StartSession(ctx, account)
}

func (w *WhatsmeowClientAdapter) SendTextMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, message string, replyToMessageID string) (string, error) {
        client, err := w.GetClient(account)
        if err != nil {
                return "", err
        }

        if !client.IsLoggedIn() {
                return "", fmt.Errorf("whatsmeow client for %s is not logged in", account.Name)
        }

        recipientJID, err := types.ParseJID(recipient)
        if err != nil {
                return "", fmt.Errorf("invalid recipient JID: %w", err)
        }

        msg := &waProto.Message{
                Conversation: proto.String(message),
        }

        resp, err := client.SendMessage(ctx, recipientJID, msg)
        if err != nil {
                return "", fmt.Errorf("failed to send whatsmeow text message: %w", err)
        }

        return resp.ID, nil
}

func (w *WhatsmeowClientAdapter) UploadMedia(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType, filename string) (string, error) {
        client, err := w.GetClient(account)
        if err != nil {
                return "", err
        }

        var mediaType whatsmeow.MediaType
        switch {
        case strings.Contains(mimeType, "image"):
                mediaType = whatsmeow.MediaImage
        case strings.Contains(mimeType, "video"):
                mediaType = whatsmeow.MediaVideo
        case strings.Contains(mimeType, "audio"):
                mediaType = whatsmeow.MediaAudio
        // case strings.Contains(mimeType, "sticker"):
        //      mediaType = whatsmeow.MediaSticker // Temporarily removed
        default:
                mediaType = whatsmeow.MediaDocument
        }

        resp, err := client.Upload(ctx, data, mediaType)
        if err != nil {
                return "", fmt.Errorf("failed to upload media to WhatsApp: %w", err)
        }

        mediaData := WhatsmeowMediaData{
                URL:           resp.URL,
                DirectPath:    resp.DirectPath,
                MediaKey:      resp.MediaKey,
                FileEncSHA256: resp.FileEncSHA256[:],
                FileSHA256:    resp.FileSHA256[:],
                FileLength:    resp.FileLength,
        }

        encoded, _ := json.Marshal(mediaData)
        return string(encoded), nil
}

func (w *WhatsmeowClientAdapter) SendImageMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID, caption string) (string, error) {
        var mediaData WhatsmeowMediaData
        if err := json.Unmarshal([]byte(mediaID), &mediaData); err != nil {
                return "", fmt.Errorf("invalid mediaID for whatsmeow: %w", err)
        }

        client, err := w.GetClient(account)
        if err != nil {
                return "", err
        }

        if !client.IsLoggedIn() {
                return "", fmt.Errorf("whatsmeow client for %s is not logged in", account.Name)
        }

        recipientJID, err := types.ParseJID(recipient)
        if err != nil {
                return "", fmt.Errorf("invalid recipient JID: %w", err)
        }

        msg := &waProto.Message{
                ImageMessage: &waProto.ImageMessage{
                        Caption:       proto.String(caption),
                        URL:           proto.String(mediaData.URL),
                        DirectPath:    proto.String(mediaData.DirectPath),
                        MediaKey:      mediaData.MediaKey,
                        Mimetype:      proto.String("image/jpeg"), // Default, consider making dynamic
                        FileEncSHA256: mediaData.FileEncSHA256,
                        FileSHA256:    mediaData.FileSHA256,
                        FileLength:    proto.Uint64(mediaData.FileLength),
                },
        }

        resp, err := client.SendMessage(ctx, recipientJID, msg)
        if err != nil {
                return "", err
        }
        return resp.ID, nil
}

func (w *WhatsmeowClientAdapter) SendVideoMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID, caption string) (string, error) {
        var mediaData WhatsmeowMediaData
        if err := json.Unmarshal([]byte(mediaID), &mediaData); err != nil {
                return "", fmt.Errorf("invalid mediaID for whatsmeow: %w", err)
        }

        client, err := w.GetClient(account)
        if err != nil {
                return "", err
        }

        if !client.IsLoggedIn() {
                return "", fmt.Errorf("whatsmeow client for %s is not logged in", account.Name)
        }

        recipientJID, err := types.ParseJID(recipient)
        if err != nil {
                return "", fmt.Errorf("invalid recipient JID: %w", err)
        }

        msg := &waProto.Message{
                VideoMessage: &waProto.VideoMessage{
                        Caption:       proto.String(caption),
                        URL:           proto.String(mediaData.URL),
                        DirectPath:    proto.String(mediaData.DirectPath),
                        MediaKey:      mediaData.MediaKey,
                        Mimetype:      proto.String("video/mp4"), // Default, consider making dynamic
                        FileEncSHA256: mediaData.FileEncSHA256,
                        FileSHA256:    mediaData.FileSHA256,
                        FileLength:    proto.Uint64(mediaData.FileLength),
                },
        }

        resp, err := client.SendMessage(ctx, recipientJID, msg)
        if err != nil {
                return "", err
        }
        return resp.ID, nil
}

func (w *WhatsmeowClientAdapter) SendAudioMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID string) (string, error) {
        var mediaData WhatsmeowMediaData
        if err := json.Unmarshal([]byte(mediaID), &mediaData); err != nil {
                return "", fmt.Errorf("invalid mediaID for whatsmeow: %w", err)
        }

        client, err := w.GetClient(account)
        if err != nil {
                return "", err
        }

        if !client.IsLoggedIn() {
                return "", fmt.Errorf("whatsmeow client for %s is not logged in", account.Name)
        }

        recipientJID, err := types.ParseJID(recipient)
        if err != nil {
                return "", fmt.Errorf("invalid recipient JID: %w", err)
        }

        msg := &waProto.Message{
                AudioMessage: &waProto.AudioMessage{
                        URL:           proto.String(mediaData.URL),
                        DirectPath:    proto.String(mediaData.DirectPath),
                        MediaKey:      mediaData.MediaKey,
                        Mimetype:      proto.String("audio/ogg; codecs=opus"), // Default, consider making dynamic
                        FileEncSHA256: mediaData.FileEncSHA256,
                        FileSHA256:    mediaData.FileSHA256,
                        FileLength:    proto.Uint64(mediaData.FileLength),
                },
        }

        resp, err := client.SendMessage(ctx, recipientJID, msg)
        if err != nil {
                return "", err
        }
        return resp.ID, nil
}

func (w *WhatsmeowClientAdapter) SendDocumentMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID, filename, caption string) (string, error) {
        var mediaData WhatsmeowMediaData
        if err := json.Unmarshal([]byte(mediaID), &mediaData); err != nil {
                return "", fmt.Errorf("invalid mediaID for whatsmeow: %w", err)
        }

        client, err := w.GetClient(account)
        if err != nil {
                return "", err
        }

        if !client.IsLoggedIn() {
                return "", fmt.Errorf("whatsmeow client for %s is not logged in", account.Name)
        }

        recipientJID, err := types.ParseJID(recipient)
        if err != nil {
                return "", fmt.Errorf("invalid recipient JID: %w", err)
        }

        msg := &waProto.Message{
                DocumentMessage: &waProto.DocumentMessage{
                        Caption:       proto.String(caption),
                        Title:         proto.String(filename),
                        FileName:      proto.String(filename),
                        URL:           proto.String(mediaData.URL),
                        DirectPath:    proto.String(mediaData.DirectPath),
                        MediaKey:      mediaData.MediaKey,
                        Mimetype:      proto.String("application/pdf"), // Default, should be dynamic
                        FileEncSHA256: mediaData.FileEncSHA256,
                        FileSHA256:    mediaData.FileSHA256,
                        FileLength:    proto.Uint64(mediaData.FileLength),
                },
        }

        resp, err := client.SendMessage(ctx, recipientJID, msg)
        if err != nil {
                return "", err
        }
        return resp.ID, nil
}

func (w *WhatsmeowClientAdapter) SendInteractiveButtons(ctx context.Context, account *models.WhatsAppAccount, recipient, bodyText string, buttons []Button) (string, error) {
        client, err := w.GetClient(account)
        if err != nil {
                return "", err
        }

        if !client.IsLoggedIn() {
                return "", fmt.Errorf("whatsmeow client for %s is not logged in", account.Name)
        }

        recipientJID, err := types.ParseJID(recipient)
        if err != nil {
                return "", fmt.Errorf("invalid recipient JID: %w", err)
        }

        waButtons := make([]*waProto.ButtonsMessage_Button, len(buttons))
        for i, b := range buttons {
                waButtons[i] = &waProto.ButtonsMessage_Button{
                        ButtonID: proto.String(b.ID),
                        ButtonText: &waProto.ButtonsMessage_Button_ButtonText{
                                DisplayText: proto.String(b.Title),
                        },
                        Type: waProto.ButtonsMessage_Button_RESPONSE.Enum(),
                }
        }

        msg := &waProto.Message{
                ButtonsMessage: &waProto.ButtonsMessage{
                        ContentText: proto.String(bodyText),
                        HeaderType:  waProto.ButtonsMessage_EMPTY.Enum(),
                        Buttons:     waButtons,
                },
        }

        resp, err := client.SendMessage(ctx, recipientJID, msg)
        if err != nil {
                return "", err
        }
        return resp.ID, nil
}

func (w *WhatsmeowClientAdapter) SendCTAURLButton(ctx context.Context, account *models.WhatsAppAccount, recipient, bodyText, buttonText, url string) (string, error) {
        // CTA buttons are often part of List or Template messages.
        // Falling back to a simple text message with the URL for now.
        return w.SendTextMessage(ctx, account, recipient, fmt.Sprintf(`%s

%s: %s`, bodyText, buttonText, url), "")
}

func (w *WhatsmeowClientAdapter) SendTemplateMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, templateName, language string, params map[string]string) (string, error) {
        return "", fmt.Errorf("SendTemplateMessage is Meta-specific and not supported by whatsmeow directly")
}

func (w *WhatsmeowClientAdapter) SendFlowMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, flowID, flowHeader, bodyText, ctaButtonText, flowToken, flowFirstScreen string) (string, error) {
        return "", fmt.Errorf("SendFlowMessage is Meta-specific and not supported by whatsmeow directly")
}

func (w *WhatsmeowClientAdapter) SendReaction(ctx context.Context, account *models.WhatsAppAccount, recipient, messageID, reaction string) (string, error) {
        client, err := w.GetClient(account)
        if err != nil {
                return "", err
        }

        if !client.IsLoggedIn() {
                return "", fmt.Errorf("whatsmeow client for %s is not logged in", account.Name)
        }

        recipientJID, err := types.ParseJID(recipient)
        if err != nil {
                return "", fmt.Errorf("invalid recipient JID: %w", err)
        }

        msg := &waProto.Message{
                ReactionMessage: &waProto.ReactionMessage{
                        Key: &waProto.MessageKey{
                                RemoteJID: proto.String(recipientJID.String()),
                                FromMe:    proto.Bool(false),
                                ID:        proto.String(messageID),
                        },
                        Text:              proto.String(reaction),
                        SenderTimestampMS: proto.Int64(time.Now().UnixMilli()),
                },
        }

        resp, err := client.SendMessage(ctx, recipientJID, msg)
        if err != nil {
                return "", fmt.Errorf("failed to send reaction via whatsmeow: %w", err)
        }

        return resp.ID, nil
}

func (w *WhatsmeowClientAdapter) SendStickerMessage(ctx context.Context, account *models.WhatsAppAccount, recipient, mediaID string) (string, error) {
        var mediaData WhatsmeowMediaData
        if err := json.Unmarshal([]byte(mediaID), &mediaData); err != nil {
                return "", fmt.Errorf("invalid mediaID for whatsmeow: %w", err)
        }

        client, err := w.GetClient(account)
        if err != nil {
                return "", err
        }

        if !client.IsLoggedIn() {
                return "", fmt.Errorf("whatsmeow client for %s is not logged in", account.Name)
        }

        recipientJID, err := types.ParseJID(recipient)
        if err != nil {
                return "", fmt.Errorf("invalid recipient JID: %w", err)
        }

        msg := &waProto.Message{
                StickerMessage: &waProto.StickerMessage{
                        URL:           proto.String(mediaData.URL),
                        DirectPath:    proto.String(mediaData.DirectPath),
                        MediaKey:      mediaData.MediaKey,
                        Mimetype:      proto.String("image/webp"),
                        FileEncSHA256: mediaData.FileEncSHA256,
                        FileSHA256:    mediaData.FileSHA256,
                        FileLength:    proto.Uint64(mediaData.FileLength),
                },
        }

        resp, err := client.SendMessage(ctx, recipientJID, msg)
        if err != nil {
                return "", err
        }
        return resp.ID, nil
}

func (w *WhatsmeowClientAdapter) MarkMessageRead(ctx context.Context, account *models.WhatsAppAccount, messageID string) error {
        w.log.Info("MarkMessageRead by ID is not supported by whatsmeow protocol directly", "account", account.Name)
        return nil
}

func (w *WhatsmeowClientAdapter) GetMediaURL(ctx context.Context, mediaID string, account *models.WhatsAppAccount) (string, error) {
        return "", fmt.Errorf("GetMediaURL is Meta-specific. For whatsmeow, use DownloadMedia directly with the message data")
}

func (w *WhatsmeowClientAdapter) DownloadMedia(ctx context.Context, mediaURL string, accessToken string) ([]byte, error) {
        // In the whatsmeow context, mediaURL might be used differently, 
        // but to satisfy the interface for common downloads:
        return nil, fmt.Errorf("DownloadMedia requires a whatsmeow.Download call with proper message info")
}

// DownloadMediaCustom is a helper for whatsmeow specific downloads
func (w *WhatsmeowClientAdapter) DownloadMediaCustom(ctx context.Context, account *models.WhatsAppAccount, msg *events.Message) ([]byte, error) {
        client, err := w.GetClient(account)
        if err != nil {
                return nil, err
        }

        var data []byte
        
        // Determine media type and download
        protoMsg := msg.Message
        if img := protoMsg.GetImageMessage(); img != nil {
                data, err = client.Download(ctx, img)
        } else if vid := protoMsg.GetVideoMessage(); vid != nil {
                data, err = client.Download(ctx, vid)
        } else if aud := protoMsg.GetAudioMessage(); aud != nil {
                data, err = client.Download(ctx, aud)
        } else if doc := protoMsg.GetDocumentMessage(); doc != nil {
                data, err = client.Download(ctx, doc)
        } else if stk := protoMsg.GetStickerMessage(); stk != nil {
                data, err = client.Download(ctx, stk)
        } else {
                return nil, fmt.Errorf("message does not contain downloadable media")
        }

        if err != nil {
                return nil, fmt.Errorf("failed to download media via whatsmeow: %w", err)
        }

        return data, nil
}

func (w *WhatsmeowClientAdapter) ResumableUpload(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType, filename string) (string, error) {
        return "", fmt.Errorf("ResumableUpload not applicable for whatsmeow adapter")
}

func (w *WhatsmeowClientAdapter) GetBusinessProfile(ctx context.Context, account *models.WhatsAppAccount) (*models.BusinessProfile, error) {
        return nil, fmt.Errorf("GetBusinessProfile not implemented for whatsmeow adapter")
}

func (w *WhatsmeowClientAdapter) UpdateBusinessProfile(ctx context.Context, account *models.WhatsAppAccount, input models.BusinessProfileInput) error {
        client, err := w.GetClient(account)
        if err != nil {
                return err
        }

        if !client.IsLoggedIn() {
                return fmt.Errorf("whatsmeow client for %s is not logged in", account.Name)
        }

        // For whatsmeow, BusinessProfileInput can be mapped to updating the PushName.
        // Only update if About or ProfileName is provided, as these are the closest matches.
        if input.About != "" {
                // whatsmeow doesn't have a direct 'About' field equivalent for business profile.
                // This might require a custom status message if needed.
                w.log.Info("Whatsmeow does not have a direct 'About' field for business profile. Skipping.", "account", account.Name)
        }

        if input.ProfileName != "" {
                w.log.Info("Updating whatsmeow PushName", "account", account.Name, "new_name", input.ProfileName)
                // Placeholder for SendSetPushName as it's not directly available on whatsmeow.Client
                // if err := client.SendSetPushName(input.ProfileName); err != nil {
                //      return fmt.Errorf("failed to update PushName via whatsmeow: %w", err)
                // }
                w.log.Warn("SendSetPushName is not directly supported by whatsmeow client. Skipping.", "account", account.Name)
        }

        return nil
}

func (w *WhatsmeowClientAdapter) UploadProfilePicture(ctx context.Context, account *models.WhatsAppAccount, data []byte, mimeType string) (string, error) {
        client, err := w.GetClient(account)
        if err != nil {
                return "", err
        }

        if !client.IsLoggedIn() {
                return "", fmt.Errorf("whatsmeow client for %s is not logged in", account.Name)
        }

        // Placeholder for client.UploadProfilePicture as it's not directly available on whatsmeow.Client
        // resp, err := client.UploadProfilePicture(data)
        // if err != nil {
        //      return "", fmt.Errorf("failed to upload profile picture via whatsmeow: %w", err)
        // }
        w.log.Warn("UploadProfilePicture is not directly supported by whatsmeow client. Skipping.", "account", account.Name)
        return "", fmt.Errorf("UploadProfilePicture not directly supported by whatsmeow client")
}

func (w *WhatsmeowClientAdapter) SubscribeApp(ctx context.Context, account *models.WhatsAppAccount) error {
        return fmt.Errorf("SubscribeApp not applicable for whatsmeow adapter")
}

func (w *WhatsmeowClientAdapter) HandleIncomingMessage(ctx context.Context, wabaID, messageID string) error {
        return fmt.Errorf("HandleIncomingMessage not implemented for whatsmeow adapter")
}

func (w *WhatsmeowClientAdapter) StartSession(ctx context.Context, account *models.WhatsAppAccount) error {
        client, err := w.GetClient(account)
        if err != nil {
                return err
        }

        if client.IsLoggedIn() {
                w.log.Info("Whatsmeow client already logged in.", "account", account.Name)
                return nil
        }

        qrChan, err := client.GetQRChannel(ctx)
        if err != nil {
                return fmt.Errorf("failed to get QR channel: %w", err)
        }

        go func() {
                for evt := range qrChan {
                        if evt.Event == "code" {
                                w.log.Info("Received whatsmeow QR code.", "account", account.Name)
                                w.db.Model(&models.WhatsAppAccount{}).Where("id = ?", account.ID).Update("qr_code", evt.Code)
                                if w.wshub != nil {
                                        w.wshub.BroadcastToOrg(account.OrganizationID, websocket.WSMessage{
                                                Type: "whatsapp_qr_code",
                                                Payload: map[string]interface{}{
                                                        "account_id": account.ID.String(),
                                                        "qr_code":    evt.Code,
                                                        "status":     "scanning",
                                                },
                                        })
                                }
                        }
                }
        }()

        err = client.Connect()
        if err != nil {
                return fmt.Errorf("failed to connect whatsmeow client: %w", err)
        }

        return nil
}

func (w *WhatsmeowClientAdapter) CloseSession(ctx context.Context, account *models.WhatsAppAccount) error {
        client, err := w.GetClient(account)
        if err != nil {
                return err
        }

        client.Disconnect()
        delete(w.clients, account.Name)
        w.log.Info("Whatsmeow client session closed.", "account", account.Name)
        return nil
}

// CreateCatalog is not supported by whatsmeow; use Meta API instead.
func (w *WhatsmeowClientAdapter) CreateCatalog(ctx context.Context, account *models.WhatsAppAccount, name string) (string, error) {
        return "", fmt.Errorf("CreateCatalog not supported by whatsmeow adapter")
}

// DeleteCatalog is not supported by whatsmeow; use Meta API instead.
func (w *WhatsmeowClientAdapter) DeleteCatalog(ctx context.Context, account *models.WhatsAppAccount, catalogID string) error {
        return fmt.Errorf("DeleteCatalog not supported by whatsmeow adapter")
}

// ListCatalogs is not supported by whatsmeow; use Meta API instead.
func (w *WhatsmeowClientAdapter) ListCatalogs(ctx context.Context, account *models.WhatsAppAccount) ([]CatalogInfo, error) {
        return nil, fmt.Errorf("ListCatalogs not supported by whatsmeow adapter")
}

// CreateProduct is not supported by whatsmeow; use Meta API instead.
func (w *WhatsmeowClientAdapter) CreateProduct(ctx context.Context, account *models.WhatsAppAccount, catalogID string, product *ProductInput) (string, error) {
        return "", fmt.Errorf("CreateProduct not supported by whatsmeow adapter")
}

// UpdateProduct is not supported by whatsmeow; use Meta API instead.
func (w *WhatsmeowClientAdapter) UpdateProduct(ctx context.Context, account *models.WhatsAppAccount, productID string, product *ProductInput) error {
        return fmt.Errorf("UpdateProduct not supported by whatsmeow adapter")
}

// DeleteProduct is not supported by whatsmeow; use Meta API instead.
func (w *WhatsmeowClientAdapter) DeleteProduct(ctx context.Context, account *models.WhatsAppAccount, productID string) error {
        return fmt.Errorf("DeleteProduct not supported by whatsmeow adapter")
}

// CreateFlow is not supported by whatsmeow; use Meta API instead.
func (w *WhatsmeowClientAdapter) CreateFlow(ctx context.Context, account *models.WhatsAppAccount, name string, categories []string) (string, error) {
        return "", fmt.Errorf("CreateFlow not supported by whatsmeow adapter")
}

// UpdateFlowJSON is not supported by whatsmeow; use Meta API instead.
func (w *WhatsmeowClientAdapter) UpdateFlowJSON(ctx context.Context, account *models.WhatsAppAccount, flowID string, flowJSON *FlowJSON) error {
        return fmt.Errorf("UpdateFlowJSON not supported by whatsmeow adapter")
}

// PublishFlow is not supported by whatsmeow; use Meta API instead.
func (w *WhatsmeowClientAdapter) PublishFlow(ctx context.Context, account *models.WhatsAppAccount, flowID string) error {
        return fmt.Errorf("PublishFlow not supported by whatsmeow adapter")
}

// DeprecateFlow is not supported by whatsmeow; use Meta API instead.
func (w *WhatsmeowClientAdapter) DeprecateFlow(ctx context.Context, account *models.WhatsAppAccount, flowID string) error {
        return fmt.Errorf("DeprecateFlow not supported by whatsmeow adapter")
}

// DeleteFlow is not supported by whatsmeow; use Meta API instead.
func (w *WhatsmeowClientAdapter) DeleteFlow(ctx context.Context, account *models.WhatsAppAccount, flowID string) error {
        return fmt.Errorf("DeleteFlow not supported by whatsmeow adapter")
}

// GetFlow is not supported by whatsmeow; use Meta API instead.
func (w *WhatsmeowClientAdapter) GetFlow(ctx context.Context, account *models.WhatsAppAccount, flowID string) (*FlowGetResponse, error) {
        return nil, fmt.Errorf("GetFlow not supported by whatsmeow adapter")
}

// GetFlowAssets is not supported by whatsmeow; use Meta API instead.
func (w *WhatsmeowClientAdapter) GetFlowAssets(ctx context.Context, account *models.WhatsAppAccount, flowID string) (*FlowJSON, error) {
        return nil, fmt.Errorf("GetFlowAssets not supported by whatsmeow adapter")
}

// ListFlows is not supported by whatsmeow; use Meta API instead.
func (w *WhatsmeowClientAdapter) ListFlows(ctx context.Context, account *models.WhatsAppAccount) ([]FlowGetResponse, error) {
        return nil, fmt.Errorf("ListFlows not supported by whatsmeow adapter")
}

// SubmitTemplate is not supported by whatsmeow; use Meta API instead.
func (w *WhatsmeowClientAdapter) SubmitTemplate(ctx context.Context, account *models.WhatsAppAccount, template *TemplateSubmission) (string, error) {
        return "", fmt.Errorf("SubmitTemplate not supported by whatsmeow adapter")
}

// FetchTemplates is not supported by whatsmeow; use Meta API instead.
func (w *WhatsmeowClientAdapter) FetchTemplates(ctx context.Context, account *models.WhatsAppAccount) ([]MetaTemplate, error) {
        return nil, fmt.Errorf("FetchTemplates not supported by whatsmeow adapter")
}

// DeleteTemplate is not supported by whatsmeow; use Meta API instead.
func (w *WhatsmeowClientAdapter) DeleteTemplate(ctx context.Context, account *models.WhatsAppAccount, templateName string) error {
        return fmt.Errorf("DeleteTemplate not supported by whatsmeow adapter")
}

// GetAnalytics is not supported by whatsmeow; use Meta API instead.
func (w *WhatsmeowClientAdapter) GetAnalytics(ctx context.Context, account *models.WhatsAppAccount, analyticsType AnalyticsType, req *AnalyticsRequest) (*MetaAnalyticsResponse, error) {
        return nil, fmt.Errorf("GetAnalytics not supported by whatsmeow adapter")
}

func (w *WhatsmeowClientAdapter) eventHandler(client *whatsmeow.Client, account *models.WhatsAppAccount) func(evt interface{}) {
        return func(evt interface{}) {
                switch v := evt.(type) {
                case *events.Message:
                        w.log.Info("Received whatsmeow message.", "from", v.Info.Sender, "content", v.Message.GetConversation())

                        // Handle reactions
                        if reaction := v.Message.GetReactionMessage(); reaction != nil {
                                w.log.Info("Received whatsmeow reaction.", "from", v.Info.Sender, "message_id", reaction.GetKey().GetID(), "emoji", reaction.GetText())
                                if w.incomingMessageHandler != nil {
                                        w.incomingMessageHandler(account, v) // Pass the full event for now
                                }
                                return
                        }

                        if w.incomingMessageHandler != nil {
                                w.incomingMessageHandler(account, v)
                        }

                case *events.QR:
                        if len(v.Codes) > 0 {
                                w.log.Info("Received whatsmeow QR code.", "account", account.Name)
                                w.db.Model(&models.WhatsAppAccount{}).Where("id = ?", account.ID).Update("qr_code", v.Codes[0])
                                if w.wshub != nil {
                                        w.wshub.BroadcastToOrg(account.OrganizationID, websocket.WSMessage{
                                                Type: "whatsapp_qr_code",
                                                Payload: map[string]interface{}{
                                                        "account_id": account.ID.String(),
                                                        "qr_code":    v.Codes[0],
                                                        "status":     "scanning",
                                                },
                                        })
                                }
                        }

                case *events.PairSuccess:
                        w.log.Info("Received whatsmeow pairing success.", "account", account.Name, "jid", v.ID, "business_name", v.BusinessName)

                case *events.Connected:
                        w.log.Info("Whatsmeow client connected successfully.", "account", account.Name)
                        if client.IsLoggedIn() {
                                jid := client.Store.ID
                                if jid != nil {
                                        w.db.Model(&models.WhatsAppAccount{}).Where("id = ?", account.ID).Updates(map[string]interface{}{
                                                "status":   "active",
                                                "qr_code":  "",
                                                "phone_id": jid.String(),
                                        })
                                        // Broadcast connected status via WebSocket
                                        if w.wshub != nil {
                                                w.wshub.BroadcastToOrg(account.OrganizationID, websocket.WSMessage{
                                                        Type: "whatsapp_qr_code",
                                                        Payload: map[string]interface{}{
                                                                "account_id": account.ID.String(),
                                                                "qr_code":    "",
                                                                "status":     "connected",
                                                        },
                                                })
                                        }
                                }
                        }

                case *events.LoggedOut:
                        w.log.Info("Whatsmeow client logged out.", "account", account.Name, "reason", v.Reason)
                        w.db.Model(&models.WhatsAppAccount{}).Where("id = ?", account.ID).Updates(map[string]interface{}{
                                "status":  "disconnected",
                                "qr_code": "",
                        })
                        if w.wshub != nil {
                                w.wshub.BroadcastToOrg(account.OrganizationID, websocket.WSMessage{
                                        Type: "whatsapp_qr_code",
                                        Payload: map[string]interface{}{
                                                "account_id": account.ID.String(),
                                                "status":     "disconnected",
                                        },
                                })
                        }
                }
        }
}
