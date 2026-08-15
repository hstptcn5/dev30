import http from 'node:http';

try { process.loadEnvFile('.env'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectGitHubActivity } from './src/github.mjs';
import { deterministicFallback, isValidGitHubUsername } from './src/analyzer.mjs';
import { synthesizeWithDeepSeek } from './src/deepseek.mjs';

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
    res.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'public, max-age=300' });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

async function handleAnalyze(req, res) {
  try {
    const body = await readJson(req);
    const username = String(body.username || '').trim();
    const locale = body.locale === 'vi' ? 'vi' : 'en';
    if (!isValidGitHubUsername(username)) return sendJson(res, 400, { error: 'Enter a valid GitHub username.' });

    const dataset = await collectGitHubActivity(username);
    const fallback = deterministicFallback(dataset, locale);
    let synthesis;
    try {
      synthesis = await synthesizeWithDeepSeek(dataset, fallback, { locale });
    } catch (error) {
      synthesis = { report: fallback, mode: 'deterministic', model: null, notice: `DeepSeek synthesis failed: ${error.message}` };
    }

    return sendJson(res, 200, {
      profile: dataset.profile,
      window: dataset.window,
      report: synthesis.report,
      workMix: dataset.workMix,
      evidence: dataset.evidence,
      repos: dataset.repos.map(({ recentCommitMessages, recentPrTitles, changedFiles, ...repo }) => repo),
      meta: {
        analysisMode: synthesis.mode,
        model: synthesis.model,
        notice: synthesis.notice,
        collector: dataset.collector,
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) return sendJson(res, 400, { error: 'Invalid JSON request.' });
    if (error.status === 404) return sendJson(res, 404, { error: 'GitHub user not found.' });
    if (error.status === 403 || error.status === 429) {
      return sendJson(res, 429, { error: 'GitHub rate limit reached. Configure GITHUB_TOKEN for production usage.', reset: error.rateLimitReset || null });
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
      deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
      githubAuthenticated: Boolean(process.env.GITHUB_TOKEN),
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/analyze') return handleAnalyze(req, res);
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (await serveStatic(res, url.pathname)) return;
  }
  sendJson(res, 404, { error: 'Not found.' });
});

server.listen(port, () => console.log(`Dev30 running at http://localhost:${port}`));
