function exportError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

export function assertSnapshotExportAccess(auth, snapshot) {
  if (!auth?.viewer) throw exportError('Connect GitHub to export saved snapshots.', 401, 'github_connection_required');
  if (!snapshot) throw exportError('Snapshot not found.', 404, 'snapshot_not_found');

  const viewerLogin = String(auth.viewer.login || '').toLowerCase();
  const snapshotLogin = String(snapshot.username || snapshot.profile?.login || '').toLowerCase();
  if (!viewerLogin || viewerLogin !== snapshotLogin) {
    throw exportError('This snapshot belongs to another GitHub account.', 403, 'snapshot_export_forbidden');
  }

  if (snapshot.includePrivate) {
    const workspaceId = String(snapshot.workspaceId || '');
    if (workspaceId && workspaceId !== 'public' && !workspaceId.startsWith('legacy:') && workspaceId !== auth.workspaceId) {
      throw exportError('This private snapshot belongs to another workspace.', 403, 'snapshot_export_forbidden');
    }
  }
  return true;
}

export function snapshotExportPayload(snapshot) {
  if (!snapshot) return null;
  return {
    id: snapshot.id,
    schemaVersion: snapshot.schemaVersion || null,
    generatedAt: snapshot.generatedAt,
    username: snapshot.username,
    days: snapshot.days,
    includePrivate: Boolean(snapshot.includePrivate),
    locale: snapshot.locale === 'vi' ? 'vi' : 'en',
    profile: snapshot.profile || null,
    repos: Array.isArray(snapshot.repos) ? snapshot.repos : [],
    workMix: snapshot.workMix || {},
    workUnits: Array.isArray(snapshot.workUnits) ? snapshot.workUnits : [],
    evidence: Array.isArray(snapshot.evidence) ? snapshot.evidence : [],
    mainFocus: snapshot.mainFocus || null,
    headline: snapshot.headline || '',
    report: snapshot.report || null,
    analysisMode: snapshot.analysisMode || null,
    model: snapshot.model || null,
  };
}
