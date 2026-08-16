import './env.mjs';
import { supabaseSecret } from './storage.mjs';

const JOB_TABLE = 'dev30_analysis_jobs';
const SESSION_TABLE = 'dev30_sessions';

function baseUrl() {
  return String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
}

function config() {
  const url = baseUrl();
  const secret = supabaseSecret();
  if (!url || !secret) throw Object.assign(new Error('Analysis jobs require Supabase storage.'), { status: 503 });
  return { url, secret };
}

function headers(secret, body = false) {
  const value = {
    Accept: 'application/json',
    apikey: secret,
    'User-Agent': 'dev30/1.1-analysis-jobs',
  };
  if (!secret.startsWith('sb_secret_')) value.Authorization = `Bearer ${secret}`;
  if (body) value['Content-Type'] = 'application/json';
  return value;
}

async function request(table, { method = 'GET', params = {}, body = null, prefer = null } = {}) {
  const { url: root, secret } = config();
  const url = new URL(`${root}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const requestHeaders = headers(secret, body !== null);
  if (prefer) requestHeaders.Prefer = prefer;
  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body === null ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw Object.assign(new Error(`Supabase analysis job ${method} failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`), { status: 503 });
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function eq(value) {
  return `eq.${String(value)}`;
}

export function sessionIdFromCookie(cookieHeader) {
  for (const part of String(cookieHeader || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === 'dev30_session') return part.slice(index + 1).trim() || null;
  }
  return null;
}

export async function workspaceFromSessionCookie(cookieHeader) {
  const sessionId = sessionIdFromCookie(cookieHeader);
  if (!sessionId) return null;
  const rows = await request(SESSION_TABLE, {
    params: { select: 'workspace_id', id: eq(sessionId), limit: '1' },
  });
  return rows?.[0]?.workspace_id || null;
}

export async function createAnalysisJob({ id, workspaceId, input }) {
  const now = new Date().toISOString();
  await request(JOB_TABLE, {
    method: 'POST',
    params: { on_conflict: 'id' },
    body: {
      id,
      workspace_id: workspaceId,
      status: 'running',
      request: input,
      result: null,
      error: null,
      response_status: null,
      created_at: now,
      updated_at: now,
      completed_at: null,
    },
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
}

export async function completeAnalysisJob(id, result, responseStatus = 200) {
  const now = new Date().toISOString();
  await request(JOB_TABLE, {
    method: 'PATCH',
    params: { id: eq(id) },
    body: {
      status: 'completed',
      result,
      error: null,
      response_status: responseStatus,
      updated_at: now,
      completed_at: now,
    },
    prefer: 'return=minimal',
  });
}

export async function failAnalysisJob(id, error, responseStatus = 500) {
  const now = new Date().toISOString();
  await request(JOB_TABLE, {
    method: 'PATCH',
    params: { id: eq(id) },
    body: {
      status: 'failed',
      result: null,
      error: String(error || 'Analysis failed.').slice(0, 1000),
      response_status: Number(responseStatus) || 500,
      updated_at: now,
      completed_at: now,
    },
    prefer: 'return=minimal',
  });
}

export async function getAnalysisJob(id) {
  const rows = await request(JOB_TABLE, {
    params: { select: '*', id: eq(id), limit: '1' },
  });
  const row = rows?.[0];
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    status: row.status,
    input: row.request,
    result: row.result,
    error: row.error,
    responseStatus: row.response_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export const __analysisJobTest = { sessionIdFromCookie };
