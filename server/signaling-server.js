const { PeerServer } = require('peer');

const PORT = process.env.PORT || 9000;
const PATH = '/airskido-net';

const peerServer = PeerServer({
  port: PORT,
  path: PATH,
  allow_discovery: true,
  corsOptions: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  proxied: true, // Tells PeerServer it sits behind Nginx / Cloudflare SSL reverse proxy
});

peerServer.on('connection', (client) => {
  console.log(`[AIRSKIDO] Player connected: ${client.getId()}`);
});

peerServer.on('disconnect', (client) => {
  console.log(`[AIRSKIDO] Player disconnected: ${client.getId()}`);
});

console.log(`🚀 AirSkido High-Performance Signaling Server active on port ${PORT}${PATH}`);
