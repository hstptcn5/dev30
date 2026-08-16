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

test('Netlify deployment keeps static shell on CDN and backend on Functions', async () => {
  const config = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  const fn = await readFile(new URL('../netlify/functions/dev30.mjs', import.meta.url), 'utf8');
  assert.match(config, /publish = "public"/);
  assert.match(config, /from = "\/u\/\*"[\s\S]*to = "\/index\.html"/);
  assert.match(config, /from = "\/workspace"[\s\S]*to = "\/index\.html"/);
  assert.match(fn, /path: \['\/api\/\*', '\/auth\/\*'\]/);
  assert.doesNotMatch(config, /SUPABASE_SECRET_KEY\s*=/);
});
