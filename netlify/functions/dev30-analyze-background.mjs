import http from 'node:http';
import { bridgeNodeRequest } from '../request-bridge.mjs';
import {
  completeAnalysisJob,
  createAnalysisJob,
  failAnalysisJob,
  workspaceFromSessionCookie,
} from '../../src/analysis-job-store.mjs';

const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const originalCreateServer = http.createServer;
let requestListener = null;

http.createServer = (listener) => {
  requestListener = listener;
  return { listen() { return this; } };
};

try {
  const serverSpecifier = ['..', '..', 'server.mjs'].join('/');
  const serverUrl = new URL(serverSpecifier, import.meta.url);
  await import(serverUrl.href);
} finally {
  http.createServer = originalCreateServer;
}

if (typeof requestListener !== 'function') {
  throw new Error('Dev30 background adapter could not capture the Node request listener.');
}

function errorFromPayload(payload, status) {
  return payload?.error || `Analysis failed (${status}).`;
}

export default async function handler(request) {
  let jobId = null;
  let workspaceId = null;
  try {
    const input = await request.json();
    jobId = String(input?.jobId || '').trim();
    if (!JOB_ID.test(jobId)) return;

    workspaceId = await workspaceFromSessionCookie(request.headers.get('cookie'));
    if (!workspaceId) return;

    const analysisInput = {
      username: input.username,
      locale: input.locale,
      days: input.days,
      includePrivate: input.includePrivate === true,
      refresh: input.refresh === true,
    };
    await createAnalysisJob({ id: jobId, workspaceId, input: analysisInput });

    const url = new URL(request.url);
    url.pathname = '/api/analyze';
    url.search = '';
    const headers = new Headers(request.headers);
    headers.set('content-type', 'application/json');
    const analysisRequest = new Request(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(analysisInput),
    });

    const response = await bridgeNodeRequest(analysisRequest, requestListener);
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch {}

    if (!response.ok || !payload) {
      await failAnalysisJob(jobId, errorFromPayload(payload, response.status), response.status);
      return;
    }
    await completeAnalysisJob(jobId, payload, response.status);
  } catch (error) {
    if (jobId && workspaceId) {
      await failAnalysisJob(jobId, error?.message || 'Background analysis failed.', error?.status || 500).catch(() => {});
    }
    console.error('Dev30 background analysis failed:', error);
  }
}

export const config = {
  path: '/api/analyze-background',
  method: 'POST',
  background: true,
};
