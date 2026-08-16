import test from 'node:test';
import assert from 'node:assert/strict';
import { quotaError } from '../src/entitlements.mjs';
import { __saasRoutesTest } from '../src/saas-routes.mjs';

test('quota exhaustion is non-transient for scheduled work while provider 429 remains retryable', () => {
  const quota = quotaError('scheduled_run', { plan: 'free', used: 4, limit: 4 });
  assert.equal(quota.code, 'quota_exceeded');
  assert.equal(__saasRoutesTest.retryable(quota), false);

  const providerRateLimit = Object.assign(new Error('provider rate limit'), { status: 429 });
  assert.equal(__saasRoutesTest.retryable(providerRateLimit), true);
});
