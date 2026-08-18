const $ = (selector) => document.querySelector(selector);

const state = {
  auth: 'unknown',
  plan: 'unknown',
  workspace: null,
  settings: null,
};

function E(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function connectHref(returnTo = '/') {
  return `/auth/github?returnTo=${encodeURIComponent(returnTo)}`;
}

function pricingHref() {
  return '/pricing';
}

function setConnectionState(value) {
  state.auth = value;
  document.body.dataset.githubConnection = value;
}

function friendlyMessage(message = '') {
  const raw = String(message || '').trim();
  const text = raw.toLowerCase();
  if (!raw) return 'Something interrupted this request. Try again in a moment.';
  if (text.includes('github api 5') || text.includes('no server is currently available') || text.includes('github viewer') || text.includes('github request failed')) {
    return 'GitHub is having trouble responding right now. Your connection and saved Dev30 work are still safe. Try again in a moment.';
  }
  if (text.includes('revenuecat') || text.includes('entitlement_unavailable') || text.includes('verify your plan')) {
    return 'Dev30 could not verify your plan right now. Nothing was downgraded. Try again in a moment.';
  }
  if (text.includes('requires dev30 pro') || text.includes('pro_required') || text.includes('private repository analysis requires')) {
    return 'Private repositories and weekly stakeholder updates are included with Dev30 Pro. Public GitHub analysis remains available on Free.';
  }
  if (text.includes('quota reached') || text.includes('quota_exceeded') || text.includes('usage limit')) {
    return 'You have used this month’s allowance for that action. Saved reports still work; upgrade to Pro or wait for the next monthly period.';
  }
  if (text.includes('connect github') || text.includes('not connected') || text.includes('authentication required')) {
    return 'Connect GitHub once to run a fresh analysis. Saved public reports can still be opened without connecting.';
  }
  if (text.includes('email') && (text.includes('failed') || text.includes('not configured'))) {
    return 'This weekly update could not be emailed yet. The report is safe in your workspace and Dev30 can retry delivery.';
  }
  return raw;
}

function errorAction(original = '') {
  const text = String(original).toLowerCase();
  if (text.includes('connect github') || text.includes('not connected') || text.includes('authentication required')) {
    return { type: 'link', href: connectHref('/'), label: 'Connect GitHub' };
  }
  if (text.includes('requires dev30 pro') || text.includes('pro_required') || text.includes('quota reached') || text.includes('quota_exceeded')) {
    return { type: 'link', href: pricingHref(), label: 'See Dev30 Pro' };
  }
  if (text.includes('github api 5') || text.includes('no server is currently available') || text.includes('github viewer') || text.includes('github request failed')) {
    return { type: 'retry', label: 'Try again' };
  }
  return null;
}

function showToast(message, { action = null } = {}) {
  let toast = $('#paid-beta-toast');
  if (!toast) {
    toast = E('aside', 'paid-beta-toast');
    toast.id = 'paid-beta-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.append(toast);
  }
  const copy = E('div', 'paid-beta-toast-copy');
  copy.append(E('strong', '', 'Dev30'), E('span', '', friendlyMessage(message)));
  const actions = E('div', 'paid-beta-toast-actions');
  const automaticAction = action || errorAction(message);
  if (automaticAction?.type === 'link' && automaticAction.href) {
    const link = E('a', 'paid-beta-toast-action', automaticAction.label || 'Continue');
    link.href = automaticAction.href;
    actions.append(link);
  }
  const dismiss = E('button', 'paid-beta-toast-dismiss', 'Dismiss');
  dismiss.type = 'button';
  dismiss.onclick = () => toast.remove();
  actions.append(dismiss);
  toast.replaceChildren(copy, actions);
}

function installFriendlyAlerts() {
  if (window.__dev30PaidBetaAlertInstalled) return;
  window.__dev30PaidBetaAlertInstalled = true;
  window.alert = (message) => showToast(String(message || ''));
}

function ensureConnectNav() {
  const nav = $('.top-actions');
  if (!nav) return null;
  let link = $('#connect-nav');
  if (!link) {
    link = E('a', 'top-link paid-beta-connect hidden', 'Connect GitHub');
    link.id = 'connect-nav';
    link.href = connectHref('/');
    const workspace = $('#workspace-nav');
    if (workspace) nav.insertBefore(link, workspace);
    else nav.prepend(link);
  }
  return link;
}

function ensureJourney() {
  if (location.pathname !== '/' && !location.pathname.startsWith('/u/')) return null;
  const form = $('#analyze-form');
  if (!form) return null;
  let journey = $('#paid-beta-journey');
  if (journey) return journey;
  journey = E('div', 'paid-beta-journey');
  journey.id = 'paid-beta-journey';
  journey.setAttribute('aria-label', 'Getting started with Dev30');
  const steps = [
    ['connect', '1', 'Connect GitHub', 'One secure connection for fresh analysis'],
    ['analyze', '2', 'Analyze recent work', 'Public by default; private only when you choose it'],
    ['track', '3', 'Keep the journal going', 'Compare snapshots or schedule a weekly update'],
  ];
  for (const [key, number, title, note] of steps) {
    const step = E('div', 'paid-beta-step');
    step.dataset.dev30Journey = key;
    step.append(E('span', 'paid-beta-step-number', number));
    const copy = E('span', 'paid-beta-step-copy');
    copy.append(E('strong', '', title), E('small', '', note));
    step.append(copy);
    journey.append(step);
  }
  form.before(journey);
  return journey;
}

function setJourneyStep(key, status) {
  const step = document.querySelector(`[data-dev30-journey="${key}"]`);
  if (!step) return;
  step.classList.toggle('is-done', status === 'done');
  step.classList.toggle('is-active', status === 'active');
}

function saveAnalysisDraft() {
  const draft = {
    username: $('#username')?.value?.trim() || '',
    days: $('#days')?.value || '30',
    locale: $('#locale')?.value || 'en',
    createdAt: Date.now(),
  };
  try { sessionStorage.setItem('dev30-post-connect-draft', JSON.stringify(draft)); } catch {}
}

function restoreAnalysisDraft() {
  let draft = null;
  try { draft = JSON.parse(sessionStorage.getItem('dev30-post-connect-draft') || 'null'); } catch {}
  if (!draft || Date.now() - Number(draft.createdAt || 0) > 30 * 60 * 1000) return;
  if ($('#username') && draft.username) $('#username').value = draft.username;
  if ($('#days') && ['7', '30', '90'].includes(String(draft.days))) $('#days').value = String(draft.days);
  if ($('#locale') && ['en', 'vi'].includes(String(draft.locale))) $('#locale').value = String(draft.locale);
  try { sessionStorage.removeItem('dev30-post-connect-draft'); } catch {}
  const status = $('#status');
  if (status?.classList.contains('hidden')) {
    status.className = 'status paid-beta-ready';
    status.textContent = draft.username
      ? `GitHub connected. Ready to analyze @${draft.username}.`
      : 'GitHub connected. You are ready to analyze recent work.';
  }
}

function installConnectGuard() {
  document.addEventListener('submit', (event) => {
    if (event.target?.id !== 'analyze-form' || state.auth !== 'disconnected') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    saveAnalysisDraft();
    location.href = connectHref('/');
  }, true);
}

function enhancePrivatePlanState() {
  const wrap = $('#private-toggle-wrap');
  const toggle = $('#private-toggle');
  if (!wrap || !toggle) return;
  const label = wrap.querySelector('span');
  if (state.plan === 'free') {
    wrap.classList.add('paid-beta-pro-locked');
    const text = 'Include my private repositories · Pro';
    if (label && label.textContent !== text) label.textContent = text;
  } else if (state.plan === 'pro') {
    wrap.classList.remove('paid-beta-pro-locked');
    const text = 'Include my private repositories';
    if (label && label.textContent !== text) label.textContent = text;
  }
}

function installPrivateGuard() {
  document.addEventListener('change', (event) => {
    if (event.target?.id !== 'private-toggle' || !event.target.checked || state.plan !== 'free') return;
    event.target.checked = false;
    showToast('Private repositories are included with Dev30 Pro. Public GitHub analysis stays available on Free.', {
      action: { type: 'link', href: pricingHref(), label: 'See Pro' },
    });
  }, true);
}

function polishStatus() {
  const status = $('#status');
  if (!status || status.classList.contains('hidden') || !status.classList.contains('error')) return;
  if (status.querySelector('.paid-beta-status-copy')) return;
  const original = status.textContent.trim();
  const friendly = friendlyMessage(original);
  const action = errorAction(original);
  status.dataset.originalError = original;
  status.replaceChildren(E('span', 'paid-beta-status-copy', friendly));
  if (action?.type === 'link') {
    const link = E('a', 'paid-beta-status-action', action.label);
    link.href = action.href;
    status.append(link);
  } else if (action?.type === 'retry') {
    const retry = E('button', 'paid-beta-status-action', action.label);
    retry.type = 'button';
    retry.onclick = () => $('#analyze-form')?.requestSubmit();
    status.append(retry);
  }
}

function observeStatus() {
  const status = $('#status');
  if (!status) return;
  new MutationObserver(polishStatus).observe(status, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  polishStatus();
}

function enhanceRenderedReport() {
  const report = $('#report');
  if (!report || report.classList.contains('hidden') || !report.querySelector('.report-profile')) return;
  setJourneyStep('connect', state.auth === 'connected' ? 'done' : 'active');
  setJourneyStep('analyze', 'done');
  setJourneyStep('track', 'active');
  const cta = report.querySelector('.track-cta');
  if (cta && !cta.querySelector('.paid-beta-track-action') && !cta.querySelector('a')) {
    const link = E('a', 'action-button paid-beta-track-action', state.auth === 'connected' ? 'Keep tracking in my workspace' : 'Connect GitHub and track my work');
    link.href = state.auth === 'connected' ? '/workspace' : connectHref('/');
    cta.append(link);
  }
}

function observeReport() {
  const report = $('#report');
  if (!report) return;
  new MutationObserver(() => {
    enhanceRenderedReport();
    enhanceSharedReport();
  }).observe(report, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  enhanceRenderedReport();
  enhanceSharedReport();
}

function formatDate(value) {
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); } catch { return value || ''; }
}

function workspaceStep(number, title, note, done = false, active = false) {
  const step = E('div', `paid-beta-workspace-step${done ? ' is-done' : ''}${active ? ' is-active' : ''}`);
  step.append(E('span', 'paid-beta-step-number', done ? '✓' : number));
  const copy = E('div');
  copy.append(E('strong', '', title), E('span', '', note));
  step.append(copy);
  return step;
}

function enhanceWorkspace() {
  if (location.pathname !== '/workspace' || !state.workspace || !state.settings) return;
  const hero = $('.workspace-hero');
  if (!hero || $('#paid-beta-workspace-onboarding')) return;
  const snapshots = state.workspace.snapshots || [];
  const schedule = state.settings.schedule;
  const isPro = state.settings.entitlement?.plan === 'pro';
  const hasSnapshot = snapshots.length > 0;
  const hasSchedule = Boolean(schedule?.enabled);

  const panel = E('section', 'paid-beta-workspace-onboarding');
  panel.id = 'paid-beta-workspace-onboarding';
  const intro = E('div', 'paid-beta-workspace-intro');
  intro.append(
    E('span', 'workspace-card-label', hasSchedule ? 'Weekly loop active' : 'Your next best action'),
    E('h2', '', hasSchedule ? 'Dev30 is now keeping this journal moving.' : 'Finish the three-step setup once, then let Dev30 keep the history.'),
  );
  if (hasSchedule) intro.append(E('p', 'muted', `Next stakeholder update: ${formatDate(schedule.nextRunAt)}.`));
  else if (!hasSnapshot) intro.append(E('p', 'muted', 'Start with one analysis of your own GitHub account. That becomes the first comparable snapshot.'));
  else if (!isPro) intro.append(E('p', 'muted', 'Your first snapshot is saved. Pro adds private work, stakeholder reports and automatic weekly delivery.'));
  else intro.append(E('p', 'muted', 'Your history has started. Schedule the weekly update when you want Dev30 to run without you.'));

  const steps = E('div', 'paid-beta-workspace-steps');
  steps.append(
    workspaceStep('1', 'GitHub connected', `@${state.workspace.viewer?.login || 'connected'}`, true, false),
    workspaceStep('2', 'First snapshot', hasSnapshot ? `${snapshots.length} saved snapshot${snapshots.length === 1 ? '' : 's'}` : 'Analyze your latest work', hasSnapshot, !hasSnapshot),
    workspaceStep('3', 'Weekly update', hasSchedule ? `Scheduled · ${schedule.locale === 'vi' ? 'Tiếng Việt' : 'English'}` : isPro ? 'Choose email, day and audience' : 'Available with Pro', hasSchedule, hasSnapshot && !hasSchedule),
  );

  const actions = E('div', 'paid-beta-workspace-actions');
  if (!hasSnapshot) {
    const link = E('a', 'workspace-primary-button', 'Create first snapshot');
    link.href = '/';
    actions.append(link);
  } else if (!isPro) {
    const link = E('a', 'workspace-primary-button', 'See Dev30 Pro');
    link.href = pricingHref();
    actions.append(link);
  } else if (!hasSchedule) {
    const button = E('button', 'workspace-primary-button', 'Set up weekly update');
    button.type = 'button';
    button.onclick = () => $('#automation')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    actions.append(button);
  } else {
    const link = E('a', 'workspace-secondary-button', 'Analyze latest work');
    link.href = '/';
    actions.append(link);
  }
  panel.append(intro, steps, actions);
  hero.insertAdjacentElement('afterend', panel);

  const automation = $('#automation');
  if (automation) {
    if (!isPro && !schedule?.enabled) {
      const form = automation.querySelector('.workspace-form');
      if (form) form.hidden = true;
      if (!automation.querySelector('.paid-beta-pro-gate')) {
        const gate = E('div', 'workspace-callout paid-beta-pro-gate');
        gate.append(E('strong', '', 'Weekly automatic updates are a Pro feature.'), E('span', '', 'You can keep using public analysis on Free. Upgrade only when you want private work and recurring delivery.'));
        const link = E('a', 'workspace-text-link', 'See Dev30 Pro →');
        link.href = pricingHref();
        gate.append(link);
        automation.append(gate);
      }
    }
    const technicalError = automation.querySelector('.schedule-status .status.error');
    if (technicalError && !technicalError.dataset.paidBetaFriendly) {
      const raw = technicalError.textContent.trim();
      technicalError.dataset.paidBetaFriendly = '1';
      technicalError.textContent = friendlyMessage(raw);
      const details = E('details', 'paid-beta-technical-detail');
      details.append(E('summary', '', 'Technical detail'), E('code', '', raw));
      technicalError.insertAdjacentElement('afterend', details);
    }
    if (schedule?.lastStatus === 'sent' && !automation.querySelector('.paid-beta-delivery-proof')) {
      const proof = E('div', 'paid-beta-delivery-proof');
      proof.append(E('span', '', '✓'), E('strong', '', 'Last weekly email delivered'), E('span', '', schedule.lastRunAt ? formatDate(schedule.lastRunAt) : 'Delivery verified'));
      automation.append(proof);
    }
  }
}

async function loadWorkspaceEnhancements() {
  if (location.pathname !== '/workspace') return;
  try {
    const [workspaceResponse, settingsResponse] = await Promise.all([
      fetch('/api/workspace?days=30&locale=vi', { cache: 'no-store' }),
      fetch('/api/workspace-settings', { cache: 'no-store' }),
    ]);
    if (!workspaceResponse.ok || !settingsResponse.ok) return;
    state.workspace = await workspaceResponse.json();
    state.settings = await settingsResponse.json();
    state.plan = state.settings.entitlement?.plan || state.plan;
    document.body.dataset.dev30Plan = state.plan;
    const root = $('#report');
    if (root) new MutationObserver(enhanceWorkspace).observe(root, { childList: true, subtree: true });
    enhanceWorkspace();
  } catch {
    // The existing workspace surface remains the fallback.
  }
}

function enhanceSharedReport() {
  if (!location.pathname.startsWith('/r/')) return;
  const card = $('.client-report-card');
  if (!card || card.querySelector('.paid-beta-shared-cta')) return;
  const cta = E('section', 'paid-beta-shared-cta');
  const copy = E('div');
  copy.append(E('strong', '', 'Want a briefing like this for your own GitHub work?'), E('span', '', 'Connect GitHub, create the first snapshot, then compare progress over time.'));
  const link = E('a', 'action-button', 'Create my Dev30 briefing');
  link.href = '/';
  cta.append(copy, link);
  card.append(cta);
}

async function bootAuthState() {
  ensureConnectNav();
  ensureJourney();
  const analyzeButton = $('#analyze-button');
  if (analyzeButton) {
    analyzeButton.disabled = true;
    analyzeButton.textContent = 'Checking GitHub…';
  }
  try {
    const response = await fetch('/api/auth/status', { cache: 'no-store' });
    const auth = await response.json();
    if (!auth.connected) {
      if (auth.githubAppConfigured === false) {
        setConnectionState('unavailable');
        if (analyzeButton) {
          analyzeButton.disabled = true;
          analyzeButton.textContent = 'GitHub connection unavailable';
        }
        return;
      }
      setConnectionState('disconnected');
      const nav = ensureConnectNav();
      nav?.classList.remove('hidden');
      if (analyzeButton) {
        analyzeButton.disabled = false;
        analyzeButton.textContent = 'Connect GitHub to analyze';
      }
      setJourneyStep('connect', 'active');
      return;
    }

    setConnectionState('connected');
    ensureConnectNav()?.classList.add('hidden');
    if (analyzeButton) {
      analyzeButton.disabled = false;
      analyzeButton.textContent = 'See their work';
    }
    setJourneyStep('connect', 'done');
    setJourneyStep('analyze', 'active');
    const settingsResponse = await fetch('/api/workspace-settings', { cache: 'no-store' }).catch(() => null);
    if (settingsResponse?.ok) {
      state.settings = await settingsResponse.json();
      state.plan = state.settings.entitlement?.plan || 'free';
      document.body.dataset.dev30Plan = state.plan;
    }
    restoreAnalysisDraft();
    enhancePrivatePlanState();
    const panel = $('#account-panel');
    if (panel) {
      new MutationObserver(enhancePrivatePlanState).observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
  } catch {
    setConnectionState('unavailable');
    if (analyzeButton) {
      analyzeButton.disabled = false;
      analyzeButton.textContent = 'See their work';
    }
  }
}

installFriendlyAlerts();
installConnectGuard();
installPrivateGuard();
observeStatus();
observeReport();
bootAuthState();
loadWorkspaceEnhancements();
