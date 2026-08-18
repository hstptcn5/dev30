import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { installWorkspaceJournalFetch, mergeWorkspaceSnapshots } from '../public/workspace-journal.js';

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

test('workspace journal bridge merges connected public and private history across both report languages', async () => {
  const calls = [];
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const nativeFetch = async (input) => {
    const url = new URL(String(input), 'https://getdev30.xyz');
    calls.push(url);
    if (url.pathname === '/api/workspace') {
      const locale = url.searchParams.get('locale') === 'en' ? 'en' : 'vi';
      return json({
        viewer: { login: 'alice' },
        days: 30,
        locale,
        snapshots: [{
          id: `private-${locale}`,
          generatedAt: locale === 'en' ? '2026-08-18T04:00:00.000Z' : '2026-08-18T02:00:00.000Z',
          includePrivate: true,
          locale,
        }],
      });
    }
    if (url.pathname === '/api/history') {
      const locale = url.searchParams.get('locale');
      return json({
        entries: [{
          id: `public-${locale}`,
          generatedAt: locale === 'en' ? '2026-08-18T03:00:00.000Z' : '2026-08-18T01:00:00.000Z',
          includePrivate: false,
          locale,
        }],
      });
    }
    return new Response('not found', { status: 404 });
  };
  const fakeWindow = {
    fetch: nativeFetch,
    location: { pathname: '/workspace', origin: 'https://getdev30.xyz' },
  };

  assert.equal(installWorkspaceJournalFetch(fakeWindow), true);
  const response = await fakeWindow.fetch('/api/workspace?days=30&locale=vi', { cache: 'no-store' });
  const workspace = await response.json();

  assert.deepEqual(workspace.snapshots.map((entry) => entry.id), [
    'private-en',
    'public-en',
    'private-vi',
    'public-vi',
  ]);
  assert.deepEqual(workspace.journalLocalesIncluded, ['vi', 'en']);
  const historyCalls = calls.filter((url) => url.pathname === '/api/history');
  assert.equal(historyCalls.length, 2);
  assert.ok(historyCalls.every((url) => url.searchParams.get('username') === 'alice'));
  assert.ok(historyCalls.every((url) => url.searchParams.get('includePrivate') === 'false'));
});

test('workspace journal bridge loads before workspace and paid beta renderers', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /workspace-journal\.js[\s\S]*workspace\.js[\s\S]*paid-beta\.js/);
});
