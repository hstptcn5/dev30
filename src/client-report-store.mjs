import { createHash, randomUUID } from 'node:crypto';
import { clientReportStats as localClientReportStats, getClientReport as localGetClientReport, listClientReports as localListClientReports, saveClientReport as localSaveClientReport } from './client-report.mjs';
import { remoteClientReportStats, remoteFindClientReportBySignature, remoteGetClientReport, remoteListClientReports, remoteSaveClientReport, remoteStorageEnabled } from './storage.mjs';

function evidenceForReport(report, input) {
  const wanted = new Set([
    ...(report.shipped || []).flatMap((item) => item.evidenceIds || []),
    ...(report.changedSinceLast || []).flatMap((item) => item.evidenceIds || []),
  ]);
  const selected = (input.evidence || []).filter((item) => wanted.has(item.id));
  return selected.length ? selected : (input.evidence || []).slice(0, 8);
}

function reportSignature({ snapshotId, audience, locale, report }) {
  return createHash('sha256').update(JSON.stringify({ snapshotId, audience, locale, report })).digest('hex');
}

function summary(item) {
  return {
    id: item.id,
    workspaceId: item.workspaceId || (item.includePrivate ? `legacy:${String(item.username || '').toLowerCase()}` : 'public'),
    createdAt: item.createdAt,
    snapshotId: item.snapshotId,
    username: item.username,
    days: item.days,
    includePrivate: item.includePrivate,
    audience: item.audience,
    locale: item.locale,
    shareable: item.shareable,
    title: item.report?.title || '',
    executiveSummary: item.report?.executiveSummary || '',
  };
}

export async function saveClientReportPersistent({ snapshot, input, report, markdown }, options = {}) {
  if (options.filePath || !remoteStorageEnabled()) {
    const saved = await localSaveClientReport({ snapshot, input, report, markdown }, options);
    return {
      ...saved,
      workspaceId: saved.workspaceId || (snapshot.includePrivate ? snapshot.workspaceId : 'public'),
    };
  }

  const workspaceId = snapshot.includePrivate ? snapshot.workspaceId : 'public';
  const signature = reportSignature({ snapshotId: snapshot.id, audience: input.audience, locale: input.locale, report });
  const existing = await remoteFindClientReportBySignature(signature, workspaceId);
  if (existing) return existing;

  const evidence = evidenceForReport(report, input);
  const shareable = !snapshot.includePrivate && evidence.every((item) => item.visibility !== 'private');
  const saved = {
    id: randomUUID(),
    workspaceId,
    createdAt: new Date().toISOString(),
    snapshotId: snapshot.id,
    username: snapshot.username,
    days: snapshot.days,
    includePrivate: Boolean(snapshot.includePrivate),
    locale: input.locale,
    audience: input.audience,
    shareable,
    report,
    markdown,
    evidence,
    signature,
  };
  await remoteSaveClientReport(saved);
  return saved;
}

export async function getClientReportPersistent(id, options = {}) {
  if (!options.filePath && remoteStorageEnabled()) return remoteGetClientReport(id);
  return localGetClientReport(id, options);
}

export async function listClientReportsPersistent(options = {}) {
  if (!options.filePath && remoteStorageEnabled()) {
    const reports = await remoteListClientReports(options);
    return reports.map(summary);
  }
  return localListClientReports(options);
}

export async function clientReportStatsPersistent(options = {}) {
  if (!options.filePath && remoteStorageEnabled()) {
    const stats = await remoteClientReportStats();
    return { ...stats, persistence: 'supabase', filePath: null };
  }
  const stats = await localClientReportStats(options);
  return { ...stats, persistence: 'local-json' };
}
