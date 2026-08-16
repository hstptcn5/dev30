const E = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = String(text);
  return node;
};

const isVietnamese = () => document.querySelector('#locale')?.value === 'vi';
const T = (en, vi) => isVietnamese() ? vi : en;

function numberFrom(text = '') {
  const match = String(text).match(/\b(\d+)\b/);
  return match ? Number(match[1]) : null;
}

function metric(value, label, tone = '') {
  const item = E('div', `briefing-metric${tone ? ` ${tone}` : ''}`);
  item.append(E('strong', '', value), E('span', '', label));
  return item;
}

function enhanceLanding() {
  const preview = document.querySelector('.preview-card');
  if (preview && !preview.querySelector('.preview-signal-rail')) {
    const rail = E('div', 'preview-signal-rail');
    [
      [T('30-day window', 'Cửa sổ 30 ngày'), T('Recent work, reconstructed', 'Công việc gần đây được dựng lại')],
      [T('Claim-level evidence', 'Bằng chứng theo từng nhận định'), T('PRs + commits on demand', 'PR + commit khi cần kiểm chứng')],
      [T('Snapshot-ready', 'Sẵn sàng snapshot'), T('Compare meaningful change later', 'So sánh thay đổi có ý nghĩa về sau')],
    ].forEach(([title, copy], index) => {
      const item = E('div', 'preview-signal');
      item.style.setProperty('--signal-index', String(index));
      item.append(E('strong', '', title), E('span', '', copy));
      rail.append(item);
    });
    const proof = preview.querySelector('.preview-proof');
    preview.insertBefore(rail, proof || null);
  }

  document.querySelectorAll('.value-strip > div').forEach((item, index) => {
    if (item.querySelector('.value-index')) return;
    item.prepend(E('span', 'value-index', String(index + 1).padStart(2, '0')));
  });
}

function workMixOverview() {
  const sourceRows = [...document.querySelectorAll('.technical-content .work-row')];
  if (!sourceRows.length) return null;

  const panel = E('div', 'signal-overview-panel work-mix-overview');
  panel.append(E('span', 'signal-overview-kicker', T('Work mix', 'Phân bố công việc')));

  const stacked = E('div', 'work-mix-stack');
  stacked.setAttribute('role', 'img');
  stacked.setAttribute('aria-label', T('Engineering work mix', 'Phân bố công việc kỹ thuật'));

  const legend = E('div', 'work-mix-legend');
  sourceRows.forEach((source, index) => {
    const spans = source.querySelectorAll(':scope > span');
    const name = spans[0]?.textContent?.trim() || T('Work', 'Công việc');
    const value = Number.parseFloat(spans[1]?.textContent || '0') || 0;
    if (value > 0) {
      const segment = E('span', 'work-mix-segment');
      segment.style.width = `${value}%`;
      segment.style.setProperty('--mix-index', String(index));
      segment.title = `${name} · ${value}%`;
      stacked.append(segment);
    }
    const row = E('div', 'work-mix-legend-item');
    row.style.setProperty('--mix-index', String(index));
    row.append(E('span', 'work-mix-dot'), E('span', '', name), E('strong', '', `${value}%`));
    legend.append(row);
  });

  panel.append(stacked, legend);
  return panel;
}

function repositoryOverview() {
  const sourceRows = [...document.querySelectorAll('.technical-content .repo-row')].slice(0, 4);
  if (!sourceRows.length) return null;

  const panel = E('div', 'signal-overview-panel repo-overview');
  panel.append(E('span', 'signal-overview-kicker', T('Repository pulse', 'Nhịp repository')));
  const list = E('div', 'repo-pulse-list');
  sourceRows.forEach((source, index) => {
    const row = E('div', 'repo-pulse-item');
    row.style.setProperty('--repo-index', String(index));
    row.append(
      E('span', 'repo-pulse-marker'),
      E('strong', '', source.querySelector('strong')?.textContent?.trim() || T('Repository', 'Repository')),
      E('span', '', source.querySelector('span')?.textContent?.trim() || ''),
    );
    list.append(row);
  });
  panel.append(list);
  return panel;
}

function enhanceSnapshotState(story) {
  const history = story.querySelector('.history-card');
  if (!history || history.dataset.richness === '1') return history;
  history.dataset.richness = '1';

  const title = history.querySelector('.history-title')?.textContent || '';
  const isUnavailable = /unavailable|chưa khả dụng/i.test(title);
  const isSaved = /saved as a new snapshot|lưu thành snapshot mới/i.test(title);
  const state = isUnavailable ? 'unavailable' : isSaved ? 'saved' : 'unchanged';
  history.classList.add(`snapshot-state-${state}`);

  const head = history.querySelector('.history-head');
  if (head && !head.querySelector('.snapshot-state-pill')) {
    const copy = {
      saved: T('Snapshot saved', 'Đã lưu snapshot'),
      unchanged: T('No new snapshot', 'Không tạo snapshot mới'),
      unavailable: T('Snapshot unavailable', 'Snapshot chưa khả dụng'),
    }[state];
    head.append(E('span', `snapshot-state-pill ${state}`, copy));
  }
  return history;
}

function enhanceEvidence(story) {
  const section = story.querySelector('#evidence-panel');
  const details = section?.querySelector('.evidence-details');
  const sources = details ? [...details.querySelectorAll('.evidence')] : [];
  if (!section || !details || !sources.length || section.querySelector('.evidence-preview')) return;

  const preview = E('div', 'evidence-preview');
  const head = E('div', 'evidence-preview-head');
  const copy = E('div');
  copy.append(
    E('span', 'signal-overview-kicker', T('Verify the claims', 'Kiểm chứng nhận định')),
    E('h2', '', T('The evidence is part of the product.', 'Bằng chứng là một phần của sản phẩm.')),
    E('p', '', T(
      `Previewing ${Math.min(3, sources.length)} of ${sources.length} GitHub sources. Open the full evidence set when you want the raw trail.`,
      `Xem trước ${Math.min(3, sources.length)} trong ${sources.length} nguồn GitHub. Mở toàn bộ bằng chứng khi bạn muốn kiểm tra dấu vết gốc.`,
    )),
  );
  head.append(copy, E('strong', 'evidence-count', String(sources.length)));

  const grid = E('div', 'evidence-preview-grid');
  sources.slice(0, 3).forEach((source) => {
    const clone = source.cloneNode(true);
    clone.classList.add('evidence-preview-item');
    grid.append(clone);
  });
  preview.append(head, grid);
  section.insertBefore(preview, details);
}

function enhanceObservations(story) {
  story.querySelectorAll('.observation').forEach((item, index) => {
    if (item.querySelector('.observation-index')) return;
    item.prepend(E('span', 'observation-index', String(index + 1).padStart(2, '0')));
  });
}

function enhanceProjects(story) {
  story.querySelectorAll('.project-card').forEach((card, index) => {
    if (card.querySelector('.project-accent')) return;
    const accent = E('span', 'project-accent');
    accent.style.setProperty('--project-index', String(index));
    card.prepend(accent);
  });
}

function enhanceReport() {
  if (location.pathname === '/workspace') return;
  const story = document.querySelector('.report-story');
  if (!story || story.dataset.visualRichness === '1') return;
  story.dataset.visualRichness = '1';

  const primary = story.querySelector('.story-card.primary');
  if (!primary) return;

  const profileText = document.querySelector('.profile-meta p')?.textContent || '';
  const windowMatch = profileText.match(/·\s*(\d+)\s*(?:days|ngày)/i);
  const days = windowMatch?.[1] || document.querySelector('#days')?.value || '30';
  const projectCount = story.querySelectorAll('.project-card').length;
  const evidenceCount = story.querySelectorAll('#evidence-panel .evidence').length;
  const historyCount = numberFrom(story.querySelector('.history-head .muted')?.textContent || '') || story.querySelectorAll('.history-entry').length;

  const metrics = E('section', 'briefing-metrics');
  metrics.setAttribute('aria-label', T('Briefing at a glance', 'Tóm tắt nhanh'));
  metrics.append(
    metric(days, T('day window', 'ngày quan sát'), 'green'),
    metric(projectCount || '—', T('meaningful projects', 'dự án đáng chú ý'), 'blue'),
    metric(evidenceCount || '—', T('GitHub sources', 'nguồn GitHub'), 'amber'),
    metric(historyCount || 1, T('comparable snapshots', 'snapshot có thể so sánh'), 'teal'),
  );
  primary.after(metrics);

  const history = enhanceSnapshotState(story);
  if (history) metrics.after(history);

  const overview = E('section', 'signal-overview report-section');
  const heading = E('div', 'signal-overview-heading');
  heading.append(
    E('div', '', T('At a glance', 'Nhìn nhanh')),
    E('p', '', T('A visual read of where the recent engineering effort went.', 'Một góc nhìn trực quan về nơi công sức kỹ thuật gần đây được tập trung.')),
  );
  const body = E('div', 'signal-overview-grid');
  const work = workMixOverview();
  const repos = repositoryOverview();
  if (work) body.append(work);
  if (repos) body.append(repos);
  if (body.childNodes.length) {
    overview.append(heading, body);
    const focus = story.querySelector('.story-card:not(.primary)');
    (focus || metrics).after(overview);
  }

  enhanceProjects(story);
  enhanceObservations(story);
  enhanceEvidence(story);
}

function enhanceWorkspace() {
  if (location.pathname !== '/workspace') return;
  const hero = document.querySelector('.workspace-hero');
  const primary = document.querySelector('.workspace-primary-card');
  if (!hero || !primary || hero.dataset.visualRichness === '1') return;
  hero.dataset.visualRichness = '1';

  const meta = hero.querySelector('.muted')?.textContent || '';
  const values = [...meta.matchAll(/(\d+)\s+(?:saved snapshots|stakeholder reports)/gi)].map((match) => Number(match[1]));
  const scheduleText = document.querySelector('.workspace-summary-card:last-child strong')?.textContent || '';

  const strip = E('div', 'workspace-journal-strip');
  strip.append(
    metric(values[0] ?? '—', 'Snapshots', 'green'),
    metric(values[1] ?? '—', 'Reports', 'blue'),
    metric(/not scheduled/i.test(scheduleText) ? 'Off' : 'On', 'Weekly update', 'amber'),
  );
  const heroCopy = hero.firstElementChild;
  heroCopy?.append(strip);

  if (!primary.querySelector('.workspace-snapshot-pill')) {
    const hasSnapshot = !/no snapshot yet/i.test(primary.textContent || '');
    const pill = E('span', `workspace-snapshot-pill ${hasSnapshot ? 'saved' : 'empty'}`, hasSnapshot ? 'Snapshot saved' : 'Start your journal');
    const label = primary.querySelector('.workspace-card-label');
    label?.after(pill);
  }
}

function runEnhancements() {
  enhanceLanding();
  enhanceReport();
  enhanceWorkspace();
}

runEnhancements();
new MutationObserver(runEnhancements).observe(document.body, { childList: true, subtree: true });
