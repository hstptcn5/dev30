const $ = (selector) => document.querySelector(selector);
const E = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = String(text);
  return node;
};

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

function latestSnapshotCard(workspace) {
  const card = E('section', 'workspace-primary-card');
  card.append(E('span', 'workspace-card-label', 'Latest activity snapshot'));
  const latest = workspace.snapshots?.[0];
  if (!latest) {
    card.append(E('h2', '', 'No snapshot yet'), E('p', 'muted', 'Analyze your GitHub account once to start a private activity history.'));
  } else {
    card.append(
      E('div', 'workspace-card-date', formatDate(latest.generatedAt)),
      E('div', 'workspace-card-repo', latest.mainFocus?.repo || 'Recent GitHub work'),
      E('h2', '', latest.mainFocus?.title || latest.headline || 'Latest developer activity'),
    );
    if (latest.headline && latest.headline !== latest.mainFocus?.title) card.append(E('p', 'muted', latest.headline));
  }
  const link = E('a', 'workspace-text-link', latest ? 'Run a fresh analysis →' : 'Analyze my account →');
  link.href = '/';
  card.append(link);
  return card;
}

function changeCard(workspace) {
  const card = E('section', 'workspace-summary-card');
  card.append(E('span', 'workspace-card-label', 'Since last snapshot'));
  const [latest, previous] = workspace.snapshots || [];
  if (!latest || !previous) {
    card.append(E('strong', '', 'Waiting for a second snapshot'), E('p', 'muted', 'Come back after more GitHub activity and Dev30 will make progress comparable.'));
    return card;
  }
  const currentRepo = latest.mainFocus?.repo || '';
  const previousRepo = previous.mainFocus?.repo || '';
  if (currentRepo && previousRepo && currentRepo !== previousRepo) {
    card.append(E('strong', '', `Focus moved to ${currentRepo}`), E('p', 'muted', `Previous snapshot centered on ${previousRepo}. Open a fresh report for the evidence-backed delta.`));
  } else {
    card.append(E('strong', '', currentRepo ? `Focus still centers on ${currentRepo}` : 'Progress history is growing'), E('p', 'muted', `${workspace.snapshots.length} saved snapshots are available in this workspace.`));
  }
  return card;
}

function scheduleSummaryCard(settings) {
  const card = E('section', 'workspace-summary-card');
  card.append(E('span', 'workspace-card-label', 'Next stakeholder update'));
  const schedule = settings.schedule;
  if (!schedule?.enabled) {
    card.append(E('strong', '', 'Not scheduled yet'), E('p', 'muted', 'Turn your saved activity into an automatic weekly client or founder update.'));
    const jump = E('button', 'workspace-text-button', 'Set up weekly update →');
    jump.type = 'button';
    jump.onclick = () => document.querySelector('#automation')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.append(jump);
    return card;
  }
  card.append(
    E('strong', '', formatDate(schedule.nextRunAt)),
    E('p', 'muted', `${schedule.audience === 'founder' ? 'Founder' : 'Client'} update · ${schedule.days || 7}-day window · ${schedule.locale === 'vi' ? 'Tiếng Việt' : 'English'}`),
  );
  return card;
}

function renderScheduleCard(settings, rerender) {
  const schedule = settings.schedule || null;
  const section = E('section', 'workspace-section');
  section.id = 'automation';
  const heading = E('div', 'workspace-section-head');
  heading.append(E('div', '', 'Weekly update'), E('p', 'muted', 'Automatically turn your GitHub activity into a stakeholder-ready report.'));
  section.append(heading);

  if (!settings.durableConnectionReady) section.append(E('p', 'workspace-callout', 'A persistent DEV30_SESSION_SECRET is required before scheduled reports can survive server restarts.'));
  if (!settings.email?.configured) section.append(E('p', 'workspace-soft-note', 'Email delivery is not configured on this instance. Scheduled reports can still be prepared and saved.'));

  const form = E('form', 'workspace-form');
  const email = E('input'); email.type = 'email'; email.required = true; email.placeholder = 'you@example.com'; email.value = schedule?.email || '';
  const day = E('select'); ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].forEach((name, index) => day.append(option(index, name, Number(schedule?.dayOfWeek ?? 1) === index)));
  const hour = E('select'); for (let value = 0; value < 24; value += 1) hour.append(option(value, `${String(value).padStart(2, '0')}:00`, Number(schedule?.hourLocal ?? 8) === value));
  const audience = E('select'); audience.append(option('client', 'Client update', (schedule?.audience || 'client') === 'client'), option('founder', 'Founder update', schedule?.audience === 'founder'));
  const windowSelect = E('select'); [7,30,90].forEach((value) => windowSelect.append(option(value, `${value} day evidence window`, Number(schedule?.days || 7) === value)));
  const localeSelect = E('select'); localeSelect.append(option('en', 'English', (schedule?.locale || 'en') === 'en'), option('vi', 'Tiếng Việt', schedule?.locale === 'vi'));
  const timezone = E('input'); timezone.required = true; timezone.value = schedule?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  form.append(field('Send to', email), field('Day', day), field('Local hour', hour), field('Audience', audience), field('Evidence window', windowSelect), field('Language', localeSelect), field('Timezone', timezone));

  const actions = E('div', 'workspace-form-actions');
  const save = E('button', 'workspace-primary-button', schedule?.enabled ? 'Update schedule' : 'Enable weekly update'); save.type = 'submit';
  actions.append(save);
  if (schedule?.enabled) {
    const disable = E('button', 'workspace-secondary-button', 'Disable'); disable.type = 'button';
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
        days: Number(windowSelect.value),
        locale: localeSelect.value,
        timezone: timezone.value,
        enabled: true,
      });
      await rerender();
    } catch (error) {
      alert(error.message);
      save.disabled = false;
    }
  };
  section.append(form);

  if (schedule) {
    const status = E('div', 'schedule-status');
    status.append(
      E('span', schedule.enabled ? 'schedule-enabled' : '', schedule.enabled ? 'Enabled' : 'Disabled'),
      E('span', 'muted', schedule.nextRunAt ? `Next ${formatDate(schedule.nextRunAt)}` : 'No next run'),
      E('span', 'muted', schedule.lastRunAt ? `Last ${formatDate(schedule.lastRunAt)} · ${schedule.lastStatus || 'unknown'}` : 'No scheduled run yet'),
    );
    if (schedule.lastError) status.append(E('span', 'status error', schedule.lastError));
    section.append(status);
  }
  return section;
}

function recentActivity(workspace) {
  const section = E('section', 'workspace-section');
  const heading = E('div', 'workspace-section-head');
  heading.append(E('div', '', 'Recent history'), E('p', 'muted', 'Your saved snapshots and stakeholder-ready outputs.'));
  section.append(heading);
  const grid = E('div', 'workspace-history-columns');

  const snapshots = E('div', 'workspace-list-panel');
  snapshots.append(E('span', 'workspace-card-label', 'Snapshots'));
  const snapshotList = E('div', 'workspace-list');
  (workspace.snapshots || []).slice(0, 8).forEach((item) => {
    const row = E('div', 'workspace-list-row');
    const copy = E('div');
    copy.append(E('strong', '', item.mainFocus?.repo || 'Activity snapshot'), E('span', '', item.mainFocus?.title || item.headline || 'Saved analysis'));
    row.append(copy, E('time', '', formatDate(item.generatedAt)));
    snapshotList.append(row);
  });
  if (!snapshotList.childNodes.length) snapshotList.append(E('p', 'muted', 'No private snapshots yet.'));
  snapshots.append(snapshotList);

  const reports = E('div', 'workspace-list-panel');
  reports.append(E('span', 'workspace-card-label', 'Stakeholder reports'));
  const reportList = E('div', 'workspace-list');
  (workspace.reports || []).slice(0, 8).forEach((item) => {
    const row = E('div', 'workspace-list-row');
    const copy = E('div');
    copy.append(E('strong', '', item.title || 'Stakeholder update'), E('span', '', item.audience === 'founder' ? 'Founder update' : 'Client update'));
    row.append(copy, E('time', '', formatDate(item.createdAt)));
    reportList.append(row);
  });
  if (!reportList.childNodes.length) reportList.append(E('p', 'muted', 'No stakeholder reports yet. Generate one from a saved analysis.'));
  reports.append(reportList);
  grid.append(snapshots, reports);
  section.append(grid);
  return section;
}

function usageRow(metric, settings) {
  const used = Number(settings.entitlement?.usage?.[metric] || 0);
  const limit = Number(settings.entitlement?.limits?.[metric] || 0);
  const row = E('div', 'usage-row');
  row.append(E('span', '', metric.replaceAll('_', ' ')), E('strong', '', `${used} / ${limit}`));
  return row;
}

function settingsPanel(workspace, settings) {
  const details = E('details', 'workspace-settings');
  details.append(E('summary', '', 'Workspace settings'));
  const body = E('div', 'workspace-settings-body');

  const access = E('section', 'workspace-settings-card');
  access.append(E('span', 'workspace-card-label', 'Repository access'));
  const accessText = workspace.access?.readyForPrivateAnalysis
    ? `${workspace.access.privateReposAccessible} private repositories available`
    : `Private access not ready · ${workspace.access?.status || 'unknown'}`;
  access.append(E('strong', '', accessText), E('p', 'muted', workspace.authMode === 'pat' ? 'Local development connection' : 'GitHub App connection'));

  const plan = E('section', 'workspace-settings-card');
  plan.append(E('span', 'workspace-card-label', 'Plan & usage'), E('strong', '', String(settings.entitlement?.plan || 'free').toUpperCase()));
  const usage = E('div', 'usage-list');
  ['analysis', 'report', 'scheduled_run', 'email_delivery'].forEach((metric) => usage.append(usageRow(metric, settings)));
  plan.append(usage);
  if (settings.billing?.configured) {
    const isPro = settings.entitlement?.plan === 'pro';
    const billing = E('button', 'workspace-secondary-button', isPro ? 'Manage billing' : 'Upgrade to Pro');
    billing.type = 'button';
    billing.onclick = async () => {
      billing.disabled = true;
      try {
        const result = await postJson(isPro ? '/api/billing/portal' : '/api/billing/checkout');
        if (result.url) location.href = result.url;
      } catch (error) { alert(error.message); billing.disabled = false; }
    };
    plan.append(billing);
  }

  if (workspace.authMode === 'github-app') {
    const disconnect = E('section', 'workspace-settings-card danger-zone');
    disconnect.append(E('span', 'workspace-card-label', 'Connection'), E('strong', '', 'Disconnect GitHub'), E('p', 'muted', 'This also disables scheduled work and removes the durable GitHub credential for this workspace.'));
    const button = E('button', 'workspace-secondary-button', 'Disconnect');
    button.type = 'button';
    button.onclick = async () => {
      if (!confirm('Disconnect GitHub and stop scheduled work for this workspace?')) return;
      button.disabled = true;
      try {
        const result = await postJson('/api/disconnect');
        if (result.disconnected !== true) throw new Error('Disconnect did not complete.');
        location.href = '/';
      } catch (error) { alert(error.message); button.disabled = false; }
    };
    disconnect.append(button);
    body.append(access, plan, disconnect);
  } else {
    body.append(access, plan);
  }
  details.append(body);
  return details;
}

async function renderWorkspace() {
  if (location.pathname !== '/workspace') return;
  $('.hero')?.classList.add('hidden');
  $('.example-preview')?.classList.add('hidden');
  $('.value-strip')?.classList.add('hidden');
  const root = $('#report');
  if (!root) return;
  root.classList.remove('hidden');
  root.replaceChildren(E('div', 'status', 'Loading your workspace…'));

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
    const head = E('header', 'workspace-hero');
    const copy = E('div');
    copy.append(E('span', 'eyebrow', 'Your developer journal'), E('h1', 'workspace-title', workspace.viewer.name || workspace.viewer.login), E('p', 'muted', `@${workspace.viewer.login} · ${workspace.snapshots?.length || 0} saved snapshots · ${workspace.reports?.length || 0} stakeholder reports`));
    const analyze = E('a', 'workspace-primary-button', 'Analyze latest work'); analyze.href = '/';
    head.append(copy, analyze);
    root.append(head);

    const overview = E('div', 'workspace-overview');
    overview.append(latestSnapshotCard(workspace), changeCard(workspace), scheduleSummaryCard(settings));
    root.append(overview, recentActivity(workspace), renderScheduleCard(settings, renderWorkspace), settingsPanel(workspace, settings));
  } catch (error) {
    root.replaceChildren(E('div', 'status error', error.message));
  }
}

renderWorkspace();
