// Ранний безопасный обработчик, чтобы поле поиска не падало, если основной блок ещё грузится.
window.catalogFocusSearch = window.catalogFocusSearch || function(){
  try{
    var el=document.getElementById('search');
    if(el && !el.value.trim() && typeof render==='function'){
      window.query='';
      window.filtered=[];
      render();
    }
  }catch(_){ }
};

// PWA: установка и офлайн-кэш. Работает только с http/https, не с content:// или file://.
window.__pwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', function(e){
  e.preventDefault();
  window.__pwaInstallPrompt = e;
  var btn=document.getElementById('pwa-install-btn');
  if(btn) btn.style.display='inline-flex';
});
window.addEventListener('appinstalled', function(){
  window.__pwaInstallPrompt = null;
  var btn=document.getElementById('pwa-install-btn');
  if(btn) btn.textContent='✓ PWA';
});
window.installPWA = async function(){
  try{
    if(location.protocol!=='http:' && location.protocol!=='https:'){
      alert('PWA ставится только если открыть index.html через сайт: GitHub Pages/локальный сервер/HTTPS. Через content:// или файл Android не даст установить приложение.');
      return;
    }
    if(window.__pwaInstallPrompt){
      var promptEvent=window.__pwaInstallPrompt;
      window.__pwaInstallPrompt=null;
      await promptEvent.prompt();
      await promptEvent.userChoice;
      return;
    }
    alert('Если кнопка установки не появилась: Chrome/Edge → меню ⋮ → «Установить приложение» или «Добавить на главный экран».');
  }catch(e){
    alert('Не удалось запустить установку PWA: '+(e && e.message ? e.message : e));
  }
};
(function(){
  if(('serviceWorker' in navigator) && (location.protocol==='http:' || location.protocol==='https:')){
    if(navigator.serviceWorker.addEventListener){
      navigator.serviceWorker.addEventListener('message', function(ev){
        if(ev && ev.data && ev.data.type === 'LENFER_SW_UPDATED'){
          try{ console.log('Service worker updated:', ev.data.version); }catch(_){ }
        }
      });
    }
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('./sw.js').then(function(reg){
        try{ reg.update(); }catch(_){ }
      }).catch(function(e){console.warn('SW register failed', e);});
    });
  }
})();
