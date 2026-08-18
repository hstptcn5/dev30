import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { changeSummary, hasWorkMix, isMeaninglessFocus } from '../public/ui-simplification.js';

test('empty focus labels are treated as no meaningful development focus', () => {
  for (const value of ['', 'Unknown', 'Không có', 'No activity', 'N/A']) {
    assert.equal(isMeaninglessFocus(value), true, value);
  }
  assert.equal(isMeaninglessFocus('dev30'), false);
});

test('two empty snapshots do not produce a fake focus move', () => {
  const summary = changeSummary(
    { mainFocus: { repo: 'Không có' } },
    { mainFocus: { repo: 'Unknown' } },
  );
  assert.equal(summary.kind, 'unchanged');
  assert.match(summary.title, /No meaningful change/);
  assert.doesNotMatch(summary.title, /Focus moved/);
});

test('real focus change remains visible', () => {
  const summary = changeSummary(
    { mainFocus: { repo: 'dev30' } },
    { mainFocus: { repo: 'goflow' } },
  );
  assert.equal(summary.kind, 'moved');
  assert.equal(summary.title, 'Focus moved to dev30');
});

test('work DNA is only useful when the snapshot has non-zero work mix', () => {
  assert.equal(hasWorkMix({ workMix: { build: 0, release: 0 } }), false);
  assert.equal(hasWorkMix({ workMix: { build: 42, release: 0 } }), true);
  assert.equal(hasWorkMix(null), false);
});

test('simplification layer loads after paid beta and visual storytelling layers', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /visual-story\.css[\s\S]*ui-simplification\.css/);
  assert.match(html, /paid-beta\.js[\s\S]*visual-story\.js[\s\S]*ui-simplification\.js/);
});

test('simplification removes redundant landing, workspace history and free weekly form surfaces', async () => {
  const source = await readFile(new URL('../public/ui-simplification.js', import.meta.url), 'utf8');
  assert.match(source, /example-preview/);
  assert.match(source, /value-strip/);
  assert.match(source, /paid-beta-workspace-onboarding/);
  assert.match(source, /Recent history/i);
  assert.match(source, /form\.hidden = freePreview/);
  assert.match(source, /No meaningful change since the previous snapshot/);
  assert.match(source, /dataset\.uiSimplified/);
});
