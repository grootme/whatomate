package handlers

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/shridarpatil/whatomate/internal/models"
	"go.mau.fi/whatsmeow/types/events"
)

// ProcessWhatsmeowMessage handles incoming messages from the whatsmeow client
func (a *App) ProcessWhatsmeowMessage(account *models.WhatsAppAccount, data interface{}) {
	evt, ok := data.(*events.Message)
	if !ok {
		a.Log.Error("Invalid data type for whatsmeow message", "type", fmt.Sprintf("%T", data))
		return
	}

	// Avoid processing our own messages
	if evt.Info.IsFromMe {
		return
	}

	a.Log.Info("Processing incoming whatsmeow message",
		"from", evt.Info.Sender.String(),
		"id", evt.Info.ID,
		"account", account.Name,
	)

	// Map whatsmeow event to IncomingTextMessage
	msg := IncomingTextMessage{
		From:      evt.Info.Sender.ToBare().String(),
		ID:        evt.Info.ID,
		Timestamp: fmt.Sprintf("%d", evt.Info.Timestamp.Unix()),
		Type:      "text", // Default to text, will be updated below
	}

	// Handle different message types
	protoMsg := evt.Message

	// Helper to download media
	downloadAndSetMedia := func(mediaID string, mimeType string, caption string, filename string) {
		localPath, actualMimeType, err := a.DownloadAndSaveWhatsmeowMedia(context.Background(), account, evt)
		if err != nil {
			a.Log.Error("Failed to download whatsmeow media", "error", err, "media_id", mediaID)
			return
		}
		msg.Type = strings.Split(actualMimeType, "/")[0] // e.g., "image", "video"
		// Populate the correct media struct in IncomingTextMessage
		switch msg.Type {
		case "image":
			msg.Image = &struct {
				ID       string `json:"id"`
				MimeType string `json:"mime_type"`
				SHA256   string `json:"sha256"`
				Caption  string `json:"caption,omitempty"`
			}{ID: localPath, MimeType: actualMimeType, Caption: caption}
		case "video":
			msg.Video = &struct {
				ID       string `json:"id"`
				MimeType string `json:"mime_type"`
				SHA256   string `json:"sha256"`
				Caption  string `json:"caption,omitempty"`
			}{ID: localPath, MimeType: actualMimeType, Caption: caption}
		case "audio":
			msg.Audio = &struct {
				ID       string `json:"id"`
				MimeType string `json:"mime_type"`
			}{ID: localPath, MimeType: actualMimeType}
		case "document":
			msg.Document = &struct {
				ID       string `json:"id"`
				MimeType string `json:"mime_type"`
				SHA256   string `json:"sha256"`
				Filename string `json:"filename,omitempty"`
				Caption  string `json:"caption,omitempty"`
			}{ID: localPath, MimeType: actualMimeType, Filename: filename, Caption: caption}
		case "sticker":
			msg.Sticker = &struct {
				ID       string `json:"id"`
				MimeType string `json:"mime_type"`
				SHA256   string `json:"sha256"`
				Animated bool   `json:"animated,omitempty"`
			}{ID: localPath, MimeType: actualMimeType}
		}
	}

	if protoMsg.GetReactionMessage() != nil {
		reactionMsg := protoMsg.GetReactionMessage()
		msg.Type = "reaction"
		msg.Reaction = &struct {
			MessageID string `json:"message_id"`
			Emoji     string `json:"emoji"`
		}{
			MessageID: reactionMsg.GetKey().GetId(),
			Emoji:     reactionMsg.GetText(),
		}
	} else if protoMsg.GetConversation() != "" {
		msg.Type = "text"
		msg.Text = &struct {
			Body string `json:"body"`
		}{Body: protoMsg.GetConversation()}
	} else if protoMsg.GetExtendedTextMessage() != nil {
		msg.Type = "text"
		msg.Text = &struct {
			Body string `json:"body"`
		}{Body: protoMsg.GetExtendedTextMessage().GetText()}
	} else if img := protoMsg.GetImageMessage(); img != nil {
		downloadAndSetMedia(evt.Info.ID, img.GetMimetype(), img.GetCaption(), "")
	} else if vid := protoMsg.GetVideoMessage(); vid != nil {
		downloadAndSetMedia(evt.Info.ID, vid.GetMimetype(), vid.GetCaption(), "")
	} else if aud := protoMsg.GetAudioMessage(); aud != nil {
		downloadAndSetMedia(evt.Info.ID, aud.GetMimetype(), "", "")
	} else if doc := protoMsg.GetDocumentMessage(); doc != nil {
		downloadAndSetMedia(evt.Info.ID, doc.GetMimetype(), doc.GetCaption(), doc.GetFileName())
	} else if stk := protoMsg.GetStickerMessage(); stk != nil {
		downloadAndSetMedia(evt.Info.ID, stk.GetMimetype(), "", "")
	}

	// Get profile name if available
	profileName := evt.Info.PushName

	// Process the message using existing logic
	// Note: for whatsmeow, we use account.PhoneID (which is the JID)
	go a.processIncomingMessageFull(account.PhoneID, msg, profileName)
}
