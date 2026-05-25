/**
 * WhatsApp Bridge — Baileys-based real WhatsApp Web connection
 *
 * Provides Express.js API endpoints for QR pairing, messaging,
 * status monitoring, and Redis stream publishing.
 *
 * Endpoints:
 *   GET  /health          → health check
 *   GET  /qr              → QR code for pairing
 *   GET  /status          → connection status
 *   POST /api/send        → send message
 *   POST /send            → send message (legacy compat)
 *   GET  /api/messages    → get messages for a chat
 *   GET  /api/groups      → list groups
 *   GET  /api/chats       → list chats
 *   POST /api/mark-read   → mark chat as read
 */

const express = require('express');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode');
const Redis = require('ioredis');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Configuration ──────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);
const SESSION_DIR = path.join(os.homedir(), '.hermes', 'whatsapp', 'session');
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_STREAM = process.env.REDIS_STREAM || 'whatomate:whatsapp_messages';

// Ensure session directory exists
fs.mkdirSync(SESSION_DIR, { recursive: true });

// ─── Logger ─────────────────────────────────────────────────────────────────
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino/file',
    options: { destination: 1 }, // stdout
  },
});

// ─── In-memory message store ────────────────────────────────────────────────
const messageStore = new Map(); // chatId → [msg, ...]
const MAX_MESSAGES_PER_CHAT = 100;

function storeMessage(chatId, msg) {
  if (!messageStore.has(chatId)) {
    messageStore.set(chatId, []);
  }
  const msgs = messageStore.get(chatId);
  msgs.push(msg);
  // Keep only last N messages
  if (msgs.length > MAX_MESSAGES_PER_CHAT) {
    msgs.splice(0, msgs.length - MAX_MESSAGES_PER_CHAT);
  }
}

// ─── State ──────────────────────────────────────────────────────────────────
let sock = null;
let isConnected = false;
let qrCodeData = null;       // raw QR string from Baileys
let qrCodeDataUrl = null;    // data URL for frontend display
let connectionStatus = 'disconnected'; // disconnected | waiting | connected | timeout
let phoneInfo = null;         // { id, name } of connected phone
let pushName = null;
let startTime = Date.now();
let lastDisconnect = null;
let groupCount = 0;
let chatList = [];
let manualLogout = false;

// ─── Redis ──────────────────────────────────────────────────────────────────
let redis = null;
try {
  redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, lazyConnect: true });
  redis.on('error', (err) => {
    logger.warn({ err: err.message }, 'Redis connection error');
  });
  redis.connect().then(() => {
    logger.info('Redis connected');
  }).catch((err) => {
    logger.warn({ err: err.message }, 'Redis connection failed — publishing disabled');
    redis = null;
  });
} catch (err) {
  logger.warn({ err: err.message }, 'Redis initialization failed — publishing disabled');
  redis = null;
}

async function publishMessage(msg) {
  if (!redis) return;
  try {
    const msgText = extractMessageText(msg) || '';
    await redis.xadd(REDIS_STREAM, '*', {
      from: msg.key.remoteJid || '',
      fromMe: msg.key.fromMe ? '1' : '0',
      messageId: msg.key.id || '',
      message: msgText,
      rawMessage: JSON.stringify(msg.message || {}),
      timestamp: String(msg.messageTimestamp || Math.floor(Date.now() / 1000)),
      pushName: msg.pushName || '',
    });
    logger.debug({ from: msg.key.remoteJid }, 'Published message to Redis stream');
  } catch (err) {
    logger.warn({ err: err.message }, 'Redis publish error');
  }
}

// ─── Message Text Extraction ────────────────────────────────────────────────
function extractMessageText(msg) {
  if (!msg || !msg.message) return '';
  const m = msg.message;
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  );
}

// ─── Connection Logic ───────────────────────────────────────────────────────
async function connectToWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    // Fetch latest Baileys version with fallback
    let version;
    try {
      const versionInfo = await fetchLatestBaileysVersion();
      version = versionInfo.version;
      logger.info({ version: version.join('.') }, 'Using Baileys version');
    } catch (err) {
      version = [2, 3000, 1024153300]; // fallback version
      logger.warn({ err: err.message }, 'Failed to fetch Baileys version, using fallback');
    }

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger: logger.child({ module: 'baileys' }),
      defaultQueryTimeoutMs: 60000,
      connectTimeoutMs: 30000,
      keepAliveIntervalMs: 25000,
      markOnlineOnConnect: true,
      browser: ['Whatomate Bridge', 'Chrome', '1.0.0'],
    });

    // ─── Event: Connection Update ──────────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect: ld, qr } = update;

      if (qr) {
        // New QR code generated
        qrCodeData = qr;
        connectionStatus = 'waiting';
        logger.info('QR code generated — scan with WhatsApp to pair');

        try {
          qrCodeDataUrl = await QRCode.toDataURL(qr, {
            width: 512,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' },
          });
        } catch (err) {
          logger.warn({ err: err.message }, 'Failed to generate QR data URL');
          qrCodeDataUrl = null;
        }
      }

      if (connection === 'close') {
        isConnected = false;
        qrCodeData = null;
        qrCodeDataUrl = null;
        phoneInfo = null;
        pushName = null;
        groupCount = 0;
        chatList = [];

        const statusCode = ld?.error?.output?.statusCode || ld?.error?.output?.payload?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !manualLogout;
        lastDisconnect = { time: Date.now(), reason: statusCode };

        logger.warn({ statusCode, shouldReconnect, manualLogout }, 'Connection closed');

        if (manualLogout) {
          manualLogout = false;
          // Reconnect will be triggered by the logout endpoint
        } else if (shouldReconnect) {
          connectionStatus = 'disconnected';
          // Reconnect after a short delay
          setTimeout(() => {
            logger.info('Attempting reconnection...');
            connectToWhatsApp().catch((err) => {
              logger.error({ err: err.message }, 'Reconnection failed');
              connectionStatus = 'disconnected';
              // Try again after longer delay
              setTimeout(() => connectToWhatsApp(), 10000);
            });
          }, 3000);
        } else {
          connectionStatus = 'disconnected';
          logger.error('Logged out — need to re-pair with QR code');
          // Clean up auth state so next start generates a new QR
          try {
            fs.rmSync(SESSION_DIR, { recursive: true, force: true });
            fs.mkdirSync(SESSION_DIR, { recursive: true });
            logger.info('Session cleared — will generate new QR on next connection');
          } catch (err) {
            logger.warn({ err: err.message }, 'Failed to clear session');
          }
          // Attempt fresh connection
          setTimeout(() => connectToWhatsApp(), 5000);
        }
      }

      if (connection === 'open') {
        isConnected = true;
        connectionStatus = 'connected';
        qrCodeData = null;
        qrCodeDataUrl = null;
        logger.info('WhatsApp connection established!');

        // Get user info
        try {
          const meId = sock.user?.id;
          if (meId) {
            phoneInfo = { id: meId, name: sock.user?.name || '' };
            pushName = sock.user?.name || '';
            logger.info({ phone: meId, name: pushName }, 'Connected as');
          }
        } catch (err) {
          logger.warn({ err: err.message }, 'Failed to get user info');
        }

        // Fetch groups
        try {
          const groups = await sock.groupFetchAllParticipating();
          groupCount = groups ? Object.keys(groups).length : 0;
          logger.info({ groupCount }, 'Groups fetched');
        } catch (err) {
          logger.warn({ err: err.message }, 'Failed to fetch groups');
        }
      }
    });

    // ─── Event: Credentials Update ─────────────────────────────────────────
    sock.ev.on('creds.update', saveCreds);

    // ─── Event: Messages Upsert ────────────────────────────────────────────
    sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
      for (const msg of msgs) {
        try {
          // Skip status messages
          if (msg.key.remoteJid === 'status@broadcast') continue;

          const chatId = msg.key.remoteJid;
          const msgText = extractMessageText(msg);

          const storedMsg = {
            key: msg.key,
            text: msgText,
            timestamp: msg.messageTimestamp || Math.floor(Date.now() / 1000),
            fromMe: msg.key.fromMe,
            pushName: msg.pushName || '',
            type: type,
          };

          storeMessage(chatId, storedMsg);

          // Publish to Redis
          await publishMessage(msg);

          logger.info(
            { chatId, fromMe: msg.key.fromMe, text: msgText?.substring(0, 50) },
            'Message received'
          );
        } catch (err) {
          logger.warn({ err: err.message }, 'Error processing incoming message');
        }
      }
    });

    // ─── Event: Chats Update ───────────────────────────────────────────────
    sock.ev.on('chats.upsert', (chats) => {
      for (const chat of chats) {
        chatList.push({
          id: chat.id,
          name: chat.name || chat.id,
          conversationTimestamp: chat.conversationTimestamp,
          unreadCount: chat.unreadCount,
        });
      }
      // Keep only last 500 chats in memory
      if (chatList.length > 500) {
        chatList = chatList.slice(-500);
      }
    });

    // ─── Event: Chats Update ───────────────────────────────────────────────
    sock.ev.on('chats.update', (updates) => {
      for (const update of updates) {
        const idx = chatList.findIndex((c) => c.id === update.id);
        if (idx >= 0) {
          chatList[idx] = { ...chatList[idx], ...update };
        }
      }
    });

    logger.info('WhatsApp socket created, waiting for connection...');

  } catch (err) {
    logger.error({ err: err.message }, 'Failed to connect to WhatsApp');
    connectionStatus = 'disconnected';
    // Retry after delay
    setTimeout(() => connectToWhatsApp(), 10000);
  }
}

// ─── Express App ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '10mb' }));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.writeHead(204).end();
  }
  next();
});

// ─── GET /health ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    connected: isConnected,
    phone: phoneInfo?.id || null,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

// ─── GET /qr ────────────────────────────────────────────────────────────────
app.get('/qr', (req, res) => {
  res.json({
    qr: qrCodeDataUrl,
    status: connectionStatus, // waiting | connected | timeout | disconnected
  });
});

// ─── GET /status ────────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  res.json({
    connected: isConnected,
    status: connectionStatus,
    phone: phoneInfo?.id || null,
    pushName: pushName || null,
    groups: groupCount,
    sessionDir: SESSION_DIR,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    lastDisconnect: lastDisconnect,
  });
});

// ─── POST /api/send ─────────────────────────────────────────────────────────
app.post('/api/send', async (req, res) => {
  try {
    const { chatId, message } = req.body;

    if (!chatId || !message) {
      return res.status(400).json({ success: false, error: 'chatId and message are required' });
    }

    if (!sock || !isConnected) {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }

    const sent = await sock.sendMessage(chatId, { text: message });

    // Store outgoing message
    const storedMsg = {
      key: sent.key,
      text: message,
      timestamp: Math.floor(Date.now() / 1000),
      fromMe: true,
      pushName: pushName || '',
      type: 'send',
    };
    storeMessage(chatId, storedMsg);

    logger.info({ chatId, messageId: sent.key.id }, 'Message sent');
    res.json({ success: true, messageId: sent.key.id });
  } catch (err) {
    logger.error({ err: err.message }, 'Send message error');
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /send ─────────────────────────────────────────────────────────────
// Legacy compat endpoint
app.post('/send', async (req, res) => {
  try {
    const { chatId, message } = req.body;

    if (!chatId || !message) {
      return res.status(400).json({ success: false, error: 'chatId and message are required' });
    }

    if (!sock || !isConnected) {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }

    const sent = await sock.sendMessage(chatId, { text: message });

    // Store outgoing message
    const storedMsg = {
      key: sent.key,
      text: message,
      timestamp: Math.floor(Date.now() / 1000),
      fromMe: true,
      pushName: pushName || '',
      type: 'send',
    };
    storeMessage(chatId, storedMsg);

    logger.info({ chatId, messageId: sent.key.id }, 'Message sent (legacy endpoint)');
    res.json({ success: true, messageId: sent.key.id });
  } catch (err) {
    logger.error({ err: err.message }, 'Send message error (legacy)');
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/messages ──────────────────────────────────────────────────────
app.get('/api/messages', (req, res) => {
  const chatId = req.query.chatId;
  const limit = parseInt(req.query.limit || '50', 10);

  if (!chatId) {
    // Return all messages across all chats (flattened)
    const allMessages = [];
    for (const [cid, msgs] of messageStore.entries()) {
      for (const m of msgs) {
        allMessages.push({ ...m, chatId: cid });
      }
    }
    allMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    return res.json({ messages: allMessages.slice(-limit) });
  }

  const msgs = messageStore.get(chatId) || [];
  const sorted = [...msgs].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  res.json({ messages: sorted.slice(-limit) });
});

// ─── GET /api/groups ────────────────────────────────────────────────────────
app.get('/api/groups', async (req, res) => {
  try {
    if (!sock || !isConnected) {
      return res.status(503).json({ error: 'WhatsApp not connected', groups: [] });
    }

    const groups = await sock.groupFetchAllParticipating();
    const groupList = [];

    if (groups && typeof groups === 'object') {
      for (const [id, group] of Object.entries(groups)) {
        groupList.push({
          id: id,
          name: group.subject || group.name || id,
          participants: group.participants ? group.participants.length : 0,
        });
      }
    }

    res.json({ groups: groupList });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to fetch groups');
    res.status(500).json({ error: err.message, groups: [] });
  }
});

// ─── GET /api/chats ─────────────────────────────────────────────────────────
app.get('/api/chats', (req, res) => {
  res.json({ chats: chatList });
});

// ─── POST /api/mark-read ────────────────────────────────────────────────────
app.post('/api/mark-read', async (req, res) => {
  try {
    const { chatId } = req.body;

    if (!chatId) {
      return res.status(400).json({ success: false, error: 'chatId is required' });
    }

    if (!sock || !isConnected) {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }

    await sock.readMessages([{ remoteJid: chatId, read: true }]);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err.message }, 'Mark read error');
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/logout ───────────────────────────────────────────────────────
app.post('/api/logout', async (req, res) => {
  try {
    manualLogout = true;
    if (sock) {
      try {
        await sock.logout();
      } catch (e) {
        // Ignore logout errors — we're resetting anyway
        logger.debug({ err: e.message }, 'Logout socket error (ignored)');
      }
    }
    sock = null;
    isConnected = false;
    connectionStatus = 'disconnected';
    phoneInfo = null;
    pushName = null;
    qrCodeData = null;
    qrCodeDataUrl = null;

    // Clean session
    try {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to clear session on logout');
    }

    res.json({ success: true, message: 'Logged out, session cleared' });

    // Reconnect to generate new QR
    manualLogout = false;
    setTimeout(() => connectToWhatsApp(), 3000);
  } catch (err) {
    logger.error({ err: err.message }, 'Logout error');
    manualLogout = false;
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 404 Fallback ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Global Error Handler ───────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error({ err: err.message, stack: err.stack }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start Server ───────────────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'WhatsApp Bridge HTTP server started');
  logger.info(`Session dir: ${SESSION_DIR}`);
  logger.info('Endpoints: /health, /qr, /status, /api/send, /api/messages, /api/groups, /api/chats, /api/mark-read, /send');
});

// Handle server errors
server.on('error', (err) => {
  logger.error({ err: err.message }, 'HTTP server error');
});

// ─── Graceful Shutdown ──────────────────────────────────────────────────────
async function gracefulShutdown(signal) {
  logger.info({ signal }, 'Shutting down gracefully...');

  try {
    if (sock) {
      await sock.end(new Error('Shutdown'));
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Error closing WhatsApp socket');
  }

  try {
    if (redis) {
      await redis.quit();
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Error closing Redis connection');
  }

  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 5 seconds
  setTimeout(() => {
    logger.warn('Forced exit after timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ─── Uncaught Exception Handler ─────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  logger.error({ err: err.message, stack: err.stack }, 'Uncaught exception');
  // Don't exit — try to keep the bridge alive
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
  // Don't exit — try to keep the bridge alive
});

// ─── Initiate WhatsApp Connection ───────────────────────────────────────────
connectToWhatsApp().catch((err) => {
  logger.error({ err: err.message }, 'Initial connection failed — will retry');
  connectionStatus = 'disconnected';
});
