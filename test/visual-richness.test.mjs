import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/richness.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../public/richness.js', import.meta.url), 'utf8');

test('visual richness loads as the final product polish layer', () => {
  assert.match(html, /monetization\.css[\s\S]*richness\.css/);
  assert.match(html, /monetization\.js[\s\S]*richness\.js/);
});

test('report enrichment keeps reader-first hierarchy while adding scanable signals', () => {
  assert.match(js, /briefing-metrics/);
  assert.match(js, /signal-overview/);
  assert.match(js, /work-mix-stack/);
  assert.match(js, /repo-pulse-list/);
  assert.match(js, /evidence-preview-grid/);
  assert.match(js, /Snapshot saved/);
  assert.match(js, /No new snapshot/);
});

test('landing and workspace receive useful product-state richness', () => {
  assert.match(js, /preview-signal-rail/);
  assert.match(js, /value-index/);
  assert.match(js, /workspace-journal-strip/);
  assert.match(js, /workspace-snapshot-pill/);
});

test('visual layer remains responsive and reduced-motion safe', () => {
  assert.match(css, /@media\(max-width:1024px\)/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css, /purple|magenta|glassmorphism/i);
});
