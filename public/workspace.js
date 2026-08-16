const $ = (selector) => document.querySelector(selector);
const E = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = String(text); return node; };

function formatDate(value) {
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); } catch { return value || ''; }
}

function option(value, text, selected = false) {
  const node = E('option', '', text);
  node.value = String(value);
  node.selected = selected;
  return node;
}

function field(label, control) {
  const wrap = E('label', 'workspace-field');
  wrap.append(E('span', '', label), control);
  return wrap;
}

async function postJson(url, body = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function usageRow(metric, settings) {
  const used = Number(settings.entitlement?.usage?.[metric] || 0);
  const limit = Number(settings.entitlement?.limits?.[metric] || 0);
  const row = E('div', 'usage-row');
  row.append(E('span', '', metric.replaceAll('_', ' ')), E('strong', '', `${used} / ${limit}`));
  return row;
}

function renderPlanCard(settings) {
  const card = E('section', 'card half');
  card.append(E('h3', '', 'Plan & usage'));
  const plan = E('div', 'workspace-plan');
  plan.append(E('strong', '', String(settings.entitlement?.plan || 'free').toUpperCase()), E('span', 'muted', `Usage period ${settings.entitlement?.periodStart || ''}`));
  card.append(plan);
  const usage = E('div', 'usage-list');
  ['analysis', 'report', 'scheduled_run', 'email_delivery'].forEach((metric) => usage.append(usageRow(metric, settings)));
  card.append(usage);

  const actions = E('div', 'profile-actions workspace-plan-actions');
  if (settings.billing?.configured) {
    const isPro = settings.entitlement?.plan === 'pro';
    const button = E('button', 'action-button', isPro ? 'Manage billing' : 'Upgrade to Pro');
    button.type = 'button';
    button.onclick = async () => {
      button.disabled = true;
      try {
        const result = await postJson(isPro ? '/api/billing/portal' : '/api/billing/checkout');
        if (result.url) location.href = result.url;
      } catch (error) {
        alert(error.message);
        button.disabled = false;
      }
    };
    actions.append(button);
  } else {
    actions.append(E('span', 'muted', 'Billing is not configured on this instance.'));
  }
  card.append(actions);
  return card;
}

function renderScheduleCard(settings, rerender) {
  const schedule = settings.schedule || null;
  const card = E('section', 'card half');
  card.append(E('h3', '', 'Weekly stakeholder report'));
  if (!settings.durableConnectionReady) {
    card.append(E('p', 'notice', 'Set DEV30_SESSION_SECRET before enabling schedules. The durable GitHub connection must survive server restarts.'));
  }
  if (!settings.email?.configured) {
    card.append(E('p', 'muted', 'Email provider is not configured yet. Dev30 can still save the scheduled report, but delivery will be skipped until RESEND_API_KEY and DEV30_EMAIL_FROM are set.'));
  }

  const form = E('form', 'workspace-form');
  const email = E('input'); email.type = 'email'; email.required = true; email.placeholder = 'you@example.com'; email.value = schedule?.email || '';
  const day = E('select'); ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].forEach((name, index) => day.append(option(index, name, Number(schedule?.dayOfWeek ?? 1) === index)));
  const hour = E('select'); for (let h = 0; h < 24; h += 1) hour.append(option(h, `${String(h).padStart(2, '0')}:00`, Number(schedule?.hourLocal ?? 8) === h));
  const audience = E('select'); audience.append(option('client', 'Client update', (schedule?.audience || 'client') === 'client'), option('founder', 'Founder update', schedule?.audience === 'founder'));
  const days = E('select'); [7,30,90].forEach((value) => days.append(option(value, `${value} day evidence window`, Number(schedule?.days || 7) === value)));
  const timezone = E('input'); timezone.required = true; timezone.value = schedule?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  form.append(field('Delivery email', email), field('Day', day), field('Local hour', hour), field('Audience', audience), field('Evidence window', days), field('Timezone', timezone));

  const actions = E('div', 'profile-actions workspace-form-actions');
  const save = E('button', 'action-button', schedule?.enabled ? 'Update weekly report' : 'Enable weekly report'); save.type = 'submit';
  actions.append(save);
  if (schedule?.enabled) {
    const disable = E('button', 'action-button secondary', 'Disable'); disable.type = 'button';
    disable.onclick = async () => {
      disable.disabled = true;
      try { await postJson('/api/schedule/disable'); await rerender(); } catch (error) { alert(error.message); disable.disabled = false; }
    };
    actions.append(disable);
  }
  form.append(actions);
  form.onsubmit = async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      await postJson('/api/schedule', {
        email: email.value,
        dayOfWeek: Number(day.value),
        hourLocal: Number(hour.value),
        audience: audience.value,
        days: Number(days.value),
        timezone: timezone.value,
        enabled: true,
      });
      await rerender();
    } catch (error) {
      alert(error.message);
      save.disabled = false;
    }
  };
  card.append(form);

  if (schedule) {
    const status = E('div', 'schedule-status');
    status.append(
      E('span', '', schedule.enabled ? 'Enabled' : 'Disabled'),
      E('span', 'muted', `Next: ${formatDate(schedule.nextRunAt)}`),
      E('span', 'muted', schedule.lastRunAt ? `Last: ${formatDate(schedule.lastRunAt)} · ${schedule.lastStatus || 'unknown'}` : 'No scheduled run yet'),
    );
    if (schedule.lastError) status.append(E('span', 'status error', schedule.lastError));
    card.append(status);
  }
  return card;
}

async function renderWorkspace() {
  if (location.pathname !== '/workspace') return;
  $('.hero')?.classList.add('hidden');
  $('.value-strip')?.classList.add('hidden');
  const root = $('#report');
  if (!root) return;
  root.classList.remove('hidden');
  root.replaceChildren(E('div', 'status', 'Loading your GitHub workspace…'));

  try {
    const [workspaceResponse, settingsResponse] = await Promise.all([
      fetch('/api/workspace?days=30&locale=vi', { cache: 'no-store' }),
      fetch('/api/workspace-settings', { cache: 'no-store' }),
    ]);
    const workspace = await workspaceResponse.json();
    const settings = await settingsResponse.json();
    if (!workspaceResponse.ok) throw new Error(workspace.error || 'Workspace unavailable.');
    if (!settingsResponse.ok) throw new Error(settings.error || 'Workspace settings unavailable.');

    root.replaceChildren();
    const head = E('section', 'card workspace-hero');
    const title = E('div');
    title.append(E('span', 'eyebrow', 'Your Dev30 workspace'), E('h2', 'workspace-title', workspace.viewer.name || workspace.viewer.login), E('p', 'muted', `@${workspace.viewer.login} · ${workspace.authMode} · ${workspace.workspaceId} · storage ${workspace.persistence}`));
    const actions = E('div', 'profile-actions');
    const analyze = E('a', 'action-button', 'Analyze my account'); analyze.href = '/';
    const install = workspace.access?.readyForPrivateAnalysis ? null : E('a', 'action-button secondary', 'Choose repositories');
    if (install) { install.href = '/'; install.onclick = async (event) => { event.preventDefault(); const me = await fetch('/api/me').then((r) => r.json()); if (me.installUrl) location.href = me.installUrl; }; }
    actions.append(analyze); if (install) actions.append(install);
    head.append(title, actions); root.append(head);

    const access = E('section', 'card');
    access.append(E('h3', '', 'Repository access'));
    const status = workspace.access?.readyForPrivateAnalysis
      ? `Private access ready · ${workspace.access.privateReposAccessible} private repositories accessible`
      : `Private access not ready · ${workspace.access?.status || 'unknown'}`;
    access.append(E('p', 'big-takeaway workspace-access', status)); root.append(access);

    const controls = E('div', 'grid');
    controls.append(renderPlanCard(settings), renderScheduleCard(settings, renderWorkspace));
    root.append(controls);

    const grid = E('div', 'grid workspace-history-grid');
    const snapshots = E('section', 'card half'); snapshots.append(E('h3', '', 'Recent snapshots'));
    const snapshotList = E('div', 'project-list');
    (workspace.snapshots || []).forEach((item) => { const row = E('div', 'project'); row.append(E('strong', '', formatDate(item.generatedAt)), E('p', 'muted', `${item.mainFocus?.repo || 'No focus'} — ${item.mainFocus?.title || item.headline || ''}`)); snapshotList.append(row); });
    if (!snapshotList.childNodes.length) snapshotList.append(E('p', 'muted', 'No private snapshots yet. Analyze your account first.'));
    snapshots.append(snapshotList);

    const reports = E('section', 'card half'); reports.append(E('h3', '', 'Stakeholder reports'));
    const reportList = E('div', 'project-list');
    (workspace.reports || []).forEach((item) => { const row = E('div', 'project'); row.append(E('strong', '', item.title || 'Stakeholder update'), E('p', 'muted', `${formatDate(item.createdAt)} · ${item.audience}`)); reportList.append(row); });
    if (!reportList.childNodes.length) reportList.append(E('p', 'muted', 'No private stakeholder reports yet.'));
    reports.append(reportList); grid.append(snapshots, reports); root.append(grid);
  } catch (error) {
    root.replaceChildren(E('div', 'status error', error.message));
  }
}

renderWorkspace();
