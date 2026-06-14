(function(){
  'use strict';
  // Быстрый мягкий гейт: не ждём Firebase Auth в <head> каждый запуск.
  // Если этот браузер уже успешно входил, показываем приложение сразу,
  // а реальную проверку и редирект делает основной Firebase-блок ниже.
  try{
    if(localStorage.getItem('lenfer_auth_ok_hint') === '1'){
      document.documentElement.classList.remove('auth-required');
      document.documentElement.classList.add('auth-ok');
    }else{
      document.documentElement.classList.add('auth-required');
    }
  }catch(_){
    document.documentElement.classList.add('auth-required');
  }
})();
