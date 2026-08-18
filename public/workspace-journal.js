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

async function jsonIfOk(promise) {
  const response = await promise.catch(() => null);
  if (!response?.ok) return null;
  return response.json().catch(() => null);
}

function publicHistoryUrl(origin, workspace, locale) {
  const url = new URL('/api/history', origin);
  url.searchParams.set('username', workspace.viewer.login);
  url.searchParams.set('days', String(workspace.days || 30));
  url.searchParams.set('locale', locale);
  url.searchParams.set('includePrivate', 'false');
  return url;
}

function alternateWorkspaceUrl(origin, workspace, locale) {
  const url = new URL('/api/workspace', origin);
  url.searchParams.set('days', String(workspace.days || 30));
  url.searchParams.set('locale', locale);
  return url;
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

    const currentLocale = workspace.locale === 'vi' ? 'vi' : 'en';
    const alternateLocale = currentLocale === 'vi' ? 'en' : 'vi';
    const [alternateWorkspace, currentPublic, alternatePublic] = await Promise.all([
      jsonIfOk(nativeFetch(alternateWorkspaceUrl(windowObject.location.origin, workspace, alternateLocale), { cache: 'no-store' })),
      jsonIfOk(nativeFetch(publicHistoryUrl(windowObject.location.origin, workspace, currentLocale), { cache: 'no-store' })),
      jsonIfOk(nativeFetch(publicHistoryUrl(windowObject.location.origin, workspace, alternateLocale), { cache: 'no-store' })),
    ]);

    const workspaceSnapshots = [
      ...(workspace.snapshots || []),
      ...(alternateWorkspace?.snapshots || []),
    ];
    const publicSnapshots = [
      ...(currentPublic?.entries || []),
      ...(alternatePublic?.entries || []),
    ];
    if (!workspaceSnapshots.length && !publicSnapshots.length) return response;

    const payload = {
      ...workspace,
      snapshots: mergeWorkspaceSnapshots(workspaceSnapshots, publicSnapshots, 12),
      publicSnapshotsIncluded: publicSnapshots.length > 0,
      journalLocalesIncluded: [currentLocale, alternateLocale],
    };
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.delete('Content-Length');
    headers.delete('Content-Encoding');
    return new Response(JSON.stringify(payload), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
  return true;
}

if (typeof window !== 'undefined') installWorkspaceJournalFetch(window);
