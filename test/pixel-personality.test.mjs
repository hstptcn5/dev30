import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isQuietSnapshot, saveSlotLabel, scannerPhaseForElapsed } from '../public/pixel-personality.js';

test('scanner animation cycles labels without claiming separate server jobs', () => {
  assert.deepEqual(scannerPhaseForElapsed(0), {
    index: 0,
    code: 'SCAN_GITHUB',
    label: 'Reading the recent activity trail',
  });
  assert.equal(scannerPhaseForElapsed(1100).code, 'INDEX_REPOS');
  assert.equal(scannerPhaseForElapsed(2200).code, 'TRACE_EVIDENCE');
  assert.equal(scannerPhaseForElapsed(3300).code, 'BUILD_STORY');
  assert.equal(scannerPhaseForElapsed(4400).code, 'SCAN_GITHUB');
});

test('save slots use stable human-readable numbering', () => {
  assert.equal(saveSlotLabel(0), 'SAVE_001');
  assert.equal(saveSlotLabel(1), 'SAVE_002');
  assert.equal(saveSlotLabel(11), 'SAVE_012');
});

test('quiet snapshot labels trigger the subtle empty-state companion', () => {
  for (const value of ['Unknown', 'Không có', 'No activity recorded', 'No recent activity']) {
    assert.equal(isQuietSnapshot(value), true, value);
  }
  assert.equal(isQuietSnapshot('dev30 release preparation'), false);
});

test('pixel personality layer loads last after simplification', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /ui-simplification\.css[\s\S]*pixel-personality\.css/);
  assert.match(html, /ui-simplification\.js[\s\S]*pixel-personality\.js/);
});

test('pixel identity stays in accents and interaction moments', async () => {
  const source = await readFile(new URL('../public/pixel-personality.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/pixel-personality.css', import.meta.url), 'utf8');
  assert.match(source, /SCAN_GITHUB/);
  assert.match(source, /SNAPSHOT_SAVED/);
  assert.match(source, /WEEKLY_TX/);
  assert.match(source, /pixel-save-slot/);
  assert.match(source, /These labels show the current scan animation, not separate server jobs/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css, /@import|fonts\.googleapis|url\(https?:/i);
});
