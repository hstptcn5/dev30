import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('polish layers load after the established Pro Max light theme', async () => {
  const html = await read('public/index.html');
  assert.match(html, /\/pro-max\.css[\s\S]*\/light-theme\.css[\s\S]*\/polish\.css/);
  assert.match(html, /\/pro-max\.js[\s\S]*\/polish\.js/);
});

test('home polish reduces desktop whitespace and keeps connected account secondary', async () => {
  const css = await read('public/polish.css');
  assert.match(css, /\.hero\{[\s\S]*padding:52px 0 34px/);
  assert.match(css, /\.account-inline\{[\s\S]*min-height:54px/);
  assert.match(css, /\.private-privacy-note\{[\s\S]*font-size:9px/);
  assert.match(css, /@media\(max-width:760px\)/);
});

test('workspace polish makes latest activity the dominant surface', async () => {
  const [css, js] = await Promise.all([read('public/polish.css'), read('public/polish.js')]);
  assert.match(css, /\.workspace-overview\{[\s\S]*1\.55fr/);
  assert.match(css, /\.workspace-primary-card\{[\s\S]*background:linear-gradient/);
  assert.match(js, /prioritizeWorkspaceLatestActivity/);
  assert.match(js, /workspace-primary-actions/);
  assert.match(js, /duplicateLink\?\.remove\(\)/);
});

test('connected account copy is compacted without hiding private availability', async () => {
  const js = await read('public/polish.js');
  assert.match(js, /const compact = `\$\{match\[1\]\} private repos available`/);
  assert.match(js, /accountNote\.textContent !== compact/);
  assert.match(js, /accountNote\.textContent = compact/);
});
