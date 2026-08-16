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
  // Keep server.mjs out of the function entry bundle. Netlify copies it and
  // src/** via included_files, then Node loads it as its own ESM module scope.
  // Construct the specifier at runtime so the function bundler does not flatten
  // the server module graph into this entry file and recreate identifier clashes.
  const serverSpecifier = ['..', '..', 'server.mjs'].join('/');
  const serverUrl = new URL(serverSpecifier, import.meta.url);
  await import(serverUrl.href);
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
