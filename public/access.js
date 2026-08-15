async function showPrivateAccessDiagnostics() {
  const panel = document.querySelector('#account-panel');
  const accountName = document.querySelector('#account-name');
  if (!panel || !accountName) return;

  try {
    const response = await fetch('/api/me', { cache: 'no-store' });
    const data = await response.json();
    if (!data.connected || !data.access) return;

    const note = document.createElement('small');
    note.className = 'muted';
    note.style.display = 'block';
    note.style.marginTop = '6px';

    if (data.access.readyForPrivateAnalysis) {
      note.textContent = `Private access ready · ${data.access.privateReposAccessible} private repo${data.access.privateReposAccessible === 1 ? '' : 's'} accessible`;
    } else if (data.access.status === 'no-private-repos-accessible') {
      note.textContent = '0 private repos accessible · update the GitHub token repository access to include private repositories.';
    } else if (data.access.status === 'missing-repository-permissions') {
      const missing = [];
      if (!data.access.contentsRead) missing.push('Contents: read');
      if (!data.access.pullRequestsRead) missing.push('Pull requests: read');
      note.textContent = `Private repos found, but the token still needs ${missing.join(' + ')}.`;
    } else {
      note.textContent = `Private access check: ${data.access.status}`;
    }

    accountName.parentElement?.append(note);
  } catch {
    // The main app already handles GitHub connection state; diagnostics are non-blocking.
  }
}

showPrivateAccessDiagnostics();
