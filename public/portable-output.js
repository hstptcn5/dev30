const EXPORT_SCHEMA_VERSION = 1;
const PDF_PROJECT_LIMIT = 6;
const PDF_EVIDENCE_LIMIT = 12;
const KEY_EVIDENCE_LIMIT = 15;

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
function shorten(value, maxLength) {
  const source = text(value);
  if (!source || source.length <= maxLength) return source;
  const clipped = source.slice(0, Math.max(1, maxLength - 1));
  const boundary = clipped.lastIndexOf(' ');
  return `${(boundary > maxLength * 0.55 ? clipped.slice(0, boundary) : clipped).replace(/[.,;:!?\-–—\s]+$/, '')}…`;
}
function evidenceId(item) { return text(item?.id || item?.ref || ''); }
function evidenceMarkdown(item) {
  const id = evidenceId(item);
  const url = safeUrl(item?.url);
  const label = `${item?.repo || 'GitHub'} · ${item?.title || item?.type || 'evidence'}`;
  const prefix = id ? `**[${id}]** ` : '';
  return url ? `- ${prefix}[${label}](${url}) — ${item?.date || ''}` : `- ${prefix}${label} — ${item?.date || ''}`;
}
function collectEvidenceWeights(portable) {
  const weights = new Map();
  const add = (values, score) => {
    for (const raw of safeArray(values)) {
      const id = text(raw);
      if (!id) continue;
      weights.set(id, Math.max(Number(weights.get(id) || 0), score));
    }
  };
  add(portable?.mainFocus?.evidenceIds, 4);
  for (const project of safeArray(portable?.projects)) add(project?.evidenceIds, 3);
  for (const observation of safeArray(portable?.observations)) add(observation?.evidenceIds, 2);
  for (const signal of safeArray(portable?.technical?.signals)) add(signal?.evidenceIds, 1);
  return weights;
}
export function selectKeyEvidence(portable, limit = KEY_EVIDENCE_LIMIT) {
  const evidence = safeArray(portable?.evidence);
  const weights = collectEvidenceWeights(portable);
  const ranked = evidence.map((item, index) => ({ item, index, weight: Number(weights.get(evidenceId(item)) || 0) }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  const seen = new Set();
  const result = [];
  for (const entry of ranked) {
    const key = evidenceId(entry.item) || safeUrl(entry.item?.url) || `${entry.item?.repo || ''}:${entry.item?.title || ''}:${entry.index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry.item);
    if (result.length >= limit) break;
  }
  return result;
}

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

export function portableSocialHeadline(portable) {
  const focusTitle = text(portable?.mainFocus?.title);
  const focusRepo = text(portable?.mainFocus?.repo);
  if (focusTitle) return shorten(focusTitle, 72);
  if (focusRepo) return shorten(focusRepo, 72);
  return shorten(portable?.headline || 'Developer activity snapshot', 72);
}

function portableSocialSubtitle(portable) {
  const socialHeadline = portableSocialHeadline(portable);
  const source = text(portable?.summary) || (text(portable?.headline) !== socialHeadline ? text(portable?.headline) : 'Evidence-backed GitHub work briefing.');
  return shorten(source, 150);
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

  const fullEvidence = safeArray(p.evidence);
  const keyEvidence = selectKeyEvidence(p, KEY_EVIDENCE_LIMIT);
  if (keyEvidence.length) {
    lines.push('', `## Key evidence`, '', `The ${keyEvidence.length} evidence items most directly connected to the briefing claims:`, '');
    for (const item of keyEvidence) lines.push(evidenceMarkdown(item));
  }
  if (fullEvidence.length) {
    lines.push('', `## Full evidence appendix`, '', `${fullEvidence.length} evidence items captured in this snapshot. Evidence IDs such as \`E45\` map directly to references used above.`, '');
    for (const item of fullEvidence) lines.push(evidenceMarkdown(item));
  }

  lines.push('', '---', '', `Generated by [Dev30](https://getdev30.xyz) · Evidence-backed GitHub work briefing.`);
  if (p.includePrivate) lines.push('', '> This export may contain information derived from private repositories.');
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

export function portableToJson(portable) {
  return `${JSON.stringify(portable, null, 2)}\n`;
}

function printHeader(portable, badge) {
  return `<header class="brand"><strong>Dev30</strong>${badge}</header><div class="eyebrow">EVIDENCE-BACKED GITHUB WORK BRIEFING</div><div class="page-meta"><span>@${escapeHtml(portable.username || 'unknown')}</span><span>${Number(portable.days || 30)} days</span><span>${escapeHtml(dateStamp(portable.generatedAt))}</span></div>`;
}
function printFooter(portable, page, total) {
  return `<footer class="page-footer"><span>Dev30 · getdev30.xyz</span><span>Snapshot ${escapeHtml(String(portable.snapshotId || 'current').slice(0, 12))}</span><span>${page}/${total}</span></footer>`;
}
function printProjects(projects) {
  return safeArray(projects).slice(0, PDF_PROJECT_LIMIT).map((project) => `<article class="project"><div class="repo">${escapeHtml(project.repo || 'Project')}</div><h3>${escapeHtml(project.title || project.repo || 'Observed work')}</h3>${project.description ? `<p>${escapeHtml(project.description)}</p>` : ''}${safeArray(project.highlights).length ? `<ul>${safeArray(project.highlights).slice(0, 2).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}</article>`).join('');
}
function printEvidence(evidence) {
  return safeArray(evidence).map((item) => {
    const url = safeUrl(item.url);
    const id = evidenceId(item);
    const label = `${item.repo || 'GitHub'} · ${item.title || item.type || 'Evidence'}`;
    return `<li>${id ? `<b>[${escapeHtml(id)}]</b> ` : ''}${url ? `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>` : escapeHtml(label)} <span>${escapeHtml(item.date || '')}</span></li>`;
  }).join('');
}
function printObservations(observations) {
  if (!safeArray(observations).length) return '';
  return `<section class="section patterns"><h2>Patterns worth noticing</h2><ul>${safeArray(observations).slice(0, 3).map((item) => `<li>${escapeHtml(item?.text || item)}</li>`).join('')}</ul></section>`;
}
function printMix(workMix) {
  const entries = Object.entries(workMix || {}).filter(([, value]) => Number(value || 0) > 0).sort((a, b) => Number(b[1]) - Number(a[1]));
  if (!entries.length) return '';
  return `<section class="section"><h2>Engineering work mix</h2><div class="mix">${entries.map(([name, value]) => `<div><span>${escapeHtml(name.replaceAll('_', ' '))}</span><strong>${Math.round(Number(value || 0))}%</strong></div>`).join('')}</div></section>`;
}
function printRepoTable(repos) {
  const rows = safeArray(repos).slice(0, 10).map((repo) => `<tr><td>${escapeHtml(repo.name)}</td><td>${escapeHtml(repo.visibility || 'public')}</td><td>${Number(repo.commits || 0)}${repo.commitsTruncated ? '+' : ''}</td><td>${Number(repo.pullRequests || 0)}${repo.pullsTruncated ? '+' : ''}</td><td>${escapeHtml(repo.language || '—')}</td></tr>`).join('');
  if (!rows) return '';
  return `<section class="section"><h2>Repository activity</h2><table><thead><tr><th>Repository</th><th>Visibility</th><th>Commits</th><th>PRs</th><th>Language</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

export function buildPrintHtml(portable) {
  const p = portable || {};
  const focus = p.mainFocus || {};
  const keyEvidence = selectKeyEvidence(p, PDF_EVIDENCE_LIMIT);
  const publicReportUrl = !p.includePrivate && p.username ? `https://getdev30.xyz/u/${encodeURIComponent(p.username)}?days=${Number(p.days || 30)}&lang=${safeLocale(p.locale)}` : '';
  const privateBadge = p.includePrivate ? '<span class="badge private">PRIVATE + PUBLIC</span>' : '<span class="badge">PUBLIC</span>';
  const pages = [];

  const pageOne = `${printHeader(p, privateBadge)}<h1>${escapeHtml(p.headline || 'Developer activity snapshot')}</h1>${p.summary ? `<p class="summary">${escapeHtml(p.summary)}</p>` : ''}${p.includePrivate ? '<div class="private-note">This report may contain information derived from private repositories. Keep the exported PDF within the intended audience.</div>' : ''}${focus.repo || focus.title ? `<section class="section"><h2>Main focus</h2><div class="focus"><div class="repo">${escapeHtml(focus.repo || 'Observed work')}</div><h3>${escapeHtml(focus.title || 'Main focus')}</h3>${focus.explanation ? `<p>${escapeHtml(focus.explanation)}</p>` : ''}${focus.significance ? `<p>${escapeHtml(focus.significance)}</p>` : ''}</div></section>` : ''}${printObservations(p.observations)}`;
  pages.push(pageOne);

  const pageTwoContent = `${safeArray(p.projects).length ? `<section class="section"><h2>Projects · top ${Math.min(PDF_PROJECT_LIMIT, p.projects.length)}${p.projects.length > PDF_PROJECT_LIMIT ? ` of ${p.projects.length}` : ''}</h2><div class="projects">${printProjects(p.projects)}</div></section>` : ''}${printMix(p.workMix)}`;
  if (pageTwoContent) pages.push(`${printHeader(p, privateBadge)}${pageTwoContent}`);

  const evidenceNote = safeArray(p.evidence).length ? `<div class="evidence-note"><strong>${safeArray(p.evidence).length} evidence items captured.</strong> PDF shows the ${keyEvidence.length} most relevant items. Full evidence stays available in Markdown and Full JSON data.${publicReportUrl ? ` <a href="${escapeHtml(publicReportUrl)}">Open the saved Dev30 report.</a>` : ''}</div>` : '';
  const pageThreeContent = `${printRepoTable(p.repos)}${keyEvidence.length ? `<section class="section compact"><h2>Key evidence · ${keyEvidence.length} of ${safeArray(p.evidence).length}</h2><ol class="evidence">${printEvidence(keyEvidence)}</ol></section>` : ''}${evidenceNote}`;
  if (pageThreeContent) pages.push(`${printHeader(p, privateBadge)}${pageThreeContent}`);

  const totalPages = pages.length;
  const renderedPages = pages.map((content, index) => `<section class="page">${content}${printFooter(p, index + 1, totalPages)}</section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(portableFilename(p, 'pdf').replace(/\.pdf$/, ''))}</title><style>
    @page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#edf3ef;color:#18261f;font-family:Arial,"Helvetica Neue",sans-serif}.screenbar{position:sticky;z-index:3;top:0;padding:9px 12px;background:#183025;color:#fff;font-size:12px;text-align:center}.screenbar button{margin-left:10px;padding:5px 9px;border:0;border-radius:4px;background:#fff;color:#183025;font-weight:700}.page{position:relative;width:210mm;min-height:297mm;margin:8mm auto;padding:14mm 15mm 17mm;background:#fff;box-shadow:0 8px 35px #12251a1f;page-break-after:always;overflow:hidden;font-size:9.5pt;line-height:1.42}.page:last-child{page-break-after:auto}.brand{display:flex;align-items:center;justify-content:space-between;padding-bottom:4mm;border-bottom:1px solid #d9e2dc}.brand strong{font-size:14pt}.eyebrow{margin-top:7mm;font:700 7.5pt/1.2 ui-monospace,monospace;letter-spacing:.11em;color:#2d7a58}.page-meta{display:flex;gap:10px;flex-wrap:wrap;margin-top:2mm;color:#718078;font-size:7.5pt}.badge{display:inline-block;padding:3px 6px;border:1px solid #b8cec0;border-radius:999px;font:700 7pt/1 ui-monospace,monospace;color:#2d7a58}.badge.private{border-color:#d9bd83;color:#8c641e}h1,h2,h3{margin:0;color:#14241b;line-height:1.12}h1{font-size:27pt;letter-spacing:-.035em;margin:8mm 0 4mm}h2{font-size:14pt;margin-bottom:3mm}h3{font-size:11pt;margin:1mm 0 2mm}p{margin:0 0 2.5mm}.summary{font-size:12.5pt;color:#405249;max-width:170mm;margin-bottom:7mm}.section{margin:0 0 7mm}.focus{padding:5mm;border:1px solid #cfe0d5;border-radius:7px;background:#f7fbf8}.focus .repo,.project .repo{font:700 7.5pt/1 ui-monospace,monospace;color:#2d7a58;margin-bottom:2mm}.private-note{padding:3mm 4mm;border-left:3px solid #b07a28;background:#fff9ed;color:#79591f;margin:0 0 6mm}.patterns ul,.project ul{margin:0;padding-left:5mm}.patterns li,.project li{margin-bottom:1.4mm}.projects{display:grid;grid-template-columns:1fr 1fr;gap:3.5mm}.project{padding:3.5mm;border:1px solid #dbe4de;border-radius:6px;break-inside:avoid}.project p{color:#475a50}.mix{display:grid;grid-template-columns:repeat(3,1fr);gap:2.5mm}.mix div{display:flex;justify-content:space-between;padding:3mm;border:1px solid #dfe8e2;border-radius:5px;background:#fafcfb;text-transform:capitalize}.mix strong{color:#2d7a58}table{width:100%;border-collapse:collapse;font-size:8.4pt}th,td{padding:1.8mm 1.4mm;border-bottom:1px solid #e1e7e3;text-align:left}th{font-size:7pt;text-transform:uppercase;letter-spacing:.04em;color:#65756c}.compact{margin-bottom:4mm}.evidence{padding-left:5mm;margin:0;font-size:8pt}.evidence li{margin-bottom:1.35mm}.evidence b{font-family:ui-monospace,monospace;color:#2d7a58}.evidence a{color:#175ea8;text-decoration:none}.evidence span{color:#7b8981;font-size:7.3pt}.evidence-note{padding:3mm 4mm;border:1px solid #d8e4dc;border-radius:6px;background:#f8fbf9;color:#52645a;font-size:8pt}.evidence-note a{color:#175ea8}.page-footer{position:absolute;left:15mm;right:15mm;bottom:8mm;display:flex;justify-content:space-between;gap:8px;padding-top:2.5mm;border-top:1px solid #e0e7e2;color:#7b8880;font-size:7pt}.page-footer span:nth-child(2){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media print{html,body{background:#fff}.screenbar{display:none}.page{margin:0;box-shadow:none;width:210mm;height:297mm;min-height:297mm}}@media(max-width:800px){.page{width:100%;min-height:auto;margin:0;padding:24px 22px}.projects,.mix{grid-template-columns:1fr}.page-footer{position:static;margin-top:24px}}
  </style></head><body><div class="screenbar">Dev30 PDF export · Print → Save as PDF. The report uses zero browser page margins to keep Chrome headers and URLs out of the artifact.<button onclick="window.print()">Print / Save PDF</button></div>${renderedPages}<script>setTimeout(()=>window.print(),350);</script></body></html>`;
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
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
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
  const socialHeadline = portableSocialHeadline(portable);
  const socialSubtitle = portableSocialSubtitle(portable);
  const repoCount = safeArray(portable.repos).length;
  const evidenceCount = safeArray(portable.evidence).length;
  const projects = safeArray(portable.projects).slice(0, 3).map((item) => item.repo || item.title).filter(Boolean);
  const strongestMix = Object.entries(portable.workMix || {}).filter(([, value]) => Number(value || 0) > 0).sort((a, b) => Number(b[1]) - Number(a[1]))[0];

  ctx.fillStyle = '#f7fbf8'; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = '#e7f0ea';
  for (let x = 0; x < 1200; x += 24) for (let y = 0; y < 630; y += 24) if ((x / 24 + y / 24) % 7 === 0) ctx.fillRect(x, y, 3, 3);
  ctx.fillStyle = '#2d7a58'; ctx.fillRect(64, 56, 16, 16); ctx.fillRect(80, 40, 16, 16); ctx.fillRect(96, 56, 16, 16); ctx.fillRect(80, 72, 16, 16);
  ctx.fillStyle = '#183025'; ctx.font = '800 30px Arial, sans-serif'; ctx.fillText('Dev30', 132, 73);
  ctx.font = '700 18px monospace'; ctx.fillStyle = '#2d7a58'; ctx.fillText(`SNAPSHOT${portable.snapshotId ? ` · ${String(portable.snapshotId).slice(0, 8)}` : ''}`, 64, 132);

  if (strongestMix) {
    const label = `${String(strongestMix[0]).replaceAll('_', ' ').toUpperCase()} ${Math.round(Number(strongestMix[1]))}%`;
    ctx.font = '700 15px monospace';
    const width = Math.max(120, ctx.measureText(label).width + 34);
    ctx.fillStyle = '#e6f2eb'; ctx.fillRect(1136 - width, 104, width, 34);
    ctx.fillStyle = '#2d7a58'; ctx.textAlign = 'center'; ctx.fillText(label, 1136 - width / 2, 127); ctx.textAlign = 'left';
  }
  if (portable.includePrivate) { ctx.fillStyle = '#fff1cc'; ctx.fillRect(970, 48, 166, 36); ctx.fillStyle = '#8b611a'; ctx.font = '700 16px monospace'; ctx.fillText('PRIVATE', 1015, 72); }

  ctx.fillStyle = '#183025'; ctx.font = '800 52px Arial, sans-serif';
  const headlineLines = wrapCanvasText(ctx, socialHeadline, 1000, 2);
  headlineLines.forEach((line, index) => ctx.fillText(line, 64, 205 + index * 60));

  ctx.fillStyle = '#607168'; ctx.font = '400 22px Arial, sans-serif';
  const subtitleLines = wrapCanvasText(ctx, socialSubtitle, 1000, 2);
  subtitleLines.forEach((line, index) => ctx.fillText(line, 64, 340 + index * 31));

  const dividerY = 420;
  ctx.fillStyle = '#d7e5dc'; ctx.fillRect(64, dividerY, 1072, 2);
  ctx.fillStyle = '#2d7a58'; ctx.font = '700 14px monospace'; ctx.fillText('MAIN_FOCUS', 64, 453);
  ctx.fillStyle = '#183025'; ctx.font = '700 27px Arial, sans-serif';
  ctx.fillText(shorten(portable.mainFocus?.repo || portable.mainFocus?.title || 'Recent GitHub work', 58), 64, 489);
  if (projects.length) {
    ctx.fillStyle = '#6b7b72'; ctx.font = '600 16px monospace';
    ctx.fillText(`PROJECTS · ${shorten(projects.join(' · '), 92)}`, 64, 523);
  }

  const footerTop = 548;
  ctx.fillStyle = '#d7e5dc'; ctx.fillRect(64, footerTop, 1072, 2);
  ctx.fillStyle = '#183025'; ctx.font = '700 16px monospace';
  ctx.fillText(`@${portable.username || 'unknown'} · ${Number(portable.days || 30)} DAYS · ${repoCount} REPOS · ${evidenceCount} EVIDENCE`, 64, 589);
  ctx.fillStyle = '#2d7a58'; ctx.font = '700 16px monospace'; ctx.textAlign = 'right'; ctx.fillText('getdev30.xyz', 1136, 589); ctx.textAlign = 'left';

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
  node.addEventListener('click', () => {
    node.closest('details')?.removeAttribute('open');
    try {
      const result = onClick();
      if (result?.then) result.catch((error) => toast(error.message || 'Export failed.', true));
    } catch (error) { toast(error.message || 'Export failed.', true); }
  });
  return node;
}

function exportMenu(portableProvider) {
  const wrap = document.createElement('div'); wrap.className = 'portable-toolbar';
  const details = document.createElement('details'); details.className = 'portable-menu';
  const summary = document.createElement('summary'); summary.textContent = 'Export';
  const panel = document.createElement('div'); panel.className = 'portable-menu-panel';
  const getPortable = () => {
    const value = portableProvider();
    if (!value) throw new Error('Run an analysis first so Dev30 has structured data to export.');
    return value;
  };
  panel.append(
    button('PDF', 'PDF report', 'Curated A4 briefing · top evidence', () => openPrintDocument(getPortable())),
    button('MD', 'Markdown', 'Developer journal + full evidence appendix', () => { const p = getPortable(); if (!confirmPrivate(p)) return; downloadText(portableToMarkdown(p), portableFilename(p, 'md'), 'text/markdown;charset=utf-8'); toast('Markdown downloaded.'); }),
    button('CPY', 'Copy as Markdown', 'Paste into Notion, Obsidian or an AI chat', async () => { const p = getPortable(); if (!confirmPrivate(p)) return; await copyText(portableToMarkdown(p)); toast('Markdown copied to clipboard.'); }),
  );
  const divider = document.createElement('div'); divider.className = 'portable-menu-divider'; panel.append(divider);
  panel.append(
    button('JSON', 'Full JSON data', 'Machine-readable snapshot + full evidence', () => { const p = getPortable(); if (!confirmPrivate(p)) return; downloadText(portableToJson(p), portableFilename(p, 'json'), 'application/json;charset=utf-8'); toast('Full JSON downloaded.'); }),
    button('PNG', 'Pixel summary card', 'Short social story · 1200×630', () => exportPixelCard(getPortable())),
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
  actions.append(exportMenu(() => currentPortable));
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
