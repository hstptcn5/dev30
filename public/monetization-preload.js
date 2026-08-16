(() => {
  const nativeFetch = window.fetch.bind(window);
  let sharedRouteResolved = false;

  window.__dev30NativeFetch = nativeFetch;
  window.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    const route = location.pathname.match(/^\/u\/([^/]+)\/?$/);

    if (!sharedRouteResolved && route && method === 'POST' && requestUrl === '/api/analyze') {
      try {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
        const routeUsername = decodeURIComponent(route[1]);
        if (body && body.refresh !== true && body.includePrivate !== true && String(body.username || '').toLowerCase() === routeUsername.toLowerCase()) {
          sharedRouteResolved = true;
          const query = new URLSearchParams({
            username: body.username,
            days: String(body.days || 30),
            locale: body.locale === 'vi' ? 'vi' : 'en',
          });
          return nativeFetch(`/api/public-report?${query}`, { method: 'GET', cache: 'no-store' });
        }
      } catch {
        // Fall through to the real fresh-analysis request if the body is unexpected.
      }
    }

    return nativeFetch(input, init);
  };

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest?.('[data-example]');
    if (!trigger) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const username = document.querySelector('#username');
    const privateToggle = document.querySelector('#private-toggle');
    const preview = document.querySelector('#example-preview');
    const valueStrip = document.querySelector('.value-strip');
    if (username) username.value = trigger.dataset.example || 'hstptcn5';
    if (privateToggle) privateToggle.checked = false;
    preview?.classList.remove('hidden');
    valueStrip?.classList.remove('hidden');
    preview?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, true);
})();
