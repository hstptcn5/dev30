import './env.mjs';

const TABLES = Object.freeze({
  sessions: 'dev30_sessions',
  snapshots: 'dev30_snapshots',
  reports: 'dev30_reports',
});

function cleanBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function storageBackend(env = process.env) {
  return String(env.DEV30_STORAGE_BACKEND || 'local').trim().toLowerCase() === 'supabase' ? 'supabase' : 'local';
}

export function remoteStorageEnabled(env = process.env) {
  return storageBackend(env) === 'supabase';
}

export function supabaseSecret(env = process.env) {
  return String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

export function storageConfig(env = process.env) {
  const backend = storageBackend(env);
  const url = cleanBaseUrl(env.SUPABASE_URL);
  const secretConfigured = Boolean(supabaseSecret(env));
  return {
    backend,
    remote: backend === 'supabase',
    urlConfigured: Boolean(url),
    secretConfigured,
    readyToConnect: backend === 'local' || (Boolean(url) && secretConfigured),
  };
}

function requireSupabaseConfig() {
  const url = cleanBaseUrl(process.env.SUPABASE_URL);
  const secret = supabaseSecret();
  if (!url || !secret) {
    throw Object.assign(new Error('Supabase storage requires SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY).'), { status: 503 });
  }
  return { url, secret };
}

function filter(value) {
  return `eq.${String(value)}`;
}

function supabaseHeaders(secret) {
  const headers = {
    Accept: 'application/json',
    apikey: secret,
    'User-Agent': 'dev30/0.8-storage',
  };
  // Current sb_secret_* keys are opaque API keys and must not be treated as JWTs.
  // Legacy service_role keys are JWTs and still support Authorization: Bearer.
  if (!secret.startsWith('sb_secret_')) headers.Authorization = `Bearer ${secret}`;
  return headers;
}

async function request(table, { method = 'GET', params = {}, body = null, prefer = null } = {}) {
  const { url: baseUrl, secret } = requireSupabaseConfig();
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const headers = supabaseHeaders(secret);
  if (body !== null) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(url, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw Object.assign(new Error(`Supabase storage ${method} ${table} failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`), { status: 503 });
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function normalizeLimit(value, fallback = 20, max = 500) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function snapshotSeriesKey({ workspaceId, username, days, includePrivate, locale }) {
  const workspace = includePrivate ? (workspaceId || `legacy:${String(username || '').toLowerCase()}`) : 'public';
  return [workspace, String(username || '').toLowerCase(), Number(days) || 30, includePrivate ? 'private' : 'public', locale === 'vi' ? 'vi' : 'en'].join(':');
}

export async function remoteCreateSession(entry) {
  await request(TABLES.sessions, {
    method: 'DELETE',
    params: { workspace_id: filter(entry.workspaceId) },
  });
  await request(TABLES.sessions, {
    method: 'POST',
    body: {
      id: entry.id,
      workspace_id: entry.workspaceId,
      viewer: entry.viewer,
      encrypted_credential: entry.encryptedCredential,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
    },
    prefer: 'return=minimal',
  });
  return entry;
}

export async function remoteGetSession(id) {
  const rows = await request(TABLES.sessions, {
    params: { select: '*', id: filter(id), limit: '1' },
  });
  const row = rows?.[0];
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    viewer: row.viewer,
    encryptedCredential: row.encrypted_credential,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function remoteUpdateSessionCredential(id, encryptedCredential, updatedAt) {
  await request(TABLES.sessions, {
    method: 'PATCH',
    params: { id: filter(id) },
    body: { encrypted_credential: encryptedCredential, updated_at: updatedAt },
    prefer: 'return=minimal',
  });
}

export async function remoteDeleteSession(id) {
  await request(TABLES.sessions, { method: 'DELETE', params: { id: filter(id) } });
}

export async function remoteSessionStats() {
  const rows = await request(TABLES.sessions, { params: { select: 'id,workspace_id', limit: '1000' } });
  return {
    sessions: rows?.length || 0,
    workspaces: new Set((rows || []).map((row) => row.workspace_id).filter(Boolean)).size,
  };
}

export async function remoteListSnapshots({ username, days = 30, includePrivate = false, locale = 'en', workspaceId = null, limit = 12 }) {
  const seriesKey = snapshotSeriesKey({ username, days, includePrivate, locale, workspaceId });
  const rows = await request(TABLES.snapshots, {
    params: {
      select: 'payload',
      series_key: filter(seriesKey),
      order: 'generated_at.desc',
      limit: String(normalizeLimit(limit, 12, 100)),
    },
  });
  return (rows || []).map((row) => row.payload).filter(Boolean);
}

export async function remoteSaveSnapshot(snapshot) {
  const seriesKey = snapshotSeriesKey(snapshot);
  const series = await remoteListSnapshots({ ...snapshot, limit: 100 });
  const latest = series[0] || null;
  if (latest?.signature === snapshot.signature) {
    return { snapshot: latest, previous: series[1] || null, created: false, total: series.length };
  }
  await request(TABLES.snapshots, {
    method: 'POST',
    body: {
      id: snapshot.id,
      workspace_id: snapshot.workspaceId || (snapshot.includePrivate ? `legacy:${String(snapshot.username || '').toLowerCase()}` : 'public'),
      series_key: seriesKey,
      username: snapshot.username,
      include_private: Boolean(snapshot.includePrivate),
      generated_at: snapshot.generatedAt,
      signature: snapshot.signature,
      payload: snapshot,
    },
    prefer: 'return=minimal',
  });
  return { snapshot, previous: latest, created: true, total: series.length + 1 };
}

export async function remoteGetSnapshotById(id) {
  const rows = await request(TABLES.snapshots, { params: { select: 'payload', id: filter(id), limit: '1' } });
  return rows?.[0]?.payload || null;
}

export async function remoteGetPreviousSnapshot(snapshot) {
  if (!snapshot) return null;
  const series = await remoteListSnapshots({ ...snapshot, limit: 100 });
  const index = series.findIndex((item) => item.id === snapshot.id);
  return index >= 0 ? series[index + 1] || null : null;
}

export async function remoteHistoryStats() {
  const rows = await request(TABLES.snapshots, { params: { select: 'workspace_id,include_private', limit: '1000' } });
  const values = rows || [];
  return {
    snapshots: values.length,
    privateSnapshots: values.filter((row) => row.include_private).length,
    workspaces: new Set(values.filter((row) => row.include_private).map((row) => row.workspace_id)).size,
  };
}

export async function remoteFindClientReportBySignature(signature, workspaceId) {
  const rows = await request(TABLES.reports, {
    params: {
      select: 'payload',
      signature: filter(signature),
      workspace_id: filter(workspaceId || 'public'),
      limit: '1',
    },
  });
  return rows?.[0]?.payload || null;
}

export async function remoteSaveClientReport(saved) {
  await request(TABLES.reports, {
    method: 'POST',
    body: {
      id: saved.id,
      workspace_id: saved.workspaceId || 'public',
      username: String(saved.username || '').toLowerCase(),
      include_private: Boolean(saved.includePrivate),
      shareable: Boolean(saved.shareable),
      signature: saved.signature,
      created_at: saved.createdAt,
      payload: saved,
    },
    prefer: 'return=minimal',
  });
  return saved;
}

export async function remoteGetClientReport(id) {
  const rows = await request(TABLES.reports, { params: { select: 'payload', id: filter(id), limit: '1' } });
  return rows?.[0]?.payload || null;
}

export async function remoteListClientReports({ username, includePrivate = false, workspaceId = null, limit = 20 }) {
  const params = {
    select: 'payload',
    username: filter(String(username || '').toLowerCase()),
    include_private: filter(Boolean(includePrivate)),
    order: 'created_at.desc',
    limit: String(normalizeLimit(limit, 20, 100)),
  };
  if (includePrivate) params.workspace_id = filter(workspaceId || `legacy:${String(username || '').toLowerCase()}`);
  const rows = await request(TABLES.reports, { params });
  return (rows || []).map((row) => row.payload).filter(Boolean);
}

export async function remoteClientReportStats() {
  const rows = await request(TABLES.reports, { params: { select: 'workspace_id,include_private,shareable', limit: '1000' } });
  const values = rows || [];
  return {
    reports: values.length,
    privateReports: values.filter((row) => row.include_private).length,
    shareableReports: values.filter((row) => row.shareable).length,
    workspaces: new Set(values.filter((row) => row.include_private).map((row) => row.workspace_id)).size,
  };
}

export async function storageReadiness() {
  const config = storageConfig();
  if (config.backend === 'local') return { ...config, ready: true, tables: null };
  if (!config.readyToConnect) return { ...config, ready: false, error: 'Supabase storage environment variables are incomplete.', tables: null };
  const tables = {};
  for (const table of Object.values(TABLES)) {
    try {
      await request(table, { params: { select: 'id', limit: '1' } });
      tables[table] = true;
    } catch (error) {
      tables[table] = false;
      return { ...config, ready: false, error: error.message, tables };
    }
  }
  return { ...config, ready: true, tables };
}

export const __storageTest = { filter, snapshotSeriesKey, normalizeLimit, supabaseHeaders };
