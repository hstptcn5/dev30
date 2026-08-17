const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const DEFAULT_DELAYS_MS = Object.freeze([250, 750, 1500]);
const GITHUB_HOSTS = new Set(['api.github.com', 'github.com']);
const INSTALL_KEY = Symbol.for('dev30.githubFetchRetryInstalled');

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

export function installGitHubFetchRetry(target = globalThis) {
  if (!target?.fetch || target[INSTALL_KEY]) return false;
  const nativeFetch = target.fetch.bind(target);
  target.fetch = async (input, init = {}) => {
    const url = typeof Request !== 'undefined' && input instanceof Request ? input.url : String(input);
    if (!shouldRetryGitHubUrl(url)) return nativeFetch(input, init);
    return githubRequest(input, init, {
      path: githubPath(url),
      fetchImpl: nativeFetch,
      throwOnNonRetryable: false,
    });
  };
  target[INSTALL_KEY] = true;
  return true;
}

export const __githubHttpTest = {
  retryAfterMs,
  shouldRetryGitHubUrl,
  githubPath,
  RETRYABLE_STATUSES,
  DEFAULT_DELAYS_MS,
};
