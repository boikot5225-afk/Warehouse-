window.addEventListener('error', function(e){
  var b=document.getElementById('app-error-banner');
  if(b){b.style.display='block';b.textContent='Ошибка приложения: '+(e.message||'неизвестно')+(e.lineno?(' · строка '+e.lineno):'')+'. Открой последнюю стабильную версию или сделай бэкап перед обновлением.';}
});
