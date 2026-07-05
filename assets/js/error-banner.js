window.addEventListener('error', function(e){
  // Браузер намеренно скрывает message/filename/lineno для ошибок в скриптах,
  // которые он считает чужеродными (часто — Worker, напр. pdf.worker.min.js).
  // "Script error." без номера строки не несёт диагностической пользы и пугает
  // пользователя советом откатиться зря — не показываем баннер в этом случае.
  if(e.message === 'Script error.' && !e.filename && !e.lineno) return;
  var b=document.getElementById('app-error-banner');
  if(b){b.style.display='block';b.textContent='Ошибка приложения: '+(e.message||'неизвестно')+(e.lineno?(' · строка '+e.lineno):'')+'. Открой последнюю стабильную версию или сделай бэкап перед обновлением.';}
});
