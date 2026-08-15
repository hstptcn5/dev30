const API_ROOT = 'https://api.github.com';
const API_VERSION = '2026-03-10';

function authHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': 'dev30/0.4-private-access-diagnostics',
  };
}

async function probe(path) {
  const response = await fetch(`${API_ROOT}${path}`, { headers: authHeaders() });
  return response;
}

export async function getPrivateAccessDiagnostics() {
  if (!process.env.GITHUB_TOKEN) {
    return {
      privateReposAccessible: 0,
      contentsRead: false,
      pullRequestsRead: false,
      readyForPrivateAnalysis: false,
      status: 'not-connected',
    };
  }

  const repos = [];
  for (let page = 1; page <= 5; page += 1) {
    const response = await probe(`/user/repos?visibility=private&affiliation=owner&sort=pushed&direction=desc&per_page=100&page=${page}`);
    if (!response.ok) {
      return {
        privateReposAccessible: null,
        contentsRead: false,
        pullRequestsRead: false,
        readyForPrivateAnalysis: false,
        status: `repo-list-${response.status}`,
      };
    }
    const batch = await response.json();
    repos.push(...batch.filter((repo) => repo.private));
    if (batch.length < 100) break;
  }

  if (!repos.length) {
    return {
      privateReposAccessible: 0,
      contentsRead: null,
      pullRequestsRead: null,
      readyForPrivateAnalysis: false,
      status: 'no-private-repos-accessible',
    };
  }

  const sample = repos[0];
  const fullName = sample.full_name;
  const commitResponse = await probe(`/repos/${fullName}/commits?per_page=1`);
  const pullResponse = await probe(`/repos/${fullName}/pulls?state=all&per_page=1`);
  const contentsRead = commitResponse.ok;
  const pullRequestsRead = pullResponse.ok;

  return {
    privateReposAccessible: repos.length,
    contentsRead,
    pullRequestsRead,
    readyForPrivateAnalysis: contentsRead && pullRequestsRead,
    status: contentsRead && pullRequestsRead ? 'ready' : 'missing-repository-permissions',
  };
}
