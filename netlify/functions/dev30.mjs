import http from 'node:http';
import { bridgeNodeRequest } from '../request-bridge.mjs';

const originalCreateServer = http.createServer;
let requestListener = null;

http.createServer = (listener) => {
  requestListener = listener;
  return {
    listen() { return this; },
  };
};

try {
  await import('../../server.mjs');
} finally {
  http.createServer = originalCreateServer;
}

if (typeof requestListener !== 'function') {
  throw new Error('Dev30 Netlify adapter could not capture the Node request listener.');
}

export default async function handler(request) {
  return bridgeNodeRequest(request, requestListener);
}

export const config = {
  path: ['/api/*', '/auth/*'],
};
