const $=(selector)=>document.querySelector(selector);
const E=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node};
const locale=()=>$('#locale')?.value==='vi'?'vi':'en';
const T=(en,vi)=>locale()==='vi'?vi:en;

async function copyText(text){try{await navigator.clipboard.writeText(text);return true}catch{return false}}

function reportView(data,{shared=false}={}){
  const card=E('section','card client-report-card');
  card.id='client-report-panel';
  const head=E('div','client-report-head'),copy=E('div'),actions=E('div','client-report-actions');
  copy.append(
    E('div','history-kicker',data.audience==='founder'?T('Founder update','Cập nhật cho founder'):T('Client update','Cập nhật cho client')),
    E('h2','client-report-title',data.report.title),
    E('p','summary',data.report.executiveSummary),
  );
  const badge=E('span','pill',data.includePrivate?T('local-only private report','báo cáo private chỉ local'):T('public evidence report','báo cáo bằng chứng public'));
  actions.append(badge);
  if(!shared){
    const markdown=E('button','action-button',T('Copy Markdown','Sao chép Markdown'));markdown.type='button';markdown.onclick=async()=>{markdown.textContent=await copyText(data.markdown)?T('Copied Markdown','Đã sao chép Markdown'):T('Copy failed','Không sao chép được')};actions.append(markdown);
    if(data.shareable&&data.sharePath){const share=E('button','action-button secondary',T('Copy report link','Sao chép link report'));share.type='button';share.onclick=async()=>{const url=new URL(data.sharePath,location.origin).href;share.textContent=await copyText(url)?T('Copied link','Đã sao chép link'):T('Copy failed','Không sao chép được')};actions.append(share)}
  }
  head.append(copy,actions);card.append(head);

  const grid=E('div','client-report-grid');
  const shipped=E('div','client-report-section');shipped.append(E('h3','',T('What shipped','Đã thực hiện')));const shippedList=E('div','client-report-list');
  (data.report.shipped||[]).forEach(item=>{const row=E('div','client-report-item');row.append(E('strong','',item.repo||T('Project','Dự án')),E('span','',item.text));shippedList.append(row)});if(!shippedList.childNodes.length)shippedList.append(E('p','muted',T('No sufficiently clear work units were available.','Chưa có work-unit đủ rõ để liệt kê.')));shipped.append(shippedList);
  const changed=E('div','client-report-section');changed.append(E('h3','',T('Since the previous report','Từ báo cáo trước')));const changedList=E('div','client-report-list');
  (data.report.changedSinceLast||[]).forEach(item=>{const row=E('div','client-report-item');if(item.repo)row.append(E('strong','',item.repo));row.append(E('span','',item.text));changedList.append(row)});if(!changedList.childNodes.length)changedList.append(E('p','muted',T('No previous snapshot or no meaningful change observed yet.','Chưa có snapshot trước hoặc chưa có thay đổi đáng kể.')));changed.append(changedList);grid.append(shipped,changed);card.append(grid);

  const direction=E('div','client-report-direction');direction.append(E('span','history-kicker',T('Current direction','Hướng hiện tại')),E('p','',data.report.currentDirection),E('small','window-note',data.report.note));card.append(direction);
  if(data.evidence?.length){const details=E('details','evidence-details'),summary=E('summary','evidence-summary',T(`Show ${data.evidence.length} supporting sources`,`Xem ${data.evidence.length} nguồn hỗ trợ`)),list=E('div','evidence-list');data.evidence.forEach(item=>{const a=E('a','evidence');a.href=item.url;a.target='_blank';a.rel='noreferrer';const title=E('span','evidence-title');title.append(E('strong','',item.title),E('small','',`${item.repo} · ${item.date}${item.visibility==='private'?' · private':''}`));a.append(E('span','evidence-id',item.id),title);list.append(a)});details.append(summary,list);card.append(details)}
  return card;
}

function isPrivateAnalysis(){return [...document.querySelectorAll('.profile-actions .pill')].some((node)=>node.textContent.trim()==='private opt-in')}

async function latestSnapshotId(){
  const username=$('#username')?.value.trim();if(!username)return null;
  const days=$('#days')?.value||'30',lang=locale(),includePrivate=isPrivateAnalysis();
  const url=new URL('/api/history',location.origin);url.searchParams.set('username',username);url.searchParams.set('days',days);url.searchParams.set('locale',lang);url.searchParams.set('includePrivate',String(includePrivate));
  const response=await fetch(url,{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'History lookup failed.');return data.entries?.[0]?.id||null;
}

async function generateClientReport(audience,button){
  button.disabled=true;const original=button.textContent;button.textContent=T('Generating update…','Đang tạo cập nhật…');
  try{
    const snapshotId=await latestSnapshotId();if(!snapshotId)throw new Error(T('Analyze first to create a snapshot.','Hãy Analyze trước để tạo snapshot.'));
    const response=await fetch('/api/client-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({snapshotId,audience})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Client report failed.');
    $('#client-report-panel')?.remove();const panel=reportView(data);const history=$('.history-card');if(history)history.insertAdjacentElement('afterend',panel);else $('#report')?.prepend(panel);panel.scrollIntoView({behavior:'smooth',block:'start'});
    button.textContent=T('Update generated','Đã tạo cập nhật');
  }catch(error){button.textContent=original;alert(error.message)}finally{button.disabled=false}
}

function attachGenerator(){
  if(location.pathname.startsWith('/r/'))return;
  const historyHead=$('.history-head');if(!historyHead||historyHead.querySelector('.client-report-generator'))return;
  const sevenDays=$('#days')?.value==='7';
  const controls=E('div','client-report-generator'),select=E('select','client-report-select'),client=E('option','',T('Client update','Cập nhật client')),founder=E('option','',T('Founder update','Cập nhật founder')),button=E('button','action-button',sevenDays?T('Generate weekly update','Tạo cập nhật tuần'):T('Generate stakeholder update','Tạo cập nhật stakeholder'));
  client.value='client';founder.value='founder';select.append(client,founder);button.type='button';button.onclick=()=>generateClientReport(select.value,button);controls.append(select,button);historyHead.append(controls);
}

async function renderSharedRoute(){
  const match=location.pathname.match(/^\/r\/([0-9a-f-]+)\/?$/i);if(!match)return false;
  $('.hero')?.classList.add('hidden');$('.value-strip')?.classList.add('hidden');$('#status')?.classList.add('hidden');
  const root=$('#report');root?.classList.remove('hidden');if(root)root.replaceChildren(E('div','status',T('Loading report…','Đang tải report…')));
  try{
    const response=await fetch(`/api/client-report/${match[1]}`,{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Report unavailable.');
    if(data.locale==='vi'&&$('#locale'))$('#locale').value='vi';
    if(root){root.replaceChildren();const intro=E('div','shared-report-intro');intro.append(E('span','eyebrow','Dev30 client report'),E('p','muted',`@${data.username} · ${data.days} ${data.locale==='vi'?'ngày':'days'} · ${new Date(data.createdAt).toLocaleString()}`));root.append(intro,reportView(data,{shared:true}))}
    document.title=`${data.report.title} — Dev30`;
  }catch(error){if(root)root.replaceChildren(E('div','status error',error.message))}
  return true;
}

if(!(await renderSharedRoute())){
  const observer=new MutationObserver(()=>attachGenerator());const root=$('#report');if(root)observer.observe(root,{childList:true,subtree:true});attachGenerator();
}
