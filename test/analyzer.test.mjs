import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWork, isValidGitHubUsername, normalizeReport, summarizeWorkMix } from '../src/analyzer.mjs';

test('validates GitHub usernames conservatively', () => {
  assert.equal(isValidGitHubUsername('hstptcn5'), true);
  assert.equal(isValidGitHubUsername('octo-cat'), true);
  assert.equal(isValidGitHubUsername('-bad'), false);
  assert.equal(isValidGitHubUsername('bad-'), false);
  assert.equal(isValidGitHubUsername('bad--name'), false);
  assert.equal(isValidGitHubUsername('a'.repeat(40)), false);
});

test('classifies evidence into useful work categories', () => {
  assert.equal(classifyWork({ message: 'feat: add dashboard' }), 'build');
  assert.equal(classifyWork({ message: 'fix scheduler recovery after restart' }), 'harden');
  assert.equal(classifyWork({ files: ['tests/e2e/login.spec.ts'] }), 'test');
  assert.equal(classifyWork({ files: ['docs/setup.md'] }), 'docs');
  assert.equal(classifyWork({ message: 'chore: bump dependencies' }), 'maintain');
});

test('work mix produces percentages', () => {
  const mix = summarizeWorkMix([
    { title: 'feat: add export', files: [] },
    { title: 'fix auth validation', files: [] },
    { title: 'docs: setup', files: ['README.md'] },
    { title: 'test browser flow', files: ['test/e2e.spec.js'] },
  ]);
  assert.equal(Object.values(mix).reduce((a, b) => a + b, 0), 100);
  assert.equal(mix.build, 25);
});

test('normalizer drops hallucinated evidence references', () => {
  const fallback = { headline: 'fallback', summary: 'fallback', mainFocus: { repo: 'repo', title: 'focus', explanation: 'x' } };
  const report = normalizeReport({
    headline: 'ok',
    mainFocus: { repo: 'repo', evidenceIds: ['E1', 'E999'] },
    projects: [{ repo: 'repo', evidenceIds: ['E2', 'made-up'] }],
  }, [{ id: 'E1' }, { id: 'E2' }], fallback);
  assert.deepEqual(report.mainFocus.evidenceIds, ['E1']);
  assert.deepEqual(report.projects[0].evidenceIds, ['E2']);
});
