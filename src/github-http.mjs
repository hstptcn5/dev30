const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const VIEWER_FALLBACK_STATUSES = new Set([500, 502, 503, 504]);
const DEFAULT_DELAYS_MS = Object.freeze([250, 750, 1500]);
const GITHUB_HOSTS = new Set(['api.github.com', 'github.com']);
const INSTALL_KEY = Symbol.for('dev30.githubFetchRetryInstalled');
const GRAPHQL_URL = 'https://api.github.com/graphql';
const VIEWER_QUERY = `query Dev30Viewer {
  viewer {
    databaseId
    login
    name
    avatarUrl
    url
  }
}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response) {
  const value = String(response.headers.get('retry-after') || '').trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(30_000, seconds * 1000);
  const at = Date.parse(value);
  if (Number.isFinite(at)) return Math.max(0, Math.min(30_000, at - Date.now()));
  return null;
}

function githubPath(url) {
  try {
    const parsed = new URL(String(url));
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return String(url);
  }
}

function shouldRetryGitHubUrl(url) {
  try {
    const parsed = new URL(String(url));
    if (!GITHUB_HOSTS.has(parsed.hostname)) return false;
    if (parsed.hostname === 'github.com') return parsed.pathname.startsWith('/login/oauth/');
    return true;
  } catch {
    return false;
  }
}

function requestMethod(input, init = {}) {
  if (init?.method) return String(init.method).toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) return String(input.method || 'GET').toUpperCase();
  return 'GET';
}

function requestHeaders(input, init = {}) {
  const merged = new Headers(typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined);
  const overrides = new Headers(init?.headers || undefined);
  overrides.forEach((value, key) => merged.set(key, value));
  return merged;
}

function isViewerRestRequest(url, method) {
  try {
    const parsed = new URL(String(url));
    return parsed.hostname === 'api.github.com' && parsed.pathname === '/user' && !parsed.search && method === 'GET';
  } catch {
    return false;
  }
}

async function githubError(response, { method, path, attempt }) {
  let detail = '';
  try {
    const body = await response.clone().json();
    if (body?.message) detail = `: ${body.message}`;
  } catch {}
  const requestId = response.headers.get('x-github-request-id') || null;
  const suffix = [
    `${method} ${path}`,
    `attempt=${attempt}`,
    requestId ? `requestId=${requestId}` : null,
  ].filter(Boolean).join(' ');
  const error = new Error(`GitHub API ${response.status} ${suffix}${detail}`);
  error.status = response.status;
  error.path = path;
  error.method = method;
  error.attempt = attempt;
  error.requestId = requestId;
  error.rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
  error.rateLimitReset = response.headers.get('x-ratelimit-reset');
  return error;
}

export async function githubRequest(url, options = {}, {
  path = githubPath(url),
  delaysMs = DEFAULT_DELAYS_MS,
  fetchImpl = globalThis.fetch,
  sleepImpl = sleep,
  throwOnNonRetryable = true,
} = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const attempts = Math.max(1, delaysMs.length + 1);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, options);
    } catch (error) {
      lastError = Object.assign(new Error(`GitHub request failed ${method} ${path} attempt=${attempt}: ${error.message}`), {
        status: 503,
        code: 'github_network_error',
        path,
        method,
        attempt,
        cause: error,
      });
      if (attempt >= attempts) throw lastError;
      await sleepImpl(delaysMs[attempt - 1]);
      continue;
    }

    if (response.ok) return response;
    lastError = await githubError(response, { method, path, attempt });
    if (!RETRYABLE_STATUSES.has(response.status)) {
      if (throwOnNonRetryable) throw lastError;
      return response;
    }
    if (attempt >= attempts) throw lastError;
    const delay = retryAfterMs(response) ?? delaysMs[attempt - 1];
    await sleepImpl(delay);
  }

  throw lastError || new Error(`GitHub request failed ${method} ${path}.`);
}

async function fetchViewerViaGraphql(input, init, nativeFetch, delaysMs) {
  const sourceHeaders = requestHeaders(input, init);
  const authorization = sourceHeaders.get('authorization');
  if (!authorization) throw Object.assign(new Error('GitHub viewer fallback requires an authenticated request.'), { status: 401, code: 'github_viewer_auth_missing' });

  const headers = new Headers({
    Accept: 'application/json',
    Authorization: authorization,
    'Content-Type': 'application/json',
    'User-Agent': sourceHeaders.get('user-agent') || 'dev30/1.0',
  });
  const apiVersion = sourceHeaders.get('x-github-api-version');
  if (apiVersion) headers.set('X-GitHub-Api-Version', apiVersion);

  const response = await githubRequest(GRAPHQL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: VIEWER_QUERY }),
  }, {
    path: '/graphql viewer',
    delaysMs,
    fetchImpl: nativeFetch,
  });
  const payload = await response.json().catch(() => ({}));
  if (payload?.errors?.length || !payload?.data?.viewer?.login || !payload?.data?.viewer?.databaseId) {
    const detail = payload?.errors?.[0]?.message || 'GitHub GraphQL viewer response was incomplete.';
    throw Object.assign(new Error(detail), { status: 502, code: 'github_viewer_graphql_invalid' });
  }

  const viewer = payload.data.viewer;
  const responseHeaders = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'X-Dev30-GitHub-Viewer-Source': 'graphql-fallback',
  });
  for (const name of ['x-github-request-id', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-ratelimit-used', 'x-ratelimit-resource']) {
    const value = response.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  return new Response(JSON.stringify({
    id: viewer.databaseId,
    login: viewer.login,
    name: viewer.name || '',
    avatar_url: viewer.avatarUrl || '',
    html_url: viewer.url || '',
  }), { status: 200, headers: responseHeaders });
}

export function installGitHubFetchRetry(target = globalThis, { delaysMs = DEFAULT_DELAYS_MS } = {}) {
  if (!target?.fetch || target[INSTALL_KEY]) return false;
  const nativeFetch = target.fetch.bind(target);
  target.fetch = async (input, init = {}) => {
    const url = typeof Request !== 'undefined' && input instanceof Request ? input.url : String(input);
    if (!shouldRetryGitHubUrl(url)) return nativeFetch(input, init);
    const method = requestMethod(input, init);
    try {
      return await githubRequest(input, init, {
        path: githubPath(url),
        delaysMs,
        fetchImpl: nativeFetch,
        throwOnNonRetryable: false,
      });
    } catch (error) {
      if (!isViewerRestRequest(url, method) || !VIEWER_FALLBACK_STATUSES.has(Number(error?.status || 0))) throw error;
      try {
        return await fetchViewerViaGraphql(input, init, nativeFetch, delaysMs);
      } catch (fallbackError) {
        throw Object.assign(new Error(`GitHub viewer lookup failed after REST and GraphQL fallback: ${fallbackError.message}`), {
          status: Number(fallbackError?.status || error?.status || 502),
          code: 'github_viewer_unavailable',
          restError: error,
          cause: fallbackError,
        });
      }
    }
  };
  target[INSTALL_KEY] = true;
  return true;
}

export const __githubHttpTest = {
  retryAfterMs,
  shouldRetryGitHubUrl,
  githubPath,
  requestMethod,
  requestHeaders,
  isViewerRestRequest,
  fetchViewerViaGraphql,
  RETRYABLE_STATUSES,
  VIEWER_FALLBACK_STATUSES,
  DEFAULT_DELAYS_MS,
};
