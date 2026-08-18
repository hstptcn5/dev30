import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { mergeWorkspaceSnapshots } from '../public/workspace-journal.js';

test('workspace journal merges public and private snapshots, dedupes and sorts newest first', () => {
  const privateEntries = [
    { id: 'private-1', generatedAt: '2026-08-18T02:00:00.000Z', includePrivate: true },
    { id: 'shared-id', generatedAt: '2026-08-17T02:00:00.000Z', includePrivate: true },
  ];
  const publicEntries = [
    { id: 'public-1', generatedAt: '2026-08-18T03:00:00.000Z', includePrivate: false },
    { id: 'shared-id', generatedAt: '2026-08-19T02:00:00.000Z', includePrivate: false },
  ];

  const merged = mergeWorkspaceSnapshots(privateEntries, publicEntries, 12);
  assert.deepEqual(merged.map((entry) => entry.id), ['public-1', 'private-1', 'shared-id']);
  assert.equal(merged.find((entry) => entry.id === 'shared-id').includePrivate, true);
});

test('workspace journal bridge loads before workspace and paid beta renderers', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /workspace-journal\.js[\s\S]*workspace\.js[\s\S]*paid-beta\.js/);
});

test('workspace journal bridge requests public history for the connected viewer only', async () => {
  const source = await readFile(new URL('../public/workspace-journal.js', import.meta.url), 'utf8');
  assert.match(source, /workspace\.viewer\.login/);
  assert.match(source, /historyUrl\.searchParams\.set\('username', workspace\.viewer\.login\)/);
  assert.match(source, /historyUrl\.searchParams\.set\('includePrivate', 'false'\)/);
  assert.match(source, /publicSnapshotsIncluded: true/);
});
