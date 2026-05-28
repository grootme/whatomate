package handlers_test

import (
        "testing"
        "time"

        "github.com/google/uuid"
        "github.com/shridarpatil/whatomate/test/testutil"
        "github.com/stretchr/testify/assert"
        "github.com/stretchr/testify/require"
        waProto "go.mau.fi/whatsmeow/binary/proto"
        "go.mau.fi/whatsmeow/types"
        events "go.mau.fi/whatsmeow/types/events"
        "google.golang.org/protobuf/proto"
)

// ========== ProcessWhatsmeowMessage Tests ==========

// createTestWhatsmeowMessageEvent creates a test whatsmeow message event
func createTestWhatsmeowMessageEvent(senderJID string, text string) *events.Message {
        sender, _ := types.ParseJID(senderJID)
        return &events.Message{
                Info: types.MessageInfo{
                        MessageSource: types.MessageSource{
                                Sender:   sender,
                                IsFromMe: false,
                        },
                        ID:        "msg-" + uuid.New().String()[:8],
                        Timestamp: time.Now(),
                },
                Message: &waProto.Message{
                        Conversation: proto.String(text),
                },
        }
}

func TestProcessWhatsmeowMessage_InvalidDataType(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        account := testutil.CreateTestWhatsAppAccount(t, app.DB, org.ID)

        // Pass invalid data type - should not panic
        assert.NotPanics(t, func() {
                app.ProcessWhatsmeowMessage(account, "invalid-string-data")
        }, "ProcessWhatsmeowMessage should not panic with invalid data type")
}

func TestProcessWhatsmeowMessage_IgnoresOwnMessages(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        account := testutil.CreateTestWhatsAppAccount(t, app.DB, org.ID)

        sender, _ := types.ParseJID("1234567890@s.whatsapp.net")
        evt := &events.Message{
                Info: types.MessageInfo{
                        MessageSource: types.MessageSource{
                                Sender:   sender,
                                IsFromMe: true, // This is our own message
                        },
                        ID:        "own-msg-" + uuid.New().String()[:8],
                        Timestamp: time.Now(),
                },
                Message: &waProto.Message{
                        Conversation: proto.String("This is my own message"),
                },
        }

        // Should not panic and should skip processing
        assert.NotPanics(t, func() {
                app.ProcessWhatsmeowMessage(account, evt)
        }, "ProcessWhatsmeowMessage should not panic for own messages")
}

func TestProcessWhatsmeowMessage_TextMessage(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        account := testutil.CreateTestWhatsAppAccount(t, app.DB, org.ID)
        account.PhoneID = "1234567890@s.whatsapp.net"
        require.NoError(t, app.DB.Save(account).Error)

        evt := createTestWhatsmeowMessageEvent("9876543210@s.whatsapp.net", "Hello from WhatsApp!")

        // Process the message asynchronously (it uses goroutine internally)
        assert.NotPanics(t, func() {
                app.ProcessWhatsmeowMessage(account, evt)
        }, "ProcessWhatsmeowMessage should not panic for text messages")

        // Give some time for the goroutine to process
        // The message should be processed by processIncomingMessageFull
        // which creates a contact and message in the DB
}

func TestProcessWhatsmeowMessage_ReactionMessage(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        account := testutil.CreateTestWhatsAppAccount(t, app.DB, org.ID)
        account.PhoneID = "1234567890@s.whatsapp.net"
        require.NoError(t, app.DB.Save(account).Error)

        sender, _ := types.ParseJID("9876543210@s.whatsapp.net")
        evt := &events.Message{
                Info: types.MessageInfo{
                        MessageSource: types.MessageSource{
                                Sender:   sender,
                                IsFromMe: false,
                        },
                        ID:        "reaction-msg-" + uuid.New().String()[:8],
                        Timestamp: time.Now(),
                },
                Message: &waProto.Message{
                        ReactionMessage: &waProto.ReactionMessage{
                                Key: &waProto.MessageKey{
                                        RemoteJID: proto.String("9876543210@s.whatsapp.net"),
                                        FromMe:    proto.Bool(false),
                                        ID:        proto.String("original-msg-id"),
                                },
                                Text: proto.String("\xf0\x9f\x91\x8d"),
                        },
                },
        }

        assert.NotPanics(t, func() {
                app.ProcessWhatsmeowMessage(account, evt)
        }, "ProcessWhatsmeowMessage should not panic for reaction messages")
}

func TestProcessWhatsmeowMessage_ImageMessage(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        account := testutil.CreateTestWhatsAppAccount(t, app.DB, org.ID)
        account.PhoneID = "1234567890@s.whatsapp.net"
        require.NoError(t, app.DB.Save(account).Error)

        sender, _ := types.ParseJID("9876543210@s.whatsapp.net")
        evt := &events.Message{
                Info: types.MessageInfo{
                        MessageSource: types.MessageSource{
                                Sender:   sender,
                                IsFromMe: false,
                        },
                        ID:        "image-msg-" + uuid.New().String()[:8],
                        Timestamp: time.Now(),
                },
                Message: &waProto.Message{
                        ImageMessage: &waProto.ImageMessage{
                                Caption:  proto.String("Check this out!"),
                                Mimetype: proto.String("image/jpeg"),
                        },
                },
        }

        // Will likely fail on media download but should not panic
        assert.NotPanics(t, func() {
                app.ProcessWhatsmeowMessage(account, evt)
        }, "ProcessWhatsmeowMessage should not panic for image messages")
}

func TestProcessWhatsmeowMessage_ExtendedTextMessage(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        account := testutil.CreateTestWhatsAppAccount(t, app.DB, org.ID)
        account.PhoneID = "1234567890@s.whatsapp.net"
        require.NoError(t, app.DB.Save(account).Error)

        sender, _ := types.ParseJID("9876543210@s.whatsapp.net")
        evt := &events.Message{
                Info: types.MessageInfo{
                        MessageSource: types.MessageSource{
                                Sender:   sender,
                                IsFromMe: false,
                        },
                        ID:        "ext-text-msg-" + uuid.New().String()[:8],
                        Timestamp: time.Now(),
                },
                Message: &waProto.Message{
                        ExtendedTextMessage: &waProto.ExtendedTextMessage{
                                Text: proto.String("This is a reply to another message"),
                        },
                },
        }

        assert.NotPanics(t, func() {
                app.ProcessWhatsmeowMessage(account, evt)
        }, "ProcessWhatsmeowMessage should not panic for extended text messages")
}

func TestProcessWhatsmeowMessage_VideoMessage(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        account := testutil.CreateTestWhatsAppAccount(t, app.DB, org.ID)
        account.PhoneID = "1234567890@s.whatsapp.net"
        require.NoError(t, app.DB.Save(account).Error)

        sender, _ := types.ParseJID("9876543210@s.whatsapp.net")
        evt := &events.Message{
                Info: types.MessageInfo{
                        MessageSource: types.MessageSource{
                                Sender:   sender,
                                IsFromMe: false,
                        },
                        ID:        "video-msg-" + uuid.New().String()[:8],
                        Timestamp: time.Now(),
                },
                Message: &waProto.Message{
                        VideoMessage: &waProto.VideoMessage{
                                Caption:  proto.String("Video message"),
                                Mimetype: proto.String("video/mp4"),
                        },
                },
        }

        assert.NotPanics(t, func() {
                app.ProcessWhatsmeowMessage(account, evt)
        }, "ProcessWhatsmeowMessage should not panic for video messages")
}

func TestProcessWhatsmeowMessage_AudioMessage(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        account := testutil.CreateTestWhatsAppAccount(t, app.DB, org.ID)
        account.PhoneID = "1234567890@s.whatsapp.net"
        require.NoError(t, app.DB.Save(account).Error)

        sender, _ := types.ParseJID("9876543210@s.whatsapp.net")
        evt := &events.Message{
                Info: types.MessageInfo{
                        MessageSource: types.MessageSource{
                                Sender:   sender,
                                IsFromMe: false,
                        },
                        ID:        "audio-msg-" + uuid.New().String()[:8],
                        Timestamp: time.Now(),
                },
                Message: &waProto.Message{
                        AudioMessage: &waProto.AudioMessage{
                                Mimetype: proto.String("audio/ogg; codecs=opus"),
                        },
                },
        }

        assert.NotPanics(t, func() {
                app.ProcessWhatsmeowMessage(account, evt)
        }, "ProcessWhatsmeowMessage should not panic for audio messages")
}

func TestProcessWhatsmeowMessage_DocumentMessage(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        account := testutil.CreateTestWhatsAppAccount(t, app.DB, org.ID)
        account.PhoneID = "1234567890@s.whatsapp.net"
        require.NoError(t, app.DB.Save(account).Error)

        sender, _ := types.ParseJID("9876543210@s.whatsapp.net")
        evt := &events.Message{
                Info: types.MessageInfo{
                        MessageSource: types.MessageSource{
                                Sender:   sender,
                                IsFromMe: false,
                        },
                        ID:        "doc-msg-" + uuid.New().String()[:8],
                        Timestamp: time.Now(),
                },
                Message: &waProto.Message{
                        DocumentMessage: &waProto.DocumentMessage{
                                FileName: proto.String("report.pdf"),
                                Caption:  proto.String("Monthly report"),
                                Mimetype: proto.String("application/pdf"),
                        },
                },
        }

        assert.NotPanics(t, func() {
                app.ProcessWhatsmeowMessage(account, evt)
        }, "ProcessWhatsmeowMessage should not panic for document messages")
}

func TestProcessWhatsmeowMessage_StickerMessage(t *testing.T) {
        mockWA := testutil.NewMockClientInterface()
        app := newTestAppWithMockWhatsApp(t, mockWA)

        org := testutil.CreateTestOrganization(t, app.DB)
        account := testutil.CreateTestWhatsAppAccount(t, app.DB, org.ID)
        account.PhoneID = "1234567890@s.whatsapp.net"
        require.NoError(t, app.DB.Save(account).Error)

        sender, _ := types.ParseJID("9876543210@s.whatsapp.net")
        evt := &events.Message{
                Info: types.MessageInfo{
                        MessageSource: types.MessageSource{
                                Sender:   sender,
                                IsFromMe: false,
                        },
                        ID:        "sticker-msg-" + uuid.New().String()[:8],
                        Timestamp: time.Now(),
                },
                Message: &waProto.Message{
                        StickerMessage: &waProto.StickerMessage{
                                Mimetype: proto.String("image/webp"),
                        },
                },
        }

        assert.NotPanics(t, func() {
                app.ProcessWhatsmeowMessage(account, evt)
        }, "ProcessWhatsmeowMessage should not panic for sticker messages")
}
