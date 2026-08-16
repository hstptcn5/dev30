import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('home loads the Pro Max UX layer after existing styles and scripts', async () => {
  const html = await read('public/index.html');
  assert.match(html, /\/ux-overrides\.css[\s\S]*\/pro-max\.css/);
  assert.match(html, /\/workspace\.js[\s\S]*\/pro-max\.js/);
  assert.equal((html.match(/id="analyze-button"/g) || []).length, 1);
  assert.match(html, /Evidence-backed GitHub work briefing/);
  assert.match(html, /A briefing you can scan in 30 seconds/);
});

test('Pro Max CSS preserves the reader-first hierarchy and responsive states', async () => {
  const css = await read('public/pro-max.css');
  assert.match(css, /\.report-story/);
  assert.match(css, /\.story-card\{/);
  assert.match(css, /\.technical-drawer/);
  assert.match(css, /\.workspace-overview/);
  assert.match(css, /@media\(max-width:980px\)/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /focus-visible/);
  assert.doesNotMatch(css, /#[a-f0-9]{3,8}[^\n]*(purple|magenta)/i);
});

test('recoverable UI failures are non-blocking while destructive confirmation remains untouched', async () => {
  const proMax = await read('public/pro-max.js');
  const workspace = await read('public/workspace.js');
  assert.match(proMax, /window\.alert = \(message\) => toast\(message, 'error'\)/);
  assert.match(proMax, /aria-live/);
  assert.match(workspace, /confirm\('Disconnect GitHub and stop scheduled work for this workspace\?'\)/);
});

test('design delta documents product-first constraints and real responsive targets', async () => {
  const doc = await read('docs/UI_UX_PRO_MAX.md');
  for (const phrase of [
    'one dominant primary action',
    'show value early',
    'reader/briefing',
    '375px',
    '768px',
    '1024px',
    '1440px',
    'private repository opt-in',
  ]) assert.match(doc, new RegExp(phrase.replace('/', '\\/'), 'i'));
});
