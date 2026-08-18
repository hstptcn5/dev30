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

const SCANNER_PHASES = [
  ['SCAN_GITHUB', 'Reading the recent activity trail'],
  ['INDEX_REPOS', 'Mapping repositories and changed work'],
  ['TRACE_EVIDENCE', 'Following commits and pull request evidence'],
  ['BUILD_STORY', 'Turning the trail into a work briefing'],
];

export function scannerPhaseForElapsed(elapsedMs = 0) {
  const index = Math.floor(Math.max(0, Number(elapsedMs) || 0) / 1100) % SCANNER_PHASES.length;
  return { index, code: SCANNER_PHASES[index][0], label: SCANNER_PHASES[index][1] };
}

export function saveSlotLabel(index = 0) {
  return `SAVE_${String(Math.max(0, Number(index) || 0) + 1).padStart(3, '0')}`;
}

export function isQuietSnapshot(value = '') {
  const text = normalize(value);
  return [
    'unknown',
    'khong co',
    'no activity recorded',
    'no activity',
    'no recent activity',
    'no development activity',
  ].some((token) => text === token || text.startsWith(`${token} `));
}

function pixelBot({ compact = false, mood = 'idle' } = {}) {
  const bot = E('span', `pixel-bot${compact ? ' is-compact' : ''} mood-${mood}`);
  bot.setAttribute('aria-hidden', 'true');
  const antenna = E('span', 'pixel-bot-antenna');
  const head = E('span', 'pixel-bot-head');
  head.append(E('i', 'pixel-eye eye-left'), E('i', 'pixel-eye eye-right'), E('i', 'pixel-mouth'));
  const body = E('span', 'pixel-bot-body');
  body.append(E('i', 'pixel-light light-a'), E('i', 'pixel-light light-b'), E('i', 'pixel-light light-c'));
  bot.append(antenna, head, body);
  return bot;
}

function enhanceBrand() {
  const mark = $('.brand-mark');
  if (!mark || mark.dataset.pixelEnhanced === 'true') return;
  mark.dataset.pixelEnhanced = 'true';
  mark.classList.add('pixel-brand-mark');
  mark.replaceChildren(pixelBot({ compact: true }), E('span', 'pixel-brand-code', 'D30'));
}

function decoratePipeline() {
  const card = $('.visual-engine-card');
  if (!card || card.dataset.pixelEnhanced === 'true') return;
  card.dataset.pixelEnhanced = 'true';
  const bot = pixelBot({ mood: 'scan' });
  bot.classList.add('pixel-engine-bot');
  card.append(bot);
  const label = E('span', 'pixel-corner-label', 'SCANNER_ON');
  card.append(label);
}

function decorateTimeline() {
  const nodes = $$('.visual-timeline-node');
  nodes.forEach((node, index) => {
    if (node.dataset.pixelEnhanced === 'true') return;
    node.dataset.pixelEnhanced = 'true';
    const card = $('.visual-timeline-card', node);
    if (!card) return;
    const top = $('.visual-timeline-top', card);
    const slot = E('span', 'pixel-save-slot', saveSlotLabel(index));
    (top || card).prepend(slot);
    if (node.classList.contains('is-latest')) card.classList.add('pixel-current-save');
  });
}

function decorateWeeklyPreview() {
  const preview = $('.visual-weekly-preview');
  if (!preview || preview.dataset.pixelEnhanced === 'true') return;
  preview.dataset.pixelEnhanced = 'true';
  const chrome = $('.visual-email-chrome', preview);
  if (chrome) chrome.append(E('span', 'pixel-mail-stamp', 'WEEKLY_TX'));
  const core = $('.visual-flow-node.is-core', preview);
  if (core) core.append(E('span', 'pixel-flow-status', 'READY'));
}

function decorateQuietWorkspace() {
  if (location.pathname !== '/workspace') return;
  const primary = $('.workspace-primary-card');
  if (!primary || primary.dataset.pixelQuietEnhanced === 'true') return;
  const title = $('h2,h3', primary)?.textContent || primary.textContent || '';
  if (!isQuietSnapshot(title) && !normalize(primary.textContent).includes('khong co hoat dong phat trien')) return;
  primary.dataset.pixelQuietEnhanced = 'true';
  const companion = E('aside', 'pixel-quiet-companion');
  const copy = E('span', 'pixel-quiet-copy');
  copy.append(E('strong', '', 'QUIET_WINDOW'), E('small', '', 'No meaningful development signal in this snapshot.'));
  companion.append(pixelBot({ compact: true, mood: 'idle' }), copy);
  primary.append(companion);
}

let scannerStartedAt = 0;
let scannerTimer = null;
let wasAnalyzing = false;

function scannerNode() {
  let scanner = $('#pixel-scanner');
  if (scanner) return scanner;
  const form = $('#analyze-form');
  if (!form) return null;
  scanner = E('section', 'pixel-scanner');
  scanner.id = 'pixel-scanner';
  scanner.setAttribute('aria-live', 'polite');
  const bot = pixelBot({ mood: 'scan' });
  const copy = E('div', 'pixel-scanner-copy');
  copy.append(E('span', 'pixel-scanner-code', 'SCAN_GITHUB'), E('strong', 'pixel-scanner-title', 'Reading the recent activity trail'), E('small', 'pixel-scanner-note', 'Progress labels are visual scan stages while the analysis runs.'));
  const meter = E('div', 'pixel-scanner-meter');
  for (let i = 0; i < SCANNER_PHASES.length; i += 1) meter.append(E('span', 'pixel-meter-cell'));
  scanner.append(bot, copy, meter);
  form.append(scanner);
  return scanner;
}

function updateScanner() {
  const scanner = scannerNode();
  if (!scanner) return;
  const phase = scannerPhaseForElapsed(Date.now() - scannerStartedAt);
  $('.pixel-scanner-code', scanner).textContent = phase.code;
  $('.pixel-scanner-title', scanner).textContent = phase.label;
  $$('.pixel-meter-cell', scanner).forEach((cell, index) => cell.classList.toggle('is-active', index === phase.index));
}

function startScanner() {
  if (scannerTimer) return;
  scannerStartedAt = Date.now();
  const scanner = scannerNode();
  scanner?.classList.remove('is-error');
  scanner?.classList.add('is-running');
  const bot = $('.pixel-bot', scanner);
  if (bot) bot.className = 'pixel-bot mood-scan';
  updateScanner();
  scannerTimer = setInterval(updateScanner, 360);
}

function stopScanner({ error = false } = {}) {
  if (scannerTimer) clearInterval(scannerTimer);
  scannerTimer = null;
  const scanner = $('#pixel-scanner');
  if (!scanner) return;
  if (error) {
    scanner.classList.remove('is-running');
    scanner.classList.add('is-error');
    $('.pixel-scanner-code', scanner).textContent = 'SCAN_INTERRUPTED';
    $('.pixel-scanner-title', scanner).textContent = $('#status')?.textContent?.trim() || 'GitHub scan could not finish';
    $('.pixel-scanner-note', scanner).textContent = 'Your workspace is safe. Retry when the upstream service is ready.';
    $$('.pixel-meter-cell', scanner).forEach((cell) => cell.classList.remove('is-active'));
    const bot = $('.pixel-bot', scanner);
    if (bot) bot.className = 'pixel-bot mood-error';
    return;
  }
  scanner.remove();
}

function completionToast() {
  const report = $('#report');
  if (!report || report.classList.contains('hidden')) return;
  const title = $('.history-title', report)?.textContent?.trim() || '';
  const saved = /saved as a new snapshot|luu thanh snapshot moi/i.test(normalize(title));

  const toast = E('div', 'pixel-completion-toast');
  toast.append(pixelBot({ compact: true, mood: 'happy' }));
  const copy = E('span');
  copy.append(E('strong', '', saved ? 'SNAPSHOT_SAVED' : 'ANALYSIS_READY'), E('small', '', saved ? 'A new journal save point is ready.' : 'Your evidence-backed briefing is ready.'));
  toast.append(copy);
  document.body.append(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 260);
  }, 2100);
}

function syncAnalyzeState() {
  const button = $('#analyze-button');
  const status = $('#status');
  const analyzing = Boolean(button?.disabled && status && !status.classList.contains('error'));
  const errored = Boolean(status?.classList.contains('error') && !status.classList.contains('hidden'));

  if (analyzing && !wasAnalyzing) startScanner();
  if (!analyzing && wasAnalyzing) {
    stopScanner({ error: errored });
    if (!errored) setTimeout(completionToast, 60);
  } else if (!analyzing && errored) {
    stopScanner({ error: true });
  }
  wasAnalyzing = analyzing;
}

function addPixelMicrocopy() {
  const journey = $('#paid-beta-journey');
  if (journey && journey.dataset.pixelEnhanced !== 'true') {
    journey.dataset.pixelEnhanced = 'true';
    $$('.paid-beta-step', journey).forEach((step, index) => step.dataset.pixelStep = `0${index + 1}`);
  }
}

function runPixelPersonality() {
  enhanceBrand();
  decoratePipeline();
  decorateTimeline();
  decorateWeeklyPreview();
  decorateQuietWorkspace();
  addPixelMicrocopy();
  syncAnalyzeState();
}

if (typeof document !== 'undefined') {
  runPixelPersonality();
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      runPixelPersonality();
    });
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled'] });
}
