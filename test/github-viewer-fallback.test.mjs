import test from 'node:test';
import assert from 'node:assert/strict';

import { installGitHubFetchRetry } from '../src/github-http.mjs';

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

test('GET /user falls back to GraphQL viewer after transient REST exhaustion', async () => {
  const calls = [];
  const target = {
    fetch: async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      calls.push({ url, method: String(init.method || 'GET').toUpperCase(), headers: new Headers(init.headers || undefined) });
      if (url === 'https://api.github.com/user') {
        return jsonResponse(503, { message: 'No server is currently available' }, { 'x-github-request-id': `REST-${calls.length}` });
      }
      if (url === 'https://api.github.com/graphql') {
        assert.equal(String(init.method).toUpperCase(), 'POST');
        assert.equal(new Headers(init.headers).get('authorization'), 'Bearer token_test');
        return jsonResponse(200, {
          data: {
            viewer: {
              databaseId: 12345,
              login: 'octo',
              name: 'Octo Cat',
              avatarUrl: 'https://avatars.example/octo',
              url: 'https://github.com/octo',
            },
          },
        }, { 'x-github-request-id': 'GRAPHQL-1' });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  };

  assert.equal(installGitHubFetchRetry(target, { delaysMs: [0, 0] }), true);
  const response = await target.fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer token_test',
      'X-GitHub-Api-Version': '2026-03-10',
      'User-Agent': 'dev30/test',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-dev30-github-viewer-source'), 'graphql-fallback');
  assert.deepEqual(await response.json(), {
    id: 12345,
    login: 'octo',
    name: 'Octo Cat',
    avatar_url: 'https://avatars.example/octo',
    html_url: 'https://github.com/octo',
  });
  assert.deepEqual(calls.map((call) => call.url), [
    'https://api.github.com/user',
    'https://api.github.com/user',
    'https://api.github.com/user',
    'https://api.github.com/graphql',
  ]);
});

test('GET /user keeps ordinary auth failures unchanged and does not use GraphQL', async () => {
  const calls = [];
  const target = {
    fetch: async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      calls.push(url);
      return jsonResponse(401, { message: 'Bad credentials' });
    },
  };

  installGitHubFetchRetry(target, { delaysMs: [0] });
  const response = await target.fetch('https://api.github.com/user', {
    headers: { Authorization: 'Bearer bad_token' },
  });
  assert.equal(response.status, 401);
  assert.deepEqual(calls, ['https://api.github.com/user']);
});

test('non-viewer GitHub endpoints keep retry behavior without GraphQL substitution', async () => {
  const calls = [];
  const target = {
    fetch: async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      calls.push(url);
      return jsonResponse(503, { message: 'temporary' });
    },
  };

  installGitHubFetchRetry(target, { delaysMs: [0] });
  await assert.rejects(
    target.fetch('https://api.github.com/user/repos', { headers: { Authorization: 'Bearer token' } }),
    (error) => error.status === 503,
  );
  assert.deepEqual(calls, [
    'https://api.github.com/user/repos',
    'https://api.github.com/user/repos',
  ]);
});
