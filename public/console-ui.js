const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
const text = (value) => String(value ?? '').trim();

function routeKind() {
  if (location.pathname === '/workspace') return 'workspace';
  if (location.pathname === '/pricing') return 'pricing';
  if (['/privacy', '/terms', '/refunds'].includes(location.pathname)) return 'legal';
  if (location.pathname.startsWith('/u/')) return 'report';
  return 'analyze';
}

function node(tag, cls, content) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (content !== undefined) el.textContent = String(content);
  return el;
}

function setConsoleBodyState() {
  document.body.classList.add('console-ui');
  const kind = routeKind();
  document.body.classList.toggle('workspace-view', kind === 'workspace');
  document.body.classList.toggle('commercial-view', ['pricing', 'legal'].includes(kind));
}

function currentOperator() {
  return text(document.body.dataset.connectedLogin) || text(qs('#account-name')?.textContent).replace(/^@/, '') || 'PUBLIC_USER';
}

function currentPlan() {
  if (document.body.dataset.dev30Plan) return document.body.dataset.dev30Plan;
  const settings = text(qs('.workspace-settings')?.textContent).toLowerCase();
  return settings.includes('pro') && !settings.includes('upgrade to pro') ? 'pro' : 'free';
}

function activeHref() {
  const kind = routeKind();
  if (kind === 'workspace') return '/workspace';
  if (kind === 'pricing') return '/pricing';
  if (kind === 'report') return '#report';
  return '/';
}

function railLink(label, href, key) {
  const a = node('a', 'console-nav-link');
  a.href = href;
  a.dataset.consoleHref = href;
  const left = node('span', '', label);
  const right = node('span', 'console-nav-key', key);
  a.append(left, right);
  if (activeHref() === href) a.classList.add('is-active');
  if (href === '#report') {
    a.addEventListener('click', (event) => {
      const report = qs('#report');
      if (!report || report.classList.contains('hidden')) {
        event.preventDefault();
        qs('#username')?.focus();
        return;
      }
      event.preventDefault();
      report.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  if (href === '#evidence-panel') {
    a.addEventListener('click', (event) => {
      const evidence = qs('#evidence-panel');
      if (!evidence) return;
      event.preventDefault();
      const details = evidence.querySelector('details');
      if (details) details.open = true;
      evidence.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  return a;
}

function installSideRail() {
  if (qs('.console-side-rail')) return;
  const rail = node('aside', 'console-side-rail');
  rail.setAttribute('aria-label', 'Dev30 console navigation');

  const operator = node('section', 'console-operator');
  const row = node('div', 'console-operator-row');
  const bot = node('div', 'console-operator-bot');
  bot.setAttribute('aria-hidden', 'true');
  const meta = node('div');
  const label = node('span', 'console-operator-label', 'System operator');
  const name = node('div', 'console-operator-name', currentOperator());
  name.dataset.consoleOperator = 'true';
  const plan = node('div', 'console-operator-plan', `${currentPlan().toUpperCase()} // EVIDENCE MODE`);
  plan.dataset.consolePlan = 'true';
  meta.append(label, name, plan);
  row.append(bot, meta);
  operator.append(row);

  const nav = node('nav', 'console-nav-list');
  nav.append(
    railLink('Scanner / Analyze', '/', '01'),
    railLink('Current Report', '#report', '02'),
    railLink('Developer Journal', '/workspace', '03'),
    railLink('Evidence', '#evidence-panel', '04'),
    railLink('Pricing', '/pricing', '05'),
  );

  const foot = node('div', 'console-rail-foot');
  foot.innerHTML = '<strong>DEV30 // EARLY ACCESS</strong><br>GitHub evidence → work story → save point → weekly update.';
  rail.append(operator, nav, foot);
  document.body.prepend(rail);
}

function refreshOperator() {
  const name = qs('[data-console-operator]');
  if (name) name.textContent = currentOperator();
  const plan = qs('[data-console-plan]');
  if (plan) plan.textContent = `${currentPlan().toUpperCase()} // EVIDENCE MODE`;
}

function normalizeTopDock() {
  const topbar = qs('.topbar') || qs('.commercial-topbar');
  if (!topbar) return;
  topbar.classList.add('console-top-dock');
  const word = topbar.querySelector('.brand-word');
  if (word) word.textContent = 'Dev30';
  qsa('a[href="/"]', topbar).forEach((link) => {
    if (link.classList.contains('brand')) return;
    if (/analyze/i.test(link.textContent)) link.textContent = 'Analyze';
  });
}

function scannerMarkup() {
  const panel = node('aside', 'console-scanner-panel');
  panel.setAttribute('aria-label', 'GitHub activity to Dev30 journal flow');
  panel.innerHTML = `
    <div class="console-scanner-head">
      <span>DEV30_SCANNER // EVIDENCE_PIPELINE</span>
      <span class="console-live-led">READY</span>
    </div>
    <div class="console-flow-canvas">
      <div class="console-flow-stage">
        <div class="console-flow-node n1">COMMITS<small>recent work</small></div>
        <div class="console-flow-node n2">PULL_REQUESTS<small>reviewed changes</small></div>
        <div class="console-flow-node n3">REPOSITORIES<small>project context</small></div>
        <div class="console-flow-wire w1"></div><div class="console-flow-wire w2"></div><div class="console-flow-wire w3"></div>
        <div class="console-flow-scanner">D30<br>TRACE<br>EVIDENCE</div>
        <div class="console-flow-wire w4"></div><div class="console-flow-wire w5"></div>
        <div class="console-flow-node out1">SAVE_POINT<small>developer journal</small></div>
        <div class="console-flow-node out2">WEEKLY_UPDATE<small>optional Pro loop</small></div>
      </div>
    </div>
    <div class="console-scanner-foot">PUBLIC GITHUB BY DEFAULT // PRIVATE CONTEXT ONLY AFTER EXPLICIT AUTHORIZATION // CLAIMS REMAIN TRACEABLE TO EVIDENCE</div>`;
  return panel;
}

function installScannerHero() {
  const hero = qs('.hero');
  if (!hero || hero.querySelector('.console-scanner-panel')) return;
  hero.append(scannerMarkup());

  const eyebrow = hero.querySelector('.eyebrow');
  if (eyebrow) eyebrow.textContent = 'Evidence-backed developer work console';
  const title = hero.querySelector('h1');
  if (title && routeKind() === 'analyze') title.innerHTML = 'Turn GitHub work into a <em>developer journal.</em>';
  const copy = hero.querySelector('.hero-copy');
  if (copy && routeKind() === 'analyze') copy.textContent = 'Scan recent GitHub activity, reconstruct the work story, trace important claims back to evidence, and save each meaningful analysis as a Dev30 save point.';
}

function installValueGrid() {
  if (routeKind() !== 'analyze' || qs('.console-value-grid')) return;
  const hero = qs('.hero');
  if (!hero) return;
  const grid = node('section', 'console-value-grid');
  grid.setAttribute('aria-label', 'Dev30 product loop');
  const cards = [
    ['01 // WORK_STORY', 'Understand what moved', 'A readable briefing comes before counts and raw GitHub metadata.'],
    ['02 // SAVE_POINT', 'Build a developer journal', 'Meaningful analyses become snapshots you can compare as the work changes.'],
    ['03 // PORTABLE_OUTPUT', 'Carry the evidence with you', 'Export PDF, Markdown, Full JSON data, or a compact Pixel Summary Card.'],
  ];
  for (const [id, title, copy] of cards) {
    const card = node('article', 'console-value-card');
    card.innerHTML = `<span class="id">${id}</span><strong>${title}</strong><span>${copy}</span>`;
    grid.append(card);
  }
  hero.after(grid);
}

function decorateLoading() {
  const status = qs('#status');
  if (!status || status.classList.contains('hidden')) return;
  const value = text(status.textContent).toLowerCase();
  const loading = value.includes('reading recent github') || value.includes('đang đọc hoạt động github') || value.includes('briefing');
  if (!loading || status.querySelector('.console-loading-rail')) return;
  const rail = node('div', 'console-loading-rail');
  ['SCAN_GITHUB', 'INDEX_WORK', 'TRACE_EVIDENCE', 'BUILD_STORY'].forEach((label) => {
    const step = node('div', 'console-loading-step');
    step.title = label;
    rail.append(step);
  });
  status.append(rail);
}

function decorateReport() {
  const report = qs('#report');
  if (!report || report.classList.contains('hidden') || !report.childElementCount) {
    document.body.classList.remove('report-open');
    return;
  }
  if (report.querySelector('.workspace-hero')) return;
  document.body.classList.add('report-open');
  if (!report.querySelector('.console-artifact-band')) {
    const band = node('div', 'console-artifact-band');
    band.innerHTML = '<span>ANALYSIS_ARTIFACT // EVIDENCE_BACKED</span><span>READ STORY → VERIFY CLAIMS → SAVE POINT</span>';
    report.prepend(band);
  }
  const reportLink = qs('[data-console-href="#report"]');
  if (reportLink) reportLink.classList.add('is-active');
}

function formatShortDate(value) {
  try { return new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit' }).format(new Date(value)).toUpperCase(); }
  catch { return text(value).slice(0, 10); }
}

function installJournalTimeline(workspace) {
  const report = qs('#report');
  const hero = report?.querySelector('.workspace-hero');
  if (!report || !hero || report.querySelector('.console-journal-timeline')) return;
  const snapshots = Array.isArray(workspace?.snapshots) ? workspace.snapshots.slice(0, 8) : [];
  if (!snapshots.length) return;

  const timeline = node('section', 'console-journal-timeline');
  const head = node('div', 'console-journal-head');
  head.innerHTML = `<strong>SAVE POINT TIMELINE</strong><span>${snapshots.length} RECENT SNAPSHOTS // LATEST HIGHLIGHTED</span>`;
  const track = node('div', 'console-save-track');
  const chronological = [...snapshots].reverse();
  chronological.forEach((snapshot, index) => {
    const point = node('div', `console-save-point${index === chronological.length - 1 ? ' is-latest' : ''}`);
    const dot = node('span', 'console-save-dot');
    const id = node('span', 'console-save-id', `SAVE_${String(index + 1).padStart(3, '0')}`);
    const date = node('span', 'console-save-date', formatShortDate(snapshot.generatedAt));
    const repo = node('span', 'console-save-repo', snapshot.mainFocus?.repo || 'GITHUB_WORK');
    point.append(dot, id, date, repo);
    track.append(point);
  });
  timeline.append(head, track);
  hero.after(timeline);
}

function hideDuplicateSnapshotList() {
  qsa('.workspace-list-panel').forEach((panel) => {
    const label = text(panel.querySelector('.workspace-card-label')?.textContent).toLowerCase();
    if (label === 'snapshots') panel.hidden = true;
  });
  const history = qs('.workspace-history-columns');
  if (history) {
    const visiblePanels = qsa('.workspace-list-panel', history).filter((panel) => !panel.hidden);
    if (!visiblePanels.length) history.closest('.workspace-section')?.setAttribute('hidden', '');
  }
}

function weeklyPreview() {
  const wrap = node('div', 'console-weekly-preview');
  wrap.innerHTML = `
    <div class="console-weekly-preview-head"><span>WEEKLY_UPDATE // PRO</span><span>PREVIEW_ONLY</span></div>
    <div class="console-weekly-preview-body">
      <strong>Turn your journal into an automatic weekly update.</strong>
      <div class="console-weekly-flow"><span>GITHUB</span><b>→</b><span>DEV30</span><b>→</b><span>INBOX</span></div>
      <p>Private context, stakeholder-ready reports, scheduling, and email delivery stay optional Pro capabilities.</p>
      <a href="/pricing">UNLOCK_WEEKLY_UPDATES</a>
    </div>`;
  return wrap;
}

function decorateWorkspace(detail) {
  const workspace = detail?.workspace;
  const settings = detail?.settings;
  if (!workspace || !settings) return;
  document.body.classList.add('workspace-view');
  document.body.dataset.dev30Plan = text(settings.entitlement?.plan || 'free');
  refreshOperator();
  installJournalTimeline(workspace);
  hideDuplicateSnapshotList();

  const automation = qs('#automation');
  const plan = text(settings.entitlement?.plan || 'free').toLowerCase();
  document.body.classList.toggle('console-free-workspace', plan !== 'pro');
  if (automation && plan !== 'pro' && !automation.querySelector('.console-weekly-preview')) {
    const existingPreview = qs('.weekly-preview-card', automation) || qs('.weekly-preview-card');
    if (!existingPreview) automation.append(weeklyPreview());
  }

  const journalLink = qs('[data-console-href="/workspace"]');
  if (journalLink) journalLink.classList.add('is-active');
}

function decorateCommercial() {
  const shell = qs('.commercial-shell');
  if (!shell) return;
  const kind = routeKind();
  if (kind === 'pricing') {
    qsa('[data-console-href]').forEach((link) => link.classList.remove('is-active'));
    qs('[data-console-href="/pricing"]')?.classList.add('is-active');
  }
}

function installObservers() {
  const status = qs('#status');
  if (status) new MutationObserver(() => decorateLoading()).observe(status, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  const report = qs('#report');
  if (report) new MutationObserver(() => decorateReport()).observe(report, { childList: true, subtree: false, attributes: true, attributeFilter: ['class'] });
  new MutationObserver(refreshOperator).observe(document.body, { attributes: true, attributeFilter: ['data-connected-login', 'data-dev30-plan'] });
}

function boot() {
  setConsoleBodyState();
  normalizeTopDock();
  installSideRail();
  installScannerHero();
  installValueGrid();
  decorateCommercial();
  installObservers();
  decorateLoading();
  decorateReport();
  refreshOperator();
}

document.addEventListener('dev30:analysis-rendered', () => decorateReport());
document.addEventListener('dev30:workspace-rendered', (event) => decorateWorkspace(event.detail));

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
