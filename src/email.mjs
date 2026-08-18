import './env.mjs';

const RESEND_URL = 'https://api.resend.com/emails';

export function emailConfig(env = process.env) {
  return {
    provider: 'resend',
    configured: Boolean(String(env.RESEND_API_KEY || '').trim() && String(env.DEV30_EMAIL_FROM || '').trim()),
    from: String(env.DEV30_EMAIL_FROM || '').trim(),
    replyTo: String(env.DEV30_EMAIL_REPLY_TO || '').trim() || null,
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function itemList(items) {
  if (!items?.length) return '<p>No material changes were observed.</p>';
  return `<ul>${items.map((item) => `<li>${item.repo ? `<strong>${escapeHtml(item.repo)}</strong> — ` : ''}${escapeHtml(item.text)}</li>`).join('')}</ul>`;
}

export function renderStakeholderEmail(saved, { appBaseUrl = '', unsubscribeUrl = '' } = {}) {
  const report = saved.report || {};
  const title = report.title || `Dev30 update — ${saved.username}`;
  const baseUrl = appBaseUrl ? String(appBaseUrl).replace(/\/+$/, '') : '';
  const reportUrl = saved.shareable && baseUrl ? `${baseUrl}/r/${saved.id}` : '';
  const workspaceUrl = baseUrl ? `${baseUrl}/workspace` : '';
  const primaryUrl = reportUrl || workspaceUrl;
  const primaryLabel = reportUrl ? 'Open evidence-backed report' : 'Open Dev30 workspace';
  const html = [
    '<!doctype html><html><body style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;color:#111827;line-height:1.6;max-width:720px;margin:0 auto;padding:28px">',
    '<div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#2563eb;margin-bottom:14px">Dev30 weekly briefing</div>',
    `<h1 style="font-size:24px;margin:0 0 10px">${escapeHtml(title)}</h1>`,
    `<p style="font-size:16px;color:#374151">${escapeHtml(report.executiveSummary || '')}</p>`,
    '<h2 style="font-size:18px">What shipped</h2>',
    itemList(report.shipped),
    '<h2 style="font-size:18px">What changed</h2>',
    itemList(report.changedSinceLast),
    '<h2 style="font-size:18px">Current direction</h2>',
    `<p>${escapeHtml(report.currentDirection || '')}</p>`,
    primaryUrl ? `<p style="margin:26px 0"><a href="${escapeHtml(primaryUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 16px;border-radius:10px">${escapeHtml(primaryLabel)}</a></p>` : '',
    reportUrl && workspaceUrl ? `<p style="font-size:13px"><a href="${escapeHtml(workspaceUrl)}">Open your Dev30 workspace</a></p>` : '',
    `<p style="color:#6b7280;font-size:12px">${escapeHtml(report.note || 'Generated from observed GitHub evidence by Dev30.')}</p>`,
    unsubscribeUrl ? `<p style="color:#6b7280;font-size:12px"><a href="${escapeHtml(unsubscribeUrl)}">Disable weekly Dev30 email</a></p>` : '',
    '</body></html>',
  ].join('');
  const textBase = saved.markdown || `${title}\n\n${report.executiveSummary || ''}`;
  const textLinks = [
    primaryUrl ? `${primaryLabel}: ${primaryUrl}` : '',
    reportUrl && workspaceUrl ? `Dev30 workspace: ${workspaceUrl}` : '',
    unsubscribeUrl ? `Disable weekly Dev30 email: ${unsubscribeUrl}` : '',
  ].filter(Boolean).join('\n');
  return {
    subject: title,
    html,
    text: textLinks ? `${textBase}\n\n${textLinks}` : textBase,
  };
}

export async function sendEmail({ to, subject, html, text, idempotencyKey }, env = process.env) {
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  const config = emailConfig(env);
  if (!config.configured) {
    throw Object.assign(new Error('Email delivery is not configured. Set RESEND_API_KEY and DEV30_EMAIL_FROM.'), { status: 503, code: 'email_not_configured' });
  }
  const response = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'dev30/1.0',
      'Idempotency-Key': String(idempotencyKey).slice(0, 256),
    },
    body: JSON.stringify({
      from: config.from,
      to: [to],
      subject,
      html,
      text,
      ...(config.replyTo ? { reply_to: config.replyTo } : {}),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) {
    const message = payload.message || payload.error || `Resend delivery failed (${response.status}).`;
    const error = Object.assign(new Error(message), { status: response.status || 502, code: payload.name || payload.code || 'email_delivery_failed' });
    throw error;
  }
  return { provider: 'resend', id: payload.id };
}

export const __emailTest = { escapeHtml };
