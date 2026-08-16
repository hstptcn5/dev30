function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

async function bootGitHubWorkspace() {
  const panel = document.querySelector('#account-panel');
  const accountName = document.querySelector('#account-name');
  const accountNote = document.querySelector('#account-note');
  const privateWrap = document.querySelector('#private-toggle-wrap');
  const privateToggle = document.querySelector('#private-toggle');
  const actions = document.querySelector('#account-actions');
  const workspaceNav = document.querySelector('#workspace-nav');
  const username = document.querySelector('#username');
  if (!panel || !accountName || !accountNote || !actions) return;

  try {
    const status = await fetch('/api/auth/status', { cache: 'no-store' }).then((response) => response.json());

    if (!status.connected) {
      if (!status.githubAppConfigured) return;
      panel.classList.remove('hidden');
      accountName.textContent = 'Connect your GitHub account';
      accountNote.textContent = 'Analyze your own repositories and keep a private history.';
      const connect = el('a', '', 'Connect GitHub');
      connect.href = '/auth/github?returnTo=/workspace';
      actions.replaceChildren(connect);
      return;
    }

    const me = await fetch('/api/me', { cache: 'no-store' }).then((response) => response.json());
    if (!me.connected || !me.viewer) return;

    document.body.dataset.connectedLogin = me.viewer.login;
    document.body.dataset.connectedMode = me.authMode || 'connected';
    panel.classList.remove('hidden');
    workspaceNav?.classList.remove('hidden');
    accountName.textContent = `@${me.viewer.login}`;
    if (username && !username.value) username.value = me.viewer.login;

    actions.replaceChildren();
    const workspace = el('a', '', 'Workspace →');
    workspace.href = '/workspace';
    actions.append(workspace);

    if (me.access?.readyForPrivateAnalysis) {
      accountNote.textContent = `GitHub connected · ${me.access.privateReposAccessible} private repos available`;
      privateWrap?.classList.remove('hidden');
      if (privateToggle) privateToggle.disabled = false;
    } else if (me.access?.status === 'no-private-repos-accessible') {
      accountNote.textContent = 'GitHub connected · private repositories are not available yet';
      if (me.authMode === 'github-app' && me.installUrl) {
        const choose = el('a', '', 'Choose repositories');
        choose.href = me.installUrl;
        choose.target = '_blank';
        choose.rel = 'noreferrer';
        actions.prepend(choose);
      }
    } else if (me.access?.status === 'missing-repository-permissions') {
      accountNote.textContent = 'GitHub connected · additional repository read permission is needed';
    } else {
      accountNote.textContent = 'GitHub connected';
    }
  } catch {
    // Account enhancements are non-blocking. Public analysis remains available.
  }
}

bootGitHubWorkspace();
