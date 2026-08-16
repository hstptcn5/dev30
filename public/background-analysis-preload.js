(() => {
  const nativeFetch = window.fetch.bind(window);
  const MAX_WAIT_MS = 14 * 60 * 1000;
  const POLL_MS = 1500;

  function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  function requestPath(input) {
    try {
      const value = input instanceof Request ? input.url : String(input);
      return new URL(value, location.origin).pathname;
    } catch {
      return '';
    }
  }

  function requestMethod(input, init) {
    return String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  }

  async function safeJson(response) {
    const type = response.headers.get('content-type') || '';
    if (!type.includes('application/json')) return null;
    try { return await response.json(); } catch { return null; }
  }

  function delay(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  }

  async function poll(jobId, signal) {
    const started = Date.now();
    while (Date.now() - started < MAX_WAIT_MS) {
      const response = await nativeFetch(`/api/analysis-job/${encodeURIComponent(jobId)}`, {
        cache: 'no-store',
        signal,
      });
      const payload = await safeJson(response);

      if (response.status === 202 || payload?.status === 'starting' || payload?.status === 'running') {
        await delay(POLL_MS, signal);
        continue;
      }
      if (response.ok && payload?.status === 'completed' && payload.result) {
        return jsonResponse(200, payload.result);
      }
      if (payload?.status === 'failed') {
        return jsonResponse(Number(payload.responseStatus) || response.status || 500, {
          error: payload.error || 'Analysis failed.',
        });
      }
      if (!response.ok) {
        return jsonResponse(response.status || 503, {
          error: payload?.error || 'Analysis status is temporarily unavailable.',
        });
      }
      await delay(POLL_MS, signal);
    }
    return jsonResponse(504, {
      error: 'Analysis is taking longer than expected. Please try again in a moment.',
    });
  }

  window.fetch = async function dev30Fetch(input, init = {}) {
    if (requestPath(input) !== '/api/analyze' || requestMethod(input, init) !== 'POST') {
      return nativeFetch(input, init);
    }

    let payload;
    try {
      const rawBody = init.body ?? (input instanceof Request ? await input.clone().text() : '');
      payload = rawBody ? JSON.parse(String(rawBody)) : {};
    } catch {
      return nativeFetch(input, init);
    }

    // Let the monetization preload resolve anonymous /u/:username reads from
    // durable public snapshots. Only a fresh/refresh Analyze belongs in the
    // long-running background worker.
    const sharedRoute = location.pathname.match(/^\/u\/([^/]+)\/?$/);
    if (sharedRoute && payload.refresh !== true && payload.includePrivate !== true) {
      const routeUsername = decodeURIComponent(sharedRoute[1]);
      if (String(payload.username || '').toLowerCase() === routeUsername.toLowerCase()) {
        return nativeFetch(input, init);
      }
    }

    const jobId = crypto.randomUUID();
    let start;
    try {
      start = await nativeFetch('/api/analyze-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, jobId }),
        signal: init.signal,
      });
    } catch (error) {
      return jsonResponse(503, { error: error?.message || 'Could not start analysis.' });
    }

    // Local Node development has no Netlify background route. Preserve the
    // existing synchronous path there so npm start remains unchanged.
    if (start.status === 404 || start.status === 405) return nativeFetch(input, init);

    if (start.status !== 202) {
      const responsePayload = await safeJson(start);
      return jsonResponse(start.status || 502, {
        error: responsePayload?.error || 'The hosted analysis worker could not be started.',
      });
    }

    return poll(jobId, init.signal);
  };
})();
