import { getSnapshotByIdPersistent, listSnapshotsPersistent } from './history-store.mjs';
import { storageBackend } from './storage.mjs';

function approximateWindow(snapshot) {
  const until = new Date(snapshot.generatedAt || Date.now());
  const days = Number(snapshot.days || 30);
  return {
    days,
    until: until.toISOString(),
    since: new Date(until.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function getSavedPublicReport({ username, days = 30, locale = 'en', productVersion = '1.0.0', analyzerVersion = null }) {
  const entries = await listSnapshotsPersistent({
    username,
    days,
    includePrivate: false,
    locale,
    workspaceId: null,
    limit: 24,
  });
  const ready = entries.find((entry) => entry.reportReady);
  if (!ready) return null;
  const snapshot = await getSnapshotByIdPersistent(ready.id);
  if (!snapshot?.report || snapshot.includePrivate) return null;

  return {
    profile: {
      login: snapshot.profile?.login || snapshot.username,
      name: snapshot.profile?.name || '',
      avatarUrl: snapshot.profile?.avatarUrl || '',
      bio: snapshot.profile?.bio || '',
      htmlUrl: snapshot.profile?.htmlUrl || `https://github.com/${encodeURIComponent(snapshot.username)}`,
      publicRepos: snapshot.repos?.filter((repo) => repo.visibility !== 'private').length || 0,
      privateRepos: 0,
      followers: 0,
    },
    window: approximateWindow(snapshot),
    report: snapshot.report,
    workMix: snapshot.workMix || {},
    evidence: snapshot.evidence || [],
    repos: snapshot.repos || [],
    meta: {
      productVersion,
      analyzerVersion,
      analysisMode: snapshot.analysisMode || 'saved',
      model: snapshot.model || null,
      notice: `Saved public report from ${snapshot.generatedAt}. Refresh to collect new GitHub evidence.`,
      collector: {
        authenticated: false,
        includePrivate: false,
        workspaceId: null,
        githubRateLimit: null,
        candidateRepos: snapshot.repos?.length || 0,
        selectedRepos: snapshot.repos?.length || 0,
        deepDiveRepos: 0,
        eventCount: 0,
        eventsCoverFullWindow: true,
        eventPagesTruncated: false,
        repoPagesTruncated: false,
        commitCountsTruncated: (snapshot.repos || []).filter((repo) => repo.commitsTruncated).map((repo) => repo.name),
        prCountsTruncated: (snapshot.repos || []).filter((repo) => repo.pullsTruncated).map((repo) => repo.name),
        mode: 'saved-public',
      },
    },
    history: {
      snapshotId: snapshot.id,
      workspaceId: 'public',
      saved: false,
      count: entries.length,
      previousSnapshotId: entries.find((entry) => entry.id !== snapshot.id)?.id || null,
      generatedAt: snapshot.generatedAt,
      entries,
      delta: null,
      narrative: null,
      persistence: storageBackend() === 'supabase' ? 'supabase' : 'local-json',
    },
  };
}
