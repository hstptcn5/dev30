import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { bridgeNodeRequest } from '../netlify/request-bridge.mjs';

test('Netlify request bridge preserves path, query, headers, body, status and cookies', async () => {
  const request = new Request('https://dev30.example/api/echo?days=30', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'dev30_session=abc' },
    body: JSON.stringify({ ok: true }),
  });

  const response = await bridgeNodeRequest(request, async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk.toString('utf8');
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/api/echo?days=30');
    assert.equal(req.headers.host, 'dev30.example');
    assert.equal(req.headers['x-forwarded-proto'], 'https');
    assert.equal(req.headers.cookie, 'dev30_session=abc');
    assert.deepEqual(JSON.parse(body), { ok: true });
    res.writeHead(201, {
      'Content-Type': 'application/json',
      'Set-Cookie': ['a=1; Path=/', 'b=2; Path=/'],
    });
    res.end(JSON.stringify({ bridged: true }));
  });

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { bridged: true });
  assert.match(response.headers.get('set-cookie') || '', /a=1/);
  assert.match(response.headers.get('set-cookie') || '', /b=2/);
});

test('Netlify function executes the existing Dev30 Node request listener', async () => {
  const before = {
    nodeEnv: process.env.NODE_ENV,
    backend: process.env.DEV30_STORAGE_BACKEND,
    appBaseUrl: process.env.APP_BASE_URL,
  };
  process.env.NODE_ENV = 'development';
  process.env.DEV30_STORAGE_BACKEND = 'local';
  delete process.env.APP_BASE_URL;
  try {
    const { default: netlifyHandler } = await import(`../netlify/functions/dev30.mjs?test=${Date.now()}`);
    const response = await netlifyHandler(new Request('http://localhost/api/health'));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.productVersion, '1.1.0');
    assert.equal(payload.storage.backend, 'local');
  } finally {
    if (before.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before.nodeEnv;
    if (before.backend === undefined) delete process.env.DEV30_STORAGE_BACKEND; else process.env.DEV30_STORAGE_BACKEND = before.backend;
    if (before.appBaseUrl === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = before.appBaseUrl;
  }
});

test('Netlify deployment keeps the Dev30 server module outside the function entry bundle', async () => {
  const config = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  const fn = await readFile(new URL('../netlify/functions/dev30.mjs', import.meta.url), 'utf8');
  assert.match(config, /publish = "public"/);
  assert.match(config, /node_bundler = "zisi"/);
  assert.doesNotMatch(config, /node_bundler = "esbuild"/);
  assert.match(config, /included_files = \["server\.mjs", "src\/\*\*"\]/);
  assert.match(fn, /\['\.\.', '\.\.', 'server\.mjs'\]\.join\('\/'\)/);
  assert.match(fn, /await import\(serverUrl\.href\)/);
  assert.doesNotMatch(fn, /import\(['"]\.\.\/\.\.\/server\.mjs['"]\)/);
  assert.match(config, /from = "\/u\/\*"[\s\S]*to = "\/index\.html"/);
  assert.match(config, /from = "\/workspace"[\s\S]*to = "\/index\.html"/);
  assert.match(fn, /path: \['\/api\/\*', '\/auth\/\*'\]/);
  assert.doesNotMatch(config, /SUPABASE_SECRET_KEY\s*=/);
});

test('hosted Analyze uses a background function and durable job polling', async () => {
  const shell = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const preload = await readFile(new URL('../public/background-analysis-preload.js', import.meta.url), 'utf8');
  const mainFn = await readFile(new URL('../netlify/functions/dev30.mjs', import.meta.url), 'utf8');
  const backgroundFn = await readFile(new URL('../netlify/functions/dev30-analyze-background.mjs', import.meta.url), 'utf8');
  const statusFn = await readFile(new URL('../netlify/functions/dev30-analysis-job.mjs', import.meta.url), 'utf8');

  assert.match(shell, /background-analysis-preload\.js[\s\S]*type="module" src="\/app\.js"/);
  assert.match(preload, /nativeFetch\('\/api\/analyze-background'/);
  assert.match(preload, /\/api\/analysis-job\//);
  assert.match(preload, /content-type/);
  assert.match(mainFn, /excludedPath:/);
  assert.match(mainFn, /'\/api\/analyze-background'/);
  assert.match(mainFn, /'\/api\/analysis-job\/\*'/);
  assert.match(backgroundFn, /background: true/);
  assert.match(backgroundFn, /path: '\/api\/analyze-background'/);
  assert.match(statusFn, /path: '\/api\/analysis-job\/:id'/);
});
