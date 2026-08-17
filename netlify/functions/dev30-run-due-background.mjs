import http from 'node:http';
import { bridgeNodeRequest } from '../request-bridge.mjs';

const originalCreateServer = http.createServer;
let requestListener = null;

http.createServer = (listener) => {
  requestListener = listener;
  return { listen() { return this; } };
};

try {
  const serverSpecifier = ['..', '..', 'server.mjs'].join('/');
  const serverUrl = new URL(serverSpecifier, import.meta.url);
  await import(serverUrl.href);
} finally {
  http.createServer = originalCreateServer;
}

if (typeof requestListener !== 'function') {
  throw new Error('Dev30 scheduled background adapter could not capture the Node request listener.');
}

export default async function handler(request) {
  try {
    const url = new URL(request.url);
    url.pathname = '/api/internal/run-due';
    url.search = '';
    const forwarded = new Request(url, {
      method: 'POST',
      headers: new Headers(request.headers),
    });
    const response = await bridgeNodeRequest(forwarded, requestListener);
    const text = await response.text();
    if (!response.ok) {
      console.error(`Dev30 scheduled background run failed (${response.status}): ${text.slice(0, 1000)}`);
      return;
    }
    console.log(`Dev30 scheduled background run completed: ${text.slice(0, 2000)}`);
  } catch (error) {
    console.error('Dev30 scheduled background run crashed:', error);
  }
}

export const config = {
  path: '/api/internal/run-due-background',
  method: 'POST',
  background: true,
};
