import assert from 'node:assert/strict';
import test from 'node:test';
import { __analysisJobTest } from '../src/analysis-job-store.mjs';

test('analysis job status binds to the opaque Dev30 session cookie', () => {
  assert.equal(__analysisJobTest.sessionIdFromCookie('foo=1; dev30_session=abc123; bar=2'), 'abc123');
  assert.equal(__analysisJobTest.sessionIdFromCookie('dev30_session='), null);
  assert.equal(__analysisJobTest.sessionIdFromCookie('foo=1'), null);
});
