import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildClientReportInput, clientReportToMarkdown, deterministicClientReport, normalizeClientReport, saveClientReport } from '../src/client-report.mjs';

function snapshot({ includePrivate = false } = {}) {
  return {
    id: includePrivate ? 'private-snapshot' : 'public-snapshot',
    generatedAt: '2026-08-15T10:00:00.000Z',
    username: 'hstptcn5',
    days: 7,
    includePrivate,
    locale: 'vi',
    headline: 'Goflow tiến gần hơn đến phát hành.',
    mainFocus: { repo: 'Goflow', title: 'Community release' },
    workMix: { build: 45, harden: 10, test: 15, release: 20, maintain: 5, docs: 5 },
    repos: [
      { name: 'Goflow', visibility: 'public', commits: 10, pullRequests: 3, language: 'Go' },
      ...(includePrivate ? [{ name: 'codeproof', visibility: 'private', commits: 4, pullRequests: 1, language: 'TypeScript' }] : []),
    ],
    workUnits: [
      { repo: 'Goflow', date: '2026-08-15', title: 'Prepare Community release', category: 'release', evidenceIds: ['E1'] },
      ...(includePrivate ? [{ repo: 'codeproof', date: '2026-08-15', title: 'Add provenance validation', category: 'build', evidenceIds: ['E2'] }] : []),
    ],
    evidence: [
      { id: 'E1', type: 'pull_request', repo: 'Goflow', visibility: 'public', date: '2026-08-15', title: 'Prepare Community release', url: 'https://github.com/hstptcn5/Goflow/pull/24', ref: 24 },
      ...(includePrivate ? [{ id: 'E2', type: 'pull_request', repo: 'codeproof', visibility: 'private', date: '2026-08-15', title: 'Add provenance validation', url: 'https://github.com/hstptcn5/codeproof/pull/1', ref: 1 }] : []),
    ],
  };
}

test('client report markdown preserves evidence links', () => {
  const current = snapshot();
  const input = buildClientReportInput({ snapshot: current, audience: 'client', locale: 'vi' });
  const report = deterministicClientReport(input);
  const markdown = clientReportToMarkdown(report, input);
  assert.match(markdown, /Goflow/);
  assert.match(markdown, /E1/);
  assert.match(markdown, /https:\/\/github\.com\/hstptcn5\/Goflow\/pull\/24/);
});

test('normalizer drops hallucinated evidence IDs', () => {
  const input = buildClientReportInput({ snapshot: snapshot(), audience: 'founder', locale: 'vi' });
  const report = normalizeClientReport({
    title: 'Update',
    executiveSummary: 'Summary',
    shipped: [{ repo: 'Goflow', text: 'Release work', evidenceIds: ['E1', 'E999'] }],
    changedSinceLast: [],
    currentDirection: 'Goflow remains the focus.',
    note: 'Evidence-backed.',
  }, input);
  assert.deepEqual(report.shipped[0].evidenceIds, ['E1']);
});

test('public client reports can be shareable while private reports stay local-only', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dev30-client-report-'));
  const filePath = path.join(dir, 'client-reports.json');

  const publicSnapshot = snapshot();
  const publicInput = buildClientReportInput({ snapshot: publicSnapshot, audience: 'client', locale: 'vi' });
  const publicReport = deterministicClientReport(publicInput);
  const publicSaved = await saveClientReport({ snapshot: publicSnapshot, input: publicInput, report: publicReport, markdown: clientReportToMarkdown(publicReport, publicInput) }, { filePath });
  assert.equal(publicSaved.shareable, true);

  const privateSnapshot = snapshot({ includePrivate: true });
  const privateInput = buildClientReportInput({ snapshot: privateSnapshot, audience: 'client', locale: 'vi' });
  const privateReport = deterministicClientReport(privateInput);
  const privateSaved = await saveClientReport({ snapshot: privateSnapshot, input: privateInput, report: privateReport, markdown: clientReportToMarkdown(privateReport, privateInput) }, { filePath });
  assert.equal(privateSaved.shareable, false);
});
