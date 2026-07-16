'use strict';
const statusEl=document.getElementById('status');
async function refresh(){
  const s=await chrome.runtime.sendMessage({type:'getStatus'});
  statusEl.innerHTML=(s.pwaOrigin?`PWA: <span class="ok">${s.pwaOrigin}</span>`:'PWA: <span class="bad">не подключена</span>')+`<br>WMS-вкладка: <span class="${s.wmsConnected?'ok':'bad'}">${s.wmsConnected?'связь есть':'не подключена'}</span>`;
}
document.getElementById('connect').onclick=async()=>{
  statusEl.textContent='Подключаю…';
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab||!tab.url||!/^https?:/.test(tab.url)){statusEl.innerHTML='<span class="bad">Открой PWA в обычной вкладке.</span>';return;}
  const u=new URL(tab.url);const pattern=u.protocol+'//'+u.host+'/*';
  const granted=await chrome.permissions.request({origins:[pattern]});
  if(!granted){statusEl.innerHTML='<span class="bad">Доступ к адресу PWA не разрешён.</span>';return;}
  const r=await chrome.runtime.sendMessage({type:'configurePwaOrigin',url:tab.url,tabId:tab.id});
  if(!r.ok){statusEl.innerHTML='<span class="bad">'+(r.error||'Не удалось подключить')+'</span>';return;}
  await refresh();
};
document.getElementById('wms').onclick=()=>chrome.tabs.create({url:'https://wwh.samokat.ru/'});
refresh();
