import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkUnits,
  classifyWork,
  confidenceForEvidenceIds,
  isValidGitHubUsername,
  normalizeReport,
  summarizeWorkMix,
} from '../src/analyzer.mjs';

test('validates GitHub usernames conservatively', () => {
  assert.equal(isValidGitHubUsername('hstptcn5'), true);
  assert.equal(isValidGitHubUsername('octo-cat'), true);
  assert.equal(isValidGitHubUsername('-bad'), false);
  assert.equal(isValidGitHubUsername('bad-'), false);
  assert.equal(isValidGitHubUsername('bad--name'), false);
  assert.equal(isValidGitHubUsername('a'.repeat(40)), false);
});

test('classifies explicit engineering semantics before generic build work', () => {
  assert.equal(classifyWork({ message: 'feat: add dashboard' }), 'build');
  assert.equal(classifyWork({ message: 'fix scheduler recovery after restart' }), 'harden');
  assert.equal(classifyWork({ message: 'test: add final DailyOps appliance E2E' }), 'test');
  assert.equal(classifyWork({ message: 'ci: add and harden Windows pilot appliance' }), 'release');
  assert.equal(classifyWork({ files: ['tests/e2e/login.spec.ts'] }), 'test');
  assert.equal(classifyWork({ files: ['.github/workflows/release.yml'] }), 'release');
  assert.equal(classifyWork({ files: ['docs/setup.md'] }), 'docs');
  assert.equal(classifyWork({ message: 'chore: bump dependencies' }), 'maintain');
});

test('work mix uses stable percentages that sum to 100', () => {
  const mix = summarizeWorkMix([
    { title: 'feat: add export', files: [] },
    { title: 'fix auth validation', files: [] },
    { title: 'docs: setup', files: ['README.md'] },
    { title: 'test: browser flow', files: ['test/e2e.spec.js'] },
    { title: 'ci: publish release artifact', files: ['.github/workflows/release.yml'] },
  ]);
  assert.equal(Object.values(mix).reduce((a, b) => a + b, 0), 100);
  assert.equal(mix.build, 20);
  assert.equal(mix.harden, 20);
  assert.equal(mix.test, 20);
  assert.equal(mix.release, 20);
  assert.equal(mix.docs, 20);
});

test('deduplicates pull requests and their merge commits into one work unit', () => {
  const evidence = [
    { id: 'E1', type: 'pull_request', repo: 'Goflow', repoFullName: 'hstptcn5/Goflow', ref: '23', date: '2026-08-15', title: 'docs: define Goflow product direction', files: ['README.md'] },
    { id: 'E2', type: 'commit', repo: 'Goflow', repoFullName: 'hstptcn5/Goflow', ref: 'abcd1234', date: '2026-08-15', title: 'Merge pull request #23 from hstptcn5/docs-reset', files: ['README.md'] },
    { id: 'E3', type: 'commit', repo: 'Goflow', repoFullName: 'hstptcn5/Goflow', ref: 'efgh5678', date: '2026-08-14', title: 'feat: add scheduler', files: ['internal/scheduler/run.go'] },
  ];
  const units = buildWorkUnits(evidence);
  assert.equal(units.length, 2);
  const prUnit = units.find((unit) => unit.type === 'pull_request');
  assert.deepEqual(prUnit.evidenceIds, ['E1', 'E2']);
  assert.equal(prUnit.category, 'docs');
});

test('assigns claim confidence from evidence strength', () => {
  const evidence = [
    { id: 'E1', type: 'pull_request' },
    { id: 'E2', type: 'pull_request' },
    { id: 'E3', type: 'commit' },
  ];
  assert.equal(confidenceForEvidenceIds(['E1', 'E2'], evidence), 'strong');
  assert.equal(confidenceForEvidenceIds(['E1'], evidence), 'moderate');
  assert.equal(confidenceForEvidenceIds(['E3'], evidence), 'limited');
});

test('normalizer drops hallucinated refs, infers repo and sorts timeline newest first', () => {
  const fallback = { headline: 'fallback', summary: 'fallback', mainFocus: { repo: 'repo', title: 'focus', explanation: 'x' } };
  const report = normalizeReport({
    headline: 'ok',
    mainFocus: { repo: 'Goflow', evidenceIds: ['E1', 'E999'] },
    projects: [{ repo: '', title: 'Release v0.1', evidenceIds: ['E2', 'made-up'] }],
    timeline: [
      { date: '2026-08-01', label: 'older', evidenceIds: ['E2'] },
      { date: '2026-08-15', label: 'newer', evidenceIds: ['E1'] },
    ],
  }, [
    { id: 'E1', type: 'pull_request', repo: 'Goflow' },
    { id: 'E2', type: 'pull_request', repo: 'CatenaNode' },
  ], fallback);
  assert.deepEqual(report.mainFocus.evidenceIds, ['E1']);
  assert.deepEqual(report.projects[0].evidenceIds, ['E2']);
  assert.equal(report.projects[0].repo, 'CatenaNode');
  assert.equal(report.timeline[0].date, '2026-08-15');
  assert.equal(report.timeline[1].date, '2026-08-01');
});
