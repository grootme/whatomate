const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3001;
const SESSION_DIR = path.join(os.homedir(), '.hermes', 'whatsapp', 'session');

fs.mkdirSync(SESSION_DIR, { recursive: true });

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

    if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            service: 'whatsapp-bridge-stub',
            port: PORT,
            message: 'Stub bridge running - install Hermes Agent for full functionality'
        }));
        return;
    }

    if (url.pathname === '/qr') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            qr: null,
            status: 'stub',
            message: 'WhatsApp bridge stub running. Install Hermes Agent for QR pairing.'
        }));
        return;
    }

    if (url.pathname === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            connected: false,
            status: 'stub',
            message: 'Stub bridge - no WhatsApp connection'
        }));
        return;
    }

    if (url.pathname === '/send' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                sent: false,
                message: 'Stub bridge - message not sent. Install Hermes Agent for full functionality.'
            }));
        });
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
    console.log(`[whatsapp-bridge-stub] Running on port ${PORT}`);
    console.log(`[whatsapp-bridge-stub] Session dir: ${SESSION_DIR}`);
    console.log(`[whatsapp-bridge-stub] NOTE: Install Hermes Agent for full WhatsApp functionality.`);
});
