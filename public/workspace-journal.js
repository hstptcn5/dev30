export function mergeWorkspaceSnapshots(workspaceEntries = [], publicEntries = [], limit = 12) {
  const byId = new Map();
  for (const entry of [...workspaceEntries, ...publicEntries]) {
    if (!entry?.id || byId.has(entry.id)) continue;
    byId.set(entry.id, entry);
  }
  return [...byId.values()]
    .sort((a, b) => String(b.generatedAt || '').localeCompare(String(a.generatedAt || '')))
    .slice(0, Math.max(1, Number(limit) || 12));
}

function requestUrl(input, baseUrl) {
  try {
    const value = typeof input === 'string' || input instanceof URL ? input : input?.url;
    return new URL(value, baseUrl);
  } catch {
    return null;
  }
}

function requestMethod(input, init) {
  return String(init?.method || input?.method || 'GET').toUpperCase();
}

export function installWorkspaceJournalFetch(windowObject = globalThis.window) {
  if (!windowObject?.fetch || !windowObject?.location || windowObject.location.pathname !== '/workspace') return false;
  if (windowObject.__dev30WorkspaceJournalFetchInstalled) return true;
  windowObject.__dev30WorkspaceJournalFetchInstalled = true;

  const nativeFetch = windowObject.fetch.bind(windowObject);
  windowObject.fetch = async (input, init) => {
    const response = await nativeFetch(input, init);
    const url = requestUrl(input, windowObject.location.origin);
    if (!url || requestMethod(input, init) !== 'GET' || url.pathname !== '/api/workspace' || !response.ok) return response;

    const workspace = await response.clone().json().catch(() => null);
    if (!workspace?.viewer?.login) return response;

    const historyUrl = new URL('/api/history', windowObject.location.origin);
    historyUrl.searchParams.set('username', workspace.viewer.login);
    historyUrl.searchParams.set('days', String(workspace.days || 30));
    historyUrl.searchParams.set('locale', workspace.locale === 'vi' ? 'vi' : 'en');
    historyUrl.searchParams.set('includePrivate', 'false');

    const publicResponse = await nativeFetch(historyUrl, { cache: 'no-store' }).catch(() => null);
    if (!publicResponse?.ok) return response;
    const publicHistory = await publicResponse.json().catch(() => null);
    if (!Array.isArray(publicHistory?.entries)) return response;

    const payload = {
      ...workspace,
      snapshots: mergeWorkspaceSnapshots(workspace.snapshots || [], publicHistory.entries, 12),
      publicSnapshotsIncluded: true,
    };
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.delete('Content-Length');
    return new Response(JSON.stringify(payload), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
  return true;
}

if (typeof window !== 'undefined') installWorkspaceJournalFetch(window);
