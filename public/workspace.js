const $ = (selector) => document.querySelector(selector);
const E = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = String(text); return node; };

function formatDate(value) {
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); } catch { return value || ''; }
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
    const response = await fetch('/api/workspace?days=30&locale=vi', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Workspace unavailable.');

    root.replaceChildren();
    const head = E('section', 'card workspace-hero');
    const title = E('div');
    title.append(E('span', 'eyebrow', 'Your Dev30 workspace'), E('h2', 'workspace-title', data.viewer.name || data.viewer.login), E('p', 'muted', `@${data.viewer.login} · ${data.authMode} · ${data.workspaceId}`));
    const actions = E('div', 'profile-actions');
    const analyze = E('a', 'action-button', 'Analyze my account'); analyze.href = '/';
    const install = data.access?.readyForPrivateAnalysis ? null : E('a', 'action-button secondary', 'Choose repositories');
    if (install) { install.href = '/'; install.onclick = async (event) => { event.preventDefault(); const me = await fetch('/api/me').then((r) => r.json()); if (me.installUrl) location.href = me.installUrl; }; }
    actions.append(analyze); if (install) actions.append(install);
    head.append(title, actions); root.append(head);

    const access = E('section', 'card');
    access.append(E('h3', '', 'Repository access'));
    const status = data.access?.readyForPrivateAnalysis
      ? `Private access ready · ${data.access.privateReposAccessible} private repositories accessible`
      : `Private access not ready · ${data.access?.status || 'unknown'}`;
    access.append(E('p', 'big-takeaway workspace-access', status)); root.append(access);

    const grid = E('div', 'grid');
    const snapshots = E('section', 'card half'); snapshots.append(E('h3', '', 'Recent snapshots'));
    const snapshotList = E('div', 'project-list');
    (data.snapshots || []).forEach((item) => { const row = E('div', 'project'); row.append(E('strong', '', formatDate(item.generatedAt)), E('p', 'muted', `${item.mainFocus?.repo || 'No focus'} — ${item.mainFocus?.title || item.headline || ''}`)); snapshotList.append(row); });
    if (!snapshotList.childNodes.length) snapshotList.append(E('p', 'muted', 'No private snapshots yet. Analyze your account first.'));
    snapshots.append(snapshotList);

    const reports = E('section', 'card half'); reports.append(E('h3', '', 'Stakeholder reports'));
    const reportList = E('div', 'project-list');
    (data.reports || []).forEach((item) => { const row = E('div', 'project'); row.append(E('strong', '', item.title || 'Stakeholder update'), E('p', 'muted', `${formatDate(item.createdAt)} · ${item.audience}`)); reportList.append(row); });
    if (!reportList.childNodes.length) reportList.append(E('p', 'muted', 'No private stakeholder reports yet.'));
    reports.append(reportList); grid.append(snapshots, reports); root.append(grid);
  } catch (error) {
    root.replaceChildren(E('div', 'status error', error.message));
  }
}

renderWorkspace();
