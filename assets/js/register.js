(function(){
  'use strict';

  var FB_CONFIG = {
    apiKey:      "AIzaSyDabpQ_yMVS_P_s5JyPgxvCiTVGF5-Nu5Q",
    databaseURL: "https://warehouse-dbec9-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId:   "warehouse-dbec9",
    appId:       "1:771368960199:web:2491631935a0df2d13fee2"
  };

  var auth = null;
  var db = null;
  var mode = 'register';
  var ready = false;

  function id(x){ return document.getElementById(x); }
  function status(msg, cls){
    var el = id('status');
    if(!el) return;
    el.className = 'status' + (cls ? ' ' + cls : '');
    el.textContent = msg;
  }
  function nextUrl(){
    var p = new URLSearchParams(location.search);
    var n = p.get('next') || 'index.html';
    if(/^https?:\/\//i.test(n)) return './index.html';
    if(n.indexOf('register.html') >= 0) return './index.html';
    return n;
  }
  function setAuthHint(ok){
    try{
      if(ok) localStorage.setItem('lenfer_auth_ok_hint','1');
      else localStorage.removeItem('lenfer_auth_ok_hint');
    }catch(_){ }
  }
  function goApp(){ setAuthHint(true); location.replace(nextUrl()); }

  function setMode(next){
    mode = next === 'login' ? 'login' : 'register';
    id('mode-register').classList.toggle('active', mode === 'register');
    id('mode-login').classList.toggle('active', mode === 'login');
    id('title').textContent = mode === 'register' ? 'Регистрация' : 'Вход';
    id('subtitle').textContent = mode === 'register'
      ? 'Создай аккаунт, и только после этого откроется приложение.'
      : 'Войди в уже созданный аккаунт.';
    id('submit-btn').textContent = mode === 'register' ? 'Зарегистрироваться и открыть' : 'Войти и открыть';
    status(mode === 'register' ? 'Введи email и пароль минимум 6 символов.' : 'Введи email и пароль от аккаунта.');
  }

  function getInput(){
    var name = String(id('display-name').value || '').trim();
    var email = String(id('email').value || '').trim();
    var password = String(id('password').value || '');
    if(mode === 'register' && !name) throw new Error('введи имя — потом в журнале будет понятно, кто что сделал');
    if(!email) throw new Error('введи email');
    if(!password || password.length < 6) throw new Error('пароль минимум 6 символов');
    return {name: name, email: email, password: password};
  }

  function humanError(e){
    var code = e && e.code ? String(e.code) : '';
    if(code.indexOf('email-already-in-use') >= 0) return 'такой email уже зарегистрирован — переключись на «Вход»';
    if(code.indexOf('invalid-email') >= 0) return 'email выглядит криво';
    if(code.indexOf('weak-password') >= 0) return 'пароль слишком слабый, минимум 6 символов';
    if(code.indexOf('wrong-password') >= 0) return 'неверный пароль';
    if(code.indexOf('user-not-found') >= 0 || code.indexOf('invalid-credential') >= 0) return 'аккаунт не найден или пароль неверный';
    if(code.indexOf('unauthorized-domain') >= 0) return 'домен сайта не добавлен в Firebase Authorized domains';
    if(code.indexOf('operation-not-allowed') >= 0) return 'в Firebase не включён Email/Password';
    if(code.indexOf('too-many-requests') >= 0) return 'слишком много попыток, Firebase временно тормознул вход';
    return (e && e.message) ? e.message : String(e || 'неизвестная ошибка');
  }

  async function saveProfile(user, name){
    if(!user)return;
    name=String(name||user.displayName||user.email||user.uid||'').trim();
    try{if(user.updateProfile && name && user.displayName!==name)await user.updateProfile({displayName:name});}catch(_){ }
    try{
      var p={uid:user.uid,email:user.email||'',name:name,updatedAt:Date.now(),lastSeen:Date.now()};
      localStorage.setItem('user_profile',JSON.stringify(p));
      if(db)await db.ref('profiles/'+user.uid).update({...p,createdAt:firebase.database.ServerValue.TIMESTAMP});
    }catch(e){console.warn('profile save failed',e);}
  }

  async function submit(){
    if(!ready || !auth) return status('Firebase ещё грузится, секунду…');
    try{
      var v = getInput();
      id('submit-btn').disabled = true;
      status(mode === 'register' ? 'Создаю аккаунт…' : 'Вхожу…');
      var cred;
      if(mode === 'register') cred = await auth.createUserWithEmailAndPassword(v.email, v.password);
      else cred = await auth.signInWithEmailAndPassword(v.email, v.password);
      await saveProfile(cred && cred.user ? cred.user : auth.currentUser, v.name);
      status('Готово. Открываю приложение…', 'ok');
      goApp();
    }catch(e){
      status(humanError(e), 'err');
    }finally{
      id('submit-btn').disabled = false;
    }
  }

  async function logout(){
    try{
      if(auth) await auth.signOut();
      setAuthHint(false);
      id('logout-btn').classList.add('hidden');
      status('Вышел. Теперь можно создать другой аккаунт или войти заново.');
    }catch(e){ status(humanError(e), 'err'); }
  }

  function boot(){
    try{
      if(typeof firebase === 'undefined' || !firebase.auth) throw new Error('Firebase Auth SDK не загрузился');
      if(!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
      auth = firebase.auth();
      db = firebase.database();
      try{ auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); }catch(_){ }
      ready = true;
      setMode('register');
      auth.onAuthStateChanged(function(user){
        if(user){
          setAuthHint(true);
          id('logout-btn').classList.remove('hidden');
          try{var p=JSON.parse(localStorage.getItem('user_profile')||'{}'); if(p&&p.name) id('display-name').value=p.name;}catch(_){}
          status('Уже вошёл как ' + (user.displayName || user.email || user.uid) + '. Открываю приложение…', 'ok');
          setTimeout(goApp, 550);
        }
      });
    }catch(e){
      status('Ошибка Firebase: ' + humanError(e), 'err');
    }
  }

  id('mode-register').addEventListener('click', function(){ setMode('register'); });
  id('mode-login').addEventListener('click', function(){ setMode('login'); });
  id('auth-form').addEventListener('submit', function(e){ e.preventDefault(); submit(); });
  id('logout-btn').addEventListener('click', logout);

  boot();
})();
