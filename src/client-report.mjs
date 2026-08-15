import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const STORE_VERSION = 1;
const DEFAULT_MAX_REPORTS = 200;

function reportFilePath() {
  return process.env.DEV30_CLIENT_REPORT_FILE || path.join(process.cwd(), 'data', 'client-reports.json');
}

function clean(value) {
  return String(value || '').trim();
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function evidenceMap(snapshot) {
  return new Map((snapshot?.evidence || []).map((item) => [item.id, item]));
}

function validEvidenceIds(ids, evidence) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter((id) => evidence.has(id)))].slice(0, 12);
}

export function buildClientReportInput({ snapshot, previous = null, delta = null, audience = 'client', locale = 'en' }) {
  const evidence = evidenceMap(snapshot);
  const workUnits = uniqueBy(
    [...(snapshot?.workUnits || [])].sort((a, b) => String(b.date).localeCompare(String(a.date))),
    (unit) => `${clean(unit.repo).toLowerCase()}::${clean(unit.title).toLowerCase()}`,
  ).slice(0, 16).map((unit) => ({
    repo: clean(unit.repo),
    date: clean(unit.date),
    title: clean(unit.title),
    category: clean(unit.category),
    evidenceIds: validEvidenceIds(unit.evidenceIds, evidence),
  }));

  const currentEvidence = [...evidence.values()].slice(0, 120).map((item) => ({
    id: item.id,
    repo: item.repo,
    visibility: item.visibility || 'public',
    date: item.date,
    title: item.title,
    url: item.url,
    type: item.type,
    ref: item.ref,
  }));

  return {
    audience: audience === 'founder' ? 'founder' : 'client',
    locale: locale === 'vi' ? 'vi' : 'en',
    username: snapshot.username,
    generatedAt: snapshot.generatedAt,
    previousGeneratedAt: previous?.generatedAt || null,
    days: snapshot.days,
    includePrivate: Boolean(snapshot.includePrivate),
    headline: snapshot.headline || '',
    mainFocus: snapshot.mainFocus || { repo: '', title: '' },
    workMix: snapshot.workMix || {},
    repos: (snapshot.repos || []).slice(0, 20).map((repo) => ({
      name: repo.name,
      visibility: repo.visibility || 'public',
      commits: repo.commits || 0,
      pullRequests: repo.pullRequests || 0,
      language: repo.language || null,
    })),
    workUnits,
    delta: delta ? {
      newRepos: delta.newRepos || [],
      inactiveRepos: delta.inactiveRepos || [],
      repoChanges: delta.repoChanges || [],
      workMixDelta: delta.workMixDelta || {},
      focus: delta.focus || null,
      newWorkUnits: (delta.newWorkUnits || []).map((unit) => ({
        ...unit,
        evidenceIds: validEvidenceIds(unit.evidenceIds, evidence),
      })),
    } : null,
    evidence: currentEvidence,
  };
}

export function deterministicClientReport(input) {
  const vi = input.locale === 'vi';
  const shipped = input.workUnits.slice(0, 6).map((unit) => ({
    repo: unit.repo,
    text: unit.title,
    evidenceIds: unit.evidenceIds,
  }));

  const changes = [];
  for (const repo of (input.delta?.newRepos || []).slice(0, 3)) {
    changes.push({ repo, text: vi ? `${repo} xuất hiện trong cửa sổ hoạt động mới.` : `${repo} appeared in the latest activity window.`, evidenceIds: [] });
  }
  for (const unit of (input.delta?.newWorkUnits || []).slice(0, 5)) {
    changes.push({ repo: unit.repo, text: unit.title, evidenceIds: unit.evidenceIds || [] });
  }
  if (input.delta?.focus?.changed) {
    changes.unshift({
      repo: input.delta.focus.to?.repo || '',
      text: vi
        ? `Trọng tâm quan sát được chuyển từ ${input.delta.focus.from?.repo || 'chưa rõ'} sang ${input.delta.focus.to?.repo || 'chưa rõ'}.`
        : `Observed focus moved from ${input.delta.focus.from?.repo || 'unknown'} to ${input.delta.focus.to?.repo || 'unknown'}.`,
      evidenceIds: [],
    });
  }

  const title = vi ? `Cập nhật phát triển — ${input.username}` : `Development update — ${input.username}`;
  const executiveSummary = input.headline || (vi ? 'Báo cáo được tạo từ snapshot hoạt động GitHub gần nhất.' : 'Report generated from the latest saved GitHub activity snapshot.');
  const currentDirection = input.mainFocus?.repo
    ? (vi ? `Trọng tâm hiện tại: ${input.mainFocus.repo} — ${input.mainFocus.title || 'hoạt động đang diễn ra'}.` : `Current focus: ${input.mainFocus.repo} — ${input.mainFocus.title || 'ongoing work'}.`)
    : (vi ? 'Chưa có đủ bằng chứng để xác định một trọng tâm duy nhất.' : 'There is not enough evidence to identify a single current focus.');

  return {
    title,
    executiveSummary,
    shipped,
    changedSinceLast: changes.slice(0, 6),
    currentDirection,
    note: vi
      ? 'Báo cáo này mô tả hoạt động GitHub quan sát được; không phải cam kết tiến độ, đánh giá năng lực hay xác nhận tác động kinh doanh.'
      : 'This report describes observed GitHub activity; it is not a delivery commitment, talent assessment, or proof of business impact.',
    mode: 'deterministic',
  };
}

export function normalizeClientReport(value, input, fallback = deterministicClientReport(input)) {
  if (!value || typeof value !== 'object') return fallback;
  const evidence = new Map((input.evidence || []).map((item) => [item.id, item]));
  const normalizeItems = (items, fallbackItems) => {
    if (!Array.isArray(items)) return fallbackItems;
    return items.slice(0, 8).map((item) => ({
      repo: clean(item?.repo),
      text: clean(item?.text),
      evidenceIds: validEvidenceIds(item?.evidenceIds, evidence),
    })).filter((item) => item.text);
  };
  return {
    title: clean(value.title) || fallback.title,
    executiveSummary: clean(value.executiveSummary) || fallback.executiveSummary,
    shipped: normalizeItems(value.shipped, fallback.shipped),
    changedSinceLast: normalizeItems(value.changedSinceLast, fallback.changedSinceLast),
    currentDirection: clean(value.currentDirection) || fallback.currentDirection,
    note: clean(value.note) || fallback.note,
    mode: 'deepseek',
  };
}

function evidenceForReport(report, input) {
  const wanted = new Set([
    ...(report.shipped || []).flatMap((item) => item.evidenceIds || []),
    ...(report.changedSinceLast || []).flatMap((item) => item.evidenceIds || []),
  ]);
  const selected = (input.evidence || []).filter((item) => wanted.has(item.id));
  return selected.length ? selected : (input.evidence || []).slice(0, 8);
}

export function clientReportToMarkdown(report, input) {
  const vi = input.locale === 'vi';
  const evidence = evidenceForReport(report, input);
  const lines = [
    `# ${report.title}`,
    '',
    report.executiveSummary,
    '',
    `## ${vi ? 'Đã thực hiện' : 'What shipped'}`,
    '',
  ];
  if (report.shipped?.length) {
    for (const item of report.shipped) lines.push(`- **${item.repo || (vi ? 'Dự án' : 'Project')}** — ${item.text}${item.evidenceIds?.length ? ` (${item.evidenceIds.join(', ')})` : ''}`);
  } else lines.push(vi ? '- Chưa có work-unit đủ rõ để liệt kê.' : '- No sufficiently clear work units to list.');

  lines.push('', `## ${vi ? 'Thay đổi từ báo cáo trước' : 'What changed since the previous report'}`, '');
  if (report.changedSinceLast?.length) {
    for (const item of report.changedSinceLast) lines.push(`- ${item.repo ? `**${item.repo}** — ` : ''}${item.text}${item.evidenceIds?.length ? ` (${item.evidenceIds.join(', ')})` : ''}`);
  } else lines.push(vi ? '- Chưa có snapshot trước hoặc chưa có thay đổi đáng kể.' : '- No previous snapshot or no meaningful change observed yet.');

  lines.push('', `## ${vi ? 'Hướng hiện tại' : 'Current direction'}`, '', report.currentDirection, '', `> ${report.note}`);
  if (evidence.length) {
    lines.push('', `## ${vi ? 'Bằng chứng' : 'Evidence'}`, '');
    for (const item of evidence) lines.push(`- [${item.id} — ${item.repo}: ${item.title}](${item.url})`);
  }
  return `${lines.join('\n')}\n`;
}

async function readStore(filePath = reportFilePath()) {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    if (parsed?.version !== STORE_VERSION || !Array.isArray(parsed.reports)) return { version: STORE_VERSION, reports: [] };
    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') return { version: STORE_VERSION, reports: [] };
    throw error;
  }
}

async function writeStore(store, filePath = reportFilePath()) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  await rename(temp, filePath);
}

function reportSignature({ snapshotId, audience, locale, report }) {
  return createHash('sha256').update(JSON.stringify({ snapshotId, audience, locale, report })).digest('hex');
}

export async function saveClientReport({ snapshot, input, report, markdown }, { filePath = reportFilePath(), maxReports = Number(process.env.CLIENT_REPORT_MAX_TOTAL || DEFAULT_MAX_REPORTS) } = {}) {
  const store = await readStore(filePath);
  const signature = reportSignature({ snapshotId: snapshot.id, audience: input.audience, locale: input.locale, report });
  const existing = store.reports.find((item) => item.signature === signature);
  if (existing) return existing;
  const evidence = evidenceForReport(report, input);
  const shareable = !snapshot.includePrivate && evidence.every((item) => item.visibility !== 'private');
  const saved = {
    id: randomUUID(),
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
  store.reports.unshift(saved);
  store.reports = store.reports.slice(0, Math.max(20, maxReports));
  await writeStore(store, filePath);
  return saved;
}

export async function getClientReport(id, { filePath = reportFilePath() } = {}) {
  const store = await readStore(filePath);
  return store.reports.find((item) => item.id === id) || null;
}

export async function listClientReports({ username, includePrivate = false, limit = 20, filePath = reportFilePath() }) {
  const store = await readStore(filePath);
  return store.reports
    .filter((item) => item.username.toLowerCase() === String(username || '').toLowerCase() && Boolean(item.includePrivate) === Boolean(includePrivate))
    .slice(0, Math.max(1, Math.min(50, Number(limit) || 20)))
    .map((item) => ({
      id: item.id,
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
    }));
}

export async function clientReportStats({ filePath = reportFilePath() } = {}) {
  const store = await readStore(filePath);
  return {
    reports: store.reports.length,
    privateReports: store.reports.filter((item) => item.includePrivate).length,
    shareableReports: store.reports.filter((item) => item.shareable).length,
    filePath: path.relative(process.cwd(), filePath) || filePath,
  };
}
