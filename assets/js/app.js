// Main L'Enfer application logic.
// Static arrays are in assets/data/static-data.js.
const CATALOG = window.LENFER_CATALOG || [];
const BRAK = window.LENFER_BRAK || [];
// ── THEME ──
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.getElementById('theme-btn').textContent = next === 'dark' ? '☾' : '☀';
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
function authorLine(x){
  if(!x || typeof x!=='object')return '';
  const c=x.createdByName||x.createdByEmail||'';
  const u=x.updatedByName||x.updatedByEmail||'';
  const when=x.updatedAtRu||x.updatedAt||x.ts||x.createdAt||'';
  if(!c && !u)return '';
  return '<div class="meta-author">'+(c?'Создал: <b>'+escHtml(c)+'</b>':'')+(u&&u!==c?' · изм.: <b>'+escHtml(u)+'</b>':'')+(when?' · '+escHtml(when):'')+'</div>';
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
function previewPhoto(previewId, input){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      const maxDim=1000; let w=img.width,h=img.height;
      if(w>maxDim||h>maxDim){ if(w>h){h=h*maxDim/w;w=maxDim;}else{w=w*maxDim/h;h=maxDim;} }
      const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      const c=canvas.toDataURL('image/jpeg',0.7);
      const el=document.getElementById(previewId); el.innerHTML='<img src="'+c+'">'; el.dataset.img=c;
    };
    img.onerror=()=>{const el=document.getElementById(previewId);el.innerHTML='<img src="'+e.target.result+'">';el.dataset.img=e.target.result;};
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}

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
const TABS=['catalog','cells','wms','notes','eo','creds','calc','hh11','rk','problems','report','service'];
const MAIN_NAV_TABS=['cells','wms','problems','report'];
function openMoreMenu(){const el=document.getElementById('more-sheet');if(el)el.style.display='flex';}
function closeMoreMenu(){const el=document.getElementById('more-sheet');if(el)el.style.display='none';}
function moreGo(tab){closeMoreMenu();switchTab(tab);}
window.openMoreMenu=openMoreMenu;window.closeMoreMenu=closeMoreMenu;window.moreGo=moreGo;
function switchTab(tab){
  const navTab=MAIN_NAV_TABS.includes(tab)?tab:'more';
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active', b.dataset.tab===navTab));
  TABS.forEach(t=>{const el=document.getElementById('tab-'+t);if(el)el.style.display=t===tab?'':'none';});
  document.getElementById('catalog-search-area').style.display = tab==='catalog'?'':'none';
  document.querySelector('.fab').style.display = (tab==='catalog' && !document.querySelector('.card.open'))?'flex':'none';
  if(tab==='cells')renderCells('');
  if(tab==='wms')renderWms();
  if(tab==='notes')renderNotes();
  if(tab==='creds')renderCreds();
  if(tab==='eo'){renderEO();renderEORange();}
  if(tab==='hh11')renderHH11();
  if(tab==='rk')renderRK();
  if(tab==='problems')renderProblems();
  if(tab==='service'){renderDiagnostics();renderAutoBackups();renderActionLogMini();}
  if(tab==='report')renderReport();
  window.scrollTo(0,0);
}
window.switchTab = switchTab;


// ── WMS IMPORT / BRIDGE ──
let wmsLastResult = null;
let wmsLastChoices = null;
let wmsLookupKind = 'stocks';
let wmsChangeFilter = 'all';
let wmsChangeDirectionFilter = 'all';
let wmsChangeOperationFilter = 'all';
let wmsStorageOnly = false;
const WMS_AUTO_UNAVAILABLE = 'Авто-поиск доступен только в Android-обёртке с ВМС-входом. Обычная PWA в браузере не может сама ходить в ВМС.';


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

function wmsSetStatus(text, kind){
  const el=document.getElementById('wms-status');
  if(!el)return;
  el.textContent=String(text||'');
  el.className='wms-status '+(kind?('wms-status-'+kind):'');
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
  wmsLookupKind = kind==='changes' ? 'changes' : 'stocks';
  wmsRefreshModeButtons();
  wmsSetStatus(wmsLookupKind==='changes' ? 'Режим: изменение остатка. Введи УТ, ШК, название, ячейку или ЕО.' : 'Режим: текущие остатки. Введи УТ, ШК, название, ячейку или ЕО.', '');
}
function wmsRefreshModeButtons(){
  const s=document.getElementById('wms-mode-stocks');
  const c=document.getElementById('wms-mode-changes');
  if(s){s.classList.toggle('primary', wmsLookupKind==='stocks');}
  if(c){c.classList.toggle('primary', wmsLookupKind==='changes');}
}
function wmsOpenUrl(url){
  try{
    window.open(url,'_blank','noopener,noreferrer');
    wmsSetStatus('Открыл ВМС-раздел. Если Android-обёртка не переключилась — нажми сверху «ВМС вход».','ok');
  }catch(e){ location.href=url; }
}
function wmsOpenRecounting(){
  wmsOpenUrl('https://wwh.samokat.ru/#/recounting-tasks?status=AWAITING_CONFIRMATION&sortCompletedDate=DESC&pageNumber=1');
}
function wmsOpenLabels(){
  wmsOpenUrl('https://wwh.samokat.ru/#/handing-units/print');
}
window.wmsOpenRecounting=wmsOpenRecounting;window.wmsOpenLabels=wmsOpenLabels;
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
  wmsSetStatus('Очищено. Введи УТ, ШК, название, ячейку или ЕО.','');
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
  if(payload._kind==='productChoices'||payload._kind==='cellChoices')return payload;
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
      '<button class="exi-btn primary" onclick="wmsCopyCells()">Скопировать</button>'+ 
      '<button class="exi-btn" onclick="wmsCopyProduct()">УТ/ШК</button>'+ 
      '<button class="exi-btn" onclick="wmsSaveAsProblem()">В проблемы</button>'+ 
    '</div>'+ 
    '<div class="wms-table-wrap"><table class="wms-table"><thead>'+tableHead+'</thead><tbody>'+rowsHtml+'</tbody></table></div>';
}
function wmsCopyCells(){
  if(!wmsLastResult){alert('Нет результата ВМС');return;}
  wmsCopyFallback(wmsFormatCells(wmsLastResult)).then(()=>wmsSetStatus('Скопировано.','ok'));
}
function wmsCopyProduct(){
  if(!wmsLastResult){alert('Нет результата ВМС');return;}
  const p=wmsLastResult.product||{};
  const text=[p.nomenclatureCode||'',p.name||'',p.barcode?('ШК: '+p.barcode):'',wmsLastResult.cellAddress?('Ячейка: '+wmsLastResult.cellAddress):''].filter(Boolean).join('\n');
  wmsCopyFallback(text).then(()=>wmsSetStatus('УТ/ШК скопированы.','ok'));
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
  return '<div class="wms-card">'+
      (p.imageUrl?'<img class="wms-img" src="'+escHtml(p.imageUrl)+'" loading="lazy" onerror="this.style.display=\'none\'">':'')+
      '<div class="wms-card-body"><div class="wms-product-name">'+escHtml(title)+'</div><div class="wms-meta">'+meta+'</div></div>'+ 
    '</div>'+ 
    wmsChangeCompactFiltersHtml(base)+
    '<div class="wms-actions wms-result-actions">'+
      '<button class="exi-btn primary" onclick="wmsCopyCells()">Скопировать</button>'+ 
      '<button class="exi-btn" onclick="wmsCopyProduct()">УТ/ШК</button>'+ 
      '<button class="exi-btn" onclick="wmsSaveAsProblem()">В проблемы</button>'+ 
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
    title=p.name||(isHu?('Содержимое ЕО '+(result.query||'')):('Содержимое ячейки '+(result.cellAddress||'')));
    meta=(isHu?('ЕО/HU: <b>'+escHtml(result.query||rows[0].handlingUnitBarcode||'')+'</b>'):('Ячейка: <b>'+escHtml(result.cellAddress||rows[0].cellAddress||'')+'</b>'))+' · Строк: <b>'+escHtml(result.totalRows||rows.length)+'</b> · Остаток: <b>'+escHtml(result.totalQuantity||0)+'</b> шт';
    tableHead='<tr><th>Товар</th><th>УТ</th><th>ШК</th><th>Кол-во</th><th>Срок</th><th>HU</th><th>Статус</th></tr>';
    rowsHtml=rows.map(r=>'<tr>'+[
      '<td><b>'+escHtml(r.name||'—')+'</b></td>','<td>'+escHtml(r.nomenclatureCode||'')+'</td>','<td>'+escHtml(r.barcode||'')+'</td>','<td class="num">'+escHtml(r.quantity)+'</td>','<td>'+escHtml(r.bestBeforeDate||'')+'</td>','<td>'+escHtml(r.handlingUnitBarcode||'')+'</td>','<td>'+escHtml(r.status||'')+'</td>'
    ].join('')+'</tr>').join('');
  }else{
    title=p.name||rows[0].name||'Товар из ВМС';
    meta='<b>'+escHtml(p.nomenclatureCode||rows[0].nomenclatureCode||'')+'</b>'+(barcode?' · ШК: '+escHtml(barcode):'')+'<br>Строк: <b>'+escHtml(result.totalRows||rows.length)+'</b> · Остаток: <b>'+escHtml(result.totalQuantity||0)+'</b> шт';
    tableHead='<tr><th>Ячейка</th><th>Кол-во</th><th>Зона</th><th>Локация</th><th>Срок</th><th>HU</th><th>Статус</th></tr>';
    rowsHtml=rows.map(r=>'<tr>'+[
      '<td><b>'+escHtml(r.cellAddress||'—')+'</b></td>','<td class="num">'+escHtml(r.quantity)+'</td>','<td>'+escHtml(r.zoneName||'')+'</td>','<td>'+escHtml(r.locationName||'')+'</td>','<td>'+escHtml(r.bestBeforeDate||'')+'</td>','<td>'+escHtml(r.handlingUnitBarcode||'')+'</td>','<td>'+escHtml(r.status||'')+'</td>'
    ].join('')+'</tr>').join('');
  }
  box.innerHTML='<div class="wms-card">'+(p.imageUrl?'<img class="wms-img" src="'+escHtml(p.imageUrl)+'" loading="lazy" onerror="this.style.display=\'none\'">':'')+'<div class="wms-card-body"><div class="wms-product-name">'+escHtml(title)+'</div><div class="wms-meta">'+meta+'</div></div></div><div class="wms-actions wms-result-actions">'+wmsStorageToggleButton()+'<button class="exi-btn primary" onclick="wmsCopyCells()">Скопировать</button><button class="exi-btn" onclick="wmsCopyProduct()">УТ/ШК</button><button class="exi-btn" onclick="wmsSaveAsProblem()">В проблемы</button></div><div class="wms-table-wrap"><table class="wms-table"><thead>'+tableHead+'</thead><tbody>'+rowsHtml+'</tbody></table></div>';
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
function wmsCallNative(method,args,timeoutMs){
  timeoutMs=timeoutMs||30000;
  return new Promise((resolve,reject)=>{
    const id='wms_'+Date.now()+'_'+Math.floor(Math.random()*100000);
    if(!window.__lenferWmsNativeCallbacks)window.__lenferWmsNativeCallbacks={};
    window.__lenferWmsNativeCallbacks[id]={resolve,reject};
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
async function wmsLookupFromApp(){
  const inp=document.getElementById('wms-query');
  const code=wmsCleanCode(inp?inp.value:'');
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
  if(box && !wmsLastResult && !wmsLastChoices && !box.innerHTML){
    box.innerHTML='<div class="hint" style="padding:34px 12px;"><span class="mark">✶</span><span class="txt">Введи УТ, ШК, название, ячейку или ЕО и жми «Найти»</span></div>';
  }
}
window.wmsLookupFromApp=wmsLookupFromApp;
window.wmsLookupProductId=wmsLookupProductId;
window.wmsLookupCellId=wmsLookupCellId;
window.wmsLookupChosenProductId=wmsLookupChosenProductId;
window.wmsLookupChosenCellId=wmsLookupChosenCellId;
window.wmsLookupProductChangesId=wmsLookupProductChangesId;
window.wmsLookupCellChangesId=wmsLookupCellChangesId;
window.wmsSetLookupKind=wmsSetLookupKind;
window.wmsParseImport=wmsParseImport;
window.wmsClearResult=wmsClearResult;
window.wmsPrefixUt=wmsPrefixUt;
window.wmsCopyCells=wmsCopyCells;
window.wmsCopyProduct=wmsCopyProduct;
window.wmsSaveAsProblem=wmsSaveAsProblem;
window.wmsPasteImportFromClipboard=wmsPasteImportFromClipboard;
window.wmsClearImportText=wmsClearImportText;
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
  detail.innerHTML='<div class="bc-label">Изменить штрихкод</div><div class="bc-input-wrap"><input class="bc-input" type="text" placeholder="Новый ШК" id="bi-'+cid+'" inputmode="numeric"><button class="bc-save" onclick="saveBC(event,\''+ut+'\',\'bi-'+cid+'\',\''+cid+'\')">✓</button></div><button onclick="delBC(event,\''+ut+'\',\''+cid+'\')" style="margin-top:9px;width:100%;background:none;border:1px solid var(--red);border-radius:6px;padding:7px;color:var(--red-bright);font-family:\'Oswald\',sans-serif;font-size:10px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;cursor:pointer;">🗑 удалить ШК</button>';
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
  const t=document.getElementById('note-text');
  if(t)t.value='Ячейка '+c.addr+(c.name?' — '+c.name:'')+': ';
  openModal('note-modal');
}

// ── NOTES ──
function saveNote(){
  const text=document.getElementById('note-text').value.trim();
  if(!text){alert('Введите текст');return;}
  const img=document.getElementById('note-photo').dataset.img||'';
  const notes=getNotes();
  notes.unshift({id:Date.now(),text,img,date:new Date().toLocaleString('ru',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})});
  try{set('notes',notes);}catch(e){alert('Фото слишком большое, не хватает места.');return;}
  closeModal('note-modal');
  document.getElementById('note-text').value='';
  const p=document.getElementById('note-photo');p.innerHTML='📷 Добавить фото';p.dataset.img='';
  renderNotes();
}
function editNote(id){
  const note=getNotes().find(n=>n.id===id);if(!note)return;
  document.getElementById('edit-note-id').value=id;
  document.getElementById('edit-note-text').value=note.text;
  const p=document.getElementById('edit-note-photo');
  if(note.img){p.innerHTML='<img src="'+note.img+'">';p.dataset.img=note.img;}else{p.innerHTML='📷 Изменить фото';p.dataset.img='';}
  openModal('edit-note-modal');
}
function updateNote(){
  const id=parseInt(document.getElementById('edit-note-id').value);
  const text=document.getElementById('edit-note-text').value.trim();
  if(!text){alert('Введите текст');return;}
  const img=document.getElementById('edit-note-photo').dataset.img||'';
  try{set('notes',getNotes().map(n=>n.id===id?{...n,text,img}:n));}catch(e){alert('Фото слишком большое.');return;}
  closeModal('edit-note-modal');renderNotes();
}
function delNote(id){if(!confirm('Удалить заметку?'))return;set('notes',getNotes().filter(n=>n.id!==id));renderNotes();}
function renderNotes(){
  const el=document.getElementById('notes-list');const notes=getNotes();
  if(!notes.length){el.innerHTML='<div class="no-results">Нет заметок</div>';return;}
  el.innerHTML=notes.map(n=>'<div class="note-card"><div class="note-head"><span class="note-date">'+n.date+'</span><div class="note-actions"><button class="note-btn" onclick="shareText(\''+n.text.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n')+'\')">📤</button><button class="note-btn" onclick="editNote('+n.id+')">✏</button><button class="note-btn del" onclick="delNote('+n.id+')">✕</button></div></div><div class="note-text">'+n.text.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>'+(n.img?'<img class="note-img" src="'+n.img+'">':'')+'</div>').join('');
}

// ── EO ──
const EO_PREFIX='012200';
const EO_FULL_LEN=12;
function normalizeEOCode(v){
  let s=String(v||'').trim().replace(/\s+/g,'').replace(/[^0-9]/g,'');
  if(!s)return '';

  // ЕО в нашем процессе = 012200 + 6 цифр хвоста.
  // ТСД/ручной ввод иногда дают уже почти полный код без первой цифры:
  // 002200562145. Старый код добавлял префикс и получалось 012200002200562145.
  // Тут нормализуем без раздувания.
  if(s.length===EO_FULL_LEN && s.startsWith(EO_PREFIX))return s;
  if(s.length>EO_FULL_LEN && s.startsWith(EO_PREFIX)){
    // если код уже раздут старой версией, оставляем нормальный префикс и последний хвост
    return EO_PREFIX + s.slice(-6);
  }
  if(s.startsWith('002200') && s.length>=12)return EO_PREFIX + s.slice(-6);
  if(s.startsWith('12200') && s.length>=11)return EO_PREFIX + s.slice(-6);
  if(s.includes(EO_PREFIX)){
    const i=s.indexOf(EO_PREFIX);
    const cut=s.slice(i, i+EO_FULL_LEN);
    if(cut.length===EO_FULL_LEN)return cut;
  }
  if(s.length<=6)return EO_PREFIX + s.padStart(6,'0');
  return EO_PREFIX + s.slice(-6);
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
  const codes=getEOCodes();codes.unshift({id:Date.now(),code});set('eo_codes',codes);
  input.value='';renderEO();
}
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
    if(inner&&!inner.dataset.drawn){inner.dataset.drawn='1';try{new QRCode(inner,{text:text,width:180,height:180,colorDark:'#000',colorLight:'#fff',correctLevel:QRCode.CorrectLevel.M});}catch(e){inner.innerHTML='QR ошибка';}}
  }
}
function renderCreds(){
  const el=document.getElementById('creds-list');const creds=getCreds();
  if(!creds.length){el.innerHTML='<div class="no-results">Нет сохранённых доступов</div>';return;}
  el.innerHTML=creds.map(c=>'<div class="cred-card"><div class="cred-title">'+c.title+'</div>'+
    (c.login?'<div class="cred-row"><span class="cred-lbl">Логин</span><span class="cred-val">'+c.login+'</span><button class="cred-copy" onclick="copyText(\''+c.login.replace(/'/g,"\\'")+'\',this)">копир</button><button class="cred-copy" onclick="toggleQR(\'qrl-'+c.id+'\',\''+c.login.replace(/'/g,"\\'")+'\')">QR</button></div><div class="qr-wrap" id="qrl-'+c.id+'"><div id="qrl-inner-'+c.id+'"></div><div class="qr-lbl">'+c.login+'</div></div>':'')+
    (c.password?'<div class="cred-row"><span class="cred-lbl">Пароль</span><span class="cred-val" id="pw-'+c.id+'" data-val="'+c.password.replace(/"/g,'&quot;')+'" data-shown="0">••••••••</span><button class="cred-eye" onclick="togglePw('+c.id+',this)">👁</button><button class="cred-copy" onclick="copyText(\''+c.password.replace(/'/g,"\\'")+'\',this)">копир</button><button class="cred-copy" onclick="toggleQR(\'qrp-'+c.id+'\',\''+c.password.replace(/'/g,"\\'")+'\')">QR</button></div><div class="qr-wrap" id="qrp-'+c.id+'"><div id="qrp-inner-'+c.id+'"></div><div class="qr-lbl">••••••••</div></div>':'')+
    (c.note?'<div class="cred-row"><span class="cred-lbl">Заметка</span><span class="cred-val" style="color:var(--muted)">'+c.note+'</span></div>':'')+
    (c.barcode?'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;"><button onclick="toggleCredBC('+c.id+')" style="background:none;border:1px solid var(--border);border-radius:6px;padding:6px 13px;color:var(--muted);font-family:\'Oswald\',sans-serif;font-size:10px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;cursor:pointer;">▦ штрихкод</button><button onclick="zoomBarcode(\''+jsStr(c.barcode)+'\')" style="background:none;border:1px solid var(--border);border-radius:6px;padding:6px 13px;color:var(--gold);font-family:\'Oswald\',sans-serif;font-size:10px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;cursor:pointer;">⤢ на экран</button></div><div class="qr-wrap" id="bcw-'+c.id+'" data-code="'+escHtml(c.barcode)+'"><canvas style="max-width:100%;display:block;margin:0 auto;" id="bcc-'+c.id+'"></canvas><div class="qr-lbl">'+escHtml(c.barcode)+'</div></div>':'')+
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
  if(!tag){tag=document.createElement('span');tag.id='pack-saved-tag';tag.style.cssText='margin-left:8px;font-family:\'Oswald\',sans-serif;font-size:10px;color:var(--gold);letter-spacing:0.5px;';ch.appendChild(tag);}
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
    el.style.color = d===0?'#5a8a4a':(d>0?'#c08a30':'#c0392b');
    wrap.style.display='block';
  }else{
    wrap.style.display='none';
  }
  // обновить раскладку (служебно)
  updateLayoutTotal();
}
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
  box.innerHTML='<div style="font-family:Oswald,sans-serif;font-size:10px;color:var(--muted);letter-spacing:0.8px;text-transform:uppercase;margin-bottom:6px;">Как посчитано</div>'+palletPieces.map(p=>{
    const val=p.sign*p.qty;
    const unit=p.unit==='piece'?'шт.':'мест';
    const color=p.sign<0?'var(--red-bright)':(p.mode==='ignore'?'var(--muted)':'var(--gold)');
    return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:6px;display:flex;gap:8px;align-items:center;">'+
      '<div style="flex:1;min-width:0;">'+
        '<div style="font-family:\'Oswald\',sans-serif;font-size:10px;color:var(--muted);letter-spacing:0.8px;text-transform:uppercase;">'+(p.mode==='ignore'?'○ ':(p.sign<0?'− ':'+ '))+modeTitle(p.mode)+'</div>'+ 
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
  const box=document.getElementById('calc-cell-items');
  if(!box)return;
  if(!cellBuffer.length){box.innerHTML='';return;}
  let h='<div style="font-family:\'Oswald\',sans-serif;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Товары в ячейке:</div>';
  cellBuffer.forEach((it,idx)=>{
    let diffHtml='';
    if(it.sys!=null){
      const d=it.qty-it.sys;
      const col=d===0?'#5a8a4a':(d>0?'#c08a30':'#c0392b');
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
      '<button onclick="addToJournal('+r.id+')" style="background:var(--red);border:none;border-radius:6px;padding:7px 14px;color:var(--paper);font-family:\'Oswald\',sans-serif;font-size:11px;font-weight:600;cursor:pointer;">+</button>'+
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
  const row=createMeta({id:Date.now()+Math.floor(Math.random()*1000),eo:eo,ut:hh11Picked.ut,name:hh11Picked.name,mode:hh11Mode,sys:hh11Mode==='listed'?sys:'',fact:fact,comment:(cEl&&cEl.value||'').trim(),mismatch:mEl&&mEl.checked?1:0,placed:0,shortage:0,ts:new Date().toLocaleString('ru-RU')});
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
  touchMeta(r);set('hh11_log',arr);logAction('hh11',r.mismatch?'HH отмечен пересорт':'HH пересорт снят',{id:id});renderHH11();
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
function hh11Stats(arr){
  const listed=arr.filter(x=>x.mode==='listed');
  const found=arr.filter(x=>x.mode==='found');
  return {all:arr.length,active:arr.filter(x=>!x.archived).length,archive:arr.filter(x=>x.archived).length,listed:listed.length,found:found.length,placed:arr.filter(x=>x.placed).length,shortage:arr.filter(x=>x.shortage).length,openListed:listed.filter(x=>!x.placed&&!x.shortage&&!x.archived).length,mismatch:arr.filter(x=>x.mismatch).length};
}
function hh11BoardButton(view,label,num,accent){
  const active=hh11View===view;
  return '<button onclick="hh11SetView(\''+view+'\')" style="background:'+(active?'var(--gold-dim)':'var(--surface2)')+';border:1px solid '+(active?'var(--gold)':'var(--border)')+';border-radius:9px;padding:9px 8px;color:'+(active?'#fff':'var(--text)')+';font-family:\'Oswald\',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;text-align:left;cursor:pointer;min-width:0;"><span style="display:block;color:'+(accent||'var(--gold)')+';font-family:\'Spectral\',serif;font-size:20px;line-height:1;">'+num+'</span>'+label+'</button>';
}
function hh11RenderOverview(arr){
  const listed=arr.filter(x=>x.mode==='listed');
  const found=arr.filter(x=>x.mode==='found');
  const open=listed.filter(x=>!x.placed&&!x.shortage);
  const placed=arr.filter(x=>x.placed);
  const shortage=arr.filter(x=>x.shortage);
  const sum=(items,field)=>items.reduce((sumVal,x)=>sumVal+(parseInt(x[field])||0),0);
  return '<div class="hh-overview">'+
    '<div class="hh-overview-title">Общий обзор HH 1-1</div>'+ 
    '<div class="hh-overview-grid">'+
      '<div class="hh-overview-cell"><div class="hh-overview-label">Числятся</div><div class="hh-overview-value">'+listed.length+'</div><div class="hh-overview-note">система: '+sum(listed,'sys')+' · факт: '+sum(listed,'fact')+'</div></div>'+ 
      '<div class="hh-overview-cell"><div class="hh-overview-label">Не числятся</div><div class="hh-overview-value">'+found.length+'</div><div class="hh-overview-note">факт: '+sum(found,'fact')+'</div></div>'+ 
      '<div class="hh-overview-cell"><div class="hh-overview-label">К размещению</div><div class="hh-overview-value">'+open.length+'</div><div class="hh-overview-note">ещё не вычеркнуто</div></div>'+ 
      '<div class="hh-overview-cell"><div class="hh-overview-label">Размещено</div><div class="hh-overview-value">'+placed.length+'</div><div class="hh-overview-note">вычеркнуто</div></div>'+ 
      '<div class="hh-overview-cell wide"><div class="hh-overview-label">Проблемы</div><div class="hh-overview-value">'+shortage.length+'</div><div class="hh-overview-note">недостача · пересорт: '+arr.filter(x=>x.mismatch).length+'</div></div>'+ 
    '</div></div>';
}
function hh11RenderBoard(arr){
  const b=document.getElementById('hh11-board');if(!b)return;
  const st=hh11Stats(arr);
  b.innerHTML=hh11RenderOverview(arr)+'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">'+
    hh11BoardButton('active','Активные',st.active)+
    hh11BoardButton('all','Все',st.all)+
    hh11BoardButton('listed','Числятся',st.listed)+
    hh11BoardButton('found','Не числятся',st.found,'#c0392b')+
    hh11BoardButton('open','К размещению',st.openListed)+
    hh11BoardButton('placed','Размещено',st.placed,'#5a8a4a')+
    hh11BoardButton('shortage','Недостача',st.shortage,'#c0392b')+
    hh11BoardButton('mismatch','Пересорт',st.mismatch,'#c0392b')+
    hh11BoardButton('archive','Архив',st.archive,'#777')+
    '</div>';
}
function hh11PlacementIds(){
  return getHH11().filter(x=>x.mode==='listed'&&!x.placed&&!x.shortage&&String(x.eo||'').trim()).map(x=>x.id);
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
function hh11RenderGroup(title,items,kind){
  if(!items.length)return '<div class="gen-box"><div style="font-family:\'Oswald\',sans-serif;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;">'+title+'</div><div style="font-size:12px;color:var(--faint);margin-top:6px;">Пусто</div></div>';
  items=items.slice().sort((a,b)=>((a.placed||a.shortage)?1:0)-((b.placed||b.shortage)?1:0));
  const tsvKind=kind==='found'?'found':'listed';
  let h='<div class="gen-box"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;"><div style="font-family:\'Oswald\',sans-serif;font-size:12px;color:var(--gold);text-transform:uppercase;letter-spacing:1px;flex:1;">'+title+'</div><button onclick="hh11CopyTSVKind(\''+tsvKind+'\')" class="exi-btn" style="flex:0 0 auto;padding:6px 10px;font-size:10px;">TSV</button><b style="color:var(--gold);">'+items.length+'</b></div>';
  items.forEach(it=>{
    const eo=String(it.eo||'').trim();
    const safeEO=jsStr(eo);
    const placed=!!it.placed;
    const shortage=!!it.shortage;
    const mismatch=!!it.mismatch;
    const border=shortage?'#c0392b':(mismatch?'#c0392b':(kind==='listed'?'var(--gold)':'var(--red)'));
    const rowOpacity=(placed||shortage)?'0.58':'1';
    const textDeco=(placed||shortage)?'text-decoration:line-through;':'';
    const badges=(placed?'<span style="background:rgba(90,138,74,0.18);border:1px solid #5a8a4a;color:#5a8a4a;border-radius:6px;padding:2px 6px;font-family:\'Oswald\',sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:0.6px;">размещено</span>':'')+(shortage?'<span style="background:rgba(192,57,43,0.14);border:1px solid #c0392b;color:#c0392b;border-radius:6px;padding:2px 6px;font-family:\'Oswald\',sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:0.6px;">недостача</span>':'')+(mismatch?'<span style="background:rgba(192,57,43,0.14);border:1px solid #c0392b;color:#c0392b;border-radius:6px;padding:2px 6px;font-family:\'Oswald\',sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:0.6px;">пересорт</span>':'');
    h+='<div style="background:var(--bg2);border-radius:8px;padding:9px 10px;margin-bottom:7px;border-left:3px solid '+border+';opacity:'+rowOpacity+';">'+
      '<div style="display:flex;gap:8px;align-items:flex-start;"><div style="flex:1;min-width:0;">'+
        (eo?'<div style="display:flex;gap:6px;align-items:center;margin-bottom:5px;flex-wrap:wrap;"><span style="font-family:\'JetBrains Mono\',monospace;font-size:11px;font-weight:700;color:var(--text);background:rgba(0,0,0,0.16);border:1px solid var(--border);border-radius:6px;padding:3px 6px;">ЕО '+escHtml(eo)+'</span><button onclick="zoomBarcode(\''+safeEO+'\',null,{title:\''+jsStr(it.name||it.ut)+'\',subtitle:\''+jsStr(it.ut)+'\',eo:\''+safeEO+'\'},{compact:true})" style="background:none;border:1px solid var(--border);border-radius:6px;padding:3px 7px;color:var(--muted);font-family:\'Oswald\',sans-serif;font-size:10px;cursor:pointer;">ШК</button>'+(kind==='listed'&&!placed&&!shortage?'<button onclick="hh11ZoomPlacement('+it.id+')" style="background:rgba(212,168,67,.12);border:1px solid var(--gold);border-radius:6px;padding:3px 7px;color:var(--gold);font-family:\'Oswald\',sans-serif;font-size:10px;cursor:pointer;">⤢ размещение</button>':'')+badges+'</div>':(badges?'<div style="display:flex;gap:6px;align-items:center;margin-bottom:5px;flex-wrap:wrap;">'+badges+'</div>':''))+
        '<div style="'+textDeco+'font-family:\'JetBrains Mono\',monospace;font-size:11px;font-weight:700;color:var(--gold);">'+escHtml(it.ut)+'</div><div style="'+textDeco+'font-size:12px;color:var(--text);line-height:1.25;">'+escHtml(it.name)+'</div></div><div style="display:flex;gap:6px;align-items:flex-start;"><button onclick="hh11Archive('+it.id+')" style="background:none;border:1px solid var(--border);border-radius:6px;color:var(--muted);font-size:10px;padding:4px 7px;cursor:pointer;">'+(it.archived?'↩':'арх')+'</button><button onclick="hh11Del('+it.id+')" style="background:none;border:none;color:var(--red-bright);font-size:14px;cursor:pointer;">✕</button></div></div>'+ 
      '<div style="display:grid;grid-template-columns:'+(kind==='listed'?'1fr 1fr':'1fr')+';gap:6px;margin-top:8px;">'+
      (kind==='listed'?'<div><label class="modal-lbl">Система</label><input class="calc-inp" type="number" inputmode="numeric" value="'+(it.sys||0)+'" onchange="hh11EditQty('+it.id+',\'sys\',this.value)" style="margin-bottom:0;font-size:16px;padding:9px;text-align:center;"></div>':'')+
      '<div><label class="modal-lbl">Факт</label><input class="calc-inp" type="number" inputmode="numeric" value="'+(it.fact||0)+'" onchange="hh11EditQty('+it.id+',\'fact\',this.value)" style="margin-bottom:0;font-size:16px;padding:9px;text-align:center;"></div></div>'+ 
      '<div style="margin-top:7px;"><label class="modal-lbl">ЕО</label><input class="calc-inp" type="text" inputmode="numeric" value="'+escHtml(eo)+'" onchange="hh11EditEO('+it.id+',this.value)" style="margin-bottom:0;font-size:14px;padding:8px;text-align:center;"></div>'+ 
      '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">'+
      (kind==='listed'?'<button onclick="hh11TogglePlaced('+it.id+')" class="exi-btn" style="flex:1;min-width:120px;border-color:'+(placed?'#5a8a4a':'var(--border)')+';color:'+(placed?'#5a8a4a':'var(--muted)')+';">'+(placed?'↩ Вернуть':'✓ Размещено')+'</button><button onclick="hh11ToggleShortage('+it.id+')" class="exi-btn" style="flex:1;min-width:110px;border-color:'+(shortage?'#c0392b':'var(--border)')+';color:'+(shortage?'#c0392b':'var(--muted)')+';">Недостача</button>':'')+
      '<button onclick="hh11ToggleMismatch('+it.id+')" class="exi-btn" style="flex:1;min-width:110px;border-color:'+(mismatch?'#c0392b':'var(--border)')+';color:'+(mismatch?'#c0392b':'var(--muted)')+';">Пересорт</button></div>'+ 
      (placed&&it.placedTs?'<div style="font-size:10px;color:#5a8a4a;margin-top:5px;">Размещено: '+escHtml(it.placedTs)+'</div>':'')+
      authorLine(it)+
      '</div>';
  });
  h+='</div>';return h;
}
function renderHH11(){
  hh11SetMode(hh11Mode);
  const arr=getHH11();
  const cnt=document.getElementById('hh11-count');if(cnt)cnt.textContent=arr.length+' поз.';
  hh11RenderBoard(arr);
  const box=document.getElementById('hh11-list');if(!box)return;
  const data=hh11Filtered(arr);
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
  const arr=getHH11();
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
  if(x.placed)return 'Размещено';
  return '';
}
function hh11ExportTSV(kind){
  const dateOnly=x=>String((x&&x.ts)||new Date().toLocaleDateString('ru-RU')).split(',')[0].trim();
  const clean=v=>String(v??'').replace(/\t/g,' ').replace(/[\r\n]+/g,' ');
  let rows;
  let arr=getHH11().slice().reverse();
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
function hh11Clear(){if(confirm('Очистить HH 1-1 за смену?')){set('hh11_log',[]);renderHH11();}}


// ── RK CHECK JOURNAL ──
const getRK = () => get('rk_log');
let rkView='active';
function rkSetView(v){rkView=v;renderRK();}
let rkPicked=null;
function rkAllItems(){return productAllItems();}
function rkTodayISO(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function rkDateRu(iso){if(!iso)return new Date().toLocaleDateString('ru-RU');const p=String(iso).split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:iso;}
function rkEnsureDate(){const el=document.getElementById('rk-date');if(el&&!el.value)el.value=rkTodayISO();}
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
  const arr=getRK();arr.unshift(row);set('rk_log',arr);logAction('rk','Добавлена строка РК: '+(row.ut||row.name||row.eo||''),{id:row.id});
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
function rkFilteredByView(arr){arr=arr||getRK();if(rkView==='archive')return arr.filter(x=>x.archived);if(rkView==='all')return arr;return arr.filter(x=>!x.archived);}
function rkRenderViewBar(){const b=document.getElementById('rk-view-bar');if(!b)return;const arr=getRK();const active=arr.filter(x=>!x.archived).length, arch=arr.filter(x=>x.archived).length;const btn=(v,l,n)=>'<button class="cell-chip '+(rkView===v?'active':'')+'" onclick="rkSetView(\''+v+'\')">'+l+' <b>'+n+'</b></button>';b.innerHTML=btn('active','Активные',active)+btn('archive','Архив',arch)+btn('all','Все',arr.length);}
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
  const st=rkStats(arr);
  const cnt=document.getElementById('rk-count');if(cnt)cnt.textContent=st.eo+' ЕО / '+st.rows+' строк';
  const sum=document.getElementById('rk-summary');
  if(sum)sum.innerHTML='<div style="font-family:\'Oswald\',sans-serif;font-size:11px;color:var(--gold);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Итог проверки</div>'+ 
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
      const title=x.ut?('<div style="font-family:\'JetBrains Mono\',monospace;font-size:11px;font-weight:700;color:var(--gold);">'+escHtml(x.ut)+'</div><div style="font-size:12px;color:var(--text);line-height:1.25;">'+escHtml(x.name)+'</div>'):'<div style="font-size:12px;color:var(--text);font-weight:700;">ЕО без расхождений</div>';
      return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:9px 10px;margin-top:7px;">'+
        '<div style="display:flex;justify-content:space-between;gap:8px;"><div style="flex:1;min-width:0;">'+title+'</div><div style="display:flex;gap:6px;align-items:flex-start;"><button onclick="rkArchive('+x.id+')" style="background:none;border:1px solid var(--border);border-radius:6px;color:var(--muted);font-size:10px;padding:4px 7px;cursor:pointer;">'+(x.archived?'↩':'арх')+'</button><button onclick="rkDel('+x.id+')" style="background:none;border:none;color:var(--red-bright);font-size:14px;cursor:pointer;">✕</button></div></div>'+ 
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:7px;font-size:11px;text-align:center;color:var(--muted);"><div>Изл.<br><b style="color:var(--text);">'+(parseInt(x.surplus)||0)+'</b></div><div>Нед.<br><b style="color:var(--text);">'+(parseInt(x.shortage)||0)+'</b></div><div>Брак<br><b style="color:var(--text);">'+(parseInt(x.defect)||0)+'</b></div></div>'+ 
        '<div style="font-size:11px;color:var(--muted);margin-top:7px;">'+escHtml(comm)+'</div>'+authorLine(x)+'</div>';
    }).join('');
    return '<div class="gen-box" style="border-left:3px solid var(--red);padding:11px;margin-bottom:10px;">'+
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">'+
      '<div style="flex:1;min-width:0;"><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:5px;"><span style="font-family:\'JetBrains Mono\',monospace;font-size:11px;font-weight:700;color:var(--text);background:rgba(0,0,0,0.16);border:1px solid var(--border);border-radius:6px;padding:3px 6px;">ЕО '+escHtml(g.eo)+'</span><button onclick="zoomBarcode(\''+jsStr(g.eo)+'\')" style="background:none;border:1px solid var(--border);border-radius:6px;padding:3px 7px;color:var(--muted);font-family:\'Oswald\',sans-serif;font-size:10px;cursor:pointer;">ШК</button><span style="font-size:10px;color:var(--muted);">'+rkDateRu(g.date)+'</span></div>'+ 
      '<div style="font-size:11px;color:var(--muted);">Ошибок по SKU: <b style="color:var(--gold);">'+(g.errors||0)+'</b> · строк: '+g.rows.length+'</div></div></div>'+rowsHtml+'</div>';
  }).join('');
}
function rkCommentForTSV(x){return (x.status||'');}
function rkExportTSV(){
  const rows=[['Дата','ЕО','Ошибки','Наименование','УТ','Излишек','Недостача','Брак','Итог']];
  rkGroups(getRK()).forEach(g=>{
    g.rows.forEach((x,idx)=>rows.push([idx===0?rkDateRu(g.date):'',idx===0?(g.eo||''):'',x.ut?1:0,x.name||'',x.ut||'',parseInt(x.surplus)||0,parseInt(x.shortage)||0,parseInt(x.defect)||0,rkCommentForTSV(x)]));
  });
  return rows.map(r=>r.map(v=>String(v??'').replace(/\t/g,' ').replace(/\n/g,' ')).join('\t')).join('\n');
}
function rkExportText(){
  const st=rkStats(getRK());
  return 'Проверка РК\nПроверено ЕО: '+st.eo+'\nСтрок: '+st.rows+'\nОшибок: '+st.errors+'\nИзлишек: '+st.surplus+'\nНедостача: '+st.shortage+'\nБрак: '+st.defect+'\n\n'+rkExportTSV();
}
function rkCopyTSV(){const text=rkExportTSV();navigator.clipboard.writeText(text).then(()=>alert('TSV РК скопирован. Можно вставлять в Excel.')).catch(()=>{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);alert('TSV РК скопирован. Можно вставлять в Excel.');});}
function rkShare(){shareText(rkExportText());}
function rkClear(){if(confirm('Очистить журнал проверки РК?')){set('rk_log',[]);renderRK();rkRefreshEOState();}}


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
    const accent=(x.status==='нужно ВМС'||x.needWms)?'var(--red-bright)':(x.status==='решено'?'#5a8a4a':'var(--gold)');
    const item=x.ut?'<div style="font-family:\'JetBrains Mono\',monospace;font-size:11px;font-weight:700;color:var(--gold);">'+escHtml(x.ut)+'</div><div style="font-size:12px;color:var(--text);line-height:1.25;">'+escHtml(x.name||'')+'</div>':'<div style="font-size:12px;color:var(--muted);">Без товара</div>';
    return '<div class="gen-box" style="border-left:3px solid '+accent+';padding:11px;margin-bottom:10px;">'+
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;"><div style="flex:1;min-width:0;">'+
      '<div style="font-family:\'Oswald\',sans-serif;font-size:11px;color:'+accent+';text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;">'+escHtml(x.type||'проблема')+'</div>'+item+
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
function normalizeReportDay(day){
  day = day || {tasks:[]};
  const old = Array.isArray(day.tasks) ? day.tasks : [];
  const byName = {};
  old.forEach(t=>{ if(t && t.name && byName[t.name]===undefined) byName[t.name]=parseInt(t.qty)||0; });
  const tasks = REPORT_DEFAULT_TASKS.map(n=>({name:n, qty:byName[n]||0}));
  old.forEach(t=>{
    if(t && t.name && !REPORT_DEFAULT_TASKS.includes(t.name)) tasks.push({name:t.name, qty:parseInt(t.qty)||0});
  });
  day.tasks = tasks;
  return day;
}
function ensureReportToday(){
  const all=getReportAll();const k=todayKey();
  if(!all[k]){
    let extra=[];
    const keys=Object.keys(all).sort();
    if(keys.length){
      const last=all[keys[keys.length-1]];
      if(last&&last.tasks){extra=last.tasks.filter(t=>t && t.name && !REPORT_DEFAULT_TASKS.includes(t.name)).map(t=>({name:t.name, qty:0}));}
    }
    all[k]=normalizeReportDay({tasks:[...REPORT_DEFAULT_TASKS.map(n=>({name:n,qty:0})), ...extra]});
    localStorage.setItem('report',JSON.stringify(all));
  }else{
    const before=JSON.stringify(all[k].tasks||[]);
    all[k]=normalizeReportDay(all[k]);
    if(JSON.stringify(all[k].tasks||[])!==before) localStorage.setItem('report',JSON.stringify(all));
  }
  return all[k];
}
function saveReportDay(day){const all=getReportAll();all[todayKey()]=day;localStorage.setItem('report',JSON.stringify(all));}
function openReportAdd(){openModal('report-modal');}
function addReportTask(){
  const name=document.getElementById('report-task-name').value.trim();
  if(!name){alert('Введите название');return;}
  const day=ensureReportToday();
  day.tasks.push({name,qty:0});
  saveReportDay(day);
  document.getElementById('report-task-name').value='';
  closeModal('report-modal');renderReport();
}
function reportSetQty(idx,val){
  const day=ensureReportToday();
  if(!day.tasks[idx])return;
  day.tasks[idx].qty=parseInt(val)||0;
  saveReportDay(day);
  renderReportTotal();
}
function reportAddQty(idx,val){
  const add=parseInt(val)||0;
  if(!add)return;
  const day=ensureReportToday();
  if(!day.tasks[idx])return;
  day.tasks[idx].qty=(parseInt(day.tasks[idx].qty)||0)+add;
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
  day.tasks.forEach(t=>t.qty=0);saveReportDay(day);renderReport();
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
  h+='<div style="background:var(--bg2);border-radius:8px;padding:12px 13px;margin-top:4px;display:flex;justify-content:space-between;align-items:center;"><span style="font-family:\'Oswald\',sans-serif;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;">Всего за день</span><span id="report-total-val" style="font-family:\'Spectral\',serif;font-weight:600;font-size:22px;color:var(--gold);">0</span></div>';
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
  h+='<div style="display:flex;justify-content:space-between;padding:10px 0 0;margin-top:6px;border-top:2px solid var(--line);"><span style="font-family:\'Oswald\',sans-serif;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;">Всего</span><span style="font-family:\'Spectral\',serif;font-weight:600;font-size:20px;color:var(--gold);">'+grand+'</span></div>';
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
  'custom_items','custom_barcodes','product_edits','cells','cell_favorites','pack_sizes','notes','credentials','eo_codes','journal','report','search_history','inventory','favorites','eo_range_saved','eo_range_used','hh11_log','rk_log','problems_log','action_log','audit_log','user_profile'
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
    const stats={mode:'merge',added:{custom_items:0,custom_barcodes:0,product_edits:0,cells:0,cell_favorites:0,pack_sizes:0,notes:0,credentials:0,eo_codes:0,journal:0,report:0,search_history:0,inventory:0,favorites:0,eo_range_saved:0,eo_range_used:0,hh11_log:0,rk_log:0,problems_log:0,action_log:0,audit_log:0,unknown_keys:0},conflicts:[]};
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
  set('problems_log', backupArr(data.problems_log));
  if(data.audit_log)set('audit_log', backupArr(data.audit_log));
  if(data.user_profile)set('user_profile', backupObj(data.user_profile));
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
        if(it.sys!=null){const d=it.qty-it.sys;const col=d===0?'#5a8a4a':(d>0?'#c08a30':'#c0392b');const sg=d>0?'+':'';dh=' <span style="color:'+col+';font-size:10px;">(сист '+it.sys+', '+sg+d+')</span>';}
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
}
startAppStable();
window.__APP_STABLE_BUILD__='2026-06-15-v45-smart-wms-search';

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
  const counts={products:getCustomItems().length,cells:getCells().length,hh:getHH11().length,rk:getRK().length,problems:getProblems().length,actions:getActionLog().length,audit:getAuditLog().length};
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
    '<div class="diag-cell"><span>РК</span><b>'+counts.rk+'</b></div>'+ 
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
  const out=document.getElementById('integrity-result');if(out)out.innerHTML=issues.length?('<div style="color:var(--red-bright);font-size:12px;line-height:1.45;">'+issues.slice(0,60).map(escHtml).join('<br>')+(issues.length>60?'<br>…ещё '+(issues.length-60):'')+'</div>'):'<div style="color:#5a8a4a;font-size:12px;">Грубых проблем не найдено.</div>';
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
  var LEGACY_DB_PATH = 'w21';
  var DB_PATH = null;           // users/<uid>/w21
  var PULL_EVERY = 60000;       // запасной авто-приём раз в минуту; realtime работает сразу

  // Синхронизируемые ключи. Доступы/пароли намеренно не включены.
  var SYNC_KEYS = [
    'custom_items','custom_barcodes','product_edits','pack_sizes',
    'cells','cell_favorites',
    'hh11_log','rk_log','problems_log','audit_log'
  ];
  var SYNC_ARRAY_KEYS = ['custom_items','cells','cell_favorites','hh11_log','rk_log','problems_log','audit_log'];
  var SYNC_KEYED_ARRAYS = ['custom_items','cells','hh11_log','rk_log','problems_log','audit_log'];
  var SYNC_OBJECT_KEYS = ['custom_barcodes','product_edits','pack_sizes'];
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
    if(key === 'hh11_log' || key === 'rk_log' || key === 'problems_log' || key === 'audit_log') return String(item.id || '').trim();
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
    if(key === 'hh11_log' || key === 'rk_log' || key === 'problems_log' || key === 'audit_log'){
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
      sync_schema: 3,
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
      updated_at: ts,
      updated_by: currentUser ? currentUser.uid : null,
      updated_by_session: FB_SESSION_ID
    };
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

      if(has(SYNC_KEYED_ARRAYS, key)){
        // Добавления с разных устройств объединяем, удаления через tombstone отсекают «зомби».
        outStore[key] = lv >= rv ? mergeKeyedArrays(key, remoteVal, localVal, deleted)
                                 : mergeKeyedArrays(key, localVal, remoteVal, deleted);
      }else{
        // Для словарей/простых массивов действует latest-wins по ключу.
        outStore[key] = lv >= rv ? localVal : remoteVal;
      }
      outVersions[key] = Math.max(lv, rv, dlv);
    });

    return payloadFromParts(outStore, outVersions, deleted, Date.now());
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
  function getStoredWorkspaceId(){try{return cleanWorkspaceId(localStorage.getItem('lenfer_workspace_id')||'');}catch(_){return '';}}
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
    var p={uid:currentUser.uid,email:currentUser.email||'',name:String(profile.name||'').trim()||currentUser.email||currentUser.uid,updatedAt:Date.now(),lastSeen:Date.now()};
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
    renderCollabPanel();
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
      var list=byId('workspace-members-list');
      if(list){
        var vals=Object.keys(membersCache||{}).map(function(uid){return membersCache[uid]||{};});
        if(!currentWorkspaceId) list.innerHTML='<div class="no-results" style="padding:10px;">Сейчас личная база. Список пользователей появится после подключения общей базы.</div>';
        else if(!vals.length) list.innerHTML='<div class="no-results" style="padding:10px;">Пока виден только текущий пользователь или нет доступа к members.</div>';
        else list.innerHTML=vals.map(function(m){return '<div class="member-row"><b>'+escHtml(m.name||m.email||m.uid||'Пользователь')+'</b><span>'+escHtml(m.email||'')+'</span><small>был: '+(m.lastSeen?escHtml(new Date(Number(m.lastSeen)).toLocaleString('ru-RU')):'—')+'</small></div>';}).join('');
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
    try{localStorage.removeItem('lenfer_workspace_id');}catch(_){ }
    currentWorkspaceId=''; membersCache={}; DB_PATH=activeDataPath(currentUser);
    logAction('workspace','Возврат в личную базу',{workspace:''});
    startAfterLogin();
    status('Личная база подключена.',true);
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

        if(remote.present[key] && rv >= lv){
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
      try{ if(typeof renderDiagnostics === 'function') renderDiagnostics(); }catch(_){ }
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

  function stopSync(){
    clearTimeout(dirtyTimer);
    clearInterval(loopTimer);
    clearInterval(pushTimer);
    stopRealtime();
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
    if(warn) warn.innerHTML = 'Firebase Sync v3.5: автобэкапы, диагностика, проблемы смены, общий workspace и аудит авторов. Старые ключи синхронизации сохранены.';
    var dbEl = document.querySelector('.supa-status');
    if(dbEl) dbEl.textContent = 'База: warehouse-dbec9 (Firebase + Auth + sync v3.5)';
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
