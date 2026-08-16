import { buildWorkUnits, summarizeWorkMix } from './analyzer.mjs';
import { currentGitHubToken, currentWorkspaceId } from './github-auth-context.mjs';
import { consumeEntitlement, quotaError } from './entitlements.mjs';

const API_ROOT = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const SUPPORTED_DAYS = new Set([7, 30, 90]);

export function normalizeAnalysisDays(value) {
  const days = Number(value);
  return SUPPORTED_DAYS.has(days) ? days : 30;
}

function daysAgoIso(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function dayOnly(value) {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

function headers() {
  const result = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': 'dev30/1.0',
  };
  const token = currentGitHubToken();
  if (token) result.Authorization = `Bearer ${token}`;
  return result;
}

async function githubFetch(path) {
  const response = await fetch(`${API_ROOT}${path}`, { headers: headers() });
  const remaining = response.headers.get('x-ratelimit-remaining');
  const reset = response.headers.get('x-ratelimit-reset');
  if (!response.ok) {
    let message = `GitHub API ${response.status}`;
    try {
      const body = await response.json();
      if (body?.message) message += `: ${body.message}`;
    } catch {}
    const error = new Error(message);
    error.status = response.status;
    error.rateLimitRemaining = remaining;
    error.rateLimitReset = reset;
    throw error;
  }
  return {
    data: await response.json(),
    rateLimit: {
      remaining: remaining === null ? null : Number(remaining),
      reset: reset ? new Date(Number(reset) * 1000).toISOString() : null,
    },
  };
}

async function fetchPaginated(pathForPage, { maxPages = 3 } = {}) {
  const all = [];
  let lastRateLimit = null;
  let truncated = false;
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await githubFetch(pathForPage(page));
    lastRateLimit = result.rateLimit;
    if (!Array.isArray(result.data)) return { data: result.data, rateLimit: lastRateLimit, truncated: false };
    all.push(...result.data);
    if (result.data.length < 100) return { data: all, rateLimit: lastRateLimit, truncated: false };
    if (page === maxPages) truncated = true;
  }
  return { data: all, rateLimit: lastRateLimit, truncated };
}

export async function getAuthenticatedGitHubUser() {
  if (!currentGitHubToken()) return null;
  const result = await githubFetch('/user');
  return {
    id: result.data.id,
    login: result.data.login,
    name: result.data.name || '',
    avatarUrl: result.data.avatar_url,
    htmlUrl: result.data.html_url || '',
  };
}

function repoEventCount(events, fullName) {
  return events.filter((event) => event.repo?.name?.toLowerCase() === fullName.toLowerCase()).length;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function scoreRepo(repo) {
  return repo.commits + repo.pullRequests * 3 + repo.events;
}

async function fetchCommitDetails(repoFullName, commits, limit) {
  const details = [];
  for (const commit of commits.slice(0, limit)) {
    try {
      const result = await githubFetch(`/repos/${repoFullName}/commits/${commit.sha}`);
      details.push({
        sha: commit.sha,
        message: commit.commit?.message?.split('\n')[0] || '',
        date: commit.commit?.author?.date || commit.commit?.committer?.date || '',
        files: (result.data.files || []).map((file) => file.filename).slice(0, 80),
        additions: result.data.stats?.additions || 0,
        deletions: result.data.stats?.deletions || 0,
      });
    } catch {
      // List-level commit evidence remains usable if one detail request fails.
    }
  }
  return details;
}

async function fetchPullFiles(repoFullName, prNumber, maxPages = 2) {
  try {
    const result = await fetchPaginated(
      (page) => `/repos/${repoFullName}/pulls/${prNumber}/files?per_page=100&page=${page}`,
      { maxPages },
    );
    return result.data.map((file) => file.filename).filter(Boolean).slice(0, 160);
  } catch {
    return [];
  }
}

function commitEvidence(commit, repo, detail, id) {
  const message = commit.commit?.message?.split('\n')[0] || detail?.message || '';
  const date = commit.commit?.author?.date || commit.commit?.committer?.date || detail?.date || '';
  return {
    id,
    type: 'commit',
    repo: repo.name,
    repoFullName: repo.fullName,
    visibility: repo.visibility,
    date: dayOnly(date),
    title: message,
    url: `https://github.com/${repo.fullName}/commit/${commit.sha}`,
    ref: commit.sha.slice(0, 8),
    files: detail?.files || [],
    additions: detail?.additions || 0,
    deletions: detail?.deletions || 0,
  };
}

export async function collectGitHubActivity(username, { days = 30, includePrivate = false } = {}) {
  const analysisDays = normalizeAnalysisDays(days);
  const since = daysAgoIso(analysisDays);
  const authenticated = Boolean(currentGitHubToken());
  const workspaceId = currentWorkspaceId();
  let latestRateLimit = null;
  let profile;
  let repoPathForPage;

  if (includePrivate) {
    if (!authenticated || !workspaceId) throw Object.assign(new Error('Private analysis requires a connected GitHub account.'), { status: 401, code: 'github_connection_required' });
    const viewerResult = await githubFetch('/user');
    latestRateLimit = viewerResult.rateLimit;
    if (viewerResult.data.login?.toLowerCase() !== username.toLowerCase()) {
      throw Object.assign(new Error('Private analysis is only allowed for the connected GitHub account.'), { status: 403 });
    }
    profile = viewerResult.data;
    repoPathForPage = (page) => `/user/repos?per_page=100&page=${page}&sort=pushed&direction=desc&affiliation=owner&visibility=all`;
  } else {
    if (!authenticated || !workspaceId) {
      throw Object.assign(new Error('Connect GitHub to run a fresh analysis. Cached and shared reports remain available without signing in.'), { status: 401, code: 'github_connection_required' });
    }
    const profileResult = await githubFetch(`/users/${encodeURIComponent(username)}`);
    latestRateLimit = profileResult.rateLimit;
    profile = profileResult.data;
    const usage = await consumeEntitlement(workspaceId, 'analysis');
    if (!usage.accepted) throw quotaError('analysis', usage);
    repoPathForPage = (page) => `/users/${encodeURIComponent(username)}/repos?per_page=100&page=${page}&sort=pushed&direction=desc&type=owner`;
  }

  const repoPages = authenticated ? 5 : 1;
  const reposResult = await fetchPaginated(repoPathForPage, { maxPages: repoPages });
  latestRateLimit = reposResult.rateLimit;

  const eventPages = authenticated ? 3 : 1;
  const eventResult = await fetchPaginated(
    (page) => `/users/${encodeURIComponent(username)}/events/public?per_page=100&page=${page}`,
    { maxPages: eventPages },
  );
  latestRateLimit = eventResult.rateLimit;
  const events = eventResult.data.filter((event) => event.created_at >= since);

  const candidates = reposResult.data
    .filter((repo) => repo.pushed_at >= since || repo.created_at >= since || repoEventCount(events, repo.full_name) > 0)
    .map((repo) => ({ repo, eventCount: repoEventCount(events, repo.full_name) }))
    .sort((a, b) => b.eventCount - a.eventCount || new Date(b.repo.pushed_at) - new Date(a.repo.pushed_at));

  const configuredDiscovery = Math.max(1, Math.min(30, Number(process.env.MAX_DISCOVERED_REPOS || 15)));
  const discoveryLimit = authenticated ? configuredDiscovery : Math.min(3, configuredDiscovery);
  const commitPageLimit = authenticated ? Math.max(1, Math.min(10, Number(process.env.MAX_COMMIT_PAGES || 5))) : 1;
  const prPageLimit = authenticated ? Math.max(1, Math.min(5, Number(process.env.MAX_PR_PAGES || 2))) : 1;
  const scanned = [];

  for (const { repo, eventCount } of candidates.slice(0, discoveryLimit)) {
    const repoPath = `/repos/${repo.full_name}`;
    let commits = [];
    let pulls = [];
    let commitsTruncated = false;
    let pullsTruncated = false;

    try {
      const commitResult = await fetchPaginated(
        (page) => `${repoPath}/commits?author=${encodeURIComponent(username)}&since=${encodeURIComponent(since)}&per_page=100&page=${page}`,
        { maxPages: commitPageLimit },
      );
      latestRateLimit = commitResult.rateLimit;
      commits = commitResult.data;
      commitsTruncated = commitResult.truncated;
    } catch (error) {
      if (error.status !== 409) throw error;
    }

    try {
      const prResult = await fetchPaginated(
        (page) => `${repoPath}/pulls?state=all&sort=updated&direction=desc&per_page=100&page=${page}`,
        { maxPages: prPageLimit },
      );
      latestRateLimit = prResult.rateLimit;
      pullsTruncated = prResult.truncated;
      pulls = prResult.data.filter((pr) =>
        pr.user?.login?.toLowerCase() === username.toLowerCase()
        && [pr.created_at, pr.updated_at, pr.merged_at, pr.closed_at].filter(Boolean).some((date) => date >= since));
    } catch (error) {
      if (error.status !== 404) throw error;
    }

    if (!commits.length && !pulls.length && !eventCount && repo.created_at < since) continue;
    scanned.push({ repo, eventCount, commits, pulls, commitsTruncated, pullsTruncated });
  }

  scanned.sort((a, b) => {
    const aScore = a.commits.length + a.pulls.length * 3 + a.eventCount;
    const bScore = b.commits.length + b.pulls.length * 3 + b.eventCount;
    return bScore - aScore || new Date(b.repo.pushed_at) - new Date(a.repo.pushed_at);
  });

  const configuredDeepDive = Math.max(1, Math.min(10, Number(process.env.MAX_DEEP_DIVE_REPOS || 5)));
  const deepDiveLimit = authenticated ? Math.min(configuredDeepDive, scanned.length) : Math.min(2, scanned.length);
  const deepDiveNames = new Set(scanned.slice(0, deepDiveLimit).map((item) => item.repo.full_name));
  const detailCommitsPerRepo = authenticated ? Math.max(1, Math.min(8, Number(process.env.MAX_DETAIL_COMMITS_PER_REPO || 3))) : 1;
  const detailPrsPerRepo = authenticated ? Math.max(1, Math.min(10, Number(process.env.MAX_DETAIL_PRS_PER_REPO || 6))) : 1;
  const repoSummaries = [];
  const evidence = [];
  let evidenceNumber = 1;

  for (const item of scanned) {
    const { repo, eventCount, commits, pulls, commitsTruncated, pullsTruncated } = item;
    const deepDive = deepDiveNames.has(repo.full_name);
    const visibility = repo.private ? 'private' : 'public';
    const commitDetails = deepDive ? await fetchCommitDetails(repo.full_name, commits, detailCommitsPerRepo) : [];
    const detailBySha = new Map(commitDetails.map((detail) => [detail.sha, detail]));
    const prFiles = new Map();

    if (deepDive) {
      for (const pr of pulls.slice(0, detailPrsPerRepo)) {
        prFiles.set(String(pr.number), await fetchPullFiles(repo.full_name, pr.number));
      }
    }

    for (const pr of pulls.slice(0, deepDive ? 12 : 5)) {
      evidence.push({
        id: `E${evidenceNumber++}`,
        type: 'pull_request',
        repo: repo.name,
        repoFullName: repo.full_name,
        visibility,
        date: dayOnly(pr.merged_at || pr.closed_at || pr.updated_at || pr.created_at),
        title: pr.title,
        url: pr.html_url,
        ref: String(pr.number),
        files: prFiles.get(String(pr.number)) || [],
        state: pr.merged_at ? 'merged' : pr.state,
      });
    }

    const commitEvidenceLimit = pulls.length ? (deepDive ? detailCommitsPerRepo : 1) : (deepDive ? Math.max(detailCommitsPerRepo, 4) : 3);
    for (const commit of commits.slice(0, commitEvidenceLimit)) {
      evidence.push(commitEvidence(commit, {
        name: repo.name,
        fullName: repo.full_name,
        visibility,
      }, detailBySha.get(commit.sha), `E${evidenceNumber++}`));
    }

    repoSummaries.push({
      name: repo.name,
      fullName: repo.full_name,
      visibility,
      description: repo.description || '',
      language: repo.language || null,
      topics: repo.topics || [],
      stars: repo.stargazers_count || 0,
      isFork: Boolean(repo.fork),
      createdAt: repo.created_at,
      pushedAt: repo.pushed_at,
      url: repo.html_url,
      events: eventCount,
      commits: commits.length,
      commitsTruncated,
      pullRequests: pulls.length,
      pullsTruncated,
      deepDive,
      recentCommitMessages: commits.slice(0, 12).map((commit) => commit.commit?.message?.split('\n')[0]).filter(Boolean),
      recentPrTitles: pulls.slice(0, 12).map((pr) => pr.title),
      changedFiles: unique([
        ...commitDetails.flatMap((detail) => detail.files),
        ...[...prFiles.values()].flat(),
      ]).slice(0, 120),
      additions: commitDetails.reduce((sum, detail) => sum + detail.additions, 0),
      deletions: commitDetails.reduce((sum, detail) => sum + detail.deletions, 0),
    });
  }

  repoSummaries.sort((a, b) => scoreRepo(b) - scoreRepo(a) || new Date(b.pushedAt) - new Date(a.pushedAt));
  const boundedEvidence = evidence.slice(0, authenticated ? 120 : 30);
  const workUnits = buildWorkUnits(boundedEvidence);

  return {
    window: { since, until: new Date().toISOString(), days: analysisDays },
    profile: {
      login: profile.login,
      name: profile.name || '',
      avatarUrl: profile.avatar_url,
      bio: profile.bio || '',
      htmlUrl: profile.html_url,
      publicRepos: profile.public_repos || 0,
      privateRepos: includePrivate ? (profile.total_private_repos || 0) : 0,
      followers: profile.followers || 0,
    },
    repos: repoSummaries,
    evidence: boundedEvidence,
    workUnits,
    workMix: summarizeWorkMix(workUnits),
    collector: {
      authenticated,
      includePrivate,
      workspaceId: includePrivate ? workspaceId : null,
      githubRateLimit: latestRateLimit,
      candidateRepos: candidates.length,
      selectedRepos: repoSummaries.length,
      deepDiveRepos: deepDiveNames.size,
      eventCount: events.length,
      eventsCoverFullWindow: analysisDays <= 30,
      eventPagesTruncated: eventResult.truncated,
      repoPagesTruncated: reposResult.truncated,
      commitCountsTruncated: repoSummaries.filter((repo) => repo.commitsTruncated).map((repo) => repo.name),
      prCountsTruncated: repoSummaries.filter((repo) => repo.pullsTruncated).map((repo) => repo.name),
      mode: includePrivate ? 'private-opt-in' : 'authenticated-public',
    },
  };
}