// Main L'Enfer application logic.
// Static arrays are in assets/data/static-data.js.
const CATALOG = window.LENFER_CATALOG || [];
const BRAK = window.LENFER_BRAK || [];
// ── THEME ──
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.getElementById('theme-btn').textContent = next === 'dark' ? '🌙' : '☀️';
  try { localStorage.setItem('theme', next); } catch(e){}
}
(function(){ try { const t=localStorage.getItem('theme'); if(t){document.documentElement.setAttribute('data-theme',t);} } catch(e){} })();

// ── STORAGE ──
const get = key => { try { return JSON.parse(localStorage.getItem(key)||'[]'); } catch(e) { return []; } };
const getObj = key => { try { return JSON.parse(localStorage.getItem(key)||'{}'); } catch(e) { return {}; } };
function storageFail(key,e){
  console.error('localStorage set failed:', key, e);
  try {
    const b=document.getElementById('app-error-banner');
    if(b){b.style.display='block';b.textContent='Не удалось сохранить данные в браузере. Сделай JSON-бэкап и очисти лишнее.';}
  } catch(_){}
}
function mirrorKeyFor(key){
  if(key==='credentials')return 'credentials__mirror';
  if(key==='cells')return 'cells__mirror';
  if(key==='cell_favorites')return 'cell_favorites__mirror';
  return '';
}
const set = (key, val) => {
  try {
    const json=JSON.stringify(val);
    localStorage.setItem(key, json);
    const mirror=mirrorKeyFor(key);
    if(mirror){
      localStorage.setItem(mirror, json);
      localStorage.setItem(key+'__saved_at', String(Date.now()));
    }
  }
  catch(e) { storageFail(key,e); }
};
function getSafeCredentials(){
  try{
    const raw=localStorage.getItem('credentials');
    if(raw!==null){
      const arr=JSON.parse(raw);
      if(Array.isArray(arr))return arr;
    }
  }catch(e){}
  try{
    const mirror=localStorage.getItem('credentials__mirror');
    if(mirror){
      const arr=JSON.parse(mirror);
      if(Array.isArray(arr)){
        localStorage.setItem('credentials',JSON.stringify(arr));
        return arr;
      }
    }
  }catch(e){}
  return [];
}
function repairCredentialsStorage(){
  try{
    const raw=localStorage.getItem('credentials');
    const mirror=localStorage.getItem('credentials__mirror');
    if((raw===null || raw==='') && mirror){
      const arr=JSON.parse(mirror);
      if(Array.isArray(arr))localStorage.setItem('credentials',JSON.stringify(arr));
    }else if(raw!==null){
      const arr=JSON.parse(raw);
      if(Array.isArray(arr) && !mirror)localStorage.setItem('credentials__mirror',raw);
    }
  }catch(e){console.warn('credentials repair failed',e);}
}
function normalizeCellRecord(c){
  if(!c || typeof c!=='object')return null;
  const addr=String(c.addr||c.cell||c.address||'').trim();
  const code=String(c.code||c.barcode||c.bc||'').trim();
  if(!addr && !code)return null;
  return {...c, addr:addr||code, name:String(c.name||c.desc||c.description||'').trim(), code:code, id:c.id||Date.now()+Math.floor(Math.random()*100000)};
}
function normalizeCellsArray(arr){
  if(!Array.isArray(arr))return [];
  const seen=new Set();
  const out=[];
  arr.forEach(c=>{
    const n=normalizeCellRecord(c); if(!n)return;
    const key=String(n.addr||'').toLowerCase();
    if(key && seen.has(key))return;
    if(key)seen.add(key);
    out.push(n);
  });
  return out;
}
function getSafeCells(){
  const tryParse=(key)=>{try{const raw=localStorage.getItem(key); if(raw!==null){const arr=normalizeCellsArray(JSON.parse(raw)); if(arr.length || raw==='[]')return arr;}}catch(e){} return null;};
  const main=tryParse('cells');
  if(main && main.length){return main;}
  const mirror=tryParse('cells__mirror');
  if(mirror && mirror.length){try{localStorage.setItem('cells',JSON.stringify(mirror));}catch(e){} return mirror;}
  return main||[];
}
function repairCellsStorage(){
  try{
    const arr=getSafeCells();
    const json=JSON.stringify(arr);
    localStorage.setItem('cells',json);
    if(arr.length || !localStorage.getItem('cells__mirror'))localStorage.setItem('cells__mirror',json);
    const favRaw=localStorage.getItem('cell_favorites');
    const favMir=localStorage.getItem('cell_favorites__mirror');
    if((favRaw===null || favRaw==='') && favMir)localStorage.setItem('cell_favorites',favMir);
    else if(favRaw!==null && !favMir)localStorage.setItem('cell_favorites__mirror',favRaw);
  }catch(e){console.warn('cells repair failed',e);}
}
const getCustomItems = () => get('custom_items');
const getCustomBarcodes = () => getObj('custom_barcodes');
// Пометки «ЕО проверено» — синхронизируются между устройствами.
// Снятие пометки хранится как {off:1,ts}, а не удаление: иначе другое устройство «воскресит» галочку при слиянии.
const getEoCheckedMap = () => getObj('eo_checked');
function eoCheckedInfo(eo){
  const e=getEoCheckedMap()[String(eo||'').trim()];
  if(!e || (typeof e==='object' && e.off))return null;
  return (typeof e==='object')?e:{ts:0};
}
function eoIsChecked(eo){ return !!eoCheckedInfo(eo); }
function eoSetChecked(eo,on){
  eo=String(eo||'').trim(); if(!eo)return;
  const m=getEoCheckedMap();
  const a=currentActor();
  if(on)m[eo]={ts:Date.now(),by:a.name,byUid:a.uid};
  else m[eo]={ts:Date.now(),off:1};
  set('eo_checked',m);
}
function eoToggleChecked(eo){ eoSetChecked(eo,!eoIsChecked(eo)); }
// Пометки позиций внутри ЕО отгрузки (В наличии/Недостача/Излишек/Брак).
// Общие для всех устройств: ключ = ЕО|УТ|ШК, снятие — tombstone {off:1,ts},
// слияние поштучное по ts (SYNC_TS_MAP_KEYS), как у eo_checked/tier_cell_marks.
const getEoPosMarksMap = () => getObj('eo_pos_marks');
function eoPosKey(eo,ut,barcode){return String(eo||'').trim()+'|'+String(ut||'').trim()+'|'+String(barcode||'').trim();}
function eoPosGet(eo,ut,barcode){
  const e=getEoPosMarksMap()[eoPosKey(eo,ut,barcode)];
  if(!e||e.off||!e.cat)return null;
  return e;
}
function eoPosWrite(eo,list){
  // list: [{ut,barcode,cat,qty}], cat=null снимает пометку
  const m=getEoPosMarksMap(); const a=currentActor(); const ts=Date.now();
  (list||[]).forEach(x=>{
    const k=eoPosKey(eo,x.ut,x.barcode);
    m[k]=x.cat?{cat:x.cat,qty:x.qty,ts:ts,by:a.name,byUid:a.uid}:{off:1,ts:ts};
  });
  set('eo_pos_marks',m);
  // Напарник должен увидеть пометку сразу — не ждём дебаунс общего канала.
  try{ if(window.fbPushNow)window.fbPushNow(); }catch(_){}
}
// Избранные ячейки склада (локально на устройстве)
const getFavCellsMap = () => getObj('fav_cells');
function isFavCell(addr){ return !!getFavCellsMap()[String(addr||'').trim().toUpperCase()]; }
function setFavCell(addr,on){
  addr=String(addr||'').trim().toUpperCase(); if(!addr)return;
  const m=getFavCellsMap();
  if(on)m[addr]={ts:Date.now()}; else delete m[addr];
  set('fav_cells',m);
}
function toggleFavCell(addr){ setFavCell(addr,!isFavCell(addr)); }
// Пометки ячеек при обходе (Верхние ярусы / Первый ярус): проверено / проблема / исправлено.
// Синхронизируются между устройствами; сброс хранится как {off:1,ts} — tombstone против «воскрешения» при слиянии.
const getTierMarksMap = () => getObj('tier_cell_marks');
// Рабочая дата обхода: НЕ живое «сегодня» (иначе у ночной смены отметки сами
// гаснут прямо посреди работы, как только часы перевалят за полночь), а
// «липкая» дата, которая обновляется только явным действием — нажатием
// «Обновить ячейки»/«Загрузить ячейки» (см. wmsLoadUpperStorageCells). Это и
// есть тот момент, который человек называет «выгрузкой» — новая выгрузка,
// новая доска.
function tierWorkDate(){ return getStickyDate('tier_work_date')||rkTodayISO(); }
function tierGetMark(cellId){
  const m=getTierMarksMap()[String(cellId||'')];
  if(!m || m.off || !m.status)return null;
  // Каждая выгрузка ячеек — чистая доска: пометки «проверено»/«исправлено» с прошлой
  // выгрузки не показываем. Нерешённая «проблема» висит, пока её не исправят/не снимут.
  if(m.status!=='problem' && String(m.date||'')!==tierWorkDate())return null;
  return m;
}
function tierSetMark(cellId, mark){
  cellId=String(cellId||''); if(!cellId)return;
  const m=getTierMarksMap();
  if(mark)m[cellId]={...mark,date:mark.date||tierWorkDate()}; else m[cellId]={off:1,ts:Date.now(),date:tierWorkDate()};
  set('tier_cell_marks',m);
}
function tierMarkChecked(cellId){ const a=currentActor(); tierSetMark(cellId,{status:'checked',comment:'',ts:Date.now(),by:a.name,byUid:a.uid}); }
function tierMarkProblem(cellId){
  const cur=tierGetMark(cellId); const a=currentActor();
  tierSetMark(cellId,{status:'problem',comment:(cur&&cur.comment)||'',ts:Date.now(),by:a.name,byUid:a.uid});
}
function tierMarkFixed(cellId){
  const cur=tierGetMark(cellId); const a=currentActor();
  tierSetMark(cellId,{status:'fixed',comment:(cur&&cur.comment)||'',ts:Date.now(),by:a.name,byUid:a.uid});
}
function tierMarkReset(cellId){ tierSetMark(cellId,null); }
function tierSetComment(cellId,text){
  const cur=tierGetMark(cellId);
  if(!cur)return;
  tierSetMark(cellId,{...cur,comment:text,ts:Date.now()});
}
const getProductEdits = () => getObj('product_edits');
const getCells = () => getSafeCells();
const getFavs = () => get('favorites');
function isFav(ut){return getFavs().includes(ut);}
function toggleFav(ut){
  let f=getFavs();
  if(f.includes(ut))f=f.filter(x=>x!==ut); else f.unshift(ut);
  set('favorites',f);
}
const getNotes = () => get('notes');
const getCreds = () => getSafeCredentials();
const getEOCodes = () => get('eo_codes');
const getProblems = () => get('problems_log');
const getActionLog = () => get('action_log');
const getAuditLog = () => get('audit_log');
const getUserProfileLocal = () => getObj('user_profile');
function currentActor(){
  const p = window.lenferCurrentUserProfile || getUserProfileLocal() || {};
  const uid = String(p.uid || '');
  const email = String(p.email || '');
  const name = String(p.name || p.displayName || email || (uid ? ('uid:'+uid.slice(0,6)) : 'Пользователь')).trim();
  return {uid, email, name};
}
function createMeta(row){
  const a=currentActor(); const ts=new Date().toISOString(); const ru=new Date().toLocaleString('ru-RU');
  return {...(row||{}), createdByUid:(row&&row.createdByUid)||a.uid, createdByName:(row&&row.createdByName)||a.name, createdByEmail:(row&&row.createdByEmail)||a.email, createdAtIso:(row&&row.createdAtIso)||ts, updatedByUid:a.uid, updatedByName:a.name, updatedByEmail:a.email, updatedAtIso:ts, updatedAtRu:ru};
}
function touchMeta(row){
  const a=currentActor(); const ts=new Date().toISOString(); const ru=new Date().toLocaleString('ru-RU');
  if(!row || typeof row!=='object')return row;
  row.updatedByUid=a.uid; row.updatedByName=a.name; row.updatedByEmail=a.email; row.updatedAtIso=ts; row.updatedAtRu=ru;
  if(!row.createdByName){row.createdByUid=a.uid;row.createdByName=a.name;row.createdByEmail=a.email;row.createdAtIso=row.createdAtIso||ts;}
  return row;
}
// ── Аватары пользователей ──
// Свой аватар живёт в user_profile.avatar; чужие приходят из workspace members и кэшируются в members_dir.
const getMembersDir = () => getObj('members_dir');
function memberAvatar(uid){
  uid=String(uid||''); if(!uid)return '';
  const me=window.lenferCurrentUserProfile||getUserProfileLocal()||{};
  if(String(me.uid||'')===uid && me.avatar)return me.avatar;
  const m=getMembersDir()[uid];
  return (m&&m.avatar)||'';
}
function avatarColor(seed){
  const palette=['#c9a227','#3f7dd8','#2e9e63','#c0563f','#8355c7','#2e8f9e','#b8562e','#5f7dae'];
  let h=0; const s=String(seed||'');
  for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;
  return palette[h%palette.length];
}
function avatarHtml(uid,name,size){
  size=size||24;
  const st='width:'+size+'px;height:'+size+'px;border-radius:50%;flex:0 0 auto;';
  const av=memberAvatar(uid);
  if(av)return '<img src="'+av+'" style="'+st+'object-fit:cover;border:1px solid var(--border);" alt=""/>';
  const init=(String(name||'').trim().charAt(0)||'?').toUpperCase();
  return '<span style="'+st+'display:inline-flex;align-items:center;justify-content:center;background:'+avatarColor(uid||name)+';color:#fff;font-size:'+Math.round(size*0.46)+'px;font-weight:700;">'+escHtml(init)+'</span>';
}
function authorLine(x){
  if(!x || typeof x!=='object')return '';
  const c=x.createdByName||x.createdByEmail||'';
  const u=x.updatedByName||x.updatedByEmail||'';
  const when=x.updatedAtRu||x.updatedAt||x.ts||x.createdAt||'';
  if(!c && !u)return '';
  return '<div class="meta-author" style="display:flex;align-items:center;gap:5px;">'+avatarHtml(x.createdByUid,c||u,14)+'<span>'+(c?'Создал: <b>'+escHtml(c)+'</b>':'')+(u&&u!==c?' · изм.: <b>'+escHtml(u)+'</b>':'')+(when?' · '+escHtml(when):'')+'</span></div>';
}
function saveCustomBarcode(ut,bc){const o=getCustomBarcodes();o[ut]=bc;set('custom_barcodes',o);}
const getPackSizes = () => getObj('pack_sizes');
function savePackSize(ut,n){const o=getPackSizes();if(n)o[ut]=n;else delete o[ut];set('pack_sizes',o);}
function deleteCustomBarcode(ut){const o=getCustomBarcodes();delete o[ut];set('custom_barcodes',o);}
function escHtml(s){return String(s??'').replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]||m;});}

function splitBarcodeValues(v){
  return String(v||'').split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean);
}
function productBarcodeList(i){
  const cb=getCustomBarcodes();
  const key=(i&&i.baseUt)||((i&&i.ut)||'');
  const vals=[];
  function add(v){splitBarcodeValues(v).forEach(x=>{if(vals.indexOf(x)<0)vals.push(x);});}
  add(i&&i.barcode);
  add(i&&i.barcodes);
  add(cb[(i&&i.ut)||'']);
  add(cb[key]);
  return vals;
}


// ── LIGHT ACTION LOG ──
function logAction(type, text, meta){
  try{
    const a=currentActor();
    const entry={id:Date.now()+Math.floor(Math.random()*1000),type:String(type||'action'),text:String(text||''),meta:meta||{},ts:new Date().toLocaleString('ru-RU'),iso:new Date().toISOString(),actorUid:a.uid,actorName:a.name,actorEmail:a.email};
    const arr=getActionLog();
    arr.unshift(entry);
    set('action_log',arr.slice(0,300));
    const aud=getAuditLog();
    aud.unshift(entry);
    set('audit_log',aud.slice(0,500));
  }catch(e){}
}
function combinedAuditLog(){
  const map=new Map();
  [...getAuditLog(),...getActionLog()].forEach(x=>{if(!x)return; map.set(String(x.id||x.iso||Math.random()),x);});
  return Array.from(map.values()).sort((a,b)=>String(b.iso||'').localeCompare(String(a.iso||'')));
}
function renderActionLogMini(){
  const box=document.getElementById('diag-action-log');
  if(!box)return;
  const arr=combinedAuditLog().slice(0,18);
  if(!arr.length){box.innerHTML='<div class="no-results" style="padding:12px;">Журнал пока пуст</div>';return;}
  box.innerHTML=arr.map(x=>'<div style="border-bottom:1px solid var(--border);padding:7px 0;font-size:11px;line-height:1.35;"><b style="color:var(--gold);">'+escHtml(x.ts||'')+'</b> · <span style="color:var(--text);">'+escHtml(x.actorName||x.actorEmail||'Пользователь')+'</span> · '+escHtml(x.text||x.type||'')+'</div>').join('');
}
function clearActionLog(){
  if(!confirm('Очистить только локальный журнал на этом устройстве? Общий аудит в базе не стирается.'))return;
  set('action_log',[]);renderActionLogMini();
}


// ── SMART PRODUCT SEARCH HELPERS ──
function productAllItems(){
  const edits=getProductEdits();
  const base=CATALOG.map(i=>edits[i.ut]?{...i,...edits[i.ut],baseUt:i.ut,edited:true}:i);
  return [...getCustomItems(),...base];
}
function productBarcode(i){return productBarcodeList(i).join(', ');}
function saveProductInfoEdit(oldUt,newUt,newName,newBc){
  oldUt=String(oldUt||'').trim(); newUt=String(newUt||'').trim(); newName=String(newName||'').trim(); newBc=String(newBc||'').trim();
  if(!oldUt||!newUt||!newName){alert('Укажи УТ и наименование');return false;}
  const custom=getCustomItems();
  const ci=custom.findIndex(x=>String(x.ut||'')===oldUt || String(x.baseUt||'')===oldUt);
  if(ci>=0){custom[ci]=touchMeta({...custom[ci],ut:newUt,name:newName,barcode:newBc});set('custom_items',custom);logAction('product','Изменён товар: '+newUt,{ut:newUt});return true;}
  const current=productAllItems().find(x=>String(x.ut||'')===oldUt);
  const baseKey=(current&&current.baseUt)||oldUt;
  const edits=getProductEdits();
  edits[baseKey]=touchMeta({ut:newUt,name:newName,barcode:newBc,img:(current&&current.img)||''});
  set('product_edits',edits);
  if(newBc)saveCustomBarcode(newUt,newBc);
  logAction('product','Изменён встроенный товар: '+newUt,{ut:newUt});
  return true;
}
function productEditSave(e,oldUt,cid){
  e.stopPropagation();
  const ut=(document.getElementById('pe-ut-'+cid)||{}).value||'';
  const name=(document.getElementById('pe-name-'+cid)||{}).value||'';
  const bc=(document.getElementById('pe-bc-'+cid)||{}).value||'';
  if(saveProductInfoEdit(oldUt,ut,name,bc)){
    const btn=e.target; const old=btn.textContent; btn.textContent='✓'; setTimeout(()=>btn.textContent=old,800);
    if(query)doSearch(query); else render();
  }
}
function normSearchText(v){return String(v||'').toLowerCase().replace(/[ё]/g,'е').replace(/[\s\-–—_.,;:()\[\]{}]+/g,' ').trim();}
function digitsOnly(v){return String(v||'').replace(/\D/g,'');}
function smartProductScore(i,q){
  const raw=String(q||'').trim();
  const qn=normSearchText(raw);
  const qd=digitsOnly(raw);
  if(!qn&&!qd)return -1;
  const ut=String(i.ut||''), name=String(i.name||''), bcs=productBarcodeList(i), bc=bcs.join(' ');
  const un=normSearchText(ut), nn=normSearchText(name), bn=normSearchText(bc);
  const ud=digitsOnly(ut), bdList=bcs.map(digitsOnly).filter(Boolean);
  let score=-1;
  if(qd){
    if(ud===qd)score=Math.max(score,120);
    else if(ud.startsWith(qd))score=Math.max(score,105);
    else if(ud.includes(qd))score=Math.max(score,90);
    for(const bd of bdList){
      if(bd===qd)score=Math.max(score,115);
      else if(bd.startsWith(qd))score=Math.max(score,100);
      else if(bd.includes(qd))score=Math.max(score,85);
    }
  }
  if(qn){
    if(un===qn)score=Math.max(score,118);
    else if(un.startsWith(qn))score=Math.max(score,104);
    else if(un.includes(qn))score=Math.max(score,92);
    if(nn.startsWith(qn))score=Math.max(score,88);
    else if(nn.includes(qn))score=Math.max(score,78);
    const words=qn.split(/\s+/).filter(Boolean);
    if(words.length&&words.every(w=>(nn+' '+un+' '+bn).includes(w)))score=Math.max(score,70+Math.min(words.length,5));
  }
  return score;
}
function smartProductSearch(q,limit,items){
  const arr=(items||productAllItems()).map((i,idx)=>({i,idx,score:smartProductScore(i,q)})).filter(x=>x.score>=0);
  arr.sort((a,b)=>b.score-a.score||a.idx-b.idx);
  return arr.slice(0,limit||30).map(x=>x.i);
}
function getRecentProducts(){return get('recent_products');}
function pushRecentProduct(ut){if(!ut)return;let arr=getRecentProducts().filter(x=>x!==ut);arr.unshift(ut);arr=arr.slice(0,12);set('recent_products',arr);}
function productByUt(ut){return productAllItems().find(i=>i.ut===ut);}
function productResultRow(i,pickFn){
  const bc=productBarcode(i);
  const img=i.img?'<img src="'+escHtml(i.img)+'" loading="lazy" onerror="this.parentNode.innerHTML=\'📦\'">':'📦';
  return '<div class="smart-result-row" onclick="'+pickFn+'(\''+jsStr(i.ut)+'\',\''+jsStr(i.name)+'\')">'+
    '<div class="smart-thumb">'+img+'</div><div class="smart-result-main">'+
    '<div class="smart-result-ut">'+escHtml(i.ut)+'</div><div class="smart-result-name">'+escHtml(i.name)+'</div>'+
    (bc?'<div class="smart-result-bc">ШК: '+escHtml(bc)+'</div>':'')+'</div></div>';
}
function productSuggestionHtml(pickFn, emptyText){
  const favs=getFavs().map(productByUt).filter(Boolean).slice(0,5);
  const rec=getRecentProducts().map(productByUt).filter(Boolean).filter(i=>!favs.some(f=>f.ut===i.ut)).slice(0,6);
  let h='';
  if(favs.length)h+='<div class="smart-section-title">★ Избранные</div>'+favs.map(i=>productResultRow(i,pickFn)).join('');
  if(rec.length)h+='<div class="smart-section-title">🕘 Недавние</div>'+rec.map(i=>productResultRow(i,pickFn)).join('');
  if(!h)h='<div class="smart-empty">'+(emptyText||'Начни вводить УТ, ШК или название. Можно вводить цифры без префикса.')+'</div>';
  return h;
}
function showProductResults(boxId,q,pickFn,notFoundHtml,limit){
  const box=document.getElementById(boxId); if(!box)return;
  q=(q||'').trim();
  if(!q){box.innerHTML=productSuggestionHtml(pickFn);box.style.display='block';return;}
  const res=smartProductSearch(q,limit||30);
  if(!res.length){box.innerHTML=notFoundHtml||'<div class="smart-empty">Не найдено. Можно добавить новый товар.</div>';box.style.display='block';return;}
  box.innerHTML=res.map(i=>productResultRow(i,pickFn)).join('');
  box.style.display='block';
}
function runSearchByContext(ctx){
  if(ctx==='catalog'){const el=document.getElementById('search');query=(el.value||'').trim();if(query)doSearch(query);else{filtered=[];render();}}
  else if(ctx==='cells'){const el=document.getElementById('cell-search');renderCells(el?el.value:'');}
  else if(ctx==='calc'){const el=document.getElementById('calc-prod-search');calcProdSearch(el?el.value:'');}
  else if(ctx==='hh11'){const el=document.getElementById('hh11-search');hh11Search(el?el.value:'');}
  else if(ctx==='rk'){const el=document.getElementById('rk-search');rkSearch(el?el.value:'');}
  else if(ctx==='problems'){const el=document.getElementById('problem-search');problemSearch(el?el.value:'');}
}

function clearProductSearch(id,ctx){const el=document.getElementById(id);if(!el)return;el.value='';try{el.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){} el.focus();runSearchByContext(ctx);}
function prefixProductSearch(id,prefix,ctx){const el=document.getElementById(id);if(!el)return;el.value=prefix;el.focus();try{el.setSelectionRange(el.value.length,el.value.length);}catch(e){}runSearchByContext(ctx);}
function toggleNumericSearch(id,btn){const el=document.getElementById(id);if(!el)return;const on=el.getAttribute('inputmode')==='numeric';if(on){el.setAttribute('inputmode','text');if(btn)btn.classList.remove('primary');}else{el.setAttribute('inputmode','numeric');if(btn)btn.classList.add('primary');}el.focus();}
function scanProductSearch(id,ctx){startScan(id,function(text){const el=document.getElementById(id);if(el){el.value=text;el.focus();}runSearchByContext(ctx);});}
function catalogFocusSearch(){const el=document.getElementById('search');if(!el.value.trim()){query='';filtered=[];render();}}

// ── MODAL ──
function openModal(id){document.getElementById(id).style.display='flex';const f=document.querySelector('#'+id+' input, #'+id+' textarea');if(f)setTimeout(()=>f.focus(),100);}
function closeModal(id){document.getElementById(id).style.display='none';}
function previewPhoto(previewId, input, opts){
  const file=input.files[0]; if(!file) return;
  const maxDim=(opts&&opts.maxDim)||1000;
  const quality=(opts&&opts.quality)||0.7;
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      let w=img.width,h=img.height;
      if(w>maxDim||h>maxDim){ if(w>h){h=h*maxDim/w;w=maxDim;}else{w=w*maxDim/h;h=maxDim;} }
      const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      const c=canvas.toDataURL('image/jpeg',quality);
      const el=document.getElementById(previewId); el.innerHTML='<img src="'+c+'">'; el.dataset.img=c;
    };
    img.onerror=()=>{const el=document.getElementById(previewId);el.innerHTML='<img src="'+e.target.result+'">';el.dataset.img=e.target.result;};
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}
// Фото в чате читают, чтобы разглядеть детали (брак, накладную) — качество выше,
// чем у карточек товара, где важнее компактность и объём каталога.
function previewPhotoChat(previewId, input){ previewPhoto(previewId, input, {maxDim:1600, quality:0.85}); }

// ── BARCODE (Code128) ──
function code128(text){
  const CHARS=" !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
  const P=['11011001100','11001101100','11001100110','10010011000','10010001100','10001001100','10011001000','10011000100','10001100100','11001001000','11001000100','11000100100','10110011100','10011011100','10011001110','10111001100','10011101100','10011100110','11001110010','11001011100','11001001110','11011100100','11001110100','11101101110','11101001100','11100101100','11100100110','11101100100','11100110100','11100110010','11011011000','11011000110','11000110110','10100011000','10001011000','10001000110','10110001000','10001101000','10001100010','11010001000','11000101000','11000100010','10110111000','10110001110','10001101110','10111011000','10111000110','10001110110','11101110110','11010001110','11000101110','11011101000','11011100010','11011101110','11101011000','11101000110','11100010110','11101101000','11101100010','11100011010','11101111010','11001000010','11110001010','10100110000','10100001100','10010110000','10010000110','10000101100','10000100110','10110010000','10110000100','10011010000','10011000010','10000110100','10000110010','11000010010','11001010000','11110111010','11000010100','10001111010','10100111100','10010111100','10010011110','10111100100','10011110100','10011110010','11110100100','11110010100','11110010010','11011011110','11011110110','11110110110','10101111000','10100011110','10001011110','10111101000','10111100010','11110101000','11110100010','10111011110','10111101110','11101011110','11110101110','11010000100','11010010000','11010011100','1100011101011'];
  let codes=[104],check=104;
  for(let i=0;i<text.length;i++){const idx=CHARS.indexOf(text[i]);codes.push(idx);check+=(i+1)*idx;}
  codes.push(check%103);codes.push(106);
  return codes.map(c=>P[c]).join('');
}
function drawBarcode(canvas,text){
  const p=code128(text),bw=3,h=100;
  canvas.width=p.length*bw;canvas.height=h;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,h);
  ctx.fillStyle='#000';
  for(let i=0;i<p.length;i++)if(p[i]==='1')ctx.fillRect(i*bw,0,bw,h);
}

// ── TABS ──
const TABS=['catalog','cells','wms','notes','eo','creds','calc','hh11','rk','instock','problems','report','service','monitor'];
const MAIN_NAV_TABS=['monitor','hh11','wms','catalog','rk'];
function openMoreMenu(){const el=document.getElementById('more-sheet');if(el)el.style.display='flex';}
function closeMoreMenu(){const el=document.getElementById('more-sheet');if(el)el.style.display='none';}
function moreGo(tab){closeMoreMenu();switchTab(tab);}
// «Ещё → Ячейки»: раньше вёл на локальный статичный справочник (брак + вручную
// добавленные). Теперь ведёт сразу на живые «Ячейки склада» из ВМС (WMS → Инструменты
// хранения → Ячейки склада) — тот же экран, отдельным входом, без лишних кликов.
function moreGoCellsWms(){
  closeMoreMenu();
  switchTab('wms');
  wmsSetLookupKind('cellbc');
  if(!(wmsAllCells&&wmsAllCells.length))wmsLoadAllCells();
}
window.moreGoCellsWms=moreGoCellsWms;
window.openMoreMenu=openMoreMenu;window.closeMoreMenu=closeMoreMenu;window.moreGo=moreGo;
let wmsLastTab='hh11';
const wmsTabScrollY={};
function switchTab(tab){
  // Запоминаем прокрутку текущей вкладки, чтобы вернуться на то же место
  try{wmsTabScrollY[wmsLastTab]=window.scrollY||document.documentElement.scrollTop||0;}catch(e){}
  const returning=(tab===wmsLastTab);
  const navTab=MAIN_NAV_TABS.includes(tab)?tab:'more';
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active', b.dataset.tab===navTab));
  TABS.forEach(t=>{const el=document.getElementById('tab-'+t);if(el)el.style.display=t===tab?'':'none';});
  document.getElementById('catalog-search-area').style.display = tab==='catalog'?'':'none';
  document.querySelector('.fab').style.display = (tab==='catalog' && !document.querySelector('.card.open'))?'flex':'none';
  if(tab==='cells')renderCells('');
  if(tab==='wms')renderWms();
  if(tab==='notes'){renderNotes();chatMarkSeen();}
  if(tab==='creds')renderCreds();
  if(tab==='eo'){renderEO();renderEORange();}
  if(tab==='hh11')renderHH11();
  if(tab==='rk')renderRK();
  if(tab==='instock')renderInstock();
  if(tab==='calc'){try{doCalc();}catch(e){}}
  if(tab==='problems')renderProblems();
  if(tab==='service'){renderDiagnostics();renderAutoBackups();renderActionLogMini();}
  if(tab==='report')renderReport();
  if(tab==='monitor')renderMonitor();
  wmsLastTab=tab;
  const _sy=wmsTabScrollY[tab]||0;
  // Возвращаем прокрутку на сохранённое место (после отрисовки)
  requestAnimationFrame(()=>{try{window.scrollTo(0,_sy);}catch(e){}});
}
window.switchTab = switchTab;


// ── WMS IMPORT / BRIDGE ──
let wmsLastResult = null;
let wmsLastChoices = null;
let wmsLookupKind = 'stocks';
let wmsShipmentLastRoutes = null;
let wmsShipmentRenderState = null;
let wmsShipmentEoState = null;
let wmsCellBcLast = null;
let wmsAllCells = [];
let wmsCountReturnCell = '';
// Если в «Счёт» ушли с плитки обхода яруса — запоминаем режим, чтобы «← В ячейку»
// вернул не просто в общий поиск «Остатки сейчас», а в тот же контекст обхода,
// где снова доступна кнопка «← Назад к обходу ярусов» (см. wmsBackToTier).
let wmsCountReturnKind = '';
let wmsUpperCells = [];
let wmsUpperOccupancy = {};
let wmsUpperPageV64 = {};
let wmsLargeLosses = null;
let wmsLastRecountingRaw = null;
let wmsChangeFilter = 'all';
let wmsChangeDirectionFilter = 'all';
let wmsChangeOperationFilter = 'all';
let wmsChangesExecutorFilter = '';
let wmsChangesExecutorId = '';
let wmsChangesDateFilter = '';
let wmsChangesSearchDateFrom = '';
let wmsChangesSearchDateTo = '';
let wmsRcSubTab = 'tasks';
let wmsLastDiscrepancyResult = null;
let wmsCheckedEmptyCells = new Set();
let wmsStorageOnly = false;
const WMS_AUTO_UNAVAILABLE = 'Авто-поиск доступен только в Android-обёртке с ВМС-входом. Обычная PWA в браузере не может сама ходить в ВМС.';


// ── AI proxy (Yandex Cloud Function) ──
// Ключ DeepSeek остаётся только в Yandex Cloud, в APK его нет.
const WAREHOUSE_AI_URL = 'https://functions.yandexcloud.net/d4eouqic8u5nntn17at2';
let wmsAiBusy = false;


function wmsIsStorageCellAddress(addr){
  const s=String(addr||'').trim().toUpperCase();
  // Основные ячейки хранения. Ворота/G/A/напольные зоны сюда не попадают.
  return /^(HH|SH)-/.test(s);
}
function wmsRowHasStorageCell(r){
  return wmsIsStorageCellAddress(r&&r.cellAddress) || wmsIsStorageCellAddress(r&&r.sourceCellAddress) || wmsIsStorageCellAddress(r&&r.targetCellAddress);
}
function wmsApplyStorageFilter(rows){
  rows=rows||[];
  return wmsStorageOnly ? rows.filter(wmsRowHasStorageCell) : rows;
}
function wmsToggleStorageOnly(){
  wmsStorageOnly=!wmsStorageOnly;
  if(wmsLastResult)wmsRenderResult(wmsLastResult);
  wmsSetStatus(wmsStorageOnly?'Фильтр: только ячейки хранения HH/SH.':'Фильтр хранения выключен.','');
}
function wmsStorageToggleButton(){
  return '<button class="exi-btn '+(wmsStorageOnly?'primary':'')+'" onclick="wmsToggleStorageOnly()">Хранение HH/SH</button>';
}

let wmsStopRequested=false;
function wmsRequestStop(){
  wmsStopRequested=true;
  try{ if(window.LenferAndroidWms && typeof LenferAndroidWms.cancelWmsWork==='function')LenferAndroidWms.cancelWmsWork(); }catch(_){}
  const el=document.getElementById('wms-status');
  if(el){el.textContent='Останавливаю…';el.className='wms-status wms-status-wait';}
}
window.wmsRequestStop=wmsRequestStop;
function wmsSetStatus(text, kind){
  const el=document.getElementById('wms-status');
  if(!el)return;
  if(kind==='wait'){
    // Пока крутится длинная операция — рядом со статусом живёт кнопка «Стоп».
    el.innerHTML='<span>'+escHtml(String(text||''))+'</span> <button class="wms-stop-btn" onclick="wmsRequestStop()">⛔ Стоп</button>';
  }else{
    el.textContent=String(text||'');
  }
  el.className='wms-status '+(kind?('wms-status-'+kind):'');
}

function wmsNativeMethodExists(name){
  return !!(window.LenferAndroidWms && typeof window.LenferAndroidWms[name]==='function');
}
function wmsOpenNativeLogin(){
  try{
    if(wmsNativeMethodExists('openWmsLogin')){
      window.LenferAndroidWms.openWmsLogin();
      wmsSetStatus('Открыл WMS. Войди в аккаунт и вернись в приложение.','wait');
    }else{
      wmsSetStatus('Android-обёртка не найдена. В обычном браузере автоматический вход ВМС недоступен.','err');
    }
  }catch(e){wmsSetStatus('Не смог открыть ВМС: '+((e&&e.message)||e),'err');}
}
function wmsReloadNativeWms(){
  try{
    if(wmsNativeMethodExists('reloadWmsLogin')){
      window.LenferAndroidWms.reloadWmsLogin();
      wmsSetStatus('Перезагружаю ВМС. Если страница зависла — подожди загрузку и вернись в приложение.','wait');
    }else{
      wmsSetStatus('Перезагрузка ВМС доступна только в Android-обёртке.','err');
    }
  }catch(e){wmsSetStatus('Не смог перезагрузить ВМС: '+((e&&e.message)||e),'err');}
}
async function wmsCheckNativeAuth(){
  if(!wmsNativeMethodExists('checkWmsAuth')){
    wmsSetStatus('Проверка доступна только в Android-обёртке.','err');
    return;
  }
  wmsSetStatus('Проверяю авторизацию ВМС…','wait');
  try{
    const raw=await wmsCallNative('checkWmsAuth',[],12000);
    const ok=!!raw.hasAuth;
    const bits=[];
    if(raw.hasBearer)bits.push('Bearer');
    if(raw.hasXAuth)bits.push('x-auth');
    if(raw.hasCookie)bits.push('cookies');
    const href=raw.href?(' · '+String(raw.href).slice(0,90)):'';
    wmsSetStatus(ok ? ('WMS-авторизация найдена: '+(bits.join(', ')||'есть')+href) : ('WMS-авторизация пока не найдена. Открой WMS, дождись загрузки и вернись.'), ok?'ok':'err');
  }catch(e){wmsSetStatus('Проверка ВМС не прошла: '+((e&&e.message)||e),'err');}
}

function wmsPrefixUt(){
  const el=document.getElementById('wms-query');
  if(!el)return;
  const v=String(el.value||'').trim();
  if(!v)el.value='УТ-';
  else if(!/^УТ-/i.test(v))el.value='УТ-'+v.replace(/^ут-/i,'');
  el.focus();
}
function wmsCleanCode(v){
  v=String(v||'').trim().replace(/ /g,' ').replace(/\s+/g,' ');
  if(!v)return '';
  v=v.replace(/^ut[-\s]?/i,'УТ-').replace(/^ут[-\s]?/i,'УТ-');
  // Быстрый ввод УТ без префикса: 10433877 → УТ-10433877.
  // Длинные 12/13/14-значные коды не трогаем: это ЕО/HU или ШК.
  if(/^\d{5,8}$/.test(v))v='УТ-'+v;
  return v;
}
function wmsDetectMode(v){
  const q=String(v||'').trim();
  const up=q.toUpperCase();
  if(/^УТ-?\d+/.test(up))return 'УТ';
  if(/^0\d{11}$/.test(q))return 'ЕО/HU';
  if(!/\s/.test(up) && !/^\d+$/.test(up) && (up.includes('-') || /^(HH|SH)/.test(up) || /^[A-ZА-Я]{1,4}\d{1,4}[A-ZА-Я]?$/.test(up) || /^\d{2,4}[A-ZА-Я]{1,3}$/.test(up)))return 'Ячейка';
  if(/^\d{9,14}$/.test(q))return 'ШК/название';
  return 'Название';
}
function wmsSetLookupKind(kind){
  const prevKind=wmsLookupKind;
  wmsLookupKind = kind==='changes' ? 'changes' : (kind==='recounting' ? 'recounting' : (kind==='analysis' ? 'analysis' : (kind==='picking' ? 'picking' : (kind==='upper' ? 'upper' : (kind==='losses' ? 'losses' : (kind==='shipment' ? 'shipment' : (kind==='cellbc' ? 'cellbc' : 'stocks')))))));
  // Экран каждого режима сохраняется: переключение Отгрузка ↔ Остатки не теряет загруженные данные
  if(!window.wmsKindScreens)window.wmsKindScreens={};
  const kindBox=document.getElementById('wms-result');
  // Уходим из «Отгрузки», пока была открыта карточка ЕО: сворачиваем к списку маршрутов,
  // иначе закешируется (и потом всплывёт) устаревшая карточка конкретной ЕО.
  if(prevKind==='shipment' && wmsShipmentEoState && wmsLookupKind!=='shipment'){
    wmsShipmentEoState=null;
    if(kindBox && wmsShipmentRenderState){
      const s=wmsShipmentRenderState;
      wmsRenderShipmentResults(s.routes,s.query,s.dateStr);
    }
  }
  if(kindBox&&prevKind&&prevKind!==wmsLookupKind)window.wmsKindScreens[prevKind]=kindBox.innerHTML;
  const savedScreen=(prevKind!==wmsLookupKind)?(window.wmsKindScreens[wmsLookupKind]||''):'';
  wmsRefreshModeButtons();
  if(savedScreen&&kindBox){
    kindBox.innerHTML=savedScreen;
    wmsSetStatus('Режим восстановлен — данные на месте, повторно грузить не нужно.','ok');
    return;
  }
  if(wmsLookupKind==='recounting'){
    wmsSetStatus('Пересчёты: кто, когда и какие ячейки закрывал. Настрой фильтры и нажми «Показать пересчёты».', '');
    const box=document.getElementById('wms-result');
    if(box && (!wmsLastResult || String(wmsLastResult.mode||'')!=='recountingTasks')) box.innerHTML='<div class="hint" style="padding:24px 12px;"><span class="mark">↻</span><span class="txt">Выбери дату, исполнителя или зону и нажми «Показать пересчёты»</span></div>';
  }else if(wmsLookupKind==='analysis'){
    wmsSetStatus('Разбор: введи ячейку, УТ или ЕО и нажми «Собрать картину».', '');
    const box=document.getElementById('wms-result');
    if(box && (!wmsLastResult || String(wmsLastResult.mode||'')!=='analysis')) box.innerHTML='<div class="hint" style="padding:24px 12px;"><span class="mark">◇</span><span class="txt">Разбор соединит остатки, изменения и пересчёты по запросу</span></div>';
  }else if(wmsLookupKind==='picking'){
    wmsSetStatus('Резерв ячейки: введи адрес хранения и проверь, есть ли в нём ЕО под отбор.', '');
    const box=document.getElementById('wms-result');
    const cell=document.getElementById('wms-picking-cell')?.value||'';
    if(box && !window.wmsLastCellReservation) box.innerHTML='<div class="hint" style="padding:24px 12px;"><span class="mark">⇄</span><span class="txt">Введи ячейку хранения и нажми «Проверить резерв». Приложение покажет только ЕО со статусом резерва под заказ или отбора.</span></div>';
    else if(window.wmsLastCellReservation) wmsRenderCellReservation(window.wmsLastCellReservation,cell);
  }else if(wmsLookupKind==='upper'){
    wmsSetStatus('Верхние ярусы: сначала загрузи ячейки, затем сузь ряд и чётность перед проверкой остатков.', '');
    wmsRenderUpperStorage();
  }else if(wmsLookupKind==='losses'){
    wmsSetStatus('Крупные минусы: выбери дату, зону и порог. Покажу только уменьшения из ячеек хранения HH/SH.', '');
    wmsRenderLargeLosses();
  }else if(wmsLookupKind==='shipment'){
    wmsSetStatus('Отгрузка: введи слова из адреса магазина и выбери дату.', '');
    const box=document.getElementById('wms-result');
    if(box&&!wmsShipmentLastRoutes)box.innerHTML='<div class="hint" style="padding:24px 12px;"><span class="mark">↗</span><span class="txt">Введи адрес магазина и дату, нажми «Найти маршрут»</span></div>';
    // После перезагрузки WebView (например, ночью в фоне) поля дат пустеют —
    // подставляем дату последнего реального поиска, а не сегодняшнюю.
    const fEl=document.getElementById('wms-sh-date-from'),tEl=document.getElementById('wms-sh-date-to');
    const lastDate=getStickyDate('wms_ship_work_date');
    if(lastDate&&fEl&&!fEl.value&&tEl&&!tEl.value){fEl.value=lastDate;tEl.value=lastDate;}
  }else if(wmsLookupKind==='cellbc'){
    wmsSetStatus('Ячейки склада: загрузи справочник или найди ячейку. ШК и остатки по каждой.', '');
    if(wmsAllCells&&wmsAllCells.length){wmsRenderCellsView();}
    else{const box=document.getElementById('wms-result');if(box)box.innerHTML='<div class="hint" style="padding:24px 12px;"><span class="mark">▥</span><span class="txt">Нажми «Загрузить все ячейки» или найди конкретную в ВМС</span></div>';}
  }else{
    wmsSetStatus(wmsLookupKind==='changes' ? 'История изменений: УТ, ШК, название, ячейка или ЕО.' : 'Остатки сейчас: УТ, ШК, название, ячейка или ЕО.', '');
  }
}
function wmsRefreshModeButtons(){
  const s=document.getElementById('wms-mode-stocks');
  const c=document.getElementById('wms-mode-changes');
  const r=document.getElementById('wms-mode-recounting');
  const a=document.getElementById('wms-mode-analysis');
  const p=document.getElementById('wms-mode-picking');
  const u=document.getElementById('wms-mode-upper');
  const l=document.getElementById('wms-mode-losses');
  if(s){s.classList.toggle('primary', wmsLookupKind==='stocks');s.setAttribute('aria-pressed',wmsLookupKind==='stocks'?'true':'false');}
  if(c){c.classList.toggle('primary', wmsLookupKind==='changes');c.setAttribute('aria-pressed',wmsLookupKind==='changes'?'true':'false');}
  if(r){r.classList.toggle('primary', wmsLookupKind==='recounting');r.setAttribute('aria-pressed',wmsLookupKind==='recounting'?'true':'false');}
  if(a){a.classList.toggle('primary', wmsLookupKind==='analysis');a.setAttribute('aria-pressed',wmsLookupKind==='analysis'?'true':'false');}
  if(p){p.classList.toggle('primary', wmsLookupKind==='picking');p.setAttribute('aria-pressed',wmsLookupKind==='picking'?'true':'false');}
  if(u){u.classList.toggle('primary', wmsLookupKind==='upper');u.setAttribute('aria-pressed',wmsLookupKind==='upper'?'true':'false');}
  if(l){l.classList.toggle('primary', wmsLookupKind==='losses');l.setAttribute('aria-pressed',wmsLookupKind==='losses'?'true':'false');}
  const sh=document.getElementById('wms-mode-shipment'); if(sh){sh.classList.toggle('primary',wmsLookupKind==='shipment');sh.setAttribute('aria-pressed',wmsLookupKind==='shipment'?'true':'false');}
  const cb=document.getElementById('wms-mode-cellbc'); if(cb){cb.classList.toggle('primary',wmsLookupKind==='cellbc');cb.setAttribute('aria-pressed',wmsLookupKind==='cellbc'?'true':'false');}
  const rc=document.getElementById('wms-recounting-controls'); if(rc)rc.style.display=wmsLookupKind==='recounting'?'block':'none';
  const ch=document.getElementById('wms-changes-controls'); if(ch)ch.style.display=wmsLookupKind==='changes'?'block':'none';
  const an=document.getElementById('wms-analysis-controls'); if(an)an.style.display=wmsLookupKind==='analysis'?'block':'none';
  const pc=document.getElementById('wms-picking-controls'); if(pc)pc.style.display=wmsLookupKind==='picking'?'block':'none';
  const up=document.getElementById('wms-upper-controls'); if(up)up.style.display=wmsLookupKind==='upper'?'block':'none';
  const ls=document.getElementById('wms-losses-controls'); if(ls)ls.style.display=wmsLookupKind==='losses'?'block':'none';
  const scp=document.getElementById('wms-shipment-controls'); if(scp)scp.style.display=wmsLookupKind==='shipment'?'block':'none';
  const cbp=document.getElementById('wms-cellbc-controls'); if(cbp)cbp.style.display=wmsLookupKind==='cellbc'?'block':'none';
  const general=document.getElementById('wms-general-search'); if(general)general.style.display=(wmsLookupKind==='picking'||wmsLookupKind==='upper'||wmsLookupKind==='losses'||wmsLookupKind==='shipment'||wmsLookupKind==='cellbc')?'none':'block';
}
function wmsOpenUrl(url){
  try{
    window.open(url,'_blank','noopener,noreferrer');
    wmsSetStatus('Открыл WMS-раздел.','ok');
  }catch(e){ location.href=url; }
}
function wmsOpenRecounting(){
  wmsOpenUrl('https://wwh.samokat.ru/#/recounting-tasks?status=AWAITING_CONFIRMATION&sortCompletedDate=DESC&pageNumber=1');
}
function wmsOpenLabels(){
  wmsOpenUrl('https://wwh.samokat.ru/#/handing-units/print');
}
window.wmsOpenRecounting=wmsOpenRecounting;window.wmsOpenLabels=wmsOpenLabels;window.wmsOpenNativeLogin=wmsOpenNativeLogin;window.wmsReloadNativeWms=wmsReloadNativeWms;window.wmsCheckNativeAuth=wmsCheckNativeAuth;
function wmsCopyFallback(text){
  text=String(text||'');
  if(navigator.clipboard&&navigator.clipboard.writeText){return navigator.clipboard.writeText(text).catch(()=>wmsCopyTextarea(text));}
  return Promise.resolve(wmsCopyTextarea(text));
}
function wmsCopyTextarea(text){
  const ta=document.createElement('textarea');ta.value=String(text||'');document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);
}
function wmsClearResult(){
  wmsLastResult=null;wmsLastChoices=null;
  const box=document.getElementById('wms-result');if(box)box.innerHTML='';
  const q=document.getElementById('wms-query');if(q)q.value='';
  wmsChangesClearExecutor();
  if(wmsLookupKind==='shipment'){wmsShipmentLastRoutes=null;}
  wmsSetStatus(wmsLookupKind==='recounting'?'Очищено. Настрой фильтры пересчёта.':(wmsLookupKind==='analysis'?'Очищено. Введи ячейку, УТ или ЕО для разбора.':(wmsLookupKind==='picking'?'Очищен экран отбора. Открой товар в заказе WMS и нажми «Обновить отбор».':(wmsLookupKind==='upper'?'Список верхних ярусов очищен.':(wmsLookupKind==='losses'?'Список крупных минусов очищен.':(wmsLookupKind==='shipment'?'Поиск маршрутов очищен.':'Очищено. Введи УТ, ШК, название, ячейку или ЕО.'))))),'');
  wmsRefreshModeButtons();
}
function wmsClearImportText(){const el=document.getElementById('wms-import-text');if(el)el.value='';}
async function wmsPasteImportFromClipboard(){
  try{
    if(!(navigator.clipboard&&navigator.clipboard.readText))throw new Error('clipboard unavailable');
    const text=await navigator.clipboard.readText();
    const el=document.getElementById('wms-import-text'); if(el)el.value=text;
    wmsSetStatus('Вставил из буфера. Жми «Разобрать импорт».','ok');
  }catch(e){wmsSetStatus('Не смог прочитать буфер. Вставь вручную долгим тапом.','err');}
}
function wmsFindStockItems(obj, depth){
  depth=depth||0;
  if(!obj || depth>7)return null;
  if(Array.isArray(obj)){
    if(obj.some(x=>x&&typeof x==='object'&&(x.address||x.product||x.quantity!=null)))return obj;
    for(const x of obj){const r=wmsFindStockItems(x,depth+1);if(r)return r;}
    return null;
  }
  if(typeof obj==='object'){
    if(obj.value&&Array.isArray(obj.value.items))return obj.value.items;
    if(Array.isArray(obj.items))return obj.items;
    if(obj.data&&Array.isArray(obj.data))return obj.data;
    for(const k of Object.keys(obj)){
      const r=wmsFindStockItems(obj[k],depth+1);if(r)return r;
    }
  }
  return null;
}
function wmsLooseJsonParse(text){
  text=String(text||'').trim();
  if(!text)throw new Error('Пустое поле');
  try{return JSON.parse(text);}catch(e){}
  let s=text;
  s=s.replace(/[\u2026…]/g,'null');
  s=s.replace(/([,{]\s*)([A-Za-z_$][\w$]*)(\s*:)/g,'$1"$2"$3');
  s=s.replace(/,\s*([}\]])/g,'$1');
  try{return JSON.parse(s);}catch(e){throw new Error('Не смог разобрать. Скопируй именно raw Response JSON без троеточий.');}
}
function wmsFullName(u){
  u=u||{};
  return [u.lastName,u.firstName,u.middleName].filter(Boolean).join(' ').trim();
}
function wmsQtyPairText(q){
  q=q||{};
  const oldQ = q.oldQuantity;
  const newQ = q.newQuantity;
  if(oldQ==null && newQ==null)return '';
  return String(oldQ??'')+' → '+String(newQ??'');
}
function wmsMapChangeItem(item){
  item=item||{};
  const p=item.product||{};
  const part=item.part||{};
  const src=item.sourceAddress||item.source||{};
  const tgt=item.targetAddress||item.target||{};
  const user=item.responsibleUser||item.executor||{};
  const barcodes=Array.isArray(p.barcodes)?p.barcodes.filter(Boolean):[];
  const sq=item.sourceQuantity||{};
  const tq=item.targetQuantity||{};
  let sourceDelta='';
  let targetDelta='';
  if(sq.oldQuantity!=null || sq.newQuantity!=null){sourceDelta=(Number(sq.newQuantity||0)-Number(sq.oldQuantity||0));}
  if(tq.oldQuantity!=null || tq.newQuantity!=null){targetDelta=(Number(tq.newQuantity||0)-Number(tq.oldQuantity||0));}
  return {
    operationType:String(item.operationType||item.operation||'').trim(),
    operationStartedAt:String(item.operationStartedAt||item.createdAt||item.startedAt||'').trim(),
    operationCompletedAt:String(item.operationCompletedAt||item.completedAt||'').trim(),
    userName:wmsFullName(user),
    productId:String(p.productId||p.id||item.productId||'').trim(),
    name:String(p.name||p.productName||item.productName||item.name||'').trim(),
    nomenclatureCode:String(p.nomenclatureCode||item.nomenclatureCode||'').trim(),
    barcodes:barcodes,
    barcode:String(barcodes[0]||p.barcode||item.barcode||'').trim(),
    imageUrl:String(p.imageUrl||item.imageUrl||'').trim(),
    productionDate:String(part.productionDate||item.productionDate||'').trim(),
    bestBeforeDate:String(part.bestBeforeDate||item.bestBeforeDate||'').trim(),
    sourceCellAddress:String(src.cellAddress||src.fullAddress||src.address||item.sourceCellAddress||'').trim(),
    sourceHandlingUnitBarcode:String(src.handlingUnitBarcode||item.sourceHandlingUnitBarcode||'').trim(),
    targetCellAddress:String(tgt.cellAddress||tgt.fullAddress||tgt.address||item.targetCellAddress||'').trim(),
    targetHandlingUnitBarcode:String(tgt.handlingUnitBarcode||item.targetHandlingUnitBarcode||'').trim(),
    sourceQuantityText:wmsQtyPairText(sq),
    targetQuantityText:wmsQtyPairText(tq),
    sourceDelta:sourceDelta,
    targetDelta:targetDelta,
    type:String(item.type||'').trim(),
    status:String(item.status||'').trim()
  };
}
function wmsFindChangeItems(obj, depth){
  depth=depth||0;
  if(!obj || depth>7)return null;
  if(Array.isArray(obj)){
    if(obj.some(x=>x&&typeof x==='object'&&(x.operationType||x.sourceAddress||x.targetAddress||x.sourceQuantity||x.targetQuantity)))return obj;
    for(const x of obj){const r=wmsFindChangeItems(x,depth+1);if(r)return r;}
    return null;
  }
  if(typeof obj==='object'){
    if(obj.value&&Array.isArray(obj.value.items)&&obj.value.items.some(x=>x&&(x.operationType||x.sourceAddress||x.targetAddress)))return obj.value.items;
    if(Array.isArray(obj.items)&&obj.items.some(x=>x&&(x.operationType||x.sourceAddress||x.targetAddress)))return obj.items;
    for(const k of Object.keys(obj)){const r=wmsFindChangeItems(obj[k],depth+1);if(r)return r;}
  }
  return null;
}
function wmsNormalizeChangesResult(payload){
  const items=wmsFindChangeItems(payload)||[];
  if(!items.length)throw new Error('В ответе не нашёл строки изменения остатка');
  const rows=items.map(wmsMapChangeItem).filter(r=>r.operationType||r.name||r.nomenclatureCode||r.sourceCellAddress||r.targetCellAddress);
  if(!rows.length)throw new Error('Строки изменений есть, но нужных полей не нашёл');
  const first=rows.find(r=>r.name||r.nomenclatureCode)||rows[0]||{};
  return {
    mode:payload._mode||'changes',
    query:payload._query||'',
    cellAddress:payload._cellAddress||'',
    product:{name:first.name||'Изменение остатка', nomenclatureCode:first.nomenclatureCode||'', barcode:first.barcode||'', barcodes:first.barcodes||[], imageUrl:first.imageUrl||'', productId:first.productId||''},
    rows:rows,
    totalRows:rows.length,
    totalQuantity:0,
    total: (payload.value&&payload.value.total)||payload.total||rows.length
  };
}
function wmsMapStockItem(item){
  item=item||{};
  const p=item.product||{};
  const a=item.address||{};
  const loc=item.location||{};
  const part=item.part||{};
  const barcodes=Array.isArray(p.barcodes)?p.barcodes.filter(Boolean):[];
  return {
    cellAddress:String(a.cellAddress||a.address||item.cellAddress||item.cell||'').trim(),
    handlingUnitBarcode:String(a.handlingUnitBarcode||item.handlingUnitBarcode||'').trim(),
    zoneName:String(loc.zoneName||item.zoneName||'').trim(),
    locationName:String(loc.locationName||item.locationName||'').trim(),
    productionDate:String(part.productionDate||item.productionDate||'').trim(),
    bestBeforeDate:String(part.bestBeforeDate||item.bestBeforeDate||'').trim(),
    productId:String(p.productId||p.id||item.productId||'').trim(),
    name:String(p.name||p.productName||item.productName||item.name||'').trim(),
    nomenclatureCode:String(p.nomenclatureCode||item.nomenclatureCode||'').trim(),
    barcodes:barcodes,
    barcode:String(barcodes[0]||p.barcode||item.barcode||'').trim(),
    imageUrl:String(p.imageUrl||item.imageUrl||'').trim(),
    quantity:Number(item.quantity ?? item.totalQuantity ?? 0)||0,
    status:String(item.status||'').trim(),
    type:String(item.type||'').trim()
  };
}
function wmsNormalizeResult(payload){
  if(!payload)throw new Error('Пустой ответ');
  if(payload._kind==='productChoices'||payload._kind==='cellChoices'||payload._kind==='executorChoices')return payload;
  if((payload._mode&&String(payload._mode).indexOf('changes')===0) || wmsFindChangeItems(payload))return wmsNormalizeChangesResult(payload);
  const mode=payload._mode || '';
  if(payload.product && Array.isArray(payload.rows)){
    const rows=payload.rows.map(r=>({
      cellAddress:String(r.cellAddress||''), handlingUnitBarcode:String(r.handlingUnitBarcode||r.hu||''), zoneName:String(r.zoneName||''), locationName:String(r.locationName||''), productionDate:String(r.productionDate||''), bestBeforeDate:String(r.bestBeforeDate||''), quantity:Number(r.quantity||0)||0, status:String(r.status||''), type:String(r.type||''), name:String((payload.product||{}).name||''), nomenclatureCode:String((payload.product||{}).nomenclatureCode||''), barcode:String((payload.product||{}).barcode||''), barcodes:(payload.product||{}).barcodes||[]
    }));
    return {mode:mode||'product',product:payload.product,rows,totalRows:rows.length,totalQuantity:rows.reduce((s,r)=>s+(Number(r.quantity)||0),0)};
  }
  const items=wmsFindStockItems(payload)||[];
  if(!items.length)throw new Error('В ответе не нашёл value.items / items со строками остатков');
  const rows=items.map(wmsMapStockItem).filter(r=>r.cellAddress||r.nomenclatureCode||r.name||r.quantity);
  if(!rows.length)throw new Error('Строки есть, но нужных полей товара/ячейки не нашёл');
  const first=rows.find(r=>r.name||r.nomenclatureCode||r.barcode)||rows[0]||{};
  const cellAddress=payload._cellAddress||first.cellAddress||'';
  return {
    mode:mode||'product',
    cellAddress:cellAddress,
    product: mode==='cell' ? {name:'Содержимое ячейки '+cellAddress, nomenclatureCode:'', barcode:'', barcodes:[], imageUrl:'', productId:''} : {name:first.name||'', nomenclatureCode:first.nomenclatureCode||'', barcode:first.barcode||'', barcodes:first.barcodes||[], imageUrl:first.imageUrl||'', productId:first.productId||''},
    rows:rows,
    totalRows:rows.length,
    totalQuantity:rows.reduce((s,r)=>s+(Number(r.quantity)||0),0)
  };
}
function wmsFormatCells(result){
  const rows=wmsApplyStorageFilter((result&&result.rows)||[]);
  if((result&&String(result.mode||'').indexOf('changes')===0)){
    return rows.map(r=>[
      wmsDateShort(r.operationStartedAt),
      r.operationType||'Операция',
      r.nomenclatureCode||'',
      r.name||'',
      r.sourceCellAddress?('из '+r.sourceCellAddress):'',
      r.targetCellAddress?('в '+r.targetCellAddress):'',
      r.sourceQuantityText?('источник '+r.sourceQuantityText):'',
      r.targetQuantityText?('цель '+r.targetQuantityText):'',
      r.sourceHandlingUnitBarcode?('HU '+r.sourceHandlingUnitBarcode):'',
      r.userName||''
    ].filter(Boolean).join(' — ')).join('\n');
  }
  if((result&&result.mode)==='cell' || (result&&result.mode)==='hu'){
    return rows.map(r=>[
      r.nomenclatureCode||'—',
      r.name||'Товар',
      (Number(r.quantity)||0)+' шт',
      r.bestBeforeDate?('до '+r.bestBeforeDate):'',
      r.handlingUnitBarcode?('HU '+r.handlingUnitBarcode):'',
      r.status||''
    ].filter(Boolean).join(' — ')).join('\n');
  }
  return rows.map(r=>[
    r.cellAddress||'—',
    (Number(r.quantity)||0)+' шт',
    r.bestBeforeDate?('до '+r.bestBeforeDate):'',
    r.handlingUnitBarcode?('HU '+r.handlingUnitBarcode):'',
    r.status||''
  ].filter(Boolean).join(' — ')).join('\n');
}
function wmsRenderChoices(payload){
  wmsLastChoices=payload;
  wmsLastResult=null;
  const box=document.getElementById('wms-result'); if(!box)return;
  if(payload._kind==='productChoices'){
    const products=payload.products||[];
    const html=products.map((p,i)=>{
      const safeId=escHtml(p.productId||'');
      const score=p.matchScore!=null?(' · совпадение '+p.matchScore):'';
      const variant=p.matchVariant?(' · искал: '+p.matchVariant):'';
      return '<button class="wms-choice" onclick="wmsLookupChosenProductId(\''+safeId+'\')">'+
        (p.imageUrl?'<img class="wms-choice-img" src="'+escHtml(p.imageUrl)+'" loading="lazy" onerror="this.style.display=\'none\'">':'')+
        '<span><b>'+escHtml(p.name||'Товар')+'</b><small>'+escHtml((p.nomenclatureCode||'')+score+variant)+'</small></span></button>';
    }).join('');
    box.innerHTML='<div class="wms-card"><div class="wms-card-body"><div class="wms-product-name">Найдено товаров: '+escHtml(payload.total||products.length)+'</div><div class="wms-meta">Лучшие совпадения сверху. Можно вводить криво: «сыр гол 150», «10433877», ШК, ячейку или ЕО.</div></div></div><div class="wms-choices">'+html+'</div>';
    return;
  }
  if(payload._kind==='cellChoices'){
    const cells=payload.cells||[];
    const html=cells.map(c=>'<button class="wms-choice" onclick="wmsLookupChosenCellId(\''+escHtml(c.cellId||'')+'\',\''+escHtml(c.fullAddress||'')+'\')"><span><b>'+escHtml(c.fullAddress||'Ячейка')+'</b><small>'+escHtml(c.cellId||'')+'</small></span></button>').join('');
    box.innerHTML='<div class="wms-card"><div class="wms-card-body"><div class="wms-product-name">Найдено ячеек: '+escHtml(cells.length)+'</div><div class="wms-meta">Выбери ячейку, потом подтяну содержимое.</div></div></div><div class="wms-choices">'+html+'</div>';
  }
  if(payload._kind==='executorChoices'){
    const executors=payload.executors||[];
    const html=executors.map(e=>{
      const name=[e.lastName,e.firstName,e.middleName].filter(Boolean).join(' ');
      return '<button class="wms-choice" onclick="wmsLookupChangesForExecutor('+JSON.stringify(String(e.id||''))+','+JSON.stringify(name)+')"><span><b>'+escHtml(name)+'</b></span></button>';
    }).join('');
    box.innerHTML='<div class="wms-card"><div class="wms-card-body"><div class="wms-product-name">Найдено исполнителей: '+escHtml(executors.length)+'</div><div class="wms-meta">Выбери исполнителя — загружу все его изменения остатков.</div></div></div><div class="wms-choices">'+html+'</div>';
  }
}
function wmsDateShort(s){
  if(!s)return '';
  try{return new Date(s).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch(e){return String(s);}
}
function wmsRenderResult(result){
  wmsLastResult=result;wmsLastChoices=null;
  const box=document.getElementById('wms-result'); if(!box)return;
  const p=(result&&result.product)||{};
  const rows=(result&&result.rows)||[];
  const barcode=p.barcode || (Array.isArray(p.barcodes)?p.barcodes[0]:'') || '';
  if(!rows.length){box.innerHTML='<div class="no-results">Нет строк остатков</div>';return;}
  let tableHead, rowsHtml, title, meta;
  if(String(result.mode||'').indexOf('changes')===0){
    title='Изменение остатка'+(result.query?': '+result.query:'');
    meta='Строк: <b>'+escHtml(result.total||result.totalRows||rows.length)+'</b>'+(p.nomenclatureCode?(' · <b>'+escHtml(p.nomenclatureCode)+'</b>'):'')+(p.name&&p.name!=='Изменение остатка'?('<br>'+escHtml(p.name)):'');
    tableHead='<tr><th>Дата</th><th>Операция</th><th>Товар</th><th>УТ</th><th>Откуда</th><th>Куда</th><th>Источник</th><th>Цель</th><th>HU</th><th>Исполнитель</th></tr>';
    rowsHtml=rows.map(r=>'<tr>'+[
      '<td>'+escHtml(wmsDateShort(r.operationStartedAt))+'</td>',
      '<td><b>'+escHtml(r.operationType||'')+'</b></td>',
      '<td><b>'+escHtml(r.name||'—')+'</b><br><small>'+escHtml(r.bestBeforeDate?('до '+r.bestBeforeDate):'')+'</small></td>',
      '<td>'+escHtml(r.nomenclatureCode||'')+'</td>',
      '<td>'+escHtml(r.sourceCellAddress||'')+'</td>',
      '<td>'+escHtml(r.targetCellAddress||'')+'</td>',
      '<td>'+escHtml(r.sourceQuantityText||'')+'</td>',
      '<td>'+escHtml(r.targetQuantityText||'')+'</td>',
      '<td>'+escHtml(r.sourceHandlingUnitBarcode||r.targetHandlingUnitBarcode||'')+'</td>',
      '<td>'+escHtml(r.userName||'')+'</td>'
    ].join('')+'</tr>').join('');
  }else if(result.mode==='cell' || result.mode==='hu'){
    const isHu=result.mode==='hu';
    title=p.name||(isHu?('Содержимое ЕО '+(result.query||'')):('Содержимое ячейки '+(result.cellAddress||'')));
    meta=(isHu?('ЕО/HU: <b>'+escHtml(result.query||rows[0].handlingUnitBarcode||'')+'</b>'):('Ячейка: <b>'+escHtml(result.cellAddress||rows[0].cellAddress||'')+'</b>'))+' · Строк: <b>'+escHtml(result.totalRows||rows.length)+'</b> · Остаток: <b>'+escHtml(result.totalQuantity||0)+'</b> шт';
    tableHead='<tr><th>Товар</th><th>УТ</th><th>ШК</th><th>Кол-во</th><th>Срок</th><th>HU</th><th>Статус</th></tr>';
    rowsHtml=rows.map(r=>'<tr>'+[
      '<td><b>'+escHtml(r.name||'—')+'</b></td>',
      '<td>'+escHtml(r.nomenclatureCode||'')+'</td>',
      '<td>'+escHtml(r.barcode||'')+'</td>',
      '<td class="num">'+escHtml(r.quantity)+'</td>',
      '<td>'+escHtml(r.bestBeforeDate||'')+'</td>',
      '<td>'+escHtml(r.handlingUnitBarcode||'')+'</td>',
      '<td>'+escHtml(r.status||'')+'</td>'
    ].join('')+'</tr>').join('');
  }else{
    title=p.name||rows[0].name||'Товар из ВМС';
    meta='<b>'+escHtml(p.nomenclatureCode||rows[0].nomenclatureCode||'')+'</b>'+(barcode?' · ШК: '+escHtml(barcode):'')+'<br>Строк: <b>'+escHtml(result.totalRows||rows.length)+'</b> · Остаток: <b>'+escHtml(result.totalQuantity||0)+'</b> шт';
    tableHead='<tr><th>Ячейка</th><th>Кол-во</th><th>Зона</th><th>Локация</th><th>Срок</th><th>HU</th><th>Статус</th></tr>';
    rowsHtml=rows.map(r=>'<tr>'+[
      '<td><b>'+escHtml(r.cellAddress||'—')+'</b></td>',
      '<td class="num">'+escHtml(r.quantity)+'</td>',
      '<td>'+escHtml(r.zoneName||'')+'</td>',
      '<td>'+escHtml(r.locationName||'')+'</td>',
      '<td>'+escHtml(r.bestBeforeDate||'')+'</td>',
      '<td>'+escHtml(r.handlingUnitBarcode||'')+'</td>',
      '<td>'+escHtml(r.status||'')+'</td>'
    ].join('')+'</tr>').join('');
  }
  box.innerHTML=
    '<div class="wms-card">'+
      (p.imageUrl?'<img class="wms-img" src="'+escHtml(p.imageUrl)+'" loading="lazy" onerror="this.style.display=\'none\'">':'')+
      '<div class="wms-card-body"><div class="wms-product-name">'+escHtml(title)+'</div>'+ 
      '<div class="wms-meta">'+meta+'</div></div>'+ 
    '</div>'+ 
    '<div class="wms-actions wms-result-actions">'+
      wmsStorageToggleButton()+
      '<button class="exi-btn primary" onclick="wmsCopyCells()">Скопировать строки</button>'+ 
      wmsCopySplitButtons()+ 
    '</div>'+ 
    '<div class="wms-table-wrap"><table class="wms-table"><thead>'+tableHead+'</thead><tbody>'+rowsHtml+'</tbody></table></div>';
}
function wmsCopyCells(){
  if(!wmsLastResult){alert('Нет результата ВМС');return;}
  wmsCopyFallback(wmsFormatCells(wmsLastResult)).then(()=>wmsSetStatus('Скопировано.','ok'));
}
function wmsUniqueValues(list){
  const out=[]; const seen=new Set();
  (list||[]).forEach(v=>{v=String(v||'').trim(); if(!v)return; const k=v.toLowerCase(); if(seen.has(k))return; seen.add(k); out.push(v);});
  return out;
}
function wmsFieldValues(field){
  if(!wmsLastResult)return [];
  const p=wmsLastResult.product||{};
  const rows=(wmsLastResult.rows||[]);
  if(field==='ut')return wmsUniqueValues([p.nomenclatureCode].concat(rows.map(r=>r.nomenclatureCode)));
  if(field==='name')return wmsUniqueValues([p.name].concat(rows.map(r=>r.name)));
  if(field==='barcode'){
    const vals=[];
    if(p.barcode)vals.push(p.barcode);
    if(Array.isArray(p.barcodes))p.barcodes.forEach(b=>vals.push(b));
    rows.forEach(r=>{if(r.barcode)vals.push(r.barcode); if(Array.isArray(r.barcodes))r.barcodes.forEach(b=>vals.push(b));});
    return wmsUniqueValues(vals);
  }
  return [];
}
function wmsCopyProductField(field){
  if(!wmsLastResult){alert('Нет результата WMS');return;}
  const vals=wmsFieldValues(field);
  if(!vals.length){wmsSetStatus('Нет данных для копирования.','err');return;}
  const label=field==='ut'?'УТ':(field==='barcode'?'ШК':'Наименование');
  wmsCopyFallback(vals.join('\n')).then(()=>wmsSetStatus(label+' скопировано: '+vals.length,'ok'));
}
function wmsCopyProduct(){
  if(!wmsLastResult){alert('Нет результата WMS');return;}
  const text=[wmsFieldValues('ut').join('\n'),wmsFieldValues('barcode').join('\n'),wmsFieldValues('name').join('\n')].filter(Boolean).join('\n');
  wmsCopyFallback(text).then(()=>wmsSetStatus('УТ/ШК/наименования скопированы.','ok'));
}
function wmsCopySplitButtons(){
  return '<div class="wms-copy-split"><button class="exi-btn" onclick="wmsCopyProductField(\'ut\')">Копир УТ</button><button class="exi-btn" onclick="wmsCopyProductField(\'barcode\')">Копир ШК</button><button class="exi-btn" onclick="wmsCopyProductField(\'name\')">Копир название</button></div>';
}

function wmsSaveAsProblem(){
  if(!wmsLastResult){alert('Нет результата ВМС');return;}
  const p=wmsLastResult.product||{};
  const first=(wmsLastResult.rows||[])[0]||{};
  const row=createMeta({id:Date.now()+Math.floor(Math.random()*1000),type:'проверить ВМС',ut:p.nomenclatureCode||first.nomenclatureCode||'',name:p.name||first.name||'',cell:first.cellAddress||wmsLastResult.cellAddress||'',sys:Number(wmsLastResult.totalQuantity||0)||0,fact:0,status:'нужно ВМС',needWms:1,comment:'Импорт из ВМС: '+wmsFormatCells(wmsLastResult).slice(0,900),archived:0,createdAt:new Date().toLocaleString('ru-RU'),updatedAt:new Date().toLocaleString('ru-RU')});
  const arr=getProblems();arr.unshift(row);set('problems_log',arr);logAction('problem','Создана проблема из ВМС: '+(row.ut||row.name||row.cell||'ВМС'),{ut:row.ut,cell:row.cell});
  wmsSetStatus('Добавлено в проблемы.','ok');
}


// ── WMS MOBILE CHANGE CARDS v41 ──
function wmsOperationCategory(code){
  const c=String(code||'').trim().toUpperCase();
  if(!c)return 'other';
  if(/RECOUNTING|UNEXPECTED_STOCK_DISCREPANCY_CONFIRMATION|NOT_FOUND_STOCK_DISCREPANCY_CONFIRMATION|INVENT|RECOUNT|COUNT|STOCK_TAKE|STOCKTAKE|AUDIT/.test(c))return 'inventory';
  if(/FREE_MOVEMENT|MOVE_TO_READY_ORDERS_ZONE|PALLET_SELECTION_MOVE_TO_PICK_BY_LINE|RELOC|MOVE|MOVEMENT|TRANSFER|TRANSPORT/.test(c))return 'move';
  if(/STORAGE_PLACEMENT|PUT.?AWAY|PLACEMENT|PLACE|STORAGE|STORE/.test(c))return 'placement';
  if(/PIECE_SELECTION_PICKING_REPLENISHMENT|REPLENISH|REFILL/.test(c))return 'replenishment';
  if(/PICK_BY_LINE|PIECE_SELECTION_PICKING|PIECE_SELECTION_PICKING_COMPLETE|PIECE_SELECTION_HANDLING_UNIT_DESCENT/.test(c))return 'picking';
  if(/HANDLING_UNIT_CONSOLIDATION|SHIPMENT_HANDLING_UNIT_CONSOLIDATION|CONSOLIDATION_BY_PRODUCT/.test(c))return 'consolidation';
  if(/MOVE_TO_SHIPMENT_ZONE|SHIPMENT_TASK|SHIPMENT_ROUTE|SHIPMENT|ROUTE|ORDER/.test(c))return 'shipment';
  if(/LOAD|LOADING|TC|TRUCK|VEHICLE/.test(c))return 'load';
  if(/SMART_IMPORT_RECEIVING|RECEIVING|ACCEPT|RECEIPT|RECEIVE|ARRIVAL|INBOUND/.test(c))return 'acceptance';
  if(/DEFECTIVE_STOCK|WRITE.?OFF|DISPOS|DAMAGE|LOSS|DEFECT|SCRAP|WASTE/.test(c))return 'writeoff';
  if(/RESERVE|RESERVATION/.test(c))return 'reserve';
  if(/RETURN/.test(c))return 'return';
  if(/CANCEL|CANCELLATION|ROLLBACK/.test(c))return 'cancel';
  return 'other';
}
function wmsOperationLabel(code){
  const c=String(code||'').trim();
  const up=c.toUpperCase();
  const map={
    SHIPMENT_ROUTE:'Отгрузка по маршруту',
    SHIPMENT_TASK:'Задача отгрузки',
    MOVE_TO_SHIPMENT_ZONE:'Перемещение в зону отгрузки',
    SHIPMENT_HANDLING_UNIT_CONSOLIDATION:'Консолидация ЕО отгрузки',
    SHIPMENT:'Отгрузка',
    LOADING_TO_TC:'Загрузка в ТС',
    LOAD_TO_TC:'Загрузка в ТС',
    TC_LOADING:'Загрузка в ТС',
    FREE_MOVEMENT:'Свободное перемещение',
    MOVE_TO_READY_ORDERS_ZONE:'В зону готовых заказов',
    PALLET_SELECTION_MOVE_TO_PICK_BY_LINE:'Паллету в отбор по линии',
    MOVEMENT:'Перемещение',
    RELOCATION:'Перемещение',
    MOVE:'Перемещение',
    RECEIVING:'Приёмка',
    SMART_IMPORT_RECEIVING:'Smart Import приёмка',
    ACCEPTANCE:'Приёмка',
    RECEIPT:'Приёмка',
    RECOUNTING:'Пересчёт',
    UNEXPECTED_STOCK_DISCREPANCY_CONFIRMATION:'Подтверждение излишка',
    NOT_FOUND_STOCK_DISCREPANCY_CONFIRMATION:'Подтверждение недостачи',
    INVENTORY:'Инвентаризация',
    INVENTORY_CORRECTION:'Корректировка инвентаризации',
    DEFECTIVE_STOCK_PICKING:'Отбор брака',
    DEFECTIVE_STOCK_INSPECTION:'Проверка брака',
    DEFECTIVE_STOCK_WRITE_OFF:'Списание брака',
    WRITE_OFF:'Списание',
    CANCELLATION:'Отмена',
    RETURN:'Возврат',
    RESERVE:'Резерв',
    UNRESERVE:'Снятие резерва',
    PICK_BY_LINE:'Отбор по линии',
    PIECE_SELECTION_PICKING:'Поштучный отбор',
    PIECE_SELECTION_PICKING_COMPLETE:'Завершение отбора',
    PIECE_SELECTION_HANDLING_UNIT_DESCENT:'Спуск ЕО для отбора',
    PIECE_SELECTION_PICKING_REPLENISHMENT:'Пополнение отбора',
    HANDLING_UNIT_CONSOLIDATION:'Консолидация ЕО',
    CONSOLIDATION_BY_PRODUCT:'Консолидация по товару',
    STORAGE_PLACEMENT:'Размещение на хранение',
    UNKNOWN:'Неизвестная операция'
  };
  if(map[up])return map[up];
  const cat=wmsOperationCategory(up);
  const labels={
    inventory:'Инвентаризация',
    move:'Перемещение',
    placement:'Размещение',
    replenishment:'Пополнение',
    picking:'Отбор',
    consolidation:'Консолидация',
    shipment:'Отгрузка',
    load:'Загрузка в ТС',
    acceptance:'Приёмка',
    writeoff:'Списание/брак',
    reserve:'Резерв',
    return:'Возврат',
    cancel:'Отмена',
    other:c||'Операция'
  };
  return labels[cat] || c || 'Операция';
}
function wmsDeltaClass(delta){
  const n=Number(delta||0);
  if(n>0)return 'pos';
  if(n<0)return 'neg';
  return 'zero';
}
function wmsDeltaText(delta){
  if(delta===''||delta==null)return '';
  const n=Number(delta||0);
  return (n>0?'+':'')+String(n);
}
function wmsChangeMainDelta(r){
  if(r.targetDelta!=='' && Number(r.targetDelta)!==0)return Number(r.targetDelta);
  if(r.sourceDelta!=='' && Number(r.sourceDelta)!==0)return Number(r.sourceDelta);
  if(r.targetDelta!=='')return Number(r.targetDelta||0);
  if(r.sourceDelta!=='')return Number(r.sourceDelta||0);
  return 0;
}
function wmsChangeDirectionText(r){
  const src=r.sourceCellAddress||'';
  const tgt=r.targetCellAddress||'';
  if(src && tgt)return src+' → '+tgt;
  if(src)return src;
  if(tgt)return '→ '+tgt;
  return 'Ячейка не указана';
}
function wmsChangeHuText(r){
  const src=r.sourceHandlingUnitBarcode||'';
  const tgt=r.targetHandlingUnitBarcode||'';
  if(src && tgt && src!==tgt)return src+' → '+tgt;
  return src||tgt||'';
}
function wmsIsOutgoing(r){
  return Number(r.sourceDelta||0)<0 || /SHIPMENT|WRITE_OFF|OUT|LOAD/i.test(String(r.operationType||''));
}
function wmsIsIncoming(r){
  return Number(r.targetDelta||0)>0 || /ACCEPT|RECEIPT|IN/i.test(String(r.operationType||''));
}
function wmsChangeDirectionFilterRows(rows, filter){
  rows=rows||[];
  const f=filter||'all';
  if(f==='out')return rows.filter(wmsIsOutgoing);
  if(f==='in')return rows.filter(wmsIsIncoming);
  if(f==='zero')return rows.filter(r=>Number(wmsChangeMainDelta(r)||0)===0);
  return rows;
}
function wmsChangeQuickFilterRows(rows, filter){
  rows=rows||[];
  const f=filter||'all';
  if(f==='out')return rows.filter(wmsIsOutgoing);
  if(f==='in')return rows.filter(wmsIsIncoming);
  if(f==='shipment')return rows.filter(r=>wmsOperationCategory(r.operationType)==='shipment');
  if(f==='load')return rows.filter(r=>wmsOperationCategory(r.operationType)==='load');
  if(f==='inventory')return rows.filter(r=>wmsOperationCategory(r.operationType)==='inventory');
  if(f==='move')return rows.filter(r=>wmsOperationCategory(r.operationType)==='move');
  if(f==='placement')return rows.filter(r=>wmsOperationCategory(r.operationType)==='placement');
  if(f==='replenishment')return rows.filter(r=>wmsOperationCategory(r.operationType)==='replenishment');
  if(f==='acceptance')return rows.filter(r=>wmsOperationCategory(r.operationType)==='acceptance');
  if(f==='writeoff')return rows.filter(r=>wmsOperationCategory(r.operationType)==='writeoff');
  if(f==='picking')return rows.filter(r=>wmsOperationCategory(r.operationType)==='picking');
  if(f==='consolidation')return rows.filter(r=>wmsOperationCategory(r.operationType)==='consolidation');
  if(f==='other')return rows.filter(r=>wmsOperationCategory(r.operationType)==='other');
  if(f==='zero')return rows.filter(r=>Number(wmsChangeMainDelta(r)||0)===0);
  return rows;
}
function wmsFilteredChangeRows(rows){
  rows=wmsApplyStorageFilter(rows||[]);
  rows=wmsChangeDirectionFilterRows(rows,wmsChangeDirectionFilter||'all');
  rows=wmsChangeQuickFilterRows(rows,wmsChangeFilter||'all');
  const op=String(wmsChangeOperationFilter||'all');
  if(op && op!=='all')rows=rows.filter(r=>String(r.operationType||'')===op);
  const ex=String(wmsChangesExecutorFilter||'').trim().toLowerCase();
  if(ex)rows=rows.filter(r=>String(r.userName||'').toLowerCase().includes(ex));
  const dt=String(wmsChangesDateFilter||'').trim();
  if(dt)rows=rows.filter(r=>wmsDateIsoDay(r.operationStartedAt||r.operationCompletedAt)===dt);
  return rows;
}
function wmsRefreshChangesIfNeeded(){
  if(wmsLastResult && String(wmsLastResult.mode||'').indexOf('changes')===0){
    wmsRenderResult(wmsLastResult);
  }
}
function wmsSetChangeFilter(filter){
  wmsChangeFilter=filter||'all';
  if(wmsChangeFilter!=='all')wmsChangeOperationFilter='all';
  wmsRefreshChangesIfNeeded();
}
function wmsSetChangeDirectionFilter(filter){
  wmsChangeDirectionFilter=filter||'all';
  wmsRefreshChangesIfNeeded();
}
function wmsSetChangeOperationFilter(code){
  wmsChangeOperationFilter=code||'all';
  if(wmsChangeOperationFilter!=='all')wmsChangeFilter='all';
  wmsRefreshChangesIfNeeded();
}
function wmsSetChangeOperationSelect(value){
  const v=String(value||'all');
  if(v==='all'){wmsChangeFilter='all';wmsChangeOperationFilter='all';}
  else if(v.indexOf('cat:')===0){wmsChangeFilter=v.slice(4)||'all';wmsChangeOperationFilter='all';}
  else if(v.indexOf('op:')===0){wmsChangeFilter='all';wmsChangeOperationFilter=v.slice(3)||'all';}
  else {wmsChangeFilter=v;wmsChangeOperationFilter='all';}
  wmsRefreshChangesIfNeeded();
}
function wmsOnChangesExecutorInput(val){
  wmsChangesExecutorFilter=String(val||'').trim();
  wmsChangesExecutorId='';
  wmsRefreshChangesIfNeeded();
}
async function wmsSearchChangesExecutors(){
  const inp=document.getElementById('wms-ch-executor-input');
  const q=inp?String(inp.value||'').trim():'';
  const listEl=document.getElementById('wms-ch-executor-list');
  if(listEl){listEl.style.display='';listEl.innerHTML='<span style="color:var(--muted);font-size:12px;">Ищу исполнителей…</span>';}
  try{
    const raw=await wmsCallNative('lookupWmsChangesExecutors',[q],15000);
    const data=typeof raw==='string'?JSON.parse(raw):raw;
    const executors=Array.isArray(data.executors)?data.executors:[];
    if(!listEl)return;
    if(!executors.length){listEl.innerHTML='<span style="color:var(--muted);font-size:12px;">Исполнители не найдены</span>';listEl.style.display='';return;}
    listEl.style.display='';
    listEl.innerHTML='<div class="wms-change-filters">'+
      executors.slice(0,30).map(e=>{
        const name=[e.lastName,e.firstName,e.middleName].filter(Boolean).join(' ');
        return '<button class="wms-filter-chip" onclick="wmsChangesSelectExecutor('+JSON.stringify(String(e.id||''))+','+JSON.stringify(name)+')">'+escHtml(name)+'</button>';
      }).join('')+
    '</div>';
  }catch(err){
    if(listEl){listEl.innerHTML='<span style="color:var(--err,#d44);font-size:12px;">Ошибка: '+escHtml(String((err&&err.message)||err))+'</span>';listEl.style.display='';}
  }
}
function wmsChangesSelectExecutor(id,name){
  wmsChangesExecutorId=String(id||'');
  wmsChangesExecutorFilter=String(name||'');
  const inp=document.getElementById('wms-ch-executor-input');
  if(inp)inp.value=wmsChangesExecutorFilter;
  const listEl=document.getElementById('wms-ch-executor-list');
  if(listEl)listEl.style.display='none';
  wmsRefreshChangesIfNeeded();
}
function wmsChangesClearExecutor(){
  wmsChangesExecutorFilter='';
  wmsChangesExecutorId='';
  wmsChangesDateFilter='';
  const inp=document.getElementById('wms-ch-executor-input');
  if(inp)inp.value='';
  const listEl=document.getElementById('wms-ch-executor-list');
  if(listEl)listEl.style.display='none';
  const dt=document.getElementById('wms-ch-date-input');
  if(dt)dt.value='';
  wmsRefreshChangesIfNeeded();
}
function wmsOnChangesDateInput(val){
  wmsChangesDateFilter=String(val||'').trim();
  wmsRefreshChangesIfNeeded();
}
function wmsChangesClearDate(){
  wmsChangesDateFilter='';
  const dt=document.getElementById('wms-ch-date-input');
  if(dt)dt.value='';
  wmsRefreshChangesIfNeeded();
}
function wmsChangeFilterButton(key,label,count){
  const active=(wmsChangeFilter||'all')===key && (wmsChangeOperationFilter||'all')==='all';
  return '<button class="wms-filter-chip '+(active?'active':'')+'" onclick="wmsSetChangeFilter(\''+key+'\')">'+escHtml(label)+(count!=null?' <b>'+escHtml(count)+'</b>':'')+'</button>';
}
function wmsChangeOperationButton(code,count){
  const c=String(code||'');
  const active=(wmsChangeOperationFilter||'all')===c;
  const label=wmsOperationLabel(c);
  const shortCode=(label!==c && c)?' <small>'+escHtml(c)+'</small>':'';
  return '<button class="wms-filter-chip '+(active?'active':'')+'" onclick="wmsSetChangeOperationFilter(decodeURIComponent(\''+encodeURIComponent(c)+'\'))">'+escHtml(label)+shortCode+(count!=null?' <b>'+escHtml(count)+'</b>':'')+'</button>';
}
function wmsChangeOperationCounts(rows){
  const counts={};
  (rows||[]).forEach(r=>{const code=String(r.operationType||'').trim(); if(code)counts[code]=(counts[code]||0)+1;});
  return counts;
}
function wmsChangesSummaryHtml(base){
  base=base||[];
  const total=base.length;
  const counts=wmsChangeOperationCounts(base);
  const codes=Object.keys(counts).sort((a,b)=>counts[b]-counts[a] || a.localeCompare(b,'ru'));
  const chips=codes.map(c=>'<div style="flex:1;min-width:88px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:8px 6px;text-align:center;">'+
      '<div style="font-family:\'Spectral\',serif;font-weight:700;font-size:24px;line-height:1;color:var(--gold);">'+counts[c]+'</div>'+
      '<div style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:9px;letter-spacing:.5px;color:var(--muted);margin-top:4px;">'+escHtml(wmsOperationLabel(c))+'</div></div>').join('');
  return '<div style="background:var(--surface);border:1px solid var(--gold);border-radius:12px;padding:12px;margin-bottom:12px;">'+
      '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:'+(chips?'10px':'0')+';">'+
        '<span style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:11px;letter-spacing:1px;color:var(--gold);">Сделано операций</span>'+
        '<span style="font-family:\'Spectral\',serif;font-weight:700;font-size:36px;line-height:1;color:var(--text);">'+total+'</span>'+
      '</div>'+
      (chips?'<div style="display:flex;gap:6px;flex-wrap:wrap;">'+chips+'</div>':'')+
    '</div>';
}
function wmsChangeOperationChips(rows){
  rows=rows||[];
  const counts=wmsChangeOperationCounts(rows);
  const codes=Object.keys(counts).sort((a,b)=>counts[b]-counts[a] || a.localeCompare(b,'ru'));
  if(!codes.length)return '';
  return '<div class="wms-filter-title">Операции из ВМС</div><div class="wms-change-filters wms-operation-filters">'+
    '<button class="wms-filter-chip '+((wmsChangeOperationFilter||'all')==='all'?'active':'')+'" onclick="wmsSetChangeOperationFilter(\'all\')">Любая операция <b>'+escHtml(rows.length)+'</b></button>'+
    codes.map(c=>wmsChangeOperationButton(c,counts[c])).join('')+
  '</div>';
}
function wmsSelectOption(value,label,selected){
  return '<option value="'+escHtml(value)+'" '+(selected?'selected':'')+'>'+escHtml(label)+'</option>';
}
function wmsChangeCompactFiltersHtml(base){
  base=base||[];
  const outCount=base.filter(wmsIsOutgoing).length;
  const inCount=base.filter(wmsIsIncoming).length;
  const zeroCount=base.filter(r=>Number(wmsChangeMainDelta(r)||0)===0).length;
  const countCat=(cat)=>base.filter(r=>wmsOperationCategory(r.operationType)===cat).length;
  const catOptions=[
    ['shipment','Отгрузка'],['load','Загрузка'],['inventory','Инвентаризация'],['move','Перемещение'],
    ['placement','Размещение'],['replenishment','Пополнение'],['acceptance','Приёмка'],['writeoff','Списание/брак'],
    ['picking','Отбор'],['consolidation','Консолидация'],['other','Другое']
  ];
  const opCounts=wmsChangeOperationCounts(base);
  const opCodes=Object.keys(opCounts).sort((a,b)=>opCounts[b]-opCounts[a] || a.localeCompare(b,'ru'));
  const selectedOp=(wmsChangeOperationFilter&&wmsChangeOperationFilter!=='all')?'op:'+wmsChangeOperationFilter:((wmsChangeFilter&&wmsChangeFilter!=='all')?'cat:'+wmsChangeFilter:'all');
  let opOptions=wmsSelectOption('all','Все операции · '+base.length,selectedOp==='all');
  opOptions += '<option disabled>──── группы ────</option>';
  catOptions.forEach(([key,label])=>{const n=countCat(key); if(n>0)opOptions += wmsSelectOption('cat:'+key,label+' · '+n,selectedOp==='cat:'+key);});
  if(opCodes.length){
    opOptions += '<option disabled>──── коды ВМС ────</option>';
    opCodes.forEach(code=>{opOptions += wmsSelectOption('op:'+code,wmsOperationLabel(code)+' / '+code+' · '+opCounts[code],selectedOp==='op:'+code);});
  }
  const dir=wmsChangeDirectionFilter||'all';
  let dirOptions='';
  dirOptions += wmsSelectOption('all','Все изменения · '+base.length,dir==='all');
  dirOptions += wmsSelectOption('out','Убыло · '+outCount,dir==='out');
  dirOptions += wmsSelectOption('in','Пришло · '+inCount,dir==='in');
  dirOptions += wmsSelectOption('zero','Без изменения · '+zeroCount,dir==='zero');
  return '<div class="wms-filter-title">Фильтры</div>'+
    '<div class="wms-compact-filters">'+
      '<label><span>Операция</span><select class="wms-select" onchange="wmsSetChangeOperationSelect(this.value)">'+opOptions+'</select></label>'+
      '<label><span>Изменение</span><select class="wms-select" onchange="wmsSetChangeDirectionFilter(this.value)">'+dirOptions+'</select></label>'+
      '<button class="wms-storage-compact '+(wmsStorageOnly?'active':'')+'" onclick="wmsToggleStorageOnly()">HH/SH</button>'+
    '</div>';
}
function wmsChangeCardsHtml(rows){
  if(!rows.length)return '<div class="no-results">По этому фильтру строк нет</div>';
  return '<div class="wms-change-list">'+rows.map((r,idx)=>{
    const delta=wmsChangeMainDelta(r);
    const deltaCls=wmsDeltaClass(delta);
    const op=wmsOperationLabel(r.operationType);
    const opCode=(r.operationType && op!==r.operationType)?r.operationType:'';
    const hu=wmsChangeHuText(r);
    const part=[r.productionDate,r.bestBeforeDate].filter(Boolean).join(' — ');
    const suspect=(Number(delta)<0 && !r.targetCellAddress) || (/SHIPMENT/i.test(String(r.operationType||'')) && Number(delta)<0);
    const qtyLine=[r.sourceQuantityText?('Источник: '+r.sourceQuantityText):'',r.targetQuantityText?('Цель: '+r.targetQuantityText):''].filter(Boolean).join(' · ');
    return '<div class="wms-change-card '+deltaCls+(suspect?' suspect':'')+'">'+
      '<div class="wms-change-top">'+
        '<div class="wms-change-cell">'+escHtml(wmsChangeDirectionText(r))+'</div>'+ 
        '<div class="wms-delta '+deltaCls+'">'+escHtml(wmsDeltaText(delta))+'</div>'+ 
      '</div>'+ 
      '<div class="wms-change-op"><b>'+escHtml(op)+'</b>'+(opCode?' <small>'+escHtml(opCode)+'</small>':'')+(hu?' · ЕО '+escHtml(hu):'')+'</div>'+ 
      '<div class="wms-change-name">'+escHtml(r.name||'Товар')+'</div>'+ 
      '<div class="wms-change-meta">'+[r.nomenclatureCode||'',part?('Партия: '+part):'',qtyLine,r.userName?('Исполнитель: '+r.userName):'',r.operationStartedAt?('Время: '+wmsDateShort(r.operationStartedAt)):''].filter(Boolean).map(escHtml).join('<br>')+'</div>'+ 
      '<div class="wms-card-mini-actions">'+
        '<button class="exi-btn" onclick="wmsCopyChangeRow('+idx+')">Строку</button>'+ 
        '<button class="exi-btn" onclick="wmsSaveChangeAsProblem('+idx+')">В проблему</button>'+ 
        (hu?'<button class="exi-btn" onclick="wmsSearchHuChanges(\''+escHtml(hu.split(' → ')[0])+'\')">История ЕО</button>':'')+
      '</div>'+ 
    '</div>';
  }).join('')+'</div>';
}
function wmsChangeTableHtml(rows){
  const tableHead='<tr><th>Дата</th><th>Операция</th><th>Товар</th><th>УТ</th><th>Откуда</th><th>Куда</th><th>Источник</th><th>Цель</th><th>HU</th><th>Исполнитель</th></tr>';
  const rowsHtml=rows.map(r=>'<tr>'+[
    '<td>'+escHtml(wmsDateShort(r.operationStartedAt))+'</td>',
    '<td><b>'+escHtml(wmsOperationLabel(r.operationType))+'</b><br><small>'+escHtml(r.operationType||'')+'</small></td>',
    '<td><b>'+escHtml(r.name||'—')+'</b><br><small>'+escHtml(r.bestBeforeDate?('до '+r.bestBeforeDate):'')+'</small></td>',
    '<td>'+escHtml(r.nomenclatureCode||'')+'</td>',
    '<td>'+escHtml(r.sourceCellAddress||'')+'</td>',
    '<td>'+escHtml(r.targetCellAddress||'')+'</td>',
    '<td>'+escHtml(r.sourceQuantityText||'')+'</td>',
    '<td>'+escHtml(r.targetQuantityText||'')+'</td>',
    '<td>'+escHtml(wmsChangeHuText(r))+'</td>',
    '<td>'+escHtml(r.userName||'')+'</td>'
  ].join('')+'</tr>').join('');
  return '<details class="wms-table-details"><summary>Таблица как в ВМС</summary><div class="wms-table-wrap"><table class="wms-table"><thead>'+tableHead+'</thead><tbody>'+rowsHtml+'</tbody></table></div></details>';
}
function wmsRenderChangesResult(result,p,rows){
  const all=rows||[];
  const base=wmsApplyStorageFilter(all);
  const visible=wmsFilteredChangeRows(all);
  const outCount=base.filter(wmsIsOutgoing).length;
  const inCount=base.filter(wmsIsIncoming).length;
  const countCat=(cat)=>base.filter(r=>wmsOperationCategory(r.operationType)===cat).length;
  const invCount=countCat('inventory');
  const moveCount=countCat('move');
  const placeCount=countCat('placement');
  const replCount=countCat('replenishment');
  const shipCount=countCat('shipment');
  const loadCount=countCat('load');
  const accCount=countCat('acceptance');
  const writeCount=countCat('writeoff');
  const net=visible.reduce((s,r)=>s+Number(wmsChangeMainDelta(r)||0),0);
  const totalShown=visible.length;
  const title='Изменение остатка'+(result.query?': '+result.query:'');
  const meta='Строк: <b>'+escHtml(result.total||result.totalRows||all.length)+'</b> · после хранения: <b>'+escHtml(base.length)+'</b> · показано: <b>'+escHtml(totalShown)+'</b> · итог: <b class="wms-inline-delta '+wmsDeltaClass(net)+'">'+escHtml(wmsDeltaText(net))+'</b>'+(p.nomenclatureCode?(' · <b>'+escHtml(p.nomenclatureCode)+'</b>'):'')+(p.name&&p.name!=='Изменение остатка'?('<br>'+escHtml(p.name)):'');
  return wmsChangesSummaryHtml(base)+
    '<div class="wms-card">'+
      (p.imageUrl?'<img class="wms-img" src="'+escHtml(p.imageUrl)+'" loading="lazy" onerror="this.style.display=\'none\'">':'')+
      '<div class="wms-card-body"><div class="wms-product-name">'+escHtml(title)+'</div><div class="wms-meta">'+meta+'</div></div>'+
    '</div>'+
    wmsChangeCompactFiltersHtml(base)+
    '<div class="wms-actions wms-result-actions">'+
      '<button class="exi-btn primary" onclick="wmsCopyCells()">Скопировать строки</button>'+ 
      wmsCopySplitButtons()+ 
    '</div>'+ 
    wmsChangeCardsHtml(visible)+
    wmsChangeTableHtml(visible);
}
function wmsRenderResult(result){
  wmsLastResult=result;wmsLastChoices=null;
  const box=document.getElementById('wms-result'); if(!box)return;
  const p=(result&&result.product)||{};
  const sourceRows=(result&&result.rows)||[];
  const rows=wmsApplyStorageFilter(sourceRows);
  const barcode=p.barcode || (Array.isArray(p.barcodes)?p.barcodes[0]:'') || '';
  if(!sourceRows.length){box.innerHTML='<div class="no-results">Нет строк</div>';return;}
  if(String(result.mode||'').indexOf('changes')===0){box.innerHTML=wmsRenderChangesResult(result,p,sourceRows);return;}
  if(!rows.length){box.innerHTML='<div class="no-results">По фильтру хранения строк нет. <button class="exi-btn" onclick="wmsToggleStorageOnly()">Показать всё</button></div>';return;}
  let tableHead, rowsHtml, title, meta;
  if(result.mode==='cell' || result.mode==='hu'){
    const isHu=result.mode==='hu';
    const cellAddr=result.cellAddress||rows[0].cellAddress||'';
    const countCol=!isHu;
    title=p.name||(isHu?('Содержимое ЕО '+(result.query||'')):('Содержимое ячейки '+(result.cellAddress||'')));
    meta=(isHu?('ЕО/HU: <b>'+escHtml(result.query||rows[0].handlingUnitBarcode||'')+'</b>'):('Ячейка: <b>'+escHtml(result.cellAddress||rows[0].cellAddress||'')+'</b>'))+' · Строк: <b>'+escHtml(result.totalRows||rows.length)+'</b> · Остаток: <b>'+escHtml(result.totalQuantity||0)+'</b> шт';
    tableHead='<tr><th>Товар</th><th>УТ</th><th>ШК</th><th>Кол-во</th><th>Срок</th><th>HU</th><th>Статус</th>'+(countCol?'<th>Счёт</th>':'')+'</tr>';
    rowsHtml=rows.map(r=>{
      const cells=['<td><b>'+escHtml(r.name||'—')+'</b></td>','<td>'+escHtml(r.nomenclatureCode||'')+'</td>','<td>'+escHtml(r.barcode||'')+'</td>','<td class="num">'+escHtml(r.quantity)+'</td>','<td>'+escHtml(r.bestBeforeDate||'')+'</td>','<td>'+escHtml(r.handlingUnitBarcode||'')+'</td>','<td>'+escHtml(r.status||'')+'</td>'];
      if(countCol)cells.push('<td><button class="exi-btn" style="padding:4px 9px;font-size:11px;white-space:nowrap;" onclick="wmsCountFromCell(\''+jsStr(cellAddr)+'\',\''+jsStr(r.nomenclatureCode||'')+'\',\''+jsStr(r.name||'')+'\','+(Number(r.quantity)||0)+')">Посчитать</button></td>');
      return '<tr>'+cells.join('')+'</tr>';
    }).join('');
  }else{
    title=p.name||rows[0].name||'Товар из ВМС';
    meta='<b>'+escHtml(p.nomenclatureCode||rows[0].nomenclatureCode||'')+'</b>'+(barcode?' · ШК: '+escHtml(barcode):'')+'<br>Строк: <b>'+escHtml(result.totalRows||rows.length)+'</b> · Остаток: <b>'+escHtml(result.totalQuantity||0)+'</b> шт';
    tableHead='<tr><th>Ячейка</th><th>Кол-во</th><th>Зона</th><th>Локация</th><th>Срок</th><th>HU</th><th>Статус</th></tr>';
    rowsHtml=rows.map(r=>'<tr>'+[
      '<td><b>'+escHtml(r.cellAddress||'—')+'</b></td>','<td class="num">'+escHtml(r.quantity)+'</td>','<td>'+escHtml(r.zoneName||'')+'</td>','<td>'+escHtml(r.locationName||'')+'</td>','<td>'+escHtml(r.bestBeforeDate||'')+'</td>','<td>'+escHtml(r.handlingUnitBarcode||'')+'</td>','<td>'+escHtml(r.status||'')+'</td>'
    ].join('')+'</tr>').join('');
  }
  box.innerHTML='<div class="wms-card">'+(p.imageUrl?'<img class="wms-img" src="'+escHtml(p.imageUrl)+'" loading="lazy" onerror="this.style.display=\'none\'">':'')+'<div class="wms-card-body"><div class="wms-product-name">'+escHtml(title)+'</div><div class="wms-meta">'+meta+'</div></div></div><div class="wms-actions wms-result-actions">'+wmsStorageToggleButton()+'<button class="exi-btn primary" onclick="wmsCopyCells()">Скопировать строки</button><button class="exi-btn" onclick="wmsImportLastStocksToHH11()">В HH 1-1</button>'+wmsCopySplitButtons()+'</div><div class="wms-table-wrap"><table class="wms-table"><thead>'+tableHead+'</thead><tbody>'+rowsHtml+'</tbody></table></div>';
}
function wmsChangeRowText(r){
  return [
    wmsDateShort(r.operationStartedAt),
    wmsOperationLabel(r.operationType),
    r.nomenclatureCode||'',
    r.name||'',
    wmsChangeDirectionText(r),
    r.sourceQuantityText?('источник '+r.sourceQuantityText):'',
    r.targetQuantityText?('цель '+r.targetQuantityText):'',
    wmsChangeHuText(r)?('ЕО '+wmsChangeHuText(r)):'',
    r.userName||''
  ].filter(Boolean).join(' — ');
}
function wmsCopyChangeRow(idx){
  const rows=wmsFilteredChangeRows((wmsLastResult&&wmsLastResult.rows)||[]);
  const r=rows[idx]; if(!r)return;
  wmsCopyFallback(wmsChangeRowText(r)).then(()=>wmsSetStatus('Строка скопирована.','ok'));
}
function wmsSaveChangeAsProblem(idx){
  const rows=wmsFilteredChangeRows((wmsLastResult&&wmsLastResult.rows)||[]);
  const r=rows[idx]; if(!r)return;
  const row=createMeta({id:Date.now()+Math.floor(Math.random()*1000),type:'изменение остатка',ut:r.nomenclatureCode||'',name:r.name||'',cell:r.sourceCellAddress||r.targetCellAddress||'',sys:Number((r.sourceDelta!==''?r.sourceDelta:r.targetDelta)||0)||0,fact:0,status:'нужно ВМС',needWms:1,comment:'Изменение ВМС: '+wmsChangeRowText(r).slice(0,900),archived:0,createdAt:new Date().toLocaleString('ru-RU'),updatedAt:new Date().toLocaleString('ru-RU')});
  const arr=getProblems();arr.unshift(row);set('problems_log',arr);logAction('problem','Создана проблема из изменения ВМС: '+(row.ut||row.name||row.cell||'ВМС'),{ut:row.ut,cell:row.cell});
  wmsSetStatus('Строка добавлена в проблемы.','ok');
}
function wmsSearchHuChanges(hu){
  const el=document.getElementById('wms-query'); if(el)el.value=hu;
  wmsSetLookupKind('changes');
  wmsLookupFromApp();
}
function wmsFormatCells(result){
  const rows=wmsApplyStorageFilter((result&&result.rows)||[]);
  if((result&&String(result.mode||'').indexOf('changes')===0)){
    return wmsFilteredChangeRows(rows).map(wmsChangeRowText).join('\n');
  }
  if((result&&result.mode)==='cell' || (result&&result.mode)==='hu'){
    return rows.map(r=>[r.nomenclatureCode||'—',r.name||'Товар',(Number(r.quantity)||0)+' шт',r.bestBeforeDate?('до '+r.bestBeforeDate):'',r.handlingUnitBarcode?('HU '+r.handlingUnitBarcode):'',r.status||''].filter(Boolean).join(' — ')).join('\n');
  }
  return rows.map(r=>[r.cellAddress||'—',(Number(r.quantity)||0)+' шт',r.bestBeforeDate?('до '+r.bestBeforeDate):'',r.handlingUnitBarcode?('HU '+r.handlingUnitBarcode):'',r.status||''].filter(Boolean).join(' — ')).join('\n');
}
function wmsSaveAsProblem(){
  if(!wmsLastResult){alert('Нет результата ВМС');return;}
  if(String(wmsLastResult.mode||'').indexOf('changes')===0){
    const first=wmsFilteredChangeRows(wmsLastResult.rows||[])[0] || (wmsLastResult.rows||[])[0] || {};
    const row=createMeta({id:Date.now()+Math.floor(Math.random()*1000),type:'изменение остатка',ut:first.nomenclatureCode||'',name:first.name||'',cell:first.sourceCellAddress||first.targetCellAddress||wmsLastResult.cellAddress||'',sys:Number(wmsLastResult.totalRows||0)||0,fact:0,status:'нужно ВМС',needWms:1,comment:'Изменения ВМС:\n'+wmsFormatCells(wmsLastResult).slice(0,900),archived:0,createdAt:new Date().toLocaleString('ru-RU'),updatedAt:new Date().toLocaleString('ru-RU')});
    const arr=getProblems();arr.unshift(row);set('problems_log',arr);logAction('problem','Создана проблема из изменений ВМС: '+(row.ut||row.name||row.cell||'ВМС'),{ut:row.ut,cell:row.cell});
    wmsSetStatus('Добавлено в проблемы.','ok');
    return;
  }
  const p=wmsLastResult.product||{};
  const first=(wmsLastResult.rows||[])[0]||{};
  const row=createMeta({id:Date.now()+Math.floor(Math.random()*1000),type:'проверить ВМС',ut:p.nomenclatureCode||first.nomenclatureCode||'',name:p.name||first.name||'',cell:first.cellAddress||wmsLastResult.cellAddress||'',sys:Number(wmsLastResult.totalQuantity||0)||0,fact:0,status:'нужно ВМС',needWms:1,comment:'Импорт из ВМС: '+wmsFormatCells(wmsLastResult).slice(0,900),archived:0,createdAt:new Date().toLocaleString('ru-RU'),updatedAt:new Date().toLocaleString('ru-RU')});
  const arr=getProblems();arr.unshift(row);set('problems_log',arr);logAction('problem','Создана проблема из ВМС: '+(row.ut||row.name||row.cell||'ВМС'),{ut:row.ut,cell:row.cell});
  wmsSetStatus('Добавлено в проблемы.','ok');
}
window.wmsSetChangeFilter=wmsSetChangeFilter;
window.wmsSetChangeOperationFilter=wmsSetChangeOperationFilter;
window.wmsCopyChangeRow=wmsCopyChangeRow;
window.wmsSaveChangeAsProblem=wmsSaveChangeAsProblem;
window.wmsSearchHuChanges=wmsSearchHuChanges;
window.wmsSetRecountReasons=wmsSetRecountReasons;



// ── WMS RECOUNTING TASKS v54 ──
function wmsRecountLabelStatus(v){
  const m={
    COMPLETED:'Завершён',
    COMPLETED_WITH_DISCREPANCY:'Подтверждено с расхождением',
    AWAITING_CONFIRMATION:'Ждёт подтверждения',
    IN_PROGRESS:'В работе',
    CREATED:'Создан',
    REJECTED:'Отклонён',
    DECLINED:'Отклонён',
    CANCELLED:'Отменён',
    CANCELED:'Отменён',
    WITHOUT_REVIEW:'Без ревью'
  };
  return m[String(v||'').toUpperCase()]||String(v||'');
}
function wmsRecountLabelScope(v){
  const m={FULL:'Полный',PARTIAL:'Частичный'};
  return m[String(v||'').toUpperCase()]||String(v||'');
}
function wmsRecountLabelReason(v){
  const m={
    STOCKS_MISSING_DURING_DEFECTIVE_STOCK_PICKING:'Нет товара при подборе брака',
    CREATED_ON_PDT:'Создано на ТСД',
    STOCKS_MISSING_DURING_PICKING_SELECTION:'Нет товара при отборе',
    STOCKS_MISSING_DURING_PBL_ORDER_ASSEMBLY:'Нет товара при сборке PBL-заказа',
    STOCKS_MISSING_DURING_BY_PRODUCT_CONSOLIDATION:'Нет товара при консолидации',
    MOVEMENT_TO_PBL_BUFFER:'Перемещение в PBL-буфер',
    UNEXPECTED_STOCKS_FOUND:'Найдены неожиданные остатки',
    HANDLING_UNIT_MISSING_DURING_MOVEMENT_TO_PICKING:'Нет ЕО при перемещении на отбор',
    INVALID_PRODUCTION_DATE:'Неверная дата производства',
    PIECE_WEIGHT_STOCK_INACCURACY:'Некорректный штучно-весовой остаток',
    UNEXPECTED_STOCK_DISCREPANCY_CONFIRMATION:'Излишек / расхождение',
    NOT_FOUND_STOCK_DISCREPANCY_CONFIRMATION:'Недостача / не найдено',
    MANUAL:'Ручной пересчёт',
    UNKNOWN:'Другое'
  };
  return m[String(v||'').toUpperCase()]||String(v||'');
}
function wmsDateIsoDay(s){
  s=String(s||'').trim();
  if(!s)return '';
  const m=s.match(/^(\d{4}-\d{2}-\d{2})/); if(m)return m[1];
  try{const d=new Date(s); if(!isNaN(d))return d.toISOString().slice(0,10);}catch(e){}
  return s;
}
function wmsRecountDateText(s){
  if(!s)return '';
  try{
    const str=String(s);
    if(/^\d{4}-\d{2}-\d{2}$/.test(str))return str.split('-').reverse().join('.');
    return new Date(str).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
  }catch(e){return String(s||'');}
}
function wmsFindRecountingItems(obj, depth){
  depth=depth||0;
  if(!obj || depth>7)return null;
  if(Array.isArray(obj)){
    if(obj.some(x=>x&&typeof x==='object'&&(x.scope||x.reason||x.executorName)&&(x.cell||x.cellAddress||x.status)))return obj;
    for(const x of obj){const r=wmsFindRecountingItems(x,depth+1); if(r)return r;}
    return null;
  }
  if(typeof obj==='object'){
    if(obj.value&&Array.isArray(obj.value.items))return obj.value.items;
    if(Array.isArray(obj.items))return obj.items;
    for(const k of Object.keys(obj)){const r=wmsFindRecountingItems(obj[k],depth+1); if(r)return r;}
  }
  return null;
}
function wmsMapRecountingItem(item){
  item=item||{};
  const cell=item.cell||{};
  return {
    id:item.id||'',
    type:item.type||'',
    status:item.status||item.type||'',
    cellAddress:cell.cellAddress||item.cellAddress||'',
    reason:item.reason||'',
    scope:item.scope||'',
    createdAt:item.createdAt||'',
    completedAt:item.completedAt||'',
    executorName:item.executorName||'',
    zoneName:item.zoneName||'',
    detailLoaded:false,
    positionCount:null,
    partCount:null,
    expectedQty:null,
    actualQty:null,
    defectiveQty:null,
    discrepancyQty:null,
    discrepancyRows:null,
    detailTask:null,
    raw:item
  };
}
function wmsNormalizeRecountingResult(payload){
  const items=wmsFindRecountingItems(payload)||[];
  const rows=items.map(wmsMapRecountingItem).filter(r=>r.cellAddress||r.executorName||r.status||r.reason);
  const value=payload&&payload.value?payload.value:{};
  return {mode:'recountingTasks',rows,totalRows:rows.length,total:value.total||rows.length,loadedRows:(payload&&payload._loadedRows)||rows.length,filters:(payload&&payload._filters)||{}};
}
function wmsSelectedRecountReasons(){
  return Array.from(document.querySelectorAll('[data-wms-rc-reason]:checked'))
    .map(el=>String(el.value||'').trim().toUpperCase())
    .filter(Boolean);
}
function wmsSetRecountReasons(checked){
  document.querySelectorAll('[data-wms-rc-reason]').forEach(el=>{el.checked=!!checked;});
}
function wmsGetRecountingFilters(){
  const val=id=>{const el=document.getElementById(id); return el?String(el.value||'').trim():'';};
  const reasons=wmsSelectedRecountReasons();
  let dateFrom=val('wms-rc-date-from'),dateTo=val('wms-rc-date-to');
  if(dateFrom&&dateTo&&dateFrom>dateTo){const t=dateFrom;dateFrom=dateTo;dateTo=t;}
  return {status:val('wms-rc-status')||'all',scope:val('wms-rc-scope')||'all',reasons,dateFrom:dateFrom,dateTo:dateTo,executor:val('wms-rc-executor'),executorId:val('wms-rc-executor-id'),cell:val('wms-rc-cell')};
}
function wmsRecountHasDiscrepancy(r){
  if(!r || !r.detailLoaded)return false;
  return Number(r.discrepancyQty||0)!==0 || Number(r.discrepancyRows||0)>0;
}
function wmsApplyRecountingFilters(rows, filters){
  filters=filters||wmsGetRecountingFilters();
  const ex=String(filters.executor||'').trim().toLowerCase();
  const cell=String(filters.cell||'').trim().toLowerCase();
  const dateFrom=String(filters.dateFrom||'').trim();
  const dateTo=String(filters.dateTo||'').trim();
  const status=String(filters.status||'all').trim().toUpperCase();
  return (rows||[]).filter(r=>{
    if(status==='DISCREPANCY'){
      if(!wmsRecountHasDiscrepancy(r))return false;
    }else if(status && status!=='ALL' && String(r.status||'').toUpperCase()!==status){
      return false;
    }
    if(filters.scope && filters.scope!=='all' && String(r.scope||'').toUpperCase()!==filters.scope)return false;
    const selectedReasons=Array.isArray(filters.reasons)?filters.reasons.map(x=>String(x||'').toUpperCase()).filter(Boolean):[];
    if(selectedReasons.length && !selectedReasons.includes(String(r.reason||'').toUpperCase()))return false;
    if(dateFrom||dateTo){
      const day=wmsDateIsoDay(r.completedAt||r.createdAt);
      if(!day)return false;
      if(dateFrom&&day<dateFrom)return false;
      if(dateTo&&day>dateTo)return false;
    }
    if(ex && !String(r.executorName||'').toLowerCase().includes(ex))return false;
    if(cell){const hay=[r.cellAddress,r.zoneName].join(' ').toLowerCase(); if(!hay.includes(cell))return false;}
    return true;
  });
}
function wmsCountBy(rows, fn){const m={};(rows||[]).forEach(r=>{const k=fn(r)||'—'; m[k]=(m[k]||0)+1;});return m;}
function wmsTopEntries(obj, limit){return Object.entries(obj||{}).sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),'ru')).slice(0,limit||8);}
function wmsNum(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function wmsRecountDetailStats(task){
  task=task||{};
  const products=Array.isArray(task.products)?task.products:[];
  const st={positionCount:products.length,partCount:0,expectedQty:0,actualQty:0,defectiveQty:0,discrepancyQty:0,discrepancyRows:0};
  products.forEach(p=>{
    const parts=Array.isArray(p.parts)?p.parts:[];
    st.partCount+=parts.length;
    parts.forEach(part=>{
      const expected=wmsNum(part.expectedQuantity);
      const actual=wmsNum(part.actualQuantity);
      const defective=wmsNum(part.defectiveQuantity);
      let discrepancy=part.discrepancy;
      if(discrepancy===undefined || discrepancy===null || discrepancy==='')discrepancy=actual-expected;
      discrepancy=wmsNum(discrepancy);
      st.expectedQty+=expected;
      st.actualQty+=actual;
      st.defectiveQty+=defective;
      st.discrepancyQty+=discrepancy;
      if(discrepancy!==0)st.discrepancyRows+=1;
    });
  });
  return st;
}
function wmsApplyRecountDetail(row, task){
  if(!row||!task)return row;
  const st=wmsRecountDetailStats(task);
  row.detailLoaded=true;
  row.detailTask=task;
  row.positionCount=st.positionCount;
  row.partCount=st.partCount;
  row.expectedQty=st.expectedQty;
  row.actualQty=st.actualQty;
  row.defectiveQty=st.defectiveQty;
  row.discrepancyQty=st.discrepancyQty;
  row.discrepancyRows=st.discrepancyRows;
  row.scope=row.scope||task.scope||'';
  row.status=row.status||task.status||'';
  row.cellAddress=row.cellAddress||task.cellAddress||'';
  return row;
}
function wmsRecountSum(rows,key){return (rows||[]).reduce((s,r)=>s+(Number.isFinite(Number(r[key]))?Number(r[key]):0),0);}
function wmsRecountHasDetails(rows){return (rows||[]).some(r=>r&&r.detailLoaded);}
function wmsRecountStatLine(r){
  if(!r||!r.detailLoaded)return '<span class="wms-recount-badge">позиции не загружены</span>';
  return '<span class="wms-recount-badge">поз. '+escHtml(r.positionCount)+'</span><span class="wms-recount-badge">парт. '+escHtml(r.partCount)+'</span><span class="wms-recount-badge">сист. '+escHtml(r.expectedQty)+'</span><span class="wms-recount-badge">факт '+escHtml(r.actualQty)+'</span><span class="wms-recount-badge">разн. '+escHtml(r.discrepancyQty)+'</span>';
}

// ── Излишки CREATED_ON_PDT ──
function wmsSurplusRows(rows){
  return (rows||[]).filter(r=>String(r.reason||'').toUpperCase()==='CREATED_ON_PDT');
}
function wmsRenderSurplusBlock(rows){
  const surplus=wmsSurplusRows(rows);
  if(!surplus.length)return '';
  const dry=surplus.filter(r=>String(r.zoneName||'').includes('Сух')||String(r.cellAddress||'').toUpperCase().startsWith('SH')).length;
  const cold=surplus.filter(r=>String(r.zoneName||'').includes('Хол')||String(r.cellAddress||'').toUpperCase().startsWith('HH')).length;
  const surplusActual=wmsRecountSum(surplus,'actualQty');
  return '<div style="background:rgba(201,168,76,0.07);border:1px solid rgba(201,168,76,0.25);border-radius:10px;padding:12px 14px;margin:10px 0;">'+
    '<div style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:10px;color:var(--gold);letter-spacing:1px;margin-bottom:8px;">Излишки (CREATED_ON_PDT) · '+escHtml(surplus.length)+' заданий</div>'+
    '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;">'+
      '<div class="wms-recount-stat"><b>'+escHtml(dry)+'</b><span>Сухой</span></div>'+
      '<div class="wms-recount-stat"><b>'+escHtml(cold)+'</b><span>Холод</span></div>'+
      (surplusActual?'<div class="wms-recount-stat"><b>'+escHtml(surplusActual)+'</b><span>факт шт.</span></div>':'')+
    '</div>'+
    '<div style="display:flex;gap:7px;flex-wrap:wrap;">'+
      '<button class="exi-btn" style="flex:1;min-width:140px;" onclick="wmsExportSurplusToReport('+dry+','+cold+')">В отчёт (Сухой: '+escHtml(dry)+', Холод: '+escHtml(cold)+')</button>'+
      '<button class="exi-btn" style="flex:1;min-width:110px;" onclick="wmsFilterSurplus()">Показать только</button>'+
    '</div>'+
  '</div>';
}
function wmsExportSurplusToReport(dry,cold){
  const day=ensureReportToday();
  const dryTask=day.tasks.find(t=>t.name==='Заведение излишков (Сухой)');
  const coldTask=day.tasks.find(t=>t.name==='Заведение излишков (Холод)');
  let changed=false;
  if(dryTask&&dry>0){dryTask.qty=(parseInt(dryTask.qty)||0)+dry;changed=true;}
  if(coldTask&&cold>0){coldTask.qty=(parseInt(coldTask.qty)||0)+cold;changed=true;}
  if(!changed){alert('Нет заданий для экспорта или задачи не найдены в отчёте.');return;}
  saveReportDay(day);
  alert('Добавлено в отчёт: Сухой +'+dry+', Холод +'+cold+'.');
}
function wmsFilterSurplus(){
  document.querySelectorAll('[data-wms-rc-reason]').forEach(el=>{el.checked=String(el.value||'').toUpperCase()==='CREATED_ON_PDT';});
  wmsLoadRecountingTasks();
}

// ── Вкладки Пересчёты / Излишки / Минусы ──
function wmsSetRcSubTab(tab){
  wmsRcSubTab=tab||'tasks';
  const isTask=wmsRcSubTab==='tasks';
  const tasksPanel=document.getElementById('wms-rc-tasks-panel');
  const discPanel=document.getElementById('wms-rc-disc-panel');
  if(tasksPanel)tasksPanel.style.display=isTask?'':'none';
  if(discPanel)discPanel.style.display=isTask?'none':'';
  const titleEl=document.getElementById('wms-rc-disc-title');
  if(titleEl)titleEl.textContent=wmsRcSubTab==='surplus'?'Излишки ↑ — фильтр по исполнителю':'Минусы ↓ — фильтр по исполнителю';
  ['tasks','surplus','deficit'].forEach(t=>{
    const btn=document.getElementById('wms-rc-tab-'+t);
    if(btn)btn.classList.toggle('primary',t===wmsRcSubTab);
  });
  if(!isTask){
    wmsLastDiscrepancyResult=null;
    const box=document.getElementById('wms-result');
    if(box&&wmsLookupKind==='recounting')box.innerHTML='';
    wmsSetStatus((wmsRcSubTab==='surplus'?'Излишки: введи фамилию и дату.':'Минусы: введи фамилию и дату.'),'');
  }
}
async function wmsLoadDiscrepancyPositions(){
  const exec1=String((document.getElementById('wms-rc-disc-exec1')?.value)||'').trim();
  const exec2=String((document.getElementById('wms-rc-disc-exec2')?.value)||'').trim();
  const date=String((document.getElementById('wms-rc-disc-date')?.value)||'').trim();
  const zone=String((document.getElementById('wms-rc-disc-zone')?.value)||'all');
  const kind=wmsRcSubTab==='deficit'?'deficit':'surplus';
  if(!exec1&&!exec2){wmsSetStatus('Введи хотя бы одну фамилию.','err');return;}
  wmsSetStatus('Загружаю завершённые пересчёты…','wait');
  try{
    const apiFilters={status:'all',scope:'all',reasons:[],date,executor:'',executorId:'',cell:''};
    const raw=await wmsCallNative('lookupWmsRecountingTasks',[JSON.stringify(apiFilters)],60000);
    wmsLastRecountingRaw=raw;
    const result=wmsNormalizeRecountingResult(raw);
    let rows=(result&&result.rows)||[];
    // Оставляем только завершённые пересчёты
    rows=rows.filter(r=>/COMPLET/i.test(r.status||''));
    // Фильтр по исполнителю(ям)
    if(exec1||exec2){
      rows=rows.filter(r=>{
        const name=String(r.executorName||'').toLowerCase();
        return (exec1&&name.includes(exec1.toLowerCase()))||(exec2&&name.includes(exec2.toLowerCase()));
      });
    }
    // Фильтр по зоне
    if(zone!=='all'){
      rows=rows.filter(r=>wmsUpperZoneKey(r)===zone);
    }
    // Фильтр по дате
    if(date){
      rows=rows.filter(r=>wmsDateIsoDay(r.completedAt||r.createdAt)===date);
    }
    if(!rows.length){
      const box=document.getElementById('wms-result');
      if(box)box.innerHTML='<div class="no-results">Завершённых пересчётов по этим фильтрам нет. Попробуй без даты или уточни фамилию.</div>';
      wmsSetStatus('Нет пересчётов по фильтру.','ok');return;
    }
    wmsSetStatus('Загружаю позиции '+rows.length+' пересчётов…','wait');
    const toLoad=rows.filter(r=>r.id&&!r.detailLoaded);
    if(toLoad.length){
      const ids=toLoad.map(r=>r.id);
      const detailRaw=await wmsCallNative('lookupWmsRecountingTaskDetails',[JSON.stringify(ids)],180000);
      const tasks=wmsFindDetailTasks(detailRaw);
      const byId={};
      tasks.forEach(t=>{const id=t.id||t._loadedDetailId||''; if(id)byId[id]=t;});
      rows.forEach(r=>{if(r.id&&byId[r.id])wmsApplyRecountDetail(r,byId[r.id]);});
    }
    // Извлекаем позиции с нужным знаком расхождения
    const sign=kind==='surplus'?1:-1;
    const positions=[];
    rows.forEach(row=>{
      if(!row.detailLoaded||!row.detailTask)return;
      const products=Array.isArray(row.detailTask.products)?row.detailTask.products:[];
      products.forEach(p=>{
        const parts=Array.isArray(p.parts)?p.parts:[];
        let disc=0;
        parts.forEach(part=>{
          let d=part.discrepancy;
          if(d===undefined||d===null||d==='')d=wmsNum(part.actualQuantity)-wmsNum(part.expectedQuantity);
          disc+=wmsNum(d);
        });
        if(sign===1&&disc<=0)return;
        if(sign===-1&&disc>=0)return;
        positions.push({
          taskId:row.id,
          executorName:row.executorName||'',
          cellAddress:row.cellAddress||'',
          zoneName:row.zoneName||'',
          zoneKey:wmsUpperZoneKey(row),
          date:wmsDateIsoDay(row.completedAt||row.createdAt)||'',
          ut:String(p.nomenclatureCode||p.ut||''),
          name:String(p.name||''),
          expected:parts.reduce((s,pt)=>s+wmsNum(pt.expectedQuantity),0),
          actual:parts.reduce((s,pt)=>s+wmsNum(pt.actualQuantity),0),
          discrepancy:disc
        });
      });
    });
    wmsLastDiscrepancyResult={positions,kind,tasks:rows.length};
    wmsRenderDiscrepancyResults(positions,kind,rows.length);
    wmsSetStatus((kind==='surplus'?'Излишки':'Минусы')+': '+positions.length+' позиций в '+rows.length+' пересчётах.','ok');
  }catch(e){wmsSetStatus((e&&e.message)||WMS_AUTO_UNAVAILABLE,'err');}
}
function wmsRenderDiscrepancyResults(positions, kind, taskCount){
  const box=document.getElementById('wms-result'); if(!box)return;
  const isSurplus=kind==='surplus';
  const title=isSurplus?'Излишки ↑':'Минусы ↓';
  if(!positions||!positions.length){
    box.innerHTML='<div class="no-results">'+(isSurplus?'Излишков нет':'Минусов нет')+' — расхождений с нужным знаком не найдено.</div>';
    return;
  }
  const coldPos=positions.filter(p=>p.zoneKey==='cold');
  const dryPos=positions.filter(p=>p.zoneKey==='dry');
  const otherPos=positions.filter(p=>p.zoneKey!=='cold'&&p.zoneKey!=='dry');
  function renderZoneBlock(pts,zk,zlabel){
    if(!pts.length)return '';
    const total=pts.reduce((s,p)=>s+Math.abs(p.discrepancy),0);
    const rows=pts.map(p=>'<tr><td>'+escHtml(p.name||'—')+'</td><td>'+escHtml(p.ut||'—')+'</td><td>'+escHtml(p.cellAddress||'—')+'</td><td style="color:'+(isSurplus?'var(--ok,#5c5)':'var(--err,#d44)')+'"><b>'+(isSurplus?'+':'')+escHtml(p.discrepancy)+'</b></td><td>'+escHtml(p.executorName||'—')+'</td><td>'+escHtml(p.date||'—')+'</td></tr>').join('');
    return '<div class="wms-filter-title">'+escHtml(zlabel)+' · '+escHtml(pts.length)+' поз. · '+escHtml(total)+' шт.</div>'+
      '<div class="wms-actions wms-result-actions">'+
        '<button class="exi-btn" onclick="wmsCopyDiscrepancyZone(\''+zk+'\',\''+kind+'\')">Скопировать '+escHtml(zlabel)+'</button>'+
        (isSurplus?'<button class="exi-btn primary" onclick="wmsExportDiscrepancyToReport('+pts.length+',\''+kind+'\',\''+zk+'\')">В отчёт: '+escHtml(pts.length)+'</button>':'')+
      '</div>'+
      '<div class="wms-table-wrap"><table class="wms-table"><thead><tr><th>Товар</th><th>УТ</th><th>Ячейка</th><th>Разн.</th><th>Исполнитель</th><th>Дата</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }
  box.innerHTML=
    '<div class="wms-card"><div class="wms-card-body"><div class="wms-product-name">'+escHtml(title)+'</div>'+
    '<div class="wms-meta">'+escHtml(positions.length)+' позиций · '+escHtml(taskCount)+' пересчётов</div></div></div>'+
    renderZoneBlock(coldPos,'cold','Холод')+
    renderZoneBlock(dryPos,'dry','Сухой')+
    renderZoneBlock(otherPos,'other','Прочие зоны');
}
function wmsCopyDiscrepancyZone(zoneKey, kind){
  const state=wmsLastDiscrepancyResult;
  if(!state||!state.positions){wmsSetStatus('Нет данных. Сначала нажми «Найти».','err');return;}
  const pts=state.positions.filter(p=>zoneKey==='other'?(p.zoneKey!=='cold'&&p.zoneKey!=='dry'):(p.zoneKey===zoneKey));
  const isSurplus=kind==='surplus';
  const head=['Товар','УТ','Ячейка','Расхождение','Исполнитель','Дата'];
  const lines=[head.join('\t')].concat(pts.map(p=>[
    p.name,p.ut,p.cellAddress,(isSurplus?'+':'')+p.discrepancy,p.executorName,p.date
  ].map(v=>String(v||'').replace(/\t/g,' ').replace(/\n/g,' ')).join('\t')));
  const zlabel=zoneKey==='cold'?'Холод':zoneKey==='dry'?'Сухой':'Прочие';
  wmsCopyFallback(lines.join('\n')).then(()=>wmsSetStatus(zlabel+': '+pts.length+' позиций скопировано.','ok'));
}
function wmsExportDiscrepancyToReport(count, kind, zoneKey){
  const isCold=zoneKey==='cold';
  const isDry=zoneKey==='dry';
  const isSurplus=kind==='surplus';
  const taskName=isSurplus&&isCold?'Заведение излишков (Холод)':isSurplus&&isDry?'Заведение излишков (Сухой)':null;
  if(!taskName){
    const label=isCold?'Холод':'Сухой';
    wmsCopyFallback(String(count)).then(()=>wmsSetStatus((isSurplus?'Излишки':'Минусы')+' '+label+': '+count+' позиций — скопировано в буфер.','ok'));
    return;
  }
  const day=ensureReportToday();
  const task=day.tasks&&day.tasks.find(t=>t.name===taskName);
  if(!task){
    wmsCopyFallback(String(count)).then(()=>wmsSetStatus('Задача "'+taskName+'" не найдена в отчёте. Цифра '+count+' скопирована в буфер.','ok'));
    return;
  }
  task.qty=(parseInt(task.qty)||0)+count;
  saveReportDay(day);
  wmsSetStatus('В отчёт: "'+taskName+'" +'+count+'.','ok');
}
function wmsDiscrepancyToday(){
  const d=new Date();
  const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const el=document.getElementById('wms-rc-disc-date'); if(el)el.value=iso;
}
function wmsClearDiscrepancyFilters(){
  ['wms-rc-disc-exec1','wms-rc-disc-exec2'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const dt=document.getElementById('wms-rc-disc-date'); if(dt)dt.value='';
  const z=document.getElementById('wms-rc-disc-zone'); if(z)z.value='all';
  wmsLastDiscrepancyResult=null;
  const box=document.getElementById('wms-result');if(box&&wmsLookupKind==='recounting')box.innerHTML='';
  wmsSetStatus('Фильтры сброшены.','');
}

function wmsRenderRecountingResult(result){
  wmsLastResult=result; wmsLastChoices=null;
  const box=document.getElementById('wms-result'); if(!box)return;
  const filters=wmsGetRecountingFilters();
  const rows=wmsApplyRecountingFilters((result&&result.rows)||[],filters);
  if(!rows.length){box.innerHTML='<div class="no-results">Пересчётов по этим фильтрам нет</div>';return;}
  const hasDetails=wmsRecountHasDetails(rows);
  const byExecutor=wmsCountBy(rows,r=>r.executorName||'Без исполнителя');
  const byDay=wmsCountBy(rows,r=>wmsDateIsoDay(r.completedAt||r.createdAt)||'Без даты');
  const byZone=wmsCountBy(rows,r=>r.zoneName||'Без зоны');
  const full=rows.filter(r=>String(r.scope).toUpperCase()==='FULL').length;
  const partial=rows.filter(r=>String(r.scope).toUpperCase()==='PARTIAL').length;
  const totalPositions=wmsRecountSum(rows,'positionCount');
  const totalParts=wmsRecountSum(rows,'partCount');
  const totalExpected=wmsRecountSum(rows,'expectedQty');
  const totalActual=wmsRecountSum(rows,'actualQty');
  const totalDiscrep=wmsRecountSum(rows,'discrepancyQty');
  const totalDefect=wmsRecountSum(rows,'defectiveQty');
  const executorCards=wmsTopEntries(byExecutor,6).map(([name,n])=>{
    const personRows=rows.filter(r=>(r.executorName||'Без исполнителя')===name);
    const detail=hasDetails?' · поз. '+wmsRecountSum(personRows,'positionCount')+' · факт '+wmsRecountSum(personRows,'actualQty'):'';
    return '<div class="wms-recount-person"><b>'+escHtml(name)+'</b><span>'+escHtml(n)+' пересч.'+escHtml(detail)+' · '+escHtml(wmsTopEntries(wmsCountBy(personRows,r=>r.zoneName||'Без зоны'),3).map(x=>x[0]+' '+x[1]).join(', '))+'</span></div>';
  }).join('');
  const dayBadges=wmsTopEntries(byDay,7).map(([d,n])=>'<span class="wms-recount-badge">'+escHtml(d)+' · '+escHtml(n)+'</span>').join('');
  const zoneBadges=wmsTopEntries(byZone,6).map(([z,n])=>'<span class="wms-recount-badge">'+escHtml(z)+' · '+escHtml(n)+'</span>').join('');
  const detailHead=hasDetails?'<th>Поз.</th><th>Партии</th><th>Сист.</th><th>Факт</th><th>Разн.</th><th>Брак</th>':'';
  const table=rows.map(r=>'<tr>'+[
    '<td>'+escHtml(wmsRecountDateText(r.completedAt||r.createdAt))+'</td>',
    '<td><b>'+escHtml(r.executorName||'—')+'</b><br>'+wmsRecountStatLine(r)+'</td>',
    '<td><b>'+escHtml(r.cellAddress||'—')+'</b></td>',
    '<td>'+escHtml(r.zoneName||'')+'</td>',
    '<td>'+escHtml(wmsRecountLabelScope(r.scope))+'</td>',
    '<td>'+escHtml(wmsRecountLabelReason(r.reason))+'<br><small>'+escHtml(r.reason||'')+'</small></td>',
    '<td>'+escHtml(wmsRecountLabelStatus(r.status))+'</td>',
    hasDetails?('<td>'+escHtml(r.detailLoaded?r.positionCount:'—')+'</td><td>'+escHtml(r.detailLoaded?r.partCount:'—')+'</td><td>'+escHtml(r.detailLoaded?r.expectedQty:'—')+'</td><td>'+escHtml(r.detailLoaded?r.actualQty:'—')+'</td><td>'+escHtml(r.detailLoaded?r.discrepancyQty:'—')+'</td><td>'+escHtml(r.detailLoaded?r.defectiveQty:'—')+'</td>'):''
  ].join('')+'</tr>').join('');
  box.innerHTML=
    '<div class="wms-card"><div class="wms-card-body"><div class="wms-product-name">Задания на пересчёт</div><div class="wms-meta">Показано: <b>'+escHtml(rows.length)+'</b> · загружено из WMS: <b>'+escHtml(result.loadedRows||result.totalRows||rows.length)+'</b>'+(hasDetails?' · позиции загружены':'')+'</div></div></div>'+ 
    '<div class="wms-recount-summary">'+
      '<div class="wms-recount-stat"><b>'+escHtml(rows.length)+'</b><span>пересчётов по фильтру</span></div>'+ 
      '<div class="wms-recount-stat"><b>'+escHtml(Object.keys(byExecutor).length)+'</b><span>исполнителей</span></div>'+ 
      '<div class="wms-recount-stat"><b>'+escHtml(full)+' / '+escHtml(partial)+'</b><span>полный / частичный</span></div>'+ 
      (hasDetails?('<div class="wms-recount-stat"><b>'+escHtml(totalPositions)+'</b><span>товарных позиций</span></div><div class="wms-recount-stat"><b>'+escHtml(totalParts)+'</b><span>партий / строк сроков</span></div><div class="wms-recount-stat"><b>'+escHtml(totalActual)+'</b><span>факт, всего штук</span></div><div class="wms-recount-stat"><b>'+escHtml(totalExpected)+'</b><span>система, всего штук</span></div><div class="wms-recount-stat"><b>'+escHtml(totalDiscrep)+'</b><span>расхождение</span></div><div class="wms-recount-stat"><b>'+escHtml(totalDefect)+'</b><span>брак</span></div>'):'')+
    '</div>'+ 
    '<div class="wms-filter-title">Кто и сколько · нажми фамилию, чтобы показать только его</div><div class="wms-recount-executors">'+executorCards+'</div>'+
    '<div class="wms-filter-title">По дням</div><div>'+dayBadges+'</div>'+ 
    '<div class="wms-filter-title">По зонам</div><div>'+zoneBadges+'</div>'+ 
    '<div class="wms-actions wms-result-actions"><button class="exi-btn primary" onclick="wmsLoadRecountingDetails()">Загрузить позиции</button><button class="exi-btn" onclick="wmsCopyRecountingTsv()">Скопировать TSV</button><button class="exi-btn" onclick="wmsLoadRecountingTasks()">Обновить</button></div>'+ 
    '<div class="wms-table-wrap"><table class="wms-table"><thead><tr><th>Дата</th><th>Исполнитель</th><th>Ячейка</th><th>Зона</th><th>Тип</th><th>Причина</th><th>Статус</th>'+detailHead+'</tr></thead><tbody>'+table+'</tbody></table></div>';
}
async function wmsLoadRecountingTasks(){
  const filters=wmsGetRecountingFilters();
  const requestFilters=Object.assign({},filters);
  // «С расхождениями» вычисляется только из деталей, поэтому сначала берём все статусы.
  if(String(requestFilters.status||'').toUpperCase()==='DISCREPANCY')requestFilters.status='all';
  wmsSetStatus('Загружаю пересчёты из WMS…','wait');
  try{
    const raw=await wmsCallNative('lookupWmsRecountingTasks',[JSON.stringify(requestFilters)],45000);
    wmsLastRecountingRaw=raw;
    const result=wmsNormalizeRecountingResult(raw);
    wmsRenderRecountingResult(result);
    const shown=wmsApplyRecountingFilters(result.rows,filters).length;
    const note=String(filters.status||'').toUpperCase()==='DISCREPANCY' && !wmsRecountHasDetails(result.rows||[])
      ? ' Для фильтра «С расхождениями» нажми «Загрузить позиции».' : '';
    wmsSetStatus('Пересчёты: '+shown+' строк по фильтру.'+note,'ok');
  }catch(e){wmsSetStatus((e&&e.message)||WMS_AUTO_UNAVAILABLE,'err');}
}
function wmsFindDetailTasks(payload){
  if(!payload)return [];
  if(payload.value&&Array.isArray(payload.value.tasks))return payload.value.tasks;
  if(Array.isArray(payload.tasks))return payload.tasks;
  return [];
}
async function wmsLoadRecountingDetails(){
  if(!wmsLastResult || String(wmsLastResult.mode||'')!=='recountingTasks'){alert('Сначала загрузи список пересчётов');return;}
  const currentFilters=wmsGetRecountingFilters();
  const detailFilters=Object.assign({},currentFilters,{status:String(currentFilters.status||'').toUpperCase()==='DISCREPANCY'?'all':currentFilters.status});
  const rows=wmsApplyRecountingFilters(wmsLastResult.rows||[],detailFilters).filter(r=>r.id && !r.detailLoaded);
  if(!rows.length){wmsSetStatus('Позиции уже загружены или нет id пересчётов.','ok');return;}
  const ids=rows.map(r=>r.id);
  wmsSetStatus('Загружаю позиции пересчётов: '+ids.length+' задач…','wait');
  try{
    const raw=await wmsCallNative('lookupWmsRecountingTaskDetails',[JSON.stringify(ids)],120000);
    const tasks=wmsFindDetailTasks(raw);
    const byId={};
    tasks.forEach(t=>{const id=t.id||t._loadedDetailId||''; if(id)byId[id]=t;});
    (wmsLastResult.rows||[]).forEach(r=>{if(r.id&&byId[r.id])wmsApplyRecountDetail(r,byId[r.id]);});
    wmsRenderRecountingResult(wmsLastResult);
    const loaded=tasks.length;
    const errors=(raw&&raw.value&&Array.isArray(raw.value.errors))?raw.value.errors.length:0;
    wmsSetStatus('Позиции загружены: '+loaded+(errors?(' · ошибок: '+errors):''),'ok');
  }catch(e){wmsSetStatus((e&&e.message)||'Не смог загрузить позиции пересчётов.','err');}
}
function wmsRecountingToday(){
  const d=new Date();
  const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const f=document.getElementById('wms-rc-date-from'); if(f)f.value=iso;
  const t=document.getElementById('wms-rc-date-to'); if(t)t.value=iso;
  wmsLoadRecountingTasks();
}
function wmsClearRecountingFilters(){
  const set=(id,v)=>{const el=document.getElementById(id); if(el)el.value=v;};
  set('wms-rc-status','all'); set('wms-rc-scope','all'); set('wms-rc-date-from',''); set('wms-rc-date-to',''); set('wms-rc-executor',''); set('wms-rc-cell',''); set('wms-rc-executor-id','');
  wmsSetRecountReasons(true);
  if(wmsLastResult && String(wmsLastResult.mode||'')==='recountingTasks')wmsRenderRecountingResult(wmsLastResult);
}
function wmsCopyRecountingTsv(){
  if(!wmsLastResult || String(wmsLastResult.mode||'')!=='recountingTasks'){alert('Нет списка пересчётов');return;}
  const rows=wmsApplyRecountingFilters(wmsLastResult.rows||[],wmsGetRecountingFilters());
  const head=['Дата','Исполнитель','Ячейка','Зона','Тип','Причина','Статус','Позиций','Партий','Система','Факт','Расхождение','Брак','ID'];
  const lines=[head.join('\t')].concat(rows.map(r=>[
    wmsRecountDateText(r.completedAt||r.createdAt),r.executorName,r.cellAddress,r.zoneName,wmsRecountLabelScope(r.scope),wmsRecountLabelReason(r.reason),wmsRecountLabelStatus(r.status),
    r.detailLoaded?r.positionCount:'',r.detailLoaded?r.partCount:'',r.detailLoaded?r.expectedQty:'',r.detailLoaded?r.actualQty:'',r.detailLoaded?r.discrepancyQty:'',r.detailLoaded?r.defectiveQty:'',r.id
  ].map(v=>String(v||'').replace(/\t/g,' ').replace(/\n/g,' ')).join('\t')));
  wmsCopyFallback(lines.join('\n')).then(()=>wmsSetStatus('TSV пересчётов скопирован: '+rows.length+' строк.','ok'));
}


// ── WMS MOBILE CARDS v59 ──
// На телефоне позиции и пересчёты показываются карточками: без горизонтальной прокрутки.
function wmsStockFieldValue(row, field){
  row=row||{};
  const p=(wmsLastResult&&wmsLastResult.product)||{};
  if(field==='ut') return String(row.nomenclatureCode||p.nomenclatureCode||'');
  if(field==='name') return String(row.name||p.name||'');
  if(field==='barcode'){
    if(row.barcode)return String(row.barcode);
    if(Array.isArray(row.barcodes)&&row.barcodes.length)return String(row.barcodes[0]||'');
    if(p.barcode)return String(p.barcode);
    if(Array.isArray(p.barcodes)&&p.barcodes.length)return String(p.barcodes[0]||'');
    return '';
  }
  if(field==='hu') return String(row.handlingUnitBarcode||'');
  return '';
}
function wmsCopyStockField(index, field){
  const rows=(wmsLastResult&&wmsLastResult.rows)||[];
  const row=rows[Number(index)]||{};
  const value=wmsStockFieldValue(row,field);
  const label={ut:'УТ',barcode:'ШК',name:'Наименование',hu:'ЕО/HU'}[field]||'Поле';
  if(!value){wmsSetStatus(label+' для этой позиции не найден.','err');return;}
  wmsCopyFallback(value).then(()=>wmsSetStatus(label+' скопирован.','ok'));
}
function wmsStockStatusLabel(status){
  const code=String(status||'').trim().toUpperCase();
  const map={RESERVED_FOR_ORDER:'Резерв под заказ',AVAILABLE:'Доступен',DEFECTIVE:'Брак',BLOCKED:'Заблокирован'};
  return map[code]||String(status||'');
}
function wmsStockCopyButtons(sourceIndex,row){
  const btn=(label,field,enabled=true)=>enabled?'<button class="wms-mini-copy" onclick="wmsCopyStockField('+sourceIndex+',\''+field+'\')">'+label+'</button>':'';
  return '<div class="wms-stock-copy-row">'+
    btn('УТ','ut',!!wmsStockFieldValue(row,'ut'))+
    btn('ШК','barcode',!!wmsStockFieldValue(row,'barcode'))+
    btn('Название','name',!!wmsStockFieldValue(row,'name'))+
    btn('ЕО','hu',!!wmsStockFieldValue(row,'hu'))+
  '</div>';
}
function wmsStockCardsHtml(result, rows){
  const all=(result&&result.rows)||[];
  const mode=String((result&&result.mode)||'');
  const cellAddr=(result&&result.cellAddress)||'';
  return (rows||[]).map(r=>{
    const sourceIndex=Math.max(0,all.indexOf(r));
    const name=wmsStockFieldValue(r,'name')||'Товар';
    const ut=wmsStockFieldValue(r,'ut');
    const qty=Number(r.quantity)||0;
    const date=r.bestBeforeDate?('до '+r.bestBeforeDate):'';
    const hu=wmsStockFieldValue(r,'hu');
    const location=mode==='product'?[r.cellAddress,r.zoneName||r.locationName].filter(Boolean).join(' · '):(r.zoneName||'');
    const status=r.status?wmsStockStatusLabel(r.status):'';
    const meta=[ut,date,hu&&('ЕО '+hu),location,status].filter(Boolean).join(' · ');
    const countBtn=(mode==='cell')?('<button class="exi-btn primary" onclick="wmsCountFromCell(\''+jsStr(cellAddr||r.cellAddress||'')+'\',\''+jsStr(ut||'')+'\',\''+jsStr(name||'')+'\','+qty+')">📊 Посчитать</button>'):'';
    return '<div class="p-item">'+
        '<div class="p-thumb">📦</div>'+
        '<div class="p-item-body">'+
          '<div class="p-item-name">'+escHtml(name)+'</div>'+
          (meta?'<div class="p-item-meta mono">'+escHtml(meta)+'</div>':'')+
        '</div>'+
        '<div class="p-qty"><b>'+escHtml(qty)+'</b><span>шт</span></div>'+
      '</div>'+
      '<div class="p-item-actions">'+wmsStockCopyButtons(sourceIndex,r)+countBtn+'</div>';
  }).join('');
}
function wmsRenderResult(result){
  wmsLastResult=result; wmsLastChoices=null;
  const box=document.getElementById('wms-result'); if(!box)return;
  const p=(result&&result.product)||{};
  const sourceRows=(result&&result.rows)||[];
  const rows=wmsApplyStorageFilter(sourceRows);
  if(!sourceRows.length){box.innerHTML='<div class="no-results">Нет строк</div>';return;}
  if(String(result.mode||'').indexOf('changes')===0){box.innerHTML=wmsRenderChangesResult(result,p,sourceRows);return;}
  if(!rows.length){box.innerHTML='<div class="no-results">По фильтру хранения строк нет. <button class="exi-btn" onclick="wmsToggleStorageOnly()">Показать всё</button></div>';return;}
  const isCell=result.mode==='cell';
  const isHu=result.mode==='hu';
  const title=isCell?('Ячейка '+(result.cellAddress||rows[0].cellAddress||'')):(isHu?('ЕО '+(result.query||rows[0].handlingUnitBarcode||'')):(p.name||rows[0].name||'Товар из WMS'));
  const sub=isCell?'Содержимое ячейки':(isHu?'Содержимое ЕО':(p.nomenclatureCode||''));
  const totalRows=result.totalRows||rows.length;
  const totalQty=(result.totalQuantity!==undefined&&result.totalQuantity!==null)?result.totalQuantity:rows.reduce((s,r)=>s+(Number(r.quantity)||0),0);
  const euSet={}; rows.forEach(r=>{const h=wmsStockFieldValue(r,'hu'); if(h)euSet[h]=1;}); const euCount=Object.keys(euSet).length;
  const stats='<div class="stats">'+
      '<div class="stat"><b>'+escHtml(totalRows)+'</b><span>позиции</span></div>'+
      '<div class="stat"><b class="accent">'+escHtml(totalQty)+'</b><span>остаток, шт</span></div>'+
      (euCount?'<div class="stat"><b class="blue">'+escHtml(euCount)+'</b><span>ЕО</span></div>':'')+
    '</div>';
  box.innerHTML='<div class="lead-card">'+
      '<div class="lead-head"><div><div class="lead-title">'+escHtml(title)+'</div>'+(sub?'<div class="lead-sub">'+escHtml(sub)+'</div>':'')+'</div></div>'+
      stats+
      '<div class="p-items">'+wmsStockCardsHtml(result,rows)+'</div>'+
      '<div class="btns">'+wmsStorageToggleButton()+'<button class="exi-btn" onclick="wmsCopyCells()">Скопировать список</button></div>'+
    '</div>';
}
function wmsRecountStatusClass(r){
  if(wmsRecountHasDiscrepancy(r))return 'discrepancy';
  const s=String((r&&r.status)||'').toUpperCase();
  if(/AWAITING/.test(s))return 'awaiting';
  if(/REJECT|DECLIN/.test(s))return 'rejected';
  if(/CANCEL/.test(s))return 'cancelled';
  if(/COMPLETE/.test(s))return 'completed';
  if(/PROGRESS/.test(s))return 'progress';
  return 'default';
}
function wmsRecountStatusBadges(r){
  const main='<span class="wms-recount-status '+wmsRecountStatusClass(Object.assign({},r,{detailLoaded:false}))+'">'+escHtml(wmsRecountLabelStatus(r.status))+'</span>';
  const discrepancy=wmsRecountHasDiscrepancy(r)?'<span class="wms-recount-status discrepancy">Есть расхождение '+escHtml(wmsDeltaText(r.discrepancyQty))+'</span>':'';
  return '<div class="wms-recount-statuses">'+main+discrepancy+'</div>';
}
function wmsRecountProductsHtml(r){
  if(!r||!r.detailLoaded||!r.detailTask||!Array.isArray(r.detailTask.products))return '';
  const products=r.detailTask.products;
  const lines=products.slice(0,60).map(p=>{
    const parts=Array.isArray(p.parts)?p.parts:[];
    const expected=parts.reduce((s,x)=>s+wmsNum(x.expectedQuantity),0);
    const actual=parts.reduce((s,x)=>s+wmsNum(x.actualQuantity),0);
    const diff=parts.reduce((s,x)=>{let d=x.discrepancy; if(d===undefined||d===null||d==='')d=wmsNum(x.actualQuantity)-wmsNum(x.expectedQuantity); return s+wmsNum(d);},0);
    return '<div class="wms-recount-product"><b>'+escHtml(p.productName||'Товар')+'</b><span>сист. '+escHtml(expected)+' · факт '+escHtml(actual)+(diff!==0?' · разн. '+escHtml(wmsDeltaText(diff)):'')+'</span></div>';
  }).join('');
  const tail=products.length>60?'<div class="wms-recount-product-tail">Ещё '+escHtml(products.length-60)+' позиций не показано</div>':'';
  return '<details class="wms-recount-products"><summary>Товары в пересчёте · '+escHtml(products.length)+'</summary>'+lines+tail+'</details>';
}
function wmsRecountActionButtons(r){
  if(String((r&&r.status)||'').toUpperCase()!=='AWAITING_CONFIRMATION')return '';
  const id=escHtml(String((r&&r.id)||''));
  if(!r.detailLoaded)return '<div class="wms-recount-actions"><button class="exi-btn" onclick="wmsLoadOneRecountDetail(&quot;'+id+'&quot;)">Открыть позиции</button></div>';
  if(!wmsRecountHasDiscrepancy(r))return '<div class="wms-recount-auto">Без расхождений — WMS подтверждает такой пересчёт автоматически.</div>';
  return '<div class="wms-recount-actions"><button class="exi-btn primary" onclick="wmsDecideRecount(&quot;'+id+'&quot;,&quot;COMPLETED_WITH_DISCREPANCY&quot;)">Подтвердить</button><button class="exi-btn danger" onclick="wmsDecideRecount(&quot;'+id+'&quot;,&quot;REJECTED&quot;)">Отклонить</button></div>';
}
function wmsRecountCardsHtml(rows){
  return '<div class="wms-recount-list">'+(rows||[]).map(r=>{
    const date=wmsRecountDateText(r.completedAt||r.createdAt)||'Без даты';
    const full=[wmsRecountLabelScope(r.scope),wmsRecountLabelReason(r.reason)].filter(Boolean).join(' · ');
    const numeric=r.detailLoaded
      ? '<div class="wms-recount-numbers"><span>Поз. <b>'+escHtml(r.positionCount)+'</b></span><span>Сист. <b>'+escHtml(r.expectedQty)+'</b></span><span>Факт <b>'+escHtml(r.actualQty)+'</b></span><span>Разн. <b>'+escHtml(wmsDeltaText(r.discrepancyQty))+'</b></span></div>'
      : '<div class="wms-recount-pending">Позиции ещё не загружены</div>';
    return '<article class="wms-recount-card">'+
      '<div class="wms-recount-card-top"><div><div class="wms-recount-cell">'+escHtml(r.cellAddress||'—')+'</div><div class="wms-recount-date">'+escHtml(date)+(r.zoneName?' · '+escHtml(r.zoneName):'')+'</div></div>'+wmsRecountStatusBadges(r)+'</div>'+ 
      '<div class="wms-recount-person-line">'+escHtml(r.executorName||'Исполнитель не указан')+'</div>'+ 
      '<div class="wms-recount-type">'+escHtml(full||'Пересчёт')+'</div>'+numeric+wmsRecountProductsHtml(r)+wmsRecountActionButtons(r)+
    '</article>';
  }).join('')+'</div>';
}
function wmsRenderRecountingResult(result){
  wmsLastResult=result; wmsLastChoices=null;
  const box=document.getElementById('wms-result'); if(!box)return;
  const filters=wmsGetRecountingFilters();
  const allRows=(result&&result.rows)||[];
  const rows=wmsApplyRecountingFilters(allRows,filters);
  const hasDetails=wmsRecountHasDetails(allRows);
  if(!rows.length && String(filters.status||'').toUpperCase()==='DISCREPANCY' && !hasDetails){
    box.innerHTML='<div class="wms-card"><div class="wms-card-body"><div class="wms-product-name">Расхождения ещё не посчитаны</div><div class="wms-meta">Чтобы показать пересчёты с расхождениями, сначала загрузи позиции. WMS хранит разницу внутри деталей каждого задания.</div></div></div><div class="wms-actions"><button class="exi-btn primary" onclick="wmsLoadRecountingDetails()">Загрузить позиции</button></div>';
    return;
  }
  if(!rows.length){box.innerHTML='<div class="no-results">Пересчётов по этим фильтрам нет</div>';return;}
  const byExecutor=wmsCountBy(rows,r=>r.executorName||'Без исполнителя');
  const statusCounts=wmsCountBy(rows,r=>wmsRecountLabelStatus(r.status)||'Без статуса');
  const full=rows.filter(r=>String(r.scope).toUpperCase()==='FULL').length;
  const partial=rows.filter(r=>String(r.scope).toUpperCase()==='PARTIAL').length;
  const withDiscrepancy=rows.filter(wmsRecountHasDiscrepancy).length;
  const totalPositions=wmsRecountSum(rows,'positionCount');
  const totalActual=wmsRecountSum(rows,'actualQty');
  const totalDiscrep=wmsRecountSum(rows,'discrepancyQty');
  const curEx=String(filters.executor||'').trim().toLowerCase();
  const execEntries=wmsTopEntries(byExecutor,20);
  const resetChip=curEx?'<button class="wms-recount-person" style="cursor:pointer;border:1px solid var(--border);background:var(--bg2);border-radius:8px;padding:7px 10px;" onclick="wmsFilterRecountByExecutor(\'\')"><b>✕ Показать всех</b></button>':'';
  const executorCards=resetChip+execEntries.map(([name,n])=>{
    const active=!!curEx&&String(name).toLowerCase().includes(curEx);
    return '<button class="wms-recount-person" style="cursor:pointer;text-align:left;border:1px solid '+(active?'var(--gold)':'var(--border)')+';background:'+(active?'rgba(212,175,55,0.14)':'var(--bg2)')+';border-radius:8px;padding:7px 10px;" onclick="wmsFilterRecountByExecutor(\''+jsStr(String(name))+'\')"><b>'+escHtml(name)+'</b><span> · '+escHtml(n)+' пересч.'+(hasDetails?' · поз. '+escHtml(wmsRecountSum(rows.filter(r=>(r.executorName||'Без исполнителя')===name),'positionCount')):'')+'</span></button>';
  }).join('');
  const statuses=wmsTopEntries(statusCounts,12).map(([name,n])=>'<span class="wms-recount-badge">'+escHtml(name)+' · '+escHtml(n)+'</span>').join('');
  box.innerHTML='<div class="wms-card"><div class="wms-card-body"><div class="wms-product-name">Задания на пересчёт</div><div class="wms-meta">Показано: <b>'+escHtml(rows.length)+'</b> · загружено: <b>'+escHtml(result.loadedRows||result.totalRows||allRows.length)+'</b>'+(hasDetails?' · детали есть':'')+'</div></div></div>'+ 
    '<div class="wms-recount-summary">'+
      '<div class="wms-recount-stat"><b>'+escHtml(rows.length)+'</b><span>заданий</span></div>'+ 
      '<div class="wms-recount-stat"><b>'+escHtml(Object.keys(byExecutor).length)+'</b><span>исполнителей</span></div>'+ 
      '<div class="wms-recount-stat"><b>'+escHtml(full)+' / '+escHtml(partial)+'</b><span>полный / частичный</span></div>'+ 
      '<div class="wms-recount-stat"><b>'+escHtml(withDiscrepancy)+'</b><span>с расхождениями</span></div>'+
      (hasDetails?'<div class="wms-recount-stat"><b>'+escHtml(totalPositions)+'</b><span>товарных позиций</span></div><div class="wms-recount-stat"><b>'+escHtml(totalActual)+'</b><span>факт, шт.</span></div><div class="wms-recount-stat"><b>'+escHtml(wmsDeltaText(totalDiscrep))+'</b><span>суммарная разница</span></div>':'')+
    '</div>'+ 
        wmsRenderSurplusBlock(rows)+
    '<div class="wms-filter-title">Статусы в выборке</div><div class="wms-recount-status-summary">'+statuses+'</div>'+ 
    '<div class="wms-filter-title">Кто и сколько · нажми фамилию, чтобы показать только его</div><div class="wms-recount-executors">'+executorCards+'</div>'+
    '<div class="wms-actions wms-result-actions"><button class="exi-btn primary" onclick="wmsLoadRecountingDetails()">Загрузить позиции</button><button class="exi-btn" onclick="wmsCopyRecountingTsv()">Скопировать TSV</button><button class="exi-btn" onclick="wmsLoadRecountingTasks()">Обновить</button></div>'+ 
    wmsRecountCardsHtml(rows);
}


// Быстрый фильтр списка пересчётов по фамилии исполнителя (клик по карточке)
function wmsFilterRecountByExecutor(name){
  const el=document.getElementById('wms-rc-executor');
  if(el)el.value=(String(name||'')==='Без исполнителя')?'':String(name||'');
  if(wmsLastResult&&String(wmsLastResult.mode||'')==='recountingTasks')wmsRenderRecountingResult(wmsLastResult);
}
function wmsRecountExecutorInput(){
  if(wmsLastResult&&String(wmsLastResult.mode||'')==='recountingTasks')wmsRenderRecountingResult(wmsLastResult);
}
window.wmsFilterRecountByExecutor=wmsFilterRecountByExecutor;window.wmsRecountExecutorInput=wmsRecountExecutorInput;

// ── v60: подтверждение пересчётов и отбор по открытым заказам ──
async function wmsLoadOneRecountDetail(id){
  if(!id){wmsSetStatus('Нет id задания пересчёта.','err');return;}
  wmsSetStatus('Открываю товары и расхождения…','wait');
  try{
    const raw=await wmsCallNative('lookupWmsRecountingTaskDetails',[JSON.stringify([id])],45000);
    const task=wmsFindDetailTasks(raw)[0];
    const row=(wmsLastResult&&wmsLastResult.rows||[]).find(x=>x.id===id);
    if(!task||!row)throw new Error('WMS не вернула детали пересчёта');
    wmsApplyRecountDetail(row,task);
    wmsRenderRecountingResult(wmsLastResult);
    wmsSetStatus('Детали пересчёта открыты. Проверь позиции перед решением.','ok');
  }catch(e){wmsSetStatus((e&&e.message)||'Не смог открыть детали пересчёта.','err');}
}
async function wmsDecideRecount(id,status){
  const row=(wmsLastResult&&wmsLastResult.rows||[]).find(x=>x.id===id);
  if(!row){wmsSetStatus('Не нашёл пересчёт в списке. Обнови данные.','err');return;}
  if(!row.detailLoaded){await wmsLoadOneRecountDetail(id);return;}
  if(!wmsRecountHasDiscrepancy(row)){wmsSetStatus('Без расхождений WMS подтверждает пересчёт автоматически.','ok');return;}
  const action=status==='REJECTED'?'Отклонить':'Подтвердить';
  const prompt=action+' пересчёт?\n\nЯчейка: '+(row.cellAddress||'—')+'\nПозиций: '+(row.positionCount??'—')+'\nСистема: '+(row.expectedQty??'—')+'\nФакт: '+(row.actualQty??'—')+'\nРазница: '+wmsDeltaText(row.discrepancyQty)+'\n\nДействие изменит статус в WMS.';
  if(!confirm(prompt))return;
  wmsSetStatus('Проверяю свежие детали и '+action.toLowerCase()+' пересчёт…','wait');
  try{
    const freshRaw=await wmsCallNative('lookupWmsRecountingTaskDetails',[JSON.stringify([id])],45000);
    const fresh=wmsFindDetailTasks(freshRaw)[0];
    if(!fresh)throw new Error('Не смог получить свежую версию задания');
    const currentVersion=Number(fresh.taskVersion);
    if(!Number.isFinite(currentVersion))throw new Error('В WMS нет taskVersion для подтверждения');
    // ВМС ждёт ТЕКУЩУЮ версию задания (не +1) — как в её штатном запросе /confirm
    const payload={taskId:id,status:status,taskVersion:currentVersion};
    await wmsCallNative('confirmWmsRecountingTask',[JSON.stringify(payload)],45000);
    // Проверяем, реально ли поменялся статус в WMS (иначе карточка «исчезает», но пересчёт не подтверждён)
    let verifyTask=null;
    try{const vRaw=await wmsCallNative('lookupWmsRecountingTaskDetails',[JSON.stringify([id])],45000);verifyTask=wmsFindDetailTasks(vRaw)[0]||null;}catch(_){}
    const newStatus=String((verifyTask&&verifyTask.status)||'').toUpperCase();
    const ok=status==='REJECTED'?/REJECT|DECLIN|CANCEL/.test(newStatus):/COMPLETED/.test(newStatus);
    if(verifyTask)wmsApplyRecountDetail(row,verifyTask); else wmsApplyRecountDetail(row,fresh);
    if(ok){
      row.status=newStatus||status;
      wmsRenderRecountingResult(wmsLastResult);
      wmsSetStatus(status==='REJECTED'?'Пересчёт отклонён в WMS.':'Пересчёт подтверждён в WMS (статус: '+newStatus+').','ok');
    }else{
      // Не подтвердилось — статус в WMS не сменился. Карточку оставляем, сообщаем правду.
      row.status=newStatus||row.status;
      wmsRenderRecountingResult(wmsLastResult);
      wmsSetStatus('WMS НЕ подтвердил: статус остался «'+(newStatus||'неизвестно')+'». Похоже, запрос подтверждения отличается. Пришли мне запрос подтверждения из ВМС (DevTools): URL, метод и тело.','err');
    }
  }catch(e){wmsSetStatus((e&&e.message)||'Не удалось изменить статус пересчёта.','err');}
}
/* v66 — резерв ячейки: проверка статусов остатков, без обхода заказов. */
function wmsPickCell(v){return String(v||'').trim().toUpperCase().replace(/\s+/g,'');}
function wmsReservationStatus(v){return String(v||'').trim().toUpperCase().replace(/[\s-]+/g,'_');}
function wmsIsPickingReservationStatus(v){
  const s=wmsReservationStatus(v);
  // Основной статус Samokat WMS: RESERVED_FOR_ORDER. Остальные — на случай отличий API.
  return /RESERV|PICKING|ALLOCAT|ASSIGN/.test(s);
}
function wmsReservationStatusLabel(v){
  const s=wmsReservationStatus(v);
  if(/RESERVED_FOR_ORDER|RESERVED.*ORDER/.test(s))return 'Резерв под заказ';
  if(/RESERV/.test(s))return 'В резерве';
  if(/PICKING/.test(s))return 'В отборе';
  if(/ALLOCAT|ASSIGN/.test(s))return 'Назначено на отбор';
  return String(v||'Статус не указан');
}
function wmsNormalizeCellReservationResult(raw, requestedCell){
  try{return wmsNormalizeResult(raw);}
  catch(e){
    // Пустая ячейка — корректный результат: value.items может быть пустым.
    const items=wmsFindStockItems(raw)||[];
    if(Array.isArray(items) && !items.length){
      return {mode:'cell',cellAddress:(raw&&raw._cellAddress)||requestedCell||'',product:{name:'',nomenclatureCode:'',barcode:'',barcodes:[]},rows:[],totalRows:0,totalQuantity:0};
    }
    throw e;
  }
}
function wmsRenderCellReservation(result, requestedCell){
  window.wmsLastCellReservation=result||window.wmsLastCellReservation||null;
  const box=document.getElementById('wms-result'); if(!box)return;
  const cell=wmsPickCell(requestedCell||((result&&result.cellAddress)||''));
  const all=Array.isArray(result&&result.rows)?result.rows:[];
  const reserve=all.filter(r=>wmsIsPickingReservationStatus(r&&r.status));
  const reserveQty=reserve.reduce((n,r)=>n+(Number(r.quantity)||0),0);
  const huCount=new Set(reserve.map(r=>String(r.handlingUnitBarcode||'').trim()).filter(Boolean)).size;
  const yes=reserve.length>0;
  const stateTitle=yes?'В ячейке есть резерв под отбор':'Отбора в ячейке не видно';
  const stateText=yes
    ? 'WMS вернула '+reserve.length+' '+(reserve.length===1?'строку':'строк(и)')+' со статусом резерва/отбора.'
    : (all.length?'В WMS есть остаток, но ни одна строка не имеет статуса резерва или отбора.':'Ячейка системно пустая: строк остатков нет.');
  const stateClass=yes?'wms-stock-status':'wms-stock-status';
  const stateBadge='<span class="'+stateClass+'">'+(yes?'РЕЗЕРВ ЕСТЬ':'РЕЗЕРВА НЕТ')+'</span>';
  const cards=reserve.map(r=>{
    const name=r.name||'Товар'; const ut=r.nomenclatureCode||'Без УТ'; const hu=r.handlingUnitBarcode||'';
    return '<article class="wms-picking-card"><div class="wms-picking-head"><div><div class="wms-picking-name">'+escHtml(name)+'</div><div class="wms-picking-meta">'+escHtml(ut)+' · '+escHtml(Number(r.quantity)||0)+' шт. · '+escHtml(wmsReservationStatusLabel(r.status))+'</div></div>'+stateBadge+'</div>'+
      (hu?'<div class="wms-picking-code">ЕО '+escHtml(hu)+'</div>':'')+'</article>';
  }).join('');
  const note='Проверка идёт прямо по stocks/details выбранной ячейки. Номер заказа WMS в этом ответе не отдаёт — приложение его не придумывает.';
  box.innerHTML='<div class="wms-card"><div class="wms-card-body"><div class="wms-product-name">'+escHtml(stateTitle)+'</div><div class="wms-meta">Ячейка <b>'+escHtml(cell||((result&&result.cellAddress)||'—'))+'</b> · '+escHtml(stateText)+'</div></div></div>'+
    '<div class="wms-picking-summary"><b>'+escHtml(reserve.length)+'</b><span>строк в резерве</span><b>'+escHtml(huCount)+'</b><span>ЕО</span><b>'+escHtml(reserveQty)+'</b><span>шт.</span></div>'+
    (cards?'<div class="wms-picking-list">'+cards+'</div>':'<div class="no-results">'+escHtml(stateText)+'</div>')+
    '<div class="wms-picking-note">'+escHtml(note)+'</div>';
}
async function wmsCheckPickingCell(){
  const el=document.getElementById('wms-picking-cell');
  const cell=wmsPickCell(el?el.value:'');
  if(!cell){wmsSetStatus('Введи ячейку хранения, например HH-2-4-3-1.','err');return;}
  if(el)el.value=cell;
  wmsSetStatus('Проверяю резерв и отбор в ячейке '+cell+'…','wait');
  try{
    const raw=await wmsNativeLookup(cell);
    const result=wmsNormalizeCellReservationResult(raw,cell);
    if(result&&result._kind==='cellChoices'){
      wmsRenderChoices(result);
      wmsSetStatus('ВМС нашла несколько похожих ячеек. Выбери точный адрес.','err');
      return;
    }
    window.wmsLastCellReservation=result;
    wmsRenderCellReservation(result,cell);
    const reserve=(result.rows||[]).filter(r=>wmsIsPickingReservationStatus(r&&r.status));
    wmsSetStatus(reserve.length?'Есть резерв: '+reserve.length+' строк(и), '+reserve.reduce((n,r)=>n+(Number(r.quantity)||0),0)+' шт.':'Резерв/отбор на ячейке не найден.','ok');
  }catch(e){
    wmsSetStatus((e&&e.message)||'Не смог проверить резерв ячейки.','err');
  }
}
function wmsClearPickingCellCheck(){
  const el=document.getElementById('wms-picking-cell'); if(el)el.value='';
  window.wmsLastCellReservation=null;
  const box=document.getElementById('wms-result');
  if(box)box.innerHTML='<div class="hint" style="padding:24px 12px;"><span class="mark">⇄</span><span class="txt">Введи ячейку хранения и нажми «Проверить резерв».</span></div>';
  wmsSetStatus('Проверка резерва очищена.','ok');
}

// ── v61: верхние ярусы и крупные минусы хранения ──
function wmsUpperAddr(v){return String(v||'').trim().toUpperCase();}
function wmsUpperRowKey(addr){
  const p=wmsUpperAddr(addr).split('-').filter(Boolean);
  return p.length>2 ? p.slice(0,Math.max(1,p.length-2)).join('-') : wmsUpperAddr(addr);
}
function wmsUpperLastNumber(addr){
  const p=wmsUpperAddr(addr).split('-').filter(Boolean); const last=p[p.length-1]||'';
  return /^\d+$/.test(last)?Number(last):null;
}
function wmsUpperZoneKey(c){
  const a=wmsUpperAddr(c.address||c.cellAddress||''); const z=String(c.zoneName||c.zone?.name||'').toLowerCase();
  if(a.startsWith('HH-')||z.includes('холод'))return 'cold';
  if(a.startsWith('SH-')||z.includes('сух'))return 'dry';
  return 'other';
}
function wmsUpperItems(raw){
  const v=raw&&raw.value?raw.value:raw||{};
  const items=Array.isArray(v.items)?v.items:(Array.isArray(raw&&raw.items)?raw.items:[]);
  // Сохраняем все исходные поля ячейки (в т.ч. возможный код ШК), добавляя нормализованные сверху
  return items.map(x=>Object.assign({}, x, {
    cellId:String(x.id||x.cellId||'').trim(), address:String(x.address||x.cellAddress||'').trim(),
    zoneName:String((x.zone&&x.zone.name)||x.zoneName||'').trim(), locationName:String((x.location&&x.location.name)||x.locationName||'').trim(),
    type:String(x.type||''), status:String(x.status||''), allowedOperations:Array.isArray(x.allowedOperations)?x.allowedOperations:[]
  })).filter(x=>x.cellId&&x.address);
}
function wmsUpperFiltered(){
  const zone=document.getElementById('wms-upper-zone')?.value||'all';
  const row=wmsUpperAddr(document.getElementById('wms-upper-row')?.value||'');
  const parity=document.getElementById('wms-upper-parity')?.value||'all';
  const state=document.getElementById('wms-upper-state')?.value||'all';
  return (wmsUpperCells||[]).filter(c=>{
    if(zone!=='all'&&wmsUpperZoneKey(c)!==zone)return false;
    const key=wmsUpperRowKey(c.address);
    if(row && !(key===row || key.includes(row)))return false;
    const n=wmsUpperLastNumber(c.address);
    if(parity==='even' && (n===null||n%2!==0))return false;
    if(parity==='odd' && (n===null||n%2!==1))return false;
    const o=wmsUpperOccupancy[c.cellId];
    if(state==='occupied' && !(o&&o.hasStock))return false;
    if(state==='empty' && !(o&&!o.hasStock))return false;
    return true;
  }).sort((a,b)=>String(a.address).localeCompare(String(b.address),'ru'));
}
function wmsFillUpperRowList(){
  const dl=document.getElementById('wms-upper-row-list'); if(!dl)return;
  const zone=document.getElementById('wms-upper-zone')?.value||'all';
  const vals=[...new Set((wmsUpperCells||[]).filter(c=>zone==='all'||wmsUpperZoneKey(c)===zone).map(c=>wmsUpperRowKey(c.address)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  dl.innerHTML=vals.map(v=>'<option value="'+escHtml(v)+'"></option>').join('');
}
function wmsUpperFilterChanged(){wmsFillUpperRowList();wmsRenderUpperStorage();}
function wmsUpperCopy(v,label){wmsCopyFallback(v||'').then(()=>wmsSetStatus((label||'Данные')+' скопировано.','ok'));}
function wmsRenderUpperStorage(){
  const box=document.getElementById('wms-result'); if(!box||wmsLookupKind!=='upper')return;
  const all=wmsUpperCells||[]; const rows=wmsUpperFiltered();
  if(!all.length){box.innerHTML='<div class="hint" style="padding:24px 12px;"><span class="mark">▥</span><span class="txt">Загрузи справочник верхних ярусов. После этого будут доступны фильтры по ряду и чётности.</span></div>';return;}
  const loaded=Object.keys(wmsUpperOccupancy||{}).length;
  const occ=rows.filter(c=>wmsUpperOccupancy[c.cellId]&&wmsUpperOccupancy[c.cellId].hasStock).length;
  const empty=rows.filter(c=>wmsUpperOccupancy[c.cellId]&&!wmsUpperOccupancy[c.cellId].hasStock).length;
  const cards=rows.slice(0,180).map(c=>{
    const o=wmsUpperOccupancy[c.cellId];
    const system=!o?'Остатки не проверены':(o.hasStock?('Системно занято · '+o.stockRows+' строк · '+o.quantity+' шт. · '+o.huCount+' ЕО'):'Системно пусто');
    const cls=!o?'unknown':(o.hasStock?'occupied':'empty');
    const last=wmsUpperLastNumber(c.address);
    const lastText=last===null?'':' · № '+escHtml(last);
    return '<article class="wms-upper-card '+cls+'"><div class="wms-upper-head"><div><div class="wms-upper-address">'+escHtml(c.address)+'</div><div class="wms-upper-meta">'+escHtml(c.zoneName||'Зона не указана')+' · ряд '+escHtml(wmsUpperRowKey(c.address))+lastText+'</div></div><button class="wms-mini-copy" onclick="wmsUpperCopy(\''+escHtml(c.address)+'\',\'Ячейка\')">Ячейка</button></div><div class="wms-upper-system">'+escHtml(system)+'</div><div class="wms-upper-actions"><button class="wms-mini-copy" onclick="wmsLookupCellId(\''+escHtml(c.cellId)+'\',\''+escHtml(c.address)+'\')">Открыть</button><button class="wms-mini-copy" onclick="wmsUpperCopy(\''+escHtml(wmsUpperRowKey(c.address))+'\',\'Ряд\')">Ряд</button></div></article>';
  }).join('');
  const tail=rows.length>180?'<div class="wms-upper-note">Показаны первые 180. Сузь ряд или чётность, чтобы не превращать телефон в свиток.</div>':'';
  box.innerHTML='<div class="wms-card"><div class="wms-card-body"><div class="wms-product-name">Верхние ярусы</div><div class="wms-meta">В фильтре «Ряд» используется адрес без двух последних сегментов, например <b>SH-11-65</b>. Чётность — по последнему номеру адреса.</div></div></div><div class="wms-upper-summary"><b>'+escHtml(rows.length)+'</b><span>в выборке</span><b>'+escHtml(occ)+'</b><span>занято</span><b>'+escHtml(empty)+'</b><span>пусто</span></div><div class="wms-actions wms-upper-result-actions"><button class="exi-btn primary" onclick="wmsCheckUpperOccupancy()">Проверить остатки</button><button class="exi-btn" onclick="wmsLoadUpperStorageCells()">Обновить ячейки</button></div><div class="wms-upper-list">'+(cards||'<div class="no-results">Нет ячеек по выбранному фильтру</div>')+'</div>'+tail;
}
async function wmsLoadUpperStorageCells(){
  wmsStopRequested=false;
  wmsSetStatus('Загружаю все активные верхние ячейки хранения…','wait');
  try{
    const raw=await wmsCallNative('lookupWmsUpperStorageCells',[JSON.stringify({})],120000);
    wmsUpperCells=wmsUpperItems(raw); wmsUpperOccupancy={}; wmsFillUpperRowList(); wmsRenderUpperStorage();
    wmsSetStatus('Загружено верхних ячеек: '+wmsUpperCells.length+'. Сузь ряд и чётность перед проверкой остатков.','ok');
  }catch(e){wmsSetStatus((e&&e.message)||'Не смог загрузить верхние ярусы.','err');}
}
async function wmsCheckUpperOccupancy(){
  const cells=wmsUpperFiltered();
  if(!cells.length){wmsSetStatus('По фильтру нет ячеек.','err');return;}
  if(cells.length>80){wmsSetStatus('Сначала сузь фильтр: сейчас '+cells.length+' ячеек. За раз проверяем до 80, чтобы WMS не закипела.','err');return;}
  wmsSetStatus('Проверяю остатки в '+cells.length+' верхних ячейках…','wait');
  try{
    const raw=await wmsCallNative('lookupWmsUpperStorageOccupancy',[JSON.stringify(cells.map(c=>({cellId:c.cellId,address:c.address,zoneName:c.zoneName})) )],180000);
    const v=raw&&raw.value?raw.value:raw||{}; const items=Array.isArray(v.items)?v.items:[];
    items.forEach(x=>{if(x&&x.cellId)wmsUpperOccupancy[String(x.cellId)]=x;});
    wmsRenderUpperStorage(); wmsSetStatus('Остатки проверены: '+items.length+' ячеек.','ok');
  }catch(e){wmsSetStatus((e&&e.message)||'Не смог проверить остатки верхних ярусов.','err');}
}
function wmsMoscowDayBounds(date){
  const d=String(date||'').trim(); if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return null;
  const dt=new Date(d+'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate()-1);
  const from=dt.toISOString().slice(0,10)+'T21:00:00.000Z';
  const to=d+'T20:59:59.999Z'; return {from,to};
}
function wmsLossSourceZone(r){const a=wmsUpperAddr(r.sourceCellAddress||'');if(a.startsWith('HH-'))return 'cold';if(a.startsWith('SH-'))return 'dry';return 'other';}
function wmsLargeLossRows(){
  const base=wmsLargeLosses&&wmsLargeLosses.rows||[];
  const zone=document.getElementById('wms-loss-zone')?.value||'all';
  const min=Math.max(1,Number(document.getElementById('wms-loss-min')?.value||20)||20);
  const only=document.getElementById('wms-loss-kind')?.value||'all';
  return base.filter(r=>{
    const loss=Math.abs(Math.min(0,Number(r.sourceDelta||0)));
    if(loss<min)return false;
    if(zone!=='all'&&wmsLossSourceZone(r)!==zone)return false;
    if(only==='writeoff'&&!/WRITE_OFF/i.test(String(r.operationType||'')))return false;
    return true;
  }).sort((a,b)=>Math.abs(Number(b.sourceDelta||0))-Math.abs(Number(a.sourceDelta||0)));
}
// ── ЯЧЕЙКИ · ШК · ОСТАТКИ ──
let wmsDisplayedCells=[];
function wmsCellAddr(c){return String((c&&(c.fullAddress||c.address))||'').trim();}
// Ищем реальный код ШК ячейки (на этикетке вшит номер, а не адрес)
function wmsCellRealCode(c){
  if(!c||typeof c!=='object')return '';
  if(c._labelCode)return String(c._labelCode).trim();
  const isGuid=(s)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(String(s));
  const addr=wmsCellAddr(c).toUpperCase();
  const ok=(v)=>{const s=String(v==null?'':v).trim();return s&&!isGuid(s)&&s.toUpperCase()!==addr;};
  const prefer=['barcode','barCode','code','cellBarcode','cellCode','labelCode','externalCode','barcodeValue','number'];
  for(const k of prefer){ if(c[k]!=null&&ok(c[k]))return String(c[k]).trim(); }
  for(const k in c){ if(/(^|_|[a-z])(code|barcode)/i.test(k)&&ok(c[k])){const s=String(c[k]).trim();if(!/^[0-9a-f-]{20,}$/i.test(s))return s;} }
  return '';
}
// Код для штрихкода — ТОЛЬКО реальный код ячейки (из этикетки), НИКОГДА не адрес.
// Адрес — это не сканируемый код; ТСД читает именно вшитый номер этикетки.
function wmsCellBcCode(cell){return String((cell&&wmsCellRealCode(cell))||'').trim();}
// Рекурсивно ищем код ШК в ответе /topology/cells/labels
function wmsExtractLabelCode(data){
  let found='';
  const visit=(o)=>{
    if(found||o==null)return;
    if(Array.isArray(o)){o.forEach(visit);return;}
    if(typeof o==='object'){
      for(const k in o){const v=o[k];
        if((typeof v==='string'||typeof v==='number')){
          const s=String(v).trim();
          if(/(barcode|code|label|value|number)/i.test(k)&&/^[0-9]{4,20}$/.test(s)){found=s;return;}
        }
      }
      for(const k in o)visit(o[k]);
    }
  };
  visit(data&&data.value!=null?data.value:data);
  return found;
}
// Достаём код из текста этикетки: «Код: 01705» либо числовой токен не из адреса
function wmsExtractCellCodeFromText(text, addr){
  text=String(text||'');
  let m=text.match(/код[^0-9A-Za-zА-Яа-я]{0,4}([0-9]{3,14})/i);
  if(m)return m[1];
  const addrDigits=String(addr||'').replace(/\D/g,'');
  const nums=(text.match(/\d{3,14}/g)||[]).filter(s=>s!==addrDigits);
  if(nums.length)return nums[0];
  return '';
}
// Показываем НАСТОЯЩУЮ этикетку ВМС (в ней штрихкод, который читает ТСД), а не свой перерисованный
async function wmsRenderLabelPdfOverlay(pdf, title){
  const page=await pdf.getPage(1);
  const base=page.getViewport({scale:1});
  const scale=Math.max(2, Math.min(6,(Math.max(320,window.innerWidth)-24)/base.width));
  const viewport=page.getViewport({scale:scale});
  let ov=document.getElementById('wms-label-overlay');
  if(!ov){
    ov=document.createElement('div');ov.id='wms-label-overlay';
    ov.style.cssText='position:fixed;inset:0;z-index:99999;background:#fff;display:flex;flex-direction:column;align-items:center;overflow:auto;padding:12px;';
    ov.innerHTML='<button style="align-self:flex-end;background:var(--gold);color:var(--on-accent);border:none;border-radius:8px;padding:12px 22px;font-size:16px;font-weight:700;margin-bottom:10px;cursor:pointer;" onclick="var o=document.getElementById(\'wms-label-overlay\');if(o)o.style.display=\'none\';">ЗАКРЫТЬ</button><div id="wms-label-title" style="font-family:monospace;font-weight:700;margin-bottom:8px;color:#000;text-align:center;"></div><canvas id="wms-label-canvas" style="max-width:100%;height:auto;"></canvas>';
    document.body.appendChild(ov);
  }
  ov.style.display='flex';
  const t=document.getElementById('wms-label-title'); if(t)t.textContent=title||'';
  const canvas=document.getElementById('wms-label-canvas');
  canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);
  const ctx=canvas.getContext('2d');
  await page.render({canvasContext:ctx,viewport:viewport}).promise;
}
async function wmsOpenLabelPdf(c){
  if(!wmsEnsurePdfLib()){wmsSetStatus('PDF-движок не загрузился. Обнови PWA / пересобери APK.','err');return;}
  const bytes=wmsBase64ToBytes(c._labelPdfB64);
  const pdf=await pdfjsLib.getDocument({data:bytes}).promise;
  await wmsRenderLabelPdfOverlay(pdf, wmsCellAddr(c)+(c._labelCode?(' · код '+c._labelCode):''));
}
async function wmsCellFetchCode(i){
  const c=wmsDisplayedCells[i]; if(!c)return;
  if(c._labelPdfB64){ try{await wmsOpenLabelPdf(c);}catch(e){wmsSetStatus((e&&e.message)||String(e),'err');} return; }
  const id=c.cellId||c.id||'';
  if(!id){wmsSetStatus('У ячейки нет id для запроса этикетки.','err');return;}
  wmsSetStatus('Запрашиваю этикетку ячейки '+wmsCellAddr(c)+'…','wait');
  try{
    const data=await wmsCallNative('lookupWmsCellLabels',[id],45000);
    if(data.base64){
      c._labelPdfB64=data.base64;
      if(!wmsEnsurePdfLib()){wmsSetStatus('PDF-движок не загрузился. Обнови PWA / пересобери APK.','err');return;}
      wmsSetStatus('Открываю этикетку ячейки '+wmsCellAddr(c)+'…','wait');
      const bytes=wmsBase64ToBytes(data.base64);
      const pdf=await pdfjsLib.getDocument({data:bytes}).promise;
      // код — только для подписи/поиска, штрихкод показываем настоящий из PDF
      let text='';
      for(let pn=1;pn<=pdf.numPages;pn++){const pg=await pdf.getPage(pn);const tc=await pg.getTextContent();text+=' '+tc.items.map(it=>it.str).join(' ');}
      c._labelCode=wmsExtractCellCodeFromText(text, wmsCellAddr(c));
      await wmsRenderLabelPdfOverlay(pdf, wmsCellAddr(c)+(c._labelCode?(' · код '+c._labelCode):''));
      wmsSetStatus('Этикетка ячейки '+wmsCellAddr(c)+(c._labelCode?(' · код '+c._labelCode):'')+' — это настоящий ШК ВМС.','ok');
      if(wmsAllCells&&wmsAllCells.length&&wmsLookupKind==='cellbc')wmsRenderCellsView();
    }else if(data.json||data.jsonArray){
      const code=wmsExtractLabelCode(data.json||data.jsonArray);
      if(code){c._labelCode=code;zoomBarcode(code,null,{title:wmsCellAddr(c)+' · код '+code});}
      else wmsSetStatus('Код в ответе этикетки не найден.','err');
    }else{
      wmsSetStatus('ВМС вернула пустую этикетку ячейки '+wmsCellAddr(c)+'.','err');
    }
  }catch(e){wmsSetStatus((e&&e.message)||String(e),'err');}
}
window.wmsOpenLabelPdf=wmsOpenLabelPdf;
function wmsCellShowFields(i){
  const c=wmsDisplayedCells[i]; if(!c)return;
  const real=wmsCellRealCode(c);
  const lines=Object.keys(c).filter(k=>k!=='allowedOperations').map(k=>k+': '+(typeof c[k]==='object'?JSON.stringify(c[k]):String(c[k]))).join('\n');
  const text='Ячейка '+wmsCellAddr(c)+'\nРеальный код ШК: '+(real||'(не нашёл в данных)')+'\n\n'+lines;
  wmsCopyFallback(text);
  alert(text+'\n\n(скопировано в буфер)');
}
function wmsCellZoneKey(c){
  const a=String(wmsCellAddr(c)).toUpperCase();
  const z=String(c.zoneName||'').toLowerCase();
  const t=String(c.type||'').toLowerCase();
  if(/^G\d/.test(a)||/ворот|gate/.test(z)||/gate/.test(t))return 'gate';
  if(a.startsWith('HH')||z.includes('холод'))return 'cold';
  if(a.startsWith('SH')||z.includes('сух'))return 'dry';
  return 'other';
}
const WMS_CELL_ZONES={cold:{label:'Холод',color:'var(--blue)'},dry:{label:'Сухой',color:'var(--gold)'},gate:{label:'Ворота',color:'var(--ok)'},other:{label:'Прочее',color:'var(--muted)'}};

async function wmsLoadAllCells(){
  wmsCellbcFavOnly=false;
  wmsAllCells=[];
  wmsStopRequested=false;
  wmsSetStatus('Загружаю все ячейки склада…','wait');
  try{
    const raw=await wmsCallNative('lookupWmsUpperStorageCells',[JSON.stringify({})],120000,(progress)=>{
      if(wmsStopRequested)return;
      const chunk=wmsUpperItems({value:{items:(progress&&progress.items)||[]}});
      if(!chunk.length)return;
      wmsAllCells=wmsAllCells.concat(chunk);
      wmsRenderCellsView();
      wmsSetStatus('Загружаю ячейки… '+wmsAllCells.length+(progress&&progress.total?(' из ~'+progress.total):'')+'…','wait');
    });
    // Финальный ответ — источник истины; полностью заменяет то, что успело прийти по частям.
    wmsAllCells=wmsUpperItems(raw);
    if(!wmsAllCells.length){wmsSetStatus('ВМС вернула пустой справочник ячеек.','err');return;}
    wmsRenderCellsView();
    wmsSetStatus('Загружено ячеек: '+wmsAllCells.length+'. Фильтруй по зоне и ищи нужную.','ok');
  }catch(e){wmsSetStatus((e&&e.message)||'Не смог загрузить ячейки.','err');}
}
let wmsCellbcFavOnly=false;
function wmsCellbcToggleFavOnly(){ wmsCellbcFavOnly=!wmsCellbcFavOnly; wmsRenderCellsView(); }
window.wmsCellbcToggleFavOnly=wmsCellbcToggleFavOnly;
function wmsCellbcRefreshView(){
  if(wmsCellbcViewMode==='search')wmsRenderCellBcSearchResults();
  else if(wmsCellbcViewMode==='favNoDirectory')wmsShowFavCells();
  else wmsRenderCellsView();
}
function wmsCellToggleFav(addr){
  toggleFavCell(addr);
  wmsCellbcRefreshView();
  wmsSetStatus((isFavCell(addr)?'В избранном: ':'Убрано из избранного: ')+addr,'ok');
}
window.wmsCellToggleFav=wmsCellToggleFav;
// Открыть избранное напрямую — работает даже если справочник ячеек ещё не загружен
// (тогда показываем только адреса из локального списка, без зоны/ШК).
function wmsShowFavCells(){
  const favMap=getFavCellsMap();
  const addrs=Object.keys(favMap).sort((a,b)=>a.localeCompare(b,'ru'));
  const box=document.getElementById('wms-result'); if(!box)return;
  if(!addrs.length){
    wmsCellbcViewMode='favNoDirectory';
    box.innerHTML='<div class="no-results">В избранном пока пусто. Загрузи справочник или найди ячейку, затем нажми ☆ на карточке.</div>';
    wmsSetStatus('Избранных ячеек нет.','');
    return;
  }
  if(wmsAllCells&&wmsAllCells.length){
    wmsCellbcFavOnly=true;
    const qEl=document.getElementById('wms-cellbc-query'); if(qEl)qEl.value='';
    const zoneEl=document.getElementById('wms-cellbc-zone'); if(zoneEl)zoneEl.value='all';
    wmsRenderCellsView();
    wmsSetStatus('Избранное: '+addrs.length+' ячеек.','ok');
    return;
  }
  wmsCellbcViewMode='favNoDirectory';
  box.innerHTML='<div style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:11px;letter-spacing:1px;color:var(--gold);margin-bottom:10px;">★ Избранное: '+addrs.length+' (справочник не загружен — только адреса)</div>'+
    addrs.map(a=>{
      const sa=jsStr(a);
      return '<div class="gen-box" style="border-left:3px solid var(--gold);padding:11px;margin-bottom:9px;">'+
        '<div style="display:flex;align-items:center;gap:10px;">'+
          '<button class="exi-btn" style="flex:0 0 auto;padding:8px 11px;font-size:15px;background:var(--gold);color:var(--on-accent);border-color:var(--gold);" onclick="wmsCellToggleFav(\''+sa+'\')" title="Убрать из избранного">★</button>'+
          '<div style="flex:1;min-width:0;"><div style="font-family:\'JetBrains Mono\',monospace;font-size:14px;font-weight:700;color:var(--text);">'+escHtml(a)+'</div></div>'+
        '</div>'+
        '<div style="display:flex;gap:6px;margin-top:9px;flex-wrap:wrap;">'+
          '<button class="exi-btn" style="flex:1;min-width:90px;" onclick="wmsCellShowStocks(\''+sa+'\')">Остатки</button>'+
        '</div>'+
      '</div>';
    }).join('')+
    '<div style="font-size:10px;color:var(--muted);text-align:center;padding:8px;">Загрузи «Загрузить все ячейки», чтобы увидеть зону и штрихкод.</div>';
  wmsSetStatus('Избранное: '+addrs.length+' (без справочника — только адреса и переход к остаткам).','ok');
}
window.wmsShowFavCells=wmsShowFavCells;
function wmsCellsViewFiltered(){
  const zone=document.getElementById('wms-cellbc-zone')?.value||'all';
  const q=String((document.getElementById('wms-cellbc-query')?.value)||'').trim().toUpperCase();
  return (wmsAllCells||[]).filter(c=>{
    if(wmsCellbcFavOnly&&!isFavCell(wmsCellAddr(c)))return false;
    if(zone!=='all'&&wmsCellZoneKey(c)!==zone)return false;
    if(q&&!wmsCellAddr(c).toUpperCase().includes(q))return false;
    return true;
  }).sort((a,b)=>wmsCellAddr(a).localeCompare(wmsCellAddr(b),'ru'));
}
function wmsCellbcOnInput(){ if(wmsAllCells&&wmsAllCells.length)wmsRenderCellsView(); }
let wmsCellbcViewMode='directory'; // 'directory' | 'search' | 'favNoDirectory' — какой рендер обновлять после ★
function wmsRenderCellsView(){
  const box=document.getElementById('wms-result');if(!box)return;
  wmsCellbcViewMode='directory';
  if(!wmsAllCells||!wmsAllCells.length){box.innerHTML='<div class="hint" style="padding:24px 12px;"><span class="mark">▥</span><span class="txt">Нажми «Загрузить все ячейки», найди конкретную в ВМС, или открой ★ Избранное</span></div>';return;}
  const cells=wmsCellsViewFiltered();
  // Счётчики по зонам (по всему загруженному справочнику)
  const zc={cold:0,dry:0,gate:0,other:0};
  wmsAllCells.forEach(c=>{zc[wmsCellZoneKey(c)]++;});
  const chip=(k)=>'<span style="font-size:10px;background:var(--bg2);border:1px solid var(--border);border-radius:5px;padding:2px 7px;color:'+WMS_CELL_ZONES[k].color+';">'+WMS_CELL_ZONES[k].label+': <b>'+zc[k]+'</b></span>';
  const favCount=wmsAllCells.filter(c=>isFavCell(wmsCellAddr(c))).length;
  const favChip='<button class="exi-btn" style="flex:0 0 auto;min-height:0;padding:2px 8px;font-size:10px;border-radius:5px;font-weight:600;'+(wmsCellbcFavOnly?'background:var(--gold);color:var(--on-accent);border-color:var(--gold);':'border-color:var(--gold);color:var(--gold);')+'" onclick="wmsCellbcToggleFavOnly()">★ Избранное: '+favCount+'</button>';
  let html='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;align-items:center;">'+
    '<span style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:11px;letter-spacing:1px;color:var(--gold);">Показано: '+cells.length+' / '+wmsAllCells.length+'</span>'+
    chip('cold')+chip('dry')+chip('gate')+chip('other')+favChip+
    (cells.length>1?'<button class="exi-btn primary" style="margin-left:auto;" onclick="wmsCellsShowAllBarcodes()">Листать ШК</button>':'')+
  '</div>'+
  (wmsCellbcFavOnly&&!favCount?'<div class="wms-warning" style="margin-bottom:10px;">В избранном пока пусто. Нажми ☆ на нужной ячейке, чтобы добавить.</div>':'');
  if(!cells.length){box.innerHTML=html+'<div class="no-results">По фильтру ячеек нет.</div>';return;}
  const shown=cells.slice(0,400);
  wmsDisplayedCells=shown;
  html+=shown.map((c,i)=>wmsCellCardHtml(c,i)).join('');
  if(cells.length>shown.length)html+='<div style="font-size:11px;color:var(--muted);text-align:center;padding:8px;">Показаны первые '+shown.length+'. Уточни поиск/зону, чтобы увидеть остальные.</div>';
  box.innerHTML=html;
}
function wmsCellCardHtml(c,i){
  const addr=wmsCellAddr(c);
  const realCode=wmsCellRealCode(c);
  const code=realCode||addr;
  const zk=wmsCellZoneKey(c);
  const zinfo=WMS_CELL_ZONES[zk];
  const sc=jsStr(code), sa=jsStr(addr);
  const isFav=isFavCell(addr);
  // Если реальный код уже известен — показываем ШК сразу; иначе кнопка тянет код с /labels
  const bcBtn=(i!=null)
    ? '<button class="exi-btn primary" style="flex:1;min-width:120px;" onclick="wmsCellFetchCode('+i+')">'+(realCode?('Этикетка ШК · код '+escHtml(realCode)):'Узнать код / этикетку ШК')+'</button>'
    : '';
  return '<div class="gen-box" style="border-left:3px solid '+(isFav?'var(--gold)':zinfo.color)+';padding:11px;margin-bottom:9px;">'+
    '<div style="display:flex;align-items:center;gap:10px;">'+
      '<button class="exi-btn" style="flex:0 0 auto;padding:8px 11px;font-size:15px;'+(isFav?'background:var(--gold);color:var(--on-accent);border-color:var(--gold);':'border-color:var(--gold);color:var(--gold);')+'" onclick="wmsCellToggleFav(\''+sa+'\')" title="'+(isFav?'Убрать из избранного':'В избранное')+'">'+(isFav?'★':'☆')+'</button>'+
      '<div style="flex:1;min-width:0;">'+
        '<div style="font-family:\'JetBrains Mono\',monospace;font-size:14px;font-weight:700;color:var(--text);">'+escHtml(addr||'—')+'</div>'+
        '<div style="font-size:11px;color:'+zinfo.color+';margin-top:2px;">'+zinfo.label+(realCode?(' · код '+escHtml(realCode)):'')+(c.zoneName&&!/^(HH|SH|G\d)/i.test(addr)?(' · '+escHtml(c.zoneName)):'')+'</div>'+
      '</div>'+
    '</div>'+
    '<div style="display:flex;gap:6px;margin-top:9px;flex-wrap:wrap;">'+
      bcBtn+
      '<button class="exi-btn" style="flex:1;min-width:90px;" onclick="wmsCellShowStocks(\''+sa+'\')">Остатки</button>'+
      (i!=null?'<button class="exi-btn" style="flex:0 0 auto;" onclick="wmsCellShowFields('+i+')">Поля</button>':'')+
    '</div>'+
  '</div>';
}
function wmsCellsShowAllBarcodes(){
  const codes=wmsCellsViewFiltered().map(c=>wmsCellBcCode(c)).filter(Boolean);
  if(!codes.length){wmsSetStatus('Ещё нет узнанных кодов. Нажми «Узнать код ШК» на нужных ячейках — код берётся из этикетки ВМС, а не из адреса.','err');return;}
  zoomBarcode(codes[0],codes,{title:'Ячейки · ШК ('+codes.length+')'});
}
function wmsCellShowStocks(address){
  if(!address)return;
  wmsSetLookupKind('stocks');
  const inp=document.getElementById('wms-query');
  if(inp)inp.value=address;
  wmsSetStatus('Остатки ячейки '+address+'…','wait');
  wmsLookupFromApp();
  const box=document.getElementById('wms-result');if(box)box.scrollIntoView({behavior:'smooth',block:'start'});
}

// Пересчёт позиции из ячейки: открыть «Счёт» с подставленными данными
function wmsCountFromCell(cellAddr, ut, name, sysQty){
  cellAddr=cellAddr||'';
  // Если в счёте уже копятся позиции по ДРУГОЙ ячейке — предложить записать её
  const curCell=String((document.getElementById('calc-cell')||{}).value||'').trim().toUpperCase();
  const newCell=cellAddr.trim().toUpperCase();
  if(typeof cellBuffer!=='undefined'&&cellBuffer.length&&curCell&&newCell&&curCell!==newCell){
    if(confirm('В счёте есть несохранённые позиции по ячейке '+curCell+'. Записать её перед переходом к '+cellAddr+'?')){
      try{commitCell({target:document.createElement('button')});}catch(e){}
    }
  }
  wmsCountReturnCell=cellAddr;
  wmsCountReturnKind=(wmsLookupKind==='tier1'||wmsLookupKind==='upper')?wmsLookupKind:'';
  switchTab('calc');
  const cellEl=document.getElementById('calc-cell'); if(cellEl)cellEl.value=cellAddr;
  if(ut){ pickCalcProd(ut, name||''); }
  else { try{clearCalcProd();}catch(e){} }
  const sysEl=document.getElementById('calc-sys'); if(sysEl)sysEl.value=(sysQty!=null&&sysQty!=='')?sysQty:'';
  ['calc-boxes-main','calc-extra-pcs'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  try{clearLayout();}catch(e){}
  try{doCalc();}catch(e){}
  wmsRenderCalcFromCellBanner();
  setTimeout(()=>{const b=document.getElementById('calc-boxes-main'); if(b)b.focus();},150);
}
function wmsRenderCalcFromCellBanner(){
  const el=document.getElementById('calc-from-cell-banner'); if(!el)return;
  if(!wmsCountReturnCell){el.style.display='none';el.innerHTML='';return;}
  const counted=(typeof cellBuffer!=='undefined'&&Array.isArray(cellBuffer))?cellBuffer:[];
  const sum=counted.reduce((s,i)=>s+(parseInt(i.qty)||0),0);
  el.style.display='block';
  el.innerHTML='<div class="gen-box" style="border-left:3px solid var(--gold);padding:10px 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'+
    '<div style="flex:1;min-width:0;">'+
      '<div style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:10px;letter-spacing:1px;color:var(--gold);">Пересчёт ячейки</div>'+
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:14px;font-weight:700;color:var(--text);">'+escHtml(wmsCountReturnCell)+'</div>'+
      '<div style="font-size:11px;color:var(--muted);margin-top:2px;">Посчитано позиций: <b style="color:var(--ok);">'+counted.length+'</b>'+(sum?(' · '+sum+' шт'):'')+'</div>'+
    '</div>'+
    '<button class="exi-btn primary" onclick="wmsBackToCountedCell()">← В ячейку</button>'+
  '</div>';
}
function wmsBackToCountedCell(){
  const cell=wmsCountReturnCell;
  if(!cell){switchTab('wms');return;}
  switchTab('wms');
  // Пришли считать с плитки обхода яруса — возвращаемся в тот же режим, а не в общие
  // «Остатки сейчас», иначе на карточке баланса пропадает «← Назад к обходу ярусов»
  // и приходится заново грузить справочник ячеек, хотя он всё ещё в памяти.
  wmsSetLookupKind(wmsCountReturnKind||'stocks');
  const inp=document.getElementById('wms-query'); if(inp)inp.value=cell;
  wmsSetStatus('Возврат к ячейке '+cell+'…','wait');
  wmsLookupFromApp();
}
window.wmsCountFromCell=wmsCountFromCell;window.wmsBackToCountedCell=wmsBackToCountedCell;

// Поиск ячеек напрямую в ВМС (by-address-search) — если справочник не грузили
function wmsRenderCellBcSearchResults(){
  const box=document.getElementById('wms-result'); if(!box||!wmsCellBcLast)return;
  const cells=wmsCellBcLast.cells||[];
  wmsCellbcViewMode='search';
  wmsDisplayedCells=cells;
  box.innerHTML='<div style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:11px;letter-spacing:1px;color:var(--gold);margin-bottom:10px;">Найдено ячеек: '+cells.length+'</div>'+cells.map((c,i)=>wmsCellCardHtml(c,i)).join('');
}
async function wmsLoadCellBarcodes(){
  const q=String((document.getElementById('wms-cellbc-query')?.value)||'').trim();
  if(!q){wmsSetStatus('Введи адрес ячейки.','err');return;}
  // Если справочник уже загружен — фильтруем локально, без запроса
  if(wmsAllCells&&wmsAllCells.length){wmsRenderCellsView();return;}
  wmsSetStatus('Ищу ячейки: '+q+'…','wait');
  try{
    const data=await wmsCallNative('lookupWmsCellSearch',[q],30000);
    const cells=(data&&data.cells)||[];
    wmsCellBcLast={cells:cells,query:q};
    if(!cells.length){
      wmsSetStatus('Ячейки по "'+q+'" не найдены.','');
      const box=document.getElementById('wms-result');if(box)box.innerHTML='<div class="no-results">Ячейки по "'+escHtml(q)+'" не найдены. Можно сделать ШК напрямую кнопкой «ШК без поиска».</div>';
      return;
    }
    wmsRenderCellBcSearchResults();
    wmsSetStatus('Найдено ячеек: '+cells.length+'.','ok');
  }catch(e){wmsSetStatus((e&&e.message)||String(e),'err');}
}
function wmsCellBcDirectBarcode(){
  const q=String((document.getElementById('wms-cellbc-query')?.value)||'').trim();
  if(!q){wmsSetStatus('Введи числовой код ячейки для ШК.','err');return;}
  if(!/^\d{3,14}$/.test(q)){wmsSetStatus('Это похоже на адрес, а не на код. Код ячейки — числа с этикетки; нажми «Узнать код ШК» на ячейке.','err');return;}
  zoomBarcode(q,null,{title:q});
}
window.wmsLoadAllCells=wmsLoadAllCells;window.wmsRenderCellsView=wmsRenderCellsView;window.wmsCellbcOnInput=wmsCellbcOnInput;window.wmsCellsShowAllBarcodes=wmsCellsShowAllBarcodes;window.wmsCellShowStocks=wmsCellShowStocks;window.wmsLoadCellBarcodes=wmsLoadCellBarcodes;window.wmsCellBcDirectBarcode=wmsCellBcDirectBarcode;window.wmsCellShowFields=wmsCellShowFields;window.wmsCellFetchCode=wmsCellFetchCode;

// ── ОТГРУЗКА ──
let wmsPdfReady=false;
function wmsBase64ToBytes(b64){
  const bin=atob(b64); const len=bin.length; const bytes=new Uint8Array(len);
  for(let i=0;i<len;i++)bytes[i]=bin.charCodeAt(i);
  return bytes;
}
function wmsEnsurePdfLib(){
  if(typeof pdfjsLib==='undefined')return false;
  if(!wmsPdfReady){
    try{pdfjsLib.GlobalWorkerOptions.workerSrc='./assets/js/vendor/pdf.worker.min.js';}catch(e){}
    wmsPdfReady=true;
  }
  return true;
}
// Все ЕО маршрута (по всем магазинам) — для определения границ секций в PDF
function wmsShipmentRouteAllEos(routeId){
  const routes=wmsShipmentLastRoutes||[];
  const r=routes.find(x=>String(x.id)===String(routeId));
  const out=[];
  if(r)(r.stores||[]).forEach(s=>(s.handlingUnits||[]).forEach(h=>{if(h&&h.handlingUnitBarcode)out.push(String(h.handlingUnitBarcode));}));
  return out;
}
// Упаковочный лист маршрута (PDF): ищем, на каких страницах нужные ЕО адреса
async function wmsShipmentPackagingList(routeId, eoCsv, addr){
  if(!routeId){wmsSetStatus('Нет id маршрута для упаковочного листа.','err');return;}
  const eos=String(eoCsv||'').split(',').map(s=>s.trim()).filter(Boolean);
  wmsSetStatus('Загружаю упаковочный лист маршрута…','wait');
  try{
    const data=await wmsCallNative('lookupWmsPackagingList',[routeId],90000);
    const payload=data.json||data.jsonArray;
    if(payload){
      const errMsg=payload&&!Array.isArray(payload)&&(payload.error||payload.errorDetails||payload.message);
      if(errMsg){
        wmsSetStatus('WMS отказала в упаковочном листе: '+errMsg,'err');
        alert('WMS не отдала упаковочный лист для этого маршрута.\n\nПричина: '+errMsg+'\n\nОбычно это значит, что на маршруте ещё нет ЕО или ему не назначены ворота — попробуй позже, когда появится груз.');
        return;
      }
      const hits=wmsPackagingFindPages(payload,eos);
      if(hits.pages.length){alert('Упаковочный лист «'+(addr||'')+'»\nНужные ЕО на страницах: '+hits.pages.join(', '));wmsSetStatus('Адрес на страницах: '+hits.pages.join(', '),'ok');}
      else{const txt=JSON.stringify(payload);wmsCopyFallback(txt);alert('Лист в JSON, страницы не вычислил. Скопировано — пришли мне.\n\n'+txt.slice(0,1000));}
      return;
    }
    if(!data.base64){wmsSetStatus('Пустой упаковочный лист.','err');return;}
    if(!wmsEnsurePdfLib()){wmsSetStatus('PDF-движок не загрузился. Обнови приложение (нужна пересборка/PWA).','err');return;}
    wmsSetStatus('Разбираю PDF упаковочного листа…','wait');
    const bytes=wmsBase64ToBytes(data.base64);
    window.wmsLastPackagingPdf={bytes:bytes,addr:addr};
    const pdf=await pdfjsLib.getDocument({data:bytes}).promise;
    const total=pdf.numPages;
    const targetSet=new Set(eos.map(e=>e.replace(/\D/g,'')).filter(Boolean));
    // Границы секций — только настоящие ЕО маршрута (а не товарные ШК на строках)
    const allEos=wmsShipmentRouteAllEos(routeId).map(e=>String(e).replace(/\D/g,'')).filter(Boolean);
    const useKnown=allEos.length>0;
    const eoRe=/\b0\d{11}\b/g, eoRe2=/0\d{11}/g;
    const pageEos=[]; const pageHasTarget=[];
    for(let pn=1;pn<=total;pn++){
      const page=await pdf.getPage(pn);
      const tc=await page.getTextContent();
      const raw=tc.items.map(it=>it.str).join(' ');
      const normPage=raw.replace(/[\s\-]/g,'');
      const set=new Set();
      if(useKnown){
        // ищем на странице только известные ЕО маршрута
        allEos.forEach(e=>{ if(normPage.indexOf(e)>=0)set.add(e); });
      }else{
        let m;
        eoRe.lastIndex=0; while((m=eoRe.exec(raw)))set.add(m[0]);
        eoRe2.lastIndex=0; while((m=eoRe2.exec(normPage)))set.add(m[0]);
      }
      pageEos[pn]=Array.from(set);
      pageHasTarget[pn]=pageEos[pn].some(e=>targetSet.has(e));
    }
    // Начало секции каждой ЕО = страница её первого появления
    const seen=new Set(); const starts=[];
    for(let pn=1;pn<=total;pn++)pageEos[pn].forEach(e=>{ if(!seen.has(e)){seen.add(e);starts.push({page:pn,eo:e});} });
    // Владелец страницы = последняя начатая секция на/до этой страницы
    const owner=[]; let si=0, cur=null;
    for(let pn=1;pn<=total;pn++){ while(si<starts.length&&starts[si].page===pn){cur=starts[si].eo;si++;} owner[pn]=cur; }
    // Страница относится к адресу, если её владелец — целевая ЕО, или на ней есть целевая ЕО.
    // Так каждая ЕО тянется до страницы перед началом следующей ЕО.
    const pagesSet=new Set();
    for(let pn=1;pn<=total;pn++){ if((owner[pn]&&targetSet.has(owner[pn]))||pageHasTarget[pn])pagesSet.add(pn); }
    const pages=Array.from(pagesSet).sort((a,b)=>a-b);
    let foundCount=0; targetSet.forEach(t=>{ for(let pn=1;pn<=total;pn++){ if(pageEos[pn].indexOf(t)>=0){foundCount++;break;} } });
    if(pages.length){
      const ranges=wmsPagesToRanges(pages);
      alert('Упаковочный лист\nАдрес: '+(addr||'')+'\n\nСтраницы для печати: '+ranges+'\n(ЕО адреса: '+foundCount+' из '+eos.length+', всего страниц '+total+')\n\nКаждая ЕО учтена целиком — до начала следующей.');
      wmsSetStatus('«'+(addr||'')+'» — страницы: '+ranges+' (из '+total+').','ok');
    }else{
      alert('В PDF ('+total+' стр.) не нашёл ЕО этого адреса по штрихкодам. Возможно, ЕО напечатаны иначе. Открой PDF и проверь вручную.');
      wmsSetStatus('ЕО адреса в PDF не найдены ('+total+' стр.).','');
    }
  }catch(e){wmsSetStatus((e&&e.message)||String(e),'err');}
}
function wmsPagesToRanges(pages){
  pages=pages.slice().sort((a,b)=>a-b);
  const out=[]; let start=pages[0], prev=pages[0];
  for(let i=1;i<pages.length;i++){
    if(pages[i]===prev+1){prev=pages[i];continue;}
    out.push(start===prev?String(start):(start+'–'+prev)); start=prev=pages[i];
  }
  out.push(start===prev?String(start):(start+'–'+prev));
  return out.join(', ');
}
// Поиск страниц по ЕО в JSON упаковочного листа (на случай если когда-то будет JSON)
function wmsPackagingFindPages(payload,eos){
  const set=new Set(eos.map(s=>String(s).trim()).filter(Boolean));
  const pages=new Set(); let found=0; const foundSet=new Set();
  const visit=(o,curPage)=>{
    if(o==null)return;
    if(Array.isArray(o)){o.forEach(x=>visit(x,curPage));return;}
    if(typeof o==='object'){
      let p=curPage;
      for(const k in o){ if(/page/i.test(k)&&(typeof o[k]==='number'||/^\d+$/.test(String(o[k])))){p=Number(o[k]);} }
      for(const k in o){const v=o[k];
        if((typeof v==='string'||typeof v==='number')){const s=String(v).trim();
          if(set.has(s)){ if(p!=null)pages.add(p); if(!foundSet.has(s)){foundSet.add(s);found++;} }}}
      for(const k in o)visit(o[k],p);
    }
  };
  visit(payload,null);
  return {pages:Array.from(pages).sort((a,b)=>a-b),found:found};
}
window.wmsShipmentPackagingList=wmsShipmentPackagingList;
function wmsShipmentRouteShort(rn){if(!rn)return'—';const p=rn.split('-');return p[p.length-1]||rn;}
function wmsShipmentStatusText(s){return({PACKAGING:'Упаковка',SHIPPED:'Отправлен',CANCELLED:'Отменён',CREATED:'Создан',FROZEN:'Заморожен',READY_TO_SHIP:'К отгрузке'})[s]||s||'—';}
function wmsShipmentHuStatus(hu){if(hu.movedIntoVehicle)return{text:'В машине',color:'var(--ok)'};if(hu.movedToGate)return{text:'У ворот',color:'var(--gold)'};return{text:'Не подкатили',color:'var(--muted)'};}

function wmsShipmentNorm(s){return String(s||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').trim();}
function wmsShipmentWordMatch(qWord,addrWords){
  return addrWords.some(aw=>{
    if(aw===qWord)return true;
    if(aw.includes(qWord)||qWord.includes(aw))return true;
    // общий корень: совпадает начало, различаются только окончания (склонения)
    let i=0;const m=Math.min(qWord.length,aw.length);
    while(i<m&&qWord[i]===aw[i])i++;
    return i>=5;
  });
}
function wmsShipmentCollectText(obj){
  // собираем все строковые значения объекта (адрес, название, shipTo и т.п.), кроме списка ЕО
  const parts=[];
  const walk=(v)=>{
    if(v==null)return;
    if(typeof v==='string'){parts.push(v);return;}
    if(Array.isArray(v)){v.forEach(walk);return;}
    if(typeof v==='object'){Object.keys(v).forEach(k=>{if(k==='handlingUnits')return;walk(v[k]);});}
  };
  walk(obj);
  return parts.join(' ');
}
function wmsShipmentFilterRoutes(routes,query){
  const q=wmsShipmentNorm(query);
  if(!q)return routes;
  const words=q.split(' ').filter(Boolean);
  const out=[];
  (routes||[]).forEach(route=>{
    // Ищем строго по адресу магазина (то, что видно в карточке), без полей маршрута,
    // иначе подмешиваются чужие адреса.
    const stores=(route.stores||[]).filter(store=>{
      const addrWords=wmsShipmentNorm(store.address).split(' ').filter(Boolean);
      return words.every(w=>wmsShipmentWordMatch(w,addrWords));
    });
    if(stores.length)out.push(Object.assign({},route,{stores:stores}));
  });
  return out;
}

function wmsRenderShipmentResults(routes,query,dateStr){
  const box=document.getElementById('wms-result');if(!box)return;
  wmsShipmentRenderState={routes:routes,query:query,dateStr:dateStr};
  // Сводка крупными цифрами: всего ЕО, у ворот, в машине, не подкатили
  let sumStores=0,sumTotal=0,sumGate=0,sumVeh=0,sumPend=0;
  (routes||[]).forEach(r=>(r.stores||[]).forEach(s=>{
    const h=s.handlingUnits||[];sumStores++;sumTotal+=h.length;
    sumGate+=h.filter(x=>x.movedToGate&&!x.movedIntoVehicle).length;
    sumVeh+=h.filter(x=>x.movedIntoVehicle).length;
    sumPend+=h.filter(x=>!x.movedToGate).length;
  }));
  const bigCell=(label,val,color)=>'<div style="flex:1;min-width:74px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:9px 6px;text-align:center;"><div style="font-family:\'Spectral\',serif;font-weight:700;font-size:30px;line-height:1;color:'+color+';">'+val+'</div><div style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:9px;letter-spacing:.6px;color:var(--muted);margin-top:4px;">'+label+'</div></div>';
  let html='';
  if(sumStores>0){
    html+='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">'+
      bigCell('ЕО всего',sumTotal,'var(--text)')+
      bigCell('У ворот',sumGate,'var(--gold)')+
      bigCell('В машине',sumVeh,'var(--ok)')+
      bigCell('Не подкатили',sumPend,sumPend>0?'var(--red-bright)':'var(--muted)')+
      '</div>';
  }
  routes.forEach(route=>{
    const routeShort=wmsShipmentRouteShort(route.routeNumber);
    const gate=(route.gate&&route.gate.gateNumber)||'—';
    const routeStatus=wmsShipmentStatusText(route.status);
    const vehicle=(route.vehicle&&route.vehicle.number)||'';
    (route.stores||[]).forEach(store=>{
      const hus=store.handlingUnits||[];
      const atGate=hus.filter(h=>h.movedToGate&&!h.movedIntoVehicle).length;
      const inVehicle=hus.filter(h=>h.movedIntoVehicle).length;
      const pending=hus.filter(h=>!h.movedToGate).length;
      const picking=store.pickingProgress; const movement=store.movementProgress; const shipping=store.shippingProgress;
      let prog='';
      if(picking)prog+='Сборка: '+picking.completed+'/'+picking.planned+' · ';
      if(movement)prog+='Перемещение: '+movement.completed+'/'+movement.planned+' · ';
      if(shipping)prog+='Отгрузка: '+shipping.completed+'/'+shipping.planned;
      prog=prog.replace(/ · $/,'');
      const husHtml=hus.length?hus.map(hu=>{
        const st=wmsShipmentHuStatus(hu);
        const bc=escHtml(hu.handlingUnitBarcode||'');
        const sbc=jsStr(hu.handlingUnitBarcode||'');
        const chk=eoCheckedInfo(hu.handlingUnitBarcode||'');
        const done=!!chk;
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);'+(done?'opacity:.62;':'')+'">'+
          '<button class="wms-mini-copy" style="flex:0 0 auto;'+(done?'border-color:var(--ok);color:var(--ok);':'')+'" onclick="wmsShipmentToggleChecked(\''+sbc+'\')" title="Проверено">'+(done?'✔':'○')+'</button>'+
          '<span style="font-family:\'JetBrains Mono\',monospace;font-size:11px;color:var(--text);flex:1;'+(done?'text-decoration:line-through;':'')+'">'+bc+'</span>'+
          (done?'<span style="font-size:10px;color:var(--ok);white-space:nowrap;">Проверено'+(chk.by?' · '+escHtml(chk.by):'')+'</span>':'')+
          '<span style="font-size:11px;color:'+st.color+';white-space:nowrap;">'+st.text+'</span>'+
          '<button class="wms-mini-copy" onclick="wmsShipmentViewEo(\''+sbc+'\')" title="Содержимое ЕО">📦</button></div>';
      }).join(''):'<div style="font-size:11px;color:var(--muted);padding:6px 0;">ЕО не найдены</div>';
      const checkedN=hus.filter(h=>eoIsChecked(h.handlingUnitBarcode||'')).length;
      const bcsStr=hus.map(h=>h.handlingUnitBarcode).filter(Boolean).join(',');
      const safeAddr=jsStr(store.address||'');
      const safeDateStr=jsStr(dateStr||'');
      const safeRouteId=jsStr(route.id||'');
      html+='<div class="gen-box" style="border-left:3px solid var(--gold);padding:12px;margin-bottom:12px;">'+
        '<div style="margin-bottom:8px;">'+
        '<div style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:15px;font-weight:600;color:var(--text);margin-bottom:5px;">'+escHtml(store.address||'—')+'</div>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'+
        '<span style="font-family:\'JetBrains Mono\',monospace;font-size:12px;background:rgba(0,0,0,0.2);border:1px solid var(--border);border-radius:5px;padding:2px 8px;color:var(--gold);">МАР-'+escHtml(routeShort)+'</span>'+
        '<span style="font-size:12px;color:var(--muted);">Ворота: <b style="color:var(--text);">'+escHtml(gate)+'</b></span>'+
        '<span style="font-size:12px;color:var(--muted);">'+escHtml(routeStatus)+'</span>'+
        (vehicle?'<span style="font-size:11px;color:var(--muted);">'+escHtml(vehicle)+'</span>':'')+'</div>'+
        (prog?'<div style="font-size:10px;color:var(--muted);margin-top:4px;">'+escHtml(prog)+'</div>':'')+
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;">'+
        '<span style="font-size:11px;background:var(--bg2);border:1px solid var(--border);border-radius:5px;padding:2px 7px;color:var(--muted);">Всего: <b style="color:var(--text);">'+hus.length+'</b></span>'+
        (atGate?'<span style="font-size:11px;background:var(--bg2);border:1px solid var(--border);border-radius:5px;padding:2px 7px;color:var(--gold);">У ворот: <b>'+atGate+'</b></span>':'')+
        (inVehicle?'<span style="font-size:11px;background:var(--bg2);border:1px solid var(--border);border-radius:5px;padding:2px 7px;color:var(--ok);">В машине: <b>'+inVehicle+'</b></span>':'')+
        (pending?'<span style="font-size:11px;background:var(--bg2);border:1px solid var(--border);border-radius:5px;padding:2px 7px;color:var(--muted);">Не подкатили: <b>'+pending+'</b></span>':'')+
        (checkedN?'<span style="font-size:11px;background:var(--bg2);border:1px solid var(--ok);border-radius:5px;padding:2px 7px;color:var(--ok);">Проверено: <b>'+checkedN+'/'+hus.length+'</b></span>':'')+
        '</div></div>'+
        '<div style="margin-top:4px;">'+husHtml+'</div>'+
        '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">'+
        '<button class="exi-btn primary" onclick="wmsShipmentImportToRk(\''+bcsStr+'\',\''+safeDateStr+'\',\''+safeAddr+'\')">Перенести в РК</button>'+
        '<button class="exi-btn" onclick="wmsShipmentPackagingList(\''+safeRouteId+'\',\''+bcsStr+'\',\''+safeAddr+'\')">Упаковочный лист</button>'+
        '</div></div>';
    });
  });
  if(html){box.innerHTML=html;}
  else{
    let h='<div class="no-results">Маршруты есть, но в них нет данных о магазинах/ЕО.</div>';
    const sample=(routes&&routes[0])?routes[0]:null;
    if(sample)h+='<div style="margin-top:10px;font-size:10px;color:var(--muted);">Структура первого маршрута (для диагностики, скопируй и пришли):</div><textarea readonly style="width:100%;min-height:220px;margin-top:6px;font-family:monospace;font-size:10px;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px;">'+escHtml(JSON.stringify(sample,null,1))+'</textarea>';
    box.innerHTML=h;
  }
}

async function wmsLoadShipmentRoutes(){
  const query=String((document.getElementById('wms-sh-query')?.value)||'').trim();
  let dateFrom=String((document.getElementById('wms-sh-date-from')?.value)||'').trim();
  let dateTo=String((document.getElementById('wms-sh-date-to')?.value)||'').trim();
  if(!dateFrom&&!dateTo){wmsSetStatus('Укажи хотя бы одну дату.','err');return;}
  if(!dateFrom)dateFrom=dateTo;
  if(!dateTo)dateTo=dateFrom;
  if(dateFrom>dateTo){const t=dateFrom;dateFrom=dateTo;dateTo=t;}
  setStickyDate('wms_ship_work_date',dateFrom);
  const bFrom=wmsMoscowDayBounds(dateFrom);
  const bTo=wmsMoscowDayBounds(dateTo);
  const rangeLabel=dateFrom===dateTo?dateFrom:(dateFrom+' — '+dateTo);
  wmsSetStatus('Загружаю маршруты за '+rangeLabel,'wait');
  try{
    const data=await wmsCallNative('lookupWmsShipmentRoutes',[bFrom.from,bTo.to],180000);
    const routes=(data&&data.routes)||[];
    if(!routes.length){
      wmsSetStatus('Нет маршрутов за '+rangeLabel+'.','');
      const box=document.getElementById('wms-result');
      if(box){
        let h='<div class="no-results">Маршруты на этот период не найдены.</div>';
        if(data&&data._raw){h+='<div style="margin-top:10px;font-size:10px;color:var(--muted);">Сырой ответ API (для диагностики):</div><textarea readonly style="width:100%;min-height:160px;margin-top:6px;font-family:monospace;font-size:10px;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px;">'+escHtml(JSON.stringify(data._raw))+'</textarea>';}
        box.innerHTML=h;
      }
      return;
    }
    wmsShipmentLastRoutes=routes;
    const filtered=wmsShipmentFilterRoutes(routes,query);
    if(query&&!filtered.length){
      // Точного совпадения нет — показываем все маршруты, чтобы было видно реальные адреса
      wmsRenderShipmentResults(routes,'',dateFrom);
      const box=document.getElementById('wms-result');
      if(box)box.insertAdjacentHTML('afterbegin','<div class="wms-warning" style="margin-bottom:10px;">По запросу "'+escHtml(query)+'" точного совпадения нет. Показаны все '+routes.reduce((n,r)=>n+(r.stores||[]).length,0)+' магазинов за период — найди нужный глазами.</div>');
      wmsSetStatus('Совпадений по "'+query+'" нет — показал все маршруты за '+rangeLabel+'.','');
      return;
    }
    const show=filtered.length?filtered:routes;
    wmsRenderShipmentResults(show,query,dateFrom);
    const total=show.reduce((n,r)=>(r.stores||[]).reduce((m,s)=>m+(s.handlingUnits||[]).length,n),0);
    wmsSetStatus('Найдено: '+show.reduce((n,r)=>n+(r.stores||[]).length,0)+' маг. · '+total+' ЕО за '+rangeLabel+'.','ok');
  }catch(e){wmsSetStatus((e&&e.message)||String(e),'err');}
}

async function wmsShipmentViewEo(barcode){
  if(!barcode)return;
  wmsSetStatus('Загружаю содержимое ЕО '+barcode+'…','wait');
  try{
    const raw=await wmsCallNative('lookupWmsByCode',[barcode],30000);
    const result=wmsNormalizeResult(raw);
    wmsLastResult=result;
    const rows=(result.rows||[]).map((r,i)=>({
      idx:i,
      name:r.name||'Товар',
      ut:r.nomenclatureCode||'',
      barcode:r.barcode||'',
      qty:Number(r.quantity)||0,
      bestBefore:r.bestBeforeDate||''
    }));
    // Если состояние поиска потеряно (перезагрузка WebView за ночь) — берём дату
    // последнего реального поиска маршрутов, а не текущую календарную: иначе ЕО,
    // открытая по смене за 4-е, после полуночи записалась бы задним числом в 5-е.
    const date=(wmsShipmentRenderState&&wmsShipmentRenderState.dateStr)||getStickyDate('wms_ship_work_date')||rkTodayISO();
    // Восстанавливаем прежние отметки этой ЕО из РК и «Есть в наличии»
    const outcome={};
    const findIdx=(ut,bc)=>rows.findIndex(r=>(ut&&r.ut===ut)||(bc&&r.barcode&&r.barcode===bc));
    getRK().forEach(x=>{
      if(x.eo!==barcode||x.date!==date||!String(x.ut||'').trim())return;
      const i=findIdx(x.ut,x.barcode); if(i<0)return;
      if(Number(x.shortage)>0)outcome[rows[i].idx]={cat:'shortage',qty:Number(x.shortage)};
      else if(Number(x.surplus)>0)outcome[rows[i].idx]={cat:'surplus',qty:Number(x.surplus)};
      else if(Number(x.defect)>0)outcome[rows[i].idx]={cat:'defect',qty:Number(x.defect)};
    });
    getInstock().forEach(x=>{
      if(x.eo!==barcode||x.date!==date)return;
      const i=findIdx(x.ut,x.barcode); if(i<0)return;
      outcome[rows[i].idx]={cat:'instock',qty:(Number(x.qty)||rows[i].qty)};
    });
    // Общий стор пометок (свои + чужие, с именем автора) авторитетнее восстановленного из РК.
    rows.forEach(r=>{
      const pm=eoPosGet(barcode,r.ut,r.barcode);
      if(pm)outcome[r.idx]={cat:pm.cat,qty:pm.qty,by:pm.by,byUid:pm.byUid};
    });
    wmsShipmentEoState={barcode:barcode,rows:rows,selected:new Set(),outcome:outcome,query:'',date:date};
    wmsRenderShipmentEoContent();
    const box=document.getElementById('wms-result');
    if(box)box.scrollIntoView({behavior:'smooth',block:'start'});
    wmsSetStatus('Содержимое ЕО '+barcode+': '+rows.length+' позиций, '+rows.reduce((s,r)=>s+r.qty,0)+' шт.','ok');
  }catch(e){wmsSetStatus((e&&e.message)||String(e),'err');}
}

const WMS_EO_CATS={
  instock:{label:'В наличии',color:'var(--ok)',bg:'rgba(39,174,96,0.14)'},
  shortage:{label:'Недостача',color:'var(--red-bright)',bg:'rgba(192,57,43,0.14)'},
  surplus:{label:'Излишек',color:'var(--gold)',bg:'rgba(212,175,55,0.14)'},
  defect:{label:'Брак',color:'var(--violet)',bg:'rgba(198,120,221,0.16)'}
};
function wmsShipmentEoFiltered(){
  const st=wmsShipmentEoState; if(!st)return [];
  const q=String(st.query||'').toLowerCase().trim();
  if(!q)return st.rows;
  return st.rows.filter(r=>(r.name+' '+r.ut+' '+r.barcode).toLowerCase().includes(q));
}
function wmsShipmentEoSearch(v){
  if(!wmsShipmentEoState)return;
  wmsShipmentEoState.query=v;
  // Обновляем только список, чтобы поле поиска не теряло фокус (иначе ввод по одной букве)
  const lc=document.getElementById('wms-eo-list');
  if(lc)lc.innerHTML=wmsShipmentEoListHtml();
  else wmsRenderShipmentEoContent();
}
function wmsShipmentEoToggle(idx){
  const st=wmsShipmentEoState; if(!st)return;
  if(st.selected.has(idx))st.selected.delete(idx); else st.selected.add(idx);
  wmsRenderShipmentEoContent();
}
function wmsShipmentEoSelectAll(on){
  const st=wmsShipmentEoState; if(!st)return;
  wmsShipmentEoFiltered().forEach(r=>{ if(on)st.selected.add(r.idx); else st.selected.delete(r.idx); });
  wmsRenderShipmentEoContent();
}
// Пересобирает РК и «Есть в наличии» для этой ЕО+даты из текущих отметок (идемпотентно)
function wmsShipmentEoSync(){
  const st=wmsShipmentEoState; if(!st)return;
  const eo=st.barcode, date=st.date, key=rkKey(date,eo);
  // РК: убрать прежние строки этой ЕО из отгрузки и заглушку «без расхождений»
  let rk=getRK().filter(x=>{
    if(rkKey(x.date,x.eo)===key){
      if(x.fromShipmentEo)return false;
      if(!String(x.ut||'').trim())return false;
    }
    return true;
  });
  // Наличие: убрать прежние строки этой ЕО+даты
  let inst=getInstock().filter(x=>!(x.eo===eo&&x.date===date));
  let seq=0;
  st.rows.forEach(r=>{
    const o=st.outcome[r.idx]; if(!o||!o.cat)return;
    const qty=(o.qty!=null&&o.qty!=='')?(Number(o.qty)||0):r.qty;
    if(o.cat==='instock'){
      inst.unshift(createMeta({id:Date.now()+(seq++)+Math.floor(Math.random()*1000),date:date,eo:eo,ut:r.ut,name:r.name,barcode:r.barcode,qty:qty,ts:Date.now()}));
    }else{
      const row={id:Date.now()+(seq++)+Math.floor(Math.random()*1000),date:date,eo:eo,errors:1,ut:r.ut,name:r.name,surplus:0,shortage:0,defect:0,status:WMS_EO_CATS[o.cat].label,comment:'Из отгрузки',fromShipmentEo:eo,ts:Date.now()};
      if(o.cat==='shortage')row.shortage=qty; else if(o.cat==='surplus')row.surplus=qty; else if(o.cat==='defect')row.defect=qty;
      rk.unshift(createMeta(row));
    }
  });
  set('rk_log',rk); set('instock_log',inst);
}
function wmsShipmentEoAssign(cat){
  const st=wmsShipmentEoState; if(!st)return;
  const sel=st.rows.filter(r=>st.selected.has(r.idx));
  if(!sel.length){wmsSetStatus('Сначала выбери позиции (нажми на них).','err');return;}
  // Недостача/Излишек/Брак при одиночном выборе спрашивают фактическое количество
  if(cat!=='instock' && sel.length===1){
    const r=sel[0];
    const cur=(st.outcome[r.idx]&&st.outcome[r.idx].cat===cat)?st.outcome[r.idx].qty:r.qty;
    const ans=prompt(WMS_EO_CATS[cat].label+' — фактическое количество для «'+r.name+'» (по системе '+r.qty+'):', cur);
    if(ans===null)return;
    st.outcome[r.idx]={cat:cat,qty:Math.max(0,parseInt(ans)||0),by:currentActor().name};
  }else{
    sel.forEach(r=>{st.outcome[r.idx]={cat:cat,qty:r.qty,by:currentActor().name};});
  }
  st.selected.clear();
  eoPosWrite(st.barcode,sel.map(r=>({ut:r.ut,barcode:r.barcode,cat:st.outcome[r.idx].cat,qty:st.outcome[r.idx].qty})));
  wmsShipmentEoSync();
  wmsRenderShipmentEoContent();
  wmsSetStatus('Отмечено '+sel.length+' → '+WMS_EO_CATS[cat].label+'. Видно всем, кто откроет эту ЕО.','ok');
}
function wmsShipmentEoEditQty(idx){
  const st=wmsShipmentEoState; if(!st)return;
  const o=st.outcome[idx], r=st.rows[idx]; if(!o||!r)return;
  const ans=prompt(WMS_EO_CATS[o.cat].label+' — фактическое количество для «'+r.name+'» (по системе '+r.qty+'):', o.qty);
  if(ans===null)return;
  o.qty=Math.max(0,parseInt(ans)||0);
  eoPosWrite(st.barcode,[{ut:r.ut,barcode:r.barcode,cat:o.cat,qty:o.qty}]);
  wmsShipmentEoSync();
  wmsRenderShipmentEoContent();
  wmsSetStatus('Количество обновлено: '+o.qty+' шт.','ok');
}
function wmsShipmentEoUnmark(idx){
  const st=wmsShipmentEoState; if(!st)return;
  if(!st.outcome[idx])return;
  delete st.outcome[idx];
  const r=st.rows[idx];
  if(r)eoPosWrite(st.barcode,[{ut:r.ut,barcode:r.barcode,cat:null}]);
  wmsShipmentEoSync();
  wmsRenderShipmentEoContent();
  wmsSetStatus('Отметка снята.','ok');
}
function wmsShipmentEoClearSelected(){
  const st=wmsShipmentEoState; if(!st)return;
  const sel=st.rows.filter(r=>st.selected.has(r.idx));
  if(!sel.length){wmsSetStatus('Выбери позиции, с которых снять отметку.','err');return;}
  sel.forEach(r=>delete st.outcome[r.idx]);
  st.selected.clear();
  eoPosWrite(st.barcode,sel.map(r=>({ut:r.ut,barcode:r.barcode,cat:null})));
  wmsShipmentEoSync();
  wmsRenderShipmentEoContent();
  wmsSetStatus('Отметки сняты с '+sel.length+' поз.','ok');
}
function wmsShipmentEoForeign(){
  const st=wmsShipmentEoState; if(!st)return;
  rkPrefillEo(st.barcode);
  const dateEl=document.getElementById('rk-date'); if(dateEl&&st.date)dateEl.value=st.date;
  try{rkRefreshEOState();}catch(e){}
  wmsSetStatus('РК: ЕО '+st.barcode+' подставлена. Вбей посторонний товар и количество.','ok');
}
// Вся ЕО проверена и без расхождений → строка в РК со статусом «Без расхождений»
function wmsShipmentEoNoDiff(){
  const st=wmsShipmentEoState; if(!st)return;
  const marked=st.rows.filter(r=>{const o=st.outcome[r.idx];return o&&o.cat&&o.cat!=='instock';});
  if(marked.length && !confirm('У этой ЕО уже отмечено расхождений: '+marked.length+' поз. Всё равно записать «Без расхождений»? Отметки расхождений будут сняты.'))return;
  marked.forEach(r=>delete st.outcome[r.idx]);
  if(marked.length)eoPosWrite(st.barcode,marked.map(r=>({ut:r.ut,barcode:r.barcode,cat:null})));
  const eo=st.barcode, date=st.date, key=rkKey(date,eo);
  let rk=getRK().filter(x=>{
    if(rkKey(x.date,x.eo)===key){
      if(x.fromShipmentEo)return false;
      if(!String(x.ut||'').trim())return false;
    }
    return true;
  });
  rk.unshift(createMeta({id:Date.now()+Math.floor(Math.random()*1000),date:date,eo:eo,errors:0,ut:'',name:'',surplus:0,shortage:0,defect:0,status:'Без расхождений',comment:'Из отгрузки: проверено',fromShipmentEo:eo,ts:Date.now()}));
  set('rk_log',rk);
  eoSetChecked(eo,true);
  logAction('rk','ЕО без расхождений из отгрузки: '+eo,{});
  wmsRenderShipmentEoContent();
  wmsSetStatus('ЕО '+eo+' записана в РК как «Без расхождений» и помечена проверенной.','ok');
}
// Показать ШК позиции крупно (для сканера ТСД)
function wmsShipmentEoShowBc(idx){
  const st=wmsShipmentEoState; if(!st)return;
  const r=st.rows[idx]; if(!r)return;
  const code=String(r.barcode||'').trim();
  if(!code){wmsSetStatus('У позиции нет ШК в данных WMS. Добавь товар в «Товары» и задай ШК там.','err');return;}
  zoomBarcode(code,null,{title:r.name||r.ut||''});
}
// Перенести позицию в каталог «Товары», если её там нет
function wmsShipmentEoToCatalog(idx){
  const st=wmsShipmentEoState; if(!st)return;
  const r=st.rows[idx]; if(!r)return;
  const all=[...getCustomItems(),...CATALOG];
  const exists=all.find(i=>(r.ut&&i.ut===r.ut)||(r.barcode&&i.barcode&&String(i.barcode)===String(r.barcode)));
  if(exists){wmsSetStatus('Уже в товарах: '+(exists.ut||exists.name)+'.','ok');return;}
  const items=getCustomItems();
  items.unshift(createMeta({ut:r.ut||('CUSTOM-'+Date.now()),name:r.name||'Товар из ЕО',barcode:r.barcode||'',img:'',custom:true}));
  try{set('custom_items',items);}catch(e){wmsSetStatus('Не хватило места для сохранения товара.','err');return;}
  logAction('product','Добавлен товар из ЕО: '+(r.ut||r.name),{ut:r.ut});
  wmsSetStatus('Товар «'+(r.name||r.ut)+'» добавлен в каталог.','ok');
}
// Пришёл синк с чужими пометками — обновляем открытый экран содержимого ЕО.
// Не дёргаем экран, пока человек печатает в поиске.
function wmsShipmentEoMarksRefresh(){
  const st=wmsShipmentEoState; if(!st)return;
  const listEl=document.getElementById('wms-eo-list');
  if(!listEl)return;
  let changed=false;
  st.rows.forEach(r=>{
    const pm=eoPosGet(st.barcode,r.ut,r.barcode);
    const cur=st.outcome[r.idx]||null;
    const next=pm?{cat:pm.cat,qty:pm.qty,by:pm.by,byUid:pm.byUid}:null;
    if(JSON.stringify(cur)!==JSON.stringify(next)){
      if(next)st.outcome[r.idx]=next; else delete st.outcome[r.idx];
      changed=true;
    }
  });
  if(!changed)return;
  const ae=document.activeElement;
  if(ae&&(ae.tagName==='INPUT'||ae.tagName==='TEXTAREA')){
    // Фокус в поле (например, поиск) — обновляем только список позиций:
    // поле живёт вне #wms-eo-list, фокус и текст не пострадают.
    listEl.innerHTML=wmsShipmentEoListHtml();
  }else{
    wmsRenderShipmentEoContent();
  }
}
// Тумблер «Проверено» для ЕО из шапки содержимого
function wmsShipmentEoToggleChecked(){
  const st=wmsShipmentEoState; if(!st)return;
  eoToggleChecked(st.barcode);
  wmsRenderShipmentEoContent();
  wmsSetStatus('ЕО '+st.barcode+(eoIsChecked(st.barcode)?' помечена как проверенная.':' — пометка «проверено» снята.'),'ok');
}
window.wmsShipmentEoEditQty=wmsShipmentEoEditQty;window.wmsShipmentEoUnmark=wmsShipmentEoUnmark;window.wmsShipmentEoClearSelected=wmsShipmentEoClearSelected;window.wmsShipmentEoForeign=wmsShipmentEoForeign;window.wmsShipmentEoNoDiff=wmsShipmentEoNoDiff;window.wmsShipmentEoShowBc=wmsShipmentEoShowBc;window.wmsShipmentEoToCatalog=wmsShipmentEoToCatalog;window.wmsShipmentEoToggleChecked=wmsShipmentEoToggleChecked;
function wmsShipmentEoListHtml(){
  const st=wmsShipmentEoState; if(!st)return '';
  const rows=wmsShipmentEoFiltered();
  if(!rows.length)return '<div class="no-results">Ничего не найдено по фильтру.</div>';
  return rows.map(r=>{
    const on=st.selected.has(r.idx);
    const oc=st.outcome[r.idx];
    const c=(oc&&oc.cat)?WMS_EO_CATS[oc.cat]:null;
    const bg=on?'rgba(74,144,226,0.16)':(c?c.bg:'var(--bg2)');
    const border=on?'var(--blue)':(c?c.color:'var(--border)');
    let badge='';
    if(c){
      const diff=(oc.cat!=='instock'&&Number(oc.qty)!==Number(r.qty))?(' · сист '+r.qty):'';
      const who=oc.by?(' · '+escHtml(oc.by)):'';
      badge='<span style="display:inline-flex;align-items:center;gap:4px;font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:9px;letter-spacing:.5px;color:'+c.color+';border:1px solid '+c.color+';border-radius:5px;padding:1px 5px;white-space:nowrap;">'+c.label+' · '+oc.qty+' шт'+diff+who+
        '<button onclick="event.stopPropagation();wmsShipmentEoEditQty('+r.idx+')" style="background:none;border:none;color:'+c.color+';cursor:pointer;font-size:11px;padding:0;">✎</button>'+
        '<button onclick="event.stopPropagation();wmsShipmentEoUnmark('+r.idx+')" style="background:none;border:none;color:var(--red-bright);cursor:pointer;font-size:11px;padding:0;">✕</button>'+
      '</span>';
    }
    return '<div onclick="wmsShipmentEoToggle('+r.idx+')" style="cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px;margin-bottom:7px;border-radius:9px;border:1px solid '+border+';background:'+bg+';">'+
      '<div style="flex-shrink:0;width:22px;height:22px;border-radius:5px;border:2px solid '+(on?'var(--blue)':'var(--muted)')+';display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--blue);">'+(on?'✓':'')+'</div>'+
      '<div style="flex:1;min-width:0;">'+
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><span style="font-size:13px;color:var(--text);line-height:1.25;">'+escHtml(r.name)+'</span>'+badge+'</div>'+
        '<div style="font-family:\'JetBrains Mono\',monospace;font-size:10px;color:var(--muted);margin-top:2px;">'+escHtml(r.ut||'без УТ')+(r.barcode?(' · ШК '+escHtml(r.barcode)):'')+'</div>'+
        '<div style="display:flex;gap:5px;margin-top:5px;">'+
          (r.barcode?'<button class="wms-mini-copy" style="flex:0 0 auto;" onclick="event.stopPropagation();wmsShipmentEoShowBc('+r.idx+')">ШК ▣</button>':'')+
          '<button class="wms-mini-copy" style="flex:0 0 auto;" onclick="event.stopPropagation();wmsShipmentEoToCatalog('+r.idx+')">В товары</button>'+
        '</div>'+
      '</div>'+
      '<div style="flex-shrink:0;text-align:right;"><div style="font-family:\'Spectral\',serif;font-weight:700;font-size:20px;color:var(--text);line-height:1;">'+r.qty+'</div><div style="font-size:9px;color:var(--muted);">сист</div></div>'+
    '</div>';
  }).join('');
}
// Посторонние товары этой ЕО, занесённые в РК напрямую (rkAdd) — не входят в st.rows,
// т.к. WMS их не ожидала. Считаем отдельно, чтобы счётчики "Излишек/Недост./Брак" их видели.
function wmsShipmentEoForeignCounts(){
  const st=wmsShipmentEoState; if(!st)return {surplus:0,shortage:0,defect:0,rows:0};
  const key=rkKey(st.date,st.barcode);
  const rows=getRK().filter(x=>rkKey(x.date,x.eo)===key && String(x.ut||'').trim() && x.fromShipmentEo!==st.barcode);
  let surplus=0,shortage=0,defect=0;
  rows.forEach(x=>{
    if(Number(x.surplus)>0)surplus++;
    else if(Number(x.shortage)>0)shortage++;
    else if(Number(x.defect)>0)defect++;
  });
  return {surplus:surplus,shortage:shortage,defect:defect,rows:rows.length};
}
function wmsRenderShipmentEoContent(){
  const st=wmsShipmentEoState; if(!st)return;
  const box=document.getElementById('wms-result'); if(!box)return;
  const total=st.rows.length;
  const cnt={instock:0,shortage:0,surplus:0,defect:0,none:0};
  st.rows.forEach(r=>{const o=st.outcome[r.idx];if(o&&o.cat)cnt[o.cat]++;else cnt.none++;});
  const foreign=wmsShipmentEoForeignCounts();
  cnt.surplus+=foreign.surplus; cnt.shortage+=foreign.shortage; cnt.defect+=foreign.defect;
  const selN=st.selected.size;
  const listHtml=wmsShipmentEoListHtml();

  const big=(label,val,color)=>'<div style="flex:1;min-width:60px;background:var(--bg2);border:1px solid var(--border);border-radius:9px;padding:8px 4px;text-align:center;"><div style="font-family:\'Spectral\',serif;font-weight:700;font-size:24px;line-height:1;color:'+color+';">'+val+'</div><div style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:8px;letter-spacing:.4px;color:var(--muted);margin-top:3px;">'+label+'</div></div>';
  const catBtn=(cat)=>{const c=WMS_EO_CATS[cat];return '<button class="exi-btn" style="flex:1;min-width:110px;border-color:'+c.color+';color:'+c.color+';font-weight:600;" onclick="wmsShipmentEoAssign(\''+cat+'\')">'+c.label+' '+(selN?'('+selN+')':'')+'</button>';};
  box.innerHTML=
    '<button class="exi-btn" style="margin-bottom:10px;" onclick="wmsShipmentBack()">← Назад к маршрутам</button>'+
    '<div class="gen-box" style="border-left:3px solid var(--gold);padding:12px;margin-bottom:12px;">'+
      '<div style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:11px;letter-spacing:1px;color:var(--gold);margin-bottom:4px;">Содержимое ЕО</div>'+
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">'+
        '<span style="font-family:\'JetBrains Mono\',monospace;font-size:15px;font-weight:700;color:var(--text);'+(eoIsChecked(st.barcode)?'text-decoration:line-through;opacity:.6;':'')+'">'+escHtml(st.barcode)+'</span>'+
        (eoIsChecked(st.barcode)?'<span style="font-size:10px;color:var(--ok);border:1px solid var(--ok);border-radius:999px;padding:2px 8px;white-space:nowrap;">✔ Проверено'+((eoCheckedInfo(st.barcode)||{}).by?' · '+escHtml(eoCheckedInfo(st.barcode).by):'')+'</span>':'')+
        '<button class="exi-btn" style="flex:0 0 auto;min-height:30px;padding:5px 10px;font-size:10px;'+(eoIsChecked(st.barcode)?'':'border-color:var(--ok);color:var(--ok);')+'" onclick="wmsShipmentEoToggleChecked()">'+(eoIsChecked(st.barcode)?'Снять «проверено»':'✔ Проверено')+'</button>'+
      '</div>'+
      '<div style="display:flex;gap:5px;flex-wrap:wrap;">'+
        big('Позиций',total,'var(--text)')+
        big('В наличии',cnt.instock,'var(--ok)')+
        big('Недост.',cnt.shortage,'var(--red-bright)')+
        big('Излишек',cnt.surplus,'var(--gold)')+
        big('Брак',cnt.defect,'var(--violet)')+
      '</div>'+
      (foreign.rows?'<div style="font-size:10px;color:var(--violet);margin-top:8px;">Учтено посторонних (не из списка WMS): <b>'+foreign.rows+'</b></div>':'')+
    '</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">'+
      '<button class="exi-btn" style="flex:1;min-width:150px;border-color:var(--ok);color:var(--ok);font-weight:600;" onclick="wmsShipmentEoNoDiff()">✓ ЕО без расхождений → РК</button>'+
      '<button class="exi-btn" style="flex:1;min-width:150px;border-color:var(--violet);color:var(--violet);font-weight:600;" onclick="wmsShipmentEoForeign()">＋ Посторонний товар → РК</button>'+
    '</div>'+
    '<div class="smart-search-box" style="margin-bottom:8px;"><input class="calc-inp" id="wms-eo-search" autocomplete="off" spellcheck="false" placeholder="Поиск позиции: товар / УТ / ШК…" style="margin-bottom:0;" type="text" value="'+escHtml(st.query||'')+'" oninput="wmsShipmentEoSearch(this.value)"/></div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;align-items:center;">'+
      '<span style="font-size:11px;color:var(--muted);">Выбрано: <b style="color:var(--blue);">'+selN+'</b></span>'+
      '<button class="exi-btn" onclick="wmsShipmentEoClearSelected()">Снять отметку</button>'+
      '<button class="exi-btn" style="margin-left:auto;" onclick="wmsShipmentEoSelectAll(true)">Выбрать все</button>'+
      '<button class="exi-btn" onclick="wmsShipmentEoSelectAll(false)">Сброс</button>'+
    '</div>'+
    '<div style="font-size:10px;color:var(--muted);margin-bottom:6px;">Выбери позиции → категория. Для одной позиции спросит фактическое количество. Кол-во потом меняется ✎, отметка снимается ✕.</div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">'+
      catBtn('instock')+catBtn('shortage')+catBtn('surplus')+catBtn('defect')+
    '</div>'+
    '<div id="wms-eo-list">'+listHtml+'</div>';
}
window.wmsShipmentEoToggle=wmsShipmentEoToggle;window.wmsShipmentEoSearch=wmsShipmentEoSearch;window.wmsShipmentEoSelectAll=wmsShipmentEoSelectAll;window.wmsShipmentEoAssign=wmsShipmentEoAssign;

function wmsShipmentBack(){
  wmsShipmentEoState=null;
  if(!wmsShipmentRenderState){wmsSetLookupKind('shipment');return;}
  wmsLastResult=null;
  const s=wmsShipmentRenderState;
  wmsRenderShipmentResults(s.routes,s.query,s.dateStr);
  const total=(s.routes||[]).reduce((n,r)=>(r.stores||[]).reduce((m,st)=>m+(st.handlingUnits||[]).length,n),0);
  wmsSetStatus('Маршруты: '+(s.routes||[]).reduce((n,r)=>n+(r.stores||[]).length,0)+' маг. · '+total+' ЕО.','ok');
  const box=document.getElementById('wms-result');if(box)box.scrollIntoView({behavior:'smooth',block:'start'});
}

function wmsShipmentToggleChecked(bc){
  eoToggleChecked(bc);
  if(wmsShipmentRenderState){const s=wmsShipmentRenderState;wmsRenderShipmentResults(s.routes,s.query,s.dateStr);}
  wmsSetStatus('ЕО '+bc+(eoIsChecked(bc)?' помечена как проверенная.':' — пометка снята.'),'ok');
}
window.wmsShipmentToggleChecked=wmsShipmentToggleChecked;

function wmsShipmentImportToRk(barcodes,dateStr,address){
  if(typeof barcodes==='string')barcodes=barcodes.split(',').map(s=>s.trim()).filter(Boolean);
  if(!barcodes||!barcodes.length){wmsSetStatus('Нет ЕО для переноса.','err');return;}
  const date=dateStr||getStickyDate('wms_ship_work_date')||rkTodayISO();
  const existing=getRK();
  let added=0;
  barcodes.forEach(bc=>{
    if(!bc)return;
    const already=existing.find(x=>x.eo===bc&&x.date===date);
    if(already)return;
    // Пустая строка ЕО: без вердикта. «Без расхождений» ставится только отдельной кнопкой после проверки.
    const row=createMeta({id:Date.now()+Math.floor(Math.random()*1000)+added,date:date,eo:bc,errors:0,ut:'',name:'',surplus:0,shortage:0,defect:0,status:'',comment:address?'Из отгрузки: '+address:'Из отгрузки',ts:Date.now()});
    existing.unshift(row);added++;
  });
  set('rk_log',existing);
  logAction('rk','Импорт ЕО из отгрузки: '+added+' ЕО'+(address?' · '+address:''));
  if(added>0){wmsSetStatus('Добавлено '+added+' ЕО в РК. Открываю РК…','ok');setTimeout(()=>switchTab('rk'),400);}
  else{wmsSetStatus('Все ЕО уже есть в РК за '+date+'.','');switchTab('rk');}
}

function wmsShipmentToday(){
  const now=new Date();const moscow=new Date(now.getTime()+3*60*60*1000);const iso=moscow.toISOString().slice(0,10);
  const f=document.getElementById('wms-sh-date-from');const t=document.getElementById('wms-sh-date-to');
  if(f)f.value=iso;if(t)t.value=iso;
  setStickyDate('wms_ship_work_date',iso);
}
function wmsClearShipmentSearch(){
  const q=document.getElementById('wms-sh-query');const f=document.getElementById('wms-sh-date-from');const t=document.getElementById('wms-sh-date-to');
  if(q)q.value='';if(f)f.value='';if(t)t.value='';wmsShipmentLastRoutes=null;
  const box=document.getElementById('wms-result');if(box)box.innerHTML='';
  wmsSetStatus('Поиск маршрутов сброшен.','');
}
function rkPrefillEo(eo){
  switchTab('rk');
  const eoInput=document.getElementById('rk-eo');
  if(eoInput){eoInput.value=eo;eoInput.dispatchEvent(new Event('input'));rkRefreshEOState();}
  setTimeout(()=>{const el=document.getElementById('rk-eo');if(el)el.scrollIntoView({behavior:'smooth',block:'center'});},300);
}
// ── /ОТГРУЗКА ──

function wmsRenderLargeLosses(){
  const box=document.getElementById('wms-result');if(!box||wmsLookupKind!=='losses')return;
  if(!wmsLargeLosses){box.innerHTML='<div class="hint" style="padding:24px 12px;"><span class="mark">▼</span><span class="txt">Выбери дату, зону и минимальный минус. Покажу крупные уменьшения остатка именно из хранения HH/SH.</span></div>';return;}
  const rows=wmsLargeLossRows(); const cold=rows.filter(r=>wmsLossSourceZone(r)==='cold'); const dry=rows.filter(r=>wmsLossSourceZone(r)==='dry');
  const sum=list=>list.reduce((n,r)=>n+Math.abs(Math.min(0,Number(r.sourceDelta||0))),0);
  const cards=rows.slice(0,200).map(r=>{
    const loss=Math.abs(Math.min(0,Number(r.sourceDelta||0)));
    const code=(r.nomenclatureCode||'').replace(/'/g,"\\'"); const name=(r.name||'').replace(/'/g,"\\'"); const bc=(r.barcode||'').replace(/'/g,"\\'");
    return '<article class="wms-loss-card"><div class="wms-loss-head"><div class="wms-loss-delta">−'+escHtml(loss)+' шт.</div><div class="wms-loss-op">'+escHtml(wmsOperationLabel(r.operationType||'')||r.operationType||'Операция')+'</div></div><div class="wms-loss-name">'+escHtml(r.name||'Товар не указан')+'</div><div class="wms-loss-meta">'+escHtml(r.nomenclatureCode||'')+' · '+escHtml(wmsDateShort(r.operationStartedAt))+'</div><div class="wms-loss-location">Из хранения: <b>'+escHtml(r.sourceCellAddress||'—')+'</b>'+((r.sourceHandlingUnitBarcode)?(' · ЕО '+escHtml(r.sourceHandlingUnitBarcode)):'')+'</div><div class="wms-loss-meta">'+escHtml(r.userName||'Исполнитель не указан')+'</div><div class="wms-stock-copy-row"><button class="wms-mini-copy" onclick="wmsCopyFallback(\''+escHtml(code)+'\');wmsSetStatus(\'УТ скопировано.\',\'ok\')">УТ</button><button class="wms-mini-copy" onclick="wmsCopyFallback(\''+escHtml(bc)+'\');wmsSetStatus(\'ШК скопирован.\',\'ok\')">ШК</button><button class="wms-mini-copy" onclick="wmsCopyFallback(\''+escHtml(name)+'\');wmsSetStatus(\'Название скопировано.\',\'ok\')">Название</button><button class="wms-mini-copy" onclick="wmsCopyFallback(\''+escHtml((r.sourceCellAddress||'').replace(/'/g,"\\'"))+'\');wmsSetStatus(\'Ячейка скопирована.\',\'ok\')">Ячейка</button></div></article>';
  }).join('');
  box.innerHTML='<div class="wms-card"><div class="wms-card-body"><div class="wms-product-name">Крупные минусы из хранения</div><div class="wms-meta">Показаны уменьшения в <b>исходных</b> ячейках HH/SH. Операция остаётся рядом, чтобы не перепутать отгрузку, перемещение и списание.</div></div></div><div class="wms-loss-summary"><b>'+escHtml(rows.length)+'</b><span>строк</span><b>−'+escHtml(sum(cold))+'</b><span>Холод</span><b>−'+escHtml(sum(dry))+'</b><span>Сухой</span></div><div class="wms-actions"><button class="exi-btn primary" onclick="wmsLoadLargeLosses()">Обновить</button></div><div class="wms-loss-list">'+(cards||'<div class="no-results">По выбранным условиям крупных минусов из хранения нет.</div>')+'</div>'+(rows.length>200?'<div class="wms-upper-note">Показаны первые 200 строк. Подними порог, чтобы сузить список.</div>':'');
}
async function wmsLoadLargeLosses(){
  const date=document.getElementById('wms-loss-date')?.value||''; if(!date){wmsSetStatus('Выбери дату.','err');return;}
  const b=wmsMoscowDayBounds(date); if(!b){wmsSetStatus('Некорректная дата.','err');return;}
  const zone=document.getElementById('wms-loss-zone')?.value||'all'; const only=document.getElementById('wms-loss-kind')?.value||'all';
  wmsSetStatus('Ищу крупные минусы из хранения за '+date+'…','wait');
  try{
    const raw=await wmsCallNative('lookupWmsDailyStorageLosses',[JSON.stringify({date,from:b.from,to:b.to,zone,kind:only})],180000);
    const norm=wmsNormalizeResult(raw); wmsLargeLosses=norm; wmsRenderLargeLosses();
    wmsSetStatus('Загружены изменения: '+(norm.rows||[]).length+'. Применён фильтр крупных минусов.','ok');
  }catch(e){wmsSetStatus((e&&e.message)||'Не смог загрузить крупные минусы.','err');}
}

function wmsParseImport(){
  const el=document.getElementById('wms-import-text');
  const text=el?el.value:'';
  try{
    const parsed=wmsLooseJsonParse(text);
    const result=wmsNormalizeResult(parsed);
    if(result._kind)wmsRenderChoices(result); else wmsRenderResult(result);
    wmsSetStatus(result._kind?'Найдено несколько вариантов. Выбери нужный.':'Импорт разобран: '+result.totalRows+' строк, '+result.totalQuantity+' шт.','ok');
  }catch(e){
    wmsSetStatus(e.message||'Не смог разобрать импорт.','err');
  }
}
function wmsCallNative(method,args,timeoutMs,onProgress){
  timeoutMs=timeoutMs||30000;
  return new Promise((resolve,reject)=>{
    const id='wms_'+Date.now()+'_'+Math.floor(Math.random()*100000);
    if(!window.__lenferWmsNativeCallbacks)window.__lenferWmsNativeCallbacks={};
    window.__lenferWmsNativeCallbacks[id]={resolve,reject,onProgress:onProgress||null};
    const timer=setTimeout(()=>{delete window.__lenferWmsNativeCallbacks[id];reject(new Error('Android WebView-мост не ответил'));},timeoutMs);
    window.__lenferWmsNativeCallbacks[id].timer=timer;
    try{
      if(!(window.LenferAndroidWms && typeof window.LenferAndroidWms[method]==='function'))throw new Error(WMS_AUTO_UNAVAILABLE);
      const ret=window.LenferAndroidWms[method](id,...args);
      if(ret){clearTimeout(timer);delete window.__lenferWmsNativeCallbacks[id];resolve(wmsLooseJsonParse(ret));}
    }catch(e){clearTimeout(timer);delete window.__lenferWmsNativeCallbacks[id];reject(e);}
  });
}
function wmsNativeLookup(code){return wmsCallNative('lookupWmsByCode',[code],30000);}
function wmsNativeLookupChanges(code){return wmsCallNative('lookupWmsChangesByCode',[code],30000);}
function lenferWmsNativeResolve(id, payloadJson){
  const cb=window.__lenferWmsNativeCallbacks&&window.__lenferWmsNativeCallbacks[id];
  if(!cb)return;
  clearTimeout(cb.timer);delete window.__lenferWmsNativeCallbacks[id];
  try{cb.resolve(wmsLooseJsonParse(payloadJson));}catch(e){cb.reject(e);}
}
function lenferWmsNativeReject(id, message){
  const cb=window.__lenferWmsNativeCallbacks&&window.__lenferWmsNativeCallbacks[id];
  if(!cb)return;
  clearTimeout(cb.timer);delete window.__lenferWmsNativeCallbacks[id];cb.reject(new Error(message||'Ошибка Android WebView-моста'));
}
// Промежуточные пачки данных от нативной стороны (например, страницы справочника ячеек),
// пока основной запрос ещё не завершился. Не снимает колбэк — финальный resolve/reject как обычно.
function lenferWmsCellsProgress(id, payloadJson){
  const cb=window.__lenferWmsNativeCallbacks&&window.__lenferWmsNativeCallbacks[id];
  if(!cb||typeof cb.onProgress!=='function')return;
  try{cb.onProgress(wmsLooseJsonParse(payloadJson));}catch(e){}
}
window.lenferWmsCellsProgress=lenferWmsCellsProgress;
async function wmsLookupProductId(productId){
  if(!productId){wmsSetStatus('Нет productId','err');return;}
  wmsSetStatus('Тяну ячейки выбранного товара…','wait');
  try{
    const raw=await wmsCallNative('lookupWmsByProductId',[productId],30000);
    const result=wmsNormalizeResult(raw);
    wmsRenderResult(result);
    wmsSetStatus('Готово: '+result.totalRows+' строк, '+result.totalQuantity+' шт.','ok');
  }catch(e){wmsSetStatus((e&&e.message)||WMS_AUTO_UNAVAILABLE,'err');}
}
async function wmsLookupCellId(cellId, address){
  if(!cellId){wmsSetStatus('Нет cellId','err');return;}
  // Уходим в балансы с доски обхода — запоминаем место, чтобы «Назад» вернул точно туда же.
  if(wmsLookupKind==='tier1'||wmsLookupKind==='upper'){
    window.wmsTierReturnState={scrollY:window.scrollY||0,cellId:String(cellId)};
  }
  wmsSetStatus('Тяну содержимое ячейки '+(address||'')+'…','wait');
  try{
    const raw=await wmsCallNative('lookupWmsByCellId',[cellId,address||''],30000);
    const result=wmsNormalizeResult(raw);
    wmsRenderResult(result);
    wmsSetStatus('Готово: '+result.totalRows+' строк, '+result.totalQuantity+' шт.','ok');
  }catch(e){wmsSetStatus((e&&e.message)||WMS_AUTO_UNAVAILABLE,'err');}
}
async function wmsLookupProductChangesId(productId){
  if(!productId){wmsSetStatus('Нет productId','err');return;}
  wmsSetStatus('Тяну изменения выбранного товара…','wait');
  try{
    const raw=await wmsCallNative('lookupWmsChangesByProductId',[productId],30000);
    const result=wmsNormalizeResult(raw);
    wmsRenderResult(result);
    wmsSetStatus('Изменения: '+result.totalRows+' строк.','ok');
  }catch(e){wmsSetStatus((e&&e.message)||WMS_AUTO_UNAVAILABLE,'err');}
}
async function wmsLookupCellChangesId(cellId, address){
  if(!cellId){wmsSetStatus('Нет cellId','err');return;}
  wmsSetStatus('Тяну изменения ячейки '+(address||'')+'…','wait');
  try{
    const raw=await wmsCallNative('lookupWmsChangesByCellId',[cellId,address||''],30000);
    const result=wmsNormalizeResult(raw);
    wmsRenderResult(result);
    wmsSetStatus('Изменения: '+result.totalRows+' строк.','ok');
  }catch(e){wmsSetStatus((e&&e.message)||WMS_AUTO_UNAVAILABLE,'err');}
}
function wmsLookupChosenProductId(productId){
  return wmsLookupKind==='changes' ? wmsLookupProductChangesId(productId) : wmsLookupProductId(productId);
}
function wmsLookupChosenCellId(cellId,address){
  return wmsLookupKind==='changes' ? wmsLookupCellChangesId(cellId,address) : wmsLookupCellId(cellId,address);
}
async function wmsLookupChangesForExecutor(executorId, executorName){
  if(!executorId){wmsSetStatus('Нет executorId','err');return;}
  wmsSetStatus('Тяну изменения исполнителя: '+(executorName||executorId)+'…','wait');
  try{
    const raw=await wmsCallNative('lookupWmsChangesForExecutor',[executorId,executorName||'',wmsChangesSearchDateFrom||'',wmsChangesSearchDateTo||''],90000);
    const result=wmsNormalizeResult(raw);
    wmsRenderResult(result);
    wmsSetStatus('Изменения '+escHtml(executorName||'')+': '+result.totalRows+' строк.','ok');
  }catch(e){wmsSetStatus((e&&e.message)||WMS_AUTO_UNAVAILABLE,'err');}
}
// Отдельный поиск истории изменений: по фамилии исполнителя, по датам, или и то и другое.
async function wmsSearchExecutorChanges(){
  const nameEl=document.getElementById('wms-ch-exec-name');
  const fromEl=document.getElementById('wms-ch-exec-from');
  const toEl=document.getElementById('wms-ch-exec-to');
  const name=nameEl?String(nameEl.value||'').trim():'';
  const from=fromEl?String(fromEl.value||'').trim():'';
  const to=toEl?String(toEl.value||'').trim():'';
  if(!name&&!from&&!to){wmsSetStatus('Введи фамилию исполнителя или хотя бы одну дату.','err');return;}
  // День в Москве → UTC-границы. Если задана только одна дата — берём её за весь день.
  let dateFrom='',dateTo='';
  const fb=from?wmsMoscowDayBounds(from):null;
  const tb=to?wmsMoscowDayBounds(to):null;
  if(fb)dateFrom=fb.from;
  if(tb)dateTo=tb.to;
  if(fb&&!tb)dateTo=fb.to;
  if(tb&&!fb)dateFrom=tb.from;
  wmsChangesSearchDateFrom=dateFrom;
  wmsChangesSearchDateTo=dateTo;
  try{
    let raw,label;
    if(name){
      wmsSetStatus('Ищу изменения исполнителя: '+name+'…','wait');
      raw=await wmsCallNative('lookupWmsExecutorChanges',[name,dateFrom,dateTo],90000);
      label=name;
    }else{
      wmsSetStatus('Ищу изменения за период'+(from||to?(' '+(from||'')+(from&&to?' — ':'')+(to||'')):'')+'…','wait');
      raw=await wmsCallNative('lookupWmsChangesByDateRange',[dateFrom,dateTo],90000);
      label='за период';
    }
    const result=wmsNormalizeResult(raw);
    wmsRenderResult(result);
    if(result&&result._kind==='executorChoices'){
      wmsSetStatus('Несколько совпадений по «'+name+'». Выбери исполнителя.','ok');
    }else{
      wmsSetStatus('Изменения «'+escHtml(label)+'»: '+(result.totalRows||0)+' строк.','ok');
    }
  }catch(e){wmsSetStatus((e&&e.message)||WMS_AUTO_UNAVAILABLE,'err');}
}
function wmsChangesExecToday(){
  const d=new Date();
  const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const fromEl=document.getElementById('wms-ch-exec-from');
  const toEl=document.getElementById('wms-ch-exec-to');
  if(fromEl)fromEl.value=iso;
  if(toEl)toEl.value=iso;
}
function wmsClearExecutorChanges(){
  ['wms-ch-exec-name','wms-ch-exec-from','wms-ch-exec-to'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  wmsChangesSearchDateFrom='';wmsChangesSearchDateTo='';
  const box=document.getElementById('wms-result');if(box)box.innerHTML='';
  wmsSetStatus('Очищено. Введи фамилию исполнителя или товар/УТ/ячейку выше.','');
}

function wmsAnalysisDate(){const el=document.getElementById('wms-an-date');return el?String(el.value||'').trim():'';}
function wmsAnalysisExecutor(){const el=document.getElementById('wms-an-executor');return el?String(el.value||'').trim():'';}
function wmsAnalysisStatus(){const el=document.getElementById('wms-an-status');return el?String(el.value||'COMPLETED').trim():'COMPLETED';}
function wmsAnalysisToday(){const d=new Date();const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');const el=document.getElementById('wms-an-date');if(el)el.value=iso;wmsRunAnalysis();}
function wmsClearAnalysisFilters(){['wms-an-date','wms-an-executor'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});const st=document.getElementById('wms-an-status');if(st)st.value='COMPLETED';}
function wmsAnalysisIsCell(q){return wmsDetectMode(q)==='Ячейка';}
function wmsAnalysisRowsSummary(result){const rows=(result&&result.rows)||[];return {rows:rows.length,qty:rows.reduce((s,r)=>s+wmsNum(r.quantity),0)};}
function wmsAnalysisChangesSummary(result){let rows=((result&&result.rows)||[]);rows=wmsFilteredChangeRows(rows);const ops=wmsTopEntries(wmsChangeOperationCounts(rows),6).map(([k,n])=>wmsOperationLabel(k)+' '+n).join(', ');const outgoing=rows.filter(wmsIsOutgoing).length;const incoming=rows.filter(wmsIsIncoming).length;return {rows, count:rows.length, outgoing, incoming, ops};}
function wmsAnalysisRecountMatches(rows, q){q=String(q||'').trim().toLowerCase();const date=wmsAnalysisDate();const ex=wmsAnalysisExecutor().toLowerCase();const isCell=wmsAnalysisIsCell(q);return (rows||[]).filter(r=>{if(date && wmsDateIsoDay(r.completedAt||r.createdAt)!==date)return false;if(ex && !String(r.executorName||'').toLowerCase().includes(ex))return false;if(isCell && q && !String(r.cellAddress||'').toLowerCase().includes(q))return false;return true;});}
function wmsAnalysisFilterDetailsByProduct(rows, q, stockResult){q=String(q||'').trim().toLowerCase();const names=[];if(stockResult&&stockResult.product&&stockResult.product.name)names.push(String(stockResult.product.name).toLowerCase());((stockResult&&stockResult.rows)||[]).forEach(r=>{if(r.name)names.push(String(r.name).toLowerCase());});const needle=names[0]||q;if(!needle)return rows;return (rows||[]).filter(r=>{const task=r.detailTask||{};return (Array.isArray(task.products)?task.products:[]).some(p=>String(p.productName||p.name||'').toLowerCase().includes(needle)||needle.includes(String(p.productName||'').toLowerCase()));});}
function wmsAnalysisRecountSummary(rows){const byExecutor=wmsCountBy(rows,r=>r.executorName||'Без исполнителя');return {count:rows.length,executors:Object.keys(byExecutor).length,positions:wmsRecountSum(rows,'positionCount'),parts:wmsRecountSum(rows,'partCount'),expected:wmsRecountSum(rows,'expectedQty'),actual:wmsRecountSum(rows,'actualQty'),discrepancy:wmsRecountSum(rows,'discrepancyQty'),defective:wmsRecountSum(rows,'defectiveQty'),top:wmsTopEntries(byExecutor,6)};}
function wmsAnalysisChangeTable(rows){rows=(rows||[]).slice(0,20);if(!rows.length)return '<div class="no-results">Изменений по запросу не найдено</div>';return '<div class="wms-table-wrap"><table class="wms-table"><thead><tr><th>Дата</th><th>Операция</th><th>Товар</th><th>Ячейка</th><th>ЕО/HU</th><th>Δ</th><th>Исполнитель</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+escHtml(wmsRecountDateText(r.completedAt||r.operationCompletedAt||r.startedAt||r.operationStartedAt))+'</td><td>'+escHtml(wmsOperationLabel(r.operationType))+'<br><small>'+escHtml(r.operationType||'')+'</small></td><td><b>'+escHtml(r.name||'')+'</b><br><small>'+escHtml(r.nomenclatureCode||'')+'</small></td><td>'+escHtml(wmsChangeDirectionText(r))+'</td><td>'+escHtml(wmsChangeHuText(r))+'</td><td>'+escHtml(wmsDeltaText(wmsChangeMainDelta(r)))+'</td><td>'+escHtml(r.userName||'')+'</td></tr>').join('')+'</tbody></table></div>';}
function wmsAnalysisRecountTable(rows){rows=(rows||[]).slice(0,30);if(!rows.length)return '<div class="no-results">Пересчётов по запросу не найдено</div>';return '<div class="wms-table-wrap"><table class="wms-table"><thead><tr><th>Дата</th><th>Исполнитель</th><th>Ячейка</th><th>Тип</th><th>Причина</th><th>Поз.</th><th>Сист.</th><th>Факт</th><th>Разн.</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+escHtml(wmsRecountDateText(r.completedAt||r.createdAt))+'</td><td><b>'+escHtml(r.executorName||'')+'</b><br><small>'+escHtml(r.zoneName||'')+'</small></td><td><b>'+escHtml(r.cellAddress||'')+'</b></td><td>'+escHtml(wmsRecountLabelScope(r.scope))+'</td><td>'+escHtml(wmsRecountLabelReason(r.reason))+'</td><td>'+escHtml(r.detailLoaded?r.positionCount:'—')+'</td><td>'+escHtml(r.detailLoaded?r.expectedQty:'—')+'</td><td>'+escHtml(r.detailLoaded?r.actualQty:'—')+'</td><td>'+escHtml(r.detailLoaded?r.discrepancyQty:'—')+'</td></tr>').join('')+'</tbody></table></div>';}
function wmsAiActionLabel(action){return ({explain:'Что произошло?',check:'Что проверить?',problem:'Черновик проблемы',shift_summary:'Сводка смены'})[action]||'ИИ-разбор';}
function wmsAiTextToHtml(text){return escHtml(String(text||'').trim()).replace(/\n/g,'<br>');}
function wmsAiSlimStocks(rows){return (rows||[]).slice(0,120).map(r=>({
  ut:r.nomenclatureCode||'', name:r.name||'', qty:wmsNum(r.quantity), cell:r.cellAddress||'', hu:r.handlingUnitBarcode||'',
  bestBefore:r.bestBeforeDate||'', status:r.status||'', zone:r.zoneName||''
}));}
function wmsAiSlimChanges(rows){return (rows||[]).slice(0,100).map(r=>({
  at:r.completedAt||r.operationCompletedAt||r.startedAt||r.operationStartedAt||'', operation:r.operationType||'', operationLabel:wmsOperationLabel(r.operationType),
  ut:r.nomenclatureCode||'', name:r.name||'', from:r.sourceCellAddress||'', to:r.targetCellAddress||'',
  sourceHu:r.sourceHandlingUnitBarcode||'', targetHu:r.targetHandlingUnitBarcode||'', delta:wmsChangeMainDelta(r), status:r.status||''
}));}
function wmsAiSlimRecounts(rows){return (rows||[]).slice(0,60).map(r=>{
  const task=r.detailTask||{};
  const products=(Array.isArray(task.products)?task.products:[]).slice(0,50).map(p=>({
    name:p.productName||p.name||'',
    parts:(Array.isArray(p.parts)?p.parts:[]).slice(0,8).map(x=>({expected:wmsNum(x.expectedQuantity),actual:wmsNum(x.actualQuantity),discrepancy:wmsNum(x.discrepancy==null?(wmsNum(x.actualQuantity)-wmsNum(x.expectedQuantity)):x.discrepancy),defective:wmsNum(x.defectiveQuantity),bestBefore:x.bestBeforeDate||''}))
  }));
  return {cell:r.cellAddress||'', zone:r.zoneName||'', status:r.status||'', scope:r.scope||'', reason:r.reason||'', createdAt:r.createdAt||'', completedAt:r.completedAt||'',
    positions:r.positionCount==null?null:wmsNum(r.positionCount), parts:r.partCount==null?null:wmsNum(r.partCount), expected:r.expectedQty==null?null:wmsNum(r.expectedQty), actual:r.actualQty==null?null:wmsNum(r.actualQty), discrepancy:r.discrepancyQty==null?null:wmsNum(r.discrepancyQty), defective:r.defectiveQty==null?null:wmsNum(r.defectiveQty), products:products};
});}
function wmsBuildAiPayload(){
  const a=wmsLastResult;
  if(!a||a.mode!=='analysis')throw new Error('Сначала собери разбор WMS.');
  const stock=wmsAnalysisRowsSummary(a.stocks);
  const changes=wmsAnalysisChangesSummary(a.changes);
  const rec=wmsAnalysisRecountSummary(a.recountRows||[]);
  return {
    source:'Lenfer WMS analysis',
    query:{value:a.query||'',type:wmsDetectMode(a.query||''),date:a.date||'',executorFilter:a.executor||''},
    summary:{stockRows:stock.rows,stockQty:stock.qty,changes:changes.count,outgoing:changes.outgoing,incoming:changes.incoming,operations:changes.ops||'',recounts:rec.count,positions:rec.positions,parts:rec.parts,expected:rec.expected,actual:rec.actual,discrepancy:rec.discrepancy,defective:rec.defective},
    currentStocks:wmsAiSlimStocks((a.stocks&&a.stocks.rows)||[]),
    changes:wmsAiSlimChanges(changes.rows||[]),
    recounts:wmsAiSlimRecounts(a.recountRows||[]),
    collectionWarnings:(a.errors||[]).slice(0,8)
  };
}
async function wmsGetFirebaseToken(force){
  if(!(window.firebase&&firebase.auth))throw new Error('Firebase авторизация ещё не загрузилась. Открой приложение заново.');
  const user=firebase.auth().currentUser;
  if(!user)throw new Error('Войди в приложение, чтобы использовать ИИ-разбор.');
  return user.getIdToken(!!force);
}
function wmsAiSetAnswer(title,text){
  const box=document.getElementById('wms-ai-answer');
  if(!box)return;
  if(!text){box.className='wms-ai-answer empty';box.innerHTML='';return;}
  box.className='wms-ai-answer';
  box.innerHTML='<div class="wms-ai-answer-title">'+escHtml(title||'ИИ-разбор')+'</div><div>'+wmsAiTextToHtml(text)+'</div>';
}
async function wmsAskAi(){
  if(wmsAiBusy)return;
  const select=document.getElementById('wms-ai-action');
  const action=select?String(select.value||'explain'):'explain';
  let data;
  try{data=wmsBuildAiPayload();}catch(e){wmsSetStatus((e&&e.message)||'Нет данных для ИИ-разбора.','err');return;}
  wmsAiBusy=true;
  const btn=document.getElementById('wms-ai-run');
  if(btn){btn.disabled=true;btn.textContent='ИИ думает…';}
  wmsAiSetAnswer('ИИ-разбор','');
  wmsSetStatus('Отправляю собранный разбор в ИИ…','wait');
  const doRequest=async(force)=>{
    const token=await wmsGetFirebaseToken(force);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),70000);
    try{
      const resp=await fetch(WAREHOUSE_AI_URL,{method:'POST',headers:{'Content-Type':'application/json','X-Firebase-Token':token},body:JSON.stringify({action,data}),signal:controller.signal});
      const payload=await resp.json().catch(()=>({}));
      if(!resp.ok)throw new Error(payload.error||('ИИ-сервис вернул '+resp.status));
      if(!payload.answer)throw new Error('ИИ-сервис не вернул ответ');
      return payload;
    }finally{clearTimeout(timer);}
  };
  try{
    let result;
    try{result=await doRequest(false);}catch(e){
      if(/Firebase|токен|401/i.test(String((e&&e.message)||e)))result=await doRequest(true); else throw e;
    }
    wmsAiSetAnswer(wmsAiActionLabel(action),result.answer);
    wmsSetStatus('ИИ-разбор готов.','ok');
  }catch(e){
    let msg=(e&&e.name==='AbortError')?'ИИ-сервис не ответил за 70 секунд. Попробуй ещё раз.':((e&&e.message)||String(e));
    // добавляем подсказку по типу ошибки
    if(/Firebase|токен|auth|401|403/i.test(msg)) msg+=' → Попробуй выйти и войти в приложение заново.';
    else if(/Failed to fetch|NetworkError|network/i.test(msg)) msg+=' → Проверь интернет-соединение.';
    else if(/500|502|503/i.test(msg)) msg+=' → Сервис временно недоступен, попробуй через минуту.';
    wmsAiSetAnswer('Не удалось получить ИИ-разбор',msg);
    wmsSetStatus('ИИ-разбор: '+msg,'err');
  }finally{
    wmsAiBusy=false;
    if(btn){btn.disabled=false;btn.textContent='Разобрать';}
  }
}
function wmsAiCardHtml(){return '<div class="wms-ai-card"><div class="wms-ai-title">ИИ-разбор</div><div class="wms-ai-note">ИИ получает только собранный разбор этой ячейки/товара. Авторизация WMS и её токены не передаются.</div><div class="wms-ai-row"><select id="wms-ai-action" class="wms-select"><option value="explain">Что произошло?</option><option value="check">Что проверить?</option><option value="problem">Черновик проблемы</option></select><button id="wms-ai-run" class="exi-btn primary" onclick="wmsAskAi()">Разобрать</button></div><div id="wms-ai-answer" class="wms-ai-answer empty"></div></div>';}
function wmsRenderAnalysis(result){wmsLastResult=result;wmsLastChoices=null;const box=document.getElementById('wms-result');if(!box)return;const stock=wmsAnalysisRowsSummary(result.stocks);const changes=wmsAnalysisChangesSummary(result.changes);const rec=wmsAnalysisRecountSummary(result.recountRows||[]);const title=result.query||'Разбор WMS';const queryType=wmsDetectMode(result.query||'');const people=rec.top.map(([n,c])=>'<span class="wms-recount-badge">'+escHtml(n)+' · '+escHtml(c)+'</span>').join('');box.innerHTML='<div class="wms-card"><div class="wms-card-body"><div class="wms-product-name">Разбор: '+escHtml(title)+'</div><div class="wms-meta">Тип запроса: <b>'+escHtml(queryType)+'</b>'+(result.date?' · дата: <b>'+escHtml(result.date)+'</b>':'')+(result.executor?' · исполнитель: <b>'+escHtml(result.executor)+'</b>':'')+'</div></div></div>'+
'<div class="wms-recount-summary">'+
'<div class="wms-recount-stat"><b>'+escHtml(stock.rows)+'</b><span>строк остатков</span></div><div class="wms-recount-stat"><b>'+escHtml(stock.qty)+'</b><span>штук сейчас</span></div>'+ 
'<div class="wms-recount-stat"><b>'+escHtml(changes.count)+'</b><span>изменений</span></div><div class="wms-recount-stat"><b>'+escHtml(changes.outgoing)+' / '+escHtml(changes.incoming)+'</b><span>убыло / пришло</span></div>'+ 
'<div class="wms-recount-stat"><b>'+escHtml(rec.count)+'</b><span>пересчётов</span></div><div class="wms-recount-stat"><b>'+escHtml(rec.positions)+'</b><span>позиций в пересчётах</span></div>'+ 
'<div class="wms-recount-stat"><b>'+escHtml(rec.expected)+' / '+escHtml(rec.actual)+'</b><span>система / факт</span></div><div class="wms-recount-stat"><b>'+escHtml(rec.discrepancy)+'</b><span>расхождение</span></div></div>'+ 
wmsAiCardHtml()+
'<div class="wms-actions wms-result-actions"><button class="exi-btn primary" onclick="wmsCopyAnalysisTsv()">Скопировать TSV</button><button class="exi-btn" onclick="wmsRunAnalysis()">Обновить разбор</button></div>'+ 
'<div class="wms-filter-title">Операции вокруг запроса</div><div class="wms-meta">'+escHtml(changes.ops||'Операций нет')+'</div>'+ 
'<div class="wms-filter-title">Кто считал</div><div>'+people+'</div>'+ 
'<div class="wms-filter-title">Последние изменения</div>'+wmsAnalysisChangeTable(changes.rows)+
'<div class="wms-filter-title">Пересчёты и детализация</div>'+wmsAnalysisRecountTable(result.recountRows||[]);}
function wmsCopyAnalysisTsv(){if(!wmsLastResult||wmsLastResult.mode!=='analysis'){alert('Нет разбора');return;}const a=wmsLastResult;const lines=[];lines.push(['Блок','Дата','Исполнитель','Ячейка','Операция/тип','УТ','Товар','ЕО/HU','Система','Факт','Разница','ID'].join('\t'));(wmsAnalysisChangesSummary(a.changes).rows||[]).forEach(r=>{lines.push(['Изменение',wmsRecountDateText(r.completedAt||r.operationCompletedAt||r.startedAt||r.operationStartedAt),r.userName||'',wmsChangeDirectionText(r),wmsOperationLabel(r.operationType),r.nomenclatureCode||'',r.name||'',wmsChangeHuText(r),'','',wmsDeltaText(wmsChangeMainDelta(r)),r.id||''].map(v=>String(v||'').replace(/\t|\n/g,' ')).join('\t'));});(a.recountRows||[]).forEach(r=>{lines.push(['Пересчёт',wmsRecountDateText(r.completedAt||r.createdAt),r.executorName||'',r.cellAddress||'',wmsRecountLabelScope(r.scope)+' / '+wmsRecountLabelReason(r.reason),'','', '',r.expectedQty||'',r.actualQty||'',r.discrepancyQty||'',r.id||''].map(v=>String(v||'').replace(/\t|\n/g,' ')).join('\t'));});wmsCopyFallback(lines.join('\n')).then(()=>wmsSetStatus('TSV разбора скопирован.','ok'));}
async function wmsRunAnalysis(){const inp=document.getElementById('wms-query');const code=wmsCleanCode(inp?inp.value:'');if(!code){wmsSetStatus('Введи ячейку, УТ, ШК, название или ЕО для разбора.','err');return;}if(inp)inp.value=code;const date=wmsAnalysisDate();const executor=wmsAnalysisExecutor();wmsSetStatus('Собираю разбор: остатки + изменения + пересчёты…','wait');let stocks=null,changes=null,recount=null,recountRows=[];const errors=[];try{stocks=wmsNormalizeResult(await wmsNativeLookup(code));}catch(e){errors.push('остатки: '+((e&&e.message)||e));stocks={mode:'empty',rows:[]};}try{changes=wmsNormalizeResult(await wmsNativeLookupChanges(code));}catch(e){errors.push('изменения: '+((e&&e.message)||e));changes={mode:'changesEmpty',rows:[]};}try{const filters={status:wmsAnalysisStatus()||'COMPLETED',scope:'all',reason:'all',date:date,executor:executor,cell:wmsAnalysisIsCell(code)?code:''};recount=wmsNormalizeRecountingResult(await wmsCallNative('lookupWmsRecountingTasks',[JSON.stringify(filters)],45000));recountRows=wmsAnalysisRecountMatches(recount.rows||[],code);if(recountRows.length){const ids=recountRows.slice(0,80).map(r=>r.id).filter(Boolean);if(ids.length){const rawDetails=await wmsCallNative('lookupWmsRecountingTaskDetails',[JSON.stringify(ids)],120000);const tasks=wmsFindDetailTasks(rawDetails);const byId={};tasks.forEach(t=>{const id=t.id||t._loadedDetailId||'';if(id)byId[id]=t;});recountRows.forEach(r=>{if(r.id&&byId[r.id])wmsApplyRecountDetail(r,byId[r.id]);});if(!wmsAnalysisIsCell(code) && wmsDetectMode(code)!=='ЕО/HU')recountRows=wmsAnalysisFilterDetailsByProduct(recountRows,code,stocks);}}}catch(e){errors.push('пересчёты: '+((e&&e.message)||e));recount={mode:'recountingTasks',rows:[]};}
const result={mode:'analysis',query:code,date,executor,stocks,changes,recount,recountRows,errors};wmsRenderAnalysis(result);wmsSetStatus(errors.length?('Разбор собран частично: '+errors.join(' · ')):'Разбор собран.','ok');}

async function wmsLookupFromApp(){
  const inp=document.getElementById('wms-query');
  const code=wmsCleanCode(inp?inp.value:'');
  if(wmsLookupKind==='recounting'){ wmsLoadRecountingTasks(); return; }
  if(wmsLookupKind==='analysis'){ wmsRunAnalysis(); return; }
  if(!code){wmsSetStatus('Введи УТ, ШК, название, ячейку или ЕО.','err');return;}
  if(inp)inp.value=code;
  wmsSetStatus((wmsLookupKind==='changes'?'Ищу изменения: ':'Ищу остатки: ')+code+' · режим: '+wmsDetectMode(code)+'…','wait');
  try{
    let raw;
    if(wmsLookupKind==='changes'){
      raw=await wmsNativeLookupChanges(code);
    }else if(typeof window.lookupWmsByCode==='function') raw=await window.lookupWmsByCode(code);
    else raw=await wmsNativeLookup(code);
    const normalized=wmsNormalizeResult(raw);
    if(normalized._kind){
      wmsRenderChoices(normalized);
      wmsSetStatus('Найдено несколько вариантов. Выбери нужный.','ok');
      return;
    }
    wmsRenderResult(normalized);
    wmsSetStatus(wmsLookupKind==='changes' ? ('Изменения: '+normalized.totalRows+' строк.') : ('Готово: '+normalized.totalRows+' строк, '+normalized.totalQuantity+' шт.'),'ok');
  }catch(e){
    wmsSetStatus((e&&e.message)||WMS_AUTO_UNAVAILABLE,'err');
  }
}
function renderWms(){
  wmsRefreshModeButtons();
  const box=document.getElementById('wms-result');
  // Возврат на вкладку WMS, пока открыта карточка ЕО из отгрузки: пересчитать счётчики —
  // мог добавиться посторонний товар в РК, пока был на другой вкладке.
  if(wmsShipmentEoState){wmsRenderShipmentEoContent();return;}
  if(box && !wmsLastResult && !wmsLastChoices && !box.innerHTML){
    box.innerHTML=wmsLookupKind==='recounting'
      ? '<div class="hint" style="padding:34px 12px;"><span class="mark">↻</span><span class="txt">Выбери фильтры пересчётов и нажми «Показать пересчёты»</span></div>'
      : (wmsLookupKind==='analysis'
        ? '<div class="hint" style="padding:34px 12px;"><span class="mark">◇</span><span class="txt">Введи ячейку, УТ или ЕО и нажми «Собрать картину»</span></div>'
        : (wmsLookupKind==='picking'
          ? '<div class="hint" style="padding:34px 12px;"><span class="mark">⇄</span><span class="txt">Открой товар в заказе внутри WMS, затем вернись сюда и нажми «Обновить отбор»</span></div>'
          : '<div class="hint" style="padding:34px 12px;"><span class="mark">✶</span><span class="txt">Введи УТ, ШК, название, ячейку или ЕО и жми «Найти»</span></div>'));
  }
}
window.wmsLookupFromApp=wmsLookupFromApp;
window.wmsLookupProductId=wmsLookupProductId;
window.wmsLookupCellId=wmsLookupCellId;
window.wmsLookupChosenProductId=wmsLookupChosenProductId;
window.wmsLookupChosenCellId=wmsLookupChosenCellId;
window.wmsLookupProductChangesId=wmsLookupProductChangesId;
window.wmsLookupCellChangesId=wmsLookupCellChangesId;
window.wmsLookupChangesForExecutor=wmsLookupChangesForExecutor;
window.wmsSetLookupKind=wmsSetLookupKind;
window.wmsLoadRecountingTasks=wmsLoadRecountingTasks;
window.wmsLoadRecountingDetails=wmsLoadRecountingDetails;
window.wmsRecountingToday=wmsRecountingToday;
window.wmsSearchExecutorChanges=wmsSearchExecutorChanges;
window.wmsChangesExecToday=wmsChangesExecToday;
window.wmsClearExecutorChanges=wmsClearExecutorChanges;
window.wmsSetRcSubTab=wmsSetRcSubTab;
window.wmsLoadDiscrepancyPositions=wmsLoadDiscrepancyPositions;
window.wmsCopyDiscrepancyZone=wmsCopyDiscrepancyZone;
window.wmsExportDiscrepancyToReport=wmsExportDiscrepancyToReport;
window.wmsDiscrepancyToday=wmsDiscrepancyToday;
window.wmsClearDiscrepancyFilters=wmsClearDiscrepancyFilters;
window.wmsToggleCellChecked=wmsToggleCellChecked;
window.wmsCopyCheckedReport=wmsCopyCheckedReport;
window.wmsRunAnalysis=wmsRunAnalysis;
window.wmsAnalysisToday=wmsAnalysisToday;
window.wmsClearAnalysisFilters=wmsClearAnalysisFilters;
window.wmsCopyAnalysisTsv=wmsCopyAnalysisTsv;
window.wmsAskAi=wmsAskAi;
window.wmsClearRecountingFilters=wmsClearRecountingFilters;
window.wmsCopyRecountingTsv=wmsCopyRecountingTsv;
window.wmsParseImport=wmsParseImport;
window.wmsClearResult=wmsClearResult;
window.wmsPrefixUt=wmsPrefixUt;
window.wmsCopyCells=wmsCopyCells;
window.wmsCopyProduct=wmsCopyProduct;
window.wmsCopyProductField=wmsCopyProductField;
window.wmsCopyStockField=wmsCopyStockField;
window.wmsSaveAsProblem=wmsSaveAsProblem;
window.wmsPasteImportFromClipboard=wmsPasteImportFromClipboard;
window.wmsClearImportText=wmsClearImportText;
window.wmsLoadOneRecountDetail=wmsLoadOneRecountDetail;
window.wmsDecideRecount=wmsDecideRecount;
window.wmsCheckPickingCell=wmsCheckPickingCell;
window.wmsClearPickingCellCheck=wmsClearPickingCellCheck;
window.wmsLoadUpperStorageCells=wmsLoadUpperStorageCells;
window.wmsCheckUpperOccupancy=wmsCheckUpperOccupancy;
window.wmsUpperFilterChanged=wmsUpperFilterChanged;
window.wmsUpperCopy=wmsUpperCopy;
window.wmsLoadLargeLosses=wmsLoadLargeLosses;
window.lenferWmsNativeResolve=lenferWmsNativeResolve;
window.lenferWmsNativeReject=lenferWmsNativeReject;

// ── SEARCH ──
let query='',page=0,filtered=[],exactMode=false;
const PAGE_SIZE=50;
function toggleExact(){
  exactMode=!exactMode;
  const btn=document.getElementById('exact-btn');
  btn.textContent='Точный поиск: '+(exactMode?'ВКЛ':'ВЫКЛ');
  btn.style.color=exactMode?'var(--paper)':'var(--muted)';
  btn.style.background=exactMode?'var(--red)':'var(--surface2)';
  btn.style.borderColor=exactMode?'var(--red)':'var(--border)';
  if(query)doSearch(query);
}
function hl(text,q){
  if(!q)return text;
  // подсветка каждого ключевого слова
  const words=q.toLowerCase().replace(/-/g,' ').split(/\s+/).filter(Boolean);
  if(!words.length)return text;
  let result=text;
  // экранируем regex-спецсимволы
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  words.forEach(w=>{
    if(!w)return;
    const re=new RegExp('('+esc(w)+')','ig');
    result=result.replace(re,'<span class="hl">$1</span>');
  });
  return result;
}
function doSearch(q){
  const allItems=[...getCustomItems(),...CATALOG];
  const ql=String(q||'').trim().toLowerCase();
  if(exactMode){
    filtered=allItems.filter(i=>String(i.name||'').trim().split(/\s+/)[0].toLowerCase()===ql || String(i.ut||'').toLowerCase()===ql || productBarcodeList(i).some(b=>String(b).toLowerCase()===ql));
  }else{
    filtered=smartProductSearch(q,9999,allItems);
  }
  page=0;render();
}
let searchTimer;
document.getElementById('search').addEventListener('input',e=>{
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>{query=e.target.value.trim();if(query)doSearch(query);else{filtered=[];render();}},150);
});

// ── CATALOG RENDER ──
function favRowsHtml(){
  const favs=getFavs();
  if(!favs.length)return '';
  const all=[...getCustomItems(),...CATALOG];
  const customBc=getCustomBarcodes();
  let rows='';
  for(const ut of favs){
    const item=all.find(i=>i.ut===ut);
    if(!item)continue;
    const bc=item.barcode||customBc[item.ut]||'';
    const utp=item.ut.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const imgEl=item.img?'<img class="card-img" src="'+item.img+'" loading="lazy" onerror="this.style.display=\'none\'">':'<div class="card-noimg">📦</div>';
    rows+='<div class="card" onclick="openFromHistory(\''+utp+'\')">'+imgEl+
      '<div class="card-body"><div class="card-ut">'+item.ut+'<button class="mini-btn" onclick="event.stopPropagation();favClick(this,\''+utp+'\')" style="border-color:var(--gold);color:var(--gold);">★</button></div><div class="card-name"><span>'+item.name+'</span></div>'+(bc?'<div class="card-bc">ШК: '+bc+'</div>':'')+'</div></div>';
  }
  if(!rows)return '';
  return '<div class="section-title" style="margin-bottom:10px;">★ Избранное</div><div class="cards" style="margin-bottom:20px;">'+rows+'</div>';
}
function renderHistory(){
  const favHtml=favRowsHtml();
  const hist=get('search_history');
  if(!hist.length){
    if(favHtml)return favHtml;
    return '<div class="hint"><span class="mark">✶</span><span class="txt">Введите код или название</span></div>';
  }
  const all=[...getCustomItems(),...CATALOG];
  const customBc=getCustomBarcodes();
  let rows='';
  for(const ut of hist){
    const item=all.find(i=>i.ut===ut);
    if(!item)continue;
    const bc=item.barcode||customBc[item.ut]||'';
    const imgEl=item.img?'<img class="card-img" src="'+item.img+'" loading="lazy" onerror="this.style.display=\'none\'">':'<div class="card-noimg">📦</div>';
    rows+='<div class="card" onclick="openFromHistory(\''+item.ut.replace(/\\/g,'\\\\').replace(/'/g,"\\'")+'\')">'+imgEl+
      '<div class="card-body"><div class="card-ut">'+item.ut+'</div><div class="card-name"><span>'+item.name+'</span></div>'+(bc?'<div class="card-bc">ШК: '+bc+'</div>':'')+'</div></div>';
  }
  if(!rows)return favHtml || '<div class="hint"><span class="mark">✶</span><span class="txt">Введите код или название</span></div>';
  return favHtml + '<div class="section-title" style="margin-bottom:10px;">Недавние</div><div class="cards">'+rows+'</div>';
}
function openFromHistory(ut){
  const input=document.getElementById('search');
  input.value=ut;
  query=ut;
  doSearch(ut);
}
function favClick(btn, ut){
  toggleFav(ut);
  const on=isFav(ut);
  btn.textContent=on?'★':'☆';
  btn.style.borderColor=on?'var(--gold)':'var(--border)';
  btn.style.color=on?'var(--gold)':'var(--muted)';
  // if currently showing favorites/empty view, refresh
  if(!query)render();
}
function render(){
  const el=document.getElementById('results');
  if(!query){el.innerHTML=renderHistory();return;}
  if(!filtered.length){el.innerHTML='<div class="no-results">Ничего не найдено</div>';return;}
  const customBc=getCustomBarcodes();
  const shown=filtered.slice(0,(page+1)*PAGE_SIZE);
  let h='<div class="cards">';
  for(const item of shown){
    const bc=item.barcode||customBc[item.ut]||'';
    const cid='c'+Math.random().toString(36).slice(2);
    const ut_safe=item.ut.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const imgEl=item.img?'<img class="card-img" src="'+item.img+'" loading="lazy" onerror="this.style.display=\'none\'">':'<div class="card-noimg">📦</div>';
    h+='<div class="card" data-ut="'+escHtml(item.ut)+'" onclick="toggleCard(this,\''+ut_safe+'\',\''+bc+'\',\''+cid+'\')">'+
      imgEl+
      '<div class="card-body">'+
        '<div class="card-ut">'+hl(item.ut,query)+
          (item.custom?'<span class="custom-badge">свой</span><button class="custom-del" onclick="event.stopPropagation();delItem(\''+ut_safe+'\')">✕</button>':'')+
          '<button class="mini-btn" onclick="event.stopPropagation();cpTxt(\''+item.ut.replace(/'/g,"\\'")+'\',this)">копир</button>'+
          '<button class="mini-btn fav-btn" onclick="event.stopPropagation();favClick(this,\''+ut_safe+'\')" style="border-color:'+(isFav(item.ut)?'var(--gold)':'var(--border)')+';color:'+(isFav(item.ut)?'var(--gold)':'var(--muted)')+';">'+(isFav(item.ut)?'★':'☆')+'</button>'+
        '</div>'+
        '<div class="card-name"><span>'+hl(item.name,query)+'</span>'+
          '<button class="mini-btn" onclick="event.stopPropagation();cpTxt(\''+item.name.replace(/'/g,"\\'")+'\',this)">копир</button>'+
          '<button class="mini-btn" onclick="event.stopPropagation();shareText(\''+item.ut+' '+item.name.replace(/'/g,"\\'")+'\')">📤</button>'+
        '</div>'+
        (bc?'<div class="card-bc">ШК: '+hl(bc,query)+'</div>':'')+
      '</div>'+
      '<div class="card-detail"></div>'+
    '</div>';
  }
  h+='</div>';
  if(filtered.length>shown.length)h+='<button class="more-btn" onclick="loadMore()">Ещё '+(filtered.length-shown.length)+' записей</button>';
  el.innerHTML=h;
}
function loadMore(){page++;render();}

// ── CARD DETAIL ──
function toggleCard(el,ut,barcode,cid){
  document.querySelectorAll('.card.open').forEach(c=>{if(c!==el)c.classList.remove('open');});
  el.classList.toggle('open');
  const anyOpen=document.querySelector('.card.open');
  const fab=document.querySelector('.fab');
  if(fab)fab.style.display=anyOpen?'none':'flex';
  if(!el.classList.contains('open'))return;
  const customBc=getCustomBarcodes();
  showDetail(el,ut,barcode||customBc[ut]||'',cid);
  pushHistory(ut);
}
function pushHistory(ut){
  let h=get('search_history').filter(x=>x!==ut);
  h.unshift(ut);
  h=h.slice(0,10);
  set('search_history',h);
}
function showDetail(el,ut,bc,cid){
  const detail=el.querySelector('.card-detail');
  const bcs=splitBarcodeValues(bc);
  const primaryBc=bcs[0]||'';
  const item=productAllItems().find(x=>String(x.ut||'')===String(ut));
  const editKey=(item&&item.baseUt)||ut;
  const curName=(item&&item.name)||'';
  const curBc=bc||productBarcode(item)||'';
  const ps=getPackSizes()[ut]||'';

  const editBtnId='bc-edit-'+cid;
  const zoomBtnId='bc-zoom-'+cid;
  const saveBcBtnId='bc-save-'+cid;
  const bcInputId='bi-'+cid;
  const peSaveId='pe-save-'+cid;

  let h='';
  if(primaryBc){
    const allBcText=bcs.join(', ');
    const bcHtml=bcs.length>1?'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:7px;">'+bcs.map(x=>'<button type="button" class="bc-zoom-chip" data-bc="'+escHtml(x)+'">⤢ '+escHtml(x)+'</button>').join('')+'</div>':'';
    h+='<div class="bc-label">Штрихкод'+(bcs.length>1?'ы':'')+'</div>'+ 
       '<div class="bc-num">'+escHtml(allBcText)+'</div>'+ 
       '<canvas class="bc-canvas" id="'+cid+'"></canvas>'+ 
       bcHtml+
       '<div style="display:flex;gap:8px;margin-top:9px;">'+
       '<button class="bc-edit-btn" style="margin-top:0;" id="'+editBtnId+'">✏ изменить / удалить</button>'+ 
       '<button class="bc-edit-btn" style="margin-top:0;" id="'+zoomBtnId+'">⤢ увеличить отдельно</button>'+ 
       '</div>';
  }else{
    h+='<div class="bc-label">Штрихкод не найден</div>'+
       '<div class="bc-input-wrap">'+
       '<input class="bc-input" type="text" placeholder="Введите ШК" id="'+bcInputId+'" inputmode="numeric">'+
       '<button class="bc-save" id="'+saveBcBtnId+'">✓</button>'+
       '</div>';
  }

  h+='<div class="bc-label" style="margin-top:12px;">УТ и наименование</div>'+
     '<div style="display:grid;grid-template-columns:1fr;gap:7px;">'+
     '<input class="bc-input" type="text" id="pe-ut-'+cid+'" value="'+escHtml(ut)+'" placeholder="УТ">'+
     '<textarea class="bc-input" id="pe-name-'+cid+'" placeholder="Наименование" style="min-height:58px;resize:vertical;">'+escHtml(curName)+'</textarea>'+
     '<input class="bc-input" type="text" inputmode="numeric" id="pe-bc-'+cid+'" value="'+escHtml(curBc)+'" placeholder="ШК; если несколько — через запятую">'+
     '<button class="bc-save" id="'+peSaveId+'">Сохранить</button>'+
     '</div>';

  h+='<div class="bc-label" style="margin-top:12px;">Штук в упаковке (спайка/коробка)</div>'+
     '<div class="bc-input-wrap"><input class="bc-input" type="number" inputmode="numeric" placeholder="напр. 12" id="ps-'+cid+'" value="'+escHtml(ps)+'"><button class="bc-save" id="psb-'+cid+'">💾</button></div>';

  detail.innerHTML=h;
  if(primaryBc){const c=document.getElementById(cid);if(c)drawBarcode(c,primaryBc);}

  const stopIds=['pe-ut-'+cid,'pe-name-'+cid,'pe-bc-'+cid,'ps-'+cid,bcInputId];
  stopIds.forEach(id=>{const x=document.getElementById(id);if(x)x.onclick=function(e){e.stopPropagation();};});

  const editBtn=document.getElementById(editBtnId);
  if(editBtn) editBtn.onclick=function(e){editBC(e,ut,cid);};

  const zoomBtn=document.getElementById(zoomBtnId);
  if(zoomBtn) zoomBtn.onclick=function(e){e.stopPropagation();zoomBarcode(primaryBc,bcs,{title:curName||ut,subtitle:ut});};
  detail.querySelectorAll('.bc-zoom-chip').forEach(btn=>{
    btn.onclick=function(e){e.stopPropagation();zoomBarcode(btn.dataset.bc||btn.textContent,bcs,{title:curName||ut,subtitle:ut});};
  });

  const saveBcBtn=document.getElementById(saveBcBtnId);
  if(saveBcBtn) saveBcBtn.onclick=function(e){saveBC(e,ut,bcInputId,cid);};

  const peSave=document.getElementById(peSaveId);
  if(peSave) peSave.onclick=function(e){productEditSave(e,editKey,cid);};

  const psInput=document.getElementById('ps-'+cid);
  const psBtn=document.getElementById('psb-'+cid);
  if(psBtn){
    psBtn.onclick=function(e){
      e.stopPropagation();
      const v=psInput.value.trim();
      savePackSize(ut, v?parseInt(v):0);
      const o=psBtn.textContent;psBtn.textContent='✓';setTimeout(()=>psBtn.textContent=o,1000);
    };
  }
  if(psInput){
    psInput.onchange=function(){const v=psInput.value.trim();savePackSize(ut, v?parseInt(v):0);};
  }
  if(!primaryBc){setTimeout(()=>{const i=document.getElementById(bcInputId);if(i)i.focus();},100);}
}
function editBC(e,ut,cid){
  e.stopPropagation();
  const detail=e.target.closest('.card').querySelector('.card-detail');
  detail.innerHTML='<div class="bc-label">Изменить штрихкод</div><div class="bc-input-wrap"><input class="bc-input" type="text" placeholder="Новый ШК" id="bi-'+cid+'" inputmode="numeric"><button class="bc-save" onclick="saveBC(event,\''+ut+'\',\'bi-'+cid+'\',\''+cid+'\')">✓</button></div><button onclick="delBC(event,\''+ut+'\',\''+cid+'\')" style="margin-top:9px;width:100%;background:none;border:1px solid var(--red);border-radius:6px;padding:7px;color:var(--red-bright);font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.8px;cursor:pointer;">🗑 удалить ШК</button>';
  setTimeout(()=>{const i=document.getElementById('bi-'+cid);if(i)i.focus();},100);
}
function saveBC(e,ut,inputId,cid){
  e.stopPropagation();
  const inp=document.getElementById(inputId);const bc=inp?inp.value.trim():'';
  if(!bc)return;saveCustomBarcode(ut,bc);
  showDetail(e.target.closest('.card'),ut,bc,cid);
}
function delBC(e,ut,cid){
  e.stopPropagation();if(!confirm('Удалить ШК?'))return;
  deleteCustomBarcode(ut);showDetail(e.target.closest('.card'),ut,'',cid);
}

// ── ITEMS ──
function saveItem(){
  const name=document.getElementById('item-name').value.trim();
  if(!name){alert('Введите название');return;}
  const ut=document.getElementById('item-ut').value.trim()||'CUSTOM-'+Date.now();
  const bc=document.getElementById('item-bc').value.trim();
  const img=document.getElementById('item-photo').dataset.img||'';
  const items=getCustomItems();items.unshift(createMeta({ut,name,barcode:bc,img,custom:true}));
  try{set('custom_items',items);}catch(e){alert('Фото слишком большое, не хватает места.');return;}
  closeModal('item-modal');
  ['item-name','item-ut','item-bc'].forEach(id=>document.getElementById(id).value='');
  const p=document.getElementById('item-photo');p.innerHTML='📷 Добавить фото';p.dataset.img='';
  logAction('product','Добавлен товар: '+ut,{ut:ut});
  if(query)doSearch(query);
}
function delItem(ut){
  if(!confirm('Удалить товар?'))return;
  set('custom_items',getCustomItems().filter(i=>i.ut!==ut));
  logAction('product','Удалён товар: '+ut,{ut:ut});
  if(query)doSearch(query);
}

// ── CELLS ──
let cellFilter='all';
let renderedCells=[];
const getCellFavs = () => get('cell_favorites');
function isCellFav(addr){return getCellFavs().includes(addr);}
function toggleCellFav(addr,ev){
  if(ev)ev.stopPropagation();
  let f=getCellFavs();
  if(f.includes(addr))f=f.filter(x=>x!==addr); else f.unshift(addr);
  set('cell_favorites',f);
  renderCells();
}
function normCellText(s){
  return String(s||'').toLowerCase().replace(/[н]/g,'h').replace(/[р]/g,'r').replace(/[в]/g,'b').replace(/[с]/g,'c');
}
function cellTags(c){
  const addr=normCellText(c.addr).replace(/\s+/g,'');
  const name=String(c.name||'').toLowerCase();
  const tags=[];
  if(addr.startsWith('hh-')||addr.startsWith('hн-'))tags.push({key:'hh',txt:'HH',cls:''});
  if(addr.startsWith('sh-'))tags.push({key:'sh',txt:'SH',cls:''});
  if(addr.startsWith('brh-'))tags.push({key:'brh',txt:'BRH',cls:'hot'});
  if(name.includes('брак')||addr.startsWith('brh-'))tags.push({key:'brak',txt:'Брак',cls:'hot'});
  if(name.includes('холод'))tags.push({key:'cold',txt:'Холод',cls:'cold'});
  if(name.includes('буфер')||addr==='hh-1-1'||addr==='hн-1-1')tags.push({key:'buffer',txt:'Буфер',cls:'gold'});
  if(c.fixed)tags.push({key:'fixed',txt:'Служебная',cls:''});
  const seen=new Set();
  return tags.filter(t=>seen.has(t.key)?false:(seen.add(t.key),true));
}
function cellHasTag(c,tag){return cellTags(c).some(t=>t.key===tag);}
function setCellFilter(f){
  cellFilter=f;
  document.querySelectorAll('#cell-filter-bar .cell-chip').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));
  renderCells();
}
function saveCell(){
  const addr=document.getElementById('cell-addr').value.trim();
  const desc=document.getElementById('cell-desc').value.trim();
  const code=document.getElementById('cell-code').value.trim();
  if(!addr||!code){alert('Заполните название и код');return;}
  const cells=getCells();cells.unshift({addr,name:desc,code,id:Date.now()});
  set('cells',cells);closeModal('cell-modal');
  ['cell-addr','cell-desc','cell-code'].forEach(id=>document.getElementById(id).value='');
  renderCells();
}
function delCell(id,ev){
  if(ev)ev.stopPropagation();
  if(!confirm('Удалить ячейку?'))return;
  set('cells',getCells().filter(c=>c.id!==id));
  renderCells();
}
function getAllCellsForList(){
  const fixed=[...BRAK.map(b=>({addr:b.cell,name:b.name,code:b.barcode,id:'brak_'+b.cell,fixed:true}))];
  const custom=getCells();
  return [...fixed,...custom];
}
function renderCells(q){
  const inp=document.getElementById('cell-search');
  if(q===undefined && inp)q=inp.value;
  q=(q||'').toLowerCase().trim();
  const el=document.getElementById('cells-list');
  if(!el)return;
  const translit={'h':'н','n':'н','b':'б','r':'р','a':'а','e':'е','o':'о','p':'п','c':'с','k':'к','x':'х','m':'м','t':'т','v':'в','i':'и','u':'у','d':'д','g':'г','l':'л','f':'ф','z':'з','y':'у','j':'й','w':'в'};
  const qCyr=q.split('').map(c=>translit[c]||c).join('');
  let cells=getAllCellsForList();
  if(cellFilter==='fav')cells=cells.filter(c=>isCellFav(c.addr));
  else if(cellFilter!=='all')cells=cells.filter(c=>cellHasTag(c,cellFilter));
  if(q)cells=cells.filter(c=>{
    const a=String(c.addr||'').toLowerCase(),n=String(c.name||'').toLowerCase(),code=String(c.code||'').toLowerCase();
    const tags=cellTags(c).map(t=>t.txt.toLowerCase()).join(' ');
    const hay=[a,n,code,tags,normCellText(c.addr),normCellText(c.name)].join(' ');
    return hay.includes(q)||hay.includes(qCyr)||a.includes(qCyr)||n.includes(qCyr);
  });
  renderedCells=cells;
  if(!cells.length){el.innerHTML='<div class="no-results">Нет ячеек</div>';return;}
  el.className='cell-list';
  el.innerHTML=cells.map((c,idx)=>{
    const fav=isCellFav(c.addr);
    const tags=cellTags(c).map(t=>'<span class="cell-tag '+t.cls+'">'+escHtml(t.txt)+'</span>').join('');
    return '<div class="cell-row" id="cell-row-'+idx+'" onclick="toggleCellDetail('+idx+')">'+
      '<div class="cell-row-top">'+
        '<button class="cell-star '+(fav?'on':'')+'" onclick="toggleCellFav(\''+String(c.addr).replace(/\\/g,'\\\\').replace(/'/g,"\\'")+'\',event)">'+(fav?'★':'☆')+'</button>'+
        '<div class="cell-main"><div class="cell-name">'+escHtml(c.name||'Без описания')+'</div><div class="cell-addr">'+escHtml(c.addr)+'</div><div class="cell-code-mini">код: '+escHtml(c.code||'—')+'</div><div class="cell-tags">'+tags+'</div></div>'+
        '<button class="cell-open" onclick="event.stopPropagation();toggleCellDetail('+idx+')">ШК</button>'+ 
      '</div>'+
      '<div class="cell-detail" id="cell-detail-'+idx+'">'+
        '<div class="cell-canvas-wrap"><canvas class="cell-canvas" id="ccd-'+idx+'"></canvas></div>'+
        '<div class="cell-actions">'+
          '<button class="cell-action-btn" onclick="event.stopPropagation();copyText(\''+String(c.code||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")+'\',this)">Копир код</button>'+ 
          '<button class="cell-action-btn" onclick="event.stopPropagation();zoomBarcode(\''+String(c.code||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")+'\')">Увеличить</button>'+ 
          '<button class="cell-action-btn" onclick="event.stopPropagation();openCalcForCell('+idx+')">В счёт</button>'+ 
          '<button class="cell-action-btn" onclick="event.stopPropagation();addCellNote('+idx+')">Заметка</button>'+ 
          (!c.fixed?'<button class="cell-action-btn danger" onclick="delCell('+c.id+',event)">Удалить</button>':'')+
        '</div>'+ 
      '</div>'+ 
    '</div>';
  }).join('');
}
function toggleCellDetail(idx){
  const row=document.getElementById('cell-row-'+idx); if(!row)return;
  row.classList.toggle('open');
  if(row.classList.contains('open')){
    const c=renderedCells[idx];
    const cv=document.getElementById('ccd-'+idx);
    if(cv&&c&&c.code&&!cv.dataset.drawn){drawBarcode(cv,c.code);cv.dataset.drawn='1';}
  }
}
function openCalcForCell(idx){
  const c=renderedCells[idx];if(!c)return;
  switchTab('calc');
  setTimeout(()=>{pickCalcCell(c.addr,c.code);const f=document.getElementById('calc-boxes-main');if(f)f.focus();},80);
}
function addCellNote(idx){
  const c=renderedCells[idx];if(!c)return;
  switchTab('notes');
  chatSetActiveTopic(CHAT_GENERAL_TOPIC);
  const t=document.getElementById('note-text');
  if(t){ t.value='Ячейка '+c.addr+(c.name?' — '+c.name:'')+': '; t.focus(); }
}

// ── ЧАТ (бывшие «Заметки») ──
function newNoteId(){return Date.now()+Math.floor(Math.random()*1000);}
// Сообщения идут ДВУМЯ каналами сразу: realtime-чат Firebase (мгновенно) и
// старый проверенный sync-канал 'notes' (страховка — работает при любых
// правилах базы). Список на экране — объединение обоих, дубли по id схлопываются.
const CHAT_GENERAL_TOPIC='general';
const getChatTopics=()=>get('chat_topics');
function chatTopicName(id){
  id=String(id||CHAT_GENERAL_TOPIC);
  if(id===CHAT_GENERAL_TOPIC)return 'Общее';
  const t=getChatTopics().find(x=>String(x.id)===id);
  return t?t.name:'Тема';
}
let chatActiveTopicId=getStickyDate('chat_active_topic')||CHAT_GENERAL_TOPIC;
// 'topics' — список тем (экран 1), 'thread' — переписка внутри одной темы (экран 2).
let chatScreen='topics';
function chatSetActiveTopic(id){
  chatActiveTopicId=String(id||CHAT_GENERAL_TOPIC);
  setStickyDate('chat_active_topic',chatActiveTopicId);
  chatClearReplyDraft();
  chatScreen='thread';
  renderNotes();
  chatMarkSeen();
}
function chatBackToTopics(){
  chatScreen='topics';
  renderNotes();
}
function chatAddTopic(){
  const name=(prompt('Название темы:')||'').trim();
  if(!name)return;
  const topics=getChatTopics();
  const t=createMeta({id:Date.now()+Math.floor(Math.random()*1000),name:name});
  topics.unshift(t);
  set('chat_topics',topics);
  try{ if(window.fbPushNow)window.fbPushNow(); }catch(_){}
  chatSetActiveTopic(t.id);
}
function chatListItemTime(ts){
  if(!ts)return '';
  const d=new Date(Number(ts));
  const now=new Date();
  return d.toDateString()===now.toDateString()
    ? d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})
    : d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'});
}
function renderChatTopicsList(){
  const box=document.getElementById('chat-topics-list');if(!box)return;
  const topics=[{id:CHAT_GENERAL_TOPIC,name:'Общее'}].concat(getChatTopics().filter(t=>!t.archived));
  const all=chatListLocal();
  box.innerHTML=topics.map(t=>{
    const last=all.find(m=>String(m.topicId||CHAT_GENERAL_TOPIC)===String(t.id));
    const preview=last
      ? (chatMsgIsMine(last)?'Ты: ':(last.name?escHtml(last.name)+': ':''))+escHtml(String(last.text||(last.img?'📷 Фото':'')).slice(0,60))
      : 'Пока нет сообщений';
    const when=last?chatListItemTime(last.ts):'';
    return '<div class="chat-list-item" onclick="chatSetActiveTopic(\''+jsStr(String(t.id))+'\')">'+
      '<div class="chat-list-avatar">'+(t.id===CHAT_GENERAL_TOPIC?'💬':escHtml((t.name||'?').charAt(0).toUpperCase()))+'</div>'+
      '<div class="chat-list-body">'+
        '<div class="chat-list-top"><span class="chat-list-name">'+escHtml(t.name)+'</span><span class="chat-list-time">'+when+'</span></div>'+
        '<div class="chat-list-preview">'+preview+'</div>'+
      '</div>'+
    '</div>';
  }).join('')+'<button class="chat-list-add" onclick="chatAddTopic()">+ Новая тема</button>';
}
function chatLegacyAsMsg(n){
  return {id:String(n.id),text:String(n.text||''),img:String(n.img||''),uid:String(n.createdByUid||''),name:n.createdByName||n.createdByEmail||'',ts:Number(new Date(n.createdAtIso||0).getTime()||0)||Number(n.id)||0,dateRu:String(n.date||''),editedAt:0,topicId:String(n.topicId||CHAT_GENERAL_TOPIC),replyTo:n.replyTo||null,pinned:n.pinned||null,reactions:n.reactions||null};
}
function chatListLocal(){
  const out=new Map();
  (getNotes()||[]).forEach(n=>{ if(n&&n.id!=null)out.set(String(n.id),chatLegacyAsMsg(n)); });
  let chat=[];
  if(typeof window.lenferChatList==='function')chat=window.lenferChatList();
  else{
    const c=getObj('chat_cache');
    const m=(c&&c.msgs&&typeof c.msgs==='object')?c.msgs:{};
    chat=Object.keys(m).map(k=>m[k]);
  }
  // Поле за полем: чат-версия перекрывает легаси, но поле, которого в чате ещё нет
  // (не успело/не смогло долететь), берётся из легаси-копии — ничего не теряется.
  chat.forEach(m=>{
    if(!m||m.id==null)return;
    const k=String(m.id);
    const prev=out.get(k);
    out.set(k, prev?{...prev,...m}:m);
  });
  return [...out.values()].sort((a,b)=>Number(b.ts||0)-Number(a.ts||0));
}
function chatFiltered(){
  const topic=String(chatActiveTopicId||CHAT_GENERAL_TOPIC);
  return chatListLocal().filter(m=>String(m.topicId||CHAT_GENERAL_TOPIC)===topic);
}
function chatPinned(list){
  return (list||[]).filter(m=>m.pinned).sort((a,b)=>Number((b.pinned&&b.pinned.ts)||0)-Number((a.pinned&&a.pinned.ts)||0));
}
function chatMsgIsMine(m){
  const meUid=String((window.lenferCurrentUserProfile||getUserProfileLocal()||{}).uid||'');
  // Старые мигрированные заметки без uid считаем своими, чтобы их можно было править.
  return !m.uid || (meUid && String(m.uid)===meUid);
}
function chatWhen(m){
  const base=m.dateRu||(m.ts?new Date(Number(m.ts)).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'');
  return base+(m.editedAt?' · ред.':'');
}
// ── Ответ на сообщение ──
let chatReplyDraft=null;
function chatStartReply(id){
  const m=chatListLocal().find(x=>String(x.id)===String(id));if(!m)return;
  chatReplyDraft={id:String(m.id),name:m.name||'Без имени',uid:m.uid||'',text:String(m.text||'').slice(0,140)};
  renderChatReplyPreview();
  const ta=document.getElementById('note-text');if(ta)ta.focus();
}
function chatClearReplyDraft(){ chatReplyDraft=null; renderChatReplyPreview(); }
function renderChatReplyPreview(){
  const box=document.getElementById('note-reply-preview');if(!box)return;
  if(!chatReplyDraft){box.style.display='none';box.innerHTML='';return;}
  box.style.display='flex';
  box.innerHTML='<div style="flex:1;min-width:0;"><b style="color:var(--gold);">↩ '+escHtml(chatReplyDraft.name)+'</b><div style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+escHtml(chatReplyDraft.text)+'</div></div><button onclick="chatClearReplyDraft()" style="background:none;border:none;color:var(--red-bright);font-size:16px;cursor:pointer;flex:0 0 auto;">✕</button>';
}
function chatComposeNew(){ chatClearReplyDraft(); const ta=document.getElementById('note-text');if(ta)ta.focus(); }
// Автоувеличение поля ввода сообщения по мере набора текста, до потолка в CSS (max-height).
function chatAutoGrow(el){ if(!el)return; el.style.height='auto'; el.style.height=el.scrollHeight+'px'; }
// ── Закрепить сообщение ──
function chatTogglePin(id){
  const m=chatListLocal().find(x=>String(x.id)===String(id));if(!m)return;
  const a=currentActor();
  const pinned=m.pinned?null:{by:a.name,byUid:a.uid,ts:Date.now()};
  try{ if(typeof window.lenferChatPatch==='function')window.lenferChatPatch(id,{pinned:pinned}); }catch(_){}
  set('notes',getNotes().map(n=>String(n.id)!==String(id)?n:touchMeta({...n,pinned:pinned})));
  try{ if(window.fbPushNow)window.fbPushNow(); }catch(_){}
  renderNotes();
}
// Полноэкранный просмотр фото по тапу — картинка целиком, без обрезки.
function chatOpenImage(src){
  if(!src)return;
  let ov=document.getElementById('chat-img-viewer');
  if(!ov){
    ov=document.createElement('div');
    ov.id='chat-img-viewer';
    ov.className='chat-img-viewer';
    ov.onclick=()=>{ov.style.display='none';};
    ov.innerHTML='<img id="chat-img-viewer-img" src="" alt=""/>';
    document.body.appendChild(ov);
  }
  document.getElementById('chat-img-viewer-img').src=src;
  ov.style.display='flex';
}
window.chatOpenImage=chatOpenImage;
// ── Реакции-эмодзи ──
const CHAT_REACTION_EMOJIS=['👍','❤️','😂','🔥','👀','✅'];
function chatMyReaction(m,emoji){
  const meUid=String((window.lenferCurrentUserProfile||getUserProfileLocal()||{}).uid||'');
  return !!(m.reactions && m.reactions[emoji] && m.reactions[emoji][meUid]);
}
function chatReactionCounts(m){
  const r=m.reactions||{};
  return CHAT_REACTION_EMOJIS.map(e=>({emoji:e,count:r[e]?Object.keys(r[e]).length:0,mine:chatMyReaction(m,e),names:r[e]?Object.values(r[e]):[]})).filter(x=>x.count>0);
}
function chatToggleReaction(id,emoji){
  const me=window.lenferCurrentUserProfile||getUserProfileLocal()||{};
  const meUid=String(me.uid||''),meName=String(me.name||'Пользователь');
  if(!meUid){alert('Сначала войди в аккаунт.');return;}
  try{ if(typeof window.lenferChatToggleReaction==='function')window.lenferChatToggleReaction(id,emoji); }catch(_){}
  // Страховка — тот же легаси-канал, что у пометок и закрепления.
  const notes=getNotes();
  const idx=notes.findIndex(n=>String(n.id)===String(id));
  if(idx>=0){
    const n=notes[idx];
    const reactions=n.reactions&&typeof n.reactions==='object'?{...n.reactions}:{};
    const cur=reactions[emoji]&&typeof reactions[emoji]==='object'?{...reactions[emoji]}:{};
    if(cur[meUid])delete cur[meUid]; else cur[meUid]=meName;
    if(Object.keys(cur).length)reactions[emoji]=cur; else delete reactions[emoji];
    notes[idx]=touchMeta({...n,reactions});
    set('notes',notes);
  }
  try{ if(window.fbPushNow)window.fbPushNow(); }catch(_){}
  renderNotes();
}
function chatOpenReactionPicker(id){
  let ov=document.getElementById('chat-reaction-overlay');
  if(!ov){
    ov=document.createElement('div');
    ov.id='chat-reaction-overlay';
    ov.className='chat-reaction-overlay';
    ov.addEventListener('click',e=>{ if(e.target===ov)chatClosePicker(); });
    document.body.appendChild(ov);
  }
  ov.innerHTML='<div class="chat-reaction-picker">'+CHAT_REACTION_EMOJIS.map(e=>'<button onclick="chatToggleReaction(\''+jsStr(String(id))+'\',\''+e+'\');chatClosePicker()">'+e+'</button>').join('')+'</div>';
  ov.style.display='flex';
}
function chatClosePicker(){ const ov=document.getElementById('chat-reaction-overlay'); if(ov)ov.style.display='none'; }
function chatReactionsHtml(n){
  const counts=chatReactionCounts(n);
  const sid=jsStr(String(n.id));
  const pills=counts.map(c=>'<button class="chat-reaction-pill'+(c.mine?' mine':'')+'" title="'+escHtml(c.names.join(', '))+'" onclick="chatToggleReaction(\''+sid+'\',\''+c.emoji+'\')">'+c.emoji+' <b>'+c.count+'</b></button>').join('');
  return '<div class="chat-reactions">'+pills+'<button class="chat-reaction-add" onclick="chatOpenReactionPicker(\''+sid+'\')">+😊</button></div>';
}
function chatScrollTo(id){
  const el=document.getElementById('chat-msg-'+id);if(!el)return;
  el.scrollIntoView({behavior:'smooth',block:'center'});
  el.classList.add('chat-flash');
  setTimeout(()=>{try{el.classList.remove('chat-flash');}catch(_){}},1500);
}
// ── Непрочитанное: бейдж + звук, пока приложение открыто ──
function chatUnreadCount(){
  const seen=Number(getStickyDate('chat_last_seen_ts')||0);
  const meUid=String((window.lenferCurrentUserProfile||getUserProfileLocal()||{}).uid||'');
  return chatListLocal().filter(m=>Number(m.ts||0)>seen && String(m.uid||'')!==meUid).length;
}
function chatUpdateBadge(){
  const n=chatUnreadCount();
  ['chat-badge-menu','chat-badge-nav'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    if(n>0){el.style.display='inline-flex';el.textContent=n>99?'99+':String(n);}
    else{el.style.display='none';el.textContent='';}
  });
}
function chatMarkSeen(){
  const maxTs=chatListLocal().reduce((m,x)=>Math.max(m,Number(x.ts)||0),0);
  if(maxTs)setStickyDate('chat_last_seen_ts',String(maxTs));
  chatUpdateBadge();
}
let chatAudioCtx=null;
function chatBeep(){
  try{
    if(!chatAudioCtx)chatAudioCtx=new (window.AudioContext||window.webkitAudioContext)();
    const ctx=chatAudioCtx;
    if(ctx.state==='suspended')ctx.resume();
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type='sine';o.frequency.value=880;
    g.gain.setValueAtTime(0.0001,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18,ctx.currentTime+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.22);
    o.connect(g);g.connect(ctx.destination);
    o.start();o.stop(ctx.currentTime+0.24);
  }catch(_){}
}
function chatNotifyNew(msg){
  const meUid=String((window.lenferCurrentUserProfile||getUserProfileLocal()||{}).uid||'');
  if(!msg||String(msg.uid||'')===meUid)return; // не пищим на своё же сообщение
  chatBeep();
  try{ if(navigator.vibrate)navigator.vibrate(60); }catch(_){}
}
function saveNote(){
  const text=document.getElementById('note-text').value.trim();
  if(!text){alert('Введите текст');return;}
  const img=document.getElementById('note-photo').dataset.img||'';
  const id=Date.now()+Math.floor(Math.random()*1000);
  const topicId=chatActiveTopicId||CHAT_GENERAL_TOPIC;
  const replyTo=chatReplyDraft?{id:chatReplyDraft.id,name:chatReplyDraft.name,uid:chatReplyDraft.uid,text:chatReplyDraft.text}:null;
  // Канал 1: мгновенный чат Firebase (если доступен).
  try{ if(typeof window.lenferChatSend==='function')window.lenferChatSend(text,img,id,{topicId:topicId,replyTo:replyTo}); }catch(_){}
  // Канал 2: страховка — обычные заметки через общий sync (дубль схлопнется по id).
  const notes=getNotes();
  notes.unshift(createMeta({id:id,text,img,topicId:topicId,replyTo:replyTo,date:new Date().toLocaleString('ru',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}));
  try{set('notes',notes);}catch(e){alert('Фото слишком большое, не хватает места.');return;}
  try{ if(window.fbPushNow)window.fbPushNow(); }catch(_){}
  const ta=document.getElementById('note-text');ta.value='';ta.style.height='auto';
  const p=document.getElementById('note-photo');p.innerHTML='📷';p.dataset.img='';
  chatClearReplyDraft();
  renderNotes();
}
function editNote(id){
  const note=chatListLocal().find(n=>String(n.id)===String(id));if(!note)return;
  if(!chatMsgIsMine(note)){alert('Это сообщение другого пользователя — править может только автор.');return;}
  document.getElementById('edit-note-id').value=String(id);
  document.getElementById('edit-note-text').value=note.text||'';
  const p=document.getElementById('edit-note-photo');
  if(note.img){p.innerHTML='<img src="'+note.img+'">';p.dataset.img=note.img;}else{p.innerHTML='📷 Изменить фото';p.dataset.img='';}
  openModal('edit-note-modal');
}
function updateNote(){
  const id=String(document.getElementById('edit-note-id').value||'');
  const text=document.getElementById('edit-note-text').value.trim();
  if(!text){alert('Введите текст');return;}
  const img=document.getElementById('edit-note-photo').dataset.img||'';
  try{ if(typeof window.lenferChatEdit==='function')window.lenferChatEdit(id,text,img); }catch(_){}
  // Правим и в страховочном канале, чтобы у всех сошлось при любых правилах базы.
  try{set('notes',getNotes().map(n=>String(n.id)!==id?n:touchMeta({...n,text,img})));}catch(e){alert('Фото слишком большое.');return;}
  try{ if(window.fbPushNow)window.fbPushNow(); }catch(_){}
  closeModal('edit-note-modal');
  renderNotes();
}
function delNote(id){
  const note=chatListLocal().find(n=>String(n.id)===String(id));if(!note)return;
  if(!chatMsgIsMine(note)){alert('Это сообщение другого пользователя — удалить может только автор.');return;}
  if(!confirm('Удалить сообщение?'))return;
  try{ if(typeof window.lenferChatDelete==='function')window.lenferChatDelete(id); }catch(_){}
  set('notes',getNotes().filter(n=>String(n.id)!==String(id)));
  try{ if(window.fbPushNow)window.fbPushNow(); }catch(_){}
  renderNotes();
}
function chatMessageCard(n){
  const author=n.name||'Без имени';
  const mine=chatMsgIsMine(n);
  const sid=jsStr(String(n.id));
  const isPinned=!!n.pinned;
  const shareArg=String(n.text||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g,'\\n');
  const replyHtml=n.replyTo?('<div class="chat-reply-quote" onclick="chatScrollTo(\''+jsStr(String(n.replyTo.id))+'\')"><b>'+escHtml(n.replyTo.name||'')+'</b><div>'+escHtml(n.replyTo.text||'')+'</div></div>'):'';
  const actions='<div class="note-actions">'+
    '<button class="note-btn" onclick="chatStartReply(\''+sid+'\')" title="Ответить">↩</button>'+
    '<button class="note-btn" onclick="chatTogglePin(\''+sid+'\')" title="'+(isPinned?'Открепить':'Закрепить')+'">'+(isPinned?'📌':'📍')+'</button>'+
    '<button class="note-btn" onclick="shareText(\''+shareArg+'\')" title="Поделиться">📤</button>'+
    (mine?'<button class="note-btn" onclick="editNote(\''+sid+'\')" title="Изменить">✏</button><button class="note-btn del" onclick="delNote(\''+sid+'\')" title="Удалить">✕</button>':'')+
  '</div>';
  return '<div class="chat-row '+(mine?'mine':'theirs')+'">'+
    (mine?'':avatarHtml(n.uid,author,32))+
    '<div class="note-card'+(isPinned?' chat-pinned-msg':'')+'" id="chat-msg-'+sid+'">'+
      (isPinned?'<div class="chat-pin-flag">📌'+(n.pinned&&n.pinned.by?' '+escHtml(n.pinned.by):'')+'</div>':'')+
      (mine?'':'<div class="note-author">'+escHtml(author)+'</div>')+
      replyHtml+
      '<div class="note-text">'+escHtml(String(n.text||''))+'</div>'+
      (n.img?'<img class="note-img" src="'+n.img+'" onclick="chatOpenImage(this.src)"/>':'')+
      chatReactionsHtml(n)+
      '<div class="note-foot"><span class="note-date">'+escHtml(chatWhen(n))+'</span>'+actions+'</div>'+
    '</div>'+
  '</div>';
}
function renderNotes(){
  renderChatTopicsList();
  const topicsScreen=document.getElementById('chat-topics-screen');
  const threadScreen=document.getElementById('chat-thread-screen');
  if(!topicsScreen||!threadScreen)return;
  if(chatScreen!=='thread'){
    topicsScreen.style.display='';
    threadScreen.style.display='none';
    return;
  }
  topicsScreen.style.display='none';
  threadScreen.style.display='flex';
  const titleEl=document.getElementById('chat-thread-title');
  if(titleEl)titleEl.textContent=chatTopicName(chatActiveTopicId);
  const el=document.getElementById('notes-list');if(!el)return;
  const allDesc=chatFiltered();
  const pinned=chatPinned(allDesc);
  const pinnedBox=document.getElementById('chat-pinned');
  if(pinnedBox){
    pinnedBox.style.display=pinned.length?'block':'none';
    pinnedBox.innerHTML=pinned.map(chatMessageCard).join('');
  }
  if(!allDesc.length){el.innerHTML='<div class="no-results">Пока пусто в теме «'+escHtml(chatTopicName(chatActiveTopicId))+'». Напиши первым — сообщение мгновенно увидят все.</div>';return;}
  // В мессенджере старые сообщения сверху, новые снизу — переворачиваем и после
  // отрисовки прокручиваем ленту вниз, к последнему сообщению.
  el.innerHTML=allDesc.slice().reverse().map(chatMessageCard).join('');
  requestAnimationFrame(()=>{ el.scrollTop=el.scrollHeight; });
}

// ── EO ──
const EO_PREFIX='012200';
const EO_FULL_LEN=12;
function normalizeEOCode(v){
  // Оставляем только цифры
  let s=String(v||'').trim().replace(/\s+/g,'').replace(/[^0-9]/g,'');
  if(!s)return '';
  // Если уже ровно 12 цифр — принимаем как есть (0222..., 0122..., любой префикс)
  if(s.length===EO_FULL_LEN)return s;
  // Длиннее 12 — вырезаем первые 12 цифр (сканер мог дать длинный код)
  if(s.length>EO_FULL_LEN)return s.slice(0,EO_FULL_LEN);
  // Короче 12 — не нормализуем, возвращаем как есть (неполный ввод)
  return s;
}
function repairEOStorage(){
  let changed=false;
  const fix=v=>normalizeEOCode(v);

  const codes=getEOCodes();
  if(Array.isArray(codes)){
    codes.forEach(c=>{const n=fix(c&&c.code); if(c&&n&&c.code!==n){c.code=n; changed=true;}});
    if(changed)set('eo_codes',codes);
  }

  let changedHH=false;
  const hh=getHH11();
  if(Array.isArray(hh)){
    hh.forEach(r=>{const n=fix(r&&r.eo); if(r&&n&&r.eo!==n){r.eo=n; changedHH=true;}});
    if(changedHH)set('hh11_log',hh);
  }

  const used=getObj('eo_range_used');
  let changedUsed=false; const nextUsed={};
  Object.keys(used||{}).forEach(k=>{const n=fix(k); if(n){nextUsed[n]=used[k]; if(n!==k)changedUsed=true;}});
  if(changedUsed)set('eo_range_used',nextUsed);

  const range=get('eo_range_saved');
  if(Array.isArray(range)){
    const fixed=[...new Set(range.map(fix).filter(Boolean))];
    if(JSON.stringify(fixed)!==JSON.stringify(range))set('eo_range_saved',fixed);
  }
}
function eoNormalizeInput(id){
  const el=document.getElementById(id); if(!el)return '';
  const v=normalizeEOCode(el.value);
  if(v)el.value=v;
  return v;
}
function eoPrefixInput(id){
  const el=document.getElementById(id); if(!el)return;
  const raw=String(el.value||'').trim();
  if(!raw){el.value=EO_PREFIX;}
  else el.value=normalizeEOCode(raw);
  el.focus();
  try{el.setSelectionRange(el.value.length,el.value.length);}catch(e){}
}
function addEOCode(){
  const input=document.getElementById('single-bc-input');const code=normalizeEOCode(input&&input.value);
  if(!code){alert('Введите код');return;}
  if(input)input.value=code;
  addEOCodeValue(code);
  input.value='';renderEO();
}
// Добавить готовый код (например, полученный из ВМС) в тот же локальный список ЕО.
function addEOCodeValue(code){
  code=normalizeEOCode(code); if(!code)return false;
  const codes=getEOCodes();
  if(codes.some(c=>c.code===code))return false;
  codes.unshift({id:Date.now()+Math.floor(Math.random()*1000),code});
  set('eo_codes',codes);
  return true;
}
// Создать новые ЕО прямо в ВМС (реальный эндпоинт POST /handling-units) и добавить в список.
async function createEOInWms(){
  const qtyEl=document.getElementById('eo-wms-qty');
  const typeEl=document.getElementById('eo-wms-type');
  const customEl=document.getElementById('eo-wms-type-custom');
  const resBox=document.getElementById('eo-wms-result');
  if(!resBox)return;
  const qty=Math.max(1,Math.min(200,parseInt(qtyEl&&qtyEl.value)||1));
  const type=((typeEl&&typeEl.value)==='custom'?String(customEl&&customEl.value||'').trim():(typeEl&&typeEl.value))||'EUR';
  if(!type){wmsSetStatus('Укажи тип ЕО.','err');return;}
  resBox.innerHTML='<div class="no-results">Создаю…</div>';
  try{
    const raw=await wmsCallNative('createWmsHandlingUnits',[String(qty),type],30000);
    const v=(raw&&raw.value!==undefined)?raw.value:raw;
    let codes=[];
    const arr=Array.isArray(v)?v:(Array.isArray(v&&v.items)?v.items:(Array.isArray(v&&v.handlingUnits)?v.handlingUnits:null));
    if(arr)codes=arr.map(x=>typeof x==='string'?x:(x&&(x.handlingUnitBarcode||x.barcode||x.code))).filter(Boolean);
    if(!codes.length&&v&&typeof v==='object'&&!Array.isArray(v)){
      const one=v.handlingUnitBarcode||v.barcode||v.code;
      if(one)codes=[one];
    }
    if(!codes.length){
      resBox.innerHTML='<div class="wms-warning">Создано, но не смог распознать штрихкоды в ответе ВМС — формат непривычный. Вот сырой ответ, пришли мне, чтобы доработать разбор:</div>'+
        '<textarea readonly style="width:100%;min-height:140px;margin-top:6px;font-family:monospace;font-size:10px;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px;">'+escHtml(JSON.stringify(raw,null,1))+'</textarea>';
      wmsSetStatus('ЕО созданы в ВМС, но разбор ответа не удался.','');
      return;
    }
    codes.forEach(c=>addEOCodeValue(String(c)));
    resBox.innerHTML='<div class="wms-warning" style="border-color:var(--ok);color:var(--ok);">Создано в ВМС: '+codes.length+' шт. Добавлено в список ниже.</div>'+
      codes.map(c=>'<div class="mono" style="font-size:12px;padding:3px 0;">'+escHtml(c)+'</div>').join('');
    wmsSetStatus('Создано ЕО в ВМС: '+codes.length+'.','ok');
    renderEO();
  }catch(e){
    resBox.innerHTML='<div class="no-results">'+escHtml((e&&e.message)||String(e))+'</div>';
    wmsSetStatus((e&&e.message)||'Не смог создать ЕО в ВМС.','err');
  }
}
window.createEOInWms=createEOInWms;
function eoWmsTypeChanged(){
  const typeEl=document.getElementById('eo-wms-type');
  const customEl=document.getElementById('eo-wms-type-custom');
  if(customEl)customEl.style.display=(typeEl&&typeEl.value==='custom')?'block':'none';
}
window.eoWmsTypeChanged=eoWmsTypeChanged;
function delEOCode(id){if(!confirm('Удалить штрихкод?'))return;set('eo_codes',getEOCodes().filter(c=>c.id!==id));renderEO();}
function editEOCode(id){
  const item=getEOCodes().find(c=>c.id===id);if(!item)return;
  const nv=prompt('Изменить код:',item.code);if(nv===null)return;
  const code=normalizeEOCode(nv);if(!code)return;
  set('eo_codes',getEOCodes().map(c=>c.id===id?{...c,code}:c));renderEO();
}
function genEORange(){
  const fromStr=eoNormalizeInput('eo-range-from');
  const toStr=eoNormalizeInput('eo-range-to');
  const box=document.getElementById('eo-range-list');
  if(!fromStr||!toStr){alert('Введите диапазон');return;}
  if(!/^\d+$/.test(fromStr)||!/^\d+$/.test(toStr)){alert('Только цифры');return;}
  const width=fromStr.length; // фиксированная длина по полю "от"
  const from=parseInt(fromStr,10);
  const to=parseInt(toStr,10);
  if(from>to){alert('Начало больше конца');return;}
  if(to-from>200){alert('Максимум 200 за раз');return;}
  const codes=[];
  for(let i=from;i<=to;i++){codes.push(String(i).padStart(width,'0'));}
  set('eo_range_saved', codes);  // сохраняем диапазон
  renderEORange();
}
let eoRangeFilter='all';
function setEOFilter(filter){
  eoRangeFilter=filter||'all';
  document.querySelectorAll('#eo-filter-bar .cell-chip').forEach(b=>b.classList.toggle('active', b.dataset.eofilter===eoRangeFilter));
  renderEORange();
}
function renderEORange(){
  const codes=get('eo_range_saved');
  const box=document.getElementById('eo-range-list');
  if(!box)return;
  if(!codes.length){box.innerHTML='';return;}
  const used=getObj('eo_range_used');
  const filter=eoRangeFilter||'all';
  const shown=codes.filter(code=>filter==='all' || (filter==='used'?!!used[code]:!used[code]));
  if(!shown.length){box.innerHTML='<div class="no-results" style="padding:18px;">Пусто</div>';return;}
  let h='';
  shown.forEach((code,idx)=>{
    const isUsed=used[code]?' eo-used':'';
    h+='<div class="paper-card eor-card'+isUsed+'" id="eorc-'+idx+'">'+
      '<div class="pc-title" style="font-size:17px;">'+code+'</div>'+
      '<canvas class="pc-canvas" id="eor-'+idx+'"></canvas>'+
      '<div class="pc-actions">'+
        '<button class="pc-btn" onclick="toggleEOUsed(\''+code+'\',\'eorc-'+idx+'\')">✓ использован</button>'+
        '<button class="pc-btn" onclick="zoomBarcode(\''+code+'\')">⤢ увеличить</button>'+
      '</div>'+
    '</div>';
  });
  box.innerHTML=h;
  shown.forEach((code,idx)=>{const cv=document.getElementById('eor-'+idx);if(cv)drawBarcode(cv,code);});
}
function toggleEOUsed(code, cardId){
  const used=getObj('eo_range_used');
  if(used[code]){delete used[code];}else{used[code]=1;}
  set('eo_range_used',used);
  const card=document.getElementById(cardId);
  if(card)card.classList.toggle('eo-used',!!used[code]);
}
function drawBarcodeBig(canvas,text){
  if(!canvas)return;
  const p=code128(String(text||''));
  const viewportW=Math.max(320, window.innerWidth||360);
  const bw=Math.max(4, Math.min(9, Math.floor((viewportW*1.35)/Math.max(1,p.length))));
  const h=Math.max(260, Math.floor((window.innerHeight||640)*0.48));
  canvas.width=p.length*bw;canvas.height=h;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,h);
  ctx.fillStyle='#000';
  for(let i=0;i<p.length;i++)if(p[i]==='1')ctx.fillRect(i*bw,0,bw,h);
}
function ensureBarcodeZoomOverlay(){
  let ov=document.getElementById('bc-zoom');
  if(!ov){
    ov=document.createElement('div');
    ov.id='bc-zoom';
    ov.style.display='none';
    ov.innerHTML=''+
      '<button type="button" id="bc-zoom-close" onclick="closeZoom()">Закрыть</button>'+
      '<div id="bc-zoom-title"></div>'+
      '<div id="bc-zoom-subtitle"></div>'+
      '<canvas id="bc-zoom-canvas"></canvas>'+
      '<div id="bc-zoom-code"></div>'+
      '<div id="bc-zoom-nav"><button type="button" id="bc-zoom-prev" onclick="zoomNavMove(-1)">← Предыдущий</button><button type="button" id="bc-zoom-next" onclick="zoomNavMove(1)">Следующий →</button></div>'+
      '<div id="bc-zoom-list"></div>';
    ov.addEventListener('click',function(e){if(e.target===ov)closeZoom();});
    document.body.appendChild(ov);
  }
  return ov;
}
let zoomNavState=null;
function zoomBarcode(code, list, meta, nav){
  code=String(code||'').trim();
  if(!code)return;
  const ov=ensureBarcodeZoomOverlay();
  nav=nav||null;
  const cv=document.getElementById('bc-zoom-canvas');
  const codeEl=document.getElementById('bc-zoom-code');
  const titleEl=document.getElementById('bc-zoom-title');
  const subEl=document.getElementById('bc-zoom-subtitle');
  const listEl=document.getElementById('bc-zoom-list');
  const navEl=document.getElementById('bc-zoom-nav');
  const prevBtn=document.getElementById('bc-zoom-prev');
  const nextBtn=document.getElementById('bc-zoom-next');
  const codes=[];
  splitBarcodeValues(list||code).forEach(x=>{if(codes.indexOf(x)<0)codes.push(x);});
  if(codes.indexOf(code)<0)codes.unshift(code);
  let title='',subtitle='';
  if(typeof meta==='string')title=meta;
  else if(meta&&typeof meta==='object'){
    title=meta.title||meta.name||'';
    subtitle=meta.subtitle||meta.ut||'';
    if(meta.eo)subtitle=(subtitle?subtitle+' · ':'')+'ЕО '+meta.eo;
  }
  if(ov){
    ov.classList.toggle('compact', !!(nav&&nav.compact));
    ov.classList.toggle('placement', !!(nav&&nav.placement));
  }
  if(titleEl)titleEl.textContent=title||'';
  if(subEl)subEl.textContent=subtitle||'';
  if(codeEl)codeEl.textContent=code;
  drawBarcodeBig(cv,code);
  if(listEl){
    listEl.innerHTML=codes.length>1?codes.map(x=>'<button type="button" class="'+(x===code?'active':'')+'" data-code="'+escHtml(x)+'">'+escHtml(x)+'</button>').join(''):'';
    listEl.querySelectorAll('button').forEach(b=>{
      b.onclick=function(e){e.stopPropagation();zoomBarcode(b.dataset.code,codes,meta,nav);};
    });
  }
  zoomNavState=nav||null;
  if(navEl){
    navEl.style.display=(nav&&Array.isArray(nav.ids)&&nav.ids.length>1)?'flex':'none';
    if(prevBtn){prevBtn.disabled=!nav||!nav.canPrev;prevBtn.textContent=(nav&&nav.kind==='hh11')?'← Предыдущий товар':'← Предыдущий';}
    if(nextBtn){nextBtn.disabled=!nav||!nav.canNext;nextBtn.textContent=(nav&&nav.kind==='hh11')?'Следующий товар →':'Следующий →';}
  }
  ov.style.display='flex';
  if(nav&&nav.fullscreen){
    try{ if(ov.requestFullscreen && !document.fullscreenElement) ov.requestFullscreen().catch(()=>{}); }catch(e){}
    try{ if(screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(()=>{}); }catch(e){}
  }
}
function zoomNavMove(dir){
  if(!zoomNavState || zoomNavState.kind!=='hh11')return;
  const ids=zoomNavState.ids||[];
  const idx=ids.indexOf(zoomNavState.currentId);
  const next=ids[idx+dir];
  if(next!==undefined)hh11ZoomPlacement(next);
}
function closeZoom(){
  const ov=document.getElementById('bc-zoom');
  if(ov){ov.style.display='none';ov.classList.remove('compact','placement');}
  zoomNavState=null;
  try{ if(document.fullscreenElement) document.exitFullscreen().catch(()=>{}); }catch(e){}
  try{ if(screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); }catch(e){}
}
function clearEORange(){
  if(!confirm('Очистить сохранённый диапазон?'))return;
  try{
    localStorage.removeItem('eo_range_saved');
    localStorage.removeItem('eo_range_used');
  }catch(e){}
  set('eo_range_saved',[]);
  set('eo_range_used',{});
  eoRangeFilter='all';
  document.querySelectorAll('#eo-filter-bar .cell-chip').forEach(b=>b.classList.toggle('active', b.dataset.eofilter==='all'));
  const from=document.getElementById('eo-range-from');
  const to=document.getElementById('eo-range-to');
  if(from)from.value='';
  if(to)to.value='';
  const box=document.getElementById('eo-range-list');
  if(box)box.innerHTML='';
  renderEORange();
}
function renderEO(){
  const el=document.getElementById('eo-list');const codes=getEOCodes();
  if(!codes.length){el.innerHTML='<div class="no-results">Нет штрихкодов</div>';return;}
  el.innerHTML=codes.map((c,idx)=>'<div class="paper-card"><div class="pc-title" style="font-size:18px;">'+c.code+'</div><canvas class="pc-canvas" id="eoc-'+idx+'"></canvas><div class="pc-actions"><button class="pc-btn" onclick="editEOCode('+c.id+')">✏ изменить</button><button class="pc-btn del" onclick="delEOCode('+c.id+')">🗑 удалить</button></div></div>').join('');
  codes.forEach((c,idx)=>{const cv=document.getElementById('eoc-'+idx);if(cv)drawBarcode(cv,c.code);});
}

// ── CREDS ──
function saveCred(){
  const title=document.getElementById('cred-title').value.trim();
  if(!title){alert('Введите название');return;}
  const creds=getCreds();
  creds.unshift({id:Date.now(),title,login:document.getElementById('cred-login').value.trim(),password:document.getElementById('cred-password').value.trim(),barcode:document.getElementById('cred-bc').value.trim(),note:document.getElementById('cred-note').value.trim()});
  set('credentials',creds);closeModal('cred-modal');
  ['cred-title','cred-login','cred-password','cred-bc','cred-note'].forEach(id=>document.getElementById(id).value='');
  renderCreds();
}
function delCred(id){if(!confirm('Удалить доступ?'))return;set('credentials',getCreds().filter(c=>c.id!==id));renderCreds();}
function pasteInto(id){
  const el=document.getElementById(id);
  if(navigator.clipboard&&navigator.clipboard.readText){
    navigator.clipboard.readText().then(t=>{
      el.value=(t||'').trim();
      el.focus();
    }).catch(()=>{
      el.focus();alert('Не удалось прочитать буфер. Вставьте вручную (долгое нажатие → Вставить).');
    });
  }else{
    el.focus();alert('Вставьте вручную: долгое нажатие в поле → Вставить.');
  }
}
function cpTxt(text,btn){
  navigator.clipboard.writeText(text).catch(()=>{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);});
  const o=btn.textContent;btn.textContent='✓';setTimeout(()=>btn.textContent=o,1000);
}
function copyText(text,btn){cpTxt(text,btn);}
function shareText(text){
  if(navigator.share){navigator.share({text:text}).catch(()=>{});}
  else{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);alert('Скопировано в буфер');}
}
function togglePw(id,btn){
  const el=document.getElementById('pw-'+id);
  if(el.dataset.shown==='1'){el.textContent='••••••••';el.dataset.shown='0';btn.textContent='👁';}
  else{el.textContent=el.dataset.val;el.dataset.shown='1';btn.textContent='🙈';}
}
function toggleQR(wrapId,text){
  const wrap=document.getElementById(wrapId);if(!wrap)return;
  wrap.classList.toggle('show');
  if(wrap.classList.contains('show')){
    const innerId=wrapId.replace('qrl-','qrl-inner-').replace('qrp-','qrp-inner-');
    const inner=document.getElementById(innerId);
    if(inner&&!inner.dataset.drawn){inner.dataset.drawn='1';try{new QRCode(inner,{text:text,width:300,height:300,colorDark:'#000',colorLight:'#fff',correctLevel:QRCode.CorrectLevel.M});}catch(e){inner.innerHTML='QR ошибка';}}
  }
}
function renderCreds(){
  const el=document.getElementById('creds-list');const creds=getCreds();
  if(!creds.length){el.innerHTML='<div class="no-results">Нет сохранённых доступов</div>';return;}
  el.innerHTML=creds.map(c=>'<div class="cred-card"><div class="cred-title">'+c.title+'</div>'+
    (c.login?'<div class="cred-row"><span class="cred-lbl">Логин</span><span class="cred-val">'+c.login+'</span><button class="cred-copy" onclick="copyText(\''+c.login.replace(/'/g,"\\'")+'\',this)">копир</button><button class="cred-copy" onclick="toggleQR(\'qrl-'+c.id+'\',\''+c.login.replace(/'/g,"\\'")+'\')">QR</button></div><div class="qr-wrap" id="qrl-'+c.id+'"><div id="qrl-inner-'+c.id+'"></div><div class="qr-lbl">'+c.login+'</div></div>':'')+
    (c.password?'<div class="cred-row"><span class="cred-lbl">Пароль</span><span class="cred-val" id="pw-'+c.id+'" data-val="'+c.password.replace(/"/g,'&quot;')+'" data-shown="0">••••••••</span><button class="cred-eye" onclick="togglePw('+c.id+',this)">👁</button><button class="cred-copy" onclick="copyText(\''+c.password.replace(/'/g,"\\'")+'\',this)">копир</button><button class="cred-copy" onclick="toggleQR(\'qrp-'+c.id+'\',\''+c.password.replace(/'/g,"\\'")+'\')">QR</button></div><div class="qr-wrap" id="qrp-'+c.id+'"><div id="qrp-inner-'+c.id+'"></div><div class="qr-lbl">••••••••</div></div>':'')+
    (c.note?'<div class="cred-row"><span class="cred-lbl">Заметка</span><span class="cred-val" style="color:var(--muted)">'+c.note+'</span></div>':'')+
    (c.barcode?'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;"><button onclick="toggleCredBC('+c.id+')" style="background:none;border:1px solid var(--border);border-radius:6px;padding:6px 13px;color:var(--muted);font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.8px;cursor:pointer;">▦ штрихкод</button><button onclick="zoomBarcode(\''+jsStr(c.barcode)+'\')" style="background:none;border:1px solid var(--border);border-radius:6px;padding:6px 13px;color:var(--gold);font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.8px;cursor:pointer;">⤢ на экран</button></div><div class="qr-wrap" id="bcw-'+c.id+'" data-code="'+escHtml(c.barcode)+'"><canvas style="max-width:100%;display:block;margin:0 auto;" id="bcc-'+c.id+'"></canvas><div class="qr-lbl">'+escHtml(c.barcode)+'</div></div>':'')+
    '<div class="cred-actions"><button class="cred-del" onclick="delCred('+c.id+')">🗑 удалить</button></div></div>').join('');
}
function toggleCredBC(id){
  const wrap=document.getElementById('bcw-'+id);wrap.classList.toggle('show');
  if(wrap.classList.contains('show')){const c=document.getElementById('bcc-'+id);const code=wrap.dataset.code;if(c&&code&&!c.dataset.drawn){drawBarcode(c,code);c.dataset.drawn='1';}}
}

// ── CALC ──
let calcProdUt='';
function calcProdSearch(q){
  showProductResults('calc-prod-results',q,'pickCalcProd','<div class="smart-empty">Не найдено в каталоге. Добавь товар во вкладке «Товары» или через HH/RK.</div>',25);
}
function savePackFromCalc(val){
  if(!calcProdUt){return;}
  const n=parseInt(val);
  if(n>0){ savePackSize(calcProdUt,n); flashPackSaved(); }
}
function flashPackSaved(){
  const ch=document.getElementById('calc-prod-chosen');
  if(!ch||ch.style.display==='none')return;
  let tag=document.getElementById('pack-saved-tag');
  if(!tag){tag=document.createElement('span');tag.id='pack-saved-tag';tag.style.cssText='margin-left:8px;font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:10px;color:var(--gold);letter-spacing:0.5px;';ch.appendChild(tag);}
  tag.textContent='✓ сохранено в карточку';
  clearTimeout(window._packT);window._packT=setTimeout(()=>{if(tag)tag.textContent='';},1500);
}
function pickCalcProd(ut,name){
  pushRecentProduct(ut);
  calcProdUt=ut;
  document.getElementById('calc-prod-results').style.display='none';
  document.getElementById('calc-prod-search').value='';
  const ps=getPackSizes()[ut]||'';
  const chosen=document.getElementById('calc-prod-chosen');
  chosen.style.display='block';
  chosen.innerHTML='<b style="color:var(--gold);">'+ut+'</b><br>'+name+'<button onclick="clearCalcProd()" style="float:right;background:none;border:none;color:var(--red-bright);font-size:14px;cursor:pointer;">✕</button>';
  if(ps){const pb=document.getElementById('calc-per-box');if(pb)pb.value=ps;doCalc();}
}
function calcNum(id, clearNeg=false){
  const el=document.getElementById(id);
  if(!el)return 0;
  let v=parseInt(el.value);
  if(!Number.isFinite(v))v=0;
  if(v<0){
    v=0;
    if(clearNeg)el.value='';
  }
  return v;
}
function clearCalcProd(){
  calcProdUt='';
  const chosen=document.getElementById('calc-prod-chosen');
  if(chosen)chosen.style.display='none';
  const pb=document.getElementById('calc-per-box');
  if(pb)pb.value='';
}
function doCalc(){
  const perBox=calcNum('calc-per-box', true);
  const boxes=calcNum('calc-boxes-main', true);
  const loose=calcNum('calc-extra-pcs', true);
  const layoutBoxes = (typeof getLayoutBoxesTotal === 'function') ? getLayoutBoxesTotal() : 0;
  const layoutLoose = (typeof getLayoutPiecesTotal === 'function') ? getLayoutPiecesTotal() : 0;
  // Связанный итог: обычные коробки + конструктор, обычная россыпь + конструктор.
  // Конструктор больше не надо переносить отдельной кнопкой: он сразу входит в факт.
  let total=(boxes+layoutBoxes)*(perBox||1)+(loose+layoutLoose);
  if(total<0)total=0;
  const mainRes=document.getElementById('calc-result');
  if(mainRes)mainRes.textContent=total;
  const topRes=document.getElementById('calc-result-top');
  if(topRes)topRes.textContent=total;
  const formula='Коробки '+boxes+' + схема '+layoutBoxes+' → '+(boxes+layoutBoxes)+'; штуки '+loose+' + схема '+layoutLoose+' → '+(loose+layoutLoose)+'; шт/короб '+(perBox||1);
  const hint=document.getElementById('calc-linked-formula');
  if(hint)hint.textContent='Формула: ('+boxes+' + '+layoutBoxes+') × '+(perBox||1)+' + ('+loose+' + '+layoutLoose+') = '+total;
  const topFormula=document.getElementById('calc-formula-top');
  if(topFormula)topFormula.textContent=formula;
  const mini=document.getElementById('calc-result-mini');
  if(mini)mini.textContent='К записи: '+total;
  // расхождение с системой
  const sysEl=document.getElementById('calc-sys');
  const wrap=document.getElementById('calc-diff-wrap');
  if(sysEl&&sysEl.value!==''){
    let sys=parseInt(sysEl.value);
    if(!Number.isFinite(sys)||sys<0){sys=0;if(parseInt(sysEl.value)<0)sysEl.value='';}
    const d=total-sys;
    const el=document.getElementById('calc-diff');
    el.textContent=(d>0?'+':'')+d;
    el.style.color = d===0?'var(--ok)':(d>0?'var(--warn)':'var(--red)');
    wrap.style.display='block';
  }else{
    wrap.style.display='none';
  }
  // обновить раскладку (служебно)
  updateLayoutTotal();
  try{if(typeof wmsRenderQuickCalc==='function')wmsRenderQuickCalc();}catch(e){}
}
// ── БЫСТРЫЙ СЧЁТ (тест): компактный пересчёт поверх тех же полей ──
function qcStep(id,delta){ if(typeof stepField==='function')stepField(id,delta); }
function qcAddRow(){ if(typeof addRowToBoxes==='function')addRowToBoxes(); }
function qcSetPerBox(v){ const el=document.getElementById('calc-per-box'); if(el)el.value=v; try{if(typeof savePackFromCalc==='function')savePackFromCalc(v);}catch(e){} doCalc(); }
function qcSetSys(v){ const el=document.getElementById('calc-sys'); if(el)el.value=v; doCalc(); }
function wmsRenderQuickCalc(){
  const g=id=>document.getElementById(id);
  const boxes=g('calc-boxes-main'), pcs=g('calc-extra-pcs'), per=g('calc-per-box'), sys=g('calc-sys');
  const qb=g('qc-boxes'), qp=g('qc-pcs'), qf=g('qc-fact'), qform=g('qc-formula'), qper=g('qc-perbox'), qsys=g('qc-sys');
  if(qb&&boxes)qb.textContent=parseInt(boxes.value)||0;
  if(qp&&pcs)qp.textContent=parseInt(pcs.value)||0;
  const factEl=g('calc-result-top')||g('calc-result');
  if(qf&&factEl)qf.textContent=factEl.textContent||'0';
  if(qform){const f=g('calc-formula-top');qform.textContent=f?f.textContent:'';}
  if(qper&&per&&document.activeElement!==qper)qper.value=per.value;
  if(qsys&&sys&&document.activeElement!==qsys)qsys.value=sys.value;
  // разница с системой
  const qd=g('qc-diff');
  if(qd){
    const total=parseInt((factEl&&factEl.textContent)||'0')||0;
    const s=sys&&sys.value!==''?(parseInt(sys.value)||0):null;
    if(s===null){qd.textContent='';}
    else{const dd=total-s;qd.textContent='сист '+s+' ('+(dd>0?'+':'')+dd+')';qd.style.color=dd===0?'var(--ok)':(dd>0?'var(--warn)':'var(--red)');}
  }
}
window.qcStep=qcStep;window.qcAddRow=qcAddRow;window.qcSetPerBox=qcSetPerBox;window.qcSetSys=qcSetSys;window.wmsRenderQuickCalc=wmsRenderQuickCalc;
let layoutManual=0; // оставлено для совместимости старых быстрых добавлений
let palletPieces=[]; // {id, mode, name, qty, unit, sign, formula}
let layoutHistory=[];
let palletPieceId=1;
let layoutMode='block';
function togglePalletHelp(){
  const h=document.getElementById('pallet-help');
  if(h)h.style.display=h.style.display==='none'?'block':'none';
}
function sumIntoField(targetId, addId, cb){
  const target=document.getElementById(targetId);
  const add=document.getElementById(addId);
  if(!target||!add)return;
  const cur=parseInt(target.value)||0;
  const inc=parseInt(add.value)||0;
  if(!inc)return;
  target.value=cur+inc;
  add.value='';
  if(typeof cb==='function')cb();
}
function reportAddFromInput(idx){
  const add=document.getElementById('report-add-'+idx);
  if(!add)return;
  const val=parseInt(add.value)||0;
  if(!val)return;
  reportAddQty(idx,val);
}
function layoutNum(id, def=0){
  const el=document.getElementById(id);
  if(!el)return def;
  let v=parseInt(el.value);
  if(!Number.isFinite(v))v=def;
  if(v<0){v=0;el.value='';}
  return v;
}
function signedLayoutNum(id){
  const el=document.getElementById(id);
  if(!el)return 0;
  let v=parseInt(el.value);
  return Number.isFinite(v)?v:0;
}
function toggleMainCalc(){
  const body=document.getElementById('main-calc-fields');
  const btn=document.querySelector('.main-calc-toggle');
  if(!body)return;
  const collapsed=body.classList.toggle('collapsed');
  if(btn)btn.textContent=(collapsed?'▸':'▾')+' Ручной ввод';
}
function modeTitle(mode){
  return ({block:'3D схема', cut:'Убрать блок', tray:'Лотки', loose:'Отдельно', openbox:'Открытая', bag:'Ручной', layer:'Слой', ignore:'Не считать', adjust:'Поправка'}[mode]||'3D схема');
}
function chooseLayoutMode(mode){
  layoutMode=mode;
  ['block','cut','tray','loose','openbox','bag','layer','ignore'].forEach(m=>{
    const b=document.getElementById('lm-'+m);
    if(b){b.style.background=m===mode?'var(--gold-dim)':'';b.style.color=m===mode?'#fff':'';}
  });
  const f3=document.getElementById('piece-fields-3d');
  const fl=document.getElementById('piece-fields-layer');
  const fo=document.getElementById('piece-fields-loose');
  const ob=document.getElementById('piece-fields-openbox');
  const ig=document.getElementById('piece-fields-ignore');
  if(f3)f3.style.display=(mode==='loose'||mode==='layer'||mode==='openbox'||mode==='ignore')?'none':'grid';
  if(fl)fl.style.display=mode==='layer'?'block':'none';
  if(fo)fo.style.display=(mode==='loose'||mode==='bag')?'block':'none';
  if(ob)ob.style.display=mode==='openbox'?'block':'none';
  if(ig)ig.style.display=mode==='ignore'?'block':'none';
  const a=document.getElementById('pa-lbl'),b=document.getElementById('pb-lbl'),c=document.getElementById('pc-lbl');
  if(a&&b&&c){
    if(mode==='grid'){a.textContent='Ширина';b.textContent='Глубина';c.textContent='Высота';}
    else if(mode==='tray'){a.textContent='Ширина';b.textContent='Глубина';c.textContent='Высота';}
    else if(mode==='bag'){a.textContent='Ширина';b.textContent='Глубина';c.textContent='Высота';}
    else {a.textContent='Ширина';b.textContent='Глубина';c.textContent='Высота';}
  }
  const name=document.getElementById('piece-name');
  if(name&&!name.value){
    name.placeholder=mode==='cut'?'выемка / пустой угол':mode==='tray'?'лотки / основа':mode==='openbox'?'открытая коробка / неполный короб':mode==='bag'?'мешки / сетки / картошка':mode==='ignore'?'чужой товар / не считать':'основа / верх / хвост';
  }
  updatePiecePreview(false);
}
function pieceCalc(){
  let qty=0, unit='box', sign=1, formula='', name=(document.getElementById('piece-name')?.value||'').trim();
  if(layoutMode==='loose'){
    qty=layoutNum('piece-loose',0); formula='+'+qty; unit='box'; sign=1; if(!name)name='доброс';
  }else if(layoutMode==='bag'){
    qty=layoutNum('piece-loose',0); formula='ручной +'+qty; unit='piece'; sign=1; if(!name)name='мешки/сетки';
  }else if(layoutMode==='openbox'){
    const boxes=layoutNum('openbox-boxes',0);
    const pcs=layoutNum('openbox-pieces',0);
    if(pcs>0){qty=pcs; unit='piece'; formula=pcs+' шт. внутри';}
    else {qty=boxes||1; unit='box'; formula=(boxes||1)+' место';}
    sign=1; if(!name)name='открытая коробка';
  }else if(layoutMode==='ignore'){
    qty=0; unit='box'; sign=1; formula='не входит в итог'; if(!name)name='чужой товар';
  }else if(layoutMode==='layer'){
    const parts=[];
    ['layer-part-a','layer-part-b','layer-part-c','layer-part-d'].forEach(id=>{const v=layoutNum(id,0);if(v>0)parts.push(v);});
    const rep=Math.max(1,layoutNum('layer-repeat',1));
    const one=parts.reduce((a,b)=>a+b,0);
    qty=one*rep; formula=(parts.length?parts.join('+'):'0')+' × '+rep; unit='box'; sign=1; if(!name)name='слой';
  }else{
    const a=layoutNum('piece-a',0), b=layoutNum('piece-b',0), c=Math.max(1,layoutNum('piece-c',1));
    qty=a*b*c; formula=a+'×'+b+'×'+c;
    unit=(layoutMode==='grid')?'piece':'box';
    sign=(layoutMode==='cut')?-1:1;
    if(!name)name=layoutMode==='cut'?'выемка':layoutMode==='tray'?'лотки':layoutMode==='grid'?'сетка штук':'основа';
  }
  const corrBox=(layoutMode==='ignore')?0:(layoutNum('corr-box-plus',0)-layoutNum('corr-box-minus',0));
  const corrPiece=(layoutMode==='ignore')?0:(layoutNum('corr-piece-plus',0)-layoutNum('corr-piece-minus',0));
  const baseBoxes=(unit==='box'&&layoutMode!=='ignore')?sign*qty:0;
  const basePieces=(unit==='piece'&&layoutMode!=='ignore')?sign*qty:0;
  const boxesDelta=baseBoxes+corrBox;
  const piecesDelta=basePieces+corrPiece;
  let corrTxt=[];
  if(corrBox>0)corrTxt.push('мест +'+corrBox);
  if(corrBox<0)corrTxt.push('мест '+corrBox);
  if(corrPiece>0)corrTxt.push('шт +'+corrPiece);
  if(corrPiece<0)corrTxt.push('шт '+corrPiece);
  if(corrTxt.length)formula+='; '+corrTxt.join(', ');
  return {mode:layoutMode,name,qty,unit,sign,formula, corrBox, corrPiece, boxesDelta, piecesDelta};
}
function hasPieceDraft(){
  const val=id=>(document.getElementById(id)?.value||'').trim();
  if(val('corr-box-plus')||val('corr-box-minus')||val('corr-piece-plus')||val('corr-piece-minus'))return true;
  if(layoutMode==='layer')return !!(val('layer-part-a')||val('layer-part-b')||val('layer-part-c'));
  if(layoutMode==='loose'||layoutMode==='bag')return !!val('piece-loose');
  if(layoutMode==='openbox')return !!(val('openbox-boxes')||val('openbox-pieces'));
  if(layoutMode==='ignore')return !!val('piece-name');
  return !!(val('piece-a')||val('piece-b'));
}
function updatePiecePreview(validate=true){
  const el=document.getElementById('piece-preview');
  if(!el)return;
  const p=pieceCalc();
  const parts=[];
  if(p.boxesDelta)parts.push(p.boxesDelta+' мест');
  if(p.piecesDelta)parts.push(p.piecesDelta+' шт.');
  const out=parts.length?parts.join(' + '):'0';
  el.textContent=(p.mode==='ignore'?'○ ':(p.sign<0?'− ':'+ '))+modeTitle(p.mode)+': '+p.formula+(p.mode==='ignore'?'':' = '+out);
  if(validate)updateLayoutTotal();
}
function addLoosePreset(n){
  const el=document.getElementById('piece-loose');
  if(!el)return;
  el.value=(layoutNum('piece-loose',0)+n);
  updatePiecePreview();
}
function setLayerTemplate(a,b,c,d){
  const vals=[a,b,c,d];
  ['layer-part-a','layer-part-b','layer-part-c','layer-part-d'].forEach((id,i)=>{const el=document.getElementById(id);if(el)el.value=vals[i]||'';});
  const r=document.getElementById('layer-repeat');if(r&&!r.value)r.value='1';
  chooseLayoutMode('layer');
  updatePiecePreview();
}
function addPalletPiece(){
  const p=pieceCalc();
  if(!p.boxesDelta && !p.piecesDelta && p.mode!=='ignore'){alert('В куске получилось 0');return;}
  const ids=[];
  function pushPiece(obj){ obj.id=palletPieceId++; palletPieces.push(obj); ids.push(obj.id); }
  if(p.mode==='ignore'){
    pushPiece({...p, qty:0, unit:'box', sign:1});
  }else{
    if(p.qty){ pushPiece({...p, corrBox:0, corrPiece:0}); }
    if(p.corrBox){ pushPiece({mode:'adjust', name:'поправка к '+p.name, qty:Math.abs(p.corrBox), unit:'box', sign:p.corrBox>0?1:-1, formula:(p.corrBox>0?'+':'')+p.corrBox+' мест'}); }
    if(p.corrPiece){ pushPiece({mode:'adjust', name:'поправка к '+p.name, qty:Math.abs(p.corrPiece), unit:'piece', sign:p.corrPiece>0?1:-1, formula:(p.corrPiece>0?'+':'')+p.corrPiece+' шт.'}); }
  }
  layoutHistory.push({type:'piece', ids});
  clearPieceForm();
  renderPalletPieces();
  updateLayoutTotal();
}
function clearPieceForm(options){
  options = options || {};
  ['piece-name','piece-a','piece-b','piece-c','piece-loose','openbox-boxes','openbox-pieces','layer-part-a','layer-part-b','layer-part-c','layer-part-d','corr-box-plus','corr-box-minus','corr-piece-plus','corr-piece-minus','corr-box-plus-add','corr-box-minus-add','corr-piece-plus-add','corr-piece-minus-add'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const c=document.getElementById('piece-c');if(c)c.value='1';
  const r=document.getElementById('layer-repeat');if(r)r.value='1';
  if(options.silent){
    const el=document.getElementById('piece-preview');
    if(el)el.textContent='+ '+modeTitle(layoutMode||'block')+': 0 = 0';
  }else{
    updatePiecePreview();
  }
}
function removePalletPiece(id){
  palletPieces=palletPieces.filter(p=>p.id!==id);
  layoutHistory=layoutHistory.filter(h=>!(h&&h.type==='piece'&&h.id===id));
  renderPalletPieces();
  updateLayoutTotal();
}
function renderPalletPieces(){
  const box=document.getElementById('pallet-piece-list');
  if(!box)return;
  if(!palletPieces.length){box.innerHTML='';box.style.display='none';return;}
  box.style.display='block';
  box.innerHTML='<div style="font-family:-apple-system,Segoe UI,Roboto,Inter,system-ui,sans-serif;font-size:10px;color:var(--muted);letter-spacing:0.8px;margin-bottom:6px;">Как посчитано</div>'+palletPieces.map(p=>{
    const val=p.sign*p.qty;
    const unit=p.unit==='piece'?'шт.':'мест';
    const color=p.sign<0?'var(--red-bright)':(p.mode==='ignore'?'var(--muted)':'var(--gold)');
    return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:6px;display:flex;gap:8px;align-items:center;">'+
      '<div style="flex:1;min-width:0;">'+
        '<div style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:10px;color:var(--muted);letter-spacing:0.8px;">'+(p.mode==='ignore'?'○ ':(p.sign<0?'− ':'+ '))+modeTitle(p.mode)+'</div>'+ 
        '<div style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:var(--text);">'+escHtml(p.formula)+(p.mode==='ignore'?'':' = <b style="color:'+color+';">'+val+'</b> '+unit)+'</div>'+ 
      '</div>'+ 
      '<button onclick="removePalletPiece('+p.id+')" style="background:none;border:1px solid var(--red);border-radius:6px;padding:4px 9px;color:var(--red-bright);font-size:13px;cursor:pointer;">✕</button>'+ 
    '</div>';
  }).join('');
}
function updateLayoutTotal(){
  let boxes=palletPieces.filter(p=>p.unit==='box').reduce((sum,p)=>sum+p.sign*p.qty,0);
  let pieces=palletPieces.filter(p=>p.unit==='piece').reduce((sum,p)=>sum+p.sign*p.qty,0);
  // Черновик тоже считается сразу, чтобы цифры менялись прямо при вводе.
  if(hasPieceDraft()){
    const d=pieceCalc();
    if(d.mode!=='ignore'){
      boxes+=d.boxesDelta||0;
      pieces+=d.piecesDelta||0;
    }
  }
  if(boxes<0)boxes=0;
  if(pieces<0)pieces=0;
  const el=document.getElementById('calc-boxes-total'); if(el)el.textContent=boxes;
  const ep=document.getElementById('calc-pieces-total'); if(ep)ep.textContent=pieces;
  renderPalletPieces();
  if(!window.__layoutUpdatingFact){
    window.__layoutUpdatingFact=true;
    try{doCalc();}finally{window.__layoutUpdatingFact=false;}
  }
  return boxes;
}
function getLayoutBoxesTotal(){
  let boxes=palletPieces.filter(p=>p.unit==='box').reduce((sum,p)=>sum+p.sign*p.qty,0);
  if(hasPieceDraft()){
    const d=pieceCalc();
    if(d.mode!=='ignore')boxes+=d.boxesDelta||0;
  }
  return boxes<0?0:boxes;
}
function getLayoutPiecesTotal(){
  let pieces=palletPieces.filter(p=>p.unit==='piece').reduce((sum,p)=>sum+p.sign*p.qty,0);
  if(hasPieceDraft()){
    const d=pieceCalc();
    if(d.mode!=='ignore')pieces+=d.piecesDelta||0;
  }
  return pieces<0?0:pieces;
}
function addLayoutQuick(n,label){
  const p={id:palletPieceId++, mode:'loose', name:label||'доброс', qty:n, unit:'box', sign:1, formula:'+'+n};
  palletPieces.push(p);
  layoutHistory.push({type:'piece', id:p.id});
  renderPalletPieces();
  updateLayoutTotal();
}
function undoLayout(){
  const last=layoutHistory.pop();
  if(!last)return;
  if(last.type==='piece'){const ids=last.ids||[last.id];palletPieces=palletPieces.filter(p=>!ids.includes(p.id));}
  renderPalletPieces();
  updateLayoutTotal();
}
function clearLayoutManual(){
  palletPieces=palletPieces.filter(p=>p.mode!=='loose');
  layoutHistory=layoutHistory.filter(h=>!palletPieces.find(p=>p.id===h.id&&p.mode==='loose'));
  updateLayoutTotal();
}
function renderLayoutManual(){}
function clearLayout(options){
  options = options || {};
  const rows=document.getElementById('calc-blocks-rows');
  if(rows)rows.innerHTML='';
  layoutManual=0;
  palletPieces=[];
  layoutHistory=[];
  if(options.clearDraft !== false){
    clearPieceForm({silent:true});
  }
  renderPalletPieces();
  updateLayoutTotal();
  doCalc();
}
function stepField(id,delta){
  const el=document.getElementById(id);
  let v=calcNum(id, true);
  v+=delta; if(v<0)v=0;
  el.value=v;
  doCalc();
}
function addRowToBoxes(){
  const rs=calcNum('calc-row-size', true);
  if(!rs){alert('Укажи размер ряда (коробок)');return;}
  stepField('calc-boxes-main', rs);
}
function showLayoutLinkedNotice(){
  alert('Схема уже входит в факт.');
}
function applyLayoutToBoxes(){ showLayoutLinkedNotice(); }
function applyLayoutToPieces(){ showLayoutLinkedNotice(); }
function toggleLayout(){
  const p=document.getElementById('layout-panel');
  p.style.display = p.style.display==='none'?'block':'none';
  if(p.style.display==='block')chooseLayoutMode(layoutMode||'block');
}
let blkCounter=0;
function addBlockRow(){
  chooseLayoutMode('block');
  const a=document.getElementById('piece-a');
  const b=document.getElementById('piece-b');
  const c=document.getElementById('piece-c');
  if(a&&!a.value)a.focus();
  if(c&&!c.value)c.value='1';
  updatePiecePreview();
}
function addToField(fieldId, addId){
  const f=document.getElementById(fieldId);
  const a=document.getElementById(addId);
  const cur=parseInt(f.value)||0;
  let add=parseInt(a.value)||0;
  if(add<0){add=0;a.value='';}
  if(!add)return;
  f.value=cur+add;
  a.value='';
  doCalc();
}
function copyCalcResult(btn){cpTxt(document.getElementById('calc-result').textContent,btn);}
function resetCalc(){
  ['calc-boxes-main','calc-extra-pcs','calc-per-box','calc-sys'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  clearLayout();
  document.getElementById('calc-result').textContent='0';
  document.getElementById('calc-diff-wrap').style.display='none';
  clearCalcProd();
}

// ── JOURNAL ──
const getJournal = () => get('journal');
// ── INVENTORY: накопление товаров в текущей ячейке ──
let cellBuffer = []; // {prod, qty}
function cellPrefix(p){const el=document.getElementById('calc-cell');el.value=p;el.focus();calcCellSearch(p);}
function allCellsList(){
  // BRAK (предзаданные) + пользовательские ячейки
  const fromBrak=BRAK.map(b=>({addr:b.cell,name:b.name,code:b.barcode}));
  const fromUser=getCells().map(c=>({addr:c.addr,name:c.name,code:c.code}));
  return [...fromBrak,...fromUser];
}
function calcCellInput(el){
  // фильтр символов как раньше + поиск
  invCellFilter(el);
  calcCellSearch(el.value);
  // спрятать превью ШК пока редактируют
  document.getElementById('calc-cell-bc').style.display='none';
}
function calcCellSearch(q){
  const box=document.getElementById('calc-cell-results');
  if(!box)return;
  q=(q||'').trim().toUpperCase();
  const all=allCellsList();
  let res = q ? all.filter(c=>c.addr.toUpperCase().includes(q)||(c.name||'').toUpperCase().includes(q)||String(c.code||'').toUpperCase().includes(q)) : all;
  res=res.slice(0,30);
  if(!res.length){box.style.display='none';return;}
  box.innerHTML=res.map(c=>{
    const a=c.addr.replace(/'/g,"\\'");
    const code=(c.code||'').replace(/'/g,"\\'");
    return '<div onclick="pickCalcCell(\''+a+'\',\''+code+'\')" style="padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer;"><div style="font-family:\'JetBrains Mono\',monospace;font-size:13px;font-weight:700;color:var(--gold);">'+c.addr+'</div>'+(c.name?'<div style="font-size:11px;color:var(--muted);">'+c.name+'</div>':'')+(c.code?'<div style="font-family:\'JetBrains Mono\',monospace;font-size:10px;color:var(--muted);margin-top:2px;">код: '+c.code+'</div>':'')+'</div>';
  }).join('');
  box.style.display='block';
}
function pickCalcCell(addr, code){
  document.getElementById('calc-cell').value=addr;
  document.getElementById('calc-cell-results').style.display='none';
  // показать штрихкод ячейки если есть код
  const wrap=document.getElementById('calc-cell-bc');
  if(code){
    const cv=document.getElementById('calc-cell-bc-canvas');
    drawBarcode(cv,code);
    document.getElementById('calc-cell-bc-code').textContent='код: '+code;
    wrap.style.display='block';
  }else{
    wrap.style.display='none';
  }
}
function normCellKey(v){return String(v||'').trim().toUpperCase();}
function findCellByAddrOrCode(value){
  const q=normCellKey(value);
  if(!q)return null;
  return allCellsList().find(c=>normCellKey(c.addr)===q || normCellKey(c.code)===q) || null;
}
function createCellRecordFromCalc(addr,name,code){
  const rec={addr:normCellKey(addr),name:String(name||'').trim(),code:String(code||'').trim(),id:Date.now()+Math.floor(Math.random()*1000)};
  const cells=getCells();
  cells.unshift(rec);
  set('cells',normalizeCellsArray(cells));
  repairCellsStorage();
  try{renderCells();}catch(e){}
  try{calcCellSearch(document.getElementById('calc-cell').value);}catch(e){}
  return rec;
}
function ensureCalcCellExists(raw, opts){
  opts=opts||{};
  raw=normCellKey(raw);
  if(!raw){if(!opts.silent)alert('Введите или отсканируйте ячейку');return null;}
  const existing=findCellByAddrOrCode(raw);
  if(existing){
    if(!opts.silent){pickCalcCell(existing.addr,existing.code||'');alert('Ячейка уже есть в справочнике');}
    return existing;
  }
  let addr='', code='', name='';
  if(/^\d{4,}$/.test(raw)){
    code=raw;
    if(opts.silent){addr=raw;name='Создано из счёта';}
    else{
      addr=prompt('Название ячейки для этого кода/ШК:', '') || '';
      if(!addr)return null;
      name=prompt('Описание ячейки (можно пусто):', 'Создано из счёта') || 'Создано из счёта';
    }
  }else{
    addr=raw;
    if(opts.silent){code=raw;name='Создано из счёта';}
    else{
      code=prompt('Код/ШК ячейки. Можно оставить пустым — тогда кодом будет название ячейки:', '') || raw;
      name=prompt('Описание ячейки (можно пусто):', 'Создано из счёта') || 'Создано из счёта';
    }
  }
  const rec=createCellRecordFromCalc(addr,name,code);
  pickCalcCell(rec.addr,rec.code||'');
  if(!opts.silent)alert('Ячейка создана и добавлена во вкладку «Ячейки»');
  return rec;
}
function createCalcCellFromInput(ev){
  if(ev)ev.preventDefault();
  const el=document.getElementById('calc-cell');
  ensureCalcCellExists(el?el.value:'',{silent:false});
}
function addToCell(ev){
  const total=parseInt(document.getElementById('calc-result').textContent)||0;
  if(!total){alert('Сначала посчитайте количество');return;}
  let prod='';
  if(calcProdUt){
    const all=[...getCustomItems(),...CATALOG];
    const it=all.find(i=>i.ut===calcProdUt);
    if(it)prod=it.name;
  }
  if(!prod)prod='Товар '+(cellBuffer.length+1);
  const sysEl=document.getElementById('calc-sys');
  const sysVal=sysEl&&sysEl.value!==''?parseInt(sysEl.value):null;
  cellBuffer.push({prod,qty:total,sys:sysVal});
  if(sysEl)sysEl.value='';
  renderCellItems();
  // reset count fields for next product but keep cell
  ['calc-boxes-main','calc-extra-pcs'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  clearLayout();
  clearCalcProd();
  doCalc();
  const b=ev.target;const o=b.textContent;b.textContent='✓ добавлен';setTimeout(()=>b.textContent=o,1000);
}
// последняя записанная ячейка/товар для «Повторить»
let lastRecord=null;
function counterRecord(ev){
  const total=parseInt(document.getElementById('calc-result').textContent)||0;
  if(!total){alert('Сначала посчитай количество');return;}
  // предупреждение при большом расхождении
  const sysEl=document.getElementById('calc-sys');
  if(sysEl&&sysEl.value!==''){
    const sys=parseInt(sysEl.value)||0;
    const d=Math.abs(total-sys);
    const ratio=sys>0?d/sys:1;
    if(d>=20 && ratio>=0.1){
      if(!confirm('Большое расхождение: факт '+total+', система '+sys+' ('+(total-sys>0?'+':'')+(total-sys)+'). Записать?'))return;
    }
  }
  // запоминаем для повтора
  if(calcProdUt){lastRecord={ut:calcProdUt};}
  if(navigator.vibrate)navigator.vibrate(120);
  addToCell(ev);
}
function nextCell(){
  // зафиксировать ячейку (если есть товары) и подготовить к следующей
  if(cellBuffer.length){commitCell({target:document.createElement('button')});}
  document.getElementById('calc-cell').value='';
  document.getElementById('calc-cell-bc').style.display='none';
  ['calc-boxes-main','calc-extra-pcs','calc-sys'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  clearLayout();
  clearCalcProd();
  doCalc();
  document.getElementById('calc-cell').focus();
}
function repeatLast(){
  if(lastRecord&&lastRecord.ut){
    const all=[...getCustomItems(),...CATALOG];
    const it=all.find(i=>i.ut===lastRecord.ut);
    if(it){pickCalcProd(it.ut,it.name);}
  }
  document.getElementById('calc-boxes-main').value='';
  document.getElementById('calc-extra-pcs').value='';
  document.getElementById('calc-boxes-main').focus();
  doCalc();
}
function delCellItem(idx){cellBuffer.splice(idx,1);renderCellItems();}
function renderCellItems(){
  try{if(typeof wmsRenderCalcFromCellBanner==='function')wmsRenderCalcFromCellBanner();}catch(e){}
  const box=document.getElementById('calc-cell-items');
  if(!box)return;
  if(!cellBuffer.length){box.innerHTML='';return;}
  let h='<div style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:10px;color:var(--muted);letter-spacing:1px;margin-bottom:6px;">Товары в ячейке:</div>';
  cellBuffer.forEach((it,idx)=>{
    let diffHtml='';
    if(it.sys!=null){
      const d=it.qty-it.sys;
      const col=d===0?'var(--ok)':(d>0?'var(--warn)':'var(--red)');
      const sign=d>0?'+':'';
      diffHtml='<div style="font-size:10px;color:'+col+';white-space:nowrap;">сист '+it.sys+' ('+sign+d+')</div>';
    }
    h+='<div style="display:flex;align-items:center;gap:8px;background:var(--bg2);border-radius:6px;padding:7px 10px;margin-bottom:5px;">'+
      '<div style="flex:1;min-width:0;font-size:12px;color:var(--text);">'+it.prod+(diffHtml?'<br>'+diffHtml:'')+'</div>'+
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:14px;font-weight:700;color:var(--gold);">'+it.qty+'</div>'+
      '<button onclick="delCellItem('+idx+')" style="background:none;border:none;color:var(--red-bright);font-size:13px;cursor:pointer;">✕</button>'+
    '</div>';
  });
  const sum=cellBuffer.reduce((s,i)=>s+i.qty,0);
  h+='<button onclick="commitCell(event)" class="add-btn" style="width:100%;margin-top:8px;">Записать ячейку ('+sum+')</button>';
  box.innerHTML=h;
}
function commitCell(ev){
  const rawCell=document.getElementById('calc-cell').value.trim().toUpperCase();
  const cell=rawCell || 'Ячейка';
  if(!cellBuffer.length){alert('Нет товаров в ячейке');return;}
  if(rawCell && rawCell!=='ЯЧЕЙКА')ensureCalcCellExists(rawCell,{silent:true});
  const list=getInv();
  list.unshift({
    id:Date.now(),
    cell,
    items:cellBuffer.slice(),
    qty:cellBuffer.reduce((s,i)=>s+i.qty,0),
    time:new Date().toLocaleString('ru',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
  });
  set('inventory',list);
  cellBuffer=[];
  document.getElementById('calc-cell').value='';
  renderCellItems();
  renderInv();
  const b=ev.target;b.textContent='✓ ячейка записана';
}
function addJournal(){
  const total=parseInt(document.getElementById('calc-result').textContent)||0;
  if(!total){alert('Нечего записывать');return;}
  let label='';
  if(calcProdUt){
    const all=[...getCustomItems(),...CATALOG];
    const it=all.find(i=>i.ut===calcProdUt);
    if(it)label=it.ut+' · '+it.name;
  }
  const j=getJournal();
  j.unshift({id:Date.now(),total,label,time:new Date().toLocaleString('ru',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})});
  set('journal',j);
  renderJournal();
}
function delJournal(id){set('journal',getJournal().filter(r=>r.id!==id));renderJournal();}
function addToJournal(id){
  const inp=document.getElementById('jadd-'+id);
  const n=parseInt(inp.value);
  if(isNaN(n)||n===0){return;}
  const j=getJournal().map(r=>{
    if(r.id===id){let nt=r.total+n;if(nt<0)nt=0;return {...r,total:nt};}
    return r;
  });
  set('journal',j);renderJournal();
}
function clearJournal(){if(!confirm('Очистить весь журнал?'))return;set('journal',[]);renderJournal();}
function renderJournal(){
  const list=document.getElementById('journal-list');
  const acts=document.getElementById('journal-actions');
  const j=getJournal();
  const sum=j.reduce((s,r)=>s+r.total,0);
  document.getElementById('journal-total').textContent=sum;
  if(!j.length){list.innerHTML='<div class="no-results" style="padding:24px;">Журнал пуст</div>';acts.style.display='none';return;}
  acts.style.display='flex';
  list.innerHTML=j.map(r=>'<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:8px;padding:11px 13px;margin-bottom:8px;">'+
    '<div style="display:flex;align-items:center;gap:10px;">'+
      '<div style="font-family:\'Spectral\',serif;font-weight:600;font-size:20px;color:var(--gold);min-width:46px;">'+r.total+'</div>'+
      '<div style="flex:1;min-width:0;"><div style="font-size:12px;color:var(--text);">'+(r.label||'без товара')+'</div><div style="font-size:10px;color:var(--faint);">'+r.time+'</div></div>'+
      '<button onclick="delJournal('+r.id+')" style="background:none;border:none;color:var(--red-bright);font-size:14px;cursor:pointer;">✕</button>'+
    '</div>'+
    '<div style="display:flex;gap:6px;margin-top:9px;">'+
      '<input id="jadd-'+r.id+'" type="number" inputmode="numeric" placeholder="дописать N (можно −N)" style="flex:1;background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:7px 10px;font-family:\'JetBrains Mono\',monospace;font-size:14px;color:var(--paper-ink);outline:none;-webkit-appearance:none;">'+
      '<button onclick="addToJournal('+r.id+')" style="background:var(--gold);border:none;border-radius:6px;padding:7px 14px;color:var(--on-accent);font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:11px;font-weight:600;cursor:pointer;">+</button>'+
    '</div>'+
  '</div>').join('');
}
function shareJournal(){
  const j=getJournal();if(!j.length)return;
  const sum=j.reduce((s,r)=>s+r.total,0);
  let txt='ПЕРЕСЧЁТ '+new Date().toLocaleDateString('ru')+'\n\n';
  j.slice().reverse().forEach(r=>{txt+=r.total+' — '+(r.label||'без товара')+'\n';});
  txt+='\nВСЕГО: '+sum;
  shareText(txt);
}


// ── HH 1-1 BUFFER ──
const getHH11 = () => get('hh11_log');
let hh11Picked=null;
let hh11Mode='listed';
let hh11View='active';
let hh11ShowAllDates=false;
function hh11EnsureDate(){const el=document.getElementById('hh11-date');if(el&&!el.value)el.value=getStickyDate('hh11_work_date')||rkTodayISO();}
function hh11CurrentDate(){hh11EnsureDate();const el=document.getElementById('hh11-date');return el?el.value:rkTodayISO();}
function hh11OnDateChange(){hh11ShowAllDates=false;setStickyDate('hh11_work_date',hh11CurrentDate());renderHH11();}
function hh11DateShift(delta){
  hh11EnsureDate();
  const el=document.getElementById('hh11-date');if(!el)return;
  const cur=el.value||rkTodayISO();
  const d=new Date(cur+'T00:00:00');
  d.setDate(d.getDate()+delta);
  el.value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  hh11ShowAllDates=false;
  setStickyDate('hh11_work_date',el.value);
  renderHH11();
}
function hh11DateToday(){
  const el=document.getElementById('hh11-date');if(el)el.value=rkTodayISO();
  hh11ShowAllDates=false;
  setStickyDate('hh11_work_date',el?el.value:rkTodayISO());
  renderHH11();
}
function hh11ToggleAllDates(){hh11ShowAllDates=!hh11ShowAllDates;renderHH11();}
function hh11RowDate(x){
  if(x&&x.date)return x.date;
  if(x&&x.createdAtIso){const d=new Date(x.createdAtIso);if(!isNaN(d))return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  return '';
}
function hh11ScopeByDate(arr){
  if(hh11ShowAllDates)return arr;
  const d=hh11CurrentDate();
  return arr.filter(x=>hh11RowDate(x)===d);
}
function jsStr(s){return String(s??'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/[\r\n]+/g,' ');}
function hh11AllItems(){return productAllItems();}
function hh11SetMode(mode){
  hh11Mode=mode;
  const listed=document.getElementById('hh11-mode-listed');
  const found=document.getElementById('hh11-mode-found');
  if(listed)listed.classList.toggle('active',mode==='listed');
  if(found)found.classList.toggle('active',mode==='found');
  const sw=document.getElementById('hh11-system-wrap');
  if(sw)sw.style.opacity=mode==='listed'?'1':'0.35';
}
function hh11SetView(view){hh11View=view;renderHH11();}
function hh11ListQuery(){const el=document.getElementById('hh11-list-search');return el?String(el.value||''):'';}
function hh11ListSearch(){renderHH11();}
function hh11ClearListSearch(){const el=document.getElementById('hh11-list-search');if(el)el.value='';renderHH11();}
function hh11ItemSearchText(x){
  return [x.ut,x.name,x.eo,x.hu,x.handlingUnitBarcode,x.wmsStatus,x.bestBeforeDate,x.comment,x.sys,x.fact,x.mode].filter(v=>v!==undefined&&v!==null).join(' ');
}
function hh11MatchQuery(x,q){
  q=String(q||'').trim();
  if(!q)return true;
  const raw=hh11ItemSearchText(x);
  const hay=normSearchText(raw);
  const compact=String(raw).toLowerCase().replace(/[^0-9a-zа-яё]+/gi,'');
  const tokens=normSearchText(q).split(/\s+/).filter(Boolean);
  if(!tokens.length)return true;
  return tokens.every(t=>{
    const tc=String(t).toLowerCase().replace(/[^0-9a-zа-яё]+/gi,'');
    return hay.includes(t)||compact.includes(tc);
  });
}
function hh11ApplyListSearch(items){
  const q=hh11ListQuery();
  if(!String(q||'').trim())return items;
  return (items||[]).filter(x=>hh11MatchQuery(x,q));
}
function hh11UpdateSearchStatus(total,shown){
  const el=document.getElementById('hh11-list-search-status');
  if(!el)return;
  const q=hh11ListQuery().trim();
  el.textContent=q?('Показано '+shown+' из '+total+' по запросу: '+q):'';
}
function hh11ToggleNewItemForm(){
  const f=document.getElementById('hh11-new-item-form');
  if(!f)return;
  f.style.display=f.style.display==='none'||!f.style.display?'block':'none';
  if(f.style.display==='block'){const i=document.getElementById('hh11-new-ut');if(i)i.focus();}
}
function hh11SaveNewItem(){
  const utEl=document.getElementById('hh11-new-ut');
  const nameEl=document.getElementById('hh11-new-name');
  const bcEl=document.getElementById('hh11-new-bc');
  let ut=(utEl&&utEl.value||'').trim();
  const name=(nameEl&&nameEl.value||'').trim();
  const bc=(bcEl&&bcEl.value||'').trim();
  if(!name){alert('Введи наименование товара');return;}
  if(!ut)ut='CUSTOM-'+Date.now();
  const exists=hh11AllItems().find(i=>String(i.ut||'').toLowerCase()===ut.toLowerCase());
  if(exists){
    hh11Pick(exists.ut,exists.name);
    alert('Такой УТ уже есть в каталоге. Выбрал существующую позицию.');
    return;
  }
  const items=getCustomItems();
  const item={ut:ut,name:name,barcode:bc,img:'',custom:true};
  items.unshift(item);
  set('custom_items',items);
  if(bc)saveCustomBarcode(ut,bc);
  if(utEl)utEl.value=''; if(nameEl)nameEl.value=''; if(bcEl)bcEl.value='';
  const f=document.getElementById('hh11-new-item-form');if(f)f.style.display='none';
  hh11Pick(ut,name);
  if(query)doSearch(query);
}
function hh11Search(q){
  const box=document.getElementById('hh11-results');
  if(!String(q||'').trim()){if(box){box.style.display='none';box.innerHTML='';}return;}
  showProductResults('hh11-results',q,'hh11Pick','<div class="smart-empty">Не найдено в каталоге. Нажми «+ Новый» и сохрани позицию сразу сюда.</div>',30);
}
function hh11Pick(ut,name){
  pushRecentProduct(ut);
  hh11Picked={ut,name};
  const r=document.getElementById('hh11-results');if(r)r.style.display='none';
  const s=document.getElementById('hh11-search');if(s)s.value='';
  const p=document.getElementById('hh11-picked');
  if(p){p.style.display='block';p.innerHTML='<b style="color:var(--gold);">'+escHtml(ut)+'</b><br>'+escHtml(name)+'<button onclick="hh11ClearPicked()" style="float:right;background:none;border:none;color:var(--red-bright);font-size:14px;cursor:pointer;">✕</button>';}
}
function hh11ClearPicked(){hh11Picked=null;const p=document.getElementById('hh11-picked');if(p){p.style.display='none';p.innerHTML='';}}
function hh11UsedEOSet(){
  const s=new Set();
  getHH11().forEach(x=>{if(x.eo)s.add(String(x.eo));});
  const used=getObj('eo_range_used');
  Object.keys(used).forEach(k=>{if(used[k])s.add(String(k));});
  return s;
}
function hh11NextEOCode(){
  const used=hh11UsedEOSet();
  const range=get('eo_range_saved');
  for(const code of range){if(code&&!used.has(String(code)))return String(code);}
  for(const item of getEOCodes()){const code=String(item.code||'').trim();if(code&&!used.has(code))return code;}
  return '';
}
function hh11PickEOFromRange(){
  const code=hh11NextEOCode();
  if(!code){alert('Свободных ЕО нет. Создай диапазон во вкладке ЕО или впиши ЕО вручную.');return;}
  const el=document.getElementById('hh11-eo-code');
  if(el){el.value=code;el.focus();}
}
function hh11ZoomCurrentEO(){
  const el=document.getElementById('hh11-eo-code');
  const code=el?normalizeEOCode(el.value):'';
  if(el&&code)el.value=code;
  if(!code){alert('Сначала впиши или выбери ЕО');return;}
  zoomBarcode(code,null,{title:'ЕО',subtitle:code});
}
function hh11EnsureEOCode(code){
  code=normalizeEOCode(code);
  if(!code)return;
  const codes=getEOCodes();
  if(!codes.some(c=>String(c.code||'')===code)){
    codes.unshift({id:Date.now()+Math.floor(Math.random()*1000),code});
    set('eo_codes',codes);
  }
}
function hh11MarkEOUsed(code){
  code=normalizeEOCode(code);
  if(!code)return;
  const range=get('eo_range_saved').map(String);
  if(range.includes(code)){
    const used=getObj('eo_range_used');
    used[code]=1;
    set('eo_range_used',used);
  }
  hh11EnsureEOCode(code);
}
function hh11Add(){
  if(!hh11Picked){alert('Сначала выбери товар из каталога или добавь новый прямо здесь');return;}
  const eoEl=document.getElementById('hh11-eo-code');
  const sysEl=document.getElementById('hh11-system-qty');
  const factEl=document.getElementById('hh11-fact-qty');
  const cEl=document.getElementById('hh11-comment');
  const mEl=document.getElementById('hh11-mismatch');
  const eo=normalizeEOCode(eoEl&&eoEl.value||'');
  if(eoEl&&eo)eoEl.value=eo;
  const sys=Math.max(0,parseInt(sysEl&&sysEl.value)||0);
  const fact=Math.max(0,parseInt(factEl&&factEl.value)||0);
  const row=createMeta({id:Date.now()+Math.floor(Math.random()*1000),date:hh11CurrentDate(),eo:eo,ut:hh11Picked.ut,name:hh11Picked.name,mode:hh11Mode,sys:hh11Mode==='listed'?sys:'',fact:fact,comment:(cEl&&cEl.value||'').trim(),mismatch:mEl&&mEl.checked?1:0,placed:0,shortage:0,ts:new Date().toLocaleString('ru-RU')});
  const arr=getHH11();arr.unshift(row);set('hh11_log',arr);logAction('hh11','Добавлена строка HH 1-1: '+(row.ut||row.name||''),{id:row.id});
  if(eo)hh11MarkEOUsed(eo);
  if(eoEl)eoEl.value=''; if(sysEl)sysEl.value=''; if(factEl)factEl.value=''; if(cEl)cEl.value=''; if(mEl)mEl.checked=false;
  hh11ClearPicked();renderHH11();
}
function hh11Del(id){set('hh11_log',getHH11().filter(x=>x.id!==id));logAction('hh11','Удалена строка HH 1-1',{id:id});renderHH11();}
function hh11Archive(id){const arr=getHH11();const r=arr.find(x=>x.id===id);if(!r)return;r.archived=r.archived?0:1;r.archivedTs=r.archived?new Date().toLocaleString('ru-RU'):'';touchMeta(r);set('hh11_log',arr);logAction('hh11',(r.archived?'В архив HH 1-1':'Из архива HH 1-1'),{id:id});renderHH11();}
function hh11TogglePlaced(id){
  const arr=getHH11();const r=arr.find(x=>x.id===id);if(!r)return;
  r.placed=r.placed?0:1;
  if(r.placed)r.shortage=0;
  r.placedTs=r.placed?new Date().toLocaleString('ru-RU'):'';
  touchMeta(r);set('hh11_log',arr);logAction('hh11',r.placed?'HH отмечена размещенной':'HH размещение отменено',{id:id});renderHH11();
}
function hh11ToggleShortage(id){
  const arr=getHH11();const r=arr.find(x=>x.id===id);if(!r)return;
  r.shortage=r.shortage?0:1;
  if(r.shortage){r.placed=0;r.placedTs='';}
  touchMeta(r);set('hh11_log',arr);logAction('hh11',r.shortage?'HH отмечена недостача':'HH недостача снята',{id:id});renderHH11();
}
function hh11ToggleMismatch(id){
  const arr=getHH11();const r=arr.find(x=>x.id===id);if(!r)return;
  r.mismatch=r.mismatch?0:1;
  touchMeta(r);set('hh11_log',arr);logAction('hh11',r.mismatch?'HH отмечен пересорт':'HH пересорт снят',{id:id});renderHH11();}
function hh11ToggleDefective(id){
  const arr=getHH11();const r=arr.find(x=>x.id===id);if(!r)return;
  r.defective=r.defective?0:1;
  if(r.defective){
    if(!r.comment||r.comment.trim()==='')r.comment='Брак';
    else if(!r.comment.includes('Брак'))r.comment='Брак · '+r.comment;
    if(!(parseInt(r.fact)>0)&&parseInt(r.sys)>0)r.fact=r.sys;
  }
  touchMeta(r);set('hh11_log',arr);logAction('hh11',r.defective?'HH брак':'HH брак снят',{id:id});renderHH11();}
function hh11ToggleDefectiveGroup(key){
  const arr=getHH11();
  const group=arr.filter(x=>hh11GroupKey(x)===key);
  if(!group.length)return;
  const should=!group.every(x=>x.defective);
  group.forEach(r=>{
    r.defective=should?1:0;
    if(r.defective){
      if(!r.comment||r.comment.trim()==='')r.comment='Брак';
      else if(!r.comment.includes('Брак'))r.comment='Брак · '+r.comment;
      if(!(parseInt(r.fact)>0)&&parseInt(r.sys)>0)r.fact=r.sys;
    }
    touchMeta(r);
  });
  set('hh11_log',arr);logAction('hh11',should?'HH группа брак':'HH группа брак снят',{key});renderHH11();
}
function hh11EditQty(id,field,val){
  const arr=getHH11();const r=arr.find(x=>x.id===id);if(!r)return;
  r[field]=Math.max(0,parseInt(val)||0);touchMeta(r);set('hh11_log',arr);logAction('hh11','Изменено количество HH',{id:id,field:field});renderHH11();
}
function hh11EditEO(id,val){
  const arr=getHH11();const r=arr.find(x=>x.id===id);if(!r)return;
  r.eo=normalizeEOCode(val);touchMeta(r);set('hh11_log',arr);logAction('hh11','Изменена ЕО HH',{id:id});
  if(r.eo)hh11MarkEOUsed(r.eo);
  renderHH11();
}

function hh11GroupKey(x){
  const eo=String(x&&x.eo||'').trim();
  if(eo)return 'eo:'+eo;
  return 'row:'+String(x&&x.id||Math.random());
}
function hh11GroupCount(items){
  const keys=new Set();
  (items||[]).forEach(x=>keys.add(hh11GroupKey(x)));
  return keys.size;
}
function hh11GroupItems(items){
  const map=new Map(); const order=[];
  (items||[]).forEach(x=>{
    const key=hh11GroupKey(x);
    if(!map.has(key)){map.set(key,[]);order.push(key);}
    map.get(key).push(x);
  });
  return order.map(k=>map.get(k));
}
function hh11TogglePlacedGroup(key){
  const arr=getHH11(); const items=arr.filter(x=>hh11GroupKey(x)===key);
  if(!items.length)return;
  const shouldPlace=!items.every(x=>x.placed);
  items.forEach(r=>{r.placed=shouldPlace?1:0; if(shouldPlace){r.shortage=0;r.placedTs=new Date().toLocaleString('ru-RU');}else r.placedTs=''; touchMeta(r);});
  set('hh11_log',arr); logAction('hh11',shouldPlace?'HH ЕО отмечена размещенной':'HH ЕО возвращена',{key:key,count:items.length}); renderHH11();
}
function hh11ToggleShortageGroup(key){
  const arr=getHH11(); const items=arr.filter(x=>hh11GroupKey(x)===key);
  if(!items.length)return;
  const should=!items.every(x=>x.shortage);
  items.forEach(r=>{r.shortage=should?1:0; if(should){r.placed=0;r.placedTs='';} touchMeta(r);});
  set('hh11_log',arr); logAction('hh11',should?'HH ЕО отмечена недостача':'HH ЕО недостача снята',{key:key,count:items.length}); renderHH11();
}

function hh11Stats(arr){
  const listed=arr.filter(x=>x.mode==='listed'&&!x.archived);
  const found=arr.filter(x=>x.mode==='found'&&!x.archived);
  const active=arr.filter(x=>!x.archived);
  return {
    all:hh11GroupCount(arr),
    active:hh11GroupCount(active),
    archive:hh11GroupCount(arr.filter(x=>x.archived)),
    listed:hh11GroupCount(listed),
    found:hh11GroupCount(found),
    placed:hh11GroupCount(arr.filter(x=>x.placed&&!x.archived)),
    shortage:hh11GroupCount(arr.filter(x=>x.shortage&&!x.archived)),
    openListed:hh11GroupCount(listed.filter(x=>!x.placed&&!x.shortage)),
    mismatch:hh11GroupCount(arr.filter(x=>x.mismatch&&!x.archived))
  };
}
function hh11BoardButton(view,label,num,accent){
  const active=hh11View===view;
  return '<button onclick="hh11SetView(\''+view+'\')" style="background:'+(active?'var(--gold-dim)':'var(--surface2)')+';border:1px solid '+(active?'var(--gold)':'var(--border)')+';border-radius:9px;padding:9px 8px;color:'+(active?'#fff':'var(--text)')+';font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.7px;text-align:left;cursor:pointer;min-width:0;"><span style="display:block;color:'+(accent||'var(--gold)')+';font-family:\'Spectral\',serif;font-size:20px;line-height:1;">'+num+'</span>'+label+'</button>';
}
function hh11RenderOverview(arr){
  const listed=arr.filter(x=>x.mode==='listed'&&!x.archived);
  const found=arr.filter(x=>x.mode==='found'&&!x.archived);
  const open=listed.filter(x=>!x.placed&&!x.shortage);
  const placed=arr.filter(x=>x.placed&&!x.archived);
  const shortage=arr.filter(x=>x.shortage&&!x.archived);
  const sum=(items,field)=>items.reduce((sumVal,x)=>sumVal+(parseInt(x[field])||0),0);
  return '<div class="hh-overview">'+
    '<div class="hh-overview-title">Общий обзор HH 1-1</div>'+ 
    '<div class="hh-overview-grid">'+
      '<div class="hh-overview-cell"><div class="hh-overview-label">Числятся</div><div class="hh-overview-value">'+hh11GroupCount(listed)+'</div><div class="hh-overview-note">товаров: '+listed.length+' · система: '+sum(listed,'sys')+' · факт: '+sum(listed,'fact')+'</div></div>'+ 
      '<div class="hh-overview-cell"><div class="hh-overview-label">Не числятся</div><div class="hh-overview-value">'+hh11GroupCount(found)+'</div><div class="hh-overview-note">товаров: '+found.length+' · факт: '+sum(found,'fact')+'</div></div>'+ 
      '<div class="hh-overview-cell"><div class="hh-overview-label">К размещению</div><div class="hh-overview-value">'+hh11GroupCount(open)+'</div><div class="hh-overview-note">ЕО/HU ещё не вычеркнуты</div></div>'+ 
      '<div class="hh-overview-cell"><div class="hh-overview-label">Размещено</div><div class="hh-overview-value">'+hh11GroupCount(placed)+'</div><div class="hh-overview-note">ЕО/HU вычеркнуты</div></div>'+ 
      '<div class="hh-overview-cell wide"><div class="hh-overview-label">Проблемы</div><div class="hh-overview-value">'+hh11GroupCount(shortage)+'</div><div class="hh-overview-note">недостача · пересорт: '+hh11GroupCount(arr.filter(x=>x.mismatch&&!x.archived))+'</div></div>'+ 
    '</div></div>';
}
function hh11RenderBoard(arr){
  const b=document.getElementById('hh11-board');if(!b)return;
  const st=hh11Stats(arr);
  b.innerHTML=hh11RenderOverview(arr)+'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">'+
    hh11BoardButton('active','Активные',st.active)+
    hh11BoardButton('all','Все',st.all)+
    hh11BoardButton('listed','Числятся',st.listed)+
    hh11BoardButton('found','Не числятся',st.found,'var(--red)')+
    hh11BoardButton('open','К размещению',st.openListed)+
    hh11BoardButton('placed','Размещено',st.placed,'var(--ok)')+
    hh11BoardButton('shortage','Недостача',st.shortage,'var(--red)')+
    hh11BoardButton('mismatch','Пересорт',st.mismatch,'var(--red)')+
    hh11BoardButton('archive','Архив',st.archive,'#777')+
    '</div>';
}
function hh11PlacementIds(){
  return hh11ScopeByDate(getHH11()).filter(x=>x.mode==='listed'&&!x.placed&&!x.shortage&&String(x.eo||'').trim()).map(x=>x.id);
}
function hh11ZoomPlacement(id){
  const arr=getHH11();
  const it=arr.find(x=>x.id===id); if(!it||!it.eo)return;
  const ids=hh11PlacementIds();
  const idx=ids.indexOf(id);
  const pos=(idx>=0?(idx+1):1)+'/'+Math.max(ids.length,1);
  zoomBarcode(String(it.eo),null,{title:it.name||it.ut,subtitle:pos+' · '+it.ut,eo:it.eo},{kind:'hh11',ids:ids,currentId:id,canPrev:idx>0,canNext:idx>=0&&idx<ids.length-1,fullscreen:true,placement:true});
}
function hh11Filtered(arr){
  if(hh11View==='active')return arr.filter(x=>!x.archived);
  if(hh11View==='archive')return arr.filter(x=>x.archived);
  if(hh11View==='listed')return arr.filter(x=>x.mode==='listed'&&!x.archived);
  if(hh11View==='found')return arr.filter(x=>x.mode==='found'&&!x.archived);
  if(hh11View==='open')return arr.filter(x=>x.mode==='listed'&&!x.placed&&!x.shortage&&!x.archived);
  if(hh11View==='placed')return arr.filter(x=>x.placed&&!x.archived);
  if(hh11View==='shortage')return arr.filter(x=>x.shortage&&!x.archived);
  if(hh11View==='mismatch')return arr.filter(x=>x.mismatch&&!x.archived);
  return arr;
}
function hh11RenderGroupedCard(group,kind){
  group=(group||[]).slice().sort((a,b)=>String(a.ut||'').localeCompare(String(b.ut||''),'ru'));
  const first=group[0]||{};
  const key=hh11GroupKey(first);
  const safeKey=jsStr(key);
  const eo=String(first.eo||'').trim();
  const safeEO=jsStr(eo);
  const placedAll=group.length&&group.every(x=>x.placed);
  const shortageAny=group.some(x=>x.shortage);
  const mismatchAny=group.some(x=>x.mismatch);
  const sysSum=group.reduce((s,x)=>s+(parseInt(x.sys)||0),0);
  const factSum=group.reduce((s,x)=>s+(parseInt(x.fact)||0),0);
  const border=shortageAny?'var(--red)':(mismatchAny?'var(--red)':(kind==='listed'?'var(--gold)':'var(--red)'));
  const opacity=(placedAll||shortageAny)?'0.68':'1';
  const defectiveAny=group.some(x=>x.defective);
  const defectiveAll=group.every(x=>x.defective);
  const badges=(placedAll?'<span style="background:rgba(90,138,74,0.18);border:1px solid var(--ok);color:var(--ok);border-radius:6px;padding:2px 6px;font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:9px;letter-spacing:0.6px;">размещено</span>':'')+(shortageAny?'<span style="background:rgba(192,57,43,0.14);border:1px solid var(--red);color:var(--red);border-radius:6px;padding:2px 6px;font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:9px;letter-spacing:0.6px;">недостача</span>':'')+(mismatchAny?'<span style="background:rgba(192,57,43,0.14);border:1px solid var(--red);color:var(--red);border-radius:6px;padding:2px 6px;font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:9px;letter-spacing:0.6px;">пересорт</span>':'')+(defectiveAny?'<span style="background:rgba(180,60,180,0.14);border:1px solid var(--violet);color:var(--violet);border-radius:6px;padding:2px 6px;font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:9px;letter-spacing:0.6px;">брак</span>':'');
  let h='<div class="hh11-eo-group" style="background:var(--bg2);border-radius:10px;padding:10px;margin-bottom:9px;border-left:4px solid '+border+';opacity:'+opacity+';">';
  h+='<div style="display:flex;gap:8px;align-items:flex-start;justify-content:space-between;">';
  h+='<div style="min-width:0;flex:1;">';
  h+=(eo?'<div style="display:flex;gap:6px;align-items:center;margin-bottom:5px;flex-wrap:wrap;"><span style="font-family:\'JetBrains Mono\',monospace;font-size:12px;font-weight:800;color:var(--text);background:rgba(0,0,0,0.16);border:1px solid var(--border);border-radius:6px;padding:4px 7px;">ЕО/HU '+escHtml(eo)+'</span>'+badges+'</div>':'<div style="display:flex;gap:6px;align-items:center;margin-bottom:5px;flex-wrap:wrap;"><span style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;color:var(--muted);font-size:11px;">Без ЕО/HU</span>'+badges+'</div>');
  h+='<div style="font-size:11px;color:var(--muted);">'+group.length+' товар(ов) · система: '+sysSum+' · факт: '+factSum+'</div>';
  h+='</div><div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;">';
  if(eo)h+='<button onclick="zoomBarcode(\''+safeEO+'\',null,{title:\'ЕО/HU\',subtitle:\''+safeEO+'\',eo:\''+safeEO+'\'},{compact:true})" class="exi-btn" style="padding:5px 8px;font-size:10px;">ШК</button>';
  if(kind==='listed'&&eo&&!placedAll&&!shortageAny)h+='<button onclick="hh11ZoomPlacement('+first.id+')" class="exi-btn" style="padding:5px 8px;font-size:10px;border-color:var(--gold);color:var(--gold);">⤢</button>';
  if(kind==='listed')h+='<button onclick="hh11TogglePlacedGroup(\''+safeKey+'\')" class="exi-btn" style="padding:5px 8px;font-size:10px;border-color:'+(placedAll?'var(--ok)':'var(--border)')+';color:'+(placedAll?'var(--ok)':'var(--muted)')+';">'+(placedAll?'↩ ЕО':'✓ ЕО')+'</button><button onclick="hh11ToggleShortageGroup(\''+safeKey+'\')" class="exi-btn" style="padding:5px 8px;font-size:10px;border-color:'+(shortageAny?'var(--red)':'var(--border)')+';color:'+(shortageAny?'var(--red)':'var(--muted)')+';">недост.</button>'+'<button onclick="hh11ToggleDefectiveGroup(\''+safeKey+'\')" class="exi-btn" style="padding:5px 8px;font-size:10px;border-color:'+(defectiveAny?'var(--violet)':'var(--border)')+';color:'+(defectiveAny?'var(--violet)':'var(--muted)')+';">брак</button>';
  h+='</div></div>';
  h+='<div style="margin-top:8px;display:grid;gap:7px;">'+group.map(it=>hh11RenderItemMini(it,kind)).join('')+'</div>';
  h+=authorLine(first);
  h+='</div>';
  return h;
}

function hh11RenderItemMini(it,kind){
  const placed=!!it.placed, shortage=!!it.shortage, mismatch=!!it.mismatch;
  const textDeco=(placed||shortage)?'text-decoration:line-through;':'';
  return `<div class="hh11-eo-group-product">
    <div style="display:flex;gap:8px;align-items:flex-start;">
      <div style="flex:1;min-width:0;">
        <div style="${textDeco}font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:var(--gold);">${escHtml(it.ut)}</div>
        <div style="${textDeco}font-size:12px;color:var(--text);line-height:1.25;">${escHtml(it.name)}</div>
      </div>
      <div style="display:flex;gap:5px;align-items:flex-start;">
        <button onclick="hh11Archive(${it.id})" style="background:none;border:1px solid var(--border);border-radius:6px;color:var(--muted);font-size:10px;padding:4px 7px;cursor:pointer;">${it.archived?'↩':'арх'}</button>
        <button onclick="hh11Del(${it.id})" style="background:none;border:none;color:var(--red-bright);font-size:14px;cursor:pointer;">✕</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:${kind==='listed'?'1fr 1fr':'1fr'};gap:6px;margin-top:7px;">
      ${kind==='listed'?`<div><label class="modal-lbl">Система</label><input class="calc-inp" type="number" inputmode="numeric" value="${it.sys||0}" onchange="hh11EditQty(${it.id},'sys',this.value)" style="margin-bottom:0;font-size:15px;padding:8px;text-align:center;"></div>`:''}
      <div><label class="modal-lbl">Факт</label><input class="calc-inp" type="number" inputmode="numeric" value="${it.fact||0}" onchange="hh11EditQty(${it.id},'fact',this.value)" style="margin-bottom:0;font-size:15px;padding:8px;text-align:center;"></div>
    </div>
    <div style="display:flex;gap:6px;margin-top:7px;flex-wrap:wrap;">
      ${kind==='listed'?`<button onclick="hh11TogglePlaced(${it.id})" class="exi-btn" style="flex:1;min-width:110px;border-color:${placed?'var(--ok)':'var(--border)'};color:${placed?'var(--ok)':'var(--muted)'};">${placed?'↩ вернуть':'✓ размещено'}</button><button onclick="hh11ToggleShortage(${it.id})" class="exi-btn" style="flex:1;min-width:100px;border-color:${shortage?'var(--red)':'var(--border)'};color:${shortage?'var(--red)':'var(--muted)'};">недостача</button>`:''}
      <button onclick="hh11ToggleMismatch(${it.id})" class="exi-btn" style="flex:1;min-width:100px;border-color:${mismatch?'var(--red)':'var(--border)'};color:${mismatch?'var(--red)':'var(--muted)'};">пересорт</button>
      <button onclick="hh11ToggleDefective(${it.id})" class="exi-btn" style="flex:1;min-width:80px;border-color:${it.defective?'var(--violet)':'var(--border)'};color:${it.defective?'var(--violet)':'var(--muted)'};">брак</button>
    </div>
  </div>`;
}

function hh11RenderGroup(title,items,kind){
  if(!items.length)return '<div class="gen-box"><div style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:12px;color:var(--muted);letter-spacing:1px;">'+title+'</div><div style="font-size:12px;color:var(--faint);margin-top:6px;">Пусто</div></div>';
  items=items.slice().sort((a,b)=>((a.placed||a.shortage)?1:0)-((b.placed||b.shortage)?1:0));
  const tsvKind=kind==='found'?'found':'listed';
  const groups=hh11GroupItems(items);
  let h='<div class="gen-box"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;"><div style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:12px;color:var(--gold);letter-spacing:1px;flex:1;">'+title+'</div><button onclick="hh11CopyTSVKind(\''+tsvKind+'\')" class="exi-btn" style="flex:0 0 auto;padding:6px 10px;font-size:10px;">TSV</button><b style="color:var(--gold);">'+groups.length+'</b></div>';
  groups.forEach(group=>{ h+=hh11RenderGroupedCard(group,kind); });
  h+='</div>';return h;
}

function renderHH11(){
  hh11EnsureDate();
  hh11SetMode(hh11Mode);
  const arr=hh11ScopeByDate(getHH11());
  const cnt=document.getElementById('hh11-count');if(cnt)cnt.textContent=hh11GroupCount(arr)+' ЕО / '+arr.length+' товаров'+(hh11ShowAllDates?' · все дни':'');
  const allBtn=document.getElementById('hh11-alldays-btn');
  if(allBtn)allBtn.classList.toggle('primary',hh11ShowAllDates);
  hh11RenderBoard(arr);
  const box=document.getElementById('hh11-list');if(!box)return;
  const base=hh11Filtered(arr);
  const data=hh11ApplyListSearch(base);
  hh11UpdateSearchStatus(base.length,data.length);
  if(hh11View==='all'){
    const listed=data.filter(x=>x.mode==='listed');
    const found=data.filter(x=>x.mode==='found');
    box.innerHTML=hh11RenderGroup('Числятся в системе',listed,'listed')+hh11RenderGroup('Не числятся, но есть физически',found,'found');
    return;
  }
  const titleMap={listed:'Числятся в системе',found:'Не числятся, но есть физически',open:'Числятся · ещё не размещено',placed:'Размещено / вычеркнуто',shortage:'Недостача',mismatch:'Пересорт'};
  const kind=(hh11View==='found')?'found':'listed';
  box.innerHTML=hh11RenderGroup(titleMap[hh11View]||'HH 1-1',data,kind);
}
function hh11ExportText(){
  const arr=hh11ScopeByDate(getHH11());
  const d=new Date().toLocaleDateString('ru-RU');
  const flags=x=>(x.placed?' — РАЗМЕЩЕНО':'')+(x.shortage?' — НЕДОСТАЧА':'')+(x.mismatch?' — ПЕРЕСОРТ':'');
  const fmt=x=>(x.eo?'ЕО '+x.eo+' — ':'')+x.ut+' — '+x.name+' — '+(x.mode==='listed'?'система: '+(x.sys||0)+' — ':'')+'факт: '+(x.fact||0)+flags(x);
  let out='HH 1-1 / '+d+'\n\nЧИСЛЯТСЯ В СИСТЕМЕ:\n';
  const listed=arr.filter(x=>x.mode==='listed');
  out+=listed.length?listed.map(fmt).join('\n'):'—';
  out+='\n\nНЕ ЧИСЛЯТСЯ, НО ЕСТЬ ФИЗИЧЕСКИ:\n';
  const found=arr.filter(x=>x.mode==='found');
  out+=found.length?found.map(fmt).join('\n'):'—';
  return out;
}
function hh11Status(x){
  if(x.shortage)return 'Недостача';
  if(x.placed)return 'Размещено';
  if(x.mismatch)return 'Пересорт';
  return x.mode==='listed'?'К размещению':'Не числится';
}
function hh11ListedComment(x){
  if(x.shortage)return 'Недостача';
  if(x.placed){
    const f=parseInt(x.fact)||0;
    return f>0 ? ('Размещено, факт '+f) : 'Размещено';
  }
  return '';
}
function hh11ExportTSV(kind){
  const dateOnly=x=>String((x&&x.ts)||new Date().toLocaleDateString('ru-RU')).split(',')[0].trim();
  const clean=v=>String(v??'').replace(/\t/g,' ').replace(/[\r\n]+/g,' ');
  let rows;
  let arr=hh11ScopeByDate(getHH11()).slice().reverse();
  if(kind==='listed'){
    arr=arr.filter(x=>x.mode==='listed');
    rows=[['Дата','ЕО','Наименование','УТ','Количество','Комментарий']];
    arr.forEach(x=>rows.push([dateOnly(x),x.eo||'',x.name||'',x.ut||'',x.sys||0,hh11ListedComment(x)]));
  }else if(kind==='found'){
    arr=arr.filter(x=>x.mode==='found');
    rows=[['Дата','ЕО','Наименование','УТ','Количество','Статус']];
    arr.forEach(x=>rows.push([dateOnly(x),x.eo||'',x.name||'',x.ut||'',x.fact||0,hh11Status(x)]));
  }else{
    rows=[['Дата','ЕО','Наименование','УТ','Количество','Комментарий']];
    arr.forEach(x=>{
      if(x.mode==='listed')rows.push([dateOnly(x),x.eo||'',x.name||'',x.ut||'',x.sys||0,hh11ListedComment(x)]);
      else rows.push([dateOnly(x),x.eo||'',x.name||'',x.ut||'',x.fact||0,hh11Status(x)]);
    });
  }
  return rows.map(r=>r.map(clean).join('\t')).join('\n');
}
function hh11CopyTSV(kind){const text=hh11ExportTSV(kind);navigator.clipboard.writeText(text).then(()=>alert('TSV скопирован. Можно вставлять в Excel.')).catch(()=>{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);alert('TSV скопирован. Можно вставлять в Excel.');});}
function hh11CopyTSVKind(kind){hh11CopyTSV(kind);}
function hh11Share(){shareText(hh11ExportText());}
function hh11Clear(){
  const label=hh11ShowAllDates?'HH 1-1 за все дни':('HH 1-1 за '+hh11CurrentDate());
  if(!confirm('Очистить '+label+'? Другие дни не пострадают.'))return;
  const scoped=new Set(hh11ScopeByDate(getHH11()).map(x=>x.id));
  set('hh11_log',getHH11().filter(x=>!scoped.has(x.id)));
  renderHH11();
}

function hh11ImportSetStatus(text,kind){
  const el=document.getElementById('hh11-import-status');
  if(!el)return;
  el.textContent=text||'';
  el.style.color=kind==='err'?'var(--red-bright)':(kind==='ok'?'var(--ok)':'var(--muted)');
}
function hh11NormalizeUt(raw){
  let v=String(raw||'').trim().toUpperCase().replace(/\s+/g,'');
  if(!v)return '';
  if(/^\d{5,}$/.test(v))v='УТ-'+v.padStart(8,'0');
  return v;
}
function hh11EnsureCatalogItem(ut,name){
  ut=hh11NormalizeUt(ut);name=String(name||'').trim();
  if(!ut||!name)return;
  const exists=productAllItems().some(i=>String(i.ut||'').toUpperCase()===ut.toUpperCase());
  if(exists)return;
  const items=getCustomItems();
  items.unshift(createMeta({ut:ut,name:name,barcode:'',img:'',custom:true,source:'wms'}));
  set('custom_items',items);
}
function hh11RowKey(x){
  return [String(x.mode||''),String(x.ut||'').toUpperCase(),String(x.eo||''),String(x.sys||''),String(x.bestBeforeDate||''),String(x.name||'').toLowerCase()].join('|');
}
function hh11ImportRows(rows,sourceLabel){
  rows=(rows||[]).filter(Boolean);
  if(!rows.length){hh11ImportSetStatus('Нет строк для импорта.','err');return {added:0,skipped:0};}
  const arr=getHH11();
  const keys=new Set(arr.map(hh11RowKey));
  let added=0,skipped=0;
  rows.forEach(r=>{
    const ut=hh11NormalizeUt(r.ut||r.nomenclatureCode);
    const name=String(r.name||'').trim();
    const qty=Math.max(0,parseInt(r.sys ?? r.quantity ?? r.qty)||0);
    const eo=normalizeEOCode(r.eo||r.hu||r.handlingUnitBarcode||'');
    if(!ut||!name){skipped++;return;}
    hh11EnsureCatalogItem(ut,name);
    const row=createMeta({
      id:Date.now()+Math.floor(Math.random()*1000000)+added,
      eo:eo,
      ut:ut,
      name:name,
      mode:'listed',
      sys:qty,
      fact:0,
      comment:[r.bestBeforeDate?('до '+r.bestBeforeDate):'',r.status||'',sourceLabel||'ВМС'].filter(Boolean).join(' · '),
      bestBeforeDate:r.bestBeforeDate||'',
      wmsStatus:r.status||'',
      mismatch:0,
      placed:0,
      shortage:0,
      ts:new Date().toLocaleString('ru-RU')
    });
    const key=hh11RowKey(row);
    if(keys.has(key)){skipped++;return;}
    keys.add(key);arr.unshift(row);added++;
    if(eo)hh11MarkEOUsed(eo);
  });
  set('hh11_log',arr);
  if(added)logAction('hh11','Импорт содержимого в HH-1-1: '+added+' строк',{source:sourceLabel||'wms',added:added,skipped:skipped});
  renderHH11();
  hh11ImportSetStatus('Импорт в HH-1-1: добавлено '+added+'. Пропущено дублей/пустых: '+skipped+'.','ok');
  return {added,skipped};
}
function hh11RowsFromWmsResult(result){
  const rows=(result&&result.rows)||[];
  return rows.map(r=>({
    ut:r.nomenclatureCode,
    name:r.name,
    qty:r.quantity,
    eo:r.handlingUnitBarcode,
    bestBeforeDate:r.bestBeforeDate,
    status:r.status
  })).filter(r=>r.ut&&r.name);
}
function wmsImportLastStocksToHH11(){
  if(!wmsLastResult){alert('Нет результата ВМС');return;}
  if(String(wmsLastResult.mode||'').indexOf('changes')===0){alert('В HH 1-1 импортируются текущие остатки, не изменения. Переключись на «Остатки».');return;}
  const rows=hh11RowsFromWmsResult(wmsLastResult);
  if(!rows.length){alert('В результате ВМС нет строк для импорта.');return;}
  if(!confirm('Перенести '+rows.length+' строк в HH 1-1 → «Числится»? Дубли будут пропущены.'))return;
  switchTab('hh11');
  setTimeout(()=>hh11ImportRows(rows,'ВМС: '+(wmsLastResult.cellAddress||wmsLastResult.query||'остатки')),80);
}
function hh11ParseWmsTextLine(line){
  const src=String(line||'').trim();
  if(!src || !/^УТ-/i.test(src))return null;
  const parts=src.split(/\s+—\s+/);
  if(parts.length<6)return null;
  const ut=hh11NormalizeUt(parts[0]);
  const status=parts[parts.length-1].trim();
  const huPart=parts[parts.length-2]||'';
  const datePart=parts[parts.length-3]||'';
  const qtyPart=parts[parts.length-4]||'';
  const name=parts.slice(1,parts.length-4).join(' — ').trim();
  const qtyM=qtyPart.match(/(\d+)/);
  const dateM=datePart.match(/(\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{2,4})/);
  const huM=huPart.match(/(?:HU|ЕО)?\s*(\d{8,})/i);
  if(!ut||!name||!qtyM)return null;
  return {ut,name,qty:parseInt(qtyM[1])||0,bestBeforeDate:dateM?dateM[1]:'',eo:huM?huM[1]:'',status};
}
function hh11ParseWmsText(text){
  return String(text||'').split(/\r?\n/).map(hh11ParseWmsTextLine).filter(Boolean);
}
async function hh11PasteWmsImport(){
  try{
    const text=await navigator.clipboard.readText();
    const el=document.getElementById('hh11-wms-import-text');if(el)el.value=text;
    hh11ImportSetStatus('Вставил из буфера. Жми «Разобрать».','ok');
  }catch(e){hh11ImportSetStatus('Не смог прочитать буфер. Вставь вручную долгим тапом.','err');}
}
function hh11ClearWmsImport(){const el=document.getElementById('hh11-wms-import-text');if(el)el.value='';hh11ImportSetStatus('', '');}
function hh11ImportWmsText(){
  const el=document.getElementById('hh11-wms-import-text');
  const rows=hh11ParseWmsText(el?el.value:'');
  if(!rows.length){hh11ImportSetStatus('Не нашёл строк формата «УТ — название — 3 шт — до дата — HU ... — статус».','err');return;}
  if(!confirm('Разобрал '+rows.length+' строк. Добавить в «Числится»?'))return;
  hh11ImportRows(rows,'ручной список ВМС');
}
async function hh11PullFromWmsCell(){
  const el=document.getElementById('hh11-wms-cell');
  const q=wmsCleanCode(el&&el.value||'HH-1-1');
  if(!q){hh11ImportSetStatus('Введи ячейку ВМС.','err');return;}
  hh11ImportSetStatus('Тяну из ВМС: '+q+'…','');
  try{
    let raw;
    if(typeof window.lookupWmsByCode==='function')raw=await window.lookupWmsByCode(q);
    else raw=await wmsNativeLookup(q);
    const result=wmsNormalizeResult(raw);
    if(result._kind){
      hh11ImportSetStatus('ВМС вернула несколько вариантов. Открыл во вкладке ВМС — выбери нужный, потом нажми «В HH 1-1».','err');
      switchTab('wms');wmsRenderChoices(result);return;
    }
    const rows=hh11RowsFromWmsResult(result);
    if(!rows.length){hh11ImportSetStatus('ВМС ответила, но строк остатков для импорта нет.','err');return;}
    hh11ImportRows(rows,'ВМС: '+q);
  }catch(e){hh11ImportSetStatus((e&&e.message)||'ВМС не ответила. Используй ручной список.','err');}
}



// ── ЕСТЬ В НАЛИЧИИ (из отгрузки) ──
const getInstock = () => get('instock_log');
function instockFiltered(){
  const arr=getInstock();
  const q=String((document.getElementById('instock-search')||{}).value||'').toLowerCase().trim();
  if(!q)return arr;
  return arr.filter(x=>((x.name||'')+' '+(x.ut||'')+' '+(x.barcode||'')+' '+(x.eo||'')).toLowerCase().includes(q));
}
function instockDel(id){set('instock_log',getInstock().filter(x=>x.id!==id));logAction('instock','Удалена позиция',{id:id});renderInstock();}
function instockClear(){if(confirm('Очистить список «Есть в наличии»?')){set('instock_log',[]);logAction('instock','Очищен список');renderInstock();}}
function renderInstock(){
  const arr=getInstock();
  const view=instockFiltered();
  const cnt=document.getElementById('instock-count');
  const totalQty=arr.reduce((s,x)=>s+(parseInt(x.qty)||0),0);
  if(cnt)cnt.textContent=arr.length+' поз.';
  const sum=document.getElementById('instock-summary');
  if(sum){
    const eoSet=new Set(arr.map(x=>x.eo).filter(Boolean));
    sum.innerHTML='<div style="display:flex;gap:6px;flex-wrap:wrap;">'+
      '<div style="flex:1;min-width:72px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:9px 6px;text-align:center;"><div style="font-family:\'Spectral\',serif;font-weight:700;font-size:26px;color:var(--ok);line-height:1;">'+arr.length+'</div><div style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:9px;letter-spacing:.5px;color:var(--muted);margin-top:4px;">Позиций</div></div>'+
      '<div style="flex:1;min-width:72px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:9px 6px;text-align:center;"><div style="font-family:\'Spectral\',serif;font-weight:700;font-size:26px;color:var(--text);line-height:1;">'+totalQty+'</div><div style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:9px;letter-spacing:.5px;color:var(--muted);margin-top:4px;">Штук</div></div>'+
      '<div style="flex:1;min-width:72px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:9px 6px;text-align:center;"><div style="font-family:\'Spectral\',serif;font-weight:700;font-size:26px;color:var(--gold);line-height:1;">'+eoSet.size+'</div><div style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:9px;letter-spacing:.5px;color:var(--muted);margin-top:4px;">ЕО</div></div>'+
    '</div>';
  }
  const box=document.getElementById('instock-list');if(!box)return;
  if(!view.length){box.innerHTML='<div class="no-results">'+(arr.length?'Ничего не найдено по фильтру.':'Список пуст. Отмечай позиции в содержимом ЕО (раздел «Отгрузка») и переноси сюда.')+'</div>';return;}
  // Группируем по ЕО для наглядности
  const groups={};const order=[];
  view.forEach(x=>{const k=x.eo||'—';if(!groups[k]){groups[k]=[];order.push(k);}groups[k].push(x);});
  box.innerHTML=order.map(eo=>{
    const items=groups[eo];
    const gQty=items.reduce((s,x)=>s+(parseInt(x.qty)||0),0);
    const rowsHtml=items.map(x=>'<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--border);">'+
      '<div style="flex:1;min-width:0;"><div style="font-size:12px;color:var(--text);line-height:1.25;">'+escHtml(x.name||'Товар')+'</div><div style="font-family:\'JetBrains Mono\',monospace;font-size:10px;color:var(--muted);">'+escHtml(x.ut||'без УТ')+(x.barcode?(' · '+escHtml(x.barcode)):'')+'</div></div>'+
      '<div style="font-family:\'Spectral\',serif;font-weight:700;font-size:18px;color:var(--ok);">'+(parseInt(x.qty)||0)+'</div>'+
      '<button onclick="instockDel('+x.id+')" style="background:none;border:none;color:var(--red-bright);font-size:14px;cursor:pointer;">✕</button>'+
    '</div>').join('');
    return '<div class="gen-box" style="border-left:3px solid var(--ok);padding:11px;margin-bottom:10px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'+
        '<span style="font-family:\'JetBrains Mono\',monospace;font-size:12px;font-weight:700;color:var(--text);background:rgba(0,0,0,0.16);border:1px solid var(--border);border-radius:6px;padding:3px 7px;">ЕО '+escHtml(eo)+'</span>'+
        '<span style="font-size:11px;color:var(--muted);">'+items.length+' поз. · '+gQty+' шт</span>'+
      '</div>'+rowsHtml+'</div>';
  }).join('');
}
function instockCopyTSV(){
  const arr=getInstock();
  const rows=[['Дата','ЕО','УТ','Наименование','ШК','Кол-во']];
  arr.forEach(x=>rows.push([rkDateRu(x.date),x.eo||'',x.ut||'',x.name||'',x.barcode||'',parseInt(x.qty)||0]));
  const text=rows.map(r=>r.map(v=>String(v??'').replace(/\t/g,' ').replace(/\n/g,' ')).join('\t')).join('\n');
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(()=>alert('TSV «Есть в наличии» скопирован. Можно вставлять в Excel.')).catch(()=>{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);alert('TSV «Есть в наличии» скопирован.');});}
  else{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);alert('TSV «Есть в наличии» скопирован.');}
}
function instockExportToReport(){
  const arr=getInstock();
  if(!arr.length){alert('Список пуст.');return;}
  const totalQty=arr.reduce((s,x)=>s+(parseInt(x.qty)||0),0);
  const day=ensureReportToday();
  const taskName='Есть в наличии (отгрузка)';
  if(!day.tasks)day.tasks=[];
  let task=day.tasks.find(t=>t.name===taskName);
  if(!task){task={name:taskName,qty:0,updatedAt:Date.now()};day.tasks.push(task);}
  task.qty=arr.length;
  task.updatedAt=Date.now();
  saveReportDay(day);
  alert('В отчёт: «'+taskName+'» = '+arr.length+' позиций ('+totalQty+' шт).');
}
window.renderInstock=renderInstock;window.instockDel=instockDel;window.instockClear=instockClear;window.instockCopyTSV=instockCopyTSV;window.instockExportToReport=instockExportToReport;

// ── RK CHECK JOURNAL ──
const getRK = () => get('rk_log');
let rkView='active';
let rkShowAllDates=false;
function rkSetView(v){rkView=v;renderRK();}
function rkOnDateChange(){rkShowAllDates=false;setStickyDate('rk_work_date',document.getElementById('rk-date')&&document.getElementById('rk-date').value||'');rkRefreshEOState();renderRK();}
function rkDateShift(delta){
  rkEnsureDate();
  const el=document.getElementById('rk-date');if(!el)return;
  const cur=el.value||rkTodayISO();
  const d=new Date(cur+'T00:00:00');
  d.setDate(d.getDate()+delta);
  el.value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  rkShowAllDates=false;
  setStickyDate('rk_work_date',el.value);
  rkRefreshEOState();renderRK();
}
function rkDateToday(){
  const el=document.getElementById('rk-date');if(el)el.value=rkTodayISO();
  rkShowAllDates=false;
  setStickyDate('rk_work_date',el?el.value:rkTodayISO());
  rkRefreshEOState();renderRK();
}
function rkToggleAllDates(){rkShowAllDates=!rkShowAllDates;renderRK();}
let rkPicked=null;
function rkAllItems(){return productAllItems();}
function rkTodayISO(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
// «Липкая» рабочая дата: переживает перезагрузку страницы (Android может убить WebView
// в фоне за ночь) и НЕ перескакивает сама на новый день в полночь — только когда
// человек явно нажал «Сегодня» или сдвинул дату. Раньше при потере состояния поле
// пустело и подставлялась текущая календарная дата — так ночную смену «переносило».
function getStickyDate(key){ try{return localStorage.getItem(key)||'';}catch(_){return '';} }
function setStickyDate(key,val){ try{ if(val)localStorage.setItem(key,val); else localStorage.removeItem(key); }catch(_){ } }
function rkDateRu(iso){if(!iso)return new Date().toLocaleDateString('ru-RU');const p=String(iso).split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:iso;}
function rkEnsureDate(){const el=document.getElementById('rk-date');if(el&&!el.value)el.value=getStickyDate('rk_work_date')||rkTodayISO();}
function rkKey(date,eo){return (date||'')+'||'+String(eo||'').trim();}
function rkExistingGroup(date,eo){const key=rkKey(date,eo);return getRK().find(x=>rkKey(x.date,x.eo)===key);}
function rkRefreshEOState(){
  rkEnsureDate();
  const eo=normalizeEOCode(document.getElementById('rk-eo').value||'');
  const date=document.getElementById('rk-date').value||rkTodayISO();
  const box=document.getElementById('rk-eo-state'); if(!box)return;
  if(!eo){box.style.display='none';box.innerHTML='';return;}
  const ex=rkExistingGroup(date,eo);
  if(ex){
    box.style.display='block';
    box.innerHTML='Эта ЕО уже есть в журнале. Новые SKU добавятся к этой же ЕО. В TSV дата и ЕО не будут повторяться. Каждая SKU-строка с товаром считается одной ошибкой.';
  }else{
    box.style.display='block';
    box.innerHTML='ЕО ещё нет в журнале. Каждая добавленная SKU-строка будет считаться одной ошибкой. Если вся ЕО без расхождений — жми «✓ ЕО без расхождений» без выбора товара.';
  }
}
function rkNewEO(){
  ['rk-eo','rk-surplus','rk-shortage','rk-defect','rk-comment'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  rkClearPicked();rkRefreshEOState();
  const eo=document.getElementById('rk-eo');if(eo)eo.focus();
}
function rkToggleNewItemForm(){const f=document.getElementById('rk-new-item-form');if(f)f.style.display=f.style.display==='none'?'block':'none';}
function rkResetStatus(){
  const st=document.getElementById('rk-status');
  if(st) st.value='';
}
function rkPick(ut,name){
  rkPicked={ut:ut,name:name};
  rkResetStatus();
  pushRecentProduct(ut);
  const res=document.getElementById('rk-results');if(res)res.style.display='none';
  const s=document.getElementById('rk-search');if(s)s.value='';
  const p=document.getElementById('rk-picked');if(p){p.style.display='block';p.innerHTML='<b style="color:var(--gold);">'+escHtml(ut)+'</b><br>'+escHtml(name)+'<button onclick="rkClearPicked()" style="float:right;background:none;border:none;color:var(--red-bright);font-size:14px;cursor:pointer;">✕</button>';}
}
function rkClearPicked(){rkPicked=null;rkResetStatus();const p=document.getElementById('rk-picked');if(p){p.style.display='none';p.innerHTML='';}}
function rkSaveNewItem(){
  const ut=(document.getElementById('rk-new-ut').value||'').trim();
  const name=(document.getElementById('rk-new-name').value||'').trim();
  const bc=(document.getElementById('rk-new-bc').value||'').trim();
  if(!ut||!name){alert('Укажи УТ и наименование');return;}
  const items=getCustomItems();
  const exists=rkAllItems().some(i=>String(i.ut).toLowerCase()===ut.toLowerCase());
  if(!exists){items.unshift(createMeta({ut:ut,name:name,barcode:bc,img:'',custom:true}));set('custom_items',items);logAction('product','Добавлен товар из РК: '+ut,{ut:ut});}else if(bc){saveCustomBarcode(ut,bc);logAction('product','Добавлен/изменён ШК из РК: '+ut,{ut:ut});}
  document.getElementById('rk-new-ut').value='';document.getElementById('rk-new-name').value='';document.getElementById('rk-new-bc').value='';
  const f=document.getElementById('rk-new-item-form');if(f)f.style.display='none';
  rkPick(ut,name);
  if(typeof doSearch==='function')doSearch('');
}
function rkSearch(q){
  const box=document.getElementById('rk-results');
  if(!String(q||'').trim()){if(box){box.style.display='none';box.innerHTML='';}return;}
  showProductResults('rk-results',q,'rkPick','<div class="smart-empty">Не найдено. Нажми «+ Новый» и сохрани позицию сразу в каталог.</div>',30);
}
function rkNum(id){const el=document.getElementById(id);return Math.max(0,parseInt(el&&el.value)||0);}
function rkIssueSnapshot(){
  const surplus=rkNum('rk-surplus');
  const shortage=rkNum('rk-shortage');
  const defect=rkNum('rk-defect');
  const types=[];
  if(surplus>0)types.push('surplus');
  if(shortage>0)types.push('shortage');
  if(defect>0)types.push('defect');
  return {surplus,shortage,defect,types};
}
function rkExpectedStatusByIssue(type){
  if(type==='surplus')return 'Изъяли';
  if(type==='defect')return 'Изъяли';
  if(type==='shortage')return 'Недостача';
  return '';
}
function rkOnIssueChange(){
  const snap=rkIssueSnapshot();
  const st=document.getElementById('rk-status');
  if(!st)return;
  if(snap.types.length===1){
    const need=rkExpectedStatusByIssue(snap.types[0]);
    if(need)st.value=need;
  }else if(snap.types.length===0){
    if(st.value==='Недостача'||st.value==='Изъяли')st.value='';
  }
}
function rkValidateIssue(show){
  const snap=rkIssueSnapshot();
  const st=(document.getElementById('rk-status')&&document.getElementById('rk-status').value||'').trim();
  const fail=(msg)=>{if(show)alert(msg);return false;};
  if(snap.types.length===0){
    return fail('Укажи один тип расхождения: излишек, недостача или брак. Если ЕО без расхождений — используй кнопку «ЕО без расхождений».');
  }
  if(snap.types.length>1){
    return fail('Для одной SKU можно указать только один тип: излишек, недостача или брак. Разные расхождения добавляй отдельными строками.');
  }
  const type=snap.types[0];
  const need=rkExpectedStatusByIssue(type);
  if(need && st!==need){
    if(show){
      if(type==='surplus')alert('Излишек не может быть недостачей или браком. Итог: «Изъяли».');
      else if(type==='defect')alert('Брак не может быть излишком или недостачей. Итог: «Изъяли».');
      else if(type==='shortage')alert('Недостача не может быть излишком или браком. Итог: «Недостача».');
    }
    const sel=document.getElementById('rk-status');
    if(sel)sel.value=need;
    return false;
  }
  if(type==='surplus' && (snap.shortage>0||snap.defect>0))return fail('Излишек вводится отдельно от недостачи и брака.');
  if(type==='shortage' && (snap.surplus>0||snap.defect>0))return fail('Недостача вводится отдельно от излишка и брака.');
  if(type==='defect' && (snap.surplus>0||snap.shortage>0))return fail('Брак вводится отдельно от излишка и недостачи.');
  return true;
}
function rkBaseRow(noDiff){
  rkEnsureDate();
  const date=document.getElementById('rk-date').value||rkTodayISO();
  const eo=normalizeEOCode(document.getElementById('rk-eo').value||'');
  const eoInput=document.getElementById('rk-eo'); if(eoInput&&eo)eoInput.value=eo;
  if(!eo){alert('Укажи ЕО');return null;}
  return {date,eo};
}
function rkAdd(){
  const base=rkBaseRow(false); if(!base)return;
  if(!rkPicked){alert('Выбери товар из каталога или добавь новый. Если ЕО без расхождений — жми отдельную кнопку «✓ ЕО без расхождений».');return;}
  const status=(document.getElementById('rk-status')&&document.getElementById('rk-status').value||'').trim();
  if(!status){alert('Выбери итог для этой SKU. При выборе новой SKU поле сбрасывается специально, чтобы не записать старый итог.');return;}
  if(!rkValidateIssue(true))return;
  const row=createMeta({
    id:Date.now()+Math.floor(Math.random()*1000),
    date:base.date,
    eo:base.eo,
    errors:1,
    ut:rkPicked.ut,
    name:rkPicked.name,
    surplus:rkNum('rk-surplus'),
    shortage:rkNum('rk-shortage'),
    defect:rkNum('rk-defect'),
    status:status,
    comment:'',
    ts:Date.now()
  });
  const arr=getRK();
  // У этой ЕО появилась реальная ошибка — убираем заглушку «без расхождений»
  // (строки без товара по той же дате и ЕО), чтобы не было дубля.
  const key=rkKey(base.date,base.eo);
  let removedPlaceholder=0;
  const cleaned=arr.filter(x=>{
    const isPlaceholder=rkKey(x.date,x.eo)===key && !String(x.ut||'').trim();
    if(isPlaceholder)removedPlaceholder++;
    return !isPlaceholder;
  });
  cleaned.unshift(row);set('rk_log',cleaned);logAction('rk','Добавлена строка РК: '+(row.ut||row.name||row.eo||'')+(removedPlaceholder?' (заменил «без расхождений»)':''),{id:row.id});
  ['rk-surplus','rk-shortage','rk-defect','rk-comment'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  rkClearPicked();rkResetStatus();rkRefreshEOState();renderRK();
}
function rkAddNoDiff(){
  const base=rkBaseRow(true); if(!base)return;
  const row=createMeta({
    id:Date.now()+Math.floor(Math.random()*1000),
    date:base.date,
    eo:base.eo,
    errors:0,
    ut:'',name:'',surplus:0,shortage:0,defect:0,
    status:'Без расхождений',
    comment:'',
    ts:Date.now()
  });
  const arr=getRK();arr.unshift(row);set('rk_log',arr);logAction('rk','Добавлена ЕО без расхождений: '+(row.eo||''),{id:row.id});
  ['rk-surplus','rk-shortage','rk-defect','rk-comment'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  rkClearPicked();rkResetStatus();rkRefreshEOState();renderRK();
}
function rkDel(id){set('rk_log',getRK().filter(x=>x.id!==id));logAction('rk','Удалена строка РК',{id:id});renderRK();rkRefreshEOState();}
function rkArchive(id){const arr=getRK();const r=arr.find(x=>x.id===id);if(!r)return;r.archived=r.archived?0:1;r.archivedTs=r.archived?new Date().toLocaleString('ru-RU'):'';touchMeta(r);set('rk_log',arr);logAction('rk',(r.archived?'В архив РК':'Из архива РК'),{id:id});renderRK();rkRefreshEOState();}
function rkScopeByDate(arr){
  arr=arr||getRK();
  if(rkShowAllDates)return arr;
  rkEnsureDate();
  const d=(document.getElementById('rk-date')&&document.getElementById('rk-date').value)||rkTodayISO();
  return arr.filter(x=>String(x.date||'')===d);
}
function rkFilteredByView(arr){arr=rkScopeByDate(arr||getRK());if(rkView==='archive')return arr.filter(x=>x.archived);if(rkView==='all')return arr;return arr.filter(x=>!x.archived);}
function rkRenderViewBar(){const b=document.getElementById('rk-view-bar');if(!b)return;const arr=rkScopeByDate(getRK());const active=arr.filter(x=>!x.archived).length, arch=arr.filter(x=>x.archived).length;const btn=(v,l,n)=>'<button class="cell-chip '+(rkView===v?'active':'')+'" onclick="rkSetView(\''+v+'\')">'+l+' <b>'+n+'</b></button>';b.innerHTML=btn('active','Активные',active)+btn('archive','Архив',arch)+btn('all','Все',arr.length);}
function rkGroups(arr){
  const ordered=(arr||getRK()).slice().reverse();
  const map=new Map(), groups=[];
  ordered.forEach(x=>{
    const key=rkKey(x.date,x.eo);
    let g=map.get(key);
    if(!g){g={date:x.date,eo:x.eo,errors:0,rows:[]};map.set(key,g);groups.push(g);} 
    // Ошибка = одна SKU-строка с товаром. ЕО без расхождений даёт 0.
    g.errors += x.ut ? 1 : 0;
    g.rows.push(x);
  });
  return groups;
}
function rkStats(arr){
  const groups=rkGroups(arr||getRK());
  const flat=groups.flatMap(g=>g.rows);
  return {eo:groups.length, rows:flat.length, errors:groups.reduce((s,g)=>s+(parseInt(g.errors)||0),0), surplus:flat.reduce((s,x)=>s+(parseInt(x.surplus)||0),0), shortage:flat.reduce((s,x)=>s+(parseInt(x.shortage)||0),0), defect:flat.reduce((s,x)=>s+(parseInt(x.defect)||0),0)};
}
function renderRK(){
  rkEnsureDate();rkRefreshEOState();
  const arr=rkFilteredByView(getRK());
  rkRenderViewBar();
  const allBtn=document.getElementById('rk-alldays-btn');
  if(allBtn)allBtn.classList.toggle('primary',rkShowAllDates);
  const st=rkStats(arr);
  const cnt=document.getElementById('rk-count');if(cnt)cnt.textContent=st.eo+' ЕО / '+st.rows+' строк'+(rkShowAllDates?' · все дни':'');
  const sum=document.getElementById('rk-summary');
  if(sum)sum.innerHTML='<div style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:11px;color:var(--gold);letter-spacing:1px;margin-bottom:8px;">Итог проверки</div>'+ 
    '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">'+
    '<div class="calc-mid" style="margin:0;"><span class="calc-mid-lbl">Проверено ЕО</span><span class="calc-mid-val">'+st.eo+'</span></div>'+ 
    '<div class="calc-mid" style="margin:0;"><span class="calc-mid-lbl">Строк</span><span class="calc-mid-val">'+st.rows+'</span></div>'+ 
    '<div class="calc-mid" style="margin:0;"><span class="calc-mid-lbl">Ошибок</span><span class="calc-mid-val">'+st.errors+'</span></div>'+ 
    '<div class="calc-mid" style="margin:0;"><span class="calc-mid-lbl">Излишек</span><span class="calc-mid-val">'+st.surplus+'</span></div>'+ 
    '<div class="calc-mid" style="margin:0;"><span class="calc-mid-lbl">Недостача</span><span class="calc-mid-val">'+st.shortage+'</span></div>'+ 
    '<div class="calc-mid" style="margin:0;"><span class="calc-mid-lbl">Брак</span><span class="calc-mid-val">'+st.defect+'</span></div></div>';
  const box=document.getElementById('rk-list');if(!box)return;
  const groups=rkGroups(arr).reverse(); // newest EO group first on screen
  if(!groups.length){box.innerHTML='<div class="no-results">Журнал РК пуст</div>';return;}
  box.innerHTML=groups.map(g=>{
    const rows=g.rows.slice().reverse(); // newest row in group first
    let rowsHtml=rows.map(x=>{
      const comm=(x.status||'');
      const title=x.ut?('<div style="font-family:\'JetBrains Mono\',monospace;font-size:11px;font-weight:700;color:var(--gold);">'+escHtml(x.ut)+'</div><div style="font-size:12px;color:var(--text);line-height:1.25;">'+escHtml(x.name)+'</div>')
        :(x.status==='Без расхождений'
          ?'<div style="font-size:12px;color:var(--ok);font-weight:700;">✓ ЕО без расхождений</div>'
          :'<div style="font-size:12px;color:var(--muted);font-weight:700;">ЕО добавлена · ошибки не внесены</div>');
      return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:9px 10px;margin-top:7px;">'+
        '<div style="display:flex;justify-content:space-between;gap:8px;"><div style="flex:1;min-width:0;">'+title+'</div><div style="display:flex;gap:6px;align-items:flex-start;"><button onclick="rkArchive('+x.id+')" style="background:none;border:1px solid var(--border);border-radius:6px;color:var(--muted);font-size:10px;padding:4px 7px;cursor:pointer;">'+(x.archived?'↩':'арх')+'</button><button onclick="rkDel('+x.id+')" style="background:none;border:none;color:var(--red-bright);font-size:14px;cursor:pointer;">✕</button></div></div>'+ 
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:7px;font-size:11px;text-align:center;color:var(--muted);"><div>Изл.<br><b style="color:var(--text);">'+(parseInt(x.surplus)||0)+'</b></div><div>Нед.<br><b style="color:var(--text);">'+(parseInt(x.shortage)||0)+'</b></div><div>Брак<br><b style="color:var(--text);">'+(parseInt(x.defect)||0)+'</b></div></div>'+ 
        '<div style="font-size:11px;color:var(--muted);margin-top:7px;">'+escHtml(comm)+'</div>'+authorLine(x)+'</div>';
    }).join('');
    return '<div class="gen-box" style="border-left:3px solid var(--red);padding:11px;margin-bottom:10px;">'+
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">'+
      '<div style="flex:1;min-width:0;"><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:5px;"><span style="font-family:\'JetBrains Mono\',monospace;font-size:11px;font-weight:700;color:var(--text);background:rgba(0,0,0,0.16);border:1px solid var(--border);border-radius:6px;padding:3px 6px;">ЕО '+escHtml(g.eo)+'</span><button onclick="zoomBarcode(\''+jsStr(g.eo)+'\')" style="background:none;border:1px solid var(--border);border-radius:6px;padding:3px 7px;color:var(--muted);font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:10px;cursor:pointer;">ШК</button><span style="font-size:10px;color:var(--muted);">'+rkDateRu(g.date)+'</span></div>'+
      '<div style="font-size:11px;color:var(--muted);">Ошибок по SKU: <b style="color:var(--gold);">'+(g.errors||0)+'</b> · строк: '+g.rows.length+'</div></div>'+
      '<div><button onclick="rkPrefillEo(\''+jsStr(g.eo)+'\')" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 8px;color:var(--gold);font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:10px;cursor:pointer;white-space:nowrap;">+ ошибку</button></div>'+
      '</div>'+rowsHtml+'</div>';
  }).join('');
}
function rkCommentForTSV(x){return (x.status||'');}
function rkExportTSV(){
  const rows=[['Дата','ЕО','Ошибки','Наименование','УТ','Излишек','Недостача','Брак','Итог']];
  rkGroups(rkScopeByDate(getRK())).forEach(g=>{
    g.rows.forEach((x,idx)=>rows.push([idx===0?rkDateRu(g.date):'',idx===0?(g.eo||''):'',x.ut?1:0,x.name||'',x.ut||'',parseInt(x.surplus)||0,parseInt(x.shortage)||0,parseInt(x.defect)||0,rkCommentForTSV(x)]));
  });
  return rows.map(r=>r.map(v=>String(v??'').replace(/\t/g,' ').replace(/\n/g,' ')).join('\t')).join('\n');
}
function rkExportText(){
  const st=rkStats(rkScopeByDate(getRK()));
  return 'Проверка РК\nПроверено ЕО: '+st.eo+'\nСтрок: '+st.rows+'\nОшибок: '+st.errors+'\nИзлишек: '+st.surplus+'\nНедостача: '+st.shortage+'\nБрак: '+st.defect+'\n\n'+rkExportTSV();
}
function rkCopyTSV(){const text=rkExportTSV();navigator.clipboard.writeText(text).then(()=>alert('TSV РК скопирован. Можно вставлять в Excel.')).catch(()=>{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);alert('TSV РК скопирован. Можно вставлять в Excel.');});}
function rkShare(){shareText(rkExportText());}
function rkClear(){
  rkEnsureDate();
  const d=(document.getElementById('rk-date')&&document.getElementById('rk-date').value)||rkTodayISO();
  const label=rkShowAllDates?'журнал РК за все дни':('журнал РК за '+rkDateRu(d));
  if(!confirm('Очистить '+label+'? Другие дни не пострадают.'))return;
  const scoped=new Set(rkScopeByDate(getRK()).map(x=>x.id));
  set('rk_log',getRK().filter(x=>!scoped.has(x.id)));
  renderRK();rkRefreshEOState();
}


// ── SHIFT PROBLEMS MVP ──
let problemPicked=null;
let problemsView='active';
function problemSearch(q){showProductResults('problem-results',q,'problemPick','<div class="smart-empty">Товар не выбран. Можно создать проблему только по ячейке/комментарию.</div>',30);}
function problemPick(ut,name){
  problemPicked={ut:ut,name:name};
  const r=document.getElementById('problem-results');if(r)r.style.display='none';
  const st=document.getElementById('problem-search');if(st)st.value='';
  const p=document.getElementById('problem-picked');
  if(p){p.style.display='block';p.innerHTML='<b style="color:var(--gold);">'+escHtml(ut)+'</b><br>'+escHtml(name)+'<button onclick="problemClearPicked()" style="float:right;background:none;border:none;color:var(--red-bright);font-size:14px;cursor:pointer;">✕</button>';}
}
function problemClearPicked(){problemPicked=null;const p=document.getElementById('problem-picked');if(p){p.style.display='none';p.innerHTML='';}}
function problemSetView(v){problemsView=v;renderProblems();}
function problemAdd(){
  const type=(document.getElementById('problem-type')||{}).value||'другое';
  const cell=String((document.getElementById('problem-cell')||{}).value||'').trim().toUpperCase();
  const sys=Math.max(0,parseInt((document.getElementById('problem-sys')||{}).value)||0);
  const fact=Math.max(0,parseInt((document.getElementById('problem-fact')||{}).value)||0);
  const status=(document.getElementById('problem-status')||{}).value||'новая';
  const needWms=(document.getElementById('problem-wms')||{}).checked?1:0;
  const comment=String((document.getElementById('problem-comment')||{}).value||'').trim();
  if(!problemPicked && !cell && !comment){alert('Укажи товар, ячейку или комментарий. Пустую проблему плодить не будем.');return;}
  const row=createMeta({id:Date.now()+Math.floor(Math.random()*1000),type:type,ut:problemPicked?problemPicked.ut:'',name:problemPicked?problemPicked.name:'',cell:cell,sys:sys,fact:fact,status:needWms?'нужно ВМС':status,needWms:needWms,comment:comment,archived:0,createdAt:new Date().toLocaleString('ru-RU'),updatedAt:new Date().toLocaleString('ru-RU')});
  const arr=getProblems();arr.unshift(row);set('problems_log',arr);
  ['problem-cell','problem-sys','problem-fact','problem-comment','problem-search'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const w=document.getElementById('problem-wms');if(w)w.checked=false;
  problemClearPicked();logAction('problem','Создана проблема: '+type+(row.ut?' · '+row.ut:'')+(cell?' · '+cell:''));renderProblems();
}
function problemUpdateStatus(id,status){const arr=getProblems();const r=arr.find(x=>x.id===id);if(!r)return;r.status=status;r.needWms=status==='нужно ВМС'?1:(r.needWms||0);r.updatedAt=new Date().toLocaleString('ru-RU');touchMeta(r);set('problems_log',arr);logAction('problem','Статус проблемы: '+status,{id:id});renderProblems();}
function problemArchive(id){const arr=getProblems();const r=arr.find(x=>x.id===id);if(!r)return;r.archived=r.archived?0:1;r.updatedAt=new Date().toLocaleString('ru-RU');touchMeta(r);set('problems_log',arr);logAction('problem',(r.archived?'В архив: ':'Из архива: ')+(r.type||'проблема'),{id:id});renderProblems();}
function problemDel(id){if(!confirm('Удалить проблему?'))return;set('problems_log',getProblems().filter(x=>x.id!==id));logAction('problem','Удалена проблема',{id:id});renderProblems();}
function problemFiltered(arr){
  arr=arr||getProblems();
  if(problemsView==='active')return arr.filter(x=>!x.archived && x.status!=='решено');
  if(problemsView==='wms')return arr.filter(x=>!x.archived && (x.needWms || x.status==='нужно ВМС'));
  if(problemsView==='done')return arr.filter(x=>!x.archived && x.status==='решено');
  if(problemsView==='archive')return arr.filter(x=>x.archived);
  return arr;
}
function problemStats(arr){arr=arr||getProblems();return {all:arr.length,active:arr.filter(x=>!x.archived&&x.status!=='решено').length,wms:arr.filter(x=>!x.archived&&(x.needWms||x.status==='нужно ВМС')).length,done:arr.filter(x=>!x.archived&&x.status==='решено').length,archive:arr.filter(x=>x.archived).length};}
function problemChip(view,label,num){const active=problemsView===view;return '<button class="cell-chip '+(active?'active':'')+'" onclick="problemSetView(\''+view+'\')">'+label+' <b>'+num+'</b></button>';}
function renderProblems(){
  const arr=getProblems();
  const pst=problemStats(arr);
  const cnt=document.getElementById('problems-count');if(cnt)cnt.textContent=pst.active+' акт. / '+pst.wms+' ВМС';
  const bar=document.getElementById('problems-filter-bar');
  if(bar)bar.innerHTML=problemChip('active','Активные',pst.active)+problemChip('wms','ВМС',pst.wms)+problemChip('done','Решено',pst.done)+problemChip('archive','Архив',pst.archive)+problemChip('all','Все',pst.all);
  const box=document.getElementById('problems-list');if(!box)return;
  const data=problemFiltered(arr);
  if(!data.length){box.innerHTML='<div class="no-results">Проблем нет. И это подозрительно, но приятно.</div>';return;}
  box.innerHTML=data.map(x=>{
    const accent=(x.status==='нужно ВМС'||x.needWms)?'var(--red-bright)':(x.status==='решено'?'var(--ok)':'var(--gold)');
    const item=x.ut?'<div style="font-family:\'JetBrains Mono\',monospace;font-size:11px;font-weight:700;color:var(--gold);">'+escHtml(x.ut)+'</div><div style="font-size:12px;color:var(--text);line-height:1.25;">'+escHtml(x.name||'')+'</div>':'<div style="font-size:12px;color:var(--muted);">Без товара</div>';
    return '<div class="gen-box" style="border-left:3px solid '+accent+';padding:11px;margin-bottom:10px;">'+
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;"><div style="flex:1;min-width:0;">'+
      '<div style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:11px;color:'+accent+';letter-spacing:1px;margin-bottom:5px;">'+escHtml(x.type||'проблема')+'</div>'+item+
      '<div style="font-size:11px;color:var(--muted);margin-top:6px;">'+(x.cell?'Ячейка: <b style="color:var(--text);">'+escHtml(x.cell)+'</b> · ':'')+'сист.: '+(parseInt(x.sys)||0)+' · факт: '+(parseInt(x.fact)||0)+'</div>'+ 
      (x.comment?'<div style="font-size:11px;color:var(--muted);margin-top:6px;line-height:1.35;">'+escHtml(x.comment)+'</div>':'')+
      '<div style="font-size:10px;color:var(--muted);margin-top:6px;">'+escHtml(x.createdAt||'')+'</div>'+authorLine(x)+'</div>'+ 
      '<button onclick="problemDel('+x.id+')" style="background:none;border:none;color:var(--red-bright);font-size:14px;cursor:pointer;">✕</button></div>'+ 
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px;">'+
      ['новая','в работе','нужно ВМС','решено'].map(v=>'<button onclick="problemUpdateStatus('+x.id+',\''+v+'\')" class="exi-btn" style="flex:1;min-width:95px;border-color:'+(x.status===v?'var(--gold)':'var(--border)')+';color:'+(x.status===v?'var(--gold)':'var(--muted)')+';">'+v+'</button>').join('')+
      '<button onclick="problemArchive('+x.id+')" class="exi-btn" style="flex:1;min-width:95px;">'+(x.archived?'↩ вернуть':'в архив')+'</button></div></div>';
  }).join('');
}

// ── REPORT ──
const REPORT_DEFAULT_TASKS = ["Заведение излишков (Сухой)", "Заведение излишков (Холод)", "Пересчет мест хранения по заданиям на пересчет (Сухой)", "Пересчет мест хранения по заданиям на пересчет (Холод)", "Плановый пересчет хранения (Сухой)", "Плановый пересчет хранения (Холод)", "Подсчёт ТОПов (Сухой)", "Подсчёт ТОПов (Холод)", "Проверка зоны хранения и выборочный пересчет мест с ревизором УР", "Проверка и обработка брака", "Проверка и обработка буферных зон", "Проверка пустых мест хранения (Сухой)", "Проверка пустых мест хранения (Холод)"];
function todayKey(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function getReportAll(){try{return JSON.parse(localStorage.getItem('report')||'{}');}catch(e){return {};}}
function getReportDay(key){const all=getReportAll();return all[key]||null;}
function reportNow(){return Date.now();}
function reportTaskFrom(oldTask,name,defaultQty){
  const t=(oldTask&&typeof oldTask==='object')?oldTask:{};
  return {name,qty:parseInt(t.qty!=null?t.qty:defaultQty)||0,updatedAt:Number(t.updatedAt||t.updated_at||0)||0};
}
function normalizeReportDay(day){
  day = (day&&typeof day==='object') ? day : {tasks:[]};
  const old = Array.isArray(day.tasks) ? day.tasks : [];
  const byName = {};
  old.forEach(t=>{ if(t && t.name && byName[t.name]===undefined) byName[t.name]=t; });
  const tasks = REPORT_DEFAULT_TASKS.map(n=>reportTaskFrom(byName[n],n,0));
  old.forEach(t=>{
    if(t && t.name && !REPORT_DEFAULT_TASKS.includes(t.name)) tasks.push(reportTaskFrom(t,t.name,0));
  });
  day.tasks = tasks;
  day.updatedAt=Number(day.updatedAt||day.updated_at||0)||0;
  return day;
}
function touchReportTask(task,ts){if(task&&typeof task==='object')task.updatedAt=Number(ts||reportNow());return task;}
function touchReportDay(day,ts){if(day&&typeof day==='object')day.updatedAt=Number(ts||reportNow());return day;}
function writeReportAll(all){localStorage.setItem('report',JSON.stringify(all||{}));}
function ensureReportToday(){
  const all=getReportAll();const k=todayKey();let changed=false;
  if(!all[k]){
    let extra=[];
    const keys=Object.keys(all).sort();
    if(keys.length){
      const last=all[keys[keys.length-1]];
      if(last&&last.tasks){extra=last.tasks.filter(t=>t && t.name && !REPORT_DEFAULT_TASKS.includes(t.name)).map(t=>({name:t.name, qty:0, updatedAt:0}));}
    }
    const ts=reportNow();
    all[k]=normalizeReportDay({tasks:[...REPORT_DEFAULT_TASKS.map(n=>({name:n,qty:0,updatedAt:ts})), ...extra],updatedAt:ts});
    changed=true;
  }else{
    const before=JSON.stringify(all[k]);
    all[k]=normalizeReportDay(all[k]);
    if(JSON.stringify(all[k])!==before)changed=true;
  }
  if(changed)writeReportAll(all);
  return all[k];
}
function saveReportDay(day,dateKey){
  const all=getReportAll();const k=dateKey||todayKey();
  touchReportDay(day);
  all[k]=normalizeReportDay(day);
  writeReportAll(all);
}
// Нужен внешнему WMS-модулю: он пишет отчёт не только за сегодняшнюю дату.
window.saveReportDayForDate=function(dateKey,day,allOverride){
  const all=allOverride&&typeof allOverride==='object'?allOverride:getReportAll();
  touchReportDay(day);
  all[dateKey]=normalizeReportDay(day);
  writeReportAll(all);
};
function openReportAdd(){openModal('report-modal');}
function addReportTask(){
  const name=document.getElementById('report-task-name').value.trim();
  if(!name){alert('Введите название');return;}
  const day=ensureReportToday();
  const ts=reportNow();
  day.tasks.push({name,qty:0,updatedAt:ts});
  saveReportDay(day);
  document.getElementById('report-task-name').value='';
  closeModal('report-modal');renderReport();
}
function reportSetQty(idx,val){
  const day=ensureReportToday();
  if(!day.tasks[idx])return;
  day.tasks[idx].qty=parseInt(val)||0;
  touchReportTask(day.tasks[idx]);
  saveReportDay(day);
  renderReportTotal();
}
function reportAddQty(idx,val){
  const add=parseInt(val)||0;
  if(!add)return;
  const day=ensureReportToday();
  if(!day.tasks[idx])return;
  day.tasks[idx].qty=(parseInt(day.tasks[idx].qty)||0)+add;
  touchReportTask(day.tasks[idx]);
  saveReportDay(day);
  renderReport();
}
function reportDelTask(idx){
  if(!confirm('Удалить задачу?'))return;
  const day=ensureReportToday();
  day.tasks.splice(idx,1);saveReportDay(day);renderReport();
}
function resetReportToday(){
  if(!confirm('Обнулить показатели за сегодня?'))return;
  const day=ensureReportToday();
  day.tasks.forEach(t=>{t.qty=0;touchReportTask(t);});saveReportDay(day);renderReport();
}
function renderReportTotal(){
  const day=ensureReportToday();
  const sum=day.tasks.reduce((s,t)=>s+(t.qty||0),0);
  const el=document.getElementById('report-total-val');if(el)el.textContent=sum;
}
function renderReport(){
  document.getElementById('report-date').textContent=new Date().toLocaleDateString('ru');
  const day=ensureReportToday();
  const list=document.getElementById('report-list');
  const acts=document.getElementById('report-actions');
  acts.style.display='flex';
  let h='';
  day.tasks.forEach((t,idx)=>{
    h+='<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:8px;padding:11px 13px;margin-bottom:8px;display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;">'+
      '<div style="min-width:0;font-size:13px;color:var(--text);">'+t.name+'</div>'+
      '<button onclick="reportDelTask('+idx+')" style="background:none;border:none;color:var(--red-bright);font-size:14px;cursor:pointer;">✕</button>'+
      '<input type="number" inputmode="numeric" value="'+(t.qty||0)+'" onchange="reportSetQty('+idx+',this.value)" onfocus="this.select()" style="width:100%;background:var(--paper);border:2px solid var(--line);border-radius:8px;padding:9px;font-family:\'JetBrains Mono\',monospace;font-size:16px;color:var(--paper-ink);text-align:center;outline:none;-webkit-appearance:none;">'+
      '<div style="display:flex;gap:6px;">'+
        '<input id="report-add-'+idx+'" type="number" inputmode="numeric" placeholder="+" onfocus="this.select()" style="width:74px;background:var(--paper);border:2px solid var(--line);border-radius:8px;padding:9px;font-family:\'JetBrains Mono\',monospace;font-size:15px;color:var(--paper-ink);text-align:center;outline:none;-webkit-appearance:none;">'+
        '<button onclick="reportAddFromInput('+idx+')" class="quick-btn" style="width:44px;padding:8px 0;">+</button>'+
      '</div>'+
    '</div>';
  });
  h+='<div style="background:var(--bg2);border-radius:8px;padding:12px 13px;margin-top:4px;display:flex;justify-content:space-between;align-items:center;"><span style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:11px;color:var(--muted);letter-spacing:1px;">Всего за день</span><span id="report-total-val" style="font-family:\'Spectral\',serif;font-weight:600;font-size:22px;color:var(--gold);">0</span></div>';
  list.innerHTML=h;
  renderReportTotal();
  // history (other days)
  const all=getReportAll();
  const keys=Object.keys(all).filter(k=>k!==todayKey()).sort().reverse().slice(0,30);
  const hist=document.getElementById('report-history');
  if(!keys.length){hist.innerHTML='<div class="no-results" style="padding:20px;">Пусто</div>';return;}
  hist.innerHTML=keys.map(k=>{
    const sum=all[k].tasks.reduce((s,t)=>s+(t.qty||0),0);
    const d=k.split('-').reverse().join('.');
    const rows=all[k].tasks.filter(t=>t.qty>0).map(t=>t.name+': '+t.qty).join(', ');
    return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:11px 13px;margin-bottom:8px;"><div style="display:flex;justify-content:space-between;"><span style="font-size:12px;color:var(--gold);font-weight:700;">'+d+'</span><span style="font-family:\'Spectral\',serif;font-weight:600;color:var(--gold);">'+sum+'</span></div>'+(rows?'<div style="font-size:11px;color:var(--muted);margin-top:4px;">'+rows+'</div>':'')+'</div>';
  }).join('');
}
// ── МОНИТОРИНГ (КДК + штучный отбор, живые данные ВМС) ──
function wmsMonitorStatBlock(label,color,st){
  const kg=Math.round((st.tasksStocksTotalWeightInGrams||0)/1000);
  return '<div class="stat"><b'+(color?(' style="color:'+color+';"'):'')+'>'+escHtml(st.tasksCount||0)+'</b><span>'+label+'</span><small>'+escHtml(kg)+' кг</small></div>';
}
function wmsMonitorCategoryCard(title,st,extraChip){
  if(!st)return '<div class="wms-card" style="margin-bottom:10px;"><div class="wms-card-body"><div class="wms-product-name">'+escHtml(title)+'</div><div class="wms-meta">Нет данных.</div></div></div>';
  const total=(st.totalTasks&&st.totalTasks.tasksCount)||0;
  const done=(st.completedTasks&&st.completedTasks.tasksCount)||0;
  const pct=total>0?Math.round(done/total*100):0;
  const lastHour=st.lastHourCompletedTasks||{tasksCount:0,tasksStocksTotalWeightInGrams:0};
  const lastHourKg=Math.round((lastHour.tasksStocksTotalWeightInGrams||0)/1000);
  return '<div class="panel-card" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:14px;margin-bottom:12px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;"><b style="font-size:14px;">'+escHtml(title)+'</b><span class="mono" style="font-size:11px;color:var(--muted);">'+escHtml(lastHour.tasksCount||0)+' задач · '+lastHourKg+' кг за час</span></div>'+
    '<div class="stats" style="margin-bottom:10px;">'+
      wmsMonitorStatBlock('осталось','var(--warn)',st.remainingTasks||{})+
      wmsMonitorStatBlock('выполнено','var(--ok)',st.completedTasks||{})+
      wmsMonitorStatBlock('всего','',st.totalTasks||{})+
    '</div>'+
    '<div class="bar-track" style="height:8px;border-radius:99px;background:var(--bg2);overflow:hidden;"><div style="height:100%;border-radius:99px;background:linear-gradient(90deg,var(--gold),#f0c96b);width:'+pct+'%;"></div></div>'+
    '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:6px;"><span>Выполненные задачи</span><span class="mono">'+pct+'%</span>'+(extraChip?(' '+extraChip):'')+'</div>'+
  '</div>';
}
async function wmsMonitorLoadStats(){
  const summaryBox=document.getElementById('mon-summary');
  const cardsBox=document.getElementById('mon-cards');
  if(!cardsBox)return;
  cardsBox.innerHTML='<div class="no-results">Загружаю статистику…</div>';
  try{
    const to=new Date();
    const from=new Date(to.getTime()-12*3600*1000);
    const raw=await wmsCallNative('lookupWmsActivityStats',[from.toISOString(),to.toISOString()],30000);
    const v=raw&&raw.value?raw.value:raw||{};
    const kdk=v.pickByLineStats||null;
    const piece=v.pieceSelectionStats||null;
    // Общая сводка — сумма КДК + штучного (паллетный сознательно не считаем).
    const sum=(field)=>{
      const a=(kdk&&kdk[field])||{tasksCount:0,tasksStocksTotalWeightInGrams:0};
      const b=(piece&&piece[field])||{tasksCount:0,tasksStocksTotalWeightInGrams:0};
      return {tasksCount:(a.tasksCount||0)+(b.tasksCount||0),tasksStocksTotalWeightInGrams:(a.tasksStocksTotalWeightInGrams||0)+(b.tasksStocksTotalWeightInGrams||0)};
    };
    const totalAll=sum('totalTasks'), doneAll=sum('completedTasks'), leftAll=sum('remainingTasks'), lastHourAll=sum('lastHourCompletedTasks');
    const pctAll=totalAll.tasksCount>0?Math.round(doneAll.tasksCount/totalAll.tasksCount*100):0;
    if(summaryBox)summaryBox.innerHTML='<div class="gen-box" style="border-left:3px solid var(--gold);padding:14px;margin-bottom:12px;">'+
      '<div style="font-size:12px;color:var(--muted);margin-bottom:2px;">За последние 12ч</div>'+
      '<div style="font-size:22px;font-weight:800;margin-bottom:10px;">'+escHtml(lastHourAll.tasksCount)+' задач <span style="font-size:14px;font-weight:600;color:var(--muted);">· '+Math.round((lastHourAll.tasksStocksTotalWeightInGrams||0)/1000)+' кг за час</span></div>'+
      '<div class="stats" style="margin-bottom:10px;">'+
        wmsMonitorStatBlock('осталось','var(--warn)',leftAll)+
        wmsMonitorStatBlock('выполнено','var(--ok)',doneAll)+
        wmsMonitorStatBlock('всего','',totalAll)+
      '</div>'+
      '<div class="bar-track" style="height:8px;border-radius:99px;background:var(--bg2);overflow:hidden;"><div style="height:100%;border-radius:99px;background:linear-gradient(90deg,var(--gold),#f0c96b);width:'+pctAll+'%;"></div></div>'+
      '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:6px;"><span>Выполненные задачи</span><span class="mono">'+pctAll+'%</span></div>'+
    '</div>';
    cardsBox.innerHTML=wmsMonitorCategoryCard('Раскладка КДК',kdk)+wmsMonitorCategoryCard('Штучный отбор',piece);
  }catch(e){
    if(summaryBox)summaryBox.innerHTML='';
    cardsBox.innerHTML='<div class="no-results">Не удалось загрузить статистику: '+escHtml((e&&e.message)||String(e))+'</div>';
  }
}
window.wmsMonitorLoadStats=wmsMonitorLoadStats;
function renderMonitor(){
  wmsMonitorLoadStats();
  wmsMonitorLoadInProgress();
}
window.renderMonitor=renderMonitor;
// Живой список: кто прямо сейчас отбирает ЕО (КДК по линии / штучно) — реальный эндпоинт activity-monitor.
async function wmsMonitorLoadInProgress(){
  const box=document.getElementById('monitor-live'); if(!box)return;
  const countEl=document.getElementById('mon-live-count');
  box.innerHTML='<div class="no-results">Загружаю…</div>';
  try{
    const raw=await wmsCallNative('lookupWmsActivityInProgress',[],30000);
    const v=raw&&raw.value?raw.value:raw||{};
    const byLine=Array.isArray(v.pickByLineHandlingUnitsInProgress)?v.pickByLineHandlingUnitsInProgress:[];
    const piece=Array.isArray(v.pieceSelectionHandlingUnitsInProgress)?v.pieceSelectionHandlingUnitsInProgress:[];
    const all=byLine.map(x=>Object.assign({},x,{kind:'КДК'})).concat(piece.map(x=>Object.assign({},x,{kind:'Штучно'})));
    if(countEl)countEl.textContent=all.length?('· '+all.length):'';
    if(!all.length){box.innerHTML='<div class="no-results">Сейчас никто не отбирает ЕО.</div>';return;}
    all.sort((a,b)=>new Date(a.startedAt||0)-new Date(b.startedAt||0));
    box.innerHTML=all.map(x=>{
      const u=x.user||{};
      const name=[u.lastName,u.firstName].filter(Boolean).join(' ')||'Без имени';
      const started=new Date(x.startedAt||0).getTime();
      const mins=started?Math.max(0,Math.round((Date.now()-started)/60000)):null;
      const stale=mins!==null&&mins>30;
      return '<div class="mon-person'+(stale?' stale':'')+'">'+
        '<div class="mon-person-top"><b>'+escHtml(name)+'</b><span class="mon-kind">'+escHtml(x.kind)+'</span></div>'+
        '<div class="mon-person-meta mono">ЕО '+escHtml(x.handlingUnitBarcode||'—')+(x.cityName?(' · '+escHtml(x.cityName)):'')+'</div>'+
        (mins!==null?'<div class="mon-person-time'+(stale?' stale':'')+'">'+(stale?'⚠ висит уже ':'')+mins+' мин</div>':'')+
      '</div>';
    }).join('');
  }catch(e){
    box.innerHTML='<div class="no-results">'+escHtml((e&&e.message)||String(e))+'</div>';
    if(countEl)countEl.textContent='';
  }
}
window.wmsMonitorLoadInProgress=wmsMonitorLoadInProgress;

function reportPeriod(){
  const from=document.getElementById('report-from').value;
  const to=document.getElementById('report-to').value;
  const box=document.getElementById('report-period-result');
  if(!from||!to){box.innerHTML='<div style="color:var(--muted);font-size:12px;">Укажите даты с и по.</div>';return;}
  if(from>to){box.innerHTML='<div style="color:var(--muted);font-size:12px;">Начало позже конца.</div>';return;}
  const all=getReportAll();
  const totals={}; let days=0, grand=0;
  Object.keys(all).forEach(k=>{
    if(k>=from && k<=to){
      days++;
      (all[k].tasks||[]).forEach(t=>{
        totals[t.name]=(totals[t.name]||0)+(t.qty||0);
        grand+=(t.qty||0);
      });
    }
  });
  const names=Object.keys(totals).filter(n=>totals[n]>0).sort((a,b)=>totals[b]-totals[a]);
  if(!days){box.innerHTML='<div style="color:var(--muted);font-size:12px;">Нет данных за этот период.</div>';return;}
  let h='<div style="font-size:11px;color:var(--muted);margin-bottom:10px;">Дней с данными: '+days+'</div>';
  names.forEach(n=>{
    h+='<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);"><span style="font-size:13px;color:var(--text);">'+n+'</span><span style="font-family:\'JetBrains Mono\',monospace;font-weight:700;color:var(--gold);">'+totals[n]+'</span></div>';
  });
  h+='<div style="display:flex;justify-content:space-between;padding:10px 0 0;margin-top:6px;border-top:2px solid var(--line);"><span style="font-family:-apple-system,\'Segoe UI\',Roboto,Inter,system-ui,sans-serif;font-size:12px;color:var(--muted);letter-spacing:1px;">Всего</span><span style="font-family:\'Spectral\',serif;font-weight:600;font-size:20px;color:var(--gold);">'+grand+'</span></div>';
  h+='<button onclick="sharePeriod(\''+from+'\',\''+to+'\')" class="exi-btn" style="width:100%;margin-top:12px;">📤 Отправить сводку</button>';
  box.innerHTML=h;
}
function sharePeriod(from,to){
  const all=getReportAll();const totals={};let grand=0;
  Object.keys(all).forEach(k=>{if(k>=from&&k<=to){(all[k].tasks||[]).forEach(t=>{totals[t.name]=(totals[t.name]||0)+(t.qty||0);grand+=(t.qty||0);});}});
  const names=Object.keys(totals).filter(n=>totals[n]>0).sort((a,b)=>totals[b]-totals[a]);
  let txt='СВОДКА '+from.split('-').reverse().join('.')+' — '+to.split('-').reverse().join('.')+'\n\n';
  names.forEach(n=>{txt+=n+': '+totals[n]+'\n';});
  txt+='\nВСЕГО: '+grand;
  shareText(txt);
}
function shareReport(){
  const day=ensureReportToday();
  let txt='ОТЧЁТ '+new Date().toLocaleDateString('ru')+'\n\n';
  day.tasks.forEach(t=>{txt+=t.name+': '+(t.qty||0)+'\n';});
  txt+='\nВСЕГО: '+day.tasks.reduce((s,t)=>s+(t.qty||0),0);
  shareText(txt);
}

function reportExportTSV(){
  const day=ensureReportToday();
  const date=new Date().toLocaleDateString('ru');
  const rows=[['Дата','Задача','Кол-во']];
  day.tasks.forEach((t,idx)=>rows.push([idx===0?date:'',t.name||'',parseInt(t.qty)||0]));
  return rows.map(r=>r.map(v=>String(v ?? '').replace(/\t/g,' ').replace(/\r?\n/g,' ')).join('\t')).join('\n');
}
function copyReportTSV(){
  const text=reportExportTSV();
  navigator.clipboard.writeText(text).then(()=>alert('TSV отчёта скопирован. Можно вставлять в Excel.')).catch(()=>{
    const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);alert('TSV отчёта скопирован. Можно вставлять в Excel.');
  });
}

// ── FULL BACKUP ──
function makeBackupData(){
  const localSnapshot={};
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      localSnapshot[k]=localStorage.getItem(k);
    }
  }catch(e){}
  return {
    custom_items:getCustomItems(),
    custom_barcodes:getCustomBarcodes(),
    product_edits:getProductEdits(),
    cells:getCells(),
    cell_favorites:getCellFavs(),
    pack_sizes:getPackSizes(),
    notes:getNotes(),
    credentials:getCreds(),
    eo_codes:getEOCodes(),
    journal:getJournal(),
    report:getReportAll(),
    search_history:get('search_history'),
    inventory:getInv(),
    favorites:getFavs(),
    eo_range_saved:get('eo_range_saved'),
    eo_range_used:getObj('eo_range_used'),
    hh11_log:getHH11(),
    rk_log:getRK(),
    problems_log:getProblems(),
    action_log:getActionLog(),
    eo_checked:getEoCheckedMap(),
    tier_cell_marks:getTierMarksMap(),
    eo_pos_marks:getEoPosMarksMap(),
    fav_cells:getFavCellsMap(),
    members_dir:getMembersDir(),
    chat_cache:getObj('chat_cache'),
    chat_topics:getChatTopics(),
    localStorage_snapshot:localSnapshot,
    catalog_snapshot:CATALOG,
    backup_version:23,
    exported_at:new Date().toISOString()
  };
}
let backupPartFull='';
let backupPartIndex=0;
const BACKUP_PART_SIZE=45000;
function backupDateStamp(){
  return new Date().toLocaleDateString('ru').replace(/\./g,'-');
}
function backupFileName(ext){
  ext=ext||'json';
  return 'enfer-backup-'+backupDateStamp()+'.'+ext;
}
function backupText(pretty){
  return JSON.stringify(makeBackupData(),null,pretty?2:0);
}
const AUTO_BACKUP_KEY='lenfer_auto_backups_v1';
function getAutoBackups(){try{const v=JSON.parse(localStorage.getItem(AUTO_BACKUP_KEY)||'[]');return Array.isArray(v)?v:[];}catch(e){return [];}}
function saveAutoBackups(arr){try{localStorage.setItem(AUTO_BACKUP_KEY,JSON.stringify((arr||[]).slice(0,7)));}catch(e){console.warn('auto backup save failed',e);}}
function createAutoBackup(label,throttleMs){
  try{
    const nowTs=Date.now();
    const arr=getAutoBackups();
    throttleMs=Number(throttleMs||0);
    if(throttleMs && arr[0] && (nowTs-Number(arr[0].ts||0)<throttleMs) && String(arr[0].label||'')===String(label||''))return false;
    const rec={id:nowTs+'-'+Math.random().toString(36).slice(2,7),ts:nowTs,iso:new Date().toISOString(),label:String(label||'auto'),json:backupText(false)};
    arr.unshift(rec);saveAutoBackups(arr);
    renderAutoBackups();
    logAction('backup','Автобэкап: '+(label||'auto'));
    return true;
  }catch(e){console.warn('auto backup failed',e);return false;}
}
function formatAutoBackupTs(ts){try{return new Date(Number(ts)||Date.now()).toLocaleString('ru-RU');}catch(e){return ''+ts;}}
function renderAutoBackups(){
  const box=document.getElementById('auto-backup-list');if(!box)return;
  const arr=getAutoBackups();
  if(!arr.length){box.innerHTML='<div class="no-results" style="padding:12px;">Автобэкапов пока нет</div>';return;}
  box.innerHTML=arr.map((b,i)=>'<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:9px 10px;margin-bottom:7px;">'+
    '<div style="font-size:11px;color:var(--text);line-height:1.35;"><b style="color:var(--gold);">'+escHtml(formatAutoBackupTs(b.ts))+'</b><br>'+escHtml(b.label||'auto')+'</div>'+ 
    '<div style="display:flex;gap:6px;margin-top:7px;"><button class="exi-btn" onclick="downloadAutoBackup('+i+')">⬇ JSON</button><button class="exi-btn" onclick="restoreAutoBackup('+i+')">↩ Восстановить</button></div></div>').join('');
}
function downloadAutoBackup(i){const b=getAutoBackups()[i];if(!b)return;downloadTextAsFile(b.json||'', 'lenfer-autobackup-'+String(b.iso||'').replace(/[:.]/g,'-')+'.json','application/json;charset=utf-8');}
function restoreAutoBackup(i){const b=getAutoBackups()[i];if(!b)return;if(!confirm('Восстановить этот автобэкап полностью? Текущие локальные данные будут заменены.'))return;createAutoBackup('перед восстановлением автобэкапа',0);applyBackupData(parseBackupRawText(b.json||''),{mode:'replace'});afterFullRestore();}
function clearAutoBackups(){if(!confirm('Удалить сохранённые автобэкапы на этом устройстве?'))return;saveAutoBackups([]);renderAutoBackups();}
function setBackupReadOnly(flag){
  const ta=document.getElementById('backup-text');
  if(ta)ta.readOnly=!!flag;
}
function setBackupModalText(text,readOnly){
  const ta=document.getElementById('backup-text');
  if(ta){
    ta.value=text||'';
    ta.readOnly=!!readOnly;
    ta.style.webkitUserSelect='text';
    ta.style.userSelect='text';
  }
}
function setBackupInfo(text){
  const el=document.getElementById('backup-part-info');
  if(el)el.textContent=text||'';
}
function setBackupPartControls(show){
  const el=document.getElementById('backup-part-controls');
  if(el)el.style.display=show?'flex':'none';
}
function openBackupModalText(text,info,readOnly){
  setBackupModalText(text,readOnly!==false);
  setBackupInfo(info||'');
  setBackupPartControls(false);
  openModal('backup-modal');
  setTimeout(()=>{const ta=document.getElementById('backup-text');if(ta){ta.focus();ta.setSelectionRange(0,0);}},80);
}
function exportData(){
  openBackupModalText(
    backupText(false),
    'Это JSON-бэкап. Главный способ: «Скачать JSON». Копирование — запасной вариант.',
    true
  );
}
function selectBackupText(){
  const ta=document.getElementById('backup-text');
  if(!ta)return;
  ta.focus();
  try{ta.setSelectionRange(0,ta.value.length);}catch(e){ta.select();}
}
function copyTextSmart(text){
  if(navigator.clipboard && window.isSecureContext){
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve,reject)=>{
    try{
      const ta=document.createElement('textarea');
      ta.value=text;
      ta.setAttribute('readonly','');
      ta.style.position='fixed';
      ta.style.left='0';
      ta.style.top='0';
      ta.style.opacity='0.01';
      ta.style.width='1px';
      ta.style.height='1px';
      document.body.appendChild(ta);
      ta.focus();
      ta.setSelectionRange(0,ta.value.length);
      const ok=document.execCommand('copy');
      document.body.removeChild(ta);
      ok?resolve():reject(new Error('copy failed'));
    }catch(e){reject(e);}
  });
}
function copyBackupText(){
  const ta=document.getElementById('backup-text');
  const text=(ta&&ta.value)||backupText(false);
  selectBackupText();
  copyTextSmart(text).then(()=>alert('JSON-бэкап скопирован.')).catch(()=>{
    alert('WebView запретил буфер. Текст выделен: попробуй системное меню копирования. Если не даёт — используй «Файлом», «TXT» или «Поделиться».');
  });
}
async function shareBackupFile(){
  const text=(document.getElementById('backup-text')?.value)||backupText(false);
  const name=backupFileName('json');
  try{
    if(!navigator.share)throw new Error('share unavailable');
    const file=new File([text],name,{type:'application/json'});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({title:'Бэкап L’Enfer',files:[file]});
    }else{
      await navigator.share({title:'Бэкап L’Enfer',text:text});
    }
  }catch(e){
    alert('Системное «Поделиться» недоступно в этой APK-обёртке. Используй TXT/JSON или кнопку «Окно».');
  }
}
async function shareBackupText(){
  const text=(document.getElementById('backup-text')?.value)||backupText(false);
  try{
    if(navigator.share){
      await navigator.share({title:'Бэкап L’Enfer',text:text});
    }else{
      throw new Error('share unavailable');
    }
  }catch(e){
    alert('Поделиться текстом не получилось. Попробуй «Файлом», TXT/JSON или «Окно».');
  }
}
function downloadTextAsFile(text,name,type){
  try{
    const blob=new Blob([text],{type:type||'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=name;
    a.rel='noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }catch(e){
    openBackupPlainPage();
  }
}

function printBackupPdf(){
  const text=(document.getElementById('backup-text')?.value)||backupText(false);
  const sheet=document.getElementById('print-backup-sheet');
  if(!sheet){alert('Печатный блок не найден.');return;}
  const stamp=new Date().toLocaleString('ru');
  sheet.textContent='LENFER BACKUP / PDF\nДата: '+stamp+'\n\n'+text;
  alert('Сейчас откроется печать Android. Выбери «Сохранить как PDF». Это не буфер и не скачивание, поэтому обычно работает даже в кривой APK-обёртке.');
  setTimeout(()=>{
    try{window.print();}
    catch(e){alert('Печать недоступна в этой APK-обёртке. Тогда остаётся только обновление APK с нормальным WebView или вытаскивание через ПК/root.');}
  },250);
}

function downloadBackupBlob(){
  const text=(document.getElementById('backup-text')?.value)||backupText(false);
  setBackupModalText(text,true);
  downloadTextAsFile(text,backupFileName('json'),'application/json;charset=utf-8');
}
function downloadBackupTxt(){
  const text=(document.getElementById('backup-text')?.value)||backupText(false);
  setBackupModalText(text,true);
  downloadTextAsFile(text,backupFileName('txt'),'text/plain;charset=utf-8');
}


function addedProductsData(){
  const items=getCustomItems().map(x=>({...x}));
  const itemUts=new Set(items.map(x=>String(x.ut||'').trim()).filter(Boolean));
  const customBarcodes=getCustomBarcodes();
  const edits=getProductEdits();
  const packs=getPackSizes();
  const addedBarcodes={};
  const addedEdits={};
  const addedPackSizes={};
  itemUts.forEach(ut=>{
    if(Object.prototype.hasOwnProperty.call(customBarcodes,ut))addedBarcodes[ut]=customBarcodes[ut];
    if(Object.prototype.hasOwnProperty.call(edits,ut))addedEdits[ut]=edits[ut];
    if(Object.prototype.hasOwnProperty.call(packs,ut))addedPackSizes[ut]=packs[ut];
  });
  return {
    type:'lenfer-added-products',
    backup_version:23,
    exported_at:new Date().toISOString(),
    count:items.length,
    custom_items:items,
    custom_barcodes:addedBarcodes,
    product_edits:addedEdits,
    pack_sizes:addedPackSizes
  };
}
function addedProductsFileName(ext){
  ext=ext||'json';
  return 'enfer-added-products-'+backupDateStamp()+'.'+ext;
}
function exportAddedProductsJSON(){
  const data=addedProductsData();
  if(!data.custom_items.length){alert('Добавленных товаров нет.');return;}
  downloadTextAsFile(JSON.stringify(data,null,2),addedProductsFileName('json'),'application/json;charset=utf-8');
}
function exportAddedProductsTSV(){
  const data=addedProductsData();
  if(!data.custom_items.length){alert('Добавленных товаров нет.');return;}
  const rows=[['УТ','Наименование','ШК','Кратность','Картинка','Примечание']];
  data.custom_items.forEach(item=>{
    const ut=String(item.ut||'').trim();
    const barcodes=productBarcodeList(item).join(', ');
    const packs=getPackSizes();
    rows.push([ut,item.name||'',barcodes,packs[ut]||'',item.img||'',item._importReason||item.note||'']);
  });
  const text=rows.map(r=>r.map(v=>String(v??'').replace(/\t/g,' ').replace(/\r?\n/g,' ')).join('\t')).join('\n');
  downloadTextAsFile(text,addedProductsFileName('tsv'),'text/tab-separated-values;charset=utf-8');
}

function cellsExportData(){
  const cells=normalizeCellsArray(getCells()).map(c=>({...c}));
  return {
    type:'lenfer-cells',
    backup_version:23,
    exported_at:new Date().toISOString(),
    count:cells.length,
    cells:cells,
    cell_favorites:getCellFavs(),
    localStorage_snapshot:{
      cells:JSON.stringify(cells),
      cells__mirror:JSON.stringify(cells),
      cell_favorites:JSON.stringify(getCellFavs()),
      cell_favorites__mirror:JSON.stringify(getCellFavs())
    }
  };
}
function cellsFileName(ext){
  ext=ext||'json';
  return 'enfer-cells-'+backupDateStamp()+'.'+ext;
}
function exportCellsJSON(){
  const data=cellsExportData();
  if(!data.cells.length){alert('Ячеек нет.');return;}
  downloadTextAsFile(JSON.stringify(data,null,2),cellsFileName('json'),'application/json;charset=utf-8');
}
function exportCellsTSV(){
  const data=cellsExportData();
  if(!data.cells.length){alert('Ячеек нет.');return;}
  const favs=new Set(getCellFavs());
  const rows=[['Адрес','Название','Код','Избранное','ID']];
  data.cells.forEach(c=>rows.push([c.addr||'',c.name||'',c.code||'',favs.has(c.addr)?'1':'',c.id||'']));
  const text=rows.map(r=>r.map(v=>String(v??'').replace(/\t/g,' ').replace(/\r?\n/g,' ')).join('\t')).join('\n');
  downloadTextAsFile(text,cellsFileName('tsv'),'text/tab-separated-values;charset=utf-8');
}

function openBackupPlainPage(){
  const text=(document.getElementById('backup-text')?.value)||backupText(false);
  const safe=String(text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const html=[
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Backup L’Enfer</title>',
    '<style>',
    'body{margin:0;background:#111;color:#eee;font-family:Arial,sans-serif}',
    'textarea{box-sizing:border-box;width:100vw;height:100vh;padding:14px;border:0;background:#fff;color:#111;font:12px monospace;white-space:pre;user-select:text;-webkit-user-select:text}',
    '</style></head><body>',
    '<textarea id="t" readonly>', safe, '</textarea>',
    '<script>setTimeout(function(){var t=document.getElementById("t");t.focus();t.setSelectionRange(0,0);},100);<\\/script>',
    '</body></html>'
  ].join('');
  const w=window.open('','_blank');
  if(w){w.document.open();w.document.write(html);w.document.close();}
  else{alert('Новое окно заблокировано. Используй TXT/JSON или «Поделиться».');}
}
function backupPartTotal(){
  return Math.max(1,Math.ceil((backupPartFull||'').length/BACKUP_PART_SIZE));
}
function renderBackupPart(){
  if(!backupPartFull)backupPartFull=backupText(false);
  const total=backupPartTotal();
  backupPartIndex=Math.min(Math.max(0,backupPartIndex),total-1);
  const start=backupPartIndex*BACKUP_PART_SIZE;
  const end=Math.min(backupPartFull.length,start+BACKUP_PART_SIZE);
  const part=backupPartFull.slice(start,end);
  const header='=== LENFER BACKUP PART '+(backupPartIndex+1)+'/'+total+' ===';
  const footer='=== END PART '+(backupPartIndex+1)+'/'+total+' ===';
  setBackupModalText(header+'\n'+part+'\n'+footer,true);
  setBackupInfo('Часть '+(backupPartIndex+1)+' из '+total+'. Сохрани все части подряд. Восстановление умеет склеивать такие части.');
  setBackupPartControls(total>1);
}
function openBackupParts(){
  backupPartFull=backupText(false);
  backupPartIndex=0;
  openModal('backup-modal');
  renderBackupPart();
}
function backupPartPrev(){
  if(!backupPartFull)return;
  backupPartIndex--;
  renderBackupPart();
}
function backupPartNext(){
  if(!backupPartFull)return;
  backupPartIndex++;
  renderBackupPart();
}
function normalizeBackupRaw(raw){
  raw=(raw||'').trim();
  const re=/=== LENFER BACKUP PART (\d+)\/(\d+) ===\n([\s\S]*?)\n=== END PART \1\/\2 ===/g;
  const parts=[];
  let m;
  while((m=re.exec(raw))){parts.push({n:+m[1],total:+m[2],text:m[3]});}
  if(parts.length){
    parts.sort((a,b)=>a.n-b.n);
    return parts.map(p=>p.text).join('');
  }
  return raw;
}
function parseBackupRawText(raw){
  raw=normalizeBackupRaw(String(raw||'').replace(/^\uFEFF/,''));
  raw=(raw||'').trim();
  if(!raw)throw new Error('empty_json');
  try{return JSON.parse(raw);}
  catch(firstErr){
    const start=raw.indexOf('{');
    const end=raw.lastIndexOf('}');
    if(start>=0 && end>start){
      const cut=raw.slice(start,end+1).trim();
      try{return JSON.parse(cut);}catch(secondErr){}
    }
    throw firstErr;
  }
}
function openBackupPaste(){
  backupPartFull='';
  setBackupModalText('',false);
  setBackupInfo('Вставь полный JSON или все части бэкапа подряд. Можно вставить руками или нажать «Вставить из буфера».');
  setBackupPartControls(false);
  openModal('backup-modal');
  setTimeout(()=>{
    const ta=document.getElementById('backup-text');
    if(ta){
      ta.readOnly=false;
      ta.disabled=false;
      ta.removeAttribute('readonly');
      ta.focus();
      try{ta.setSelectionRange(0,ta.value.length);}catch(e){}
    }
  },120);
}
function clearBackupPasteText(){
  setBackupModalText('',false);
  setBackupInfo('Поле очищено. Вставь JSON руками или через кнопку «Вставить из буфера».');
  setTimeout(()=>document.getElementById('backup-text')?.focus(),80);
}
async function pasteBackupFromClipboard(){
  const ta=document.getElementById('backup-text');
  if(!ta)return;
  try{
    if(!(navigator.clipboard&&navigator.clipboard.readText))throw new Error('clipboard unavailable');
    const text=await navigator.clipboard.readText();
    ta.readOnly=false;
    ta.disabled=false;
    ta.removeAttribute('readonly');
    ta.value=text||'';
    setBackupInfo('Вставлено из буфера: '+(ta.value.length||0)+' символов. Теперь выбери «Добавить» или «Полностью восстановить».');
    ta.focus();
  }catch(e){
    ta.readOnly=false;
    ta.disabled=false;
    ta.removeAttribute('readonly');
    ta.focus();
    alert('Браузер не дал прочитать буфер. Зажми поле и выбери «Вставить» вручную.');
  }
}
const BACKUP_STATE_KEYS=[
  'custom_items','custom_barcodes','product_edits','cells','cell_favorites','pack_sizes','notes','credentials','eo_codes','journal','report','search_history','inventory','favorites','eo_range_saved','eo_range_used','hh11_log','rk_log','instock_log','problems_log','action_log','audit_log','user_profile','eo_checked','tier_cell_marks','eo_pos_marks','fav_cells','members_dir','chat_cache','chat_topics'
];
const BACKUP_MIRROR_KEYS=['credentials__mirror','cells__mirror','cell_favorites__mirror','credentials__saved_at','cells__saved_at','cell_favorites__saved_at'];
function backupOwn(obj,key){return Object.prototype.hasOwnProperty.call(obj||{},key);}
function backupArr(v){return Array.isArray(v)?v:[];}
function backupObj(v){return (v && typeof v==='object' && !Array.isArray(v))?v:{};}

function backupParseArrayMaybe(v){
  if(Array.isArray(v))return v;
  if(typeof v==='string' && v.trim()){
    try{const parsed=JSON.parse(v);return Array.isArray(parsed)?parsed:[];}catch(e){return [];}
  }
  return [];
}
function backupExtractCells(data){
  data=data||{};
  let cells=backupParseArrayMaybe(data.cells);
  if(cells.length)return cells;
  if(data.localStorage_snapshot && typeof data.localStorage_snapshot==='object'){
    cells=backupParseArrayMaybe(data.localStorage_snapshot.cells);
    if(cells.length)return cells;
    cells=backupParseArrayMaybe(data.localStorage_snapshot.cells__mirror);
    if(cells.length)return cells;
  }
  return [];
}
function clearBackupLocalState(){
  try{
    BACKUP_STATE_KEYS.concat(BACKUP_MIRROR_KEYS).forEach(k=>localStorage.removeItem(k));
  }catch(e){console.warn('clear backup state failed',e);}
}
function normalizeBackupData(data){
  if(data && data.state && typeof data.state==='object')data=data.state;
  if(data && data.appState && typeof data.appState==='object')data=data.appState;
  return data||{};
}
function applyBackupData(data,opts){
  opts=opts||{};
  data=normalizeBackupData(data);
  const mode=opts.mode||'replace';

  if(mode==='merge'){
    const stats={mode:'merge',added:{custom_items:0,custom_barcodes:0,product_edits:0,cells:0,cell_favorites:0,pack_sizes:0,notes:0,credentials:0,eo_codes:0,journal:0,report:0,search_history:0,inventory:0,favorites:0,eo_range_saved:0,eo_range_used:0,hh11_log:0,rk_log:0,instock_log:0,problems_log:0,action_log:0,audit_log:0,unknown_keys:0},conflicts:[]};
    const stamp=Date.now().toString(36);
    const same=(a,b)=>{try{return JSON.stringify(a)===JSON.stringify(b);}catch(e){return false;}};
    const uniqId=()=>Date.now()+Math.floor(Math.random()*1000000);
    const mark=(obj,reason)=>({...obj,_imported:true,_importedAt:new Date().toISOString(),_importReason:reason});
    const conflictCustomItem=(ut,name,barcode,reason)=>{
      const custom=getCustomItems();
      const originalUt=String(ut||'').trim()||('JSON-'+uniqId());
      const dupUt=originalUt+' ·ДУБЛЬ·'+stamp+'-'+(stats.conflicts.length+1);
      custom.unshift(mark({ut:dupUt,originalUt:originalUt,name:'[ДУБЛЬ JSON: '+originalUt+'] '+String(name||'Без названия'),barcode:String(barcode||''),img:'',custom:true,conflict:true},reason));
      set('custom_items',custom);
      stats.added.custom_items++;
      stats.conflicts.push(reason+' / '+originalUt);
    };
    const addArrayById=(key,getter,setter,idFn)=>{
      const incoming=backupArr(data[key]);
      if(!incoming.length)return;
      const ex=getter();
      const idx=new Map(ex.map(x=>[String(idFn(x)),x]));
      incoming.forEach(x=>{
        const id=String(idFn(x));
        if(!id || id==='undefined' || id==='null'){
          ex.unshift(mark({...x,id:uniqId()},key+': нет id'));
          stats.added[key]++;return;
        }
        if(!idx.has(id)){ex.unshift(x);idx.set(id,x);stats.added[key]++;return;}
        if(!same(idx.get(id),x)){
          const copy=mark({...x,id:uniqId()},key+': конфликт id '+id+', создан дубль');
          ex.unshift(copy);stats.added[key]++;stats.conflicts.push(key+' id '+id);
        }
      });
      setter(ex);
    };
    const mergePlainObjectMissing=(key,getter,setter)=>{
      const incoming=backupObj(data[key]);
      const ex=getter();
      Object.keys(incoming).forEach(k=>{
        if(!backupOwn(ex,k)){ex[k]=incoming[k];stats.added[key]++;}
        else if(!same(ex[k],incoming[k])){stats.conflicts.push(key+' '+k);}
      });
      setter(ex);
    };

    // Товары: ничего существующее не перетираем. Конфликтные артикулы уводим в отдельный дубль.
    if(data.custom_items){
      const ex=getCustomItems();
      const byUt=new Map(ex.map(x=>[String(x.ut||''),x]));
      backupArr(data.custom_items).forEach(item=>{
        const ut=String(item&&item.ut||'').trim();
        if(!ut)return;
        if(!byUt.has(ut)){ex.unshift(item);byUt.set(ut,item);stats.added.custom_items++;}
        else if(!same(byUt.get(ut),item)){
          const dup={...item,ut:ut+' ·ДУБЛЬ·'+stamp+'-'+(stats.conflicts.length+1),originalUt:ut,name:'[ДУБЛЬ JSON: '+ut+'] '+String(item.name||'Без названия'),custom:true,conflict:true,_imported:true,_importedAt:new Date().toISOString()};
          ex.unshift(dup);stats.added.custom_items++;stats.conflicts.push('custom_items '+ut);
        }
      });
      set('custom_items',ex);
    }
    if(data.product_edits){
      const ex=getProductEdits();
      const incoming=backupObj(data.product_edits);
      Object.keys(incoming).forEach(k=>{
        const v=incoming[k];
        if(!backupOwn(ex,k)){ex[k]=v;stats.added.product_edits++;}
        else if(!same(ex[k],v)){conflictCustomItem(v.ut||k,v.name||('Правка '+k),v.barcode||'', 'product_edits конфликт '+k);}
      });
      set('product_edits',ex);
    }
    if(data.custom_barcodes){
      const ex=getCustomBarcodes();
      const incoming=backupObj(data.custom_barcodes);
      Object.keys(incoming).forEach(k=>{
        if(!backupOwn(ex,k)){ex[k]=incoming[k];stats.added.custom_barcodes++;}
        else if(String(ex[k]||'')!==String(incoming[k]||'')){conflictCustomItem(k,'ШК из JSON для '+k,incoming[k], 'custom_barcodes конфликт '+k);}
      });
      set('custom_barcodes',ex);
    }

    // Ячейки: если адрес свободен — добавляем. Если адрес занят, но данные другие — создаём дубль с новым адресом.
    const incomingCells=backupExtractCells(data);
    if(incomingCells.length){
      const ex=getCells();
      const byAddr=new Map(ex.map(c=>[String(c.addr||'').toUpperCase(),c]));
      backupArr(incomingCells).forEach(c=>{
        const addr=String(c&&c.addr||c&&c.cell||c&&c.address||'').trim();
        if(!addr)return;
        const key=addr.toUpperCase();
        const norm=normalizeCellRecord(c)||c;
        if(!byAddr.has(key)){ex.unshift(norm);byAddr.set(key,norm);stats.added.cells++;}
        else if(!same(byAddr.get(key),norm)){
          const dup=normalizeCellRecord({...norm,addr:addr+' ·ДУБЛЬ·'+stamp+'-'+(stats.conflicts.length+1),name:'[ДУБЛЬ JSON: '+addr+'] '+String(norm.name||''),id:uniqId(),conflict:true})||norm;
          ex.unshift(dup);stats.added.cells++;stats.conflicts.push('cells '+addr);
        }
      });
      set('cells',ex);
    }

    if(data.cell_favorites){const ex=getCellFavs();const merged=Array.from(new Set([...ex,...backupArr(data.cell_favorites)]));stats.added.cell_favorites=Math.max(0,merged.length-ex.length);set('cell_favorites',merged);}
    mergePlainObjectMissing('pack_sizes',getPackSizes,(v)=>set('pack_sizes',v));
    mergePlainObjectMissing('report',getReportAll,(v)=>set('report',v));
    mergePlainObjectMissing('eo_range_used',()=>getObj('eo_range_used'),(v)=>set('eo_range_used',v));
    addArrayById('notes',getNotes,(v)=>set('notes',v),x=>x.id);
    addArrayById('credentials',getCreds,(v)=>set('credentials',v),x=>x.id);
    addArrayById('eo_codes',getEOCodes,(v)=>set('eo_codes',v),x=>x.id||x.code);
    addArrayById('journal',getJournal,(v)=>set('journal',v),x=>x.id);
    addArrayById('inventory',getInv,(v)=>set('inventory',v),x=>x.id);

    // HH 1-1: отдельная логика слияния.
    // Раньше импорт сверял только id: если на телефоне строка уже была изменена
    // (например, отмечена как размещённая), JSON с тем же id считался конфликтом и
    // создавал дубль. А строки «не числится» могли не попасть, если лежали только
    // в localStorage_snapshot старого бэкапа. Теперь сверяем по смыслу строки.
    (function mergeHH11Log(){
      const incomingRaw=[];
      const addIncoming=(v)=>{ if(Array.isArray(v)) incomingRaw.push(...v); };
      addIncoming(data.hh11_log);
      addIncoming(data.hh11);
      addIncoming(data.hh_1_1);
      addIncoming(data.hh11Log);
      if(data.localStorage_snapshot && typeof data.localStorage_snapshot==='object'){
        ['hh11_log','hh11','hh_1_1','hh11Log'].forEach(k=>{
          const raw=data.localStorage_snapshot[k];
          if(typeof raw==='string'){
            try{addIncoming(JSON.parse(raw));}catch(e){}
          }else addIncoming(raw);
        });
      }
      if(!incomingRaw.length)return;

      const arr=getHH11();
      const normalizeMode=(x)=>{
        const raw=String((x&&x.mode) || (x&&x.status) || '').toLowerCase().trim();
        if(raw==='found'||raw==='not_found'||raw==='not-listed'||raw==='not_listed'||raw==='unlisted'||raw==='не числится'||raw==='нечислится')return 'found';
        if(x && (x.listed===false || x.isListed===false || x.notListed===true))return 'found';
        return 'listed';
      };
      const normRow=(x)=>{
        const r={...(x||{})};
        r.mode=normalizeMode(r);
        r.eo=normalizeEOCode(r.eo || r.EO || r.eoCode || r.code || '');
        r.ut=String(r.ut || r.article || r.nomenclatureCode || r.sku || '').trim();
        r.name=String(r.name || r.title || r.productName || '').trim();
        r.sys=r.mode==='listed' ? Math.max(0,parseInt(r.sys ?? r.system ?? r.systemQty ?? r.qtySystem ?? 0)||0) : '';
        r.fact=Math.max(0,parseInt(r.fact ?? r.qty ?? r.found ?? r.factQty ?? 0)||0);
        r.comment=String(r.comment || '').trim();
        r.mismatch=r.mismatch?1:0;
        r.placed=r.placed?1:0;
        r.shortage=r.shortage?1:0;
        r.ts=r.ts || r.time || new Date().toLocaleString('ru-RU');
        if(!r.id)r.id=uniqId();
        return r;
      };
      const semanticKey=(x)=>{
        const r=normRow(x);
        // Для дедупликации сознательно НЕ учитываем placed/shortage/ts/id:
        // это состояние могло измениться локально, но сама строка та же.
        return [r.mode,String(r.eo||''),String(r.ut||'').toUpperCase(),String(r.name||'').toLowerCase(),String(r.sys||''),String(r.fact||''),String(r.comment||''),String(r.mismatch||0)].join('||');
      };
      const closeKey=(x)=>{
        const r=normRow(x);
        // Если совпали ЕО+УТ+режим, но количество/коммент другие — это уже конфликт.
        return [r.mode,String(r.eo||''),String(r.ut||'').toUpperCase()].join('||');
      };
      const exact=new Map(arr.map(x=>[semanticKey(x),x]));
      const close=new Map();
      arr.forEach(x=>{const k=closeKey(x);if(k)close.set(k,x);});
      const byId=new Map(arr.map(x=>[String(x.id),x]));
      const seenIncoming=new Set();

      incomingRaw.map(normRow).forEach(row=>{
        if(!row.ut && !row.name)return;
        const sk=semanticKey(row);
        if(seenIncoming.has(sk))return;
        seenIncoming.add(sk);

        if(exact.has(sk)){
          // Уже есть такая же строка: не дублируем.
          return;
        }

        const idKey=String(row.id||'');
        const idExisting=idKey ? byId.get(idKey) : null;
        if(idExisting && semanticKey(idExisting)===sk){
          return;
        }

        if(idExisting && semanticKey(idExisting)!==sk){
          // Один id, но смысл другой: сохраняем обе версии, даём новый id.
          row.id=uniqId();
          row._imported=true;
          row._importedAt=new Date().toISOString();
          row._importReason='HH 1-1: конфликт id, создан дубль';
          stats.conflicts.push('hh11_log id '+idKey);
        }else if(close.has(closeKey(row))){
          // Такой ЕО+УТ+режим уже есть, но qty/comment отличаются.
          // Не перетираем локальное — добавляем дубль для ручной разборки.
          row.id=uniqId();
          row._imported=true;
          row._importedAt=new Date().toISOString();
          row._importReason='HH 1-1: конфликт ЕО+УТ, создан дубль';
          stats.conflicts.push('hh11_log '+(row.eo||'')+' '+(row.ut||row.name||''));
        }

        arr.unshift(row);
        exact.set(semanticKey(row),row);
        close.set(closeKey(row),row);
        byId.set(String(row.id),row);
        stats.added.hh11_log++;

        // Если строка ссылается на кастомный/новый товар, но самого товара нет в каталоге,
        // создаём пользовательскую позицию, чтобы «не числится» не висело сиротой.
        try{
          const exists=productAllItems().some(p=>String(p.ut||'').toUpperCase()===String(row.ut||'').toUpperCase());
          if(row.ut && row.name && !exists){
            const ci=getCustomItems();
            ci.unshift(mark({ut:row.ut,name:row.name,barcode:'',img:'',custom:true},'создано из HH 1-1 при импорте'));
            set('custom_items',ci);
            stats.added.custom_items++;
          }
        }catch(e){}
      });
      set('hh11_log',arr);
    })();

    addArrayById('rk_log',getRK,(v)=>set('rk_log',v),x=>x.id);
    addArrayById('instock_log',getInstock,(v)=>set('instock_log',v),x=>x.id);
    addArrayById('problems_log',getProblems,(v)=>set('problems_log',v),x=>x.id);
    addArrayById('action_log',getActionLog,(v)=>set('action_log',v.slice(0,300)),x=>x.id);
    if(data.search_history){const ex=get('search_history');const merged=Array.from(new Set([...backupArr(data.search_history),...ex]));stats.added.search_history=Math.max(0,merged.length-ex.length);set('search_history',merged);}
    if(data.favorites){const ex=getFavs();const merged=Array.from(new Set([...ex,...backupArr(data.favorites)]));stats.added.favorites=Math.max(0,merged.length-ex.length);set('favorites',merged);}
    if(data.eo_range_saved){const cur=get('eo_range_saved');if(!cur.length){set('eo_range_saved',backupArr(data.eo_range_saved));stats.added.eo_range_saved=backupArr(data.eo_range_saved).length;}else if(!same(cur,data.eo_range_saved)){stats.conflicts.push('eo_range_saved оставлен локальный, входящий не перетёрт');}}

    // Неизвестные будущие ключи из полного снимка localStorage: добавляем только если локально такого ключа нет.
    if(data.localStorage_snapshot && typeof data.localStorage_snapshot==='object'){
      Object.keys(data.localStorage_snapshot).forEach(k=>{
        try{if(localStorage.getItem(k)===null){localStorage.setItem(k,data.localStorage_snapshot[k]);stats.added.unknown_keys++;}}catch(e){}
      });
    }
    try{repairCredentialsStorage();repairCellsStorage();}catch(e){}
    try{localStorage.setItem('last_merge_stats',JSON.stringify(stats));}catch(e){}
    return stats;
  }

  // Новый основной режим: полная замена локального состояния данными из JSON.
  // Так телефон больше не держит старые product_edits/custom_barcodes поверх файла с ПК.
  clearBackupLocalState();
  if(data.localStorage_snapshot && typeof data.localStorage_snapshot==='object'){
    try{Object.keys(data.localStorage_snapshot).forEach(k=>localStorage.setItem(k,data.localStorage_snapshot[k]));}catch(e){}
  }
  set('custom_items', backupArr(data.custom_items));
  set('custom_barcodes', backupObj(data.custom_barcodes));
  set('product_edits', backupObj(data.product_edits));
  set('cells', normalizeCellsArray(backupExtractCells(data)));
  set('cell_favorites', backupArr(data.cell_favorites));
  set('pack_sizes', backupObj(data.pack_sizes));
  set('notes', backupArr(data.notes));
  set('credentials', backupArr(data.credentials));
  set('eo_codes', backupArr(data.eo_codes));
  set('journal', backupArr(data.journal));
  set('report', backupObj(data.report));
  set('search_history', backupArr(data.search_history));
  set('inventory', backupArr(data.inventory));
  set('favorites', backupArr(data.favorites));
  set('eo_range_saved', backupArr(data.eo_range_saved));
  set('eo_range_used', backupObj(data.eo_range_used));
  set('hh11_log', backupArr(data.hh11_log));
  set('rk_log', backupArr(data.rk_log));
  set('instock_log', backupArr(data.instock_log));
  set('problems_log', backupArr(data.problems_log));
  if(data.audit_log)set('audit_log', backupArr(data.audit_log));
  if(data.user_profile)set('user_profile', backupObj(data.user_profile));
  if(data.eo_checked)set('eo_checked', backupObj(data.eo_checked));
  if(data.tier_cell_marks)set('tier_cell_marks', backupObj(data.tier_cell_marks));
  if(data.eo_pos_marks)set('eo_pos_marks', backupObj(data.eo_pos_marks));
  if(data.fav_cells)set('fav_cells', backupObj(data.fav_cells));
  if(data.members_dir)set('members_dir', backupObj(data.members_dir));
  if(data.chat_cache)set('chat_cache', backupObj(data.chat_cache));
  if(data.chat_topics)set('chat_topics', backupArr(data.chat_topics));
  set('action_log', backupArr(data.action_log).slice(0,300));

  try{repairCredentialsStorage();repairCellsStorage();}catch(e){}
  return {mode:'replace'};
}
function afterFullRestore(){
  try{repairCredentialsStorage();repairCellsStorage();}catch(e){}
  setTimeout(()=>location.reload(),250);
}
function restoreBackupFromText(){
  const raw=normalizeBackupRaw((document.getElementById('backup-text')?.value||'').trim());
  if(!raw){alert('Вставь JSON-бэкап.');return;}
  try{
    createAutoBackup('перед полным восстановлением из вставки',0);
    applyBackupData(parseBackupRawText(raw),{mode:'replace'});
    alert('JSON восстановлен полностью. Старые локальные данные заменены. Сейчас приложение перезагрузится.');
    closeModal('backup-modal');
    afterFullRestore();
  }catch(e){alert('Ошибка импорта JSON: '+(e && e.message ? e.message : e));}
}
function summarizeMergeStats(stats){
  const a=(stats&&stats.added)||{};
  const total=Object.values(a).reduce((s,n)=>s+(Number(n)||0),0);
  const conflicts=(stats&&stats.conflicts&&stats.conflicts.length)||0;
  return 'Добавление завершено. Новых записей: '+total+'. Конфликтов-дублей/неперетёртых полей: '+conflicts+'. Сейчас приложение перезагрузится.';
}
function restoreBackupMergeFromText(){
  const raw=normalizeBackupRaw((document.getElementById('backup-text')?.value||'').trim());
  if(!raw){alert('Вставь JSON-бэкап.');return;}
  try{
    createAutoBackup('перед добавлением из вставки',0);
    const stats=applyBackupData(parseBackupRawText(raw),{mode:'merge'});
    alert(summarizeMergeStats(stats));
    closeModal('backup-modal');
    afterFullRestore();
  }catch(e){console.error(e);alert('Ошибка импорта JSON: '+(e && e.message ? e.message : e));}
}
function importDataMerge(){
  const input=document.createElement('input');
  input.type='file';
  input.accept='.json,application/json,text/plain';
  input.style.display='none';
  input.onchange=e=>{
    const file=e.target.files&&e.target.files[0];
    if(!file){setTimeout(()=>input.remove(),500);return;}
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        createAutoBackup('перед добавлением из файла',0);
        const stats=applyBackupData(parseBackupRawText(ev.target.result),{mode:'merge'});
        alert(summarizeMergeStats(stats));
        afterFullRestore();
      }catch(err){console.error(err);alert('Ошибка импорта JSON: '+(err && err.message ? err.message : err));}
      setTimeout(()=>input.remove(),1000);
    };
    reader.onerror=()=>{alert('Не удалось прочитать файл.');setTimeout(()=>input.remove(),1000);};
    reader.readAsText(file);
  };
  document.body.appendChild(input);
  input.click();
}
function importData(){
  const input=document.createElement('input');
  input.type='file';
  input.accept='.json,application/json,text/plain';
  input.style.display='none';
  input.onchange=e=>{
    const file=e.target.files&&e.target.files[0];
    if(!file){setTimeout(()=>input.remove(),500);return;}
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        createAutoBackup('перед полным восстановлением из файла',0);
        applyBackupData(parseBackupRawText(ev.target.result),{mode:'replace'});
        alert('JSON восстановлен полностью. Старые локальные данные заменены. Сейчас приложение перезагрузится.');
        afterFullRestore();
      }catch(err){console.error(err);alert('Ошибка импорта JSON: '+(err && err.message ? err.message : err));}
      setTimeout(()=>input.remove(),1000);
    };
    reader.onerror=()=>{alert('Не удалось прочитать файл.');setTimeout(()=>input.remove(),1000);};
    reader.readAsText(file);
  };
  document.body.appendChild(input);
  input.click();
}

// ── INVENTORY BY CELL ──
const getInv = () => get('inventory');
function invCellFilter(el){
  // only latin letters, digits and dash, uppercase
  let v=el.value.toUpperCase().replace(/[^A-Z0-9-]/g,'');
  el.value=v;
}
function invPrefix(p){
  const el=document.getElementById('inv-cell');
  el.value=p;el.focus();
}
function invClearCell(){document.getElementById('inv-cell').value='';}
function addInv(){
  const cell=document.getElementById('inv-cell').value.trim().toUpperCase();
  const prod=document.getElementById('inv-prod').value.trim();
  const qty=parseInt(document.getElementById('inv-qty').value)||0;
  if(!cell){alert('Введите ячейку');return;}
  const list=getInv();
  list.unshift({id:Date.now(),cell,prod,qty,time:new Date().toLocaleString('ru',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})});
  set('inventory',list);
  document.getElementById('inv-cell').value='';
  document.getElementById('inv-prod').value='';
  document.getElementById('inv-qty').value='';
  renderInv();
}
function delInv(id){set('inventory',getInv().filter(r=>r.id!==id));renderInv();}
function clearInv(){if(!confirm('Очистить весь лист инвентаризации?'))return;set('inventory',[]);renderInv();}
function renderInv(){
  const list=getInv();
  const box=document.getElementById('inv-list');
  const acts=document.getElementById('inv-actions');
  const cells=new Set(list.map(r=>r.cell));
  document.getElementById('inv-count').textContent=cells.size+' ячеек';
  if(!list.length){box.innerHTML='<div class="no-results" style="padding:24px;">Список пуст</div>';acts.style.display='none';return;}
  acts.style.display='flex';
  box.innerHTML=list.map(r=>{
    let items='';
    if(r.items&&r.items.length){
      items=r.items.map(it=>{
        let dh='';
        if(it.sys!=null){const d=it.qty-it.sys;const col=d===0?'var(--ok)':(d>0?'var(--warn)':'var(--red)');const sg=d>0?'+':'';dh=' <span style="color:'+col+';font-size:10px;">(сист '+it.sys+', '+sg+d+')</span>';}
        return '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text);padding:3px 0;border-bottom:1px solid var(--border);"><span style="flex:1;min-width:0;">'+it.prod+dh+'</span><span style="font-family:\'JetBrains Mono\',monospace;font-weight:700;color:var(--gold);margin-left:8px;">'+it.qty+'</span></div>';
      }).join('');
    }else if(r.prod){
      items='<div style="font-size:12px;color:var(--text);">'+r.prod+': '+r.qty+'</div>';
    }
    return '<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:8px;padding:11px 13px;margin-bottom:8px;">'+
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">'+
        '<div style="flex:1;min-width:0;font-family:\'JetBrains Mono\',monospace;font-size:15px;font-weight:700;color:var(--gold);">'+r.cell+'</div>'+
        '<div style="font-family:\'Spectral\',serif;font-weight:600;font-size:20px;color:var(--text);">'+r.qty+'</div>'+
        '<button onclick="delInv('+r.id+')" style="background:none;border:none;color:var(--red-bright);font-size:14px;cursor:pointer;">✕</button>'+
      '</div>'+items+
      '<div style="font-size:10px;color:var(--faint);margin-top:6px;">'+r.time+'</div>'+
    '</div>';
  }).join('');
}
function shareInv(){
  const list=getInv();if(!list.length)return;
  const cells=new Set(list.map(r=>r.cell));
  let txt='ИНВЕНТАРИЗАЦИЯ '+new Date().toLocaleDateString('ru')+'\n\n';
  list.slice().reverse().forEach(r=>{
    txt+=r.cell+':\n';
    if(r.items&&r.items.length){r.items.forEach(it=>{let s=it.qty;if(it.sys!=null){const d=it.qty-it.sys;s=it.qty+' (сист '+it.sys+', '+(d>0?'+':'')+d+')';}txt+='  '+it.prod+' — '+s+'\n';});}
    else if(r.prod){txt+='  '+r.prod+' — '+r.qty+'\n';}
    else{txt+='  '+r.qty+'\n';}
  });
  txt+='\nЯчеек пройдено: '+cells.size;
  shareText(txt);
}

// ── BARCODE SCANNER (ZXing, offline) ──
let zxingReader=null, scanTargetId=null, scanCallback=null;
function buildHints(){
  try{
    const hints=new Map();
    const fmts=[
      ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39,
      ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
      ZXing.BarcodeFormat.ITF, ZXing.BarcodeFormat.CODABAR,
      ZXing.BarcodeFormat.CODE_93, ZXing.BarcodeFormat.QR_CODE,
      ZXing.BarcodeFormat.DATA_MATRIX
    ];
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, fmts);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    return hints;
  }catch(e){return null;}
}
function makeReader(){
  const r=new ZXing.BrowserMultiFormatReader();
  try{const h=buildHints(); if(h)r.hints=h;}catch(e){}
  return r;
}
function startScan(targetId, cb){
  scanTargetId=targetId||null;
  scanCallback=cb||null;
  const ov=document.getElementById('scan-overlay');
  ov.style.display='flex';
  const status=document.getElementById('scan-status');
  status.textContent='Запуск камеры…';
  if(typeof ZXing==='undefined'){status.textContent='Сканер не загрузился';return;}
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    status.innerHTML='Живая камера недоступна в этом режиме (нужен HTTPS или APK).<br>Используй «📁 Фото из галереи» ниже — сфоткай штрихкод и выбери снимок.';
    return;
  }
  try{
    if(!zxingReader)zxingReader=makeReader();
    zxingReader.decodeFromVideoDevice(null, 'scan-video', (result, err)=>{
      if(result){
        const text=result.getText ? result.getText() : (result.text||'');
        if(text){
          if(navigator.vibrate)navigator.vibrate(120);
          onScanResult(text);
        }
      }
    }).catch(e=>{
      const name=(e&&e.name)||'';
      if(name==='NotAllowedError')status.innerHTML='Доступ к камере запрещён. Разреши камеру в настройках.<br>Или используй «📁 Фото из галереи» ниже.';
      else if(name==='NotFoundError')status.textContent='Камера не найдена.';
      else status.innerHTML='Камера недоступна ('+name+').<br>Используй «📁 Фото из галереи» ниже.';
    });
  }catch(e){
    status.innerHTML='Камера недоступна.<br>Используй «📁 Фото из галереи» ниже.';
  }
}
let cropImg=null, cropScale=1, cropDrag=null;
function scanFromImage(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const img=new Image();
    img.onload=()=>{
      cropImg=img; // запомним на случай ручной обрезки
      const status=document.getElementById('scan-status');
      document.getElementById('scan-overlay').style.display='flex';
      // сперва пробуем распознать ВСЁ фото; если не выйдет — предложим обвести
      tryDecodeImage(img, status, ()=>{ offerCrop(); });
    };
    img.onerror=()=>{ alert('Не удалось открыть фото.'); };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
  input.value='';
}
function offerCrop(){
  const status=document.getElementById('scan-status');
  status.innerHTML='Не распозналось целиком.<br><button onclick="openCrop(cropImg)" class="add-btn" style="margin-top:8px;">✂ Обвести штрихкод вручную</button>';
}
function openCrop(img){
  cropImg=img;
  const ov=document.getElementById('crop-overlay');
  ov.style.display='flex';
  // fit image into stage
  requestAnimationFrame(()=>{
    const stage=document.getElementById('crop-stage');
    const cw=stage.clientWidth, ch=stage.clientHeight;
    const iw=img.naturalWidth||img.width, ih=img.naturalHeight||img.height;
    cropScale=Math.min(cw/iw, ch/ih);
    const dw=Math.round(iw*cropScale), dh=Math.round(ih*cropScale);
    const canvas=document.getElementById('crop-canvas');
    canvas.width=dw;canvas.height=dh;
    canvas.style.left=((cw-dw)/2)+'px';
    canvas.style.top=((ch-dh)/2)+'px';
    canvas.getContext('2d').drawImage(img,0,0,dw,dh);
    const box=document.getElementById('crop-box');box.style.display='none';
    setupCropDrag(canvas, box, (cw-dw)/2, (ch-dh)/2);
  });
}
function setupCropDrag(canvas, box, offX, offY){
  const stage=document.getElementById('crop-stage');
  let sx=0, sy=0, active=false;
  function pos(e){
    const r=stage.getBoundingClientRect();
    const t=e.touches?e.touches[0]:e;
    return {x:t.clientX-r.left, y:t.clientY-r.top};
  }
  function start(e){e.preventDefault();active=true;const p=pos(e);sx=p.x;sy=p.y;box.style.display='block';update(p);}
  function move(e){if(!active)return;e.preventDefault();update(pos(e));}
  function end(e){active=false;}
  function update(p){
    const x=Math.min(sx,p.x), y=Math.min(sy,p.y);
    const w=Math.abs(p.x-sx), h=Math.abs(p.y-sy);
    box.style.left=x+'px';box.style.top=y+'px';box.style.width=w+'px';box.style.height=h+'px';
    box.dataset.x=x;box.dataset.y=y;box.dataset.w=w;box.dataset.h=h;
    box.dataset.offx=offX;box.dataset.offy=offY;
  }
  stage.ontouchstart=start;stage.ontouchmove=move;stage.ontouchend=end;
  stage.onmousedown=start;stage.onmousemove=move;stage.onmouseup=end;
}
function closeCrop(){document.getElementById('crop-overlay').style.display='none';cropImg=null;}
function decodeCrop(){
  const box=document.getElementById('crop-box');
  const hint=document.getElementById('crop-hint');
  if(box.style.display==='none' || !box.dataset.w || parseFloat(box.dataset.w)<10){
    hint.textContent='Сначала обведи штрихкод рамкой';
    return;
  }
  // box coords are in stage px; canvas is offset by offx/offy; convert to image px via cropScale
  const offX=parseFloat(box.dataset.offx)||0, offY=parseFloat(box.dataset.offy)||0;
  const bx=(parseFloat(box.dataset.x)-offX)/cropScale;
  const by=(parseFloat(box.dataset.y)-offY)/cropScale;
  const bw=parseFloat(box.dataset.w)/cropScale;
  const bh=parseFloat(box.dataset.h)/cropScale;
  const iw=cropImg.naturalWidth||cropImg.width, ih=cropImg.naturalHeight||cropImg.height;
  const cx=Math.max(0,Math.round(bx)), cy=Math.max(0,Math.round(by));
  const cw=Math.min(iw-cx,Math.round(bw)), ch=Math.min(ih-cy,Math.round(bh));
  if(cw<10||ch<10){hint.textContent='Слишком маленькая область';return;}
  // upscale crop to ~1200px wide
  const target=1200; const sc=Math.max(1, target/cw);
  const c=document.createElement('canvas');c.width=Math.round(cw*sc);c.height=Math.round(ch*sc);
  c.getContext('2d').drawImage(cropImg, cx,cy,cw,ch, 0,0,c.width,c.height);
  // build an image from crop and decode via existing engine
  const cimg=new Image();
  cimg.onload=()=>{
    closeCrop();
    const status=document.getElementById('scan-status');
    document.getElementById('scan-overlay').style.display='flex';
    tryDecodeImage(cimg, status);
  };
  cimg.src=c.toDataURL('image/png');
}
// лёгкий набор вариантов: нормализуем размер (большие ужимаем, мелкие тянем),
// делаем максимум 2 быстрых варианта — оригинал и ч/б-порог
function buildImageVariants(img){
  const baseW=img.naturalWidth||img.width, baseH=img.naturalHeight||img.height;
  // целевая ширина ~1280 (и для огромных фото это УСКОРЯЕТ — меньше пикселей)
  const target=1280;
  const sc=baseW>0 ? target/baseW : 1;
  const w=Math.max(1,Math.round(baseW*sc)), h=Math.max(1,Math.round(baseH*sc));
  const variants=[];
  // вариант 0: близко к оригиналу (но не более 2200px по ширине)
  const cap=2200;
  const sc0=baseW>cap?cap/baseW:1;
  const w0=Math.round(baseW*sc0), h0=Math.round(baseH*sc0);
  const c0=document.createElement('canvas');c0.width=w0;c0.height=h0;
  c0.getContext('2d').drawImage(img,0,0,w0,h0);
  variants.push(c0);
  // вариант 1: масштаб ~1280
  const c1=document.createElement('canvas');c1.width=w;c1.height=h;
  c1.getContext('2d').drawImage(img,0,0,w,h);
  variants.push(c1);
  // вариант 2: ч/б порог (помогает на бледных/бликующих)
  const c2=document.createElement('canvas');c2.width=w;c2.height=h;
  const ctx2=c2.getContext('2d');ctx2.drawImage(img,0,0,w,h);
  try{
    const id=ctx2.getImageData(0,0,w,h);const d=id.data;
    for(let i=0;i<d.length;i+=4){
      const g=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
      const v=g>128?255:0; d[i]=d[i+1]=d[i+2]=v;
    }
    ctx2.putImageData(id,0,0);
    variants.push(c2);
  }catch(e){}
  // вариант 3: поворот на 90° (если штрихкод в кадре вертикально)
  try{
    const c3=document.createElement('canvas');c3.width=h;c3.height=w;
    const ctx3=c3.getContext('2d');
    ctx3.translate(h/2,w/2);ctx3.rotate(Math.PI/2);
    ctx3.drawImage(img,-w/2,-h/2,w,h);
    variants.push(c3);
  }catch(e){}
  return variants;
}
function tryDecodeImage(img, status, onFail){
  if(typeof ZXing==='undefined'){status.textContent='Сканер не загрузился';return;}
  if(!zxingReader)zxingReader=makeReader();
  const variants=buildImageVariants(img);
  let idx=0, done=false;
  function finish(text){
    if(done)return; done=true;
    if(text){if(navigator.vibrate)navigator.vibrate(120);onScanResult(text);}
    else if(typeof onFail==='function'){onFail();}
    else status.innerHTML='Штрихкод не распознан.<br>Обведи штрихкод вручную или сфоткай крупнее.';
  }
  function step(){
    if(done)return;
    if(idx>=variants.length){finish(null);return;}
    const canvas=variants[idx++];
    status.textContent='Распознаю… ('+idx+'/'+variants.length+')';
    // конвертируем canvas в <img> и декодируем через decodeFromImageElement (этот метод есть в библиотеке)
    const tmp=new Image();
    tmp.onload=()=>{
      if(done)return;
      let p=null;
      try{ p=zxingReader.decodeFromImageElement(tmp); }catch(e){ p=null; }
      if(p&&p.then){
        p.then(result=>{
          const text=result&&(result.getText?result.getText():result.text);
          if(text)finish(text); else setTimeout(step,0);
        }).catch(()=>setTimeout(step,0));
      }else if(p){
        const text=p.getText?p.getText():p.text;
        if(text)finish(text); else setTimeout(step,0);
      }else{
        setTimeout(step,0);
      }
    };
    tmp.onerror=()=>setTimeout(step,0);
    try{ tmp.src=canvas.toDataURL('image/png'); }
    catch(e){ setTimeout(step,0); }
  }
  setTimeout(step, 0);
}
function onScanResult(text){
  // подставить в целевое поле
  if(scanTargetId){
    const el=document.getElementById(scanTargetId);
    if(el)el.value=text;
  }
  if(scanCallback)scanCallback(text);
  const status=document.getElementById('scan-status');
  status.textContent='Считано: '+text;
  // короткая пауза и закрытие
  setTimeout(stopScan, 600);
}
function stopScan(){
  try{ if(zxingReader)zxingReader.reset(); }catch(e){}
  const v=document.getElementById('scan-video');
  if(v&&v.srcObject){try{v.srcObject.getTracks().forEach(t=>t.stop());}catch(e){}v.srcObject=null;}
  document.getElementById('scan-overlay').style.display='none';
}

document.addEventListener('click',function(e){
  const cellBox=document.getElementById('calc-cell-results');
  const cellInp=document.getElementById('calc-cell');
  if(cellBox&&cellBox.style.display!=='none'){
    if(!cellBox.contains(e.target)&&e.target!==cellInp)cellBox.style.display='none';
  }
  const prodBox=document.getElementById('calc-prod-results');
  const prodInp=document.getElementById('calc-prod-search');
  if(prodBox&&prodBox.style.display!=='none'){
    if(!prodBox.contains(e.target)&&e.target!==prodInp)prodBox.style.display='none';
  }
});

function showBootError(part, err){
  console.error('Ошибка запуска блока:', part, err);
  try {
    const b=document.getElementById('app-error-banner');
    if(b){
      b.style.display='block';
      b.textContent='Ошибка блока '+part+': '+(err && err.message ? err.message : err);
    }
  } catch(_){}
}
function safeStartPart(part, fn){
  try { if(typeof fn==='function') fn(); }
  catch(e){ showBootError(part, e); }
}
function startAppStable(){
  safeStartPart('восстановление доступов', typeof repairCredentialsStorage==='function' ? repairCredentialsStorage : null);
  safeStartPart('восстановление ячеек', typeof repairCellsStorage==='function' ? repairCellsStorage : null);
  safeStartPart('ремонт ЕО', typeof repairEOStorage==='function' ? repairEOStorage : null);
  safeStartPart('товары', typeof render==='function' ? render : null);
  safeStartPart('журнал пересчёта', typeof renderJournal==='function' ? renderJournal : null);
  safeStartPart('инвентаризация', typeof renderInv==='function' ? renderInv : null);
  safeStartPart('HH 1-1', typeof renderHH11==='function' ? renderHH11 : null);
  safeStartPart('ячейки', typeof renderCells==='function' ? renderCells : null);
  safeStartPart('ЕО', typeof renderEO==='function' ? renderEO : null);
  safeStartPart('доступы', typeof renderCreds==='function' ? renderCreds : null);
  safeStartPart('РК', typeof renderRK==='function' ? renderRK : null);
  safeStartPart('отчёт', typeof renderReport==='function' ? renderReport : null);
  safeStartPart('чат', typeof chatUpdateBadge==='function' ? chatUpdateBadge : null);
}
startAppStable();
window.__APP_STABLE_BUILD__='v143-eo-marks-live';

function hideProductDropdownsOnOutsideClick(e){
  try{
    if(e.target.closest && e.target.closest('.smart-search-box'))return;
    ['hh11-results','rk-results','calc-prod-results'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
  }catch(_){ }
}
document.addEventListener('click',hideProductDropdownsOnOutsideClick,true);


// ── SERVICE DIAGNOSTICS ──
function countDeletedLocal(){try{const d=JSON.parse(localStorage.getItem('__lenfer_sync_deleted_ids_v3')||'{}');const out={};Object.keys(d||{}).forEach(k=>out[k]=Object.keys(d[k]||{}).length);return out;}catch(e){return {};}}
function renderDiagnostics(){
  const box=document.getElementById('sync-diagnostics');if(!box)return;
  const d=(typeof window.lenferSyncDiagnostics==='function')?window.lenferSyncDiagnostics():{};
  const counts={products:getCustomItems().length,cells:getCells().length,notes:getNotes().length,reportDays:Object.keys(getReportAll()).length,hh:getHH11().length,rk:getRK().length,problems:getProblems().length,actions:getActionLog().length,audit:getAuditLog().length};
  const del=d.deletedCounts||countDeletedLocal();
  const fmt=ts=>ts?new Date(Number(ts)).toLocaleString('ru-RU'):'—';
  box.innerHTML='<div class="diag-grid">'+
    '<div class="diag-cell"><span>Версия</span><b>'+escHtml(d.build||window.__APP_STABLE_BUILD__||'—')+'</b></div>'+ 
    '<div class="diag-cell"><span>Аккаунт</span><b>'+escHtml(d.userName||d.user||'—')+'</b></div>'+ 
    '<div class="diag-cell"><span>База</span><b>'+escHtml(d.workspaceId?('общая: '+d.workspaceId):'личная')+'</b></div>'+ '<div class="diag-cell"><span>Путь</span><b>'+escHtml(d.dbPath||'—')+'</b></div>'+ 
    '<div class="diag-cell"><span>Realtime</span><b>'+(d.realtime?'подключён':'—')+'</b></div>'+ 
    '<div class="diag-cell"><span>Очередь</span><b>'+(d.dirty?'есть':'0')+'</b></div>'+ 
    '<div class="diag-cell"><span>Последнее получение</span><b>'+escHtml(fmt(d.lastPullAt))+'</b></div>'+ 
    '<div class="diag-cell"><span>Товары</span><b>'+counts.products+'</b></div>'+ 
    '<div class="diag-cell"><span>Ячейки</span><b>'+counts.cells+'</b></div>'+ 
    '<div class="diag-cell"><span>HH</span><b>'+counts.hh+'</b></div>'+ 
    '<div class="diag-cell"><span>РК</span><b>'+counts.rk+'</b></div>'+ '<div class="diag-cell"><span>Заметки</span><b>'+counts.notes+'</b></div>'+ '<div class="diag-cell"><span>Дней отчёта</span><b>'+counts.reportDays+'</b></div>'+ 
    '<div class="diag-cell"><span>Проблемы</span><b>'+counts.problems+'</b></div>'+ '<div class="diag-cell"><span>Аудит</span><b>'+counts.audit+'</b></div>'+ 
    '<div class="diag-cell"><span>Удаления</span><b>товары '+(del.custom_items||0)+' · HH '+(del.hh11_log||0)+' · РК '+(del.rk_log||0)+' · пробл. '+(del.problems_log||0)+'</b></div>'+ 
    '</div>';
}
function quickIntegrityCheck(){
  const issues=[];
  const byUt={};productAllItems().forEach(p=>{const u=String(p.ut||'').trim();if(!u)issues.push('Товар без УТ: '+(p.name||'без названия'));else if(byUt[u])issues.push('Дубль УТ: '+u);else byUt[u]=1;if(!String(p.name||'').trim())issues.push('Товар без названия: '+u);});
  const bc={};productAllItems().forEach(p=>productBarcodeList(p).forEach(b=>{if(bc[b]&&bc[b]!==p.ut)issues.push('Один ШК у разных УТ: '+b+' → '+bc[b]+' / '+p.ut); else bc[b]=p.ut;}));
  const cellSeen={};getCells().forEach(c=>{const a=String(c.addr||'').trim().toUpperCase();if(!a)issues.push('Ячейка без адреса');else if(cellSeen[a])issues.push('Дубль ячейки: '+a);else cellSeen[a]=1;});
  getHH11().forEach(x=>{if(!x.id)issues.push('HH без id: '+(x.ut||x.name||''));});
  getRK().forEach(x=>{if(!x.id)issues.push('РК без id: '+(x.ut||x.eo||''));});
  const out=document.getElementById('integrity-result');if(out)out.innerHTML=issues.length?('<div style="color:var(--red-bright);font-size:12px;line-height:1.45;">'+issues.slice(0,60).map(escHtml).join('<br>')+(issues.length>60?'<br>…ещё '+(issues.length-60):'')+'</div>'):'<div style="color:var(--ok);font-size:12px;">Грубых проблем не найдено.</div>';
}

// ── FIREBASE AUTH + SYNC v3: per-key versions + tombstones ──
// Цель: удаление с одного устройства не должно воскресать на другом.
// Теперь синхронизация хранит версии по каждому ключу и метки удаления для массивов с id.
(function(){
  'use strict';

  var FB_CONFIG = {
    apiKey:      "AIzaSyDabpQ_yMVS_P_s5JyPgxvCiTVGF5-Nu5Q",
    databaseURL: "https://warehouse-dbec9-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId:   "warehouse-dbec9",
    appId:       "1:771368960199:web:2491631935a0df2d13fee2"
  };

  var USER_ROOT = 'users';
  var DEFAULT_WORKSPACE_ID = 'warehouse-dbec9';
  var LEGACY_DB_PATH = 'w21';
  var DB_PATH = null;           // users/<uid>/w21
  var PULL_EVERY = 60000;       // запасной авто-приём раз в минуту; realtime работает сразу

  // Синхронизируемые ключи. Доступы/пароли намеренно не включены.
  var SYNC_KEYS = [
    'custom_items','custom_barcodes','product_edits','pack_sizes',
    'cells','cell_favorites',
    'hh11_log','rk_log','problems_log','audit_log','notes','chat_topics',
    'report',
    'eo_checked','tier_cell_marks','eo_pos_marks'
  ];
  var SYNC_ARRAY_KEYS = ['custom_items','cells','cell_favorites','hh11_log','rk_log','problems_log','audit_log','notes','chat_topics'];
  var SYNC_KEYED_ARRAYS = ['custom_items','cells','hh11_log','rk_log','problems_log','audit_log','notes','chat_topics'];
  var SYNC_OBJECT_KEYS = ['custom_barcodes','product_edits','pack_sizes','report','eo_checked','tier_cell_marks','eo_pos_marks'];
  // Словари пометок: у каждой записи свой ts, сливаем поштучно (свежая запись побеждает),
  // снятие пометки — запись {off:1,ts}, а не удаление, иначе чужое устройство её вернёт.
  var SYNC_TS_MAP_KEYS = ['eo_checked','tier_cell_marks','eo_pos_marks'];
  var SYNC_META_KEY = '__lenfer_sync_key_versions_v3';
  var SYNC_DELETED_KEY = '__lenfer_sync_deleted_ids_v3';

  // Совместимость со старой разметкой/названиями.
  var PRODUCT_KEYS = ['custom_items','custom_barcodes','product_edits','pack_sizes'];
  var CELL_KEYS    = ['cells','cell_favorites'];
  var HH_KEYS      = ['hh11_log'];
  var RK_KEYS      = ['rk_log'];

  var db = null;
  var auth = null;
  var currentUser = null;
  var currentProfile = null;
  var currentWorkspaceId = '';
  var membersCache = {};
  var realtimeRef = null;
  var pulling = false, pushing = false;
  var dirtyTimer = null;
  var loopTimer = null;
  var pushTimer = null;
  var applying = false;
  var dirty = false;
  var lastAppliedUpdatedAt = 0;
  var lastPullAt = 0;
  var FB_SESSION_ID = 's' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);

  function byId(id){ return document.getElementById(id); }
  function has(arr, v){ return arr.indexOf(v) >= 0; }
  function now(){ return Date.now(); }

  function parseJSON(raw, fallback){
    try{
      if(raw == null || raw === '') return fallback;
      var v = JSON.parse(raw);
      return v == null ? fallback : v;
    }catch(_){ return fallback; }
  }

  function localGet(key){
    return parseJSON(localStorage.getItem(key), null);
  }

  function defaultForKey(key){
    if(has(SYNC_OBJECT_KEYS, key)) return {};
    return [];
  }

  function normalizeValueForKey(key, val){
    if(val == null) return defaultForKey(key);
    if(has(SYNC_OBJECT_KEYS, key)){
      return (val && typeof val === 'object' && !Array.isArray(val)) ? val : {};
    }
    if(has(SYNC_ARRAY_KEYS, key)) return Array.isArray(val) ? val : [];
    return val;
  }

  function mirrorKeyForSync(key){
    if(key === 'cells') return 'cells__mirror';
    if(key === 'cell_favorites') return 'cell_favorites__mirror';
    return '';
  }

  function rawSetLocal(key, val){
    try{
      var json = JSON.stringify(normalizeValueForKey(key, val));
      localStorage.setItem(key, json);
      var mirror = mirrorKeyForSync(key);
      if(mirror) localStorage.setItem(mirror, json);
      if(key === 'cells') localStorage.setItem('cells__saved_at', String(Date.now()));
      if(key === 'cell_favorites') localStorage.setItem('cell_favorites__saved_at', String(Date.now()));
    }catch(e){
      try{ console.warn('sync local set failed', key, e); }catch(_){ }
    }
  }

  function readMeta(){
    var m = parseJSON(localStorage.getItem(SYNC_META_KEY), {});
    return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
  }

  function writeMeta(meta){
    try{ localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta || {})); }catch(_){ }
  }

  function markKeyVersion(key, ts){
    if(!has(SYNC_KEYS, key)) return;
    var meta = readMeta();
    meta[key] = Math.max(Number(meta[key] || 0), Number(ts || Date.now()));
    writeMeta(meta);
  }

  function readDeleted(){
    var d = parseJSON(localStorage.getItem(SYNC_DELETED_KEY), {});
    return (d && typeof d === 'object' && !Array.isArray(d)) ? d : {};
  }

  function writeDeleted(deleted){
    try{ localStorage.setItem(SYNC_DELETED_KEY, JSON.stringify(deleted || {})); }catch(_){ }
  }

  function recordKey(key, item){
    if(item == null) return '';
    if(key === 'custom_items') return String(item.ut || item.baseUt || '').trim();
    if(key === 'cells') return String(item.id || item.addr || item.code || '').trim();
    if(key === 'hh11_log' || key === 'rk_log' || key === 'problems_log' || key === 'audit_log' || key === 'notes' || key === 'chat_topics') return String(item.id || '').trim();
    return '';
  }

  function maxDeletedTsForKey(deleted, key){
    var obj = deleted && deleted[key];
    var m = 0;
    if(obj && typeof obj === 'object'){
      Object.keys(obj).forEach(function(id){ m = Math.max(m, Number(obj[id] || 0)); });
    }
    return m;
  }

  function unionDeleted(a, b){
    var out = {};
    [a || {}, b || {}].forEach(function(src){
      if(!src || typeof src !== 'object') return;
      Object.keys(src).forEach(function(key){
        var srcObj = src[key];
        if(!srcObj || typeof srcObj !== 'object') return;
        if(!out[key]) out[key] = {};
        Object.keys(srcObj).forEach(function(id){
          var sid = String(id);
          out[key][sid] = Math.max(Number(out[key][sid] || 0), Number(srcObj[id] || 0));
        });
      });
    });
    return out;
  }

  function filterDeleted(key, val, deleted){
    val = normalizeValueForKey(key, val);
    if(!has(SYNC_KEYED_ARRAYS, key) || !Array.isArray(val)) return val;
    var tomb = deleted && deleted[key];
    if(!tomb || typeof tomb !== 'object') return val;
    return val.filter(function(item){
      var id = recordKey(key, item);
      return !id || !tomb[id];
    });
  }

  function rememberRemovedIdsFromRaw(key, beforeRaw, afterRaw, ts){
    if(!has(SYNC_KEYED_ARRAYS, key)) return;
    var before = normalizeValueForKey(key, parseJSON(beforeRaw, []));
    var after  = normalizeValueForKey(key, parseJSON(afterRaw, []));
    if(!Array.isArray(before) || !Array.isArray(after)) return;

    var beforeIds = {};
    before.forEach(function(item){ var id = recordKey(key, item); if(id) beforeIds[id] = true; });
    var afterIds = {};
    after.forEach(function(item){ var id = recordKey(key, item); if(id) afterIds[id] = true; });

    var deleted = readDeleted();
    var touched = false;

    // Удаления: сохраняем tombstone, чтобы другое устройство не воскресило запись.
    before.forEach(function(item){
      var id = recordKey(key, item);
      if(id && !afterIds[id]){
        if(!deleted[key]) deleted[key] = {};
        deleted[key][id] = Math.max(Number(deleted[key][id] || 0), Number(ts || Date.now()));
        touched = true;
      }
    });

    // Осознанное повторное создание с тем же id/ut на этом устройстве: снимаем старый tombstone.
    // Старые вкладки без свежего действия сюда не попадут, значит удаление всё равно защищено.
    after.forEach(function(item){
      var id = recordKey(key, item);
      if(id && !beforeIds[id] && deleted[key] && deleted[key][id]){
        delete deleted[key][id];
        touched = true;
      }
    });

    if(touched) writeDeleted(deleted);
  }

  function arrayToMap(key, arr){
    var map = {};
    (Array.isArray(arr) ? arr : []).forEach(function(item, idx){
      var id = recordKey(key, item);
      if(id) map[id] = item;
      else map['__noid_' + idx + '_' + Math.random().toString(36).slice(2)] = item;
    });
    return map;
  }

  function mergeKeyedArrays(key, older, newer, deleted){
    older = filterDeleted(key, older || [], deleted);
    newer = filterDeleted(key, newer || [], deleted);
    var map = arrayToMap(key, older);
    newer.forEach(function(item){
      var id = recordKey(key, item);
      if(id) map[id] = item;
      else map['__noid_new_' + Math.random().toString(36).slice(2)] = item;
    });
    var arr = Object.keys(map).map(function(k){ return map[k]; });
    // Журналы удобнее видеть новыми сверху. Если id числовой/временной — сортируем мягко.
    if(key === 'hh11_log' || key === 'rk_log' || key === 'problems_log' || key === 'audit_log' || key === 'chat_topics'){
      arr.sort(function(a,b){ return Number(b.id || 0) - Number(a.id || 0); });
    }
    return arr;
  }

  function makeLocalStore(force){
    var ts = now();
    var meta = readMeta();
    var deleted = readDeleted();
    var store = {};
    SYNC_KEYS.forEach(function(key){
      var val = normalizeValueForKey(key, localGet(key));
      val = filterDeleted(key, val, deleted);
      store[key] = val;
      if(force && !meta[key]) meta[key] = ts;
    });
    if(force) writeMeta(meta);
    return { store: store, versions: meta, deleted: deleted, ts: ts };
  }

  function extractRemote(data){
    data = data || {};
    var store = {};
    var versions = {};
    var present = {};
    var deleted = data.deleted_ids || data.deleted || {};

    if(data.store && typeof data.store === 'object'){
      SYNC_KEYS.forEach(function(key){
        if(data.store[key] != null){ store[key] = normalizeValueForKey(key, data.store[key]); present[key] = true; }
      });
    }else{
      var p = data.products || {};
      if(p.custom_items    != null){ store.custom_items    = normalizeValueForKey('custom_items', p.custom_items); present.custom_items = true; }
      if(p.custom_barcodes != null){ store.custom_barcodes = normalizeValueForKey('custom_barcodes', p.custom_barcodes); present.custom_barcodes = true; }
      if(p.product_edits   != null){ store.product_edits   = normalizeValueForKey('product_edits', p.product_edits); present.product_edits = true; }
      if(p.pack_sizes      != null){ store.pack_sizes      = normalizeValueForKey('pack_sizes', p.pack_sizes); present.pack_sizes = true; }
      var c = data.cells || {};
      if(c.cells          != null){ store.cells          = normalizeValueForKey('cells', c.cells); present.cells = true; }
      if(c.cell_favorites != null){ store.cell_favorites = normalizeValueForKey('cell_favorites', c.cell_favorites); present.cell_favorites = true; }
      if(data.hh11 != null){ store.hh11_log = normalizeValueForKey('hh11_log', data.hh11); present.hh11_log = true; }
      if(data.rk   != null){ store.rk_log   = normalizeValueForKey('rk_log', data.rk); present.rk_log = true; }
      if(data.problems != null){ store.problems_log = normalizeValueForKey('problems_log', data.problems); present.problems_log = true; }
      if(data.audit != null){ store.audit_log = normalizeValueForKey('audit_log', data.audit); present.audit_log = true; }
      if(data.notes != null){ store.notes = normalizeValueForKey('notes', data.notes); present.notes = true; }
    }

    if(data.key_versions && typeof data.key_versions === 'object'){
      SYNC_KEYS.forEach(function(key){ versions[key] = Number(data.key_versions[key] || 0); });
    }else{
      var fallbackTs = Number(data.updated_at || 0);
      Object.keys(store).forEach(function(key){ versions[key] = fallbackTs; });
    }

    SYNC_KEYS.forEach(function(key){
      if(store[key] == null) store[key] = defaultForKey(key);
      if(!versions[key]) versions[key] = 0;
    });
    return { store: store, versions: versions, deleted: deleted, present: present };
  }

  function payloadFromParts(store, versions, deleted, ts){
    store = store || {};
    versions = versions || {};
    deleted = deleted || {};
    ts = Number(ts || Date.now());
    var cleanStore = {};
    SYNC_KEYS.forEach(function(key){
      cleanStore[key] = filterDeleted(key, normalizeValueForKey(key, store[key]), deleted);
    });
    return {
      sync_schema: 4,
      store: cleanStore,
      key_versions: versions,
      deleted_ids: deleted,
      // Старый формат оставлен, чтобы старые вкладки хотя бы читали основные разделы.
      products: {
        custom_items:    cleanStore.custom_items    || [],
        custom_barcodes: cleanStore.custom_barcodes || {},
        product_edits:   cleanStore.product_edits   || {},
        pack_sizes:      cleanStore.pack_sizes      || {}
      },
      cells: {
        cells:          cleanStore.cells          || [],
        cell_favorites: cleanStore.cell_favorites || []
      },
      hh11: cleanStore.hh11_log || [],
      rk:   cleanStore.rk_log   || [],
      problems: cleanStore.problems_log || [],
      audit: cleanStore.audit_log || [],
      notes: cleanStore.notes || [],
      updated_at: ts,
      updated_by: currentUser ? currentUser.uid : null,
      updated_by_session: FB_SESSION_ID
    };
  }

  function reportDayTs(day, fallback){
    return Number(day && (day.updatedAt || day.updated_at || day.modifiedAt) || 0) || Number(fallback || 0);
  }

  function mergeReports(localReport, remoteReport, localVersion, remoteVersion){
    var local=(localReport&&typeof localReport==='object'&&!Array.isArray(localReport))?localReport:{};
    var remote=(remoteReport&&typeof remoteReport==='object'&&!Array.isArray(remoteReport))?remoteReport:{};
    var out={};
    var keys={}; Object.keys(local).forEach(function(k){keys[k]=true;}); Object.keys(remote).forEach(function(k){keys[k]=true;});
    Object.keys(keys).forEach(function(dayKey){
      var l=local[dayKey], r=remote[dayKey];
      if(l==null){out[dayKey]=r;return;}
      if(r==null){out[dayKey]=l;return;}
      // Отчёты за разные дни всегда живут вместе; для одного дня выигрывает последняя правка.
      // Мета updatedAt добавляется в v67, старые записи используют версию ключа как запасной ориентир.
      out[dayKey]=reportDayTs(l,localVersion)>=reportDayTs(r,remoteVersion)?l:r;
    });
    return out;
  }

  function tsMapEntryTs(e){
    if(e==null)return 0;
    if(typeof e==='object')return Number(e.ts||0);
    return 1; // легаси-значения true/1 без ts считаем самыми старыми из существующих
  }
  function mergeTsMaps(a,b){
    a=(a&&typeof a==='object'&&!Array.isArray(a))?a:{};
    b=(b&&typeof b==='object'&&!Array.isArray(b))?b:{};
    var out={}, keys={};
    Object.keys(a).forEach(function(k){keys[k]=1;});
    Object.keys(b).forEach(function(k){keys[k]=1;});
    Object.keys(keys).forEach(function(k){
      var ea=a[k], eb=b[k];
      if(ea==null){out[k]=eb;return;}
      if(eb==null){out[k]=ea;return;}
      out[k]=tsMapEntryTs(eb)>=tsMapEntryTs(ea)?eb:ea;
    });
    return out;
  }

  function mergeLocalWithRemote(localParts, remoteData){
    var remoteParts = extractRemote(remoteData || {});
    var deleted = unionDeleted(remoteParts.deleted, localParts.deleted);
    var outStore = {};
    var outVersions = {};

    SYNC_KEYS.forEach(function(key){
      var lv = Number(localParts.versions[key] || 0);
      var rv = Number(remoteParts.versions[key] || 0);
      var dlv = maxDeletedTsForKey(deleted, key);
      var localVal = filterDeleted(key, normalizeValueForKey(key, localParts.store[key]), deleted);
      var remoteVal = filterDeleted(key, normalizeValueForKey(key, remoteParts.store[key]), deleted);

      if(key === 'report'){
        outStore[key] = mergeReports(localVal, remoteVal, lv, rv);
      }else if(has(SYNC_TS_MAP_KEYS, key)){
        outStore[key] = mergeTsMaps(localVal, remoteVal);
      }else if(has(SYNC_KEYED_ARRAYS, key)){
        // Добавления с разных устройств объединяем, удаления через tombstone отсекают «зомби».
        outStore[key] = lv >= rv ? mergeKeyedArrays(key, remoteVal, localVal, deleted)
                                 : mergeKeyedArrays(key, localVal, remoteVal, deleted);
      }else{
        // Для словарей/простых массивов действует latest-wins по ключу.
        outStore[key] = lv >= rv ? localVal : remoteVal;
      }
      outVersions[key] = Math.max(lv, rv, dlv);
    });

    var payload = payloadFromParts(outStore, outVersions, deleted, Date.now());
    // Ключи из будущих версий приложения (нет в нашем SYNC_KEYS) переносим как есть:
    // иначе транзакция этой версии затирала бы то, что записал более новый клиент.
    try{
      var rawStore = remoteData && remoteData.store;
      if(rawStore && typeof rawStore === 'object'){
        Object.keys(rawStore).forEach(function(key){
          if(!has(SYNC_KEYS, key) && payload.store[key] == null) payload.store[key] = rawStore[key];
        });
      }
      var rawVersions = remoteData && remoteData.key_versions;
      if(rawVersions && typeof rawVersions === 'object'){
        Object.keys(rawVersions).forEach(function(key){
          if(!has(SYNC_KEYS, key) && payload.key_versions[key] == null) payload.key_versions[key] = rawVersions[key];
        });
      }
    }catch(_){ }
    return payload;
  }

  function applyDeletedTombstonesLocally(deleted){
    var changed = false;
    var meta = readMeta();
    SYNC_KEYED_ARRAYS.forEach(function(key){
      var current = normalizeValueForKey(key, localGet(key));
      var filtered = filterDeleted(key, current, deleted);
      if(JSON.stringify(current) !== JSON.stringify(filtered)){
        rawSetLocal(key, filtered);
        meta[key] = Math.max(Number(meta[key] || 0), maxDeletedTsForKey(deleted, key));
        changed = true;
      }
    });
    if(changed) writeMeta(meta);
    return changed;
  }

  // ── Инициализация Firebase ──
  function initFB(){
    try{
      if(typeof firebase === 'undefined') throw new Error('Firebase SDK не загрузился');
      if(!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
      db = firebase.database();
      if(!firebase.auth) throw new Error('Firebase Auth SDK не загрузился');
      auth = firebase.auth();
      try{ auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); }catch(_){ }
      return true;
    }catch(e){ status('Firebase: ошибка инициализации — ' + e.message); return false; }
  }

  function userPath(user){ return USER_ROOT + '/' + user.uid + '/w21'; }
  function cleanWorkspaceId(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48);}
  function workspacePath(id){return 'workspaces/' + cleanWorkspaceId(id) + '/w21';}
  function getStoredWorkspaceId(){try{return cleanWorkspaceId(localStorage.getItem('lenfer_workspace_id')||DEFAULT_WORKSPACE_ID)||DEFAULT_WORKSPACE_ID;}catch(_){return DEFAULT_WORKSPACE_ID;}}
  function activeDataPath(user){var ws=getStoredWorkspaceId(); currentWorkspaceId=ws; return ws ? workspacePath(ws) : userPath(user);}
  function actorFromFirebaseUser(user){
    user=user||currentUser||{};
    var local=getUserProfileLocal()||{};
    var name=String((currentProfile&&currentProfile.name)||local.name||user.displayName||user.email||user.uid||'Пользователь').trim();
    return {uid:user.uid||'',email:user.email||'',name:name,displayName:name};
  }
  function setGlobalProfile(profile){
    currentProfile=profile||actorFromFirebaseUser(currentUser);
    window.lenferCurrentUserProfile=currentProfile;
    try{localStorage.setItem('user_profile',JSON.stringify(currentProfile));}catch(_){ }
  }
  async function saveProfileRemote(profile){
    if(!db || !currentUser || !profile)return;
    var p={uid:currentUser.uid,email:currentUser.email||'',name:String(profile.name||'').trim()||currentUser.email||currentUser.uid,avatar:String(profile.avatar||''),updatedAt:Date.now(),lastSeen:Date.now()};
    try{await db.ref('profiles/'+currentUser.uid).update(p);}catch(e){console.warn('profile save failed',e);}
    if(currentWorkspaceId){try{await db.ref('workspaces/'+currentWorkspaceId+'/members/'+currentUser.uid).update(p);}catch(e){console.warn('member save failed',e);}}
  }
  async function loadUserProfile(user){
    var fallback=actorFromFirebaseUser(user);
    var profile=fallback;
    try{
      var snap=await db.ref('profiles/'+user.uid).get();
      if(snap && snap.exists && snap.exists()){profile={...fallback,...(snap.val()||{})};}
      else await db.ref('profiles/'+user.uid).set({...fallback,createdAt:Date.now(),lastSeen:Date.now()});
    }catch(e){console.warn('profile load failed',e);}
    if(!profile.name)profile.name=fallback.name;
    setGlobalProfile(profile);
    try{if(user.updateProfile && profile.name && user.displayName!==profile.name)await user.updateProfile({displayName:profile.name});}catch(_){ }
    await saveProfileRemote(profile);
    renderCollabPanel();
    return profile;
  }
  async function registerWorkspaceMember(){
    if(!db || !currentUser || !currentWorkspaceId)return;
    await saveProfileRemote(currentProfile||actorFromFirebaseUser(currentUser));
    await loadWorkspaceMembers();
  }
  async function loadWorkspaceMembers(){
    membersCache={};
    if(!db || !currentUser || !currentWorkspaceId){renderCollabPanel();return membersCache;}
    try{var snap=await db.ref('workspaces/'+currentWorkspaceId+'/members').get();membersCache=(snap&&snap.val&&snap.val())||{};}catch(e){console.warn('members load failed',e);}
    // Кэшируем имена и аватарки локально: по нему avatarHtml() рисует чужие аватары даже офлайн.
    try{
      var dir={};
      Object.keys(membersCache||{}).forEach(function(uid){
        var m=membersCache[uid]||{};
        dir[String(uid)]={name:m.name||'',email:m.email||'',avatar:m.avatar||'',lastSeen:m.lastSeen||0};
      });
      localStorage.setItem('members_dir',JSON.stringify(dir));
    }catch(_){ }
    renderCollabPanel();
    try{ if(typeof renderNotes==='function')renderNotes(); }catch(_){ }
    return membersCache;
  }

  function redirectToAuth(){
    try{
      var here = location.pathname.split('/').pop() || 'index.html';
      location.replace('./register.html?next=' + encodeURIComponent(here + location.search + location.hash));
    }catch(_){ location.href = './register.html'; }
  }

  function setAuthHint(ok){
    try{ if(ok) localStorage.setItem('lenfer_auth_ok_hint','1'); else localStorage.removeItem('lenfer_auth_ok_hint'); }catch(_){ }
    try{
      document.documentElement.classList.toggle('auth-required', !ok);
      document.documentElement.classList.toggle('auth-ok', !!ok);
    }catch(_){ }
  }

  function setUser(user){
    currentUser = user || null;
    DB_PATH = user ? activeDataPath(user) : null;
    setAuthHint(!!user);
    updateAuthUI();
  }

  function status(msg, good){
    try{
      var el = byId('supa-status');
      if(el) el.textContent = msg;
      var authEl = byId('fb-auth-status');
      if(authEl && msg) authEl.textContent = msg;
      var badge = byId('supa-badge-sync');
      if(badge) badge.textContent = 'синхр.: ' + new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      var online = byId('supa-badge-online');
      if(online) online.textContent = good ? 'связь: онлайн' : 'связь: …';
      var queue = byId('supa-badge-queue');
      if(queue) queue.textContent = dirty ? 'очередь: есть' : 'очередь: 0';
      console.log('[FB auth sync]', msg);
      try{ if(typeof renderDiagnostics==='function')renderDiagnostics(); }catch(_){ }
    }catch(_){ }
  }


  window.lenferSyncDiagnostics = function(){
    var meta = readMeta();
    var deleted = readDeleted();
    var delCounts = {};
    try{Object.keys(deleted||{}).forEach(function(k){delCounts[k]=Object.keys(deleted[k]||{}).length;});}catch(_){ }
    return {user: currentUser ? (currentUser.email || currentUser.uid) : '', userName: (currentProfile&&currentProfile.name)||'', uid: currentUser ? currentUser.uid : '', workspaceId: currentWorkspaceId || '', dbPath: DB_PATH || '', project: FB_CONFIG.projectId, databaseURL: FB_CONFIG.databaseURL, dirty: !!dirty, pulling: !!pulling, pushing: !!pushing, realtime: !!realtimeRef, lastPullAt: lastPullAt || 0, lastAppliedUpdatedAt: lastAppliedUpdatedAt || 0, session: FB_SESSION_ID, meta: meta, deletedCounts: delCounts, build: window.__APP_STABLE_BUILD__ || ''};
  };

  function authStatus(msg){ var el = byId('fb-auth-status'); if(el) el.textContent = msg; }

  function updateAuthUI(){
    try{
      var userEl = byId('fb-auth-user');
      var form = byId('fb-auth-form');
      var loginBtn = byId('fb-auth-login-btn');
      var regBtn = byId('fb-auth-register-btn');
      var logoutBtn = byId('fb-auth-logout-btn');
      var pathEl = byId('supa-key');
      var urlEl = byId('supa-url');
      if(urlEl) urlEl.value = FB_CONFIG.projectId + ' · ' + FB_CONFIG.databaseURL;
      if(currentUser){
        if(userEl) userEl.textContent = 'Вошёл: ' + ((currentProfile&&currentProfile.name) || currentUser.displayName || currentUser.email || currentUser.uid);
        if(form) form.style.display = 'none';
        if(loginBtn) loginBtn.style.display = 'none';
        if(regBtn) regBtn.style.display = 'none';
        if(logoutBtn) logoutBtn.style.display = '';
        if(pathEl) pathEl.value = DB_PATH;
      }else{
        if(userEl) userEl.textContent = 'Не вошёл';
        if(form) form.style.display = '';
        if(loginBtn) loginBtn.style.display = '';
        if(regBtn) regBtn.style.display = '';
        if(logoutBtn) logoutBtn.style.display = 'none';
        if(pathEl) pathEl.value = 'users/<uid>/w21 или workspaces/<код>/w21 — появится после входа';
      }
    }catch(_){ }
  }

  function getAuthInput(){
    var emailEl = byId('fb-auth-email');
    var passEl = byId('fb-auth-pass');
    var email = emailEl ? String(emailEl.value || '').trim() : '';
    var pass = passEl ? String(passEl.value || '') : '';
    if(!email) throw new Error('введи email');
    if(!pass || pass.length < 6) throw new Error('пароль минимум 6 символов');
    return {email: email, pass: pass};
  }

  function humanAuthError(e){
    var code = e && e.code ? String(e.code) : '';
    if(code.indexOf('email-already-in-use') >= 0) return 'такой email уже зарегистрирован — нажми «Войти»';
    if(code.indexOf('invalid-email') >= 0) return 'email выглядит криво';
    if(code.indexOf('weak-password') >= 0) return 'пароль слишком слабый, минимум 6 символов';
    if(code.indexOf('wrong-password') >= 0) return 'неверный пароль';
    if(code.indexOf('user-not-found') >= 0 || code.indexOf('invalid-credential') >= 0) return 'аккаунт не найден или пароль неверный';
    if(code.indexOf('too-many-requests') >= 0) return 'слишком много попыток, Firebase временно тормознул вход';
    return (e && e.message) ? e.message : String(e || 'неизвестная ошибка');
  }

  window.fbRegister = async function(){
    if(!auth && !initFB()) return;
    try{ var v = getAuthInput(); authStatus('Firebase: создаю аккаунт…'); await auth.createUserWithEmailAndPassword(v.email, v.pass); authStatus('Аккаунт создан ✓'); }
    catch(e){ authStatus('Ошибка регистрации: ' + humanAuthError(e)); }
  };

  window.fbLogin = async function(){
    if(!auth && !initFB()) return;
    try{ var v = getAuthInput(); authStatus('Firebase: вхожу…'); await auth.signInWithEmailAndPassword(v.email, v.pass); authStatus('Вход выполнен ✓'); }
    catch(e){ authStatus('Ошибка входа: ' + humanAuthError(e)); }
  };

  window.fbLogout = async function(){
    try{
      stopSync();
      if(auth) await auth.signOut();
      setAuthHint(false);
      status('Firebase: вышел из аккаунта');
      redirectToAuth();
    }catch(e){ status('Firebase: ошибка выхода — ' + (e.message || e)); }
  };

  function renderCollabPanel(){
    try{
      var nameEl=byId('profile-name-input'); if(nameEl && currentProfile) nameEl.value=currentProfile.name||'';
      var wsEl=byId('workspace-id-input'); if(wsEl) wsEl.value=currentWorkspaceId||'';
      var modeEl=byId('workspace-mode-label'); if(modeEl) modeEl.textContent=currentWorkspaceId?('Общая база: '+currentWorkspaceId):'Личная база';
      var avaBox=byId('profile-avatar-preview');
      if(avaBox && typeof avatarHtml==='function'){
        var me=currentProfile||{};
        avaBox.innerHTML=avatarHtml(me.uid||'',me.name||'',44);
      }
      var list=byId('workspace-members-list');
      if(list){
        var vals=Object.keys(membersCache||{}).map(function(uid){return membersCache[uid]||{};});
        if(!currentWorkspaceId) list.innerHTML='<div class="no-results" style="padding:10px;">Сейчас личная база. Список пользователей появится после подключения общей базы.</div>';
        else if(!vals.length) list.innerHTML='<div class="no-results" style="padding:10px;">Пока виден только текущий пользователь или нет доступа к members.</div>';
        else list.innerHTML=vals.map(function(m){
          var ava=(typeof avatarHtml==='function')?avatarHtml(m.uid||'',m.name||m.email||'',30):'';
          return '<div class="member-row" style="display:flex;align-items:center;gap:9px;">'+ava+'<div style="flex:1;min-width:0;"><b>'+escHtml(m.name||m.email||m.uid||'Пользователь')+'</b><span>'+escHtml(m.email||'')+'</span><small>был: '+(m.lastSeen?escHtml(new Date(Number(m.lastSeen)).toLocaleString('ru-RU')):'—')+'</small></div></div>';
        }).join('');
      }
    }catch(e){console.warn('collab render failed',e);}
  }
  window.saveUserProfileName=async function(){
    if(!currentUser)return status('Сначала войди в аккаунт');
    var el=byId('profile-name-input'); var name=String(el&&el.value||'').trim();
    if(!name)return alert('Введи имя');
    var p={...(currentProfile||actorFromFirebaseUser(currentUser)),name:name,email:currentUser.email||'',uid:currentUser.uid,updatedAt:Date.now(),lastSeen:Date.now()};
    setGlobalProfile(p);
    try{if(currentUser.updateProfile)await currentUser.updateProfile({displayName:name});}catch(_){ }
    await saveProfileRemote(p);
    updateAuthUI();renderCollabPanel();renderDiagnostics();
    logAction('profile','Изменено имя пользователя: '+name,{uid:currentUser.uid});
    status('Имя сохранено ✓',true);
  };
  window.profileAvatarFileChanged=function(inp){
    var f=inp&&inp.files&&inp.files[0];
    if(inp)inp.value='';
    if(!f)return;
    if(!currentUser){status('Сначала войди в аккаунт');return;}
    var url=URL.createObjectURL(f);
    var img=new Image();
    img.onload=async function(){
      try{
        // Квадрат 96px, JPEG ~5-8КБ: достаточно для кружка и не раздувает базу.
        var S=96;
        var canvas=document.createElement('canvas');canvas.width=S;canvas.height=S;
        var ctx=canvas.getContext('2d');
        var side=Math.min(img.width,img.height);
        ctx.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,S,S);
        var dataUrl=canvas.toDataURL('image/jpeg',0.82);
        URL.revokeObjectURL(url);
        var p={...(currentProfile||actorFromFirebaseUser(currentUser)),avatar:dataUrl,uid:currentUser.uid,email:currentUser.email||'',updatedAt:Date.now(),lastSeen:Date.now()};
        setGlobalProfile(p);
        await saveProfileRemote(p);
        await loadWorkspaceMembers();
        try{if(typeof renderNotes==='function')renderNotes();}catch(_){ }
        logAction('profile','Обновлён аватар',{uid:currentUser.uid});
        status('Аватар сохранён ✓ Остальные увидят его после обновления списка пользователей.',true);
      }catch(e){status('Не удалось сохранить аватар: '+(e&&e.message||e));}
    };
    img.onerror=function(){URL.revokeObjectURL(url);status('Не удалось прочитать фото');};
    img.src=url;
  };
  window.profileAvatarClear=async function(){
    if(!currentUser)return status('Сначала войди в аккаунт');
    var p={...(currentProfile||actorFromFirebaseUser(currentUser)),avatar:'',updatedAt:Date.now()};
    setGlobalProfile(p);
    await saveProfileRemote(p);
    await loadWorkspaceMembers();
    try{if(typeof renderNotes==='function')renderNotes();}catch(_){ }
    status('Аватар убран',true);
  };
  window.workspaceUseShared=async function(){
    if(!currentUser)return status('Сначала войди в аккаунт');
    var el=byId('workspace-id-input'); var ws=cleanWorkspaceId(el&&el.value||'');
    if(!ws)return alert('Введи код общей базы латиницей/цифрами, например main');
    try{localStorage.setItem('lenfer_workspace_id',ws);}catch(_){ }
    currentWorkspaceId=ws; DB_PATH=activeDataPath(currentUser);
    await registerWorkspaceMember();
    logAction('workspace','Подключена общая база: '+ws,{workspace:ws});
    startAfterLogin();
    status('Общая база подключена: '+ws+'. Нажми «Отправить сейчас», если хочешь залить текущие данные туда.',true);
  };
  window.workspaceUsePersonal=async function(){
    if(!currentUser)return status('Сначала войди в аккаунт');
    try{localStorage.setItem('lenfer_workspace_id',DEFAULT_WORKSPACE_ID);}catch(_){ }
    currentWorkspaceId=DEFAULT_WORKSPACE_ID; membersCache={}; DB_PATH=activeDataPath(currentUser);
    logAction('workspace','Подключена общая база по умолчанию',{workspace:DEFAULT_WORKSPACE_ID});
    startAfterLogin();
    status('Подключена общая база: '+DEFAULT_WORKSPACE_ID,true);
  };
  window.workspacePublishCurrent=async function(){
    if(!currentUser)return status('Сначала войди в аккаунт');
    if(!currentWorkspaceId)return alert('Сначала подключи общую базу.');
    if(!confirm('Отправить текущие данные этого устройства в общую базу '+currentWorkspaceId+'? Перед отправкой будет автобэкап.'))return;
    dirty=true; await pushAll(true); await registerWorkspaceMember();
  };
  window.refreshWorkspaceMembers=function(){return loadWorkspaceMembers();};

  function requireUser(actionName){
    if(!currentUser || !DB_PATH){
      status('Firebase: сначала войди в аккаунт для ' + (actionName || 'синхронизации'));
      return false;
    }
    return true;
  }

  // ── Отправка: транзакция + merge. Старый снимок больше не может затереть свежие удаления. ──
  async function pushAll(force){
    if(pushing || !db) return;
    if(!requireUser('отправки')) return;
    if(!force && !dirty) return;
    pushing = true;
    try{
      createAutoBackup('перед отправкой в Firebase', 180000);
      status('Firebase: отправляю и сверяю версии…');
      var localParts = makeLocalStore(!!force);
      var finalPayload = null;
      await new Promise(function(resolve, reject){
        db.ref(DB_PATH).transaction(function(remote){
          finalPayload = mergeLocalWithRemote(localParts, remote || {});
          return finalPayload;
        }, function(error, committed, snap){
          if(error) reject(error);
          else {
            try{ if(snap && snap.val) finalPayload = snap.val(); }catch(_){ }
            resolve({ committed: committed, snap: snap });
          }
        }, false);
      });
      dirty = false;
      if(finalPayload) applySnapshot(finalPayload, true);
      status('Firebase: данные отправлены и сведены ✓', true);
    }catch(e){
      status('Firebase: ошибка отправки — ' + (e.message || e));
    }finally{ pushing = false; }
  }

  function rememberOpenCatalogCard(){
    try{
      var card = document.querySelector('#results .card.open');
      if(!card) return null;
      var ut = card.getAttribute('data-ut') || '';
      if(!ut) return null;
      return { ut: ut, scrollY: window.scrollY || 0 };
    }catch(_){ return null; }
  }

  function restoreOpenCatalogCard(state){
    if(!state || !state.ut) return;
    setTimeout(function(){
      try{
        var cards = document.querySelectorAll('#results .card[data-ut]');
        var target = null;
        for(var i=0;i<cards.length;i++) if(String(cards[i].getAttribute('data-ut')) === String(state.ut)){ target = cards[i]; break; }
        if(!target) return;
        target.classList.add('open');
        var item = (typeof productAllItems === 'function') ? productAllItems().find(function(x){ return String(x && x.ut || '') === String(state.ut); }) : null;
        var bc = (typeof productBarcode === 'function') ? productBarcode(item || {ut: state.ut}) : '';
        var cid = 'c' + Math.random().toString(36).slice(2);
        if(typeof showDetail === 'function') showDetail(target, state.ut, bc, cid);
        var fab = document.querySelector('.fab');
        if(fab) fab.style.display = 'none';
        if(typeof state.scrollY === 'number') window.scrollTo(0, state.scrollY);
      }catch(_){ }
    }, 0);
  }

  // ── Приём ──
  function applySnapshot(snap, force){
    var data = snap && typeof snap.val === 'function' ? snap.val() : snap;
    if(!data) return;
    var remoteUpdatedAt = Number(data.updated_at || 0);
    if(!force && remoteUpdatedAt && remoteUpdatedAt === lastAppliedUpdatedAt) return;
    if(remoteUpdatedAt) lastAppliedUpdatedAt = remoteUpdatedAt;

    var remote = extractRemote(data);
    var localMeta = readMeta();
    var localDeleted = readDeleted();
    var mergedDeleted = unionDeleted(localDeleted, remote.deleted);
    var catalogState = rememberOpenCatalogCard();

    applying = true;
    try{
      writeDeleted(mergedDeleted);
      SYNC_KEYS.forEach(function(key){
        var rv = Number(remote.versions[key] || 0);
        var lv = Number(localMeta[key] || 0);
        var dv = maxDeletedTsForKey(mergedDeleted, key);
        var remoteVal = filterDeleted(key, normalizeValueForKey(key, remote.store[key]), mergedDeleted);
        var localVal  = filterDeleted(key, normalizeValueForKey(key, localGet(key)), mergedDeleted);

        if(remote.present[key] && key === 'report'){
          rawSetLocal(key, mergeReports(localVal, remoteVal, lv, rv));
          localMeta[key] = Math.max(rv, lv, dv);
        }else if(remote.present[key] && has(SYNC_TS_MAP_KEYS, key)){
          rawSetLocal(key, mergeTsMaps(localVal, remoteVal));
          localMeta[key] = Math.max(rv, lv, dv);
        }else if(remote.present[key] && key === 'notes'){
          rawSetLocal(key, lv >= rv ? mergeKeyedArrays(key, remoteVal, localVal, mergedDeleted) : mergeKeyedArrays(key, localVal, remoteVal, mergedDeleted));
          localMeta[key] = Math.max(rv, lv, dv);
        }else if(remote.present[key] && rv >= lv){
          rawSetLocal(key, remoteVal);
          localMeta[key] = Math.max(rv, dv, lv && rv >= lv ? lv : 0);
        }else if(dv > lv){
          var filtered = filterDeleted(key, localVal, mergedDeleted);
          rawSetLocal(key, filtered);
          localMeta[key] = Math.max(lv, dv);
        }
      });
      applyDeletedTombstonesLocally(mergedDeleted);
      writeMeta(localMeta);

      try{ if(typeof render      === 'function'){ render(); restoreOpenCatalogCard(catalogState); } }catch(_){ }
      try{ if(typeof renderCells === 'function') renderCells(); }catch(_){ }
      try{ if(typeof renderHH11  === 'function') renderHH11(); }catch(_){ }
      try{ if(typeof renderRK    === 'function') renderRK(); }catch(_){ }
      try{ if(typeof renderProblems === 'function') renderProblems(); }catch(_){ }
      try{ if(typeof renderNotes === 'function') renderNotes(); }catch(_){ }
      try{ if(typeof chatUpdateBadge === 'function') chatUpdateBadge(); }catch(_){ }
      try{ if(typeof renderReport === 'function') renderReport(); }catch(_){ }
      try{ if(typeof renderDiagnostics === 'function') renderDiagnostics(); }catch(_){ }
      try{ if(typeof wmsTierSyncRefresh === 'function') wmsTierSyncRefresh(); }catch(_){ }
      try{ if(typeof wmsShipmentEoMarksRefresh === 'function') wmsShipmentEoMarksRefresh(); }catch(_){ }
    }finally{ applying = false; }
  }

  async function pullAll(){
    if(pulling || !db) return;
    if(!requireUser('получения')) return;
    pulling = true;
    try{
      createAutoBackup('перед получением из Firebase', 180000);
      status('Firebase: получаю данные…');
      lastPullAt = Date.now();
      var snap = await db.ref(DB_PATH).get();
      if(snap.exists()){
        applySnapshot(snap, false);
        status('Firebase: данные получены ✓', true);
      }else{
        status('Firebase: личная база пустая — если данные есть на этом устройстве, нажми «Отправить с этого устройства»', true);
      }
    }catch(e){ status('Firebase: ошибка загрузки — ' + (e.message || e)); }
    finally{ pulling = false; }
  }

  window.fbMigrateLegacyW21 = async function(){
    if(!db) return;
    if(!requireUser('миграции старой w21')) return;
    try{
      createAutoBackup('перед миграцией старой w21', 0);
      status('Firebase: читаю старую общую w21…');
      var snap = await db.ref(LEGACY_DB_PATH).get();
      if(!snap.exists()){
        status('Firebase: старая w21 пустая или недоступна');
        return;
      }
      applySnapshot(snap, true);
      dirty = true;
      await pushAll(true);
      status('Firebase: старая w21 перенесена в твой аккаунт ✓', true);
    }catch(e){ status('Firebase: миграция w21 не удалась — ' + (e.message || e)); }
  };

  function startRealtime(){
    if(!db || !requireUser('realtime')) return;
    stopRealtime();
    realtimeRef = db.ref(DB_PATH);
    realtimeRef.on('value', function(snap){
      if(applying || !snap.exists()) return;
      var data = snap.val();
      if(data && data.updated_by_session && data.updated_by_session === FB_SESSION_ID){
        if(data.updated_at) lastAppliedUpdatedAt = Number(data.updated_at) || lastAppliedUpdatedAt;
        status('Firebase: своё обновление принято ✓', true);
        return;
      }
      applySnapshot(data, false);
    }, function(err){
      status('Firebase: realtime ошибка — ' + (err && err.message ? err.message : err));
    });
  }

  function stopRealtime(){ try{ if(realtimeRef) realtimeRef.off(); }catch(_){ } realtimeRef = null; }

  // ── Чат заметок ──
  // Отдельный узел: каждое сообщение — маленькая запись, уходит сразу set()'ом
  // и прилетает остальным через child_added за доли секунды. Общий sync-канал
  // (весь стор одной транзакцией с дебаунсом) для переписки слишком тяжёлый.
  var chatRef = null;
  var chatMessages = {};
  var chatPathActive = '';
  var chatRenderT = null;
  function activeChatPath(){
    if(!currentUser) return '';
    var ws = getStoredWorkspaceId();
    return ws ? ('workspaces/' + ws + '/chat') : (USER_ROOT + '/' + currentUser.uid + '/chat');
  }
  function chatCacheLoad(){
    var c = parseJSON(localStorage.getItem('chat_cache'), null);
    if(c && typeof c === 'object' && c.msgs && typeof c.msgs === 'object'){
      chatPathActive = String(c.path || '');
      chatMessages = c.msgs;
    }else{
      chatPathActive = '';
      chatMessages = {};
    }
  }
  function chatCacheSave(){
    try{ localStorage.setItem('chat_cache', JSON.stringify({path: chatPathActive, msgs: chatMessages})); }catch(_){ }
  }
  function chatRender(){
    clearTimeout(chatRenderT);
    chatRenderT = setTimeout(function(){
      try{ if(typeof renderNotes === 'function') renderNotes(); }catch(_){ }
      try{ if(typeof chatUpdateBadge === 'function') chatUpdateBadge(); }catch(_){ }
    }, 60);
  }
  function stopChat(){ try{ if(chatRef) chatRef.off(); }catch(_){ } chatRef = null; }
  var chatStartupDone = false;
  function startChat(){
    if(!db || !currentUser) return;
    stopChat();
    chatStartupDone = false;
    var path = activeChatPath(); if(!path) return;
    if(chatPathActive !== path){ chatMessages = {}; chatPathActive = path; chatCacheSave(); }
    chatRef = db.ref(path).limitToLast(400);
    var onChatError = function(err){
      // Правила базы могут не пускать в узел chat — заметки тогда идут только
      // через общий канал (двойная запись в saveNote), медленнее, но доходят.
      status('Firebase: канал чата недоступен (' + ((err && err.message) || err) + ') — заметки идут через общий канал.');
    };
    chatRef.on('child_added', function(snap){
      var v = snap.val(); if(!v) return;
      // Пока не прошла первая загрузка истории — не пищим и не вибрируем на своё же прошлое.
      var isFresh = chatStartupDone && !chatMessages[snap.key];
      chatMessages[snap.key] = v; chatCacheSave(); chatRender();
      if(isFresh){ try{ if(typeof chatNotifyNew === 'function') chatNotifyNew(v); }catch(_){ } }
    }, onChatError);
    chatRef.on('child_changed', function(snap){ var v = snap.val(); if(!v) return; chatMessages[snap.key] = v; chatCacheSave(); chatRender(); });
    chatRef.on('child_removed', function(snap){ delete chatMessages[snap.key]; chatCacheSave(); chatRender(); });
    migrateNotesToChat();
    backfillChatToLegacy();
    setTimeout(function(){ chatStartupDone = true; }, 1500);
  }
  // Сообщения, которые успели попасть только в чат-кэш (v138), доливаем в обычные
  // заметки: дальше их разнесёт проверенный sync-канал независимо от правил базы.
  function backfillChatToLegacy(){
    try{
      var notes = parseJSON(localStorage.getItem('notes'), []) || [];
      if(!Array.isArray(notes)) notes = [];
      var have = {}; notes.forEach(function(n){ if(n && n.id != null) have[String(n.id)] = 1; });
      var added = false;
      Object.keys(chatMessages).forEach(function(k){
        var m = chatMessages[k];
        if(!m || m.id == null || have[String(m.id)]) return;
        var iso = m.ts ? new Date(Number(m.ts)).toISOString() : '';
        notes.unshift({id: (Number(m.id) || String(m.id)), text: String(m.text || ''), img: String(m.img || ''), date: m.dateRu || (m.ts ? new Date(Number(m.ts)).toLocaleString('ru', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : ''), createdByUid: String(m.uid || ''), createdByName: String(m.name || ''), createdAtIso: iso, updatedAtIso: iso});
        added = true;
      });
      if(added) localStorage.setItem('notes', JSON.stringify(notes));
    }catch(_){ }
  }
  function migrateNotesToChat(){
    // Старые заметки одноразово переносятся в чат. Ключ = старый id,
    // поэтому даже одновременная миграция с двух устройств не создаёт дублей.
    try{
      if(localStorage.getItem('notes_chat_migrated_v1')) return;
      var old = parseJSON(localStorage.getItem('notes'), []) || [];
      if(!Array.isArray(old) || !old.length){ try{localStorage.setItem('notes_chat_migrated_v1','1');}catch(_){ } return; }
      var path = activeChatPath(); if(!path) return;
      var updates = {};
      old.forEach(function(n){
        if(!n || n.id == null) return;
        var id = String(n.id);
        var ts = Number(new Date(n.createdAtIso || 0).getTime() || 0) || Number(n.id) || Date.now();
        updates[id] = {id: id, text: String(n.text || ''), img: String(n.img || ''), uid: String(n.createdByUid || ''), name: String(n.createdByName || n.createdByEmail || ''), ts: ts, dateRu: String(n.date || ''), editedAt: 0};
      });
      db.ref(path).update(updates).then(function(){ try{localStorage.setItem('notes_chat_migrated_v1','1');}catch(_){ } });
    }catch(_){ }
  }
  window.lenferChatReady = function(){ return !!(chatRef && currentUser); };
  window.lenferChatList = function(){
    return Object.keys(chatMessages).map(function(k){ return chatMessages[k]; })
      .sort(function(a,b){ return Number(b.ts || 0) - Number(a.ts || 0); });
  };
  window.lenferChatSend = function(text, img, forceId, extra){
    if(!db || !currentUser) return false;
    var path = activeChatPath(); if(!path) return false;
    var id = String(forceId != null ? forceId : (String(Date.now()) + String(Math.floor(Math.random() * 900) + 100)));
    var a = currentProfile || actorFromFirebaseUser(currentUser);
    var rec = {id: id, text: String(text || ''), img: String(img || ''), uid: currentUser.uid, name: a.name || '', ts: Date.now(), dateRu: '', editedAt: 0};
    if(extra && extra.topicId) rec.topicId = String(extra.topicId);
    if(extra && extra.replyTo) rec.replyTo = extra.replyTo;
    chatMessages[id] = rec; chatCacheSave(); chatRender(); // мгновенно у себя, не ждём сервер
    db.ref(path).child(id).set(rec).catch(function(e){ status('Firebase: чат не принял сообщение (' + ((e && e.message) || e) + '). Оно уйдёт через общий канал.'); });
    return true;
  };
  // Точечное обновление полей сообщения (используется и правкой текста, и закреплением).
  window.lenferChatPatch = function(id, patch){
    id = String(id || '');
    var m = chatMessages[id]; if(!m) return false;
    chatMessages[id] = Object.assign({}, m, patch); chatCacheSave(); chatRender();
    var path = activeChatPath(); if(path) db.ref(path).child(id).update(patch).catch(function(){ });
    return true;
  };
  window.lenferChatEdit = function(id, text, img){
    return window.lenferChatPatch(id, {text: String(text || ''), img: String(img || ''), editedAt: Date.now()});
  };
  // Реакция пишется в свой лист узла reactions/<emoji>/<uid>, а не патчем всего
  // сообщения: так два человека, ставящих реакции одновременно, не затирают друг друга.
  window.lenferChatToggleReaction = function(id, emoji){
    if(!db || !currentUser) return false;
    id = String(id || '');
    var m = chatMessages[id]; if(!m) return false;
    var uid = currentUser.uid;
    var a = currentProfile || actorFromFirebaseUser(currentUser);
    var reactions = (m.reactions && typeof m.reactions === 'object') ? JSON.parse(JSON.stringify(m.reactions)) : {};
    var already = !!(reactions[emoji] && reactions[emoji][uid]);
    if(already){
      delete reactions[emoji][uid];
      if(!Object.keys(reactions[emoji]).length) delete reactions[emoji];
    }else{
      if(!reactions[emoji]) reactions[emoji] = {};
      reactions[emoji][uid] = a.name || '';
    }
    chatMessages[id] = Object.assign({}, m, {reactions: reactions}); chatCacheSave(); chatRender();
    var path = activeChatPath(); if(path){
      var leaf = db.ref(path).child(id).child('reactions').child(emoji).child(uid);
      if(already) leaf.remove().catch(function(){ }); else leaf.set(a.name || true).catch(function(){ });
    }
    return true;
  };
  window.lenferChatDelete = function(id){
    id = String(id || '');
    if(!chatMessages[id]) return false;
    delete chatMessages[id]; chatCacheSave(); chatRender();
    var path = activeChatPath(); if(path) db.ref(path).child(id).remove().catch(function(){ });
    return true;
  };
  chatCacheLoad(); // офлайн-просмотр последних сообщений до входа

  // ── Push-токен (FCM) ──
  // Токен знает только нативный слой (Android/Firebase Messaging SDK), а привязать
  // его к пользователю и общей базе может только этот, уже вошедший, JS. Native
  // просто зовёт window.lenferFcmTokenReceived(token) при каждом запуске приложения
  // и при обновлении токена — здесь сохраняем в профиль и в список участников
  // текущей общей базы, чтобы облачная функция знала, кому слать пуш.
  var pendingFcmToken = null;
  function trySaveFcmToken(){
    if(!pendingFcmToken || !db || !currentUser) return;
    var token = pendingFcmToken;
    var uid = currentUser.uid;
    var updates = {};
    updates['profiles/' + uid + '/fcmTokens/' + token] = true;
    if(currentWorkspaceId) updates['workspaces/' + currentWorkspaceId + '/members/' + uid + '/fcmTokens/' + token] = true;
    db.ref().update(updates).catch(function(){ });
  }
  window.lenferFcmTokenReceived = function(token){
    token = String(token || '').trim();
    if(!token) return;
    pendingFcmToken = token;
    trySaveFcmToken();
  };

  function stopSync(){
    clearTimeout(dirtyTimer);
    clearInterval(loopTimer);
    clearInterval(pushTimer);
    stopRealtime();
    stopChat();
  }

  function schedulePush(ms){
    if(!currentUser) return;
    dirty = true;
    status('Firebase: есть локальные изменения, жду отправку…');
    clearTimeout(dirtyTimer);
    dirtyTimer = setTimeout(function(){ pushAll(false); }, ms || 1800);
  }

  window.supaMarkDirtyKey = function(key, before, after){
    if(applying) return;
    if(String(before) === String(after)) return;
    var k = String(key || '');
    if(!has(SYNC_KEYS, k)) return;
    var ts = Date.now();
    rememberRemovedIdsFromRaw(k, before, after, ts);
    markKeyVersion(k, ts);
    schedulePush(1800);
  };

  function startPushLoop(){
    clearInterval(pushTimer);
    pushTimer = setInterval(function(){
      if(!document.hidden && currentUser && dirty) pushAll(false);
    }, 10000);
  }

  window.fbPullNow  = function(){ return pullAll(); };
  window.fbPushNow  = function(){ return pushAll(true); };
  window.fbFullSync = async function(){ await pullAll(); await pushAll(false); };
  window.fbRepairSync = async function(){ dirty = true; await pushAll(true); await pullAll(); };
  window.fbDirty = function(){ dirty = true; };

  window.supaConnectAndStart = window.fbFullSync;
  window.supaBootstrapServer = window.fbPushNow;
  window.supaAutoPullNow = window.fbPullNow;
  window.supaAutoToggle = window.fbPushNow;
  window.supaDownloadSQL = function(){ status('SQL больше не нужен: используется Firebase Realtime Database + Auth.'); };

  function patchStorage(){
    if(window.__fbStoragePatched) return;
    var origSet = Storage.prototype.setItem;
    var origRemove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function(key, value){
      var before = null;
      try{ if(this === localStorage) before = this.getItem(key); }catch(_){ }
      origSet.apply(this, arguments);
      try{ if(this === localStorage && typeof supaMarkDirtyKey === 'function') supaMarkDirtyKey(String(key), before, value); }catch(_){ }
    };
    Storage.prototype.removeItem = function(key){
      var before = null;
      try{ if(this === localStorage) before = this.getItem(key); }catch(_){ }
      origRemove.apply(this, arguments);
      try{ if(this === localStorage && typeof supaMarkDirtyKey === 'function') supaMarkDirtyKey(String(key), before, null); }catch(_){ }
    };
    window.__fbStoragePatched = true;
  }

  function relabel(){
    var btns = document.querySelectorAll('button');
    btns.forEach(function(b){
      var on = String(b.getAttribute('onclick') || '');
      if(on.indexOf('supaConnectAndStart') >= 0){ b.setAttribute('onclick','fbFullSync()'); b.textContent = '🔄 Синхронизировать'; }
      if(on.indexOf('supaBootstrapServer') >= 0){ b.setAttribute('onclick','fbPushNow()'); b.textContent = '⬆ Отправить с этого устройства'; }
      if(on.indexOf('supaAutoPullNow') >= 0){ b.setAttribute('onclick','fbPullNow()'); b.textContent = '⬇ Получить с сервера'; }
      if(on.indexOf('supaAutoToggle') >= 0){ b.setAttribute('onclick','fbPushNow()'); b.textContent = '⬆ Отправить сейчас'; }
      if(on.indexOf('supaDownloadSQL') >= 0){ b.setAttribute('onclick','fbMigrateLegacyW21()'); b.textContent = '🧳 Забрать старую w21'; }
    });
    var warn = document.querySelector('.supa-warning');
    if(warn) warn.innerHTML = 'Firebase Sync v4: заметки и отчёты синхронизируются между устройствами; отчёт сводится по дням, удаления заметок не воскресают.';
    var dbEl = document.querySelector('.supa-status');
    if(dbEl) dbEl.textContent = 'База: warehouse-dbec9 (Firebase + Auth + sync v4)';
    updateAuthUI();
  }

  function startLoop(){
    clearInterval(loopTimer);
    loopTimer = setInterval(function(){ if(!document.hidden && currentUser) pullAll(); }, PULL_EVERY);
  }

  function startAfterLogin(){
    stopSync();
    patchStorage();
    relabel();
    startRealtime();
    startChat();
    trySaveFcmToken(); // токен мог прийти от native ещё до входа — теперь есть uid/база
    startLoop();
    startPushLoop();
    pullAll().then(function(){ status('Firebase: синхронизация аккаунта активна.', true); try{registerWorkspaceMember();renderDiagnostics();renderAutoBackups();renderActionLogMini();renderCollabPanel();}catch(_){ } });
  }

  function boot(){
    try{
      if(!initFB()) return;
      patchStorage();
      relabel();
      auth.onAuthStateChanged(function(user){
        setUser(user);
        if(user){
          loadUserProfile(user).then(function(){
            startAfterLogin();
            status('Firebase: вошёл как ' + ((currentProfile&&currentProfile.name) || user.email || user.uid), true);
          }).catch(function(){
            startAfterLogin();
            status('Firebase: вошёл как ' + (user.email || user.uid), true);
          });
        }else{
          stopSync();
          currentProfile=null; window.lenferCurrentUserProfile=null;
          try{localStorage.removeItem('user_profile');}catch(_){ }
          updateAuthUI();
          status('Firebase: вход обязателен — открываю страницу регистрации');
          redirectToAuth();
        }
      });
      function pullIfStale(){ if(!currentUser) return; if(Date.now() - lastPullAt > 30000) pullAll(); }
      window.addEventListener('online',  pullIfStale);
      window.addEventListener('focus',   pullIfStale);
      document.addEventListener('visibilitychange', function(){ if(!document.hidden) pullIfStale(); });
    }catch(e){ status('Firebase boot error: ' + e.message); }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();


// ── v62: смартфон, реальные ряды верхних ярусов, недостачи/списания, импорт WMS в товары ──
function wmsBackFromTool(){
  // Возврат из инструментов/деталей к обычному экрану остатков внутри WMS.
  wmsSetLookupKind('stocks');
  const q=document.getElementById('wms-query'); if(q)q.focus();
  wmsSetStatus('Остатки сейчас. Введи УТ, ШК, название, ячейку или ЕО.','');
}

function wmsJsString(v){return String(v==null?'':v).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g,' ');}
function wmsUpperPartsV62(addr){return wmsUpperAddr(addr).split('-').filter(Boolean);}
function wmsUpperRowNumberV62(addr){const p=wmsUpperPartsV62(addr);return p.length>=2 && /^\d+$/.test(p[1])?Number(p[1]):null;}
function wmsUpperSectionNumberV62(addr){const p=wmsUpperPartsV62(addr);return p.length>=3 && /^\d+$/.test(p[2])?Number(p[2]):null;}
function wmsUpperPlaceNumberV62(addr){const p=wmsUpperPartsV62(addr);return p.length>=4 && /^\d+$/.test(p[3])?Number(p[3]):null;}
function wmsUpperTierNumberV62(addr){const p=wmsUpperPartsV62(addr);return p.length>=5 && /^\d+$/.test(p[4])?Number(p[4]):null;}
function wmsUpperRowKey(addr){
  const p=wmsUpperPartsV62(addr); const r=wmsUpperRowNumberV62(addr);
  return r===null?(p[0]||wmsUpperAddr(addr)):String(r);
}
function wmsUpperSectionKeyV62(addr){const n=wmsUpperSectionNumberV62(addr);return n===null?'—':String(n);}
function wmsUpperRowsFromRawV62(raw){
  const v=raw&&raw.value?raw.value:raw||{};
  const items=Array.isArray(v.items)?v.items:(Array.isArray(v.cells)?v.cells:(Array.isArray(raw&&raw.items)?raw.items:[]));
  return items.map(x=>({
    cellId:String(x.id||x.cellId||'').trim(), address:String(x.address||x.cellAddress||'').trim(),
    zoneName:String((x.zone&&x.zone.name)||x.zoneName||'').trim(), locationName:String((x.location&&x.location.name)||x.locationName||'').trim(),
    type:String(x.type||''), status:String(x.status||''), allowedOperations:Array.isArray(x.allowedOperations)?x.allowedOperations:[]
  })).filter(x=>{
    if(!x.cellId||!x.address)return false;
    const s=x.status.toUpperCase();
    if(s&&s!=='ACTIVE')return false;
    return true;
  });
}
wmsUpperItems=wmsUpperRowsFromRawV62;
function wmsUpperFiltered(){
  const zone=document.getElementById('wms-upper-zone')?.value||'all';
  const rawRow=wmsUpperAddr(document.getElementById('wms-upper-row')?.value||'');
  const rowDigits=(rawRow.match(/\d+/)||[]).join('');
  const parity=document.getElementById('wms-upper-parity')?.value||'all';
  const state=document.getElementById('wms-upper-state')?.value||'all';
  // фильтр по системе работает только после загрузки остатков
  const occupancyLoaded=Object.keys(wmsUpperOccupancy||{}).length>0;
  return (wmsUpperCells||[]).filter(c=>{
    if(zone!=='all'&&wmsUpperZoneKey(c)!==zone)return false;
    const row=wmsUpperRowNumberV62(c.address);
    if(rowDigits && String(row??'')!==rowDigits)return false;
    const section=wmsUpperSectionNumberV62(c.address);
    if(parity==='even' && (section===null||section%2!==0))return false;
    if(parity==='odd' && (section===null||section%2!==1))return false;
    if(occupancyLoaded){
      const o=wmsUpperOccupancy[c.cellId];
      if(state==='occupied' && !(o&&o.hasStock))return false;
      if(state==='empty' && !(o&&!o.hasStock))return false;
    }
    return true;
  }).sort((a,b)=>{
    const ra=wmsUpperRowNumberV62(a.address)||0,rb=wmsUpperRowNumberV62(b.address)||0;
    const sa=wmsUpperSectionNumberV62(a.address)||0,sb=wmsUpperSectionNumberV62(b.address)||0;
    const pa=wmsUpperPlaceNumberV62(a.address)||0,pb=wmsUpperPlaceNumberV62(b.address)||0;
    const ta=wmsUpperTierNumberV62(a.address)||0,tb=wmsUpperTierNumberV62(b.address)||0;
    return ra-rb||sa-sb||pa-pb||ta-tb||String(a.address).localeCompare(String(b.address),'ru');
  });
}
function wmsFillUpperRowList(){
  const dl=document.getElementById('wms-upper-row-list'); if(!dl)return;
  const zone=document.getElementById('wms-upper-zone')?.value||'all';
  const vals=[...new Set((wmsUpperCells||[]).filter(c=>zone==='all'||wmsUpperZoneKey(c)===zone).map(c=>wmsUpperRowNumberV62(c.address)).filter(n=>n!==null).map(String))].sort((a,b)=>Number(a)-Number(b));
  dl.innerHTML=vals.map(v=>'<option value="'+escHtml(v)+'"></option>').join('');
}
function wmsUpperCardV62(c){
  const o=wmsUpperOccupancy[c.cellId];
  const system=!o?'Система не проверена':(o.hasError?('Ошибка проверки'+(o.error?' · '+o.error:'')):(o.hasStock?('Системно занято · '+(o.stockRows||0)+' строк · '+(o.quantity||0)+' шт. · '+(o.huCount||0)+' ЕО'):'Системно пусто'));
  const cls=!o?'unknown':(o.hasError?'unknown':(o.hasStock?'occupied':'empty'));
  const row=wmsUpperRowNumberV62(c.address),section=wmsUpperSectionNumberV62(c.address),place=wmsUpperPlaceNumberV62(c.address),tier=wmsUpperTierNumberV62(c.address);
  const addr=wmsJsString(c.address),cid=wmsJsString(c.cellId);
  const isChecked=cls==='empty'&&wmsCheckedEmptyCells.has(c.cellId);
  const checkBtn=cls==='empty'?'<button id="wms-chk-'+escHtml(c.cellId)+'" class="wms-mini-copy'+(isChecked?' primary':'')+'" onclick="wmsToggleCellChecked(\''+cid+'\')">'+(isChecked?'✓ Проверено':'□ Отметить')+'</button>':'';
  // Для пустых ячеек — живая перепроверка остатков (справочник обновляется не в реальном времени)
  const stockBtn=cls==='empty'?'<button class="wms-mini-copy" onclick="wmsTierRecheckCell(\''+cid+'\',\''+addr+'\')">Остатки сейчас</button>':'';
  return '<article class="wms-upper-card '+cls+'"><div class="wms-upper-head"><div><div class="wms-upper-address">'+escHtml(c.address)+'</div><div class="wms-upper-meta">'+escHtml(c.zoneName||'Зона не указана')+' · ряд '+escHtml(row??'—')+' · секция '+escHtml(section??'—')+' · место '+escHtml(place??'—')+' · ярус '+escHtml(tier??'—')+'</div></div><button class="wms-mini-copy" onclick="wmsUpperCopy(\''+addr+'\',\'Ячейка\')">Ячейка</button></div><div class="wms-upper-system">'+escHtml(system)+'</div><div class="wms-upper-actions"><button class="wms-mini-copy" onclick="wmsLookupCellId(\''+cid+'\',\''+addr+'\')">Открыть</button>'+stockBtn+checkBtn+'<button class="wms-mini-copy" onclick="wmsUpperCopy(\''+wmsJsString(String(row??''))+'\',\'Ряд\')">Ряд</button><button class="wms-mini-copy" onclick="wmsUpperCopy(\''+wmsJsString(String(section??''))+'\',\'Секция\')">Секция</button></div></article>';
}
async function wmsTierRecheckCell(cellId, address){
  const cell=(wmsUpperCells||[]).find(c=>String(c.cellId)===String(cellId));
  const zoneName=cell?cell.zoneName:'';
  wmsSetStatus('Проверяю остатки ячейки '+address+' сейчас…','wait');
  try{
    const raw=await wmsCallNative('lookupWmsUpperStorageOccupancy',[JSON.stringify([{cellId:cellId,address:address,zoneName:zoneName}])],60000);
    const v=raw&&raw.value?raw.value:raw||{};
    const items=Array.isArray(v.items)?v.items:(Array.isArray(v.cells)?v.cells:(Array.isArray(v)?v:[]));
    const it=items.find(x=>x&&String(x.cellId)===String(cellId))||items[0];
    if(it)wmsUpperOccupancy[cellId]=it;
    try{ if(wmsLookupKind==='upper')wmsRenderUpperStorage(); else wmsRenderTierStorageV64(wmsLookupKind); }catch(e){}
    const has=it&&it.hasStock;
    if(has)wmsSetStatus('⚠ '+address+' уже занята: '+(it.quantity||0)+' шт · '+(it.huCount||0)+' ЕО. Статус обновлён.','');
    else wmsSetStatus(address+': пусто (проверено сейчас).','ok');
  }catch(e){wmsSetStatus((e&&e.message)||String(e),'err');}
}
window.wmsTierRecheckCell=wmsTierRecheckCell;
function wmsRenderUpperStorage(){
  const box=document.getElementById('wms-result'); if(!box||wmsLookupKind!=='upper')return;
  const all=wmsUpperCells||[]; const rows=wmsUpperFiltered();
  if(!all.length){box.innerHTML='<div class="hint" style="padding:24px 12px;"><span class="mark">▥</span><span class="txt">Нажми «Загрузить ячейки». WMS отдаст активные верхние места хранения.</span></div>';return;}
  const loaded=Object.keys(wmsUpperOccupancy||{}).length;
  const occ=rows.filter(c=>wmsUpperOccupancy[c.cellId]&&wmsUpperOccupancy[c.cellId].hasStock).length;
  const empty=rows.filter(c=>wmsUpperOccupancy[c.cellId]&&!wmsUpperOccupancy[c.cellId].hasStock).length;
  const cards=rows.slice(0,180).map(wmsUpperCardV62).join('');
  const tail=rows.length>180?'<div class="wms-upper-note">Показаны первые 180. Сузь ряд или чётность секции.</div>':'';
  // подсказка если фильтр по системе выбран, но остатки не загружены
  const stateVal=document.getElementById('wms-upper-state')?.value||'all';
  const noOccHint=(stateVal!=='all'&&!loaded)?'<div class="wms-upper-note" style="color:var(--gold)">Фильтр «'+escHtml(stateVal==='occupied'?'Только занятые':'Только пустые')+'» работает после нажатия «Проверить остатки».</div>':'';
  box.innerHTML='<div class="wms-card"><div class="wms-card-body"><div class="wms-product-name">Верхние ярусы</div><div class="wms-meta">Адрес: <b>SH-4-54-3-2</b> → ряд 4 · секция 54 · место 3 · ярус 2. Чётность — по секции.</div></div></div>'+noOccHint+'<div class="wms-upper-summary"><b>'+escHtml(rows.length)+'</b><span>в выборке</span><b>'+escHtml(occ)+'</b><span>занято</span><b>'+escHtml(empty)+'</b><span>пусто</span></div><div class="wms-actions wms-upper-result-actions"><button class="exi-btn primary" onclick="wmsCheckUpperOccupancy()">Проверить остатки</button><button class="exi-btn" onclick="wmsLoadUpperStorageCells()">Обновить ячейки</button><button class="exi-btn" onclick="wmsBackFromTool()">← Назад</button></div><div class="wms-upper-list">'+(cards||'<div class="no-results">Нет ячеек по выбранному фильтру</div>')+'</div>'+tail+(loaded?'<div class="wms-upper-note">Проверено остатков: '+escHtml(loaded)+' ячеек.</div>':'');
}
async function wmsLoadUpperStorageCells(){
  wmsStopRequested=false;
  wmsSetStatus('Загружаю активные верхние ячейки хранения…','wait');
  try{
    const raw=await wmsCallNative('lookupWmsUpperStorageCells',[JSON.stringify({})],120000);
    wmsUpperCells=wmsUpperRowsFromRawV62(raw); wmsUpperOccupancy={}; wmsFillUpperRowList();
    if(!wmsUpperCells.length)throw new Error('WMS вернула пустой справочник. Проверь авторизацию WMS.');
    // Новая выгрузка ячеек = новая доска обхода: сегодняшние пометки «проверено»/«исправлено»
    // с прошлой выгрузки скрываются (нерешённые «проблемы» остаются видны).
    setStickyDate('tier_work_date',rkTodayISO());
    wmsRenderUpperStorage();
    wmsSetStatus('Загружено ячеек: '+wmsUpperCells.length+'. Выбери ряд и чётность секции.','ok');
  }catch(e){wmsSetStatus((e&&e.message)||'Не смог загрузить верхние ячейки.','err');}
}

function wmsProductsFromResultV62(result){
  if(!result)return [];
  const p=result.product||{}; const out=[];
  function add(x){
    const ut=String(x.nomenclatureCode||x.ut||'').trim();
    const name=String(x.name||'').trim();
    const barcodes=[];
    if(x.barcode)barcodes.push(String(x.barcode));
    if(Array.isArray(x.barcodes))x.barcodes.forEach(b=>{if(b)barcodes.push(String(b));});
    const unique=wmsUniqueValues(barcodes);
    if(!ut||!name)return;
    out.push({ut,name,barcodes:unique,barcode:unique[0]||'',img:String(x.imageUrl||x.img||'').trim()});
  }
  if(p.nomenclatureCode||p.name)add(p);
  (result.rows||[]).forEach(add);
  const by={}; out.forEach(x=>{const k=x.ut.toUpperCase(); if(!by[k])by[k]=x; else {if(!by[k].img&&x.img)by[k].img=x.img; by[k].barcodes=wmsUniqueValues(by[k].barcodes.concat(x.barcodes||[]));by[k].barcode=by[k].barcodes[0]||by[k].barcode;}});
  return Object.values(by);
}
function wmsImportLastStocksToCatalog(){
  const products=wmsProductsFromResultV62(wmsLastResult);
  if(!products.length){wmsSetStatus('В результате нет УТ и наименований для импорта.','err');return;}
  const custom=getCustomItems().slice(); let added=0,updated=0;
  products.forEach(p=>{
    const i=custom.findIndex(x=>String(x.ut||'').toUpperCase()===p.ut.toUpperCase());
    const allB=wmsUniqueValues(p.barcodes||[]);
    if(i<0){custom.unshift(createMeta({ut:p.ut,name:p.name,barcode:p.barcode,barcodes:allB.join(', '),img:p.img,imageUrl:p.img,custom:true,source:'wms'}));added++;}
    else {const old=custom[i];custom[i]=touchMeta({...old,name:p.name||old.name,barcode:p.barcode||old.barcode,barcodes:allB.length?allB.join(', '):(old.barcodes||''),img:p.img||old.img||'',imageUrl:p.img||old.imageUrl||'',source:old.source||'wms'});updated++;}
    if(p.barcode)saveCustomBarcode(p.ut,p.barcode);
  });
  try{set('custom_items',custom);}catch(e){wmsSetStatus('Не смог сохранить товары: возможно, не хватает места для картинок.','err');return;}
  logAction('product','Импорт из WMS в товары: '+products.length,{count:products.length,added,updated});
  try{if(typeof render==='function')render();}catch(e){}
  wmsSetStatus('В товары: '+products.length+' поз. · добавлено '+added+' · обновлено '+updated+'. УТ, ШК, название и картинка сохранены; ШК откроется графически в карточке товара.','ok');
}

// v70 — содержимое ячейки: крупное количество и визуальный штрихкод товара.
// Важно: визуальный ШК строится только из настоящего кода, который вернула WMS.
// Подделывать ШК из УТ нельзя: сканер прочитает его, но товар не найдёт.
function wmsStockBarcodeValuesV70(row){
  const p=(wmsLastResult&&wmsLastResult.product)||{};
  const out=[];
  const add=(value)=>{
    if(Array.isArray(value)){value.forEach(add);return;}
    splitBarcodeValues(value).forEach(code=>{if(out.indexOf(code)<0)out.push(code);});
  };
  add(row&&row.barcode); add(row&&row.barcodes);
  add(p.barcode); add(p.barcodes);
  return out;
}
function wmsShowStockBarcodeV70(index){
  const rows=(wmsLastResult&&wmsLastResult.rows)||[];
  const row=rows[Number(index)]||{};
  const codes=wmsStockBarcodeValuesV70(row);
  if(!codes.length){wmsSetStatus('WMS не вернула ШК для этой позиции — рисовать фальшивый код не буду.','err');return;}
  const p=(wmsLastResult&&wmsLastResult.product)||{};
  const name=String(row.name||p.name||'Товар');
  const ut=String(row.nomenclatureCode||p.nomenclatureCode||'');
  zoomBarcode(codes[0],codes,{title:name,subtitle:ut||'Товар из WMS'});
}
function wmsRenderStocksMobileV62(result){
  wmsLastResult=result;wmsLastChoices=null;
  const box=document.getElementById('wms-result'); if(!box)return;
  const sourceRows=(result&&result.rows)||[]; const rows=wmsApplyStorageFilter(sourceRows);
  if(!sourceRows.length){box.innerHTML='<div class="no-results">Нет строк</div>';return;}
  if(String(result.mode||'').indexOf('changes')===0){box.innerHTML=wmsRenderChangesResult(result,result.product||{},sourceRows);return;}
  if(!rows.length){box.innerHTML='<div class="no-results">По фильтру хранения строк нет. <button class="exi-btn" onclick="wmsToggleStorageOnly()">Показать всё</button></div>';return;}
  const p=result.product||{};
  const isCell=result.mode==='cell'||result.mode==='hu';
  const title=isCell?(p.name||((result.mode==='hu'?'Содержимое ЕО ':'Содержимое ячейки ')+(result.cellAddress||result.query||''))):(p.name||rows[0].name||'Остатки WMS');
  const headerImg=p.imageUrl?'<img class="wms-img" src="'+escHtml(p.imageUrl)+'" loading="lazy" onerror="this.style.display=\'none\'">':'';
  const isCountable=result.mode==='cell';
  const cards=rows.map((r,idx)=>{
    const img=r.imageUrl?'<img class="wms-stock-thumb" src="'+escHtml(r.imageUrl)+'" loading="lazy" onerror="this.style.display=\'none\'">':'';
    const name=r.name||p.name||'Товар'; const ut=r.nomenclatureCode||p.nomenclatureCode||''; const barcodes=wmsStockBarcodeValuesV70(r); const bc=barcodes[0]||''; const hu=r.handlingUnitBarcode||'';
    const qty=Number(r.quantity)||0;
    const address=r.cellAddress||result.cellAddress||'';
    const copy=(v,l)=>'<button class="wms-mini-copy" onclick="wmsCopyFallback(\''+wmsJsString(v)+'\');wmsSetStatus(\''+l+' скопировано.\',\'ok\')">'+l+'</button>';
    const barcodeButton=bc?'<button class="wms-mini-copy wms-barcode-open" onclick="wmsShowStockBarcodeV70('+idx+')">ШК</button>':'';
    const countBtn=isCountable?'<button class="exi-btn primary" style="width:100%;margin-top:8px;" onclick="wmsCountFromCell(\''+wmsJsString(address)+'\',\''+wmsJsString(ut)+'\',\''+wmsJsString(name)+'\','+qty+')">📊 Посчитать в «Счёт»</button>':'';
    return '<article class="wms-stock-card"><div class="wms-stock-main">'+img+'<div class="wms-stock-copy"><div class="wms-stock-name">'+escHtml(name)+'</div><div class="wms-stock-meta"><b>'+escHtml(ut||'Без УТ')+'</b>'+(r.bestBeforeDate?' · до '+escHtml(r.bestBeforeDate):'')+'</div>'+(address?'<div class="wms-stock-meta">'+escHtml(address)+(r.zoneName?' · '+escHtml(r.zoneName):'')+'</div>':'')+(hu?'<div class="wms-stock-code">ЕО '+escHtml(hu)+'</div>':'')+(r.status?'<div class="wms-stock-status">'+escHtml(r.status)+'</div>':'')+'</div><div class="wms-stock-qty-big" aria-label="Количество '+escHtml(qty)+' штук"><b>'+escHtml(qty)+'</b><span>шт.</span></div></div><div class="wms-stock-copy-row">'+copy(ut,'УТ')+barcodeButton+(bc?copy(bc,'Копир ШК'):'')+copy(name,'Название')+(hu?copy(hu,'ЕО'):'')+(address?copy(address,'Ячейка'):'')+'</div>'+countBtn+'</article>';
  }).join('');
  // Пришли сюда кнопкой «Открыть» с плитки обхода ярусов (Верхние ярусы/Первый ярус) —
  // режим не меняется, значит можно вернуться прямо к тому же списку без перезагрузки.
  const backToTierBtn=(wmsLookupKind==='tier1'||wmsLookupKind==='upper')
    ?'<button class="exi-btn primary" style="width:100%;margin-bottom:10px;" onclick="wmsBackToTier()">← Назад к обходу ярусов</button>'
    :'';
  box.innerHTML=backToTierBtn+'<div class="wms-card">'+headerImg+'<div class="wms-card-body"><div class="wms-product-name">'+escHtml(title)+'</div><div class="wms-meta">Строк: <b>'+escHtml(rows.length)+'</b> · остаток: <b>'+escHtml(rows.reduce((n,r)=>n+(Number(r.quantity)||0),0))+'</b> шт.</div></div></div><div class="wms-actions wms-result-actions">'+wmsStorageToggleButton()+'<button class="exi-btn primary" onclick="wmsImportLastStocksToCatalog()">В товары</button><button class="exi-btn" onclick="wmsImportLastStocksToHH11()">В HH 1-1</button><button class="exi-btn" onclick="wmsCopyCells()">Список</button></div><div class="wms-stock-list">'+cards+'</div>';
}
wmsRenderResult=wmsRenderStocksMobileV62;

function wmsBackToTier(){
  const kind=(wmsLookupKind==='tier1')?'tier1':'upper';
  wmsRenderTierStorageV64(kind);
  const st=window.wmsTierReturnState; window.wmsTierReturnState=null;
  if(!st)return;
  setTimeout(()=>{
    window.scrollTo(0,st.scrollY||0);
    const el=st.cellId?document.getElementById('tier-tile-'+st.cellId):null;
    if(el){
      const r=el.getBoundingClientRect();
      // Если после перерисовки плитка уехала с экрана (список чуть изменился) — доводим до неё.
      if(r.top<0||r.bottom>window.innerHeight)el.scrollIntoView({block:'center'});
      el.classList.add('tier-tile-return');
      setTimeout(()=>{try{el.classList.remove('tier-tile-return');}catch(_){}},1600);
    }
  },30);
}

function wmsIssueZoneV62(addr){const a=wmsUpperAddr(addr);if(a.startsWith('HH-'))return 'cold';if(a.startsWith('SH-'))return 'dry';return 'other';}
function wmsIssueDateV62(r){return wmsDateIsoDay(r.completedAt||r.createdAt||r.operationStartedAt||'');}
function wmsLargeIssueRowsV62(){
  const state=window.wmsLargeIssues||{writeoffs:[],recounts:[]};
  const zone=document.getElementById('wms-loss-zone')?.value||'all';
  const min=Math.max(1,Number(document.getElementById('wms-loss-min')?.value||20)||20);
  const rows=[];
  (state.writeoffs||[]).forEach(r=>{const loss=Math.abs(Math.min(0,Number(r.sourceDelta||0)));if(loss<min)return;const z=wmsIssueZoneV62(r.sourceCellAddress);if(zone!=='all'&&z!==zone)return;rows.push({kind:'writeoff',loss,zone:z,row:r,cell:r.sourceCellAddress||''});});
  (state.recounts||[]).forEach(r=>{const diff=Number(r.discrepancyQty||0);const loss=Math.abs(Math.min(0,diff));if(loss<min)return;const z=wmsIssueZoneV62(r.cellAddress);if(zone!=='all'&&z!==zone)return;rows.push({kind:'recount',loss,zone:z,row:r,cell:r.cellAddress||''});});
  return rows.sort((a,b)=>b.loss-a.loss||String(a.cell).localeCompare(String(b.cell),'ru'));
}
function wmsRenderLargeLosses(){
  const box=document.getElementById('wms-result');if(!box||wmsLookupKind!=='losses')return;
  if(!window.wmsLargeIssues){box.innerHTML='<div class="hint" style="padding:24px 12px;"><span class="mark">▼</span><span class="txt">Выбери дату и порог. Покажу только крупные недостачи по пересчётам и списания из хранения.</span></div>';return;}
  const rows=wmsLargeIssueRowsV62(); const cold=rows.filter(x=>x.zone==='cold'),dry=rows.filter(x=>x.zone==='dry'); const sum=a=>a.reduce((n,x)=>n+x.loss,0);
  const cards=rows.slice(0,200).map(x=>{
    if(x.kind==='recount'){
      const r=x.row;const cell=wmsJsString(r.cellAddress||''),id=wmsJsString(r.id||'');
      return '<article class="wms-loss-card"><div class="wms-loss-head"><div class="wms-loss-delta">−'+escHtml(x.loss)+' шт.</div><div class="wms-loss-op">Пересчёт</div></div><div class="wms-loss-name">'+escHtml(r.cellAddress||'Ячейка не указана')+'</div><div class="wms-loss-meta">'+escHtml(wmsRecountLabelScope(r.scope||''))+' · '+escHtml(wmsRecountLabelReason(r.reason||''))+' · '+escHtml(wmsRecountDateText(r.completedAt||r.createdAt||''))+'</div><div class="wms-loss-location">Система: <b>'+escHtml(r.expectedQty??'—')+'</b> · факт: <b>'+escHtml(r.actualQty??'—')+'</b> · позиций: '+escHtml(r.positionCount??'—')+'</div><div class="wms-loss-meta">'+escHtml(r.executorName||'Исполнитель не указан')+'</div><div class="wms-stock-copy-row"><button class="wms-mini-copy" onclick="wmsCopyFallback(\''+cell+'\');wmsSetStatus(\'Ячейка скопирована.\',\'ok\')">Ячейка</button><button class="wms-mini-copy" onclick="wmsOpenLargeIssueRecount(\''+id+'\')">Детали</button></div></article>';
    }
    const r=x.row;const ut=wmsJsString(r.nomenclatureCode||''),name=wmsJsString(r.name||''),bc=wmsJsString(r.barcode||''),cell=wmsJsString(r.sourceCellAddress||'');
    return '<article class="wms-loss-card"><div class="wms-loss-head"><div class="wms-loss-delta">−'+escHtml(x.loss)+' шт.</div><div class="wms-loss-op">Списание</div></div><div class="wms-loss-name">'+escHtml(r.name||'Товар не указан')+'</div><div class="wms-loss-meta">'+escHtml(r.nomenclatureCode||'')+' · '+escHtml(wmsDateShort(r.operationStartedAt))+'</div><div class="wms-loss-location">Из хранения: <b>'+escHtml(r.sourceCellAddress||'—')+'</b>'+((r.sourceHandlingUnitBarcode)?(' · ЕО '+escHtml(r.sourceHandlingUnitBarcode)):'')+'</div><div class="wms-loss-meta">'+escHtml(r.userName||'Исполнитель не указан')+'</div><div class="wms-stock-copy-row"><button class="wms-mini-copy" onclick="wmsCopyFallback(\''+ut+'\');wmsSetStatus(\'УТ скопировано.\',\'ok\')">УТ</button><button class="wms-mini-copy" onclick="wmsCopyFallback(\''+bc+'\');wmsSetStatus(\'ШК скопирован.\',\'ok\')">ШК</button><button class="wms-mini-copy" onclick="wmsCopyFallback(\''+name+'\');wmsSetStatus(\'Название скопировано.\',\'ok\')">Название</button><button class="wms-mini-copy" onclick="wmsCopyFallback(\''+cell+'\');wmsSetStatus(\'Ячейка скопирована.\',\'ok\')">Ячейка</button></div></article>';
  }).join('');
  box.innerHTML='<div class="wms-card"><div class="wms-card-body"><div class="wms-product-name">Крупные недостачи и списания</div><div class="wms-meta">Только пересчёты с минусом и списания. Отгрузки/перемещения исключены.</div></div></div><div class="wms-loss-summary"><b>'+escHtml(rows.length)+'</b><span>случаев</span><b>−'+escHtml(sum(cold))+'</b><span>Холод</span><b>−'+escHtml(sum(dry))+'</b><span>Сухой</span></div><div class="wms-actions"><button class="exi-btn primary" onclick="wmsLoadLargeLosses()">Обновить</button><button class="exi-btn" onclick="wmsBackFromTool()">← Назад</button></div><div class="wms-loss-list">'+(cards||'<div class="no-results">По выбранным условиям недостач и списаний нет.</div>')+'</div>'+(rows.length>200?'<div class="wms-upper-note">Показаны первые 200 строк. Подними порог, чтобы сузить список.</div>':'');
}
async function wmsLoadLargeLosses(){
  const date=document.getElementById('wms-loss-date')?.value||''; if(!date){wmsSetStatus('Выбери дату.','err');return;}
  const b=wmsMoscowDayBounds(date); if(!b){wmsSetStatus('Некорректная дата.','err');return;}
  wmsSetStatus('Ищу списания и пересчёты с недостачей за '+date+'…','wait');
  const errors=[];let writeoffs=[];let recounts=[];
  try{const raw=await wmsCallNative('lookupWmsDailyStorageLosses',[JSON.stringify({date,from:b.from,to:b.to,zone:'all',kind:'writeoff'})],180000);writeoffs=wmsNormalizeChangesResult(raw).rows||[];}catch(e){errors.push('списания: '+((e&&e.message)||e));}
  try{
    const raw=await wmsCallNative('lookupWmsRecountingTasks',[JSON.stringify({status:'all'})],90000);
    const list=wmsNormalizeRecountingResult(raw).rows||[];
    const day=list.filter(r=>wmsDateIsoDay(r.completedAt||r.createdAt)===date).slice(0,100);
    if(day.length){const det=await wmsCallNative('lookupWmsRecountingTaskDetails',[JSON.stringify(day.map(r=>r.id).filter(Boolean))],180000);const tasks=wmsFindDetailTasks(det);const by={};tasks.forEach(t=>{const id=t.id||t._loadedDetailId||'';if(id)by[id]=t;});day.forEach(r=>{if(by[r.id])wmsApplyRecountDetail(r,by[r.id]);});recounts=day.filter(r=>r.detailLoaded);}
  }catch(e){errors.push('пересчёты: '+((e&&e.message)||e));}
  window.wmsLargeIssues={writeoffs,recounts,date};wmsRenderLargeLosses();
  wmsSetStatus(errors.length?('Загружено частично: '+errors.join(' · ')):('Готово: списаний '+writeoffs.length+' · пересчётов '+recounts.length+'.'),'ok');
}


// ── v62.fix: своя wmsCheckUpperOccupancy для v62 (защитный разбор формата WMS) ──
async function wmsCheckUpperOccupancy(){
  const cells=wmsUpperFiltered();
  if(!cells.length){wmsSetStatus('По фильтру нет ячеек.','err');return;}
  const chunkSize=60; let done=0;
  wmsStopRequested=false;
  wmsSetStatus('Проверяю остатки: 0 / '+cells.length+'…','wait');
  try{
    for(let i=0;i<cells.length;i+=chunkSize){
      if(wmsStopRequested){
        wmsRenderUpperStorage();
        wmsSetStatus('Остановлено. Проверено '+Math.min(done,cells.length)+' из '+cells.length+' — что успело, уже на экране.','');
        return;
      }
      const chunk=cells.slice(i,i+chunkSize);
      const raw=await wmsCallNative('lookupWmsUpperStorageOccupancy',[JSON.stringify(chunk.map(c=>({cellId:c.cellId,address:c.address,zoneName:c.zoneName})))],180000);
      // защитный разбор: пробуем items → cells → голый массив
      const v=raw&&raw.value?raw.value:raw||{};
      const items=Array.isArray(v.items)?v.items:(Array.isArray(v.cells)?v.cells:(Array.isArray(v)?v:[]));
      items.forEach(x=>{
        const id=String(x.cellId||x.id||'').trim(); if(!id)return;
        // hasStock: явный bool ИЛИ quantity>0 ИЛИ stockRows>0
        const hasStock=typeof x.hasStock==='boolean'?x.hasStock:((Number(x.quantity||0)>0)||(Number(x.stockRows||0)>0));
        wmsUpperOccupancy[id]={cellId:id,hasStock,quantity:Number(x.quantity||0),stockRows:Number(x.stockRows||0),huCount:Number(x.huCount||0)};
      });
      done+=chunk.length; wmsRenderUpperStorage();
      wmsSetStatus('Проверяю: '+Math.min(done,cells.length)+' / '+cells.length+'…','wait');
    }
    wmsRenderUpperStorage();
    const occ=Object.values(wmsUpperOccupancy).filter(x=>x.hasStock).length;
    const emp=Object.values(wmsUpperOccupancy).filter(x=>!x.hasStock).length;
    wmsSetStatus('Готово: '+occ+' занято · '+emp+' пусто.','ok');
  }catch(e){wmsSetStatus((e&&e.message)||'Ошибка проверки остатков.','err');}
}

// Экспорт функций для inline-кнопок.
window.wmsBackFromTool=wmsBackFromTool;
window.wmsImportLastStocksToCatalog=wmsImportLastStocksToCatalog;
window.wmsLoadUpperStorageCells=wmsLoadUpperStorageCells;
window.wmsCheckUpperOccupancy=wmsCheckUpperOccupancy;
window.wmsUpperFilterChanged=wmsUpperFilterChanged;
window.wmsLoadLargeLosses=wmsLoadLargeLosses;

// v62.1: открыть детали пересчёта из списка крупных недостач без зависимости от предыдущего экрана.
async function wmsOpenLargeIssueRecount(id){
  const issue=(window.wmsLargeIssues&&window.wmsLargeIssues.recounts||[]).find(x=>String(x.id||'')===String(id||''));
  if(!issue){wmsSetStatus('Не нашёл этот пересчёт в текущем списке. Обнови данные.','err');return;}
  wmsLastResult={mode:'recountingTasks',rows:[issue],totalRows:1,loadedRows:1,filters:{status:'all'}};
  wmsSetLookupKind('recounting');
  wmsRenderRecountingResult(wmsLastResult);
  await wmsLoadOneRecountDetail(id);
}
window.wmsOpenLargeIssueRecount=wmsOpenLargeIssueRecount;


// ── v65: ярусы + выбор нескольких рядов через запятую ──
// В WMS адреса имеют вид SH-4-54-3-2. Ярус — ПОСЛЕДНИЙ числовой сегмент,
// а не "пятый сегмент": так код не ломается, если формат адреса расширят.
const wmsSetLookupKindV63 = wmsSetLookupKind;
const wmsRefreshModeButtonsV63 = wmsRefreshModeButtons;
const wmsClearResultV63 = wmsClearResult;

function wmsTierViewV64(kind){
  return kind==='tier1'
    ? {kind:'tier1', prefix:'wms-tier1', title:'Первый ярус хранения', shortTitle:'Первый ярус', tierLabel:'первого яруса', emptyLabel:'пустых на первом ярусе'}
    : {kind:'upper', prefix:'wms-upper', title:'Верхние ярусы хранения', shortTitle:'Верхние ярусы', tierLabel:'со 2-го яруса и выше', emptyLabel:'пустых верхних ячеек'};
}
function wmsTierControlV64(kind, field){
  const view=wmsTierViewV64(kind);
  return document.getElementById(view.prefix+'-'+field);
}
function wmsTierNumberV64(addr){
  const parts=wmsUpperAddr(addr).split('-').map(x=>x.trim()).filter(Boolean);
  const last=parts[parts.length-1]||'';
  return /^\d+$/.test(last)?Number(last):null;
}
function wmsTierCellsV64(kind){
  const target=kind==='tier1'?'tier1':'upper';
  return (wmsUpperCells||[]).filter(c=>{
    // Первый ярус/Верхние ярусы — только настоящие стеллажи хранения HH/SH.
    // Без этой проверки сюда попадали и другие зоны (напр. КДК-холод), у которых
    // просто совпадает последняя цифра адреса с нужным ярусом.
    if(!/^(HH|SH)-/i.test(String(c.address||'').trim()))return false;
    const tier=wmsTierNumberV64(c.address);
    return target==='tier1'?tier===1:tier!==null&&tier>1;
  });
}
// v65: поле «Ряд» принимает один или несколько рядов через запятую.
// Примеры: «4», «4, 7, 12». Пробелы и точка с запятой тоже не ломают фильтр.
function wmsTierSelectedRowsV65(value){
  const raw=String(value||'').trim();
  if(!raw)return [];
  const rows=new Set();
  raw.split(/[;,]/).forEach(part=>{
    const match=String(part||'').trim().match(/^\d+$/);
    if(match)rows.add(Number(match[0]));
  });
  return [...rows];
}
function wmsTierFilteredV64(kind){
  const view=wmsTierViewV64(kind);
  const zone=wmsTierControlV64(view.kind,'zone')?.value||'all';
  const selectedRows=wmsTierSelectedRowsV65(wmsTierControlV64(view.kind,'row')?.value||'');
  const parity=wmsTierControlV64(view.kind,'parity')?.value||'all';
  const state=wmsTierControlV64(view.kind,'state')?.value||'all';
  const occupancyLoaded=Object.keys(wmsUpperOccupancy||{}).length>0;
  return wmsTierCellsV64(view.kind).filter(c=>{
    if(zone!=='all'&&wmsUpperZoneKey(c)!==zone)return false;
    const row=wmsUpperRowNumberV62(c.address);
    if(selectedRows.length&&!selectedRows.includes(Number(row)))return false;
    const section=wmsUpperSectionNumberV62(c.address);
    if(parity==='even'&&(section===null||section%2!==0))return false;
    if(parity==='odd'&&(section===null||section%2!==1))return false;
    if(occupancyLoaded){
      const o=wmsUpperOccupancy[c.cellId];
      if(state==='occupied'&&!(o&&o.hasStock===true))return false;
      if(state==='empty'&&!(o&&o.hasStock===false&&!o.hasError))return false;
    }
    return true;
  }).sort((a,b)=>{
    const ra=wmsUpperRowNumberV62(a.address)||0, rb=wmsUpperRowNumberV62(b.address)||0;
    const sa=wmsUpperSectionNumberV62(a.address)||0, sb=wmsUpperSectionNumberV62(b.address)||0;
    const pa=wmsUpperPlaceNumberV62(a.address)||0, pb=wmsUpperPlaceNumberV62(b.address)||0;
    const ta=wmsTierNumberV64(a.address)||0, tb=wmsTierNumberV64(b.address)||0;
    return ra-rb||sa-sb||pa-pb||ta-tb||String(a.address).localeCompare(String(b.address),'ru');
  });
}
function wmsFillTierRowListV64(kind){
  const view=wmsTierViewV64(kind);
  const dl=document.getElementById(view.prefix+'-row-list');
  if(!dl)return;
  const zone=wmsTierControlV64(view.kind,'zone')?.value||'all';
  const vals=[...new Set(wmsTierCellsV64(view.kind)
    .filter(c=>zone==='all'||wmsUpperZoneKey(c)===zone)
    .map(c=>wmsUpperRowNumberV62(c.address))
    .filter(n=>n!==null)
    .map(String))].sort((a,b)=>Number(a)-Number(b));
  dl.innerHTML=vals.map(v=>'<option value="'+escHtml(v)+'"></option>').join('');
}
// Змейка чёт/нечет: включается для ровно одного выбранного ряда и чётности "Все" —
// иначе фильтр по чётности и обход змейкой противоречат друг другу.
function wmsTierSnakeEligible(view){
  const selectedRows=wmsTierSelectedRowsV65(wmsTierControlV64(view.kind,'row')?.value||'');
  const parity=wmsTierControlV64(view.kind,'parity')?.value||'all';
  return selectedRows.length===1 && parity==='all';
}
function wmsTierSnakeColumns(rows){
  const evens=[],odds=[];
  rows.forEach(c=>{
    const s=wmsUpperSectionNumberV62(c.address);
    if(s===null||s%2===0)evens.push(c); else odds.push(c);
  });
  evens.sort((a,b)=>(wmsUpperSectionNumberV62(a.address)||0)-(wmsUpperSectionNumberV62(b.address)||0)||(wmsUpperPlaceNumberV62(a.address)||0)-(wmsUpperPlaceNumberV62(b.address)||0));
  // Нечётные — навстречу, с конца прохода: дошёл до последней чётной секции — рядом первая нечётная.
  odds.sort((a,b)=>(wmsUpperSectionNumberV62(b.address)||0)-(wmsUpperSectionNumberV62(a.address)||0)||(wmsUpperPlaceNumberV62(b.address)||0)-(wmsUpperPlaceNumberV62(a.address)||0));
  return {evens:evens,odds:odds};
}
function wmsTierOccInfo(c){
  const o=wmsUpperOccupancy[c.cellId];
  if(!o)return {cls:'unknown',badge:'Не проверено',text:'Система не проверена'};
  if(o.hasError)return {cls:'unknown',badge:'Ошибка',text:'Ошибка проверки'+(o.error?' · '+o.error:'')};
  if(o.hasStock)return {cls:'ok',badge:'Занято',text:'Системно занято · '+(o.stockRows||0)+' строк · '+(o.quantity||0)+' шт. · '+(o.huCount||0)+' ЕО'};
  return {cls:'empty',badge:'Пусто',text:'Системно пусто'};
}
function wmsTierTileV65(c){
  const occ=wmsTierOccInfo(c);
  const row=wmsUpperRowNumberV62(c.address),section=wmsUpperSectionNumberV62(c.address),place=wmsUpperPlaceNumberV62(c.address),tier=wmsUpperTierNumberV62(c.address);
  const addr=wmsJsString(c.address),cid=wmsJsString(c.cellId);
  const mark=tierGetMark(c.cellId);
  const markStatus=mark?mark.status:'';
  const tileCls='tier-tile occ-'+occ.cls+(markStatus?' mark-'+markStatus:'');
  const markChip=markStatus==='problem'?'<span class="tier-mark-chip problem">⚠ Проблема</span>'
    :markStatus==='fixed'?'<span class="tier-mark-chip fixed">✓ Исправлено</span>'
    :markStatus==='checked'?'<span class="tier-mark-chip fixed">✓ Проверено</span>'
    :'';
  const markBy=(mark&&mark.by)
    ?'<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--muted);">'+(typeof avatarHtml==='function'?avatarHtml(mark.byUid,mark.by,14):'')+escHtml(mark.by)+(mark.ts?' · '+new Date(Number(mark.ts)).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'')+'</span>'
    :'';
  const markActions=markStatus==='problem'
    ?'<button class="wms-mini-copy" onclick="wmsTierMarkFixedUi(\''+cid+'\')">✓ Исправлено</button><button class="wms-mini-copy" onclick="wmsTierMarkResetUi(\''+cid+'\')">✕ Отменить</button>'
    :markStatus==='fixed'
    ?'<button class="wms-mini-copy" onclick="wmsTierMarkProblemUi(\''+cid+'\')">↺ Снова проблема</button><button class="wms-mini-copy" onclick="wmsTierMarkResetUi(\''+cid+'\')">✕ Отменить</button>'
    :markStatus==='checked'
    ?'<button class="wms-mini-copy" onclick="wmsTierMarkResetUi(\''+cid+'\')">✕ Отменить</button>'
    :'<button class="wms-mini-copy" onclick="wmsTierMarkCheckedUi(\''+cid+'\')">✓ Проверено</button><button class="wms-mini-copy" onclick="wmsTierMarkProblemUi(\''+cid+'\')">⚠ Проблема</button>';
  const comment=(markStatus==='problem'||markStatus==='fixed')
    ?'<textarea class="tier-tile-comment" placeholder="Комментарий: что не так…" oninput="wmsTierCommentUi(\''+cid+'\',this.value)">'+escHtml((mark&&mark.comment)||'')+'</textarea>'
    :'';
  return '<article class="'+tileCls+'" id="tier-tile-'+cid+'">'+
    '<div class="tier-tile-top"><div class="tier-tile-addr">'+escHtml(c.address)+'</div><span class="tier-badge '+occ.cls+'">'+occ.badge+'</span></div>'+
    '<div class="tier-tile-meta">'+escHtml(c.zoneName||'Зона не указана')+' · ряд '+escHtml(row??'—')+' · секция '+escHtml(section??'—')+' · место '+escHtml(place??'—')+' · ярус '+escHtml(tier??'—')+'</div>'+
    '<div class="tier-tile-system">'+escHtml(occ.text)+'</div>'+
    (markChip?'<div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'+markChip+markBy+'</div>':'')+
    comment+
    '<div class="tier-tile-actions">'+
      '<button class="wms-mini-copy" onclick="wmsTierRecheckCell(\''+cid+'\',\''+addr+'\')">Остатки сейчас</button>'+
      '<button class="wms-mini-copy" onclick="wmsLookupCellId(\''+cid+'\',\''+addr+'\')">Открыть</button>'+
      markActions+
    '</div>'+
  '</article>';
}
function wmsTierRerenderTile(cellId){
  const el=document.getElementById('tier-tile-'+cellId); if(!el)return;
  const c=(wmsUpperCells||[]).find(x=>String(x.cellId)===String(cellId)); if(!c)return;
  el.outerHTML=wmsTierTileV65(c);
}
// После приёма синхронизации обновляем плитки на экране, чтобы чужие пометки появились сразу.
// Не трогаем экран, пока человек печатает комментарий.
function wmsTierSyncRefresh(){
  if(!document.querySelector('.tier-tile'))return;
  const ae=document.activeElement;
  if(ae&&(ae.tagName==='TEXTAREA'||ae.tagName==='INPUT'))return;
  (wmsUpperCells||[]).forEach(c=>wmsTierRerenderTile(c.cellId));
  try{wmsTierRefreshCounters();}catch(_){}
}
function wmsTierRefreshCounters(){
  const kind=wmsLookupKind==='tier1'?'tier1':'upper';
  const rows=wmsTierFilteredV64(kind);
  let doneN=0,probN=0;
  rows.forEach(c=>{const m=tierGetMark(c.cellId); if(m){ if(m.status==='problem')probN++; else doneN++; }});
  const doneEl=document.getElementById('tier-counter-done'); if(doneEl)doneEl.textContent=doneN;
  const totalEl=document.getElementById('tier-counter-total'); if(totalEl)totalEl.textContent=rows.length;
  const probWrap=document.getElementById('tier-counter-problem-wrap');
  if(probWrap){probWrap.style.display=probN?'':'none'; const p=document.getElementById('tier-counter-problem'); if(p)p.textContent=probN;}
}
function wmsTierMarkCheckedUi(cellId){ tierMarkChecked(cellId); wmsTierRerenderTile(cellId); wmsTierRefreshCounters(); }
function wmsTierMarkProblemUi(cellId){ tierMarkProblem(cellId); wmsTierRerenderTile(cellId); wmsTierRefreshCounters(); }
function wmsTierMarkFixedUi(cellId){ tierMarkFixed(cellId); wmsTierRerenderTile(cellId); wmsTierRefreshCounters(); }
function wmsTierMarkResetUi(cellId){ tierMarkReset(cellId); wmsTierRerenderTile(cellId); wmsTierRefreshCounters(); }
function wmsTierCommentUi(cellId,text){ tierSetComment(cellId,text); }
window.wmsTierMarkCheckedUi=wmsTierMarkCheckedUi;window.wmsTierMarkProblemUi=wmsTierMarkProblemUi;window.wmsTierMarkFixedUi=wmsTierMarkFixedUi;window.wmsTierMarkResetUi=wmsTierMarkResetUi;window.wmsTierCommentUi=wmsTierCommentUi;
function wmsRenderTierStorageV64(kind){
  const view=wmsTierViewV64(kind);
  const box=document.getElementById('wms-result');
  if(!box||wmsLookupKind!==view.kind)return;
  if(!(wmsUpperCells||[]).length){
    box.innerHTML='<div class="hint" style="padding:24px 12px;"><span class="mark">▥</span><span class="txt">Нажми «Загрузить ячейки». WMS отдаст активные ячейки хранения HH/SH.</span></div>';
    return;
  }
  const all=wmsTierCellsV64(view.kind);
  if(!all.length){
    box.innerHTML='<div class="hint" style="padding:24px 12px;"><span class="mark">▥</span><span class="txt">В справочнике WMS нет ячеек '+escHtml(view.tierLabel)+'. Ярус определяется по последней цифре адреса.</span></div>';
    return;
  }
  const rows=wmsTierFilteredV64(view.kind);
  const checkedOcc=rows.filter(c=>Object.prototype.hasOwnProperty.call(wmsUpperOccupancy||{},c.cellId)).length;
  const occupied=rows.filter(c=>wmsUpperOccupancy[c.cellId]&&wmsUpperOccupancy[c.cellId].hasStock===true).length;
  const empty=rows.filter(c=>wmsUpperOccupancy[c.cellId]&&wmsUpperOccupancy[c.cellId].hasStock===false&&!wmsUpperOccupancy[c.cellId].hasError).length;
  const state=wmsTierControlV64(view.kind,'state')?.value||'all';
  const noOccHint=(state!=='all'&&!checkedOcc)?'<div class="wms-upper-note" style="color:var(--gold)">Фильтр «'+escHtml(state==='occupied'?'Только занятые':'Только пустые')+'» заработает после «Проверить остатки».</div>':'';
  const addressExample=view.kind==='tier1'?'SH-4-54-3-1':'SH-4-54-3-2';
  const explanation=view.kind==='tier1'
    ? 'Показаны только адреса, где последняя цифра — <b>1</b>.'
    : 'Показаны только адреса, где последняя цифра больше <b>1</b>.';

  let doneMark=0,probMark=0;
  rows.forEach(c=>{const m=tierGetMark(c.cellId); if(m){ if(m.status==='problem')probMark++; else doneMark++; }});
  const markBar='<div id="tier-mark-bar" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 14px;background:rgba(0,0,0,0.18);border-radius:10px;margin:8px 0;">'+
      '<span style="font-size:12px;color:var(--muted);">Отмечено: <b id="tier-counter-done" style="color:var(--ok);">'+doneMark+'</b> / <b id="tier-counter-total" style="color:var(--text);">'+rows.length+'</b></span>'+
      '<span id="tier-counter-problem-wrap" style="font-size:12px;color:var(--red-bright);'+(probMark?'':'display:none;')+'">⚠ Проблем: <b id="tier-counter-problem">'+probMark+'</b></span>'+
      '<button class="exi-btn" style="margin-left:auto;" onclick="wmsCopyCheckedReport(\''+escHtml(view.kind)+'\')">Скопировать отчёт</button>'+
    '</div>';

  const snake=wmsTierSnakeEligible(view);
  let listHtml,tail='';
  if(snake){
    const cols=wmsTierSnakeColumns(rows);
    listHtml='<div class="tier-cols">'+
      '<div class="tier-col"><div class="tier-col-head">Чётные · '+cols.evens.length+'</div>'+cols.evens.map(wmsTierTileV65).join('')+'</div>'+
      '<div class="tier-col"><div class="tier-col-head">Нечётные · '+cols.odds.length+'</div>'+cols.odds.map(wmsTierTileV65).join('')+'</div>'+
    '</div>';
  }else{
    const pageSize=180;
    const curPage=wmsUpperPageV64[view.kind]||0;
    const showCount=(curPage+1)*pageSize;
    listHtml='<div class="tier-list">'+rows.slice(0,showCount).map(wmsTierTileV65).join('')+'</div>';
    const remaining=rows.length-showCount;
    tail=remaining>0
      ?'<div class="wms-upper-note">Показано '+escHtml(Math.min(showCount,rows.length))+' из '+escHtml(rows.length)+'. <button class="exi-btn" style="margin-left:8px" onclick="wmsTierNextPageV64(\''+escHtml(view.kind)+'\')">Показать ещё '+escHtml(Math.min(pageSize,remaining))+'</button></div>'
      :(rows.length>pageSize?'<div class="wms-upper-note">Показаны все '+escHtml(rows.length)+' ячеек.</div>':'');
  }
  const snakeHint=snake?'<div class="wms-upper-note" style="color:var(--gold)">Змейка: чётные секции по возрастанию, нечётные — навстречу с конца. Прошёл чётные до конца — нечётные начинаются рядом, с той же стороны прохода.</div>':'';

  box.innerHTML='<div class="wms-card"><div class="wms-card-body"><div class="wms-product-name">'+escHtml(view.title)+'</div><div class="wms-meta">Адрес: <b>'+addressExample+'</b> → ряд 4 · секция 54 · место 3 · ярус '+(view.kind==='tier1'?'1':'2')+'. '+explanation+' Чётность — по секции.</div></div></div>'
    +noOccHint
    +'<div class="stats"><div class="stat"><b>'+escHtml(rows.length)+'</b><span>в выборке</span></div><div class="stat"><b class="ok">'+escHtml(occupied)+'</b><span>занято</span></div><div class="stat"><b class="accent">'+escHtml(empty)+'</b><span>пусто</span></div></div>'
    +markBar
    +snakeHint
    +'<div class="wms-actions wms-upper-result-actions"><button class="exi-btn primary" onclick="wmsCheckUpperOccupancy()">Проверить остатки</button><button class="exi-btn" onclick="wmsLoadUpperStorageCells()">Обновить ячейки</button><button class="exi-btn" onclick="wmsBackFromTool()">← Назад</button></div>'
    +(rows.length?listHtml:'<div class="no-results">Нет ячеек по выбранному фильтру</div>')+tail;
}

// Верхние ярусы: строго последний сегмент > 1. Первый ярус: строго последний сегмент = 1.
function wmsToggleCellChecked(cellId){
  if(wmsCheckedEmptyCells.has(cellId)){wmsCheckedEmptyCells.delete(cellId);}
  else{wmsCheckedEmptyCells.add(cellId);}
  const isNowChecked=wmsCheckedEmptyCells.has(cellId);
  const btn=document.getElementById('wms-chk-'+cellId);
  if(btn){btn.textContent=isNowChecked?'✓ Проверено':'□ Отметить';btn.classList.toggle('primary',isNowChecked);}
  // Обновляем счётчик
  const kind=wmsLookupKind==='tier1'?'tier1':'upper';
  const rows=wmsTierFilteredV64(kind);
  const emptyRows=rows.filter(c=>wmsUpperOccupancy[c.cellId]&&wmsUpperOccupancy[c.cellId].hasStock===false&&!wmsUpperOccupancy[c.cellId].hasError);
  const checkedCount=emptyRows.filter(c=>wmsCheckedEmptyCells.has(c.cellId)).length;
  const counter=document.getElementById('wms-checked-counter');
  if(counter)counter.innerHTML='Проверено: <b>'+checkedCount+'</b> / '+emptyRows.length;
}
function wmsCopyCheckedReport(kind){
  const view=wmsTierViewV64(kind);
  const rows=wmsTierFilteredV64(kind);
  let doneN=0,probN=0; const problems=[];
  rows.forEach(c=>{
    const m=tierGetMark(c.cellId); if(!m)return;
    if(m.status==='problem'){probN++;problems.push(c.address+(m.comment?(' — '+m.comment):''));}
    else doneN++;
  });
  let text=view.title+': отмечено '+doneN+' из '+rows.length+(probN?(' · проблем: '+probN):'');
  if(problems.length)text+='\n\nПроблемы:\n'+problems.join('\n');
  wmsCopyFallback(text).then(()=>wmsSetStatus('Отчёт скопирован.','ok'));
}
wmsUpperTierNumberV62=function(addr){return wmsTierNumberV64(addr);};
wmsUpperFiltered=function(){return wmsTierFilteredV64('upper');};
wmsFillUpperRowList=function(){wmsFillTierRowListV64('upper');};
wmsRenderUpperStorage=function(){wmsRenderTierStorageV64('upper');};
function wmsTierNextPageV64(kind){wmsUpperPageV64[kind]=(wmsUpperPageV64[kind]||0)+1;wmsRenderTierStorageV64(kind);}
wmsUpperFilterChanged=function(){wmsUpperPageV64['upper']=0;wmsFillTierRowListV64('upper');wmsRenderTierStorageV64('upper');};
function wmsTier1FilterChanged(){wmsUpperPageV64['tier1']=0;wmsFillTierRowListV64('tier1');wmsRenderTierStorageV64('tier1');}

wmsLoadUpperStorageCells=async function(){
  const active=wmsLookupKind==='tier1'?'tier1':'upper';
  wmsUpperCells=[];
  wmsStopRequested=false;
  wmsSetStatus('Загружаю активные ячейки хранения HH/SH…','wait');
  try{
    const raw=await wmsCallNative('lookupWmsUpperStorageCells',[JSON.stringify({})],120000,(progress)=>{
      const chunk=wmsUpperItems({value:{items:(progress&&progress.items)||[]}});
      if(!chunk.length)return;
      wmsUpperCells=wmsUpperCells.concat(chunk);
      wmsFillTierRowListV64('upper');wmsFillTierRowListV64('tier1');
      wmsRenderTierStorageV64(active);
      wmsSetStatus('Загружаю ячейки… '+wmsUpperCells.length+(progress&&progress.total?(' из ~'+progress.total):'')+'…','wait');
    });
    // Финальный ответ — источник истины; полностью заменяет то, что успело прийти по частям.
    const v=raw&&raw.value?raw.value:raw||{};
    const totalFromApi=(Array.isArray(v.items)?v.items:(Array.isArray(v.cells)?v.cells:(Array.isArray(raw&&raw.items)?raw.items:[]))).length;
    wmsUpperCells=wmsUpperRowsFromRawV62(raw);
    const skipped=totalFromApi-wmsUpperCells.length;
    wmsUpperOccupancy={};
    wmsUpperPageV64={};
    wmsCheckedEmptyCells=new Set();
    wmsFillTierRowListV64('upper');
    wmsFillTierRowListV64('tier1');
    if(!wmsUpperCells.length)throw new Error('WMS вернула пустой справочник. Проверь авторизацию WMS.');
    // Новая выгрузка ячеек = новая доска обхода: сегодняшние «проверено»/«исправлено»
    // с прошлой выгрузки скрываются (нерешённые «проблемы» остаются видны).
    setStickyDate('tier_work_date',rkTodayISO());
    wmsRenderTierStorageV64(active);
    const upperCount=wmsTierCellsV64('upper').length;
    const tier1Count=wmsTierCellsV64('tier1').length;
    wmsSetStatus('Загружено ячеек: '+wmsUpperCells.length+' · верхних: '+upperCount+' · первый ярус: '+tier1Count+(skipped>0?' · скрыто неактивных: '+skipped:'')+'.','ok');
  }catch(e){wmsSetStatus((e&&e.message)||'Не смог загрузить ячейки хранения.','err');}
};

wmsCheckUpperOccupancy=async function(){
  const kind=wmsLookupKind==='tier1'?'tier1':'upper';
  const view=wmsTierViewV64(kind);
  const cells=wmsTierFilteredV64(kind);
  if(!cells.length){wmsSetStatus('По фильтру нет ячеек.','err');return;}
  const chunkSize=60;
  let done=0;
  wmsStopRequested=false;
  let sessionExpired=false,stoppedByUser=false;
  wmsSetStatus('Проверяю '+view.shortTitle.toLowerCase()+': 0 / '+cells.length+'…','wait');
  try{
    for(let i=0;i<cells.length;i+=chunkSize){
      if(wmsStopRequested){stoppedByUser=true;break;}
      const chunk=cells.slice(i,i+chunkSize);
      const raw=await wmsCallNative('lookupWmsUpperStorageOccupancy',[JSON.stringify(chunk.map(c=>({cellId:c.cellId,address:c.address,zoneName:c.zoneName})))],180000);
      const value=raw&&raw.value?raw.value:raw||{};
      const items=Array.isArray(value.items)?value.items:(Array.isArray(value.cells)?value.cells:(Array.isArray(value)?value:[]));
      items.forEach(x=>{
        const id=String(x.cellId||x.id||'').trim();
        if(!id)return;
        const hasError=!!x.hasError;
        const hasStock=hasError?null:(typeof x.hasStock==='boolean'?x.hasStock:((Number(x.quantity||0)>0)||(Number(x.huCount||0)>0)));
        wmsUpperOccupancy[id]={cellId:id,hasStock,hasError,quantity:Number(x.quantity||0),stockRows:Number(x.stockRows||0),huCount:Number(x.huCount||0),error:x.error||''};
      });
      done+=chunk.length;
      wmsRenderTierStorageV64(kind);
      // Сессия протухла посреди пачки — Java уже начал тихо обновлять WMS в фоне.
      // Не долбим оставшиеся ячейки тем же протухшим токеном, просим повторить чуть позже.
      if(value.sessionExpired){sessionExpired=true;break;}
      if(value.stopped){stoppedByUser=true;break;}
      wmsSetStatus('Проверяю '+view.shortTitle.toLowerCase()+': '+Math.min(done,cells.length)+' / '+cells.length+'…','wait');
    }
    wmsRenderTierStorageV64(kind);
    if(sessionExpired){
      wmsSetStatus('Сессия ВМС протухла посреди проверки — уже обновляю её в фоне. Подожди секунд 15–20 и нажми «Проверить остатки» ещё раз.','err');
      return;
    }
    if(stoppedByUser){
      wmsSetStatus('Остановлено. Проверено '+Math.min(done,cells.length)+' из '+cells.length+' — что успело, уже на экране.','');
      return;
    }
    const checked=cells.filter(c=>Object.prototype.hasOwnProperty.call(wmsUpperOccupancy||{},c.cellId));
    const errCount=checked.filter(c=>wmsUpperOccupancy[c.cellId].hasError).length;
    const occupied=checked.filter(c=>wmsUpperOccupancy[c.cellId].hasStock===true).length;
    const empty=checked.filter(c=>wmsUpperOccupancy[c.cellId].hasStock===false).length;
    wmsSetStatus('Готово: '+occupied+' занято · '+empty+' пусто'+(errCount?' · '+errCount+' ошибок проверки':'')+'.','ok');
  }catch(e){wmsSetStatus((e&&e.message)||'Ошибка проверки остатков.','err');}
};

wmsRefreshModeButtons=function(){
  wmsRefreshModeButtonsV63();
  const button=document.getElementById('wms-mode-tier1');
  if(button){
    button.classList.toggle('primary',wmsLookupKind==='tier1');
    button.setAttribute('aria-pressed',wmsLookupKind==='tier1'?'true':'false');
  }
  const panel=document.getElementById('wms-tier1-controls');
  if(panel)panel.style.display=wmsLookupKind==='tier1'?'block':'none';
  const general=document.getElementById('wms-general-search');
  if(general&&wmsLookupKind==='tier1')general.style.display='none';
};
wmsSetLookupKind=function(kind){
  if(kind!=='tier1')return wmsSetLookupKindV63(kind);
  wmsLookupKind='tier1';
  wmsRefreshModeButtons();
  wmsSetStatus('Первый ярус: здесь только ярус 1. Загрузи ячейки, выбери ряд/чётность и проверь остатки — пустые будут посчитаны отдельно.','');
  wmsRenderTierStorageV64('tier1');
};
wmsClearResult=function(){
  if(wmsLookupKind!=='tier1')return wmsClearResultV63();
  wmsLastResult=null;wmsLastChoices=null;
  const box=document.getElementById('wms-result');if(box)box.innerHTML='';
  wmsSetStatus('Экран первого яруса очищен. Данные ячеек остаются в памяти до обновления.','');
  wmsRefreshModeButtons();
};

// Пробрасываем переопределённые функции в inline-кнопки HTML.
window.wmsSetLookupKind=wmsSetLookupKind;
window.wmsRefreshModeButtons=wmsRefreshModeButtons;
window.wmsClearResult=wmsClearResult;
window.wmsLoadUpperStorageCells=wmsLoadUpperStorageCells;
window.wmsCheckUpperOccupancy=wmsCheckUpperOccupancy;
window.wmsUpperFilterChanged=wmsUpperFilterChanged;
window.wmsTier1FilterChanged=wmsTier1FilterChanged;

// Память прокрутки при переключении режимов внутри WMS (Первый ярус ↔ Остатки ↔ Пересчёты …)
(function(){
  const _origSetKind=wmsSetLookupKind;
  const wmsKindScrollY={};
  wmsSetLookupKind=function(kind){
    try{wmsKindScrollY[wmsLookupKind]=window.scrollY||document.documentElement.scrollTop||0;}catch(e){}
    _origSetKind(kind);
    const y=wmsKindScrollY[wmsLookupKind]||0;
    requestAnimationFrame(()=>{try{window.scrollTo(0,y);}catch(e){}});
  };
  window.wmsSetLookupKind=wmsSetLookupKind;
})();
