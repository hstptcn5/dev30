(() => {
  if (window.__dev30ConsolePreloadInstalled) return;
  window.__dev30ConsolePreloadInstalled = true;
  const nativeFetch = window.fetch.bind(window);
  let workspace = null;
  let settings = null;
  let workspaceTimer = null;

  function requestPath(input) {
    try {
      const value = input instanceof Request ? input.url : String(input);
      return new URL(value, location.origin).pathname;
    } catch { return ''; }
  }

  function method(input, init) {
    return String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  }

  async function readClone(response) {
    if (!response?.ok) return null;
    const type = response.headers.get('content-type') || '';
    if (!type.includes('application/json')) return null;
    try { return await response.clone().json(); } catch { return null; }
  }

  function emitWorkspace() {
    if (!workspace || !settings) return;
    if (workspaceTimer) clearTimeout(workspaceTimer);
    workspaceTimer = setTimeout(() => {
      workspaceTimer = null;
      document.dispatchEvent(new CustomEvent('dev30:workspace-rendered', {
        detail: { workspace, settings },
      }));
    }, 0);
  }

  function emitAnalysis(payload) {
    setTimeout(() => document.dispatchEvent(new CustomEvent('dev30:analysis-rendered', { detail: payload })), 0);
  }

  window.fetch = async function dev30ConsoleFetch(input, init = {}) {
    const response = await nativeFetch(input, init);
    const path = requestPath(input);
    const requestMethod = method(input, init);

    if (path === '/api/analyze' && requestMethod === 'POST') {
      const payload = await readClone(response);
      if (payload) emitAnalysis(payload);
    } else if (path === '/api/workspace' && requestMethod === 'GET') {
      const payload = await readClone(response);
      if (payload) { workspace = payload; emitWorkspace(); }
    } else if (path === '/api/workspace-settings' && requestMethod === 'GET') {
      const payload = await readClone(response);
      if (payload) { settings = payload; emitWorkspace(); }
    }

    return response;
  };
})();
