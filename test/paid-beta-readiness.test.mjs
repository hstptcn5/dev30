import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { renderStakeholderEmail } from '../src/email.mjs';

async function source(relative) {
  return readFile(new URL(relative, import.meta.url), 'utf8');
}

test('paid beta UX layer loads after existing polish layers', async () => {
  const html = await source('../public/index.html');
  assert.match(html, /commercial\.css[\s\S]*paid-beta\.css/);
  assert.match(html, /richness\.js[\s\S]*paid-beta\.js/);
});

test('new users are guided through connect, analyze and track without submitting a doomed fresh analysis', async () => {
  const ux = await source('../public/paid-beta.js');
  assert.match(ux, /Connect GitHub to analyze/);
  assert.match(ux, /dev30-post-connect-draft/);
  assert.match(ux, /event\.stopImmediatePropagation\(\)/);
  assert.match(ux, /dev30Journey/);
  assert.match(ux, /Connect GitHub[\s\S]*Analyze recent work[\s\S]*Keep the journal going/);
});

test('paid beta UX explains Pro gating and converts provider failures into recovery states', async () => {
  const ux = await source('../public/paid-beta.js');
  assert.match(ux, /Private repositories and weekly stakeholder updates are included with Dev30 Pro/);
  assert.match(ux, /GitHub is having trouble responding right now/);
  assert.match(ux, /Dev30 could not verify your plan right now/);
  assert.match(ux, /requestSubmit\(\)/);
  assert.match(ux, /See Dev30 Pro/);
});

test('workspace onboarding points to the next best action and preserves a visible delivery proof', async () => {
  const ux = await source('../public/paid-beta.js');
  assert.match(ux, /Your next best action/);
  assert.match(ux, /Create first snapshot/);
  assert.match(ux, /Set up weekly update/);
  assert.match(ux, /Last weekly email delivered/);
  assert.match(ux, /Weekly automatic updates are a Pro feature/);
});

test('shared stakeholder reports contain a product return path', async () => {
  const ux = await source('../public/paid-beta.js');
  assert.match(ux, /Want a briefing like this for your own GitHub work\?/);
  assert.match(ux, /Create my Dev30 briefing/);
});

test('private weekly email returns to workspace while public email keeps its evidence-backed report link', () => {
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    username: 'octocat',
    markdown: '# Weekly update',
    report: {
      title: 'Weekly update',
      executiveSummary: 'A concise summary.',
      shipped: [],
      changedSinceLast: [],
      currentDirection: 'Keep shipping.',
      note: 'Evidence-backed.',
    },
  };

  const privateEmail = renderStakeholderEmail({ ...base, shareable: false }, { appBaseUrl: 'https://getdev30.xyz' });
  assert.match(privateEmail.html, /Open Dev30 workspace/);
  assert.match(privateEmail.html, /https:\/\/getdev30\.xyz\/workspace/);
  assert.match(privateEmail.text, /Open Dev30 workspace: https:\/\/getdev30\.xyz\/workspace/);
  assert.doesNotMatch(privateEmail.html, /\/r\/11111111/);

  const publicEmail = renderStakeholderEmail({ ...base, shareable: true }, { appBaseUrl: 'https://getdev30.xyz' });
  assert.match(publicEmail.html, /Open evidence-backed report/);
  assert.match(publicEmail.html, /https:\/\/getdev30\.xyz\/r\/11111111-1111-4111-8111-111111111111/);
  assert.match(publicEmail.html, /Open your Dev30 workspace/);
});
