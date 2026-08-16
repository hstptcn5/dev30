const accountPanel = document.querySelector('#account-panel');
const accountNote = document.querySelector('#account-note');

function compactConnectedAccount() {
  if (!accountPanel || !accountNote || accountPanel.classList.contains('hidden')) return;
  const match = accountNote.textContent.match(/(\d+)\s+private repos available/i);
  if (match) accountNote.textContent = `${match[1]} private repos available`;
}

function prioritizeWorkspaceLatestActivity() {
  if (location.pathname !== '/workspace') return;
  const heroButton = document.querySelector('.workspace-hero > .workspace-primary-button');
  const primaryCard = document.querySelector('.workspace-primary-card');
  if (!heroButton || !primaryCard || primaryCard.querySelector('.workspace-primary-actions')) return;

  const duplicateLink = primaryCard.querySelector(':scope > .workspace-text-link');
  duplicateLink?.remove();

  const actions = document.createElement('div');
  actions.className = 'workspace-primary-actions';
  actions.append(heroButton);
  primaryCard.append(actions);
}

function runPolish() {
  compactConnectedAccount();
  prioritizeWorkspaceLatestActivity();
}

runPolish();
new MutationObserver(runPolish).observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class'],
});
