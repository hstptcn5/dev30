import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('light theme is the final visual layer', async () => {
  const html = await read('public/index.html');
  assert.match(html, /meta name="color-scheme" content="light"/);
  assert.match(html, /\/pro-max\.css[\s\S]*\/light-theme\.css/);
});

test('light theme replaces dark tokens while preserving functional accents', async () => {
  const css = await read('public/light-theme.css');
  assert.match(css, /color-scheme:light/);
  assert.match(css, /--pm-bg:#f7f8f5/);
  assert.match(css, /--pm-surface:#ffffff/);
  assert.match(css, /--pm-ink:#18221d/);
  assert.match(css, /--pm-accent:#2c7455/);
  assert.match(css, /--pm-blue:#356eb8/);
  assert.doesNotMatch(css, /color-scheme:dark/);
});

test('main user-facing surfaces explicitly resolve to light backgrounds', async () => {
  const css = await read('public/light-theme.css');
  for (const selector of [
    '.search-card',
    '.username-field',
    '.preview-card',
    '.technical-drawer,.evidence-details',
    '.workspace-form',
    '.client-report-card',
  ]) assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(css, /\.workspace-settings\{[\s\S]*background:#ffffff/);
  assert.match(css, /\.account-inline\{[\s\S]*background:#edf7f1/);
});

test('design delta records explicit light-theme preference above aesthetics', async () => {
  const doc = await read('docs/UI_UX_PRO_MAX.md');
  assert.match(doc, /Use a light interface\. Avoid a dark overall theme\./);
  assert.match(doc, /explicit user intent overrides earlier aesthetic preservation decisions/i);
  assert.match(doc, /warm-light editorial/i);
  assert.match(doc, /375px/);
  assert.match(doc, /1440px/);
});
