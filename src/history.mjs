import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const STORE_VERSION = 1;
const SNAPSHOT_SCHEMA_VERSION = 3;
const DEFAULT_MAX_PER_SERIES = 24;
const DEFAULT_MAX_TOTAL = 500;

function historyFilePath() {
  return process.env.DEV30_HISTORY_FILE || path.join(process.cwd(), 'data', 'history.json');
}

function workspaceKey(value) {
  if (!value?.includePrivate) return 'public';
  return value.workspaceId || `legacy:${String(value.username || '').toLowerCase()}`;
}

function seriesKey({ username, days, includePrivate, locale, workspaceId }) {
  return [workspaceKey({ username, includePrivate, workspaceId }), String(username || '').toLowerCase(), Number(days) || 30, includePrivate ? 'private' : 'public', locale === 'vi' ? 'vi' : 'en'].join(':');
}

function stableCore(snapshot) {
  return {
    schemaVersion: snapshot.schemaVersion || 1,
    workspaceId: workspaceKey(snapshot),
    username: snapshot.username,
    days: snapshot.days,
    includePrivate: snapshot.includePrivate,
    locale: snapshot.locale,
    repos: [...snapshot.repos]
      .map((repo) => ({
        name: repo.name,
        visibility: repo.visibility,
        commits: repo.commits,
        pullRequests: repo.pullRequests,
        commitsTruncated: Boolean(repo.commitsTruncated),
        pullsTruncated: Boolean(repo.pullsTruncated),
        language: repo.language || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    workMix: snapshot.workMix,
    workUnits: [...snapshot.workUnits]
      .map((unit) => ({ repo: unit.repo, date: unit.date, title: unit.title, category: unit.category }))
      .sort((a, b) => `${a.repo}:${a.date}:${a.title}`.localeCompare(`${b.repo}:${b.date}:${b.title}`)),
    mainFocus: snapshot.mainFocus,
  };
}

function signatureFor(snapshot) {
  return createHash('sha256').update(JSON.stringify(stableCore(snapshot))).digest('hex');
}

async function readStore(filePath = historyFilePath()) {
  try {
    const raw = JSON.parse(await readFile(filePath, 'utf8'));
    if (raw?.version !== STORE_VERSION || !Array.isArray(raw.snapshots)) return { version: STORE_VERSION, snapshots: [] };
    return raw;
  } catch (error) {
    if (error?.code === 'ENOENT') return { version: STORE_VERSION, snapshots: [] };
    throw error;
  }
}

async function writeStore(store, filePath = historyFilePath()) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(tempPath, filePath);
}

export function buildSnapshot({ dataset, payload, locale = 'en', generatedAt = new Date().toISOString() }) {
  const includePrivate = Boolean(dataset.collector.includePrivate);
  const snapshot = {
    id: randomUUID(),
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    workspaceId: includePrivate ? (dataset.collector.workspaceId || `legacy:${dataset.profile.login.toLowerCase()}`) : 'public',
    generatedAt,
    username: dataset.profile.login,
    days: dataset.window.days,
    includePrivate,
    locale: locale === 'vi' ? 'vi' : 'en',
    profile: {
      login: dataset.profile.login,
      name: dataset.profile.name || '',
      avatarUrl: dataset.profile.avatarUrl || '',
    },
    repos: dataset.repos.map((repo) => ({
      name: repo.name,
      visibility: repo.visibility || 'public',
      commits: repo.commits || 0,
      pullRequests: repo.pullRequests || 0,
      commitsTruncated: Boolean(repo.commitsTruncated),
      pullsTruncated: Boolean(repo.pullsTruncated),
      language: repo.language || null,
      stars: repo.stars || 0,
    })),
    workMix: { ...dataset.workMix },
    workUnits: dataset.workUnits.slice(0, 160).map((unit) => ({
      repo: unit.repo,
      date: unit.date,
      title: unit.title,
      category: unit.category,
      evidenceIds: (unit.evidenceIds || []).slice(0, 12),
    })),
    evidence: dataset.evidence.slice(0, 180).map((item) => ({
      id: item.id,
      type: item.type,
      repo: item.repo,
      visibility: item.visibility || 'public',
      date: item.date,
      title: item.title,
      url: item.url,
      ref: item.ref,
    })),
    mainFocus: {
      repo: payload.report?.mainFocus?.repo || '',
      title: payload.report?.mainFocus?.title || '',
    },
    headline: payload.report?.headline || '',
  };
  snapshot.signature = signatureFor(snapshot);
  return snapshot;
}

export function snapshotSummary(snapshot) {
  return {
    id: snapshot.id,
    workspaceId: workspaceKey(snapshot),
    generatedAt: snapshot.generatedAt,
    username: snapshot.username,
    days: snapshot.days,
    includePrivate: snapshot.includePrivate,
    locale: snapshot.locale,
    repoCount: snapshot.repos.length,
    mainFocus: snapshot.mainFocus,
    headline: snapshot.headline,
    workMix: snapshot.workMix,
    evidenceCount: snapshot.evidence?.length || 0,
  };
}

export async function saveSnapshot(snapshot, {
  filePath = historyFilePath(),
  maxPerSeries = Number(process.env.HISTORY_MAX_PER_SERIES || DEFAULT_MAX_PER_SERIES),
  maxTotal = Number(process.env.HISTORY_MAX_TOTAL || DEFAULT_MAX_TOTAL),
} = {}) {
  const store = await readStore(filePath);
  const key = seriesKey(snapshot);
  const series = store.snapshots
    .filter((item) => seriesKey(item) === key)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  const latest = series[0] || null;

  if (latest?.signature === snapshot.signature) {
    return { snapshot: latest, previous: series[1] || null, created: false, total: series.length };
  }

  store.snapshots.push(snapshot);
  let normalized = store.snapshots.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  const perSeriesCounts = new Map();
  normalized = normalized.filter((item) => {
    const itemKey = seriesKey(item);
    const count = (perSeriesCounts.get(itemKey) || 0) + 1;
    perSeriesCounts.set(itemKey, count);
    return count <= Math.max(2, maxPerSeries);
  }).slice(0, Math.max(20, maxTotal));
  store.snapshots = normalized;
  await writeStore(store, filePath);

  const updatedSeries = normalized.filter((item) => seriesKey(item) === key);
  return {
    snapshot,
    previous: updatedSeries.find((item) => item.id !== snapshot.id) || null,
    created: true,
    total: updatedSeries.length,
  };
}

export async function listSnapshots({ username, days = 30, includePrivate = false, locale = 'en', workspaceId = null, limit = 12, filePath = historyFilePath() }) {
  const store = await readStore(filePath);
  const key = seriesKey({ username, days, includePrivate, locale, workspaceId });
  return store.snapshots
    .filter((item) => seriesKey(item) === key)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .slice(0, Math.max(1, Math.min(50, Number(limit) || 12)))
    .map(snapshotSummary);
}

export async function getSnapshotById(id, { filePath = historyFilePath() } = {}) {
  const store = await readStore(filePath);
  return store.snapshots.find((item) => item.id === id) || null;
}

export async function getPreviousSnapshot(snapshot, { filePath = historyFilePath() } = {}) {
  if (!snapshot) return null;
  const store = await readStore(filePath);
  const key = seriesKey(snapshot);
  const series = store.snapshots
    .filter((item) => seriesKey(item) === key)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  const index = series.findIndex((item) => item.id === snapshot.id);
  if (index < 0) return null;
  return series[index + 1] || null;
}

function workUnitKey(unit) {
  return `${String(unit.repo || '').toLowerCase()}::${String(unit.title || '').trim().toLowerCase()}`;
}

function repoMap(snapshot) {
  return new Map((snapshot?.repos || []).map((repo) => [repo.name, repo]));
}

export function compareSnapshots(previous, current) {
  if (!previous || !current) return null;
  const before = repoMap(previous);
  const after = repoMap(current);
  const newRepos = [...after.keys()].filter((name) => !before.has(name)).sort();
  const inactiveRepos = [...before.keys()].filter((name) => !after.has(name)).sort();
  const repoChanges = [];

  for (const [name, now] of after) {
    const then = before.get(name);
    if (!then) continue;
    const commitDelta = (now.commits || 0) - (then.commits || 0);
    const prDelta = (now.pullRequests || 0) - (then.pullRequests || 0);
    if (commitDelta || prDelta) {
      repoChanges.push({ repo: name, commitDelta, prDelta, currentCommits: now.commits || 0, currentPullRequests: now.pullRequests || 0 });
    }
  }
  repoChanges.sort((a, b) => (Math.abs(b.commitDelta) + Math.abs(b.prDelta) * 3) - (Math.abs(a.commitDelta) + Math.abs(a.prDelta) * 3));

  const categories = [...new Set([...Object.keys(previous.workMix || {}), ...Object.keys(current.workMix || {})])];
  const workMixDelta = Object.fromEntries(categories.map((category) => [category, (current.workMix?.[category] || 0) - (previous.workMix?.[category] || 0)]));

  const previousUnits = new Set((previous.workUnits || []).map(workUnitKey));
  const currentUnits = new Map((current.workUnits || []).map((unit) => [workUnitKey(unit), unit]));
  const newWorkUnits = [...currentUnits.entries()]
    .filter(([key]) => !previousUnits.has(key))
    .map(([, unit]) => ({ repo: unit.repo, date: unit.date, title: unit.title, category: unit.category, evidenceIds: unit.evidenceIds || [] }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 16);

  const previousFocus = previous.mainFocus || { repo: '', title: '' };
  const currentFocus = current.mainFocus || { repo: '', title: '' };
  const focusChanged = previousFocus.repo !== currentFocus.repo || previousFocus.title !== currentFocus.title;

  return {
    fromSnapshotId: previous.id,
    toSnapshotId: current.id,
    fromGeneratedAt: previous.generatedAt,
    toGeneratedAt: current.generatedAt,
    days: current.days,
    includePrivate: current.includePrivate,
    workspaceId: workspaceKey(current),
    newRepos,
    inactiveRepos,
    repoChanges: repoChanges.slice(0, 12),
    workMixDelta,
    focus: focusChanged ? { changed: true, from: previousFocus, to: currentFocus } : { changed: false, from: previousFocus, to: currentFocus },
    newWorkUnits,
  };
}

export function deterministicDeltaNarrative(delta, locale = 'en') {
  if (!delta) return null;
  const vi = locale === 'vi';
  const highlights = [];
  for (const repo of delta.newRepos.slice(0, 4)) highlights.push({ type: 'new_repo', repo, text: vi ? `${repo} xuất hiện trong snapshot mới.` : `${repo} appears in the new snapshot.` });
  if (delta.focus.changed) {
    highlights.push({
      type: 'focus_shift',
      repo: delta.focus.to.repo,
      text: vi ? `Trọng tâm chuyển từ ${delta.focus.from.repo || 'chưa rõ'} sang ${delta.focus.to.repo || 'chưa rõ'}.` : `Main focus moved from ${delta.focus.from.repo || 'unknown'} to ${delta.focus.to.repo || 'unknown'}.`,
    });
  }
  for (const change of delta.repoChanges.slice(0, 4)) {
    highlights.push({
      type: 'activity_change',
      repo: change.repo,
      text: vi ? `${change.repo}: số commit quan sát thay đổi ${change.commitDelta >= 0 ? '+' : ''}${change.commitDelta}, PR ${change.prDelta >= 0 ? '+' : ''}${change.prDelta}.` : `${change.repo}: observed commits changed ${change.commitDelta >= 0 ? '+' : ''}${change.commitDelta}, PRs ${change.prDelta >= 0 ? '+' : ''}${change.prDelta}.`,
    });
  }
  const headline = vi ? 'So sánh snapshot mới với lần phân tích trước.' : 'Comparing the new snapshot with the previous analysis.';
  const summary = vi ? `Phát hiện ${delta.newRepos.length} repo mới trong cửa sổ, ${delta.inactiveRepos.length} repo không còn xuất hiện và ${delta.newWorkUnits.length} đơn vị công việc mới được quan sát.` : `Observed ${delta.newRepos.length} newly appearing repos, ${delta.inactiveRepos.length} repos no longer in the window, and ${delta.newWorkUnits.length} new work units.`;
  return { headline, summary, highlights: highlights.slice(0, 8), mode: 'deterministic' };
}

export async function historyStats({ filePath = historyFilePath() } = {}) {
  const store = await readStore(filePath);
  return {
    snapshots: store.snapshots.length,
    privateSnapshots: store.snapshots.filter((item) => item.includePrivate).length,
    workspaces: new Set(store.snapshots.filter((item) => item.includePrivate).map(workspaceKey)).size,
    filePath: path.relative(process.cwd(), filePath) || filePath,
  };
}
