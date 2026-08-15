const CATEGORY_RULES = {
  docs: [/(^|\/)(docs?|readme|changelog|license)(\/|\.|$)/i, /\.(md|mdx|rst)$/i],
  test: [/(^|\/)(__tests__|tests?|spec|e2e|playwright|cypress)(\/|\.|$)/i, /\.(test|spec)\.[cm]?[jt]sx?$/i, /(^|\/)\.github\/workflows\//i],
  harden: [/(security|auth|recovery|rollback|retry|rate.?limit|validation|sanitize|migration|locking|concurr|reliab|timeout|health)/i],
  maintain: [/(chore|deps?|dependency|bump|cleanup|format|lint|refactor|rename|remove dead|housekeep)/i],
};

export function isValidGitHubUsername(value) {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 39
    && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value)
    && !value.includes('--');
}

export function classifyWork({ message = '', files = [], prTitle = '' }) {
  const haystack = `${message} ${prTitle} ${files.join(' ')}`;
  if (CATEGORY_RULES.docs.some((rule) => rule.test(haystack))) return 'docs';
  if (CATEGORY_RULES.test.some((rule) => rule.test(haystack))) return 'test';
  if (CATEGORY_RULES.harden.some((rule) => rule.test(haystack))) return 'harden';
  if (CATEGORY_RULES.maintain.some((rule) => rule.test(haystack))) return 'maintain';
  return 'build';
}

export function summarizeWorkMix(evidence) {
  const counts = { build: 0, harden: 0, test: 0, maintain: 0, docs: 0 };
  for (const item of evidence) {
    const category = classifyWork({
      message: item.title,
      files: item.files || [],
      prTitle: item.type === 'pull_request' ? item.title : '',
    });
    counts[category] += 1;
  }
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Math.round((value / total) * 100)]));
}

function normalizeArray(value, max = 12) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, max) : [];
}

function normalizeEvidenceIds(value, allowedIds) {
  return normalizeArray(value, 12).filter((id) => allowedIds.has(id));
}

export function normalizeReport(report, evidence, fallback) {
  const raw = report && typeof report === 'object' ? report : {};
  const allowedIds = new Set(evidence.map((item) => item.id));
  const projects = Array.isArray(raw.projects) ? raw.projects.slice(0, 8).map((project) => ({
    repo: String(project?.repo || 'Unknown'),
    title: String(project?.title || project?.repo || 'Project activity'),
    description: String(project?.description || ''),
    highlights: normalizeArray(project?.highlights, 6),
    evidenceIds: normalizeEvidenceIds(project?.evidenceIds, allowedIds),
  })) : [];
  const timeline = Array.isArray(raw.timeline) ? raw.timeline.slice(0, 10).map((item) => ({
    date: String(item?.date || ''),
    label: String(item?.label || ''),
    detail: String(item?.detail || ''),
    evidenceIds: normalizeEvidenceIds(item?.evidenceIds, allowedIds),
  })) : [];

  return {
    headline: String(raw.headline || fallback.headline),
    summary: String(raw.summary || fallback.summary),
    mainFocus: {
      repo: String(raw.mainFocus?.repo || fallback.mainFocus.repo || ''),
      title: String(raw.mainFocus?.title || fallback.mainFocus.title || 'Main focus'),
      explanation: String(raw.mainFocus?.explanation || fallback.mainFocus.explanation || ''),
      significance: String(raw.mainFocus?.significance || ''),
      evidenceIds: normalizeEvidenceIds(raw.mainFocus?.evidenceIds, allowedIds),
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
    projects: dataset.repos.slice(0, 5).map((repo) => ({
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
