import { summarizeWorkMix } from './analyzer.mjs';

const API_ROOT = 'https://api.github.com';
const API_VERSION = '2026-03-10';

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
    'User-Agent': 'dev30/0.1',
  };
  if (process.env.GITHUB_TOKEN) result.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
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

function repoEventCount(events, fullName) {
  return events.filter((event) => event.repo?.name?.toLowerCase() === fullName.toLowerCase()).length;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
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
        files: (result.data.files || []).map((file) => file.filename).slice(0, 40),
        additions: result.data.stats?.additions || 0,
        deletions: result.data.stats?.deletions || 0,
      });
    } catch {
      // Commit list data remains useful even if one detail request is unavailable.
    }
  }
  return details;
}

export async function collectGitHubActivity(username) {
  const since = daysAgoIso(30);
  const authenticated = Boolean(process.env.GITHUB_TOKEN);
  let latestRateLimit = null;

  const profileResult = await githubFetch(`/users/${encodeURIComponent(username)}`);
  latestRateLimit = profileResult.rateLimit;
  const profile = profileResult.data;

  const reposResult = await githubFetch(`/users/${encodeURIComponent(username)}/repos?per_page=100&sort=pushed&direction=desc&type=owner`);
  latestRateLimit = reposResult.rateLimit;

  const eventPages = authenticated ? 2 : 1;
  const events = [];
  for (let page = 1; page <= eventPages; page += 1) {
    const eventResult = await githubFetch(`/users/${encodeURIComponent(username)}/events/public?per_page=100&page=${page}`);
    latestRateLimit = eventResult.rateLimit;
    events.push(...eventResult.data.filter((event) => event.created_at >= since));
    if (eventResult.data.length < 100) break;
  }

  const recentRepos = reposResult.data
    .filter((repo) => repo.pushed_at >= since || repo.created_at >= since || repoEventCount(events, repo.full_name) > 0)
    .map((repo) => ({ repo, eventCount: repoEventCount(events, repo.full_name) }))
    .sort((a, b) => b.eventCount - a.eventCount || new Date(b.repo.pushed_at) - new Date(a.repo.pushed_at));

  const configuredMax = Math.max(1, Math.min(10, Number(process.env.MAX_ACTIVE_REPOS || 5)));
  const maxRepos = authenticated ? configuredMax : Math.min(3, configuredMax);
  const selected = recentRepos.slice(0, maxRepos);
  const detailBudget = Math.max(0, Math.min(12, Number(process.env.MAX_DETAIL_COMMITS || 6)));
  const perRepoDetail = selected.length ? Math.max(1, Math.floor(detailBudget / selected.length)) : 0;
  const repoSummaries = [];
  const evidence = [];
  let evidenceNumber = 1;

  for (const { repo, eventCount } of selected) {
    const repoPath = `/repos/${repo.full_name}`;
    let commits = [];
    let pulls = [];

    try {
      const commitResult = await githubFetch(`${repoPath}/commits?author=${encodeURIComponent(username)}&since=${encodeURIComponent(since)}&per_page=100`);
      latestRateLimit = commitResult.rateLimit;
      commits = commitResult.data;
    } catch (error) {
      if (error.status !== 409) throw error;
    }

    try {
      const prResult = await githubFetch(`${repoPath}/pulls?state=all&sort=updated&direction=desc&per_page=50`);
      latestRateLimit = prResult.rateLimit;
      pulls = prResult.data.filter((pr) =>
        pr.user?.login?.toLowerCase() === username.toLowerCase()
        && [pr.created_at, pr.updated_at, pr.merged_at, pr.closed_at].filter(Boolean).some((date) => date >= since));
    } catch (error) {
      if (error.status !== 404) throw error;
    }

    const commitDetails = perRepoDetail > 0
      ? await fetchCommitDetails(repo.full_name, commits, authenticated ? perRepoDetail : Math.min(1, perRepoDetail))
      : [];

    for (const pr of pulls.slice(0, 12)) {
      evidence.push({
        id: `E${evidenceNumber++}`,
        type: 'pull_request',
        repo: repo.name,
        repoFullName: repo.full_name,
        date: dayOnly(pr.merged_at || pr.closed_at || pr.updated_at || pr.created_at),
        title: pr.title,
        url: pr.html_url,
        ref: String(pr.number),
        files: [],
        state: pr.merged_at ? 'merged' : pr.state,
      });
    }

    for (const detail of commitDetails) {
      evidence.push({
        id: `E${evidenceNumber++}`,
        type: 'commit',
        repo: repo.name,
        repoFullName: repo.full_name,
        date: dayOnly(detail.date),
        title: detail.message,
        url: `https://github.com/${repo.full_name}/commit/${detail.sha}`,
        ref: detail.sha.slice(0, 8),
        files: detail.files,
        additions: detail.additions,
        deletions: detail.deletions,
      });
    }

    repoSummaries.push({
      name: repo.name,
      fullName: repo.full_name,
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
      pullRequests: pulls.length,
      recentCommitMessages: commits.slice(0, 12).map((commit) => commit.commit?.message?.split('\n')[0]).filter(Boolean),
      recentPrTitles: pulls.slice(0, 12).map((pr) => pr.title),
      changedFiles: unique(commitDetails.flatMap((item) => item.files)).slice(0, 50),
      additions: commitDetails.reduce((sum, item) => sum + item.additions, 0),
      deletions: commitDetails.reduce((sum, item) => sum + item.deletions, 0),
    });
  }

  repoSummaries.sort((a, b) => (b.commits + b.pullRequests * 3 + b.events) - (a.commits + a.pullRequests * 3 + a.events));

  return {
    window: { since, until: new Date().toISOString(), days: 30 },
    profile: {
      login: profile.login,
      name: profile.name || '',
      avatarUrl: profile.avatar_url,
      bio: profile.bio || '',
      htmlUrl: profile.html_url,
      publicRepos: profile.public_repos || 0,
      followers: profile.followers || 0,
    },
    repos: repoSummaries,
    evidence: evidence.slice(0, 40),
    workMix: summarizeWorkMix(evidence),
    collector: {
      authenticated,
      githubRateLimit: latestRateLimit,
      selectedRepos: repoSummaries.length,
      eventCount: events.length,
      mode: authenticated ? 'authenticated' : 'public-lite',
    },
  };
}
