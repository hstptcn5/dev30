import http from 'node:http';

try { process.loadEnvFile('.env'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectGitHubActivity, getAuthenticatedGitHubUser, normalizeAnalysisDays } from './src/github.mjs';
import { ANALYZER_VERSION, deterministicFallback, isValidGitHubUsername } from './src/analyzer.mjs';
import { synthesizeWithDeepSeek } from './src/deepseek.mjs';
import { cacheStats, getCachedReport, reportCacheKey, setCachedReport } from './src/cache.mjs';

const PRODUCT_VERSION = '0.4.0';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);
const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function sendJson(res, status, body) {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32_000) throw Object.assign(new Error('Request body too large.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
  })[ext] || 'application/octet-stream';
}

async function serveStatic(res, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(publicDir, relative);
  if (!filePath.startsWith(`${publicDir}${path.sep}`) && filePath !== path.join(publicDir, 'index.html')) return false;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'public, max-age=60' });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

async function serveAppShell(res) {
  return serveStatic(res, '/');
}

function periodizeFallback(fallback, dataset, locale) {
  const days = dataset.window.days;
  if (days === 30) return fallback;
  fallback.headline = locale === 'vi'
    ? `${dataset.profile.login} đã hoạt động trên ${dataset.repos.length} dự án đáng chú ý trong ${days} ngày qua.`
    : `${dataset.profile.login} had notable activity across ${dataset.repos.length} projects in the last ${days} days.`;
  if (fallback.mainFocus?.explanation) {
    fallback.mainFocus.explanation = locale === 'vi'
      ? `Đây là repository có nhiều activity được quan sát nhất trong cửa sổ ${days} ngày.`
      : `This repository has the most observed activity in the ${days}-day window.`;
  }
  return fallback;
}

function publicPayload(dataset, synthesis) {
  return {
    profile: dataset.profile,
    window: dataset.window,
    report: synthesis.report,
    workMix: dataset.workMix,
    evidence: dataset.evidence,
    repos: dataset.repos.map(({ recentCommitMessages, recentPrTitles, changedFiles, ...repo }) => repo),
    meta: {
      productVersion: PRODUCT_VERSION,
      analyzerVersion: ANALYZER_VERSION,
      analysisMode: synthesis.mode,
      model: synthesis.model,
      notice: synthesis.notice,
      collector: dataset.collector,
    },
  };
}

async function buildAnalysis({ username, locale, days, includePrivate }) {
  const dataset = await collectGitHubActivity(username, { days, includePrivate });
  const fallback = periodizeFallback(deterministicFallback(dataset, locale), dataset, locale);
  let synthesis;
  try {
    synthesis = await synthesizeWithDeepSeek(dataset, fallback, { locale });
  } catch (error) {
    synthesis = { report: fallback, mode: 'deterministic', model: null, notice: `DeepSeek synthesis failed: ${error.message}` };
  }
  return publicPayload(dataset, synthesis);
}

async function handleAnalyze(req, res) {
  try {
    const body = await readJson(req);
    const username = String(body.username || '').trim();
    const locale = body.locale === 'vi' ? 'vi' : 'en';
    const days = normalizeAnalysisDays(body.days);
    const includePrivate = body.includePrivate === true;
    const refresh = body.refresh === true;
    if (!isValidGitHubUsername(username)) return sendJson(res, 400, { error: 'Enter a valid GitHub username.' });

    const key = reportCacheKey({
      username,
      days,
      locale,
      includePrivate,
      analyzerVersion: ANALYZER_VERSION,
      model: process.env.DEEPSEEK_API_KEY ? (process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash') : 'deterministic',
    });

    if (!refresh) {
      const cached = getCachedReport(key);
      if (cached) {
        return sendJson(res, 200, {
          ...cached.value,
          meta: {
            ...cached.value.meta,
            cache: { hit: true, generatedAt: cached.generatedAt, expiresAt: cached.expiresAt },
          },
        });
      }
    }

    const payload = await buildAnalysis({ username, locale, days, includePrivate });
    const cacheMeta = setCachedReport(key, payload);
    return sendJson(res, 200, {
      ...payload,
      meta: {
        ...payload.meta,
        cache: { hit: false, ...cacheMeta },
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) return sendJson(res, 400, { error: 'Invalid JSON request.' });
    if (error.status === 401) return sendJson(res, 401, { error: error.message });
    if (error.status === 404) return sendJson(res, 404, { error: 'GitHub user not found.' });
    if (error.status === 403 || error.status === 429) {
      return sendJson(res, error.status === 403 ? 403 : 429, {
        error: error.status === 403 ? error.message : 'GitHub rate limit reached. Configure GITHUB_TOKEN for production usage.',
        reset: error.rateLimitReset || null,
      });
    }
    console.error(error);
    return sendJson(res, error.status || 500, { error: error.message || 'Unexpected server error.' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      productVersion: PRODUCT_VERSION,
      analyzerVersion: ANALYZER_VERSION,
      deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
      githubAuthenticated: Boolean(process.env.GITHUB_TOKEN),
      cache: cacheStats(),
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    try {
      const viewer = await getAuthenticatedGitHubUser();
      return sendJson(res, 200, { connected: Boolean(viewer), viewer });
    } catch (error) {
      return sendJson(res, 502, { connected: false, viewer: null, error: error.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/analyze') return handleAnalyze(req, res);

  if ((req.method === 'GET' || req.method === 'HEAD') && /^\/u\/[A-Za-z0-9-]+\/?$/.test(url.pathname)) {
    return serveAppShell(res);
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    if (await serveStatic(res, url.pathname)) return;
  }
  sendJson(res, 404, { error: 'Not found.' });
});

server.listen(port, () => console.log(`Dev30 ${PRODUCT_VERSION} / analyzer ${ANALYZER_VERSION} running at http://localhost:${port}`));
