import '../src/env.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  remoteFindClientReportBySignature,
  remoteSaveClientReport,
  remoteSaveSnapshot,
  storageBackend,
  storageReadiness,
} from '../src/storage.mjs';

const apply = process.argv.includes('--apply');
const historyPath = process.env.DEV30_HISTORY_FILE || path.join(process.cwd(), 'data', 'history.json');
const reportsPath = process.env.DEV30_CLIENT_REPORT_FILE || path.join(process.cwd(), 'data', 'client-reports.json');

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function workspaceForReport(report, snapshots) {
  if (!report?.includePrivate) return 'public';
  if (report.workspaceId) return report.workspaceId;
  const snapshot = snapshots.find((item) => item.id === report.snapshotId);
  return snapshot?.workspaceId || `legacy:${String(report.username || '').toLowerCase()}`;
}

async function main() {
  if (storageBackend() !== 'supabase') {
    throw new Error('Set DEV30_STORAGE_BACKEND=supabase before running this migration.');
  }

  const readiness = await storageReadiness();
  if (!readiness.ready) throw new Error(`Remote storage is not ready: ${readiness.error || 'unknown error'}`);

  const historyStore = await readJson(historyPath, { snapshots: [] });
  const reportStore = await readJson(reportsPath, { reports: [] });
  const snapshots = Array.isArray(historyStore.snapshots) ? historyStore.snapshots : [];
  const reports = Array.isArray(reportStore.reports) ? reportStore.reports : [];

  console.log(`Dev30 local → Supabase migration ${apply ? '(APPLY)' : '(DRY RUN)'}`);
  console.log(`snapshots: ${snapshots.length}`);
  console.log(`reports: ${reports.length}`);

  if (!apply) {
    console.log('No writes performed. Re-run with --apply after reviewing the counts.');
    return;
  }

  let snapshotWrites = 0;
  for (const snapshot of snapshots.sort((a, b) => String(a.generatedAt).localeCompare(String(b.generatedAt)))) {
    const result = await remoteSaveSnapshot(snapshot);
    if (result.created) snapshotWrites += 1;
  }

  let reportWrites = 0;
  for (const report of reports.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
    const workspaceId = workspaceForReport(report, snapshots);
    const normalized = { ...report, workspaceId };
    const existing = report.signature
      ? await remoteFindClientReportBySignature(report.signature, workspaceId)
      : null;
    if (existing) continue;
    await remoteSaveClientReport(normalized);
    reportWrites += 1;
  }

  console.log(`created snapshots: ${snapshotWrites}`);
  console.log(`created reports: ${reportWrites}`);
  console.log('Local files were not deleted. Keep them until the hosted pilot is verified.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
