'use strict';
const statusEl=document.getElementById('status');
async function refresh(){
  const s=await chrome.runtime.sendMessage({type:'getStatus'});
  statusEl.innerHTML=(s.pwaOrigin?`PWA: <span class="ok">${s.pwaOrigin}</span>`:'PWA: <span class="bad">не подключена</span>')+`<br>WMS-вкладка: <span class="${s.wmsConnected?'ok':'bad'}">${s.wmsConnected?'связь есть':'не подключена'}</span>`;
}
document.getElementById('connect').onclick=async()=>{
  statusEl.textContent='Подключаю…';
  const r=await chrome.runtime.sendMessage({type:'configureCurrentPwa'});
  if(!r.ok){statusEl.innerHTML='<span class="bad">'+(r.error||'Не удалось подключить')+'</span>';return;}
  await refresh();
};
document.getElementById('wms').onclick=()=>chrome.tabs.create({url:'https://wwh.samokat.ru/'});
refresh();
