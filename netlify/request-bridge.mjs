import { Readable } from 'node:stream';

function appendHeader(headers, name, value) {
  if (Array.isArray(value)) {
    for (const item of value) headers.append(name, String(item));
    return;
  }
  if (value !== undefined && value !== null) headers.append(name, String(value));
}

class BridgedRequest extends Readable {
  constructor(request) {
    super();
    const url = new URL(request.url);
    this.method = request.method;
    this.url = `${url.pathname}${url.search}`;
    this.headers = Object.fromEntries(request.headers.entries());
    this.headers.host ||= url.host;
    this.headers['x-forwarded-proto'] ||= url.protocol.replace(':', '');
    this._request = request;
    this._started = false;
  }

  _read() {
    if (this._started) return;
    this._started = true;
    this._request.arrayBuffer()
      .then((body) => {
        const buffer = Buffer.from(body);
        if (buffer.length) this.push(buffer);
        this.push(null);
      })
      .catch((error) => this.destroy(error));
  }
}

class BridgedResponse {
  constructor(resolve) {
    this.statusCode = 200;
    this.headers = new Map();
    this.chunks = [];
    this.finished = false;
    this._resolve = resolve;
  }

  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), { name: String(name), value });
    return this;
  }

  getHeader(name) {
    return this.headers.get(String(name).toLowerCase())?.value;
  }

  removeHeader(name) {
    this.headers.delete(String(name).toLowerCase());
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = Number(statusCode) || 200;
    for (const [name, value] of Object.entries(headers || {})) this.setHeader(name, value);
    return this;
  }

  write(chunk, encoding) {
    if (this.finished || chunk === undefined || chunk === null) return false;
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding));
    return true;
  }

  end(chunk, encoding) {
    if (this.finished) return this;
    if (chunk !== undefined && chunk !== null) this.write(chunk, encoding);
    this.finished = true;
    const headers = new Headers();
    for (const { name, value } of this.headers.values()) appendHeader(headers, name, value);
    const body = this.chunks.length ? Buffer.concat(this.chunks) : null;
    this._resolve(new Response(body, { status: this.statusCode, headers }));
    return this;
  }
}

export async function bridgeNodeRequest(request, requestListener) {
  if (typeof requestListener !== 'function') throw new TypeError('A Node request listener is required.');
  const req = new BridgedRequest(request);
  let resolveResponse;
  const responsePromise = new Promise((resolve) => { resolveResponse = resolve; });
  const res = new BridgedResponse(resolveResponse);
  try {
    await requestListener(req, res);
  } catch (error) {
    if (!res.finished) {
      const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return new Response(JSON.stringify({ error: error?.message || 'Unexpected server error.' }), { status: Number(error?.status) || 500, headers });
    }
    throw error;
  }
  return responsePromise;
}

export const __netlifyBridgeTest = { BridgedRequest, BridgedResponse };
