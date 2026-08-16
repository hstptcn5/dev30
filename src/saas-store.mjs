import './env.mjs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  remoteClaimDueSchedules,
  remoteCompleteSchedule,
  remoteConsumeUsage,
  remoteGetBilling,
  remoteGetDeliveryByKey,
  remoteGetScheduleByWorkspace,
  remoteGetUsage,
  remoteGetWorkspaceConnection,
  remoteHasBillingEvent,
  remoteMarkBillingEvent,
  remoteSaveDelivery,
  remoteSaveWorkspaceConnection,
  remoteSaasStats,
  remoteUpdateWorkspaceConnectionCredential,
  remoteUpsertBilling,
  remoteUpsertSchedule,
  storageBackend,
  supabaseSecret,
} from './storage.mjs';

const STORE_VERSION = 1;
const METRICS = new Set(['analysis', 'report', 'scheduled_run', 'email_delivery']);
let writeChain = Promise.resolve();

function filePath() {
  return process.env.DEV30_SAAS_FILE || path.join(process.cwd(), 'data', 'saas.json');
}

function emptyStore() {
  return { version: STORE_VERSION, connections: [], schedules: [], usage: [], billing: [], billingEvents: [], deliveries: [] };
}

async function readStore(target = filePath()) {
  try {
    const parsed = JSON.parse(await readFile(target, 'utf8'));
    if (parsed?.version !== STORE_VERSION) return emptyStore();
    return {
      ...emptyStore(),
      ...parsed,
      connections: Array.isArray(parsed.connections) ? parsed.connections : [],
      schedules: Array.isArray(parsed.schedules) ? parsed.schedules : [],
      usage: Array.isArray(parsed.usage) ? parsed.usage : [],
      billing: Array.isArray(parsed.billing) ? parsed.billing : [],
      billingEvents: Array.isArray(parsed.billingEvents) ? parsed.billingEvents : [],
      deliveries: Array.isArray(parsed.deliveries) ? parsed.deliveries : [],
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyStore();
    throw error;
  }
}

async function writeStore(store, target = filePath()) {
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temp, target);
}

function mutate(fn) {
  const run = writeChain.then(async () => {
    const store = await readStore();
    const result = await fn(store);
    await writeStore(store);
    return result;
  });
  writeChain = run.catch(() => {});
  return run;
}

function nowIso() {
  return new Date().toISOString();
}

function periodKey(workspaceId, periodStart) {
  return `${workspaceId}:${periodStart}`;
}

function normalizeMetric(metric) {
  const value = String(metric || '').trim();
  if (!METRICS.has(value)) throw new Error(`Unsupported usage metric: ${value || 'empty'}`);
  return value;
}

async function deleteRemoteConnection(workspaceId) {
  const baseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const secret = supabaseSecret();
  if (!baseUrl || !secret) throw Object.assign(new Error('Supabase storage is not configured.'), { status: 503 });
  const url = new URL(`${baseUrl}/rest/v1/dev30_connections`);
  url.searchParams.set('workspace_id', `eq.${workspaceId}`);
  const headers = { apikey: secret, 'User-Agent': 'dev30/1.0-storage' };
  if (!secret.startsWith('sb_secret_')) headers.Authorization = `Bearer ${secret}`;
  const response = await fetch(url, { method: 'DELETE', headers });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw Object.assign(new Error(`Supabase connection delete failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`), { status: 503 });
  }
}

export async function saveWorkspaceConnection(entry) {
  if (storageBackend() === 'supabase') return remoteSaveWorkspaceConnection(entry);
  return mutate((store) => {
    const at = nowIso();
    const normalized = {
      workspaceId: entry.workspaceId,
      viewer: entry.viewer,
      encryptedCredential: entry.encryptedCredential,
      createdAt: entry.createdAt || at,
      updatedAt: at,
    };
    const index = store.connections.findIndex((item) => item.workspaceId === normalized.workspaceId);
    if (index >= 0) normalized.createdAt = store.connections[index].createdAt || normalized.createdAt;
    if (index >= 0) store.connections[index] = normalized;
    else store.connections.push(normalized);
    return normalized;
  });
}

export async function getWorkspaceConnection(workspaceId) {
  if (storageBackend() === 'supabase') return remoteGetWorkspaceConnection(workspaceId);
  const store = await readStore();
  return store.connections.find((item) => item.workspaceId === workspaceId) || null;
}

export async function updateWorkspaceConnectionCredential(workspaceId, encryptedCredential) {
  if (storageBackend() === 'supabase') return remoteUpdateWorkspaceConnectionCredential(workspaceId, encryptedCredential, nowIso());
  return mutate((store) => {
    const entry = store.connections.find((item) => item.workspaceId === workspaceId);
    if (!entry) return null;
    entry.encryptedCredential = encryptedCredential;
    entry.updatedAt = nowIso();
    return entry;
  });
}

export async function deleteWorkspaceConnection(workspaceId) {
  if (!workspaceId) return false;
  if (storageBackend() === 'supabase') {
    await deleteRemoteConnection(workspaceId);
    return true;
  }
  return mutate((store) => {
    const before = store.connections.length;
    store.connections = store.connections.filter((item) => item.workspaceId !== workspaceId);
    return store.connections.length !== before;
  });
}

export async function upsertSchedule(input) {
  if (storageBackend() === 'supabase') return remoteUpsertSchedule(input);
  return mutate((store) => {
    const at = nowIso();
    const existing = store.schedules.find((item) => item.workspaceId === input.workspaceId);
    const schedule = {
      id: existing?.id || input.id || randomUUID(),
      workspaceId: input.workspaceId,
      username: input.username,
      email: input.email,
      timezone: input.timezone,
      dayOfWeek: input.dayOfWeek,
      hourLocal: input.hourLocal,
      audience: input.audience,
      days: input.days,
      locale: input.locale === 'vi' ? 'vi' : 'en',
      enabled: input.enabled !== false,
      nextRunAt: input.nextRunAt,
      leaseUntil: null,
      lastRunAt: existing?.lastRunAt || null,
      lastStatus: existing?.lastStatus || null,
      lastReportId: existing?.lastReportId || null,
      lastError: existing?.lastError || null,
      createdAt: existing?.createdAt || at,
      updatedAt: at,
    };
    if (existing) Object.assign(existing, schedule);
    else store.schedules.push(schedule);
    return schedule;
  });
}

export async function getScheduleByWorkspace(workspaceId) {
  if (storageBackend() === 'supabase') return remoteGetScheduleByWorkspace(workspaceId);
  const store = await readStore();
  return store.schedules.find((item) => item.workspaceId === workspaceId) || null;
}

export async function disableSchedule(workspaceId) {
  const existing = await getScheduleByWorkspace(workspaceId);
  if (!existing) return null;
  return upsertSchedule({ ...existing, enabled: false, nextRunAt: existing.nextRunAt });
}

export async function claimDueSchedules({ now = new Date(), limit = 10, leaseSeconds = 900 } = {}) {
  if (storageBackend() === 'supabase') return remoteClaimDueSchedules({ now, limit, leaseSeconds });
  return mutate((store) => {
    const nowMs = now.getTime();
    const leaseUntil = new Date(nowMs + Math.max(60, Number(leaseSeconds) || 900) * 1000).toISOString();
    const claimed = store.schedules
      .filter((item) => item.enabled && Date.parse(item.nextRunAt) <= nowMs && (!item.leaseUntil || Date.parse(item.leaseUntil) < nowMs))
      .sort((a, b) => String(a.nextRunAt).localeCompare(String(b.nextRunAt)))
      .slice(0, Math.max(1, Math.min(50, Number(limit) || 10)));
    for (const item of claimed) {
      item.leaseUntil = leaseUntil;
      item.updatedAt = now.toISOString();
    }
    return claimed.map((item) => ({ ...item }));
  });
}

export async function completeSchedule({ id, nextRunAt, status, reportId = null, error = null, ranAt = new Date() }) {
  if (storageBackend() === 'supabase') return remoteCompleteSchedule({ id, nextRunAt, status, reportId, error, ranAt });
  return mutate((store) => {
    const item = store.schedules.find((entry) => entry.id === id);
    if (!item) return null;
    item.nextRunAt = nextRunAt;
    item.leaseUntil = null;
    item.lastRunAt = ranAt.toISOString();
    item.lastStatus = status;
    item.lastReportId = reportId || null;
    item.lastError = error ? String(error).slice(0, 500) : null;
    item.updatedAt = ranAt.toISOString();
    return { ...item };
  });
}

export async function getUsage(workspaceId, periodStart) {
  if (storageBackend() === 'supabase') return remoteGetUsage(workspaceId, periodStart);
  const store = await readStore();
  const entry = store.usage.find((item) => item.key === periodKey(workspaceId, periodStart));
  return entry || { key: periodKey(workspaceId, periodStart), workspaceId, periodStart, counters: {}, updatedAt: null };
}

export async function consumeUsage({ workspaceId, periodStart, metric, amount = 1, limit }) {
  const normalizedMetric = normalizeMetric(metric);
  if (storageBackend() === 'supabase') {
    return remoteConsumeUsage({ workspaceId, periodStart, metric: normalizedMetric, amount, limit });
  }
  return mutate((store) => {
    const key = periodKey(workspaceId, periodStart);
    let entry = store.usage.find((item) => item.key === key);
    if (!entry) {
      entry = { key, workspaceId, periodStart, counters: {}, updatedAt: nowIso() };
      store.usage.push(entry);
    }
    const current = Number(entry.counters[normalizedMetric] || 0);
    const next = current + Math.max(1, Number(amount) || 1);
    const cap = Math.max(0, Number(limit) || 0);
    if (next > cap) return { accepted: false, metric: normalizedMetric, used: current, limit: cap, counters: { ...entry.counters } };
    entry.counters[normalizedMetric] = next;
    entry.updatedAt = nowIso();
    return { accepted: true, metric: normalizedMetric, used: next, limit: cap, counters: { ...entry.counters } };
  });
}

export async function getBilling(workspaceId) {
  if (storageBackend() === 'supabase') return remoteGetBilling(workspaceId);
  const store = await readStore();
  return store.billing.find((item) => item.workspaceId === workspaceId) || null;
}

export async function upsertBilling(input) {
  if (storageBackend() === 'supabase') return remoteUpsertBilling(input);
  return mutate((store) => {
    const existing = store.billing.find((item) => item.workspaceId === input.workspaceId);
    const next = { ...(existing || {}), ...input, workspaceId: input.workspaceId, updatedAt: nowIso() };
    if (existing) Object.assign(existing, next);
    else store.billing.push(next);
    return next;
  });
}

export async function hasBillingEvent(eventId) {
  if (storageBackend() === 'supabase') return remoteHasBillingEvent(eventId);
  const store = await readStore();
  return store.billingEvents.some((item) => item.eventId === eventId);
}

export async function markBillingEvent(eventId, type) {
  if (storageBackend() === 'supabase') return remoteMarkBillingEvent(eventId, type);
  return mutate((store) => {
    if (!store.billingEvents.some((item) => item.eventId === eventId)) {
      store.billingEvents.push({ eventId, type, receivedAt: nowIso() });
      store.billingEvents = store.billingEvents.slice(-1000);
    }
    return { eventId, type };
  });
}

export async function getDeliveryByKey(idempotencyKey) {
  if (storageBackend() === 'supabase') return remoteGetDeliveryByKey(idempotencyKey);
  const store = await readStore();
  return store.deliveries.find((item) => item.idempotencyKey === idempotencyKey) || null;
}

export async function saveDelivery(input) {
  if (storageBackend() === 'supabase') return remoteSaveDelivery(input);
  return mutate((store) => {
    const existing = store.deliveries.find((item) => item.idempotencyKey === input.idempotencyKey);
    const at = nowIso();
    const next = {
      ...(existing || {}),
      id: existing?.id || input.id || randomUUID(),
      ...input,
      attemptCount: Number(existing?.attemptCount || 0) + (input.incrementAttempt === false ? 0 : 1),
      createdAt: existing?.createdAt || at,
      updatedAt: at,
    };
    delete next.incrementAttempt;
    if (existing) Object.assign(existing, next);
    else store.deliveries.push(next);
    store.deliveries = store.deliveries.slice(-1000);
    return next;
  });
}

export async function saasStats() {
  if (storageBackend() === 'supabase') return remoteSaasStats();
  const store = await readStore();
  return {
    connections: store.connections.length,
    schedules: store.schedules.length,
    enabledSchedules: store.schedules.filter((item) => item.enabled).length,
    usagePeriods: store.usage.length,
    billingAccounts: store.billing.length,
    deliveries: store.deliveries.length,
    filePath: path.relative(process.cwd(), filePath()) || filePath(),
  };
}

export const __saasStoreTest = { periodKey, normalizeMetric };
