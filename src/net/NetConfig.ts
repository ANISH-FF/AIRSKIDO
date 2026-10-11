/**
 * AIRSKIDO Multiplayer Network Configuration
 * 
 * To switch from public PeerJS cloud to your own VPS:
 * 1. Set `USE_CUSTOM_SIGNALING: true`
 * 2. Put your domain name in `CUSTOM_HOST` (e.g. 'net.airskido.com')
 */
export const NET_CONFIG = {
  // Toggle between your private VPS signaling server and public fallback
  USE_CUSTOM_SIGNALING: false,

  // Your VPS domain (e.g. 'net.airskido.com')
  CUSTOM_HOST: '',

  // Standard SSL port for WSS (HTTPS)
  CUSTOM_PORT: 443,

  // Endpoint path matching server/signaling-server.js
  CUSTOM_PATH: '/airskido-net',

  // True for secure WSS (HTTPS)
  CUSTOM_SECURE: true,
};
