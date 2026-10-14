const { PeerServer } = require('peer');
const crypto = require('crypto');

const PORT = process.env.PORT || 9000;
const PATH = '/airskido-net';
const TURN_SECRET = process.env.TURN_SECRET || 'airskidorocks2026';
const TURN_HOST = process.env.TURN_HOST || '50.6.44.119';
const TURN_PORT = process.env.TURN_PORT || '3478';

// Allowed origins: only authorized AirSkido clients can request relay credentials
const ALLOWED_ORIGIN_PATTERNS = [
  /airskido\.(io|com)/i,
  /localhost/i,
  /127\.0\.0\.1/i,
  /trycloudflare\.com/i,
];

function isOriginAllowed(origin) {
  if (!origin) return true; // Direct local/same-origin request
  return ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(origin));
}

// Generate RFC 5766 time-limited ephemeral TURN credentials (valid for 30 minutes)
function generateEphemeralCredentials(usernamePrefix = 'airskido', ttlSeconds = 1800) {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiry}:${usernamePrefix}`;
  const hmac = crypto.createHmac('sha1', TURN_SECRET);
  hmac.update(username);
  const credential = hmac.digest('base64');
  return { username, credential, expiry };
}

const peerServer = PeerServer({
  port: PORT,
  path: PATH,
  allow_discovery: true,
  corsOptions: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  proxied: true, // Sits behind Nginx / Cloudflare SSL reverse proxy
});

// Intercept HTTP requests to serve dynamic, origin-protected ICE credentials
const serverInstance = peerServer._server || peerServer;
if (serverInstance && typeof serverInstance.prependListener === 'function') {
  serverInstance.prependListener('request', (req, res) => {
    const url = req.url || '';
    if (url.startsWith('/airskido-net/ice-servers') || url.startsWith('/ice-servers')) {
      const origin = req.headers.origin || '';
      if (!isOriginAllowed(origin)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Origin Forbidden' }));
        return;
      }

      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const turn = generateEphemeralCredentials();
      const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: `stun:${TURN_HOST}:${TURN_PORT}` },
        {
          urls: [
            `turn:${TURN_HOST}:${TURN_PORT}`,
            `turn:${TURN_HOST}:${TURN_PORT}?transport=tcp`,
          ],
          username: turn.username,
          credential: turn.credential,
        },
      ];

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ iceServers, expiry: turn.expiry }));
    }
  });
}

peerServer.on('connection', (client) => {
  console.log(`[AIRSKIDO] Player connected: ${client.getId()}`);
});

peerServer.on('disconnect', (client) => {
  console.log(`[AIRSKIDO] Player disconnected: ${client.getId()}`);
});

console.log(`🚀 AirSkido High-Performance Signaling Server active on port ${PORT}${PATH}`);
