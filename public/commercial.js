const status = document.querySelector('#commercial-status');

function connectUrl() {
  const returnTo = `${location.pathname}${location.search}`;
  return `/auth/github?returnTo=${encodeURIComponent(returnTo || '/pricing')}`;
}

function showStatus(message, error = false) {
  if (!status) return;
  status.className = `commercial-status${error ? ' error' : ''}`;
  status.textContent = message;
}

async function upgrade(button) {
  button.disabled = true;
  try {
    const response = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      location.href = connectUrl();
      return;
    }
    if (!response.ok || !data.url) {
      if (response.status === 503) {
        showStatus('Pro checkout is being activated. Free analysis remains available while billing setup is completed.', false);
        return;
      }
      throw new Error(data.error || 'Unable to start checkout.');
    }
    location.href = data.url;
  } catch (error) {
    showStatus(error.message || 'Unable to start checkout.', true);
  } finally {
    button.disabled = false;
  }
}

document.querySelectorAll('[data-commercial-upgrade]').forEach((button) => {
  button.addEventListener('click', () => upgrade(button));
});
