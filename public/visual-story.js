const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function E(tag, cls = '', text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function svgIcon(kind) {
  const paths = {
    commit: '<circle cx="12" cy="12" r="3"></circle><path d="M3 12h6m6 0h6"></path>',
    pull: '<circle cx="6" cy="5" r="2"></circle><circle cx="18" cy="19" r="2"></circle><path d="M6 7v8a4 4 0 0 0 4 4h6M18 17V9a4 4 0 0 0-4-4h-2"></path><path d="m10 3 2 2-2 2"></path>',
    repo: '<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v17H7.5A2.5 2.5 0 0 0 5 21.5z"></path><path d="M5 4.5v17M9 6h6"></path>',
    spark: '<path d="m12 2 1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7z"></path><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"></path>',
    snapshot: '<rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="M8 9h8M8 13h5M8 17h7"></path>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="m4 7 8 6 8-6"></path>',
    github: '<path d="M12 3a9 9 0 0 0-2.85 17.54c.45.08.62-.2.62-.44v-1.73c-2.52.55-3.05-1.07-3.05-1.07-.41-1.05-1.01-1.33-1.01-1.33-.83-.57.06-.56.06-.56.91.07 1.39.94 1.39.94.82 1.39 2.14.99 2.66.76.08-.59.32-.99.58-1.22-2.01-.23-4.12-1.01-4.12-4.48 0-.99.35-1.8.94-2.43-.1-.23-.41-1.15.09-2.4 0 0 .76-.24 2.48.93A8.6 8.6 0 0 1 12 8.2c.77 0 1.53.1 2.25.3 1.72-1.17 2.48-.93 2.48-.93.5 1.25.19 2.17.09 2.4.58.63.94 1.44.94 2.43 0 3.48-2.12 4.25-4.14 4.47.33.28.62.83.62 1.68v2.55c0 .24.16.52.62.43A9 9 0 0 0 12 3Z"></path>',
  };
  const span = E('span', 'visual-icon');
  span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[kind] || paths.spark}</svg>`;
  return span;
}

function clampText(value, max = 84) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function shortDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
  } catch {
    return String(value || '').slice(0, 10);
  }
}

function fullDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return String(value || '');
  }
}

export function buildTimelineEntries(snapshots = [], limit = 6) {
  return snapshots
    .filter((item) => item?.id && item?.generatedAt)
    .slice()
    .sort((a, b) => String(a.generatedAt).localeCompare(String(b.generatedAt)))
    .slice(-Math.max(1, Number(limit) || 6))
    .map((item, index, all) => ({
      id: item.id,
      generatedAt: item.generatedAt,
      dateLabel: shortDate(item.generatedAt),
      repo: item.mainFocus?.repo || 'GitHub work',
      title: item.mainFocus?.title || item.headline || 'Activity snapshot',
      evidenceCount: Number(item.evidenceCount || 0),
      repoCount: Number(item.repoCount || 0),
      includePrivate: Boolean(item.includePrivate),
      latest: index === all.length - 1,
    }));
}

export function buildWorkMix(workMix = {}, limit = 4) {
  return Object.entries(workMix || {})
    .map(([name, value]) => ({ name, value: Number(value || 0) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, Math.max(1, Number(limit) || 4));
}

function landingPipeline() {
  if (location.pathname !== '/' || $('#visual-activity-pipeline')) return;
  const hero = $('.hero');
  if (!hero || hero.classList.contains('hidden')) return;

  const section = E('section', 'visual-activity-pipeline');
  section.id = 'visual-activity-pipeline';
  section.setAttribute('aria-label', 'How Dev30 turns GitHub activity into a developer journal');

  const heading = E('div', 'visual-pipeline-heading');
  const copy = E('div');
  copy.append(
    E('span', 'visual-kicker', 'From activity to a work story'),
    E('h2', '', 'GitHub is the raw trail. Dev30 turns it into something you can remember.'),
    E('p', '', 'Commits and pull requests become an evidence-backed briefing, then a snapshot you can compare later.'),
  );
  const live = E('div', 'visual-live-badge');
  live.append(E('span', 'visual-live-dot'), E('span', '', 'Product-native illustration'));
  heading.append(copy, live);

  const canvas = E('div', 'visual-pipeline-canvas');
  const sources = E('div', 'visual-source-cluster');
  [['commit', 'Commit', 'ship workspace journal'], ['pull', 'Pull request', 'review → merge'], ['repo', 'Repository', 'recent activity']].forEach(([icon, title, note], index) => {
    const node = E('div', `visual-source-node source-${index + 1}`);
    node.append(svgIcon(icon));
    const nodeCopy = E('span');
    nodeCopy.append(E('strong', '', title), E('small', '', note));
    node.append(nodeCopy);
    sources.append(node);
  });

  const engine = E('div', 'visual-engine-card');
  const engineTop = E('div', 'visual-engine-top');
  engineTop.append(svgIcon('spark'), E('strong', '', 'Dev30'));
  const signal = E('div', 'visual-engine-signal');
  signal.append(E('span'), E('span'), E('span'), E('span'), E('span'));
  engine.append(
    engineTop,
    E('span', 'visual-engine-label', 'Evidence-backed briefing'),
    E('h3', '', 'Turned recent GitHub activity into a clear work story.'),
    signal,
    E('p', '', 'Claims stay linked to the raw trail.'),
  );

  const outputs = E('div', 'visual-output-cluster');
  const snapshot = E('div', 'visual-output-card snapshot-output');
  snapshot.append(svgIcon('snapshot'), E('span', 'visual-output-label', 'Snapshot'), E('strong', '', 'Compare what changed'), E('small', '', 'Developer journal entry'));
  const mail = E('div', 'visual-output-card mail-output');
  mail.append(svgIcon('mail'), E('span', 'visual-output-label', 'Weekly'), E('strong', '', 'Send the story'), E('small', '', 'Stakeholder-ready update'));
  outputs.append(snapshot, mail);

  const connectors = E('div', 'visual-connectors');
  connectors.innerHTML = '<span class="connector-a"></span><span class="connector-b"></span><span class="connector-c"></span><span class="connector-d"></span>';
  canvas.append(connectors, sources, engine, outputs);
  section.append(heading, canvas);
  hero.insertAdjacentElement('afterend', section);
}

function reportEvidenceMap() {
  if (location.pathname === '/workspace' || $('#visual-evidence-map')) return;
  const story = $('.report-story');
  if (!story) return;
  const primary = $('.story-card.primary', story);
  const projects = $$('.project-card', story).slice(0, 4);
  if (!primary || !projects.length) return;

  const section = E('section', 'visual-evidence-map report-section');
  section.id = 'visual-evidence-map';
  const head = E('div', 'visual-map-head');
  const copy = E('div');
  copy.append(E('span', 'visual-kicker', 'Work map'), E('h2', '', 'See the briefing as a connected system.'), E('p', '', 'Repositories orbit the current story; evidence keeps the interpretation grounded.'));
  const evidenceCount = $$('#evidence-panel .evidence', story).length;
  head.append(copy, E('strong', 'visual-map-count', evidenceCount || '—'));

  const map = E('div', 'visual-map-canvas');
  const center = E('div', 'visual-map-center');
  center.append(svgIcon('spark'), E('span', '', 'Current story'), E('strong', '', clampText($('h2', primary)?.textContent || 'Recent developer activity', 96)));
  map.append(center);

  projects.forEach((project, index) => {
    const node = E('div', `visual-map-node map-node-${index + 1}`);
    const repo = $('.project-repo', project)?.textContent?.trim() || $('strong', project)?.textContent?.trim() || `Repository ${index + 1}`;
    const title = $('h3', project)?.textContent?.trim() || $('p', project)?.textContent?.trim() || 'Observed work';
    node.append(E('span', 'visual-map-dot'), E('strong', '', clampText(repo, 30)), E('small', '', clampText(title, 54)));
    map.append(node);
  });
  const trails = E('div', 'visual-map-trails');
  trails.innerHTML = '<span></span><span></span><span></span><span></span>';
  map.prepend(trails);
  section.append(head, map);

  const metrics = $('.briefing-metrics', story);
  (metrics || primary).insertAdjacentElement('afterend', section);
}

function timelineNode(entry) {
  const node = E('article', `visual-timeline-node${entry.latest ? ' is-latest' : ''}`);
  node.dataset.snapshotId = entry.id;
  const marker = E('div', 'visual-timeline-marker');
  marker.append(E('span'));
  const body = E('div', 'visual-timeline-card');
  const top = E('div', 'visual-timeline-top');
  top.append(E('time', '', entry.dateLabel), E('span', `visual-privacy-pill ${entry.includePrivate ? 'private' : 'public'}`, entry.includePrivate ? 'Private + public' : 'Public'));
  body.append(top, E('strong', '', clampText(entry.repo, 34)), E('p', '', clampText(entry.title, 82)));
  const meta = E('div', 'visual-timeline-meta');
  if (entry.repoCount) meta.append(E('span', '', `${entry.repoCount} repos`));
  if (entry.evidenceCount) meta.append(E('span', '', `${entry.evidenceCount} evidence`));
  if (meta.childNodes.length) body.append(meta);
  node.append(marker, body);
  return node;
}

function workDna(latest) {
  const panel = E('aside', 'visual-work-dna');
  panel.append(E('span', 'visual-kicker', 'Work DNA'), E('h3', '', latest?.mainFocus?.repo || 'Current signal'));
  const items = buildWorkMix(latest?.workMix || {});
  if (!items.length) {
    panel.append(E('p', 'visual-dna-empty', 'More activity will turn this into a visual fingerprint of the work mix.'));
    return panel;
  }
  const bars = E('div', 'visual-dna-bars');
  items.forEach((item, index) => {
    const row = E('div', 'visual-dna-row');
    row.style.setProperty('--dna-index', String(index));
    const label = E('div');
    label.append(E('span', '', item.name.replaceAll('_', ' ')), E('strong', '', `${Math.round(item.value)}%`));
    const rail = E('div', 'visual-dna-rail');
    const fill = E('span');
    fill.style.width = `${Math.max(4, Math.min(100, item.value))}%`;
    rail.append(fill);
    row.append(label, rail);
    bars.append(row);
  });
  panel.append(bars, E('p', 'visual-dna-note', 'A compact fingerprint of where the recent engineering effort went.'));
  return panel;
}

async function fetchWorkspaceVisualData() {
  const response = await fetch('/api/workspace?days=30&locale=vi', { cache: 'no-store' });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

let workspaceVisualLoading = false;
async function workspaceJournalVisual() {
  if (location.pathname !== '/workspace' || $('#visual-journal-stage') || workspaceVisualLoading) return;
  const hero = $('.workspace-hero');
  if (!hero) return;
  workspaceVisualLoading = true;
  try {
    const workspace = await fetchWorkspaceVisualData();
    if (!workspace?.viewer) return;
    const entries = buildTimelineEntries(workspace.snapshots || []);
    if (!entries.length) return;

    const section = E('section', 'visual-journal-stage');
    section.id = 'visual-journal-stage';
    const head = E('div', 'visual-journal-head');
    const copy = E('div');
    copy.append(
      E('span', 'visual-kicker', 'Your work story over time'),
      E('h2', '', entries.length === 1 ? 'The journal has its first page.' : `${entries.length} recent snapshots, one continuous story.`),
      E('p', '', 'Each dot is a saved analysis. As new work appears, Dev30 makes the change visible instead of losing it in GitHub activity.'),
    );
    const range = E('div', 'visual-journal-range');
    range.append(E('span', '', entries[0].dateLabel), E('span', '', '→'), E('strong', '', entries.at(-1).dateLabel));
    head.append(copy, range);

    const body = E('div', 'visual-journal-body');
    const timeline = E('div', 'visual-timeline');
    timeline.append(E('div', 'visual-timeline-line'));
    entries.forEach((entry) => timeline.append(timelineNode(entry)));
    body.append(timeline, workDna((workspace.snapshots || [])[0]));
    section.append(head, body);

    const onboarding = $('#paid-beta-workspace-onboarding');
    (onboarding || hero).insertAdjacentElement('afterend', section);
  } finally {
    workspaceVisualLoading = false;
  }
}

function fieldControl(form, labelText) {
  return $$('.workspace-field', form).find((field) => $('span', field)?.textContent?.trim().toLowerCase() === labelText.toLowerCase())?.querySelector('input,select') || null;
}

function weeklyPreview() {
  if (location.pathname !== '/workspace') return;
  const automation = $('#automation');
  const form = $('.workspace-form', automation || document);
  if (!automation || !form || $('.visual-weekly-preview', automation)) return;

  const preview = E('section', `visual-weekly-preview${form.hidden ? ' is-locked' : ''}`);
  const intro = E('div', 'visual-weekly-intro');
  intro.append(E('span', 'visual-kicker', form.hidden ? 'Pro preview' : 'Live preview'), E('h3', '', 'From GitHub activity to an email someone can actually read.'), E('p', '', form.hidden ? 'Weekly delivery turns the journal into a recurring stakeholder update.' : 'Change the schedule fields and this preview updates with them.'));

  const flow = E('div', 'visual-automation-flow');
  const gh = E('div', 'visual-flow-node'); gh.append(svgIcon('github'), E('strong', '', 'GitHub'), E('span', '', 'new work'));
  const dev30 = E('div', 'visual-flow-node is-core'); dev30.append(svgIcon('spark'), E('strong', '', 'Dev30'), E('span', '', 'briefing'));
  const inbox = E('div', 'visual-flow-node'); inbox.append(svgIcon('mail'), E('strong', '', 'Inbox'), E('span', '', 'weekly'));
  flow.append(gh, E('span', 'visual-flow-arrow', '→'), dev30, E('span', 'visual-flow-arrow', '→'), inbox);

  const email = E('div', 'visual-email-card');
  const chrome = E('div', 'visual-email-chrome');
  chrome.append(E('span'), E('span'), E('span'), E('strong', '', 'Dev30 weekly briefing'));
  const header = E('div', 'visual-email-header');
  const subject = E('strong', 'visual-email-subject', 'Your GitHub work, summarized for the week');
  const meta = E('span', 'visual-email-meta', 'Monday · 08:00 · Client update');
  header.append(subject, meta);
  const emailBody = E('div', 'visual-email-body');
  emailBody.append(E('span', 'visual-email-kicker', 'WHAT CHANGED'), E('h4', '', 'A focused update backed by the work trail.'), E('p', '', 'Recent shipping, changed direction and the evidence behind the claims — without asking someone to read the commit log.'));
  const emailSignals = E('div', 'visual-email-signals');
  emailSignals.append(E('span', '', 'Shipped'), E('span', '', 'Changed'), E('span', '', 'Current direction'));
  const footer = E('div', 'visual-email-footer');
  footer.append(E('span', '', 'To'), E('strong', 'visual-email-to', 'you@example.com'));
  email.append(chrome, header, emailBody, emailSignals, footer);
  preview.append(intro, flow, email);
  form.insertAdjacentElement('afterend', preview);

  const emailInput = fieldControl(form, 'Send to');
  const dayInput = fieldControl(form, 'Day');
  const hourInput = fieldControl(form, 'Local hour');
  const audienceInput = fieldControl(form, 'Audience');
  const localeInput = fieldControl(form, 'Language');
  const windowInput = fieldControl(form, 'Evidence window');

  const update = () => {
    const day = dayInput?.selectedOptions?.[0]?.textContent || 'Monday';
    const hour = hourInput?.selectedOptions?.[0]?.textContent || '08:00';
    const audience = audienceInput?.selectedOptions?.[0]?.textContent || 'Client update';
    const language = localeInput?.value === 'vi' ? 'Tiếng Việt' : 'English';
    const windowLabel = windowInput?.selectedOptions?.[0]?.textContent || '7 day evidence window';
    $('.visual-email-to', preview).textContent = emailInput?.value?.trim() || 'you@example.com';
    $('.visual-email-meta', preview).textContent = `${day} · ${hour} · ${audience}`;
    $('.visual-email-kicker', preview).textContent = localeInput?.value === 'vi' ? 'ĐIỀU GÌ ĐÃ THAY ĐỔI' : 'WHAT CHANGED';
    $('.visual-email-subject', preview).textContent = localeInput?.value === 'vi' ? 'Công việc GitHub của bạn — bản cập nhật tuần' : 'Your GitHub work — weekly update';
    preview.dataset.language = language;
    preview.dataset.window = windowLabel;
  };
  [emailInput, dayInput, hourInput, audienceInput, localeInput, windowInput].filter(Boolean).forEach((control) => {
    control.addEventListener('input', update);
    control.addEventListener('change', update);
  });
  update();
}

function addPageAtmosphere() {
  if ($('#visual-atmosphere')) return;
  const layer = E('div', 'visual-atmosphere');
  layer.id = 'visual-atmosphere';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<span class="visual-orb orb-a"></span><span class="visual-orb orb-b"></span><span class="visual-grid-glow"></span>';
  document.body.prepend(layer);
}

function runVisualStory() {
  addPageAtmosphere();
  landingPipeline();
  reportEvidenceMap();
  workspaceJournalVisual();
  weeklyPreview();
}

if (typeof document !== 'undefined') {
  runVisualStory();
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      runVisualStory();
    });
  }).observe(document.body, { childList: true, subtree: true });
}
