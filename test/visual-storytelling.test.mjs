import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildTimelineEntries, buildWorkMix } from '../public/visual-story.js';

test('visual journal timeline keeps recent snapshots chronological and marks the latest', () => {
  const entries = buildTimelineEntries([
    { id: 'b', generatedAt: '2026-08-18T09:00:00.000Z', mainFocus: { repo: 'beta', title: 'Beta work' }, evidenceCount: 4, repoCount: 2 },
    { id: 'a', generatedAt: '2026-08-16T09:00:00.000Z', mainFocus: { repo: 'alpha', title: 'Alpha work' }, evidenceCount: 2, repoCount: 1 },
    { id: 'c', generatedAt: '2026-08-19T09:00:00.000Z', mainFocus: { repo: 'gamma', title: 'Gamma work' }, evidenceCount: 8, repoCount: 3, includePrivate: true },
  ], 2);

  assert.deepEqual(entries.map((entry) => entry.id), ['b', 'c']);
  assert.equal(entries[0].latest, false);
  assert.equal(entries[1].latest, true);
  assert.equal(entries[1].includePrivate, true);
  assert.equal(entries[1].evidenceCount, 8);
});

test('work DNA keeps the strongest non-zero work mix signals', () => {
  const mix = buildWorkMix({ build: 48, reliability: 22, docs: 0, release: 18, refactor: 12, misc: 3 }, 4);
  assert.deepEqual(mix, [
    { name: 'build', value: 48 },
    { name: 'reliability', value: 22 },
    { name: 'release', value: 18 },
    { name: 'refactor', value: 12 },
  ]);
});

test('visual storytelling layer is last so it can enhance paid beta and workspace surfaces', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /paid-beta\.css[\s\S]*visual-story\.css/);
  assert.match(html, /workspace-journal\.js[\s\S]*workspace\.js[\s\S]*paid-beta\.js[\s\S]*visual-story\.js/);
});

test('visual storytelling covers landing, report, journal and weekly email preview', async () => {
  const source = await readFile(new URL('../public/visual-story.js', import.meta.url), 'utf8');
  assert.match(source, /From activity to a work story/);
  assert.match(source, /See the briefing as a connected system/);
  assert.match(source, /Your work story over time/);
  assert.match(source, /Work DNA/);
  assert.match(source, /From GitHub activity to an email someone can actually read/);
  assert.match(source, /visual-email-subject/);
});

test('visual layer respects reduced-motion users', async () => {
  const css = await readFile(new URL('../public/visual-story.css', import.meta.url), 'utf8');
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /visual-activity-pipeline/);
  assert.match(css, /visual-journal-stage/);
  assert.match(css, /visual-weekly-preview/);
});
