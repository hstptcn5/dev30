const form = document.querySelector('#analyze-form');
const analyzeButton = document.querySelector('#analyze-button');
const report = document.querySelector('#report');
const status = document.querySelector('#status');
const privateToggle = document.querySelector('#private-toggle');
const privateToggleWrap = document.querySelector('#private-toggle-wrap');

function ensureToastRegion() {
  let region = document.querySelector('.pm-toast-region');
  if (region) return region;
  region = document.createElement('div');
  region.className = 'pm-toast-region';
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'false');
  document.body.append(region);
  return region;
}

function toast(message, kind = 'info') {
  if (!message) return;
  const region = ensureToastRegion();
  const node = document.createElement('div');
  node.className = `pm-toast${kind === 'error' ? ' error' : ''}`;
  node.textContent = String(message);
  region.append(node);
  window.setTimeout(() => node.remove(), kind === 'error' ? 7000 : 4200);
}

// Existing workspace code used blocking alert() for recoverable API failures.
// Keep confirm() for destructive disconnect, but make ordinary failures non-blocking.
window.alert = (message) => toast(message, 'error');

// The private-repository checkbox is the consent action. Keep the consequence visible
// beside that control without turning the connected-account row into a settings panel.
if (privateToggle && privateToggleWrap) {
  const note = document.createElement('small');
  note.className = 'private-privacy-note';
  note.textContent = 'Private work metadata may be saved here and sent to DeepSeek.';
  privateToggleWrap.append(note);
  privateToggle.addEventListener('change', () => {
    if (privateToggle.checked) sessionStorage.setItem('dev30-private-warning-accepted', '1');
  });
}

if (form && analyzeButton) {
  const defaultLabel = analyzeButton.textContent;
  form.addEventListener('submit', () => {
    document.body.classList.add('analysis-pending');
    report?.setAttribute('aria-busy', 'true');
    analyzeButton.setAttribute('aria-busy', 'true');
    analyzeButton.textContent = 'Reading GitHub…';
  }, { capture: true });

  const finish = () => {
    if (!document.body.classList.contains('analysis-pending')) return;
    const reportVisible = report && !report.classList.contains('hidden') && report.childElementCount > 0;
    const errorVisible = status && status.classList.contains('error') && !status.classList.contains('hidden');
    if (!reportVisible && !errorVisible) return;
    document.body.classList.remove('analysis-pending');
    report?.removeAttribute('aria-busy');
    analyzeButton.removeAttribute('aria-busy');
    analyzeButton.textContent = defaultLabel;
  };

  if (report) new MutationObserver(finish).observe(report, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  if (status) new MutationObserver(finish).observe(status, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}

// Give long reports a useful browser title once the profile is rendered.
if (report) {
  new MutationObserver(() => {
    const name = report.querySelector('.profile-meta h2')?.textContent?.trim();
    if (name && location.pathname.startsWith('/u/')) document.title = `${name} — Dev30 work briefing`;
  }).observe(report, { childList: true, subtree: true });
}
