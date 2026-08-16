import './env.mjs';

const TABLES = Object.freeze({
  sessions: 'dev30_sessions',
  snapshots: 'dev30_snapshots',
  reports: 'dev30_reports',
  connections: 'dev30_connections',
  schedules: 'dev30_schedules',
  usage: 'dev30_usage',
  billing: 'dev30_billing',
  billingEvents: 'dev30_billing_events',
  deliveries: 'dev30_deliveries',
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
    'User-Agent': 'dev30/1.0-storage',
  };
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

async function rpc(name, body) {
  const { url: baseUrl, secret } = requireSupabaseConfig();
  const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(secret),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw Object.assign(new Error(`Supabase RPC ${name} failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`), { status: 503 });
  }
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
  await request(TABLES.sessions, { method: 'DELETE', params: { workspace_id: filter(entry.workspaceId) } });
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
  const rows = await request(TABLES.sessions, { params: { select: '*', id: filter(id), limit: '1' } });
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

function connectionFromRow(row) {
  return row ? {
    workspaceId: row.workspace_id,
    viewer: row.viewer,
    encryptedCredential: row.encrypted_credential,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } : null;
}

export async function remoteSaveWorkspaceConnection(entry) {
  const at = entry.updatedAt || new Date().toISOString();
  await request(TABLES.connections, {
    method: 'POST',
    params: { on_conflict: 'workspace_id' },
    body: {
      workspace_id: entry.workspaceId,
      viewer: entry.viewer,
      encrypted_credential: entry.encryptedCredential,
      created_at: entry.createdAt || at,
      updated_at: at,
    },
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
  return { ...entry, updatedAt: at };
}

export async function remoteGetWorkspaceConnection(workspaceId) {
  const rows = await request(TABLES.connections, { params: { select: '*', workspace_id: filter(workspaceId), limit: '1' } });
  return connectionFromRow(rows?.[0]);
}

export async function remoteUpdateWorkspaceConnectionCredential(workspaceId, encryptedCredential, updatedAt) {
  await request(TABLES.connections, {
    method: 'PATCH',
    params: { workspace_id: filter(workspaceId) },
    body: { encrypted_credential: encryptedCredential, updated_at: updatedAt },
    prefer: 'return=minimal',
  });
  return remoteGetWorkspaceConnection(workspaceId);
}

function scheduleFromRow(row) {
  return row ? {
    id: row.id,
    workspaceId: row.workspace_id,
    username: row.username,
    email: row.email,
    timezone: row.timezone,
    dayOfWeek: row.day_of_week,
    hourLocal: row.hour_local,
    audience: row.audience,
    days: row.days,
    locale: row.locale === 'vi' ? 'vi' : 'en',
    enabled: row.enabled,
    nextRunAt: row.next_run_at,
    leaseUntil: row.lease_until,
    lastRunAt: row.last_run_at,
    lastStatus: row.last_status,
    lastReportId: row.last_report_id,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } : null;
}

function scheduleRow(input) {
  return {
    id: input.id,
    workspace_id: input.workspaceId,
    username: input.username,
    email: input.email,
    timezone: input.timezone,
    day_of_week: input.dayOfWeek,
    hour_local: input.hourLocal,
    audience: input.audience,
    days: input.days,
    locale: input.locale === 'vi' ? 'vi' : 'en',
    enabled: input.enabled !== false,
    next_run_at: input.nextRunAt,
    lease_until: input.leaseUntil || null,
    last_run_at: input.lastRunAt || null,
    last_status: input.lastStatus || null,
    last_report_id: input.lastReportId || null,
    last_error: input.lastError || null,
    created_at: input.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function remoteUpsertSchedule(input) {
  const existing = await remoteGetScheduleByWorkspace(input.workspaceId);
  const normalized = { ...(existing || {}), ...input, id: existing?.id || input.id, createdAt: existing?.createdAt || input.createdAt };
  const rows = await request(TABLES.schedules, {
    method: 'POST',
    params: { on_conflict: 'workspace_id' },
    body: scheduleRow(normalized),
    prefer: 'resolution=merge-duplicates,return=representation',
  });
  return scheduleFromRow(rows?.[0]) || normalized;
}

export async function remoteGetScheduleByWorkspace(workspaceId) {
  const rows = await request(TABLES.schedules, { params: { select: '*', workspace_id: filter(workspaceId), limit: '1' } });
  return scheduleFromRow(rows?.[0]);
}

export async function remoteClaimDueSchedules({ now = new Date(), limit = 10, leaseSeconds = 900 } = {}) {
  const rows = await rpc('dev30_claim_due_schedules', {
    p_now: now.toISOString(),
    p_lease_seconds: Math.max(60, Number(leaseSeconds) || 900),
    p_limit: normalizeLimit(limit, 10, 50),
  });
  return (rows || []).map(scheduleFromRow).filter(Boolean);
}

export async function remoteCompleteSchedule({ id, nextRunAt, status, reportId = null, error = null, ranAt = new Date() }) {
  const rows = await request(TABLES.schedules, {
    method: 'PATCH',
    params: { id: filter(id) },
    body: {
      next_run_at: nextRunAt,
      lease_until: null,
      last_run_at: ranAt.toISOString(),
      last_status: status,
      last_report_id: reportId,
      last_error: error ? String(error).slice(0, 500) : null,
      updated_at: ranAt.toISOString(),
    },
    prefer: 'return=representation',
  });
  return scheduleFromRow(rows?.[0]);
}

export async function remoteGetUsage(workspaceId, periodStart) {
  const rows = await request(TABLES.usage, {
    params: { select: '*', workspace_id: filter(workspaceId), period_start: filter(periodStart), limit: '1' },
  });
  const row = rows?.[0];
  return row ? {
    workspaceId: row.workspace_id,
    periodStart: row.period_start,
    counters: row.counters || {},
    updatedAt: row.updated_at,
  } : { workspaceId, periodStart, counters: {}, updatedAt: null };
}

export async function remoteConsumeUsage({ workspaceId, periodStart, metric, amount = 1, limit }) {
  const rows = await rpc('dev30_consume_usage', {
    p_workspace_id: workspaceId,
    p_period_start: periodStart,
    p_metric: metric,
    p_amount: Math.max(1, Number(amount) || 1),
    p_limit: Math.max(0, Number(limit) || 0),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return {
    accepted: Boolean(row?.accepted),
    metric,
    used: Number(row?.used || 0),
    limit: Number(row?.limit_value ?? limit ?? 0),
    counters: row?.counters || {},
  };
}

function billingFromRow(row) {
  return row ? {
    workspaceId: row.workspace_id,
    plan: row.plan,
    status: row.status,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    priceId: row.price_id,
    currentPeriodEnd: row.current_period_end,
    updatedAt: row.updated_at,
  } : null;
}

export async function remoteGetBilling(workspaceId) {
  const rows = await request(TABLES.billing, { params: { select: '*', workspace_id: filter(workspaceId), limit: '1' } });
  return billingFromRow(rows?.[0]);
}

export async function remoteUpsertBilling(input) {
  const rows = await request(TABLES.billing, {
    method: 'POST',
    params: { on_conflict: 'workspace_id' },
    body: {
      workspace_id: input.workspaceId,
      plan: input.plan || 'free',
      status: input.status || 'none',
      stripe_customer_id: input.stripeCustomerId || null,
      stripe_subscription_id: input.stripeSubscriptionId || null,
      price_id: input.priceId || null,
      current_period_end: input.currentPeriodEnd || null,
      updated_at: new Date().toISOString(),
    },
    prefer: 'resolution=merge-duplicates,return=representation',
  });
  return billingFromRow(rows?.[0]) || input;
}

export async function remoteHasBillingEvent(eventId) {
  const rows = await request(TABLES.billingEvents, { params: { select: 'event_id', event_id: filter(eventId), limit: '1' } });
  return Boolean(rows?.length);
}

export async function remoteMarkBillingEvent(eventId, type) {
  await request(TABLES.billingEvents, {
    method: 'POST',
    params: { on_conflict: 'event_id' },
    body: { event_id: eventId, type, received_at: new Date().toISOString() },
    prefer: 'resolution=ignore-duplicates,return=minimal',
  });
  return { eventId, type };
}

function deliveryFromRow(row) {
  return row ? {
    id: row.id,
    workspaceId: row.workspace_id,
    scheduleId: row.schedule_id,
    reportId: row.report_id,
    recipient: row.recipient,
    provider: row.provider,
    providerId: row.provider_id,
    status: row.status,
    attemptCount: row.attempt_count,
    idempotencyKey: row.idempotency_key,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } : null;
}

export async function remoteGetDeliveryByKey(idempotencyKey) {
  const rows = await request(TABLES.deliveries, { params: { select: '*', idempotency_key: filter(idempotencyKey), limit: '1' } });
  return deliveryFromRow(rows?.[0]);
}

export async function remoteSaveDelivery(input) {
  const existing = await remoteGetDeliveryByKey(input.idempotencyKey);
  const at = new Date().toISOString();
  const attemptCount = Number(existing?.attemptCount || 0) + (input.incrementAttempt === false ? 0 : 1);
  const rows = await request(TABLES.deliveries, {
    method: 'POST',
    params: { on_conflict: 'idempotency_key' },
    body: {
      id: existing?.id || input.id,
      workspace_id: input.workspaceId,
      schedule_id: input.scheduleId || null,
      report_id: input.reportId || null,
      recipient: input.recipient,
      provider: input.provider || 'resend',
      provider_id: input.providerId || null,
      status: input.status,
      attempt_count: attemptCount,
      idempotency_key: input.idempotencyKey,
      last_error: input.lastError ? String(input.lastError).slice(0, 500) : null,
      created_at: existing?.createdAt || at,
      updated_at: at,
    },
    prefer: 'resolution=merge-duplicates,return=representation',
  });
  return deliveryFromRow(rows?.[0]);
}

async function countRows(table, select = 'id') {
  const rows = await request(table, { params: { select, limit: '1000' } });
  return rows || [];
}

export async function remoteSaasStats() {
  const [connections, schedules, usage, billing, deliveries] = await Promise.all([
    countRows(TABLES.connections, 'workspace_id'),
    countRows(TABLES.schedules, 'id,enabled'),
    countRows(TABLES.usage, 'workspace_id'),
    countRows(TABLES.billing, 'workspace_id'),
    countRows(TABLES.deliveries, 'id,status'),
  ]);
  return {
    connections: connections.length,
    schedules: schedules.length,
    enabledSchedules: schedules.filter((row) => row.enabled).length,
    usagePeriods: usage.length,
    billingAccounts: billing.length,
    deliveries: deliveries.length,
    sentDeliveries: deliveries.filter((row) => row.status === 'sent').length,
  };
}

export async function storageReadiness() {
  const config = storageConfig();
  if (config.backend === 'local') return { ...config, ready: true, tables: null };
  if (!config.readyToConnect) return { ...config, ready: false, error: 'Supabase storage environment variables are incomplete.', tables: null };
  const tables = {};
  for (const table of Object.values(TABLES)) {
    try {
      await request(table, { params: { select: '*', limit: '1' } });
      tables[table] = true;
    } catch (error) {
      tables[table] = false;
      return { ...config, ready: false, error: error.message, tables };
    }
  }
  return { ...config, ready: true, tables };
}

export const __storageTest = { filter, snapshotSeriesKey, normalizeLimit, supabaseHeaders, TABLES };
