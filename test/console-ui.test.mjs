import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('console UI is loaded as the final presentation layer without replacing Dev30 runtime scripts', async () => {
  const html = await read('public/index.html');
  assert.match(html, /console-ui\.css[\s\S]*console-ui-polish\.css/);
  assert.match(html, /app\.js[\s\S]*workspace-journal\.js[\s\S]*console-ui-preload\.js[\s\S]*workspace\.js/);
  assert.match(html, /portable-output\.js[\s\S]*console-ui\.js[\s\S]*console-ui-route\.js/);
  assert.match(html, /monetization\.js/);
});

test('console state bridge observes real Dev30 API responses only and emits after response consumers render', async () => {
  const source = await read('public/console-ui-preload.js');
  assert.match(source, /\/api\/analyze/);
  assert.match(source, /\/api\/workspace/);
  assert.match(source, /\/api\/workspace-settings/);
  assert.match(source, /dev30:analysis-rendered/);
  assert.match(source, /dev30:workspace-rendered/);
  assert.match(source, /setTimeout\(/);
  assert.doesNotMatch(source, /queueMicrotask/);
  assert.doesNotMatch(source, /deepseek\.com|revenuecat\.com|resend\.com|supabase\.co/i);
  assert.doesNotMatch(source, /Authorization\s*:/i);
});

test('console presentation keeps Stitch personality but removes unsupported mock product claims', async () => {
  const source = `${await read('public/console-ui.js')}\n${await read('public/console-ui.css')}\n${await read('public/console-ui-polish.css')}`;
  assert.match(source, /DEV30_SCANNER/);
  assert.match(source, /SAVE POINT TIMELINE/);
  assert.match(source, /EVIDENCE_PIPELINE/);
  assert.match(source, /WEEKLY_UPDATE/);
  assert.doesNotMatch(source, /Operational Efficiency|Incidents|Deployments|DEV30 Heavy Industries|GPG|ED25519|SHA256 SIGNATURE/i);
  assert.doesNotMatch(source, /GEMINI_API_KEY|@google\/genai|GoogleGenAI/i);
});

test('workspace console is derived from saved snapshots and actual entitlement state', async () => {
  const source = await read('public/console-ui.js');
  assert.match(source, /workspace\?\.snapshots/);
  assert.match(source, /settings\.entitlement\?\.plan/);
  assert.match(source, /console-free-workspace/);
  assert.match(source, /UNLOCK_WEEKLY_UPDATES/);
  assert.match(source, /hideDuplicateSnapshotList/);
});

test('shared client and founder reports become stakeholder artifacts without changing report generation', async () => {
  const route = await read('public/console-ui-route.js');
  assert.match(route, /STAKEHOLDER_ARTIFACT/);
  assert.match(route, /\^\\\/r\\\//);
  assert.match(route, /data-console-href=\"#report\"/);
  assert.doesNotMatch(route, /\/api\//);
  const report = await read('public/client-report.js');
  assert.match(report, /\/api\/client-report/);
});

test('portable output is presented as a Stitch-style hardware modal without changing export logic', async () => {
  const polish = await read('public/console-ui-polish.css');
  assert.match(polish, /portable-menu\[open\] \.portable-menu-panel/);
  assert.match(polish, /EXPORT_ANALYSIS_SNAPSHOT/);
  assert.match(polish, /100vmax/);
  const source = await read('public/portable-output.js');
  assert.match(source, /'PDF report'/);
  assert.match(source, /'Markdown'/);
  assert.match(source, /'Copy as Markdown'/);
  assert.match(source, /'Full JSON data'/);
  assert.match(source, /'Pixel summary card'/);
});

test('pricing and legal surfaces share the console visual system', async () => {
  for (const path of ['public/pricing.html', 'public/privacy.html', 'public/terms.html', 'public/refunds.html']) {
    const html = await read(path);
    assert.match(html, /console-ui\.css/, path);
    assert.match(html, /console-ui\.js/, path);
  }
});

test('console layer preserves reduced-motion accessibility and responsive side rail fallback', async () => {
  const css = await read('public/console-ui.css');
  const polish = await read('public/console-ui-polish.css');
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.console-side-rail \{ display:none; \}/);
  assert.match(polish, /report-open \.hero/);
  assert.match(polish, /#visual-journal-stage/);
  assert.match(polish, /content: attr\(title\)/);
});
