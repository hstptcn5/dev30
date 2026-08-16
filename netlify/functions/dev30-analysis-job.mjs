import { getAnalysisJob, workspaceFromSessionCookie } from '../../src/analysis-job-store.mjs';

const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

export default async function handler(request) {
  try {
    const workspaceId = await workspaceFromSessionCookie(request.headers.get('cookie'));
    if (!workspaceId) return json(401, { status: 'failed', error: 'Connect GitHub to run an analysis.' });

    const id = decodeURIComponent(new URL(request.url).pathname.split('/').pop() || '');
    if (!JOB_ID.test(id)) return json(400, { status: 'failed', error: 'Invalid analysis job ID.' });

    const job = await getAnalysisJob(id);
    if (!job) return json(202, { id, status: 'starting' });
    if (job.workspaceId !== workspaceId) return json(404, { status: 'failed', error: 'Analysis job not found.' });

    if (job.status === 'completed') {
      return json(200, { id, status: 'completed', result: job.result, completedAt: job.completedAt });
    }
    if (job.status === 'failed') {
      return json(200, {
        id,
        status: 'failed',
        error: job.error || 'Analysis failed.',
        responseStatus: job.responseStatus || 500,
        completedAt: job.completedAt,
      });
    }
    return json(202, { id, status: job.status || 'running', createdAt: job.createdAt, updatedAt: job.updatedAt });
  } catch (error) {
    console.error('Dev30 analysis job status failed:', error);
    return json(error?.status || 503, { status: 'failed', error: 'Analysis status is temporarily unavailable.' });
  }
}

export const config = {
  path: '/api/analysis-job/:id',
  method: 'GET',
};
