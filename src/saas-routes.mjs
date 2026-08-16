import './env.mjs';
import { timingSafeEqual } from 'node:crypto';
import { buildClientReportInput, clientReportToMarkdown } from './client-report.mjs';
import { synthesizeClientReportWithDeepSeek } from './client-report-deepseek.mjs';
import { getClientReportPersistent, saveClientReportPersistent } from './client-report-store.mjs';
import { compareSnapshots } from './history.mjs';
import { getPreviousSnapshotPersistent, getSnapshotByIdPersistent } from './history-store.mjs';
import { billingConfig, createCheckoutSession, createPortalSession, verifyStripeSignature, applyStripeEvent } from './billing.mjs';
import { emailConfig, renderStakeholderEmail, sendEmail } from './email.mjs';
import { consumeEntitlement, entitlementSnapshot, quotaError } from './entitlements.mjs';
import { nextScheduledRun, schedulePayload } from './schedule.mjs';
import { destroySession } from './session.mjs';
import {
  claimDueSchedules,
  completeSchedule,
  disableSchedule,
  getDeliveryByKey,
  getScheduleByWorkspace,
  saasStats,
  saveDelivery,
  upsertSchedule,
} from './saas-store.mjs';
import { durableConnectionReady, loadWorkspaceAuth, persistWorkspaceAuth } from './workspace-connection.mjs';

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

async function readRaw(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request body too large.'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req) {
  const raw = await readRaw(req, 64_000);
  return raw ? JSON.parse(raw) : {};
}

function secretEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function authorizedCron(req) {
  const expected = String(process.env.DEV30_CRON_SECRET || '').trim();
  if (!expected) return false;
  const auth = String(req.headers.authorization || '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const explicit = String(req.headers['x-dev30-cron-secret'] || '');
  return secretEqual(bearer, expected) || secretEqual(explicit, expected);
}

async function createReportForSnapshot(snapshot, audience) {
  const previous = await getPreviousSnapshotPersistent(snapshot);
  const delta = compareSnapshots(previous, snapshot);
  const input = buildClientReportInput({ snapshot, previous, delta, audience, locale: snapshot.locale });
  const report = await synthesizeClientReportWithDeepSeek(input);
  const markdown = clientReportToMarkdown(report, input);
  return saveClientReportPersistent({ snapshot, input, report, markdown });
}

function nextWeekly(schedule, after) {
  return nextScheduledRun({
    dayOfWeek: schedule.dayOfWeek,
    hourLocal: schedule.hourLocal,
    timezone: schedule.timezone,
    after,
  }).toISOString();
}

function retryable(error) {
  const status = Number(error?.status || 0);
  return status === 409 || status === 429 || status >= 500;
}

async function runOneSchedule(schedule, deps) {
  const scheduledFor = schedule.nextRunAt;
  const idempotencyKey = `weekly/${schedule.id}/${scheduledFor}`.slice(0, 256);
  let receipt = await getDeliveryByKey(idempotencyKey);
  const auth = await loadWorkspaceAuth(schedule.workspaceId);
  if (!auth) throw Object.assign(new Error('No durable GitHub connection exists for this workspace.'), { status: 401, code: 'github_connection_missing' });

  let savedReport = receipt?.reportId ? await getClientReportPersistent(receipt.reportId) : null;
  if (!savedReport) {
    const scheduledUsage = await consumeEntitlement(schedule.workspaceId, 'scheduled_run');
    if (!scheduledUsage.accepted) throw quotaError('scheduled_run', scheduledUsage);
    const reportUsage = await consumeEntitlement(schedule.workspaceId, 'report');
    if (!reportUsage.accepted) throw quotaError('report', reportUsage);

    const locale = schedule.locale === 'vi' ? 'vi' : 'en';
    const { dataset, payload } = await deps.withAuth(auth, () => deps.buildAnalysis({
      username: schedule.username,
      locale,
      days: schedule.days,
      includePrivate: true,
    }));
    const history = await deps.buildHistoryContext(dataset, payload, locale);
    const snapshot = history.snapshotId ? await getSnapshotByIdPersistent(history.snapshotId) : null;
    if (!snapshot) throw new Error('Scheduled analysis did not produce a persistent snapshot.');
    savedReport = await createReportForSnapshot(snapshot, schedule.audience);
    receipt = await saveDelivery({
      workspaceId: schedule.workspaceId,
      scheduleId: schedule.id,
      reportId: savedReport.id,
      recipient: schedule.email,
      provider: 'resend',
      providerId: null,
      status: 'prepared',
      idempotencyKey,
      lastError: null,
    });
  }

  if (receipt?.status === 'sent') {
    const nextRunAt = nextWeekly(schedule, new Date(scheduledFor));
    await completeSchedule({ id: schedule.id, nextRunAt, status: 'sent', reportId: savedReport.id });
    return { scheduleId: schedule.id, status: 'already_sent', reportId: savedReport.id };
  }

  if (!emailConfig().configured) {
    const nextRunAt = nextWeekly(schedule, new Date(scheduledFor));
    await saveDelivery({
      workspaceId: schedule.workspaceId,
      scheduleId: schedule.id,
      reportId: savedReport.id,
      recipient: schedule.email,
      provider: 'resend',
      providerId: null,
      status: 'email_not_configured',
      idempotencyKey,
      lastError: 'RESEND_API_KEY and DEV30_EMAIL_FROM are required for email delivery.',
    });
    await completeSchedule({ id: schedule.id, nextRunAt, status: 'report_ready_email_not_configured', reportId: savedReport.id, error: 'Email delivery not configured.' });
    return { scheduleId: schedule.id, status: 'report_ready_email_not_configured', reportId: savedReport.id };
  }

  const entitlement = await entitlementSnapshot(schedule.workspaceId);
  if (Number(entitlement.remaining.email_delivery || 0) <= 0) {
    const nextRunAt = nextWeekly(schedule, new Date(scheduledFor));
    await completeSchedule({ id: schedule.id, nextRunAt, status: 'email_quota_exceeded', reportId: savedReport.id, error: 'Email delivery quota reached.' });
    return { scheduleId: schedule.id, status: 'email_quota_exceeded', reportId: savedReport.id };
  }

  try {
    const rendered = renderStakeholderEmail(savedReport, { appBaseUrl: process.env.APP_BASE_URL || '' });
    const delivered = await sendEmail({
      to: schedule.email,
      ...rendered,
      idempotencyKey,
    });
    const emailUsage = await consumeEntitlement(schedule.workspaceId, 'email_delivery');
    await saveDelivery({
      workspaceId: schedule.workspaceId,
      scheduleId: schedule.id,
      reportId: savedReport.id,
      recipient: schedule.email,
      provider: delivered.provider,
      providerId: delivered.id,
      status: 'sent',
      idempotencyKey,
      lastError: emailUsage.accepted ? null : 'Delivered, but usage reconciliation exceeded the entitlement snapshot.',
    });
    const nextRunAt = nextWeekly(schedule, new Date(scheduledFor));
    await completeSchedule({ id: schedule.id, nextRunAt, status: 'sent', reportId: savedReport.id });
    return { scheduleId: schedule.id, status: 'sent', reportId: savedReport.id, providerId: delivered.id };
  } catch (error) {
    await saveDelivery({
      workspaceId: schedule.workspaceId,
      scheduleId: schedule.id,
      reportId: savedReport.id,
      recipient: schedule.email,
      provider: 'resend',
      providerId: null,
      status: 'failed',
      idempotencyKey,
      lastError: error.message,
    });
    const nextRunAt = retryable(error) ? scheduledFor : nextWeekly(schedule, new Date(scheduledFor));
    await completeSchedule({ id: schedule.id, nextRunAt, status: retryable(error) ? 'retry_pending' : 'delivery_failed', reportId: savedReport.id, error: error.message });
    return { scheduleId: schedule.id, status: retryable(error) ? 'retry_pending' : 'delivery_failed', reportId: savedReport.id, error: error.message };
  }
}

export function createSaasRoutes(deps) {
  if (!deps?.resolveAuth || !deps?.withAuth || !deps?.buildAnalysis || !deps?.buildHistoryContext) {
    throw new Error('Dev30 SaaS routes require auth and analysis dependencies.');
  }

  return async function handleSaasRoute(req, res, url) {
    try {
      if (req.method === 'POST' && url.pathname === '/api/disconnect') {
        const clearCookie = await destroySession(req);
        return sendJson(res, 200, { ok: true, disconnected: true }, { 'Set-Cookie': clearCookie }), true;
      }

      if (req.method === 'GET' && url.pathname === '/api/workspace-settings') {
        const auth = await deps.resolveAuth(req);
        if (!auth) return sendJson(res, 401, { error: 'Connect GitHub to open workspace settings.' }), true;
        const [schedule, entitlement] = await Promise.all([
          getScheduleByWorkspace(auth.workspaceId),
          entitlementSnapshot(auth.workspaceId),
        ]);
        return sendJson(res, 200, {
          workspaceId: auth.workspaceId,
          schedule,
          entitlement,
          email: emailConfig(),
          billing: billingConfig(),
          durableConnectionReady: durableConnectionReady(),
        }), true;
      }

      if (req.method === 'POST' && url.pathname === '/api/schedule') {
        const auth = await deps.resolveAuth(req);
        if (!auth) return sendJson(res, 401, { error: 'Connect GitHub before enabling weekly reports.' }), true;
        if (!durableConnectionReady()) return sendJson(res, 409, { error: 'Set DEV30_SESSION_SECRET before enabling scheduled reports so the GitHub connection survives restarts.' }), true;
        const body = await readJson(req);
        const schedule = schedulePayload(body, { workspaceId: auth.workspaceId, username: auth.viewer.login });
        await persistWorkspaceAuth(auth);
        const saved = await upsertSchedule(schedule);
        return sendJson(res, 200, { schedule: saved }), true;
      }

      if (req.method === 'POST' && url.pathname === '/api/schedule/disable') {
        const auth = await deps.resolveAuth(req);
        if (!auth) return sendJson(res, 401, { error: 'Connect GitHub first.' }), true;
        const schedule = await disableSchedule(auth.workspaceId);
        return sendJson(res, 200, { schedule }), true;
      }

      if (req.method === 'POST' && url.pathname === '/api/billing/checkout') {
        const auth = await deps.resolveAuth(req);
        if (!auth) return sendJson(res, 401, { error: 'Connect GitHub before upgrading.' }), true;
        const schedule = await getScheduleByWorkspace(auth.workspaceId);
        const session = await createCheckoutSession({ workspaceId: auth.workspaceId, email: schedule?.email || null });
        return sendJson(res, 200, session), true;
      }

      if (req.method === 'POST' && url.pathname === '/api/billing/portal') {
        const auth = await deps.resolveAuth(req);
        if (!auth) return sendJson(res, 401, { error: 'Connect GitHub first.' }), true;
        const session = await createPortalSession({ workspaceId: auth.workspaceId });
        return sendJson(res, 200, session), true;
      }

      if (req.method === 'POST' && url.pathname === '/api/billing/webhook') {
        const raw = await readRaw(req);
        const signature = req.headers['stripe-signature'];
        if (!verifyStripeSignature(raw, signature)) return sendJson(res, 400, { error: 'Invalid Stripe webhook signature.' }), true;
        const event = JSON.parse(raw);
        const result = await applyStripeEvent(event);
        return sendJson(res, 200, { received: true, ...result }), true;
      }

      if (req.method === 'POST' && url.pathname === '/api/internal/run-due') {
        if (!authorizedCron(req)) return sendJson(res, 401, { error: 'Invalid cron credential.' }), true;
        const schedules = await claimDueSchedules({ now: new Date(), limit: Number(process.env.DEV30_CRON_BATCH || 10), leaseSeconds: Number(process.env.DEV30_CRON_LEASE_SECONDS || 900) });
        const results = [];
        for (const schedule of schedules) {
          try {
            results.push(await runOneSchedule(schedule, deps));
          } catch (error) {
            const nextRunAt = retryable(error) ? schedule.nextRunAt : nextWeekly(schedule, new Date(schedule.nextRunAt));
            await completeSchedule({ id: schedule.id, nextRunAt, status: retryable(error) ? 'retry_pending' : 'failed', error: error.message }).catch(() => {});
            results.push({ scheduleId: schedule.id, status: retryable(error) ? 'retry_pending' : 'failed', error: error.message });
          }
        }
        return sendJson(res, 200, { claimed: schedules.length, results }), true;
      }

      if (req.method === 'GET' && url.pathname === '/api/internal/saas-stats') {
        if (!authorizedCron(req)) return sendJson(res, 401, { error: 'Invalid internal credential.' }), true;
        return sendJson(res, 200, await saasStats()), true;
      }

      return false;
    } catch (error) {
      if (error instanceof SyntaxError) return sendJson(res, 400, { error: 'Invalid JSON request.' }), true;
      return sendJson(res, error.status || 500, {
        error: error.message || 'Request failed.',
        code: error.code || null,
      }), true;
    }
  };
}

export const __saasRoutesTest = { secretEqual, authorizedCron, retryable };
