const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3001;
const SESSION_DIR = path.join(os.homedir(), '.hermes', 'whatsapp', 'session');

fs.mkdirSync(SESSION_DIR, { recursive: true });

// In-memory message store
const messages = [];

function generateId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Health check
    if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            service: 'whatsapp-bridge',
            port: PORT,
            connected: false,
            message: 'WhatsApp bridge running - Baileys integration pending',
            sessions: messages.length
        }));
        return;
    }

    // QR code endpoint
    if (url.pathname === '/qr') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            qr: null,
            status: 'disconnected',
            message: 'WhatsApp bridge running. Connect via Baileys to get QR code for pairing.',
        }));
        return;
    }

    // Status endpoint
    if (url.pathname === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            connected: false,
            status: 'disconnected',
            message: 'WhatsApp bridge - not connected to WhatsApp',
            sessionDir: SESSION_DIR,
            queuedMessages: messages.length
        }));
        return;
    }

    // Send message endpoint (Hermes-compatible)
    if (url.pathname === '/api/send' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body);
                const { chatId, message } = parsed;

                if (!chatId || !message) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'chatId and message are required' }));
                    return;
                }

                const storedMsg = {
                    id: generateId(),
                    from: 'me',
                    text: message,
                    timestamp: Date.now(),
                    chatId,
                };
                messages.push(storedMsg);

                console.log(`[whatsapp-bridge] Message to ${chatId}: ${message.substring(0, 80)}...`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    sent: true,
                    messageId: storedMsg.id,
                    message: 'Message queued (bridge mode - Baileys integration pending)',
                }));
            } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            }
        });
        return;
    }

    // Legacy /send endpoint (backward compat)
    if (url.pathname === '/send' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body);
                const { chatId, message } = parsed;

                const storedMsg = {
                    id: generateId(),
                    from: 'me',
                    text: message || '',
                    timestamp: Date.now(),
                    chatId: chatId || 'unknown',
                };
                messages.push(storedMsg);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    sent: true,
                    messageId: storedMsg.id,
                    message: 'Message queued via legacy endpoint (bridge mode - Baileys integration pending)',
                }));
            } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            }
        });
        return;
    }

    // Get messages endpoint (Hermes-compatible)
    if (url.pathname === '/api/messages' && req.method === 'GET') {
        const since = parseInt(url.searchParams.get('since') || '0', 10);
        const filtered = messages.filter(m => m.timestamp > since);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ messages: filtered }));
        return;
    }

    // Simulate incoming WhatsApp message (for testing)
    if (url.pathname === '/api/inject' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body);
                const { from, text, chatId } = parsed;

                if (!from || !text) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'from and text are required' }));
                    return;
                }

                const storedMsg = {
                    id: generateId(),
                    from,
                    text,
                    timestamp: Date.now(),
                    chatId: chatId || from,
                };
                messages.push(storedMsg);

                console.log(`[whatsapp-bridge] Injected message from ${from}: ${text.substring(0, 80)}...`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    injected: true,
                    messageId: storedMsg.id,
                }));
            } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            }
        });
        return;
    }

    // 404 fallback
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
    console.log(`[whatsapp-bridge] Running on port ${PORT}`);
    console.log(`[whatsapp-bridge] Session dir: ${SESSION_DIR}`);
    console.log(`[whatsapp-bridge] Endpoints: /health, /qr, /status, /api/send, /api/messages, /api/inject, /send`);
});
