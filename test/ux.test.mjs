import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('home presents one primary analysis flow instead of competing account CTAs', async () => {
  const html = await read('index.html');
  assert.equal((html.match(/id="analyze-button"/g) || []).length, 1);
  assert.match(html, /See their work/);
  assert.match(html, /id="private-toggle"/);
  assert.doesNotMatch(html, /Analyze my account/);
  assert.match(html, /A briefing[^<]*30 seconds/);
});

test('connected account UI keeps implementation jargon out of the home experience', async () => {
  const access = await read('access.js');
  assert.doesNotMatch(access, /PAT fallback/);
  assert.doesNotMatch(access, /workspaceId/);
  assert.match(access, /GitHub connected/);
  assert.match(access, /private repos available/);
});

test('report is story-first and technical information is secondary', async () => {
  const app = await read('app.js');
  assert.match(app, /30-day briefing|\$\{data\.window\.days\}-day briefing/);
  assert.match(app, /What they worked on/);
  assert.match(app, /Technical details · work mix, repositories and timeline/);
  assert.match(app, /E\('details', 'technical-drawer'\)/);
  assert.doesNotMatch(app, /mode-switch/);
});

test('workspace leads with progress before settings and plan details', async () => {
  const workspace = await read('workspace.js');
  assert.match(workspace, /Latest activity snapshot/);
  assert.match(workspace, /Since last snapshot/);
  assert.match(workspace, /Next stakeholder update/);
  assert.match(workspace, /Workspace settings/);
  assert.ok(workspace.indexOf('Latest activity snapshot') < workspace.indexOf('Workspace settings'));
});

test('responsive UX rules exist for home, report, and workspace', async () => {
  const [styles, workspace] = await Promise.all([read('styles.css'), read('workspace.css')]);
  assert.match(styles, /@media\(max-width:760px\)/);
  assert.match(styles, /\.project-grid\{grid-template-columns:1fr\}/);
  assert.match(workspace, /@media\(max-width:760px\)/);
  assert.match(workspace, /\.workspace-overview,\.workspace-history-columns,\.workspace-settings-body\{grid-template-columns:1fr\}/);
});
