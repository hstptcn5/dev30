const CATEGORY_ORDER = ['build', 'harden', 'test', 'release', 'maintain', 'docs'];

const TITLE_RULES = [
  ['docs', /^(docs?|readme|changelog|license)(\([^)]*\))?\s*:/i],
  ['test', /^(test|tests|e2e|qa|coverage)(\([^)]*\))?\s*:/i],
  ['release', /^(ci|cd|release|publish|deploy|deployment|packag(e|ing))(\([^)]*\))?\s*:/i],
  ['harden', /^(fix|hotfix|security|harden)(\([^)]*\))?\s*:/i],
  ['maintain', /^(chore|refactor|deps?|dependency|cleanup|lint|format)(\([^)]*\))?\s*:/i],
];

const FILE_RULES = {
  docs: [/(^|\/)(docs?|readme|changelog|license)(\/|\.|$)/i, /\.(md|mdx|rst)$/i],
  test: [/(^|\/)(__tests__|tests?|spec|e2e|playwright|cypress)(\/|\.|$)/i, /\.(test|spec)\.[cm]?[jt]sx?$/i],
  release: [/(^|\/)\.github\/workflows\//i, /(^|\/)(release|scripts?\/release|packag(e|ing)|deploy|deployment)(\/|\.|$)/i],
  harden: [/(security|auth|recovery|rollback|retry|rate.?limit|validation|sanitize|migration|locking|concurr|reliab|timeout|health)/i],
  maintain: [/(deps?|dependency|cleanup|format|lint|refactor|rename|housekeep)/i],
};

export function isValidGitHubUsername(value) {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 39
    && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value)
    && !value.includes('--');
}

function fileCategory(file) {
  for (const category of ['docs', 'test', 'release', 'harden', 'maintain']) {
    if (FILE_RULES[category].some((rule) => rule.test(file))) return category;
  }
  return 'build';
}

export function classifyWork({ message = '', files = [], prTitle = '' }) {
  const title = String(prTitle || message || '').trim();
  for (const [category, rule] of TITLE_RULES) {
    if (rule.test(title)) return category;
  }

  if (/\b(e2e|end[- ]to[- ]end|test coverage|playwright|cypress|test suite)\b/i.test(title)) return 'test';
  if (/\b(ci\/cd|ci gating|github actions?|release|publish|artifact|packaging|deployment|deploy)\b/i.test(title)) return 'release';
  if (/\b(recovery|rollback|retry|security|hardening|reliability|validation|migration|concurrency|timeout|health check)\b/i.test(title)) return 'harden';
  if (/\b(dependency|dependencies|cleanup|refactor|lint|format|housekeeping)\b/i.test(title)) return 'maintain';

  const categories = files.map(fileCategory);
  if (categories.length) {
    const counts = Object.fromEntries(CATEGORY_ORDER.map((category) => [category, 0]));
    for (const category of categories) counts[category] += 1;
    const ranked = CATEGORY_ORDER
      .map((category) => ({ category, count: counts[category] }))
      .sort((a, b) => b.count - a.count || CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
    if (ranked[0].category !== 'build' && ranked[0].count / categories.length >= 0.5) return ranked[0].category;
  }

  return 'build';
}

function normalizedTitle(value) {
  return String(value || '')
    .replace(/^merge pull request #\d+.*$/i, '')
    .replace(/\s*\(#\d+\)\s*$/i, '')
    .trim()
    .toLowerCase();
}

function prNumberFromCommitTitle(title) {
  const merge = String(title || '').match(/merge pull request #(\d+)/i);
  if (merge) return merge[1];
  const squash = String(title || '').match(/\(#(\d+)\)\s*$/);
  return squash ? squash[1] : null;
}

export function buildWorkUnits(evidence) {
  const units = [];
  const prUnits = new Map();
  const titleUnits = new Map();

  for (const item of evidence.filter((entry) => entry.type === 'pull_request')) {
    const unit = {
      id: `PR:${item.repoFullName || item.repo}#${item.ref}`,
      type: 'pull_request',
      repo: item.repo,
      repoFullName: item.repoFullName,
      date: item.date,
      title: item.title,
      files: [...new Set(item.files || [])],
      evidenceIds: [item.id],
      ref: item.ref,
    };
    units.push(unit);
    prUnits.set(`${item.repoFullName || item.repo}#${item.ref}`, unit);
    const titleKey = `${item.repoFullName || item.repo}:${normalizedTitle(item.title)}`;
    if (normalizedTitle(item.title)) titleUnits.set(titleKey, unit);
  }

  for (const item of evidence.filter((entry) => entry.type === 'commit')) {
    const repoKey = item.repoFullName || item.repo;
    const prNumber = prNumberFromCommitTitle(item.title);
    let unit = prNumber ? prUnits.get(`${repoKey}#${prNumber}`) : null;
    if (!unit) unit = titleUnits.get(`${repoKey}:${normalizedTitle(item.title)}`);

    if (unit) {
      unit.evidenceIds.push(item.id);
      unit.files = [...new Set([...unit.files, ...(item.files || [])])];
      continue;
    }

    units.push({
      id: `COMMIT:${repoKey}@${item.ref || item.id}`,
      type: 'commit',
      repo: item.repo,
      repoFullName: item.repoFullName,
      date: item.date,
      title: item.title,
      files: [...new Set(item.files || [])],
      evidenceIds: [item.id],
      ref: item.ref,
    });
  }

  return units
    .map((unit) => ({ ...unit, category: classifyWork({ message: unit.title, prTitle: unit.type === 'pull_request' ? unit.title : '', files: unit.files }) }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.id.localeCompare(b.id));
}

function percentagesFromCounts(counts) {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (!total) return Object.fromEntries(CATEGORY_ORDER.map((category) => [category, 0]));

  const exact = CATEGORY_ORDER.map((category) => ({ category, exact: (counts[category] / total) * 100 }));
  const result = Object.fromEntries(exact.map(({ category, exact: value }) => [category, Math.floor(value)]));
  let remaining = 100 - Object.values(result).reduce((sum, value) => sum + value, 0);
  exact
    .map((item) => ({ ...item, fraction: item.exact - Math.floor(item.exact) }))
    .sort((a, b) => b.fraction - a.fraction || CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
    .forEach(({ category }) => {
      if (remaining > 0) {
        result[category] += 1;
        remaining -= 1;
      }
    });
  return result;
}

export function summarizeWorkMix(items) {
  const counts = Object.fromEntries(CATEGORY_ORDER.map((category) => [category, 0]));
  for (const item of items) {
    const category = item.category || classifyWork({
      message: item.title,
      files: item.files || [],
      prTitle: item.type === 'pull_request' ? item.title : '',
    });
    counts[category] = (counts[category] || 0) + 1;
  }
  return percentagesFromCounts(counts);
}

function normalizeArray(value, max = 12) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].slice(0, max)
    : [];
}

function normalizeEvidenceIds(value, allowedIds) {
  return normalizeArray(value, 12).filter((id) => allowedIds.has(id));
}

function inferRepo(explicitRepo, evidenceIds, evidence) {
  if (explicitRepo && explicitRepo !== 'Unknown') return String(explicitRepo);
  const repos = [...new Set(evidenceIds.map((id) => evidence.find((item) => item.id === id)?.repo).filter(Boolean))];
  return repos.length === 1 ? repos[0] : String(explicitRepo || 'Unknown');
}

export function confidenceForEvidenceIds(ids, evidence) {
  const items = ids.map((id) => evidence.find((item) => item.id === id)).filter(Boolean);
  const prCount = items.filter((item) => item.type === 'pull_request').length;
  if (prCount >= 2 || items.length >= 4) return 'strong';
  if (prCount >= 1 || items.length >= 2) return 'moderate';
  return 'limited';
}

export function normalizeReport(report, evidence, fallback) {
  const raw = report && typeof report === 'object' ? report : {};
  const allowedIds = new Set(evidence.map((item) => item.id));

  const projects = Array.isArray(raw.projects) ? raw.projects.slice(0, 10).map((project) => {
    const evidenceIds = normalizeEvidenceIds(project?.evidenceIds, allowedIds);
    return {
      repo: inferRepo(project?.repo, evidenceIds, evidence),
      title: String(project?.title || project?.repo || 'Project activity'),
      description: String(project?.description || ''),
      highlights: normalizeArray(project?.highlights, 6),
      evidenceIds,
      confidence: confidenceForEvidenceIds(evidenceIds, evidence),
    };
  }) : [];

  const timeline = (Array.isArray(raw.timeline) ? raw.timeline.slice(0, 12) : []).map((item) => {
    const evidenceIds = normalizeEvidenceIds(item?.evidenceIds, allowedIds);
    return {
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(item?.date || '')) ? String(item.date) : '',
      label: String(item?.label || ''),
      detail: String(item?.detail || ''),
      evidenceIds,
      confidence: confidenceForEvidenceIds(evidenceIds, evidence),
    };
  }).sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label));

  const mainEvidenceIds = normalizeEvidenceIds(raw.mainFocus?.evidenceIds, allowedIds);

  return {
    headline: String(raw.headline || fallback.headline),
    summary: String(raw.summary || fallback.summary),
    mainFocus: {
      repo: inferRepo(raw.mainFocus?.repo || fallback.mainFocus.repo || '', mainEvidenceIds, evidence),
      title: String(raw.mainFocus?.title || fallback.mainFocus.title || 'Main focus'),
      explanation: String(raw.mainFocus?.explanation || fallback.mainFocus.explanation || ''),
      significance: String(raw.mainFocus?.significance || ''),
      evidenceIds: mainEvidenceIds,
      confidence: confidenceForEvidenceIds(mainEvidenceIds, evidence),
    },
    projects,
    technical: {
      primaryLanguages: normalizeArray(raw.technical?.primaryLanguages, 8),
      areas: normalizeArray(raw.technical?.areas, 10),
      stack: normalizeArray(raw.technical?.stack, 12),
      trajectory: String(raw.technical?.trajectory || ''),
      signals: normalizeArray(raw.technical?.signals, 10),
    },
    observations: normalizeArray(raw.observations, 8),
    timeline,
  };
}

export function deterministicFallback(dataset, locale = 'en') {
  const topRepo = dataset.repos[0];
  const repoCount = dataset.repos.length;
  const isVi = locale === 'vi';
  return {
    headline: isVi
      ? `${dataset.profile.login} đã hoạt động trên ${repoCount} dự án đáng chú ý trong 30 ngày qua.`
      : `${dataset.profile.login} had notable activity across ${repoCount} projects in the last 30 days.`,
    summary: isVi
      ? 'DeepSeek chưa được cấu hình nên đây là bản tóm tắt xác định từ dữ liệu GitHub, chưa có diễn giải LLM.'
      : 'DeepSeek is not configured, so this is a deterministic GitHub summary without LLM interpretation.',
    mainFocus: {
      repo: topRepo?.name || '',
      title: topRepo ? `${topRepo.name}` : (isVi ? 'Chưa đủ dữ liệu' : 'Not enough data'),
      explanation: topRepo
        ? (isVi ? 'Đây là repository có nhiều activity được quan sát nhất trong cửa sổ 30 ngày.' : 'This repository has the most observed activity in the 30-day window.')
        : '',
      significance: '',
      evidenceIds: dataset.evidence.filter((item) => item.repo === topRepo?.name).slice(0, 5).map((item) => item.id),
    },
    projects: dataset.repos.slice(0, 8).map((repo) => ({
      repo: repo.name,
      title: repo.name,
      description: repo.description || (isVi ? 'Không có mô tả repository.' : 'No repository description.'),
      highlights: repo.recentCommitMessages.slice(0, 3),
      evidenceIds: dataset.evidence.filter((item) => item.repo === repo.name).slice(0, 4).map((item) => item.id),
    })),
    technical: {
      primaryLanguages: [...new Set(dataset.repos.map((repo) => repo.language).filter(Boolean))].slice(0, 8),
      areas: [],
      stack: [],
      trajectory: '',
      signals: [],
    },
    observations: [],
    timeline: [],
  };
}
