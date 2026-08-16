const $ = (selector) => document.querySelector(selector);
const form = $('#analyze-form');
const username = $('#username');
const locale = $('#locale');
const days = $('#days');
const button = $('#analyze-button');
const status = $('#status');
const root = $('#report');
const runtimeBadge = $('#runtime-badge');
const privateToggle = $('#private-toggle');
const examplePreview = $('#example-preview');
const valueStrip = $('.value-strip');
const hero = $('.hero');
let lastRequest = null;
let openTechnicalOnRender = false;

const E = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = String(text);
  return node;
};
const T = (en, vi) => locale?.value === 'vi' ? vi : en;

function setStatus(text, error = false) {
  status.className = `status${error ? ' error' : ''}`;
  status.textContent = text;
}
function hideStatus() { status.className = 'status hidden'; }
function tags(items = []) {
  const row = E('div', 'tags');
  [...new Set(items.filter(Boolean))].forEach((item) => row.append(E('span', 'tag', item)));
  return row;
}
function confidence(level) {
  const labels = {
    strong: T('Strong evidence', 'Bằng chứng mạnh'),
    moderate: T('Moderate evidence', 'Bằng chứng vừa'),
    limited: T('Limited evidence', 'Bằng chứng hạn chế'),
  };
  return E('span', `confidence ${level || 'limited'}`, labels[level] || labels.limited);
}
function evidenceRefs(ids = [], level = 'limited') {
  if (!ids.length) return null;
  const row = E('div', 'claim-proof');
  const jump = E('button', 'evidence-jump', T(
    `View ${ids.length} source${ids.length === 1 ? '' : 's'} →`,
    `Xem ${ids.length} nguồn →`,
  ));
  jump.type = 'button';
  jump.onclick = () => {
    const panel = $('#evidence-panel');
    const details = panel?.querySelector('details');
    if (details) details.open = true;
    panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  row.append(confidence(level), jump);
  return row;
}
function when(iso) {
  try {
    return new Intl.DateTimeFormat(locale?.value === 'vi' ? 'vi-VN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch { return iso || ''; }
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function renderProfile(data) {
  const head = E('div', 'report-profile');
  const avatar = E('img', 'avatar');
  avatar.src = data.profile.avatarUrl;
  avatar.alt = `${data.profile.login} avatar`;
  const meta = E('div', 'profile-meta');
  meta.append(
    E('h2', '', data.profile.name || data.profile.login),
    E('p', '', `@${data.profile.login} · ${data.window.days} ${T('days', 'ngày')} · ${data.meta.analysisMode === 'deepseek' ? 'AI explained' : 'deterministic'}`),
  );
  const actions = E('div', 'profile-actions');
  const collector = data.meta.collector;
  actions.append(E('span', 'pill', collector.includePrivate ? T('Private account report', 'Báo cáo tài khoản private') : T('Public GitHub report', 'Báo cáo GitHub public')));
  if (data.history?.count) actions.append(E('span', 'pill', T(`${data.history.count} saved`, `${data.history.count} đã lưu`)));
  if (!collector.includePrivate) {
    const share = E('button', 'action-button', T('Copy link', 'Sao chép link'));
    share.type = 'button';
    share.onclick = async () => { share.textContent = await copyText(location.href) ? T('Copied', 'Đã sao chép') : T('Copy failed', 'Lỗi sao chép'); };
    actions.append(share);
  }
  const refresh = E('button', 'action-button secondary', T('Refresh', 'Phân tích lại'));
  refresh.type = 'button';
  refresh.onclick = () => lastRequest && analyze(lastRequest.name, { privateMode: lastRequest.privateMode, refresh: true });
  actions.append(refresh);
  head.append(avatar, meta, actions);
  return head;
}

function renderTakeaway(data) {
  const card = E('section', 'story-card primary');
  card.append(
    E('span', 'story-label', T(`${data.window.days}-day briefing`, `Tóm tắt ${data.window.days} ngày`)),
    E('h2', '', data.report.headline),
    E('p', 'story-summary', data.report.summary),
  );
  return card;
}

function renderFocus(data) {
  const card = E('section', 'story-card');
  const block = E('div', 'focus-block');
  const label = E('div');
  label.append(E('span', 'story-label', T('Main focus', 'Trọng tâm chính')), E('div', 'focus-repo', data.report.mainFocus.repo || T('Observed work', 'Công việc quan sát được')));
  const copy = E('div', 'focus-copy');
  copy.append(E('h3', '', data.report.mainFocus.title), E('p', '', data.report.mainFocus.explanation));
  if (data.report.mainFocus.significance) copy.append(E('p', '', data.report.mainFocus.significance));
  const proof = evidenceRefs(data.report.mainFocus.evidenceIds, data.report.mainFocus.confidence);
  if (proof) copy.append(proof);
  block.append(label, copy);
  card.append(block);
  return card;
}

function projectCard(project) {
  const card = E('article', 'project-card');
  card.append(E('div', 'project-repo', project.repo || T('Unknown repository', 'Không rõ repository')), E('h3', '', project.title || project.repo), E('p', '', project.description));
  if (project.highlights?.length) {
    const list = E('ul', 'highlight-list');
    project.highlights.slice(0, 4).forEach((item) => list.append(E('li', '', item)));
    card.append(list);
  }
  const proof = evidenceRefs(project.evidenceIds, project.confidence);
  if (proof) card.append(proof);
  return card;
}

function renderProjects(data) {
  const section = E('section', 'report-section');
  const heading = E('div', 'section-heading');
  heading.append(E('h2', '', T('What they worked on', 'Họ đã làm gì')), E('p', '', T('Meaningful work reconstructed from commits and PRs', 'Công việc có ý nghĩa dựng lại từ commit và PR')));
  const grid = E('div', 'project-grid');
  (data.report.projects || []).forEach((project) => grid.append(projectCard(project)));
  section.append(heading, grid);
  return section;
}

function renderObservations(data) {
  if (!data.report.observations?.length) return null;
  const section = E('section', 'report-section');
  const heading = E('div', 'section-heading');
  heading.append(E('h2', '', T('Patterns worth noticing', 'Những mẫu đáng chú ý')), E('p', '', T('Observed activity, not a personality or talent score', 'Hoạt động quan sát được, không phải điểm đánh giá con người')));
  const list = E('div', 'observation-list');
  data.report.observations.forEach((item) => {
    const node = E('div', 'observation');
    node.append(E('div', '', item.text || item));
    const proof = evidenceRefs(item.evidenceIds || [], item.confidence);
    if (proof) node.append(proof);
    list.append(node);
  });
  section.append(heading, list);
  return section;
}

function renderTechnical(data) {
  const details = E('details', 'technical-drawer');
  if (openTechnicalOnRender) details.open = true;
  details.append(E('summary', '', T('Technical details · work mix, repositories and timeline', 'Chi tiết kỹ thuật · phân bố công việc, repository và timeline')));
  const content = E('div', 'technical-content');

  const mix = E('section', 'technical-panel');
  mix.append(E('h3', '', T('Engineering work mix', 'Phân bố công việc kỹ thuật')));
  Object.entries(data.workMix || {}).forEach(([name, value]) => {
    const row = E('div', 'work-row');
    const track = E('div', 'bar');
    const fill = E('span');
    fill.style.width = `${value ? Math.max(2, value) : 0}%`;
    track.append(fill);
    row.append(E('span', '', name), track, E('span', '', `${value}%`));
    mix.append(row);
  });

  const snapshot = E('section', 'technical-panel');
  snapshot.append(E('h3', '', T('Technical snapshot', 'Tổng quan kỹ thuật')), E('p', 'muted', data.report.technical?.trajectory || T('No technical trajectory was produced.', 'Chưa có diễn giải kỹ thuật.')));
  snapshot.append(tags([...(data.report.technical?.primaryLanguages || []), ...(data.report.technical?.areas || []), ...(data.report.technical?.stack || [])]));

  const signals = E('section', 'technical-panel');
  signals.append(E('h3', '', T('Technical signals', 'Tín hiệu kỹ thuật')));
  const signalList = E('div', 'signal-list');
  (data.report.technical?.signals || []).forEach((item) => {
    const node = E('div', 'signal');
    node.append(E('div', '', item.text || item));
    const proof = evidenceRefs(item.evidenceIds || [], item.confidence);
    if (proof) node.append(proof);
    signalList.append(node);
  });
  signals.append(signalList);

  const repos = E('section', 'technical-panel');
  repos.append(E('h3', '', T('Repository activity', 'Hoạt động repository')));
  const repoList = E('div', 'repository-list');
  (data.repos || []).forEach((repo) => {
    const row = E('div', 'repo-row');
    const commitCount = `${repo.commits}${repo.commitsTruncated ? '+' : ''}`;
    const prCount = `${repo.pullRequests}${repo.pullsTruncated ? '+' : ''}`;
    row.append(E('strong', '', repo.name), E('span', '', `${commitCount} commits · ${prCount} PRs · ${repo.language || '—'}${repo.visibility === 'private' ? ' · private' : ''}`));
    repoList.append(row);
  });
  repos.append(repoList);

  content.append(mix, snapshot, signals, repos);
  if (data.report.timeline?.length) {
    const timelinePanel = E('section', 'technical-panel full');
    timelinePanel.append(E('h3', '', T('Development timeline', 'Dòng thời gian phát triển')));
    const list = E('div', 'timeline');
    data.report.timeline.forEach((entry) => {
      const row = E('div', 'timeline-item');
      const body = E('div');
      body.append(E('strong', '', entry.label), E('div', 'muted', entry.detail));
      const proof = evidenceRefs(entry.evidenceIds || [], entry.confidence);
      if (proof) body.append(proof);
      row.append(E('div', 'timeline-date', entry.date), body);
      list.append(row);
    });
    timelinePanel.append(list);
    content.append(timelinePanel);
  }
  details.append(content);
  return details;
}

function renderEvidence(data) {
  const section = E('section', 'report-section');
  section.id = 'evidence-panel';
  const details = E('details', 'evidence-details');
  const summary = E('summary', 'evidence-summary', T(`Evidence · ${data.evidence.length} GitHub sources`, `Bằng chứng · ${data.evidence.length} nguồn GitHub`));
  const list = E('div', 'evidence-list');
  data.evidence.forEach((item) => {
    const link = E('a', 'evidence');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    const title = E('span', 'evidence-title');
    title.append(E('strong', '', item.title), E('small', '', `${item.repo} · ${item.date}${item.visibility === 'private' ? ' · private' : ''}`));
    link.append(E('span', 'evidence-id', item.id), title, E('span', 'evidence-kind', item.type === 'pull_request' ? `PR #${item.ref}` : item.ref));
    list.append(link);
  });
  details.append(summary, list);
  section.append(details);
  return section;
}

function historyPanel(data) {
  const history = data.history;
  if (!history) return null;
  const card = E('section', 'history-card');
  const head = E('div', 'history-head');
  const copy = E('div');
  copy.append(E('div', 'history-kicker', history.count > 1 ? T('Since the previous report', 'So với báo cáo trước') : T('History starts here', 'Lịch sử bắt đầu từ đây')));
  if (history.persistence === 'unavailable') {
    copy.append(E('strong', 'history-title', T('History is unavailable', 'Lịch sử chưa khả dụng')), E('p', 'muted', history.error || 'Storage unavailable'));
    head.append(copy);
    card.append(head);
    return card;
  }
  copy.append(
    E('strong', 'history-title', history.saved ? T('This analysis was saved as a new snapshot', 'Phân tích này đã được lưu thành snapshot mới') : T('No meaningful change since the latest snapshot', 'Không có thay đổi đáng kể so với snapshot gần nhất')),
    E('p', 'muted', T(`${history.count} comparable snapshot${history.count === 1 ? '' : 's'} in this series.`, `${history.count} snapshot có thể so sánh trong chuỗi này.`)),
  );
  head.append(copy);
  card.append(head);

  if (history.narrative) {
    const delta = E('div', 'delta-box');
    delta.append(E('span', 'history-kicker', T('What changed?', 'Có gì thay đổi?')), E('strong', 'delta-title', history.narrative.headline), E('p', 'muted', history.narrative.summary));
    if (history.narrative.highlights?.length) {
      const list = E('div', 'delta-list');
      history.narrative.highlights.forEach((item) => {
        const row = E('div', 'delta-item');
        row.append(E('span', 'delta-type', String(item.type || 'change').replaceAll('_', ' ')), E('div', '', item.text));
        list.append(row);
      });
      delta.append(list);
    }
    delta.append(E('small', 'window-note', T('Counts compare moving analysis windows; negative deltas do not mean commits were deleted.', 'Các con số so sánh hai cửa sổ thời gian trượt; delta âm không có nghĩa commit bị xóa.')));
    card.append(delta);
  } else {
    card.append(E('div', 'delta-empty', T('Analyze again after more GitHub activity to unlock a meaningful comparison.', 'Phân tích lại sau khi GitHub có thêm hoạt động để mở phần so sánh.')));
  }

  if (history.entries?.length) {
    const strip = E('div', 'history-strip');
    history.entries.slice(0, 6).forEach((entry, index) => {
      const node = E('div', `history-entry${index === 0 ? ' current' : ''}`);
      node.append(E('span', 'history-dot'), E('div', '', when(entry.generatedAt)), E('strong', '', entry.mainFocus?.repo || T('No focus', 'Chưa rõ trọng tâm')), E('small', 'muted', entry.mainFocus?.title || entry.headline || ''));
      strip.append(node);
    });
    card.append(strip);
  }
  return card;
}

function renderTrackCta(data) {
  const node = E('section', 'track-cta');
  const copy = E('div');
  if (data.meta.collector.includePrivate) {
    copy.append(E('strong', '', T('Want this update automatically next week?', 'Muốn nhận cập nhật này tự động vào tuần sau?')), E('span', '', T('Your workspace can track snapshots and schedule stakeholder updates.', 'Workspace có thể theo dõi snapshot và lên lịch cập nhật stakeholder.')));
    const link = E('a', 'action-button', T('Open workspace', 'Mở workspace'));
    link.href = '/workspace';
    node.append(copy, link);
  } else {
    copy.append(E('strong', '', T('Come back after more activity to compare progress.', 'Quay lại sau khi có thêm hoạt động để so sánh tiến triển.')), E('span', '', T('Dev30 will compare the next snapshot with this one.', 'Dev30 sẽ so sánh snapshot tiếp theo với snapshot này.')));
    node.append(copy);
  }
  return node;
}

function render(data) {
  root.replaceChildren();
  root.classList.remove('hidden');
  root.dataset.privateMode = data.meta.collector.includePrivate ? 'true' : 'false';
  document.body.dataset.privateAnalysis = root.dataset.privateMode;
  examplePreview?.classList.add('hidden');
  valueStrip?.classList.add('hidden');
  hero?.classList.add('report-mode');
  if (data.meta.notice) root.append(E('div', 'notice', data.meta.notice));
  root.append(renderProfile(data));

  const story = E('div', 'report-story');
  story.append(renderTakeaway(data), renderFocus(data), renderProjects(data));
  const history = historyPanel(data);
  if (history) story.append(history);
  const observations = renderObservations(data);
  if (observations) story.append(observations);
  story.append(renderTechnical(data), renderEvidence(data), renderTrackCta(data));
  root.append(story);
}

function syncUrl(name, privateMode = false) {
  if (privateMode) return;
  const url = new URL(location.origin);
  url.pathname = `/u/${encodeURIComponent(name)}`;
  url.searchParams.set('days', days.value);
  url.searchParams.set('lang', locale.value);
  history.replaceState({}, '', url);
}

function privateModeFor(name) {
  return Boolean(privateToggle?.checked && document.body.dataset.connectedLogin?.toLowerCase() === name.toLowerCase());
}

async function analyze(name, { privateMode = false, refresh = false } = {}) {
  button.disabled = true;
  root.classList.add('hidden');
  setStatus(T('Reading recent GitHub work and turning it into a briefing…', 'Đang đọc hoạt động GitHub gần đây và dựng thành một bản tóm tắt…'));
  try {
    if (privateMode && sessionStorage.getItem('dev30-private-warning-accepted') !== '1') {
      const warning = T(
        'Private analysis can store selected private repository metadata in your Dev30 workspace and may send selected work metadata to the configured DeepSeek API. Continue?',
        'Phân tích private có thể lưu một số metadata repository riêng tư trong Dev30 workspace và có thể gửi metadata công việc đã chọn đến DeepSeek API được cấu hình. Tiếp tục?',
      );
      if (!confirm(warning)) return;
      sessionStorage.setItem('dev30-private-warning-accepted', '1');
    }
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name, locale: locale.value, days: Number(days.value), includePrivate: privateMode, refresh }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Analysis failed.');
    lastRequest = { name, privateMode };
    hideStatus();
    render(data);
    if (!privateMode) syncUrl(name, false);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function bootstrapRuntime() {
  try {
    const health = await fetch('/api/health', { cache: 'no-store' }).then((response) => response.json());
    runtimeBadge.textContent = `v${health.productVersion || '?'} · ${health.history?.snapshots || 0} saved`;
  } catch {
    runtimeBadge.textContent = 'runtime unavailable';
  }
}

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = username.value.trim();
  if (!name) return setStatus(T('Enter a GitHub username.', 'Nhập GitHub username.'), true);
  analyze(name, { privateMode: privateModeFor(name) });
});

document.querySelectorAll('[data-example]').forEach((example) => {
  example.onclick = () => {
    username.value = example.dataset.example;
    if (privateToggle) privateToggle.checked = false;
    analyze(example.dataset.example, { privateMode: false });
  };
});

const params = new URLSearchParams(location.search);
const route = location.pathname.match(/^\/u\/([^/]+)\/?$/);
if (params.get('lang') === 'vi') locale.value = 'vi';
if (['7', '30', '90'].includes(params.get('days'))) days.value = params.get('days');
if (params.get('view') === 'technical') openTechnicalOnRender = true;
if (route) {
  username.value = decodeURIComponent(route[1]);
  analyze(username.value, { privateMode: false });
}

bootstrapRuntime();
