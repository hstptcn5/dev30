import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(relative) {
  return readFile(new URL(relative, import.meta.url), 'utf8');
}

test('hosted cron enqueues the Netlify background scheduler route with the cron credential', async () => {
  const workflow = await source('../.github/workflows/hosted-cron.yml');
  assert.match(workflow, /Authorization: Bearer \$\{DEV30_CRON_SECRET\}/);
  assert.match(workflow, /\/api\/internal\/run-due-background/);
  assert.doesNotMatch(workflow, /"\$\{DEV30_HOSTED_URL%\/\}\/api\/internal\/run-due"/);
});

test('scheduled background adapter forwards to the existing authenticated run-due endpoint', async () => {
  const background = await source('../netlify/functions/dev30-run-due-background.mjs');
  assert.match(background, /url\.pathname = '\/api\/internal\/run-due'/);
  assert.match(background, /headers: new Headers\(request\.headers\)/);
  assert.match(background, /path: '\/api\/internal\/run-due-background'/);
  assert.match(background, /background: true/);
});

test('standard Netlify API adapter excludes the scheduled background route', async () => {
  const adapter = await source('../netlify/functions/dev30.mjs');
  assert.match(adapter, /'\/api\/internal\/run-due-background'/);
  assert.match(adapter, /excludedPath:/);
});

test('syntax check includes the scheduled background function', async () => {
  const packageJson = JSON.parse(await source('../package.json'));
  assert.match(packageJson.scripts.check, /netlify\/functions\/dev30-run-due-background\.mjs/);
});
