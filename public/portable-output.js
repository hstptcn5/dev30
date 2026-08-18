const EXPORT_SCHEMA_VERSION = 1;

function safeArray(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim(); }
function safeLocale(value) { return value === 'vi' ? 'vi' : 'en'; }
function slug(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'dev30';
}
function dateStamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function safeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}
function mdCell(value) { return text(value).replaceAll('|', '\\|').replace(/\r?\n/g, ' '); }

export function analysisToPortable(data, locale = 'en') {
  const report = data?.report || {};
  return {
    exportSchemaVersion: EXPORT_SCHEMA_VERSION,
    source: 'analysis',
    snapshotId: data?.history?.snapshotId || null,
    generatedAt: data?.history?.generatedAt || new Date().toISOString(),
    username: data?.profile?.login || '',
    displayName: data?.profile?.name || data?.profile?.login || '',
    avatarUrl: data?.profile?.avatarUrl || '',
    days: Number(data?.window?.days || 30),
    locale: safeLocale(locale),
    includePrivate: Boolean(data?.meta?.collector?.includePrivate),
    headline: report.headline || '',
    summary: report.summary || '',
    mainFocus: report.mainFocus || null,
    projects: safeArray(report.projects),
    observations: safeArray(report.observations),
    technical: report.technical || null,
    workMix: data?.workMix || {},
    repos: safeArray(data?.repos),
    evidence: safeArray(data?.evidence),
    analysisMode: data?.meta?.analysisMode || null,
    model: data?.meta?.model || null,
  };
}

export function snapshotToPortable(snapshot) {
  const report = snapshot?.report || {};
  return {
    exportSchemaVersion: EXPORT_SCHEMA_VERSION,
    source: 'snapshot',
    snapshotId: snapshot?.id || null,
    generatedAt: snapshot?.generatedAt || new Date().toISOString(),
    username: snapshot?.username || snapshot?.profile?.login || '',
    displayName: snapshot?.profile?.name || snapshot?.username || '',
    avatarUrl: snapshot?.profile?.avatarUrl || '',
    days: Number(snapshot?.days || 30),
    locale: safeLocale(snapshot?.locale),
    includePrivate: Boolean(snapshot?.includePrivate),
    headline: report.headline || snapshot?.headline || '',
    summary: report.summary || '',
    mainFocus: report.mainFocus || snapshot?.mainFocus || null,
    projects: safeArray(report.projects),
    observations: safeArray(report.observations),
    technical: report.technical || null,
    workMix: snapshot?.workMix || {},
    repos: safeArray(snapshot?.repos),
    evidence: safeArray(snapshot?.evidence),
    analysisMode: snapshot?.analysisMode || null,
    model: snapshot?.model || null,
  };
}

export function portableFilename(portable, ext) {
  const who = slug(portable?.username || 'developer');
  const date = dateStamp(portable?.generatedAt);
  return `dev30-${who}-${Number(portable?.days || 30)}d-${date}.${String(ext || 'txt').replace(/^\./, '')}`;
}

export function portableToMarkdown(portable) {
  const p = portable || {};
  const lines = [];
  const privateLabel = p.includePrivate ? 'Private + public GitHub' : 'Public GitHub';
  lines.push(`# Dev30 Snapshot — @${p.username || 'unknown'}`, '');
  lines.push(`> ${dateStamp(p.generatedAt)} · ${Number(p.days || 30)} days · ${privateLabel}`);
  if (p.snapshotId) lines.push(`> Snapshot ID: \`${p.snapshotId}\``);
  lines.push('', '## Work story', '', p.headline || 'No headline available.');
  if (p.summary) lines.push('', p.summary);

  const focus = p.mainFocus || {};
  if (focus.repo || focus.title || focus.explanation) {
    lines.push('', '## Main focus', '');
    if (focus.repo) lines.push(`**${focus.repo}**`);
    if (focus.title) lines.push('', `### ${focus.title}`);
    if (focus.explanation) lines.push('', focus.explanation);
    if (focus.significance) lines.push('', focus.significance);
  }

  if (safeArray(p.projects).length) {
    lines.push('', '## Projects');
    for (const project of p.projects) {
      lines.push('', `### ${project.repo || project.title || 'Project'}`);
      if (project.title && project.title !== project.repo) lines.push(`**${project.title}**`);
      if (project.description) lines.push('', project.description);
      for (const item of safeArray(project.highlights)) lines.push(`- ${item}`);
    }
  }

  if (safeArray(p.observations).length) {
    lines.push('', '## Patterns worth noticing', '');
    for (const item of p.observations) lines.push(`- ${text(item?.text || item)}`);
  }

  const mix = Object.entries(p.workMix || {}).filter(([, value]) => Number(value || 0) > 0);
  if (mix.length) {
    lines.push('', '## Engineering work mix', '', '| Area | Share |', '| --- | ---: |');
    for (const [name, value] of mix) lines.push(`| ${mdCell(name.replaceAll('_', ' '))} | ${Math.round(Number(value || 0))}% |`);
  }

  if (safeArray(p.repos).length) {
    lines.push('', '## Repository activity', '', '| Repository | Visibility | Commits | PRs | Language |', '| --- | --- | ---: | ---: | --- |');
    for (const repo of p.repos) {
      lines.push(`| ${mdCell(repo.name)} | ${mdCell(repo.visibility || 'public')} | ${Number(repo.commits || 0)}${repo.commitsTruncated ? '+' : ''} | ${Number(repo.pullRequests || 0)}${repo.pullsTruncated ? '+' : ''} | ${mdCell(repo.language || '—')} |`);
    }
  }

  if (safeArray(p.evidence).length) {
    lines.push('', '## Evidence', '');
    for (const item of p.evidence) {
      const url = safeUrl(item.url);
      const label = `${item.repo || 'GitHub'} · ${item.title || item.type || 'evidence'}`;
      lines.push(url ? `- [${label}](${url}) — ${item.date || ''}` : `- ${label} — ${item.date || ''}`);
    }
  }

  lines.push('', '---', '', `Generated by [Dev30](https://getdev30.xyz) · Evidence-backed GitHub work briefing.`);
  if (p.includePrivate) lines.push('', '> This export may contain information derived from private repositories.');
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

export function portableToJson(portable) {
  return `${JSON.stringify(portable, null, 2)}\n`;
}

function printSection(title, body) {
  if (!body) return '';
  return `<section class="section"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}
function printProjects(projects) {
  return safeArray(projects).map((project) => `<article class="project"><div class="repo">${escapeHtml(project.repo || 'Project')}</div><h3>${escapeHtml(project.title || project.repo || 'Observed work')}</h3>${project.description ? `<p>${escapeHtml(project.description)}</p>` : ''}${safeArray(project.highlights).length ? `<ul>${safeArray(project.highlights).slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}</article>`).join('');
}
function printEvidence(evidence) {
  return safeArray(evidence).map((item) => {
    const url = safeUrl(item.url);
    const label = `${item.repo || 'GitHub'} · ${item.title || item.type || 'Evidence'}`;
    return `<li>${url ? `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>` : escapeHtml(label)} <span>${escapeHtml(item.date || '')}</span></li>`;
  }).join('');
}

export function buildPrintHtml(portable) {
  const p = portable || {};
  const focus = p.mainFocus || {};
  const mix = Object.entries(p.workMix || {}).filter(([, value]) => Number(value || 0) > 0);
  const repoRows = safeArray(p.repos).map((repo) => `<tr><td>${escapeHtml(repo.name)}</td><td>${escapeHtml(repo.visibility || 'public')}</td><td>${Number(repo.commits || 0)}${repo.commitsTruncated ? '+' : ''}</td><td>${Number(repo.pullRequests || 0)}${repo.pullsTruncated ? '+' : ''}</td><td>${escapeHtml(repo.language || '—')}</td></tr>`).join('');
  const mixRows = mix.map(([name, value]) => `<tr><td>${escapeHtml(name.replaceAll('_', ' '))}</td><td>${Math.round(Number(value || 0))}%</td></tr>`).join('');
  const privateBadge = p.includePrivate ? '<span class="badge private">PRIVATE + PUBLIC</span>' : '<span class="badge">PUBLIC</span>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(portableFilename(p, 'pdf').replace(/\.pdf$/, ''))}</title><style>
    @page{size:A4;margin:14mm 15mm 16mm}*{box-sizing:border-box}body{margin:0;color:#18261f;font-family:Inter,Arial,"Helvetica Neue",sans-serif;font-size:10.5pt;line-height:1.55;background:#fff}a{color:#175ea8}h1,h2,h3{margin:0;color:#14241b;line-height:1.12}h1{font-size:28pt;letter-spacing:-.035em;margin:12mm 0 5mm}h2{font-size:15pt;margin-bottom:4mm}h3{font-size:12pt;margin:1mm 0 2mm}p{margin:0 0 3mm}.screenbar{position:sticky;top:0;padding:9px 12px;background:#183025;color:#fff;font-size:12px;text-align:center}.screenbar button{margin-left:10px;padding:5px 9px;border:0;border-radius:4px;background:#fff;color:#183025;font-weight:700}.brand{display:flex;align-items:center;justify-content:space-between;padding-bottom:5mm;border-bottom:1px solid #d9e2dc}.brand strong{font-size:14pt}.eyebrow{font:700 8pt/1.2 ui-monospace,monospace;letter-spacing:.12em;color:#2d7a58}.badge{display:inline-block;padding:3px 6px;border:1px solid #b8cec0;border-radius:999px;font:700 7pt/1 ui-monospace,monospace;color:#2d7a58}.badge.private{border-color:#d9bd83;color:#8c641e}.summary{font-size:13pt;color:#405249;max-width:160mm}.meta{display:flex;gap:12px;flex-wrap:wrap;margin:5mm 0 9mm;color:#66776d;font-size:8.5pt}.section{margin:0 0 8mm;break-inside:auto}.focus{padding:5mm;border:1px solid #cfe0d5;border-radius:8px;background:#f7fbf8;break-inside:avoid}.focus .repo{font:700 8pt/1 ui-monospace,monospace;color:#2d7a58;margin-bottom:2mm}.projects{display:grid;grid-template-columns:1fr 1fr;gap:4mm}.project{padding:4mm;border:1px solid #dbe4de;border-radius:7px;break-inside:avoid}.project .repo{font:700 7.5pt/1 ui-monospace,monospace;color:#2d7a58;margin-bottom:2mm}.project ul{margin:2mm 0 0;padding-left:5mm}table{width:100%;border-collapse:collapse;font-size:9pt}th,td{padding:2.2mm;border-bottom:1px solid #e1e7e3;text-align:left}th{font-size:7.5pt;text-transform:uppercase;letter-spacing:.05em;color:#65756c}.evidence{padding-left:5mm;margin:0}.evidence li{margin-bottom:2mm;break-inside:avoid}.evidence span{color:#7b8981;font-size:8pt}.footer{margin-top:10mm;padding-top:4mm;border-top:1px solid #dce4df;color:#7b8880;font-size:7.5pt}.private-note{padding:3mm 4mm;border-left:3px solid #b07a28;background:#fff9ed;color:#79591f;margin-bottom:6mm}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:5mm}@media print{.screenbar{display:none}.projects{grid-template-columns:1fr 1fr}}@media(max-width:700px){.projects,.grid2{grid-template-columns:1fr}}
  </style></head><body><div class="screenbar">Dev30 PDF export · Choose “Save as PDF” in the print dialog.<button onclick="window.print()">Print / Save PDF</button></div><main><header class="brand"><strong>Dev30</strong>${privateBadge}</header><div class="eyebrow" style="margin-top:9mm">EVIDENCE-BACKED GITHUB WORK BRIEFING</div><h1>${escapeHtml(p.headline || 'Developer activity snapshot')}</h1>${p.summary ? `<p class="summary">${escapeHtml(p.summary)}</p>` : ''}<div class="meta"><span>@${escapeHtml(p.username || 'unknown')}</span><span>${Number(p.days || 30)} days</span><span>${escapeHtml(dateStamp(p.generatedAt))}</span>${p.snapshotId ? `<span>Snapshot ${escapeHtml(p.snapshotId)}</span>` : ''}</div>${p.includePrivate ? '<div class="private-note">This report may contain information derived from private repositories. Keep the exported PDF within the intended audience.</div>' : ''}${focus.repo || focus.title ? printSection('Main focus', `<div class="focus"><div class="repo">${escapeHtml(focus.repo || 'Observed work')}</div><h3>${escapeHtml(focus.title || 'Main focus')}</h3>${focus.explanation ? `<p>${escapeHtml(focus.explanation)}</p>` : ''}${focus.significance ? `<p>${escapeHtml(focus.significance)}</p>` : ''}</div>`) : ''}${safeArray(p.projects).length ? printSection('Projects', `<div class="projects">${printProjects(p.projects)}</div>`) : ''}<div class="grid2">${mixRows ? printSection('Engineering work mix', `<table><tbody>${mixRows}</tbody></table>`) : ''}${repoRows ? printSection('Repository activity', `<table><thead><tr><th>Repository</th><th>Visibility</th><th>Commits</th><th>PRs</th><th>Language</th></tr></thead><tbody>${repoRows}</tbody></table>`) : ''}</div>${safeArray(p.evidence).length ? printSection(`Evidence · ${p.evidence.length} sources`, `<ol class="evidence">${printEvidence(p.evidence)}</ol>`) : ''}<footer class="footer">Generated by Dev30 · getdev30.xyz · ${escapeHtml(p.analysisMode || 'analysis')}</footer></main><script>setTimeout(()=>window.print(),350);</script></body></html>`;
}

function toast(message, error = false) {
  if (typeof document === 'undefined') return;
  const old = document.querySelector('.portable-toast');
  old?.remove();
  const node = document.createElement('div');
  node.className = `portable-toast${error ? ' is-error' : ''}`;
  node.textContent = message;
  document.body.append(node);
  requestAnimationFrame(() => node.classList.add('is-visible'));
  setTimeout(() => { node.classList.remove('is-visible'); setTimeout(() => node.remove(), 220); }, 2200);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadText(content, filename, type) {
  downloadBlob(new Blob([content], { type }), filename);
}
async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement('textarea');
  area.value = value;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}
function confirmPrivate(portable) {
  if (!portable.includePrivate) return true;
  return window.confirm('This export may contain information derived from private repositories. Continue and create the local file?');
}

function openPrintDocument(portable) {
  if (!confirmPrivate(portable)) return;
  const win = window.open('', '_blank');
  if (!win) return toast('Popup blocked. Allow popups for Dev30, then try PDF export again.', true);
  try { win.opener = null; } catch {}
  win.document.open();
  win.document.write(buildPrintHtml(portable));
  win.document.close();
}

function wrapCanvasText(ctx, value, maxWidth, maxLines = 3) {
  const words = text(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else { lines.push(line); line = word; }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (words.length && lines.length === maxLines) {
    const joined = lines.join(' ');
    if (joined.length < text(value).length) lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.…]+$/, '')}…`;
  }
  return lines;
}

export async function pixelCardBlob(portable) {
  if (typeof document === 'undefined') throw new Error('Pixel card rendering requires a browser.');
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  ctx.fillStyle = '#f7fbf8'; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = '#e7f0ea';
  for (let x = 0; x < 1200; x += 24) for (let y = 0; y < 630; y += 24) if ((x / 24 + y / 24) % 7 === 0) ctx.fillRect(x, y, 3, 3);
  ctx.fillStyle = '#2d7a58'; ctx.fillRect(64, 56, 16, 16); ctx.fillRect(80, 40, 16, 16); ctx.fillRect(96, 56, 16, 16); ctx.fillRect(80, 72, 16, 16);
  ctx.fillStyle = '#183025'; ctx.font = '800 30px Arial, sans-serif'; ctx.fillText('Dev30', 132, 73);
  ctx.font = '700 18px monospace'; ctx.fillStyle = '#2d7a58'; ctx.fillText(`SNAPSHOT${portable.snapshotId ? ` · ${String(portable.snapshotId).slice(0, 8)}` : ''}`, 64, 132);
  if (portable.includePrivate) { ctx.fillStyle = '#fff1cc'; ctx.fillRect(970, 48, 150, 36); ctx.fillStyle = '#8b611a'; ctx.font = '700 16px monospace'; ctx.fillText('PRIVATE', 1005, 72); }
  ctx.fillStyle = '#183025'; ctx.font = '800 54px Arial, sans-serif';
  const headline = wrapCanvasText(ctx, portable.headline || 'Developer activity snapshot', 980, 3);
  headline.forEach((line, index) => ctx.fillText(line, 64, 205 + index * 62));
  const afterHeadline = 205 + headline.length * 62 + 10;
  ctx.fillStyle = '#607168'; ctx.font = '400 24px Arial, sans-serif';
  const summary = wrapCanvasText(ctx, portable.summary || portable.mainFocus?.title || 'Evidence-backed GitHub work briefing.', 1000, 2);
  summary.forEach((line, index) => ctx.fillText(line, 64, afterHeadline + index * 34));
  const focusY = Math.min(470, afterHeadline + summary.length * 34 + 34);
  ctx.fillStyle = '#dcebe2'; ctx.fillRect(64, focusY, 1072, 2);
  ctx.fillStyle = '#2d7a58'; ctx.font = '700 15px monospace'; ctx.fillText('MAIN_FOCUS', 64, focusY + 36);
  ctx.fillStyle = '#183025'; ctx.font = '700 26px Arial, sans-serif'; ctx.fillText(text(portable.mainFocus?.repo || 'Recent GitHub work').slice(0, 58), 64, focusY + 72);
  const projects = safeArray(portable.projects).slice(0, 3).map((item) => item.repo || item.title).filter(Boolean);
  ctx.fillStyle = '#6b7b72'; ctx.font = '500 17px Arial, sans-serif'; ctx.fillText(projects.length ? projects.join('  ·  ').slice(0, 100) : 'Developer journal snapshot', 64, focusY + 105);
  const repoCount = safeArray(portable.repos).length;
  const evidenceCount = safeArray(portable.evidence).length;
  ctx.fillStyle = '#183025'; ctx.font = '700 18px monospace'; ctx.fillText(`@${portable.username || 'unknown'}  ·  ${Number(portable.days || 30)} DAYS  ·  ${repoCount} REPOS  ·  ${evidenceCount} EVIDENCE`, 64, 574);
  ctx.fillStyle = '#2d7a58'; ctx.font = '700 16px monospace'; ctx.fillText('getdev30.xyz', 980, 574);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG generation failed.')), 'image/png'));
}

async function exportPixelCard(portable) {
  if (!confirmPrivate(portable)) return;
  const blob = await pixelCardBlob(portable);
  downloadBlob(blob, portableFilename(portable, 'png'));
  toast('Pixel summary card downloaded.');
}

function button(icon, title, note, onClick) {
  const node = document.createElement('button');
  node.type = 'button'; node.className = 'portable-menu-button';
  const mark = document.createElement('span'); mark.className = 'portable-menu-icon'; mark.textContent = icon;
  const copy = document.createElement('span'); copy.className = 'portable-menu-copy';
  const strong = document.createElement('strong'); strong.textContent = title;
  const small = document.createElement('small'); small.textContent = note;
  copy.append(strong, small); node.append(mark, copy);
  node.addEventListener('click', async () => {
    node.closest('details')?.removeAttribute('open');
    try { await onClick(); } catch (error) { toast(error.message || 'Export failed.', true); }
  });
  return node;
}

function exportMenu(portableProvider) {
  const wrap = document.createElement('div'); wrap.className = 'portable-toolbar';
  const details = document.createElement('details'); details.className = 'portable-menu';
  const summary = document.createElement('summary'); summary.textContent = 'Export';
  const panel = document.createElement('div'); panel.className = 'portable-menu-panel';
  const getPortable = async () => {
    const value = await portableProvider();
    if (!value) throw new Error('Run an analysis first so Dev30 has structured data to export.');
    return value;
  };
  panel.append(
    button('PDF', 'PDF report', 'Print-ready A4 · Save as PDF', async () => openPrintDocument(await getPortable())),
    button('MD', 'Markdown', 'Download a portable developer journal entry', async () => { const p = await getPortable(); if (!confirmPrivate(p)) return; downloadText(portableToMarkdown(p), portableFilename(p, 'md'), 'text/markdown;charset=utf-8'); toast('Markdown downloaded.'); }),
    button('CPY', 'Copy as Markdown', 'Paste into Notion, Obsidian or an AI chat', async () => { const p = await getPortable(); if (!confirmPrivate(p)) return; await copyText(portableToMarkdown(p)); toast('Markdown copied to clipboard.'); }),
  );
  const divider = document.createElement('div'); divider.className = 'portable-menu-divider'; panel.append(divider);
  panel.append(
    button('JSON', 'JSON data', 'Structured snapshot for integrations and backup', async () => { const p = await getPortable(); if (!confirmPrivate(p)) return; downloadText(portableToJson(p), portableFilename(p, 'json'), 'application/json;charset=utf-8'); toast('JSON downloaded.'); }),
    button('PNG', 'Pixel summary card', '1200×630 image for sharing', async () => exportPixelCard(await getPortable())),
  );
  details.append(summary, panel); wrap.append(details);
  return wrap;
}

let currentPortable = null;
let installedFetchCapture = false;

function installFetchCapture() {
  if (installedFetchCapture || typeof window === 'undefined') return;
  installedFetchCapture = true;
  const previousFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await previousFetch(...args);
    try {
      const input = args[0];
      const rawUrl = typeof input === 'string' ? input : input?.url;
      const url = new URL(rawUrl, location.origin);
      if (url.pathname === '/api/analyze' && response.ok) {
        response.clone().json().then((data) => {
          currentPortable = analysisToPortable(data, document.querySelector('#locale')?.value || 'en');
          queueInstallToolbar();
        }).catch(() => {});
      }
    } catch {}
    return response;
  };
}

function installReportToolbar() {
  if (!currentPortable) return;
  const report = document.querySelector('#report');
  if (!report || report.classList.contains('hidden')) return;
  const actions = report.querySelector('.report-profile .profile-actions');
  if (!actions || actions.querySelector('.portable-toolbar')) return;
  actions.append(exportMenu(async () => currentPortable));
  const note = document.createElement('span'); note.className = 'portable-output-note'; note.textContent = 'PDF · MD · JSON · PNG'; actions.append(note);
}

let toolbarScheduled = false;
function queueInstallToolbar() {
  if (toolbarScheduled || typeof requestAnimationFrame === 'undefined') return;
  toolbarScheduled = true;
  requestAnimationFrame(() => { toolbarScheduled = false; installReportToolbar(); });
}

async function recoverPublicRoute() {
  if (currentPortable || typeof location === 'undefined') return;
  const route = location.pathname.match(/^\/u\/([^/]+)\/?$/);
  if (!route) return;
  const params = new URLSearchParams(location.search);
  const locale = params.get('lang') === 'vi' ? 'vi' : 'en';
  const days = ['7', '30', '90'].includes(params.get('days')) ? params.get('days') : '30';
  try {
    const response = await fetch(`/api/public-report?username=${encodeURIComponent(decodeURIComponent(route[1]))}&days=${days}&locale=${locale}`, { cache: 'no-store' });
    if (!response.ok) return;
    currentPortable = analysisToPortable(await response.json(), locale);
    queueInstallToolbar();
  } catch {}
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  installFetchCapture();
  recoverPublicRoute();
  queueInstallToolbar();
  new MutationObserver(queueInstallToolbar).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}
