const $ = id => document.getElementById(id);
const statusText = {imported:'นำเข้าข้อมูลเดิม — ไม่แจ้ง LINE',pending:'รอส่ง / รอส่งซ้ำ',sending:'กำลังส่ง',simulated:'จำลองแล้ว — ไม่ได้ส่ง LINE',accepted:'LINE รับคำขอแล้ว',review:'ต้องตรวจสอบการส่ง'};
let endpoint='',token='',state=null,rows=[],offset=0,revision=null,pendingKey=null,epoch=0;
let connectionLost=false, checkingConnection=false;
const isLocalPage=['localhost','127.0.0.1'].includes(location.hostname);
const suppliedBackend=new URLSearchParams(location.search).get('backend');
let savedBackend='';try{savedBackend=localStorage.getItem('section-backend')||'';}catch{}
$('endpoint').value=isLocalPage?'':(suppliedBackend||savedBackend);
if(suppliedBackend){try{const candidate=new URL(suppliedBackend);if(candidate.protocol!=='https:'||candidate.username||candidate.password||candidate.pathname!=='/'||candidate.search||candidate.hash)throw new Error();$('endpoint').value=candidate.origin;}catch{$('endpoint').value='';}}

function message(text,error=false){$('message').textContent=text;$('message').className=error?'error':'';}
function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
async function api(path,options={}){
  const response=await fetch(endpoint+path,{cache:'no-store',credentials:'omit',...options,headers:{...(token?{Authorization:'Bearer '+token}:{}),...options.headers}});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(typeof data.detail==='string'?data.detail:`ไม่สำเร็จ (HTTP ${response.status})`);}
  return response;
}
async function json(path,options){return (await api(path,options)).json();}
function tab(id){document.querySelectorAll('.tab').forEach(n=>n.hidden=n.id!==id);document.querySelectorAll('[data-tab]').forEach(n=>n.classList.toggle('active',n.dataset.tab===id));}
function options(select,items,first){select.replaceChildren();if(first)select.add(new Option(first,0));for(const s of items)select.add(new Option(s.name,s.id));}
async function loadState(){
  state=await json('/api/state');$('who').textContent=state.user.username+' • '+state.user.role;
  $('mode').textContent=state.line_mode==='mock'?'โหมดจำลอง LINE • ทุก Section → กลุ่มกลาง':'LINE จริง • ทุก Section → กลุ่มกลาง';
  $('admin-tab').hidden=state.user.role!=='admin';
  options($('filter'),state.sections,'ทุก Section');
  const own=state.sections.filter(s=>s.owner_id===state.user.id);options($('section'),own);options($('import-section'),own);
  $('submit-button').disabled=!own.length;$('submit-hint').textContent=own.length?'ส่งไฟล์ได้เฉพาะ Section ที่คุณรับผิดชอบ':'บัญชีนี้ไม่มี Section สำหรับ Submit';
  $('sections-list').replaceChildren(...state.sections.map(s=>el('p',s.name+' — '+s.owner)));
}
async function download(id,filename){
  try{const response=await api(`/api/versions/${id}/download`);const url=URL.createObjectURL(await response.blob());const a=el('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){message(e.message,true);}
}
function button(text,handler){const b=el('button',text,'secondary');b.type='button';b.onclick=()=>Promise.resolve(handler()).catch(e=>message(e.message,true));return b;}
async function search(append=false){
  const current=epoch;if(!append){offset=0;rows=[];$('results').replaceChildren();}
  const data=await json(`/api/documents?q=${encodeURIComponent($('query').value)}&section_id=${$('filter').value||0}&offset=${offset}&folder=${encodeURIComponent($('folder-filter').value)}`);
  if(current!==epoch)return;
  rows.push(...data.items);offset+=data.items.length;$('count').textContent=`พบ ${data.total} รายการ • แสดง ${offset}`;$('more').hidden=offset>=data.total;
  for(const d of data.items){const card=el('article',undefined,'card');card.append(el('h3',d.filename),el('div',`${d.section} › ${d.folder_path||'โฟลเดอร์หลัก'} • ${d.topic} • ${d.title} • เวอร์ชัน ${d.version}`,'meta'),el('span',statusText[d.notification]||d.notification,'badge'));const actions=el('div',undefined,'actions');actions.append(button('ดาวน์โหลด',()=>download(d.version_id,d.filename)),button('ประวัติ',()=>history(d.id)));if(d.owner_id===state.user.id)actions.append(button('ส่งฉบับแก้ไข',()=>edit(d.id)));card.append(actions);$('results').append(card);}
}
async function history(id){const data=await json(`/api/documents/${id}`);$('history').hidden=false;$('history-title').textContent=data.document.title+' • ประวัติเวอร์ชัน';$('versions').replaceChildren();for(const v of data.versions){const card=el('article',undefined,'card');card.append(el('h3',`v${v.version} — ${v.filename}`),el('p',v.note),el('div',`${v.username} • ${new Date(v.created*1000).toLocaleString('th-TH')} • ${statusText[v.status]}`,'meta'),button('ดาวน์โหลดเวอร์ชันนี้',()=>download(v.id,v.filename)));$('versions').append(card);}tab('files');$('history').scrollIntoView({behavior:'smooth'});}
function resetUpload(){revision=null;pendingKey=null;$('upload').reset();$('document').replaceChildren(new Option('สร้างรายการใหม่',0));$('topic').readOnly=false;$('title').readOnly=false;$('section').disabled=false;$('upload-folder').readOnly=false;}
async function edit(id){const data=await json(`/api/documents/${id}`);resetUpload();revision={id,version:data.versions[0].version};$('upload-folder').value=data.document.folder_path||'';$('upload-folder').readOnly=true;$('section').value=data.document.section_id;$('section').disabled=true;$('document').add(new Option(data.document.title+' • ฉบับแก้ไข',id));$('document').value=id;$('topic').value=data.document.topic;$('title').value=data.document.title;$('topic').readOnly=true;$('title').readOnly=true;tab('submit');message('เลือกไฟล์ฉบับใหม่และระบุรายละเอียดการเปลี่ยนแปลง');}
$('document').onchange=()=>{if($('document').value==='0')resetUpload();};
$('upload').addEventListener('input',()=>{pendingKey=null;});
$('upload').onsubmit=async event=>{
  event.preventDefault();const file=$('file').files[0];if(!file||!file.size||file.size>25*1024*1024){message('เลือกไฟล์ที่มีข้อมูลและไม่เกิน 25 MB',true);return;}
  const params=new URLSearchParams({section_id:$('section').value,folder_path:$('upload-folder').value,topic:$('topic').value,title:$('title').value,filename:file.name,note:$('note').value,document_id:revision?.id||0,expected_version:revision?.version||0});
  pendingKey=pendingKey||crypto.randomUUID();const key=pendingKey;const current=epoch;
  $('submit-button').disabled=true;message('กำลังบันทึกไฟล์…');
  try{const data=await json('/api/submit?'+params,{method:'POST',body:file,headers:{'Content-Type':'application/octet-stream','X-Submit-Key':key}});if(current!==epoch)return;message(`บันทึกเวอร์ชัน ${data.version} สำเร็จ${data.replayed?' (รายการเดิม ไม่ได้สร้างซ้ำ)':''} • ดูสถานะแจ้งเตือนได้ที่ประวัติแจ้งเตือน`);resetUpload();await loadFolders();await search();await notifications();tab('files');}
  catch(e){if(current===epoch)message(e.message+' • หากการเชื่อมต่อขาดหาย กดส่งซ้ำโดยไม่เปลี่ยนข้อมูลได้',true);}
  finally{if(current===epoch)$('submit-button').disabled=false;}
};
async function notifications(){const items=await json('/api/notifications');$('notifications-list').replaceChildren();for(const item of items){const card=el('article',undefined,'card');card.append(el('span',statusText[item.status]||item.status,'badge'),el('pre',item.message),el('div',`พยายามส่ง ${item.attempts} ครั้ง${item.error?' • '+item.error:''}`,'meta'));if(state.user.role==='admin'&&item.status==='review'&&item.mode==='live')card.append(button('ลองส่งอีกครั้งหลังแก้สาเหตุ',async()=>{await json(`/api/notifications/${item.id}/retry`,{method:'POST'});await notifications();}));$('notifications-list').append(card);}if(!items.length)$('notifications-list').append(el('p','ยังไม่มีการ Submit'))}
$('login').onsubmit=async event=>{event.preventDefault();$('login-button').disabled=true;try{const raw=$('endpoint').value.trim();if(!raw&&!isLocalPage)throw new Error('กดเปิดเว็บจาก Control Dashboard เพื่อเติม Backend อัตโนมัติ หรือใส่ HTTPS URL ของ Backend');const url=new URL(raw||location.origin);if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('กรอกเฉพาะที่อยู่เซิร์ฟเวอร์ ไม่ใส่ path');if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('เซิร์ฟเวอร์ออนไลน์ต้องใช้ HTTPS');endpoint=url.origin;const result=await json('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('username').value,password:$('password').value})});token=result.token;try{localStorage.setItem('section-backend',endpoint);}catch{}connectionLost=false;epoch++;$('password').value='';await loadState();$('login-panel').hidden=true;$('workspace').hidden=false;await loadFolders();await search();tab('files');message('เข้าสู่ระบบแล้ว');const match=location.hash.match(/^#document=(\d+)$/);if(match)await history(Number(match[1]));}catch(e){message(e.message,true);}finally{$('login-button').disabled=false;}};
$('logout').onclick=async()=>{try{await api('/api/logout',{method:'POST'});}catch{}epoch++;token='';state=null;rows=[];resetUpload();$('results').replaceChildren();$('versions').replaceChildren();$('history').hidden=true;$('notifications-list').replaceChildren();$('workspace').hidden=true;$('login-panel').hidden=false;$('who').textContent='Company workspace';message('ออกจากระบบแล้ว');};
$('add-section').onsubmit=async event=>{event.preventDefault();const b=event.submitter;b.disabled=true;try{await json('/api/sections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('section-name').value,username:$('owner-name').value,password:$('owner-password').value})});$('add-section').reset();await loadState();message('สร้าง Section และผู้รับผิดชอบแล้ว');}catch(e){message(e.message,true);}finally{b.disabled=false;}};
$('search').onsubmit=event=>{event.preventDefault();search().catch(e=>message(e.message,true));};$('more').onclick=()=>search(true).catch(e=>message(e.message,true));
$('refresh').onclick=async()=>{try{await loadFolders();await search();await notifications();message('อัปเดตข้อมูลแล้ว');}catch(e){message(e.message,true);}};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab(b.dataset.tab);if(b.dataset.tab==='notifications')notifications().catch(e=>message(e.message,true));});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

async function checkConnection(){
  if(!endpoint||checkingConnection)return;
  checkingConnection=true;
  try{
    const response=await fetch(endpoint+'/api/health',{cache:'no-store',signal:AbortSignal.timeout(5000)});
    const health=await response.json();if(!response.ok||health.service!=='section-files')throw new Error();
    $('connection-status').textContent='● เชื่อมต่อ Backend แล้ว';
    const recovered=connectionLost;connectionLost=false;
    if(recovered&&token&&state){await search();await notifications();message('เชื่อมต่อกลับแล้ว บัญชียังใช้งานต่อได้');}
  }catch{
    connectionLost=true;$('connection-status').textContent='● การเชื่อมต่อขาด กำลังตรวจซ้ำอัตโนมัติ • ถ้า Tunnel เปลี่ยน URL ให้เปิดเว็บจาก Control Dashboard อีกครั้ง';
  }finally{checkingConnection=false;}
}
setInterval(checkConnection,10000);
window.addEventListener('online',checkConnection);

async function loadFolders(){const paths=await json('/api/folders?section_id='+($('filter').value||0));const old=$('folder-filter').value;$('folder-filter').replaceChildren(new Option('ทุกโฟลเดอร์',''));for(const p of paths)$('folder-filter').add(new Option(p,p));if(paths.includes(old))$('folder-filter').value=old;}
$('filter').onchange=async()=>{try{await loadFolders();await search();}catch(e){message(e.message,true);}};
let importFiles=[];
$('folder-picker').onchange=()=>{
 importFiles=Array.from($('folder-picker').files);
 $('import-summary').textContent=`เลือก ${importFiles.length} ไฟล์ • ${(importFiles.reduce((n,f)=>n+f.size,0)/1048576).toFixed(1)} MB • แต่ละไฟล์ต้องมีข้อมูลและไม่เกิน 25 MB`;
 $('import-preview').textContent=importFiles.map(f=>f.webkitRelativePath+' ('+f.size+' bytes)').join('\n');
 $('import-start').disabled=!importFiles.length||!$('import-section').value;
};
$('import-start').onclick=async()=>{
 const files=[...importFiles],sid=$('import-section').value;
 if(!sid||!files.length)return;
 $('import-start').disabled=true;$('folder-picker').disabled=true;$('import-section').disabled=true;$('logout').disabled=true;
 let added=0,skipped=0,failed=0;const errors=[];
 try{for(let i=0;i<files.length;i++){
  const f=files[i];$('import-progress').textContent=`กำลังนำเข้า ${i+1}/${files.length}: ${f.webkitRelativePath}`;
  try{
   if(!f.size||f.size>25*1048576)throw new Error('ไฟล์ว่างหรือเกิน 25 MB');
   const path=f.webkitRelativePath.split('/');path.pop();
   const params=new URLSearchParams({section_id:sid,folder_path:path.join('/'),topic:'ข้อมูลเดิม',title:f.name.slice(0,160),filename:f.name,note:'นำเข้าข้อมูลเดิมจากโฟลเดอร์',initial_import:'true'});
   const result=await json('/api/submit?'+params,{method:'POST',body:f,headers:{'Content-Type':'application/octet-stream','X-Submit-Key':crypto.randomUUID()}});
   if(result.skipped)skipped++;else added++;
  }catch(e){failed++;errors.push(f.webkitRelativePath+': '+e.message);}
 }
 $('import-progress').textContent=`เสร็จแล้ว: เพิ่ม ${added} • ข้ามไฟล์เดิม ${skipped} • ไม่สำเร็จ ${failed} — ไม่มีการแจ้ง LINE`;
 $('import-errors').textContent=errors.join('\n');
 await loadFolders();$('query').value='';await search();
 }catch(e){message(e.message,true);}finally{$('import-start').disabled=false;$('folder-picker').disabled=false;$('import-section').disabled=false;$('logout').disabled=false;}
};
