const statusNode = document.querySelector('#status');
const searchFoot = document.querySelector('.search-foot');

function connectUrl() {
  const returnTo = `${location.pathname}${location.search}`;
  return `/auth/github?returnTo=${encodeURIComponent(returnTo === '/' ? '/' : returnTo)}`;
}

async function upgrade() {
  const button = document.querySelector('[data-dev30-upgrade]');
  if (button) button.disabled = true;
  try {
    const response = await fetch('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      location.href = connectUrl();
      return;
    }
    if (!response.ok || !data.url) throw new Error(data.error || 'Upgrade checkout is not configured yet.');
    location.href = data.url;
  } catch (error) {
    if (statusNode) {
      statusNode.className = 'status error';
      statusNode.textContent = error.message;
    }
  } finally {
    if (button) button.disabled = false;
  }
}

function recoveryAction() {
  if (!statusNode || statusNode.classList.contains('hidden') || !statusNode.classList.contains('error')) return;
  if (statusNode.querySelector('.monetization-action')) return;
  const text = statusNode.textContent.toLowerCase();
  let action = null;

  if (text.includes('connect github') || text.includes('no saved public report')) {
    action = document.createElement('a');
    action.href = connectUrl();
    action.textContent = 'Connect GitHub · 5 free analyses / month';
  } else if (text.includes('requires dev30 pro') || text.includes('quota reached')) {
    action = document.createElement('button');
    action.type = 'button';
    action.dataset.dev30Upgrade = 'true';
    action.textContent = 'Upgrade to Pro · 100 analyses / month';
    action.addEventListener('click', upgrade);
  }

  if (action) {
    action.className = 'monetization-action';
    statusNode.append(action);
  }
}

if (searchFoot && !searchFoot.querySelector('.fresh-analysis-note')) {
  const note = document.createElement('span');
  note.className = 'fresh-analysis-note';
  note.textContent = 'Fresh analysis uses your connected GitHub identity · Free includes 5 / month.';
  searchFoot.append(note);
}

if (statusNode) {
  new MutationObserver(recoveryAction).observe(statusNode, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  recoveryAction();
}
