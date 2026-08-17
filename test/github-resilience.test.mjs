import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { githubRequest, installGitHubFetchRetry, __githubHttpTest } from '../src/github-http.mjs';

function response(status, body = {}, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

test('GitHub transport retries transient 503 responses and eventually succeeds', async () => {
  const calls = [];
  const waits = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (calls.length < 3) return response(503, { message: 'temporarily unavailable' }, { 'x-github-request-id': `req-${calls.length}` });
    return response(200, { login: 'octo' });
  };

  const result = await githubRequest('https://api.github.com/user', {}, {
    delaysMs: [1, 2, 3],
    fetchImpl,
    sleepImpl: async (ms) => { waits.push(ms); },
  });

  assert.equal(result.status, 200);
  assert.equal(calls.length, 3);
  assert.deepEqual(waits, [1, 2]);
});

test('GitHub transport preserves endpoint, attempt and request id after retry exhaustion', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return response(503, { message: 'No server is currently available' }, { 'x-github-request-id': 'ABC1:DEF2' });
  };

  await assert.rejects(
    githubRequest('https://api.github.com/user?check=1', {}, {
      delaysMs: [0, 0, 0],
      fetchImpl,
      sleepImpl: async () => {},
    }),
    (error) => {
      assert.equal(error.status, 503);
      assert.equal(error.path, '/user?check=1');
      assert.equal(error.attempt, 4);
      assert.equal(error.requestId, 'ABC1:DEF2');
      assert.match(error.message, /GET \/user\?check=1/);
      assert.match(error.message, /attempt=4/);
      assert.match(error.message, /requestId=ABC1:DEF2/);
      return true;
    },
  );
  assert.equal(calls, 4);
});

test('GitHub transport leaves non-transient auth failures to the existing caller', async () => {
  const result = await githubRequest('https://api.github.com/user', {}, {
    delaysMs: [0, 0, 0],
    fetchImpl: async () => response(401, { message: 'Bad credentials' }),
    sleepImpl: async () => {},
    throwOnNonRetryable: false,
  });
  assert.equal(result.status, 401);
});

test('global retry installer scopes itself to GitHub API and OAuth endpoints', async () => {
  assert.equal(__githubHttpTest.shouldRetryGitHubUrl('https://api.github.com/user'), true);
  assert.equal(__githubHttpTest.shouldRetryGitHubUrl('https://github.com/login/oauth/access_token'), true);
  assert.equal(__githubHttpTest.shouldRetryGitHubUrl('https://github.com/hstptcn5/dev30'), false);
  assert.equal(__githubHttpTest.shouldRetryGitHubUrl('https://api.resend.com/emails'), false);

  const seen = [];
  const target = {
    fetch: async (url) => {
      seen.push(String(url));
      return response(200, { ok: true });
    },
  };
  assert.equal(installGitHubFetchRetry(target), true);
  assert.equal(installGitHubFetchRetry(target), false);
  await target.fetch('https://api.resend.com/emails');
  await target.fetch('https://api.github.com/user');
  assert.deepEqual(seen, ['https://api.resend.com/emails', 'https://api.github.com/user']);
});

test('weekly scheduler does not consume run/report quota before a prepared report exists', async () => {
  const source = await readFile(new URL('../src/saas-routes.mjs', import.meta.url), 'utf8');
  const analysis = source.indexOf('deps.buildAnalysis({');
  const prepared = source.indexOf("status: 'prepared'");
  const scheduledUsage = source.indexOf("consumeEntitlement(schedule.workspaceId, 'scheduled_run')");
  const reportUsage = source.indexOf("consumeEntitlement(schedule.workspaceId, 'report')");

  assert.ok(analysis >= 0, 'scheduled analysis call should exist');
  assert.ok(prepared > analysis, 'prepared delivery receipt must follow successful analysis/report creation');
  assert.ok(scheduledUsage > prepared, 'scheduled_run quota must be consumed after prepared receipt');
  assert.ok(reportUsage > scheduledUsage, 'report quota must be consumed once after scheduled_run');
});
