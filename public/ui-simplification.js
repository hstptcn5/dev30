const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function E(tag, cls = '', text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function isMeaninglessFocus(value) {
  const text = normalize(value);
  if (!text) return true;
  return new Set([
    'unknown',
    'none',
    'n/a',
    'na',
    'khong co',
    'chua co',
    'no activity',
    'no recent activity',
    'no development activity',
    'recent github work',
  ]).has(text);
}

export function hasWorkMix(snapshot) {
  return Object.values(snapshot?.workMix || {}).some((value) => Number(value || 0) > 0);
}

export function changeSummary(latest, previous) {
  if (!latest || !previous) return { kind: 'waiting', title: 'Waiting for a second snapshot', detail: 'Run another analysis after more GitHub activity to compare meaningful change.' };
  const currentRepo = latest.mainFocus?.repo || '';
  const previousRepo = previous.mainFocus?.repo || '';
  if (isMeaninglessFocus(currentRepo) && isMeaninglessFocus(previousRepo)) {
    return { kind: 'unchanged', title: 'No meaningful change since the previous snapshot', detail: 'Both windows show no meaningful development activity to compare.' };
  }
  if (currentRepo && previousRepo && currentRepo !== previousRepo) {
    return { kind: 'moved', title: `Focus moved to ${currentRepo}`, detail: `Previous snapshot centered on ${previousRepo}.` };
  }
  if (currentRepo && !isMeaninglessFocus(currentRepo)) {
    return { kind: 'steady', title: `Focus still centers on ${currentRepo}`, detail: 'The journal is building a comparable history around the same focus.' };
  }
  return { kind: 'growing', title: 'Your journal is building comparable history', detail: 'Run another analysis after meaningful activity to make the change clearer.' };
}

function formatDate(value) {
  if (!value) return '';
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); } catch { return String(value); }
}

function compactLanding() {
  if (location.pathname !== '/') return;
  $('.visual-live-badge')?.classList.add('ui-trim-hidden');
  $('.example-preview')?.classList.add('ui-trim-hidden');
  $('.value-strip')?.classList.add('ui-trim-hidden');

  const pipeline = $('#visual-activity-pipeline');
  if (!pipeline || $('#ui-compact-example')) return;
  const example = E('aside', 'ui-compact-example');
  example.id = 'ui-compact-example';
  const copy = E('div');
  copy.append(E('strong', '', 'Want to see a real Dev30 briefing?'), E('span', '', 'Open the GoFlow example instead of reading another feature section.'));
  const button = E('button', 'ui-inline-action', 'Open example briefing →');
  button.type = 'button';
  button.onclick = () => $('.example-link')?.click();
  example.append(copy, button);
  pipeline.insertAdjacentElement('afterend', example);
}

let landingAuthCheckStarted = false;
async function trimReturningUserJourney() {
  if (location.pathname !== '/' || landingAuthCheckStarted || !$('#paid-beta-journey')) return;
  if (!$('#workspace-nav') || $('#workspace-nav').classList.contains('hidden')) return;
  landingAuthCheckStarted = true;
  try {
    const response = await fetch('/api/workspace?days=30&locale=vi', { cache: 'no-store' });
    if (!response.ok) return;
    const workspace = await response.json().catch(() => null);
    if ((workspace?.snapshots || []).length > 0) $('#paid-beta-journey')?.classList.add('ui-trim-hidden');
  } catch {}
}

function findRecentHistorySection() {
  return $$('.workspace-section').find((section) => normalize($('.workspace-section-head > div', section)?.textContent) === 'recent history') || null;
}

function trimRecentHistory(workspace) {
  const section = findRecentHistorySection();
  if (!section) return;
  const panels = $$('.workspace-list-panel', section);
  const snapshotPanel = panels[0];
  const reportPanel = panels[1];
  snapshotPanel?.classList.add('ui-trim-hidden');
  if ((workspace.reports || []).length === 0) {
    section.classList.add('ui-trim-hidden');
    return;
  }
  section.classList.remove('ui-trim-hidden');
  const title = $('.workspace-section-head > div', section);
  if (title) title.textContent = 'Stakeholder reports';
  const note = $('.workspace-section-head .muted', section);
  if (note) note.textContent = 'Saved client and founder-ready outputs.';
  $('.workspace-history-columns', section)?.classList.add('ui-reports-only');
  reportPanel?.classList.remove('ui-trim-hidden');
}

function normalizeTimeline(workspace) {
  const snapshots = new Map((workspace.snapshots || []).map((item) => [item.id, item]));
  $$('.visual-timeline-node').forEach((node) => {
    const snapshot = snapshots.get(node.dataset.snapshotId);
    if (!snapshot || !isMeaninglessFocus(snapshot.mainFocus?.repo)) return;
    const strong = $('.visual-timeline-card > strong', node);
    const copy = $('.visual-timeline-card > p', node);
    if (strong) strong.textContent = 'No activity recorded';
    if (copy) copy.textContent = 'No meaningful GitHub development activity in this window.';
  });
  const range = $('.visual-journal-range');
  if (range) {
    const start = $('span:first-child', range)?.textContent?.trim();
    const end = $('strong', range)?.textContent?.trim();
    range.classList.toggle('ui-trim-hidden', Boolean(start && end && start === end));
  }
}

function trimWorkDna(workspace) {
  const dna = $('.visual-work-dna');
  const body = $('.visual-journal-body');
  if (!dna || !body) return;
  const latest = workspace.snapshots?.[0];
  const useful = hasWorkMix(latest);
  dna.classList.toggle('ui-trim-hidden', !useful);
  body.classList.toggle('ui-journal-wide', !useful);
}

function compactSnapshotOverview(workspace, settings) {
  const overview = $('.workspace-overview');
  const primary = $('.workspace-primary-card', overview || document);
  if (!overview || !primary) return;
  const summaryCards = $$('.workspace-summary-card', overview);
  summaryCards.forEach((card) => card.classList.add('ui-trim-hidden'));

  let meta = $('.ui-latest-meta', primary);
  if (!meta) {
    meta = E('div', 'ui-latest-meta');
    primary.append(meta);
  }
  meta.replaceChildren();
  const [latest, previous] = workspace.snapshots || [];
  const change = changeSummary(latest, previous);
  const changeItem = E('div', 'ui-latest-meta-item');
  changeItem.append(E('span', '', 'Since last snapshot'), E('strong', '', change.title), E('small', '', change.detail));

  const schedule = settings?.schedule;
  const plan = settings?.entitlement?.plan || 'free';
  const weekly = E('div', 'ui-latest-meta-item');
  if (schedule?.enabled) {
    weekly.append(E('span', '', 'Weekly update'), E('strong', '', `Next ${formatDate(schedule.nextRunAt)}`), E('small', '', `${schedule.audience === 'founder' ? 'Founder' : 'Client'} update · ${schedule.locale === 'vi' ? 'Tiếng Việt' : 'English'}`));
  } else if (plan === 'pro') {
    weekly.append(E('span', '', 'Weekly update'), E('strong', '', 'Not scheduled yet'), E('small', '', 'Set a day and recipient below when you want Dev30 to run automatically.'));
  } else {
    weekly.append(E('span', '', 'Weekly update · Pro'), E('strong', '', 'Automatic delivery is optional'), E('small', '', 'Your public developer journal remains available on Free.'));
  }
  meta.append(changeItem, weekly);
}

function trimOnboarding(workspace) {
  if ((workspace.snapshots || []).length > 0) $('#paid-beta-workspace-onboarding')?.classList.add('ui-trim-hidden');
}

function ensureUpgradeAction(preview) {
  let link = $('.ui-weekly-upgrade', preview);
  if (link) return link;
  link = E('a', 'ui-weekly-upgrade', 'Upgrade to Pro →');
  link.href = '/pricing';
  $('.visual-weekly-intro', preview)?.append(link);
  return link;
}

function simplifyWeekly(settings) {
  const automation = $('#automation');
  const form = $('.workspace-form', automation || document);
  const preview = $('.visual-weekly-preview', automation || document);
  if (!automation || !form || !preview) return;
  const plan = settings?.entitlement?.plan || 'free';
  const scheduleEnabled = Boolean(settings?.schedule?.enabled);
  const freePreview = plan !== 'pro' && !scheduleEnabled;

  form.hidden = freePreview;
  automation.classList.toggle('ui-free-weekly', freePreview);
  $('.paid-beta-pro-gate', automation)?.classList.add('ui-trim-hidden');
  preview.classList.toggle('is-locked', freePreview);
  const kicker = $('.visual-weekly-intro .visual-kicker', preview);
  const note = $('.visual-weekly-intro p', preview);
  if (freePreview) {
    if (kicker) kicker.textContent = 'Pro preview';
    if (note) note.textContent = 'See exactly what the recurring update looks like. Upgrade only when you want Dev30 to deliver it automatically.';
    ensureUpgradeAction(preview).classList.remove('ui-trim-hidden');
  } else {
    if (kicker) kicker.textContent = 'Live preview';
    $('.ui-weekly-upgrade', preview)?.classList.add('ui-trim-hidden');
  }
  automation.dataset.uiWeeklySimplified = 'true';
}

let workspaceSimplifyLoading = false;
async function simplifyWorkspace() {
  if (location.pathname !== '/workspace' || workspaceSimplifyLoading) return;
  const automation = $('#automation');
  if (!$('.workspace-hero') || !automation || !$('.visual-weekly-preview', automation)) return;
  const hadSnapshots = document.body.dataset.uiHasSnapshots === 'true';
  const stageDone = !hadSnapshots || $('.visual-journal-stage')?.dataset.uiSimplified === 'true';
  if (document.body.dataset.uiSimplified === 'true' && automation.dataset.uiWeeklySimplified === 'true' && stageDone && (!hadSnapshots || $('.ui-latest-meta'))) return;

  workspaceSimplifyLoading = true;
  try {
    const [workspaceResponse, settingsResponse] = await Promise.all([
      fetch('/api/workspace?days=30&locale=vi', { cache: 'no-store' }),
      fetch('/api/workspace-settings', { cache: 'no-store' }),
    ]);
    if (!workspaceResponse.ok || !settingsResponse.ok) return;
    const [workspace, settings] = await Promise.all([
      workspaceResponse.json().catch(() => null),
      settingsResponse.json().catch(() => null),
    ]);
    if (!workspace || !settings) return;

    const hasSnapshots = (workspace.snapshots || []).length > 0;
    document.body.dataset.uiHasSnapshots = hasSnapshots ? 'true' : 'false';
    trimOnboarding(workspace);
    if (hasSnapshots) {
      const stage = $('.visual-journal-stage');
      if (stage) {
        normalizeTimeline(workspace);
        trimWorkDna(workspace);
        stage.dataset.uiSimplified = 'true';
      }
      compactSnapshotOverview(workspace, settings);
      trimRecentHistory(workspace);
    }
    simplifyWeekly(settings);
    document.body.dataset.uiSimplified = 'true';
  } finally {
    workspaceSimplifyLoading = false;
  }
}

function runSimplification() {
  compactLanding();
  trimReturningUserJourney();
  simplifyWorkspace();
}

if (typeof document !== 'undefined') {
  runSimplification();
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      runSimplification();
    });
  }).observe(document.body, { childList: true, subtree: true });
}