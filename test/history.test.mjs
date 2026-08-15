import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildSnapshot, compareSnapshots, listSnapshots, saveSnapshot } from '../src/history.mjs';

function fixture({ commits = 3, includePrivate = false, focus = 'Goflow', extraRepo = false } = {}) {
  const repos = [
    { name: 'Goflow', visibility: 'public', commits, pullRequests: 2, language: 'Go', stars: 32 },
  ];
  if (includePrivate) repos.push({ name: 'codeproof', visibility: 'private', commits: 4, pullRequests: 1, language: 'TypeScript', stars: 0 });
  if (extraRepo) repos.push({ name: 'dev30', visibility: 'public', commits: 2, pullRequests: 1, language: 'JavaScript', stars: 0 });
  const dataset = {
    profile: { login: 'hstptcn5', name: 'hstptcn5', avatarUrl: 'https://example.test/a.png' },
    window: { days: 30 },
    collector: { includePrivate },
    repos,
    workMix: { build: 60, harden: 5, test: 10, release: 15, maintain: 5, docs: 5 },
    workUnits: [
      { repo: 'Goflow', date: '2026-08-15', title: `Ship Goflow ${commits}`, category: 'release', evidenceIds: ['E1'] },
      ...(extraRepo ? [{ repo: 'dev30', date: '2026-08-16', title: 'Add history', category: 'build', evidenceIds: ['E2'] }] : []),
    ],
  };
  const payload = { report: { headline: 'Recent work', mainFocus: { repo: focus, title: `${focus} focus` } } };
  return { dataset, payload };
}

test('snapshot store persists and deduplicates identical analyses', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dev30-history-'));
  const filePath = path.join(dir, 'history.json');
  const { dataset, payload } = fixture();
  const first = buildSnapshot({ dataset, payload, locale: 'vi', generatedAt: '2026-08-15T10:00:00.000Z' });
  const savedFirst = await saveSnapshot(first, { filePath });
  assert.equal(savedFirst.created, true);
  assert.equal(savedFirst.total, 1);

  const duplicate = buildSnapshot({ dataset, payload, locale: 'vi', generatedAt: '2026-08-15T11:00:00.000Z' });
  const savedDuplicate = await saveSnapshot(duplicate, { filePath });
  assert.equal(savedDuplicate.created, false);
  assert.equal(savedDuplicate.snapshot.id, first.id);

  const entries = await listSnapshots({ username: 'hstptcn5', days: 30, includePrivate: false, locale: 'vi', filePath });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].mainFocus.repo, 'Goflow');

  const stored = JSON.parse(await readFile(filePath, 'utf8'));
  assert.equal(stored.snapshots.length, 1);
});

test('snapshot comparison finds new repos, activity changes, focus, and new work units', async () => {
  const beforeFixture = fixture({ commits: 3 });
  const afterFixture = fixture({ commits: 6, extraRepo: true, focus: 'dev30' });
  const before = buildSnapshot({ ...beforeFixture, locale: 'en', generatedAt: '2026-08-15T10:00:00.000Z' });
  const after = buildSnapshot({ ...afterFixture, locale: 'en', generatedAt: '2026-08-22T10:00:00.000Z' });
  const delta = compareSnapshots(before, after);

  assert.deepEqual(delta.newRepos, ['dev30']);
  assert.equal(delta.focus.changed, true);
  assert.equal(delta.focus.from.repo, 'Goflow');
  assert.equal(delta.focus.to.repo, 'dev30');
  assert.equal(delta.repoChanges.find((item) => item.repo === 'Goflow').commitDelta, 3);
  assert.equal(delta.newWorkUnits.some((item) => item.repo === 'dev30' && item.title === 'Add history'), true);
});

test('public and private snapshot series remain separated', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dev30-history-private-'));
  const filePath = path.join(dir, 'history.json');
  const publicFixture = fixture({ includePrivate: false });
  const privateFixture = fixture({ includePrivate: true });
  await saveSnapshot(buildSnapshot({ ...publicFixture, locale: 'vi' }), { filePath });
  await saveSnapshot(buildSnapshot({ ...privateFixture, locale: 'vi' }), { filePath });

  const publicEntries = await listSnapshots({ username: 'hstptcn5', days: 30, includePrivate: false, locale: 'vi', filePath });
  const privateEntries = await listSnapshots({ username: 'hstptcn5', days: 30, includePrivate: true, locale: 'vi', filePath });
  assert.equal(publicEntries.length, 1);
  assert.equal(privateEntries.length, 1);
  assert.equal(publicEntries[0].includePrivate, false);
  assert.equal(privateEntries[0].includePrivate, true);
});
