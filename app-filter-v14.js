const $ = id => document.getElementById(id);
const statusText = {imported:'นำเข้าข้อมูลเดิม — ไม่แจ้ง LINE',pending:'รอส่ง / รอส่งซ้ำ',sending:'กำลังส่ง',simulated:'จำลองแล้ว — ไม่ได้ส่ง LINE',accepted:'LINE รับคำขอแล้ว',review:'ต้องตรวจสอบการส่ง'};
let endpoint='',token='',state=null,rows=[],offset=0,revision=null,pendingKey=null,epoch=0;
let connectionLost=false, checkingConnection=false;
const isLocalPage=['localhost','127.0.0.1'].includes(location.hostname);
const suppliedBackend=new URLSearchParams(location.search).get('backend');
let savedBackend='';try{savedBackend=localStorage.getItem('section-backend')||'';}catch{}
let resolvedBackend=isLocalPage?'':(suppliedBackend||savedBackend);
if(suppliedBackend){try{const candidate=new URL(suppliedBackend);if(candidate.protocol!=='https:'||candidate.username||candidate.password||candidate.pathname!=='/'||candidate.search||candidate.hash)throw new Error();resolvedBackend=candidate.origin;}catch{resolvedBackend=savedBackend||'';}}

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
  $('demo-note').hidden=true;$('logout').hidden=false;$('refresh').hidden=state.user.role==='reader';$('connection-status').hidden=state.user.role==='reader';$('mode').hidden=state.user.role==='reader';document.querySelector('nav').hidden=state.user.role==='reader';$('files-title').hidden=state.user.role==='reader';
  $('delete-all-history').hidden=state.user.role!=='admin';$('admin-tab').hidden=state.user.role!=='admin';$('users-tab').hidden=state.user.role!=='admin';$('external-tab').hidden=state.user.role!=='admin';$('audit-tab').hidden=state.user.role!=='admin';document.querySelector('[data-tab=submit]').hidden=state.user.role!=='specialist';document.querySelector('[data-tab=notifications]').hidden=state.user.role==='reader';if(state.user.role==='admin')await loadReaders();

  const own=state.sections.filter(s=>s.owner_id===state.user.id);options($('section'),own);options($('root-section'),state.sections.filter(s=>!s.owner.startsWith('system-')));document.querySelector('[data-tab=import]').hidden=state.user.role!=='admin';await showRoots();
  $('submit-button').disabled=!own.length;$('submit-hint').textContent=own.length?'ส่งไฟล์ได้เฉพาะ Section ที่คุณรับผิดชอบ':'บัญชีนี้ไม่มี Section สำหรับ Submit';
  $('sections-list').replaceChildren(...state.sections.map(s=>el('p',s.name+' — '+s.owner)));
}
async function download(id,filename){
  try{const response=await api(`/api/versions/${id}/download`);const url=URL.createObjectURL(await response.blob());const a=el('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){message(e.message,true);}
}
function button(text,handler){const b=el('button',text,'secondary');b.type='button';b.onclick=()=>Promise.resolve(handler()).catch(e=>message(e.message,true));return b;}
async function search(append=false){
  const current=epoch;if(!append){offset=0;rows=[];$('results').replaceChildren();}
  const data=await json(`/api/documents?q=${encodeURIComponent($('query').value)}&category=${encodeURIComponent($('filter').value||'all')}&offset=${offset}&folder=${encodeURIComponent($('folder-filter').value)}`);
  if(current!==epoch)return;
  rows.push(...data.items);offset+=data.items.length;$('count').textContent=`พบ ${data.total} รายการ • แสดง ${offset}`;$('more').hidden=offset>=data.total;
  for(const d of data.items){const card=el('article',undefined,'card');card.append(el('h3',d.filename),el('div',`${d.section} › ${d.folder_path||'โฟลเดอร์หลัก'} • ${d.topic} • ${d.title} • เวอร์ชัน ${d.version}`,'meta'),el('span',statusText[d.notification]||d.notification,'badge'));const actions=el('div',undefined,'actions');actions.append(button('ดาวน์โหลด',()=>download(d.version_id,d.filename)));if(state.user.role==='admin'||d.owner_id===state.user.id)actions.append(button('ประวัติ',()=>history(d.id)));if(d.owner_id===state.user.id)actions.append(button('ส่งฉบับแก้ไข',()=>edit(d.id)));if(state.user.role==='admin')actions.append(button('ย้ายไฟล์ / หมวด',()=>moveDocument(d)));card.append(actions);$('results').append(card);}
}
async function history(id){const data=await json(`/api/documents/${id}`);$('history').hidden=false;$('delete-document-history').hidden=state.user.role!=='admin';$('delete-document-history').onclick=()=>deleteHistory(id,0);$('history-title').textContent=data.document.title+' • ประวัติเวอร์ชัน';$('versions').replaceChildren();for(const v of data.versions){const card=el('article',undefined,'card');card.append(el('h3',`v${v.version} — ${v.filename}`),el('p',v.note),el('div',`${v.username} • ${new Date(v.created*1000).toLocaleString('th-TH')} • ${statusText[v.status]}`,'meta'),button('ดาวน์โหลดเวอร์ชันนี้',()=>download(v.id,v.filename)));if(state.user.role==='admin'&&v.version!==data.versions[0].version)card.append(button('ลบประวัติเวอร์ชันนี้',()=>deleteHistory(id,v.id)));$('versions').append(card);}tab('files');$('history').scrollIntoView({behavior:'smooth'});}
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
async function notifications(){if(state?.user.role==='reader')return;const items=await json('/api/notifications');$('notifications-list').replaceChildren();for(const item of items){const card=el('article',undefined,'card');card.append(el('span',statusText[item.status]||item.status,'badge'),el('pre',item.message),el('div',`พยายามส่ง ${item.attempts} ครั้ง${item.error?' • '+item.error:''}`,'meta'));if(state.user.role==='admin'&&item.status==='review'&&item.mode==='live')card.append(button('ลองส่งอีกครั้งหลังแก้สาเหตุ',async()=>{await json(`/api/notifications/${item.id}/retry`,{method:'POST'});await notifications();}));$('notifications-list').append(card);}if(!items.length)$('notifications-list').append(el('p','ยังไม่มีการ Submit'))}
$('login').onsubmit=async event=>{event.preventDefault();$('login-button').disabled=true;try{if(!resolvedBackend&&!isLocalPage)throw new Error('กดเปิดเว็บจาก Control Dashboard เพื่อเชื่อมต่อ Backend');endpoint=new URL(resolvedBackend||location.origin).origin;const result=await json('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('username').value,password:$('password').value})});token=result.token;try{localStorage.setItem('section-backend',endpoint);}catch{}connectionLost=false;epoch++;$('password').value='';await loadState();$('login-panel').hidden=true;$('workspace').hidden=false;await loadFolders();await search();tab('files');message('เข้าสู่ระบบแล้ว');const match=location.hash.match(/^#document=(\d+)$/);if(match)await history(Number(match[1]));}catch(e){message(e.message,true);}finally{$('login-button').disabled=false;}};
$('logout').onclick=async()=>{try{await api('/api/logout',{method:'POST'});}catch{}epoch++;token='';state=null;rows=[];resetUpload();$('results').replaceChildren();$('versions').replaceChildren();$('history').hidden=true;$('notifications-list').replaceChildren();$('workspace').hidden=true;$('login-panel').hidden=false;$('who').textContent='Company workspace';$('demo-note').hidden=false;$('logout').hidden=true;$('refresh').hidden=true;$('connection-status').hidden=true;$('connection-status').textContent='';$('mode').hidden=true;message('ออกจากระบบแล้ว');};
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

async function loadFolders(){const paths=await json('/api/folders?category='+encodeURIComponent($('filter').value||'all'));const old=$('folder-filter').value;$('folder-filter').replaceChildren(new Option('ทุกโฟลเดอร์',''));for(const p of paths)$('folder-filter').add(new Option(p,p));if(paths.includes(old))$('folder-filter').value=old;}
$('filter').onchange=async()=>{try{await loadFolders();await search();}catch(e){message(e.message,true);}};

async function showRoots(){const rs=await json('/api/roots');$('root-list').replaceChildren(...rs.map(r=>el('p',(state.sections.find(s=>s.id===r.section_id)?.name||r.section_id)+' → sample-files/'+r.path)));}
$('bind-root').onclick=async()=>{try{await json('/api/roots',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({section_id:Number($('root-section').value),path:$('root-path').value.trim()})});await showRoots();$('root-status').textContent='ผูกแล้ว กดสแกนไฟล์ได้เลย';}catch(e){$('root-status').textContent=e.message;}};
$('scan-root').onclick=async()=>{const b=$('scan-root');b.disabled=true;$('auto-status').textContent='scanning 0%';$('root-status').textContent='';try{const r=await json('/api/scan?section_id='+$('root-section').value,{method:'POST'});$('auto-status').textContent='scanning 100%';await loadFolders();await search();}catch(e){$('root-status').textContent=e.message;}finally{b.disabled=false;}};

let autoFinished=null,autoChecking=false;
async function updateAutoScan(){
 if(!token||!state||autoChecking)return;autoChecking=true;
 try{const result=await json('/api/scan-status');
  $('auto-status').textContent='scanning '+(result.percent||0)+'%';
  if(result.last_finished&&result.last_finished!==autoFinished){autoFinished=result.last_finished;await loadFolders();if(!$('files').hidden)await search();}
 }catch{}finally{autoChecking=false;}
}
setInterval(updateAutoScan,1000);

let allAccounts=[],rootMappings=[];
async function loadReaders(){allAccounts=await json('/api/admin/accounts');$('readers-list').replaceChildren();for(const u of allAccounts){const row=el('article',undefined,'card');const actions=el('div',undefined,'actions');const editor=el('div');editor.hidden=true;actions.append(button('แก้ชื่อ / เปิดปิด',()=>{editor.hidden=false;editor.scrollIntoView({behavior:'smooth',block:'center'});}));const edit=document.createElement('form');edit.innerHTML='<h3>แก้ไข '+u.username+'</h3><label>ชื่อผู้ใช้<input name="username" required pattern="[A-Za-z0-9_.-]{3,40}"></label><label><input name="active" type="checkbox"> เปิดใช้งาน</label><button>บันทึกบัญชี</button> <button type="button" class="secondary">ยกเลิก</button>';edit.elements.username.value=u.username;edit.elements.active.checked=!!u.active;edit.querySelector('[type=button]').onclick=()=>editor.hidden=true;edit.onsubmit=async e=>{e.preventDefault();if(!confirm('บันทึกการเปลี่ยนบัญชี '+u.username+'? บัญชีนี้จะต้องเข้าสู่ระบบใหม่'))return;const result=await json('/api/admin/accounts/'+u.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:edit.elements.username.value,active:edit.elements.active.checked})});if(result.sign_in_again){location.reload();return;}await loadReaders();message('บันทึกบัญชีแล้ว');};const password=document.createElement('form');password.hidden=true;password.innerHTML='<h3>Admin ตั้งรหัสใหม่ให้ '+u.username+'</h3><label>รหัสใหม่<input name="password" type="password" required maxlength="200" autocomplete="new-password"></label><button>บันทึกรหัสใหม่</button> <button type="button" class="secondary">ยกเลิก</button>';password.querySelector('[type=button]').onclick=()=>password.hidden=true;password.onsubmit=async e=>{e.preventDefault();if(!confirm('ตั้งรหัสใหม่ให้ '+u.username+'? รหัสเดิมจะใช้ไม่ได้ทันที'))return;const result=await json('/api/admin/accounts/'+u.id+'/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:password.elements.password.value})});if(result.sign_in_again){location.reload();return;}message('Admin ตั้งรหัสใหม่ให้ '+u.username+' แล้ว ผู้ใช้ใช้รหัสนี้ Login ได้ทันที');password.reset();password.hidden=true;};actions.append(button('ตั้งรหัสใหม่',()=>{password.hidden=false;password.scrollIntoView({behavior:'smooth',block:'center'});}));editor.append(edit);row.append(el('h3',u.username+' • '+u.role),el('p',(u.active?'เปิดใช้งาน':'ปิดใช้งาน')+(u.section?' • '+u.section:'')),actions,editor,password);$('readers-list').append(row);}const sections=state.sections.filter(s=>!s.owner.startsWith('system-'));options($('transfer-section-id'),sections);options($('remap-section'),sections);$('transfer-owner').replaceChildren(...allAccounts.filter(u=>u.active&&u.role!=='admin').map(u=>new Option(u.username,u.id)));selectTransfer();rootMappings=await json('/api/roots');}
function selectTransfer(){const s=state.sections.find(s=>s.id===Number($('transfer-section-id').value));if(s){$('transfer-name').value=s.name;$('transfer-owner').value=s.owner_id;}}
$('transfer-section-id').onchange=selectTransfer;
$('create-reader').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await json('/api/admin/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('reader-name').value,password:$('reader-password').value,role:$('new-account-role').value})});$('create-reader').reset();await loadReaders();message('สร้างบัญชีแล้ว ผู้ใช้ใช้รหัสที่ Admin กำหนด Login ได้ทันที');}catch(e){message(e.message,true);}finally{b.disabled=false;}};

async function deleteHistory(documentId=0,versionId=0){try{const p=await json(`/api/history-delete-preview?document_id=${documentId}&version_id=${versionId}`);if(!p.count){message('ไม่มีประวัติฉบับเก่าสำหรับลบ');return;}if(!confirm(`ลบประวัติ ${p.count} เวอร์ชัน${documentId?' ของไฟล์นี้':' ทั้งระบบ'} ถาวร พร้อมสำเนาฉบับเก่าและรายการแจ้งเตือนที่เกี่ยวข้อง? ไฟล์ฉบับล่าสุดยังอยู่ การลบย้อนคืนไม่ได้`))return;const result=await json('/api/history-delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({document_id:documentId,version_id:versionId,confirmation:p.confirmation})});message('ลบประวัติแล้ว '+result.deleted+' เวอร์ชัน'+(result.cleanup_errors?.length?' • สำเนาบางไฟล์ลบไม่ได้: '+result.cleanup_errors.join(', '):''));if(documentId)await history(documentId);else $('history').hidden=true;await search();}catch(e){message(e.message,true);}}
$('delete-all-history').onclick=()=>deleteHistory();

$('transfer-section').onsubmit=async e=>{e.preventDefault();const sid=Number($('transfer-section-id').value),s=state.sections.find(s=>s.id===sid);if(!s||!confirm('ยืนยันเปลี่ยน Section / ผู้รับผิดชอบ โดยคงไฟล์และประวัติไว้?'))return;try{await json('/api/admin/sections/'+sid,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('transfer-name').value,owner_id:Number($('transfer-owner').value),expected_owner_id:s.owner_id})});await loadState();message('บันทึก Section แล้ว');}catch(e){message(e.message,true);}};
$('remap-root').onsubmit=async e=>{e.preventDefault();const sid=Number($('remap-section').value),old=rootMappings.find(r=>r.section_id===sid)?.path||'';if(!confirm('เปลี่ยนการผูกจาก '+(old||'ยังไม่ผูก')+' เป็น '+($('remap-path').value||'ไม่ผูก')+'? ไฟล์จะถูกจัด Section ใหม่ตามตำแหน่งจริง'))return;try{await json('/api/admin/roots/'+sid,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:$('remap-path').value,expected_path:old})});rootMappings=await json('/api/roots');await showRoots();await loadFolders();await search();message('จัดหมวดใหม่แล้ว');}catch(e){message(e.message,true);}};
async function repairFile(d,action,path=''){const note=prompt('รายละเอียดการเปลี่ยนแปลง / เหตุผล');if(!note)return;if(!confirm('ยืนยัน '+action+' สำหรับ '+d.path+'?'))return;await json('/api/admin/documents/'+d.document_id+'/repair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,path,expected_version:d.version,sha256:d.sha256||'',note})});await loadExternal();await search();}
async function loadExternal(){const rows=await json('/api/admin/external');$('external-list').replaceChildren();if(!rows.length)$('external-list').append(el('p','ไม่พบไฟล์ที่เปลี่ยนหรือหาย'));for(const d of rows){const card=el('article',undefined,'card');card.append(el('h3',d.path),el('p',d.kind==='changed'?'เนื้อหาเปลี่ยนจากภายนอก':d.kind==='missing'?'ไม่พบตำแหน่งเดิม':d.error));if(d.kind==='changed')card.append(button('ยืนยันเนื้อหาปัจจุบันเป็นเวอร์ชันใหม่',()=>repairFile(d,'accept_change')));if(d.kind==='missing'){card.append(button('รับทราบว่าลบแล้ว / ซ่อนจากค้นหา',()=>repairFile(d,'acknowledge_missing')),button('ระบุตำแหน่งใหม่ (ไฟล์ถูกย้าย)',()=>{const p=prompt('ตำแหน่งใหม่ภายใน sample-files',d.suggestions?.[0]?.path||'');if(p)return repairFile(d,'relink',p);}));if(d.suggestions?.length)card.append(el('p','พบเนื้อหาเหมือนกัน: '+d.suggestions.map(s=>s.path).join(', ')));}$('external-list').append(card);}}
$('external-refresh').onclick=()=>loadExternal().catch(e=>message(e.message,true));
async function moveDocument(d){const path=prompt('ตำแหน่งปลายทางภายใน sample-files รวมชื่อไฟล์ เช่น Engineering/project 2/'+d.filename);if(path)await repairFile({document_id:d.id,version:d.version,path:d.filename},'move',path);}
$('audit-refresh').onclick=async()=>{try{const rows=await json('/api/admin/audit');$('audit-list').replaceChildren(...rows.map(r=>el('p',new Date(r.created*1000).toLocaleString('th-TH')+' • '+r.username+' • '+r.action+' • '+r.detail)));}catch(e){message(e.message,true);}};
