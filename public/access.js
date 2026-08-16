function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

async function bootGitHubWorkspace() {
  const panel = document.querySelector('#account-panel');
  const accountName = document.querySelector('#account-name');
  const accountButton = document.querySelector('#account-button');
  if (!panel || !accountName || !accountButton) return;

  try {
    const status = await fetch('/api/auth/status', { cache: 'no-store' }).then((response) => response.json());

    if (!status.connected) {
      if (!status.githubAppConfigured) return;
      panel.classList.remove('hidden');
      const kicker = panel.querySelector('.account-kicker');
      const copy = panel.querySelector('p');
      if (kicker) kicker.textContent = 'GitHub workspace';
      accountName.textContent = 'Connect your GitHub account';
      if (copy) copy.textContent = 'Use GitHub App authorization instead of creating a personal access token. You choose which repositories Dev30 can access.';
      accountButton.textContent = 'Connect GitHub';
      accountButton.onclick = () => { location.href = '/auth/github?returnTo=/workspace'; };
      return;
    }

    panel.classList.remove('hidden');
    const me = await fetch('/api/me', { cache: 'no-store' }).then((response) => response.json());
    if (!me.connected || !me.viewer) return;

    const details = accountName.parentElement;
    details.querySelectorAll('.workspace-auth-note,.workspace-actions,.workspace-oauth-note').forEach((node) => node.remove());
    const note = el('small', 'muted workspace-auth-note');
    note.style.display = 'block';
    note.style.marginTop = '6px';

    if (me.access?.readyForPrivateAnalysis) {
      note.textContent = `${me.authMode === 'github-app' ? 'GitHub App' : 'PAT fallback'} · private access ready · ${me.access.privateReposAccessible} private repo${me.access.privateReposAccessible === 1 ? '' : 's'} accessible`;
    } else if (me.access?.status === 'no-private-repos-accessible') {
      note.textContent = me.authMode === 'github-app'
        ? 'GitHub is connected, but the app cannot see private repositories yet. Choose repositories for the GitHub App installation.'
        : '0 private repos accessible · update the PAT repository access.';
    } else if (me.access?.status === 'missing-repository-permissions') {
      const missing = [];
      if (!me.access.contentsRead) missing.push('Contents: read');
      if (!me.access.pullRequestsRead) missing.push('Pull requests: read');
      note.textContent = `Connected, but Dev30 still needs ${missing.join(' + ')}.`;
    } else {
      note.textContent = `GitHub connection: ${me.access?.status || me.authMode || 'connected'}`;
    }
    details.append(note);

    const actions = el('div', 'workspace-actions');
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.marginTop = '10px';
    actions.style.flexWrap = 'wrap';

    const workspace = el('a', 'action-button secondary', 'Open workspace');
    workspace.href = '/workspace';
    actions.append(workspace);

    if (me.authMode === 'pat') {
      if (status.githubAppConfigured) {
        const upgrade = el('a', 'action-button', 'Connect GitHub App');
        upgrade.href = '/auth/github?returnTo=/workspace';
        actions.append(upgrade);
      } else {
        const oauthNote = el('small', 'muted workspace-oauth-note', 'GitHub App OAuth is not configured yet. PAT fallback remains active.');
        oauthNote.style.display = 'block';
        oauthNote.style.marginTop = '8px';
        details.append(oauthNote);
      }
    }

    if (me.authMode === 'github-app' && me.installUrl && !me.access?.readyForPrivateAnalysis) {
      const install = el('a', 'action-button', 'Choose repositories');
      install.href = me.installUrl;
      install.target = '_blank';
      install.rel = 'noreferrer';
      actions.append(install);
    }

    if (me.authMode === 'github-app') {
      const logout = el('button', 'action-button secondary', 'Disconnect');
      logout.type = 'button';
      logout.onclick = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        location.href = '/';
      };
      actions.append(logout);
    }
    details.append(actions);
  } catch {
    // GitHub connection UI is non-blocking; the public analyzer remains usable.
  }
}

bootGitHubWorkspace();
