'use strict';

const PWA_SCRIPT_IDS = ['lenfer-pwa-page-main', 'lenfer-pwa-content-isolated'];
const pwaPorts = new Set();
const pendingOwners = new Map();
let wmsPort = null;
let wmsTabId = null;

function originPattern(url) {
  const u = new URL(url);
  return `${u.protocol}//${u.host}/*`;
}

async function unregisterPwaScripts() {
  try { await chrome.scripting.unregisterContentScripts({ids: PWA_SCRIPT_IDS}); } catch (_) {}
}

async function registerPwaOrigin(pattern) {
  await unregisterPwaScripts();
  if (!pattern) return;
  await chrome.scripting.registerContentScripts([
    {
      id: PWA_SCRIPT_IDS[0],
      matches: [pattern],
      js: ['pwa-page.js'],
      runAt: 'document_start',
      world: 'MAIN',
      persistAcrossSessions: true
    },
    {
      id: PWA_SCRIPT_IDS[1],
      matches: [pattern],
      js: ['pwa-content.js'],
      runAt: 'document_start',
      world: 'ISOLATED',
      persistAcrossSessions: true
    }
  ]);
}

async function restoreRegistration() {
  const {pwaPattern = ''} = await chrome.storage.local.get('pwaPattern');
  if (pwaPattern) {
    try { await registerPwaOrigin(pwaPattern); } catch (e) { console.warn('PWA registration failed', e); }
  }
}

chrome.runtime.onInstalled.addListener(restoreRegistration);
chrome.runtime.onStartup.addListener(restoreRegistration);
restoreRegistration();

async function focusOrOpenWms(reload = false) {
  const tabs = await chrome.tabs.query({url: 'https://wwh.samokat.ru/*'});
  let tab = tabs[0];
  if (!tab) tab = await chrome.tabs.create({url: 'https://wwh.samokat.ru/', active: true});
  else {
    await chrome.tabs.update(tab.id, {active: true});
    if (tab.windowId != null) await chrome.windows.update(tab.windowId, {focused: true});
    if (reload) await chrome.tabs.reload(tab.id);
  }
  return tab;
}

function rejectTo(port, requestId, message) {
  try { port.postMessage({type: 'reject', requestId, message}); } catch (_) {}
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'lenfer-wms') {
    wmsPort = port;
    wmsTabId = port.sender && port.sender.tab ? port.sender.tab.id : null;
    port.onMessage.addListener((msg) => {
      if (!msg || !msg.requestId) return;
      const owner = pendingOwners.get(msg.requestId);
      if (!owner) return;
      if (msg.type === 'resolve' || msg.type === 'reject') pendingOwners.delete(msg.requestId);
      try { owner.postMessage(msg); } catch (_) { pendingOwners.delete(msg.requestId); }
    });
    port.onDisconnect.addListener(() => {
      if (wmsPort === port) { wmsPort = null; wmsTabId = null; }
    });
    return;
  }

  if (port.name !== 'lenfer-pwa') return;
  pwaPorts.add(port);
  port.onDisconnect.addListener(() => {
    pwaPorts.delete(port);
    for (const [id, owner] of pendingOwners) if (owner === port) pendingOwners.delete(id);
  });
  port.onMessage.addListener(async (msg) => {
    if (!msg) return;
    if (msg.type === 'openWms') { await focusOrOpenWms(false); return; }
    if (msg.type === 'reloadWms') { await focusOrOpenWms(true); return; }
    if (msg.type === 'showPwa') {
      const tab = port.sender && port.sender.tab;
      if (tab && tab.id != null) {
        await chrome.tabs.update(tab.id, {active: true});
        if (tab.windowId != null) await chrome.windows.update(tab.windowId, {focused: true});
      }
      return;
    }
    if (msg.type !== 'request' && msg.type !== 'cancel') return;
    if (!wmsPort) {
      await focusOrOpenWms(false);
      rejectTo(port, msg.requestId, 'Открыл WMS. Войди в аккаунт, дождись полной загрузки и повтори действие в PWA.');
      return;
    }
    if (msg.requestId) pendingOwners.set(msg.requestId, port);
    try { wmsPort.postMessage(msg); }
    catch (e) {
      pendingOwners.delete(msg.requestId);
      rejectTo(port, msg.requestId, 'Связь с вкладкой WMS потеряна. Обнови WMS и повтори.');
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg && msg.type === 'configurePwaOrigin') {
      const url = String(msg.url || '');
      const tabId = Number(msg.tabId);
      if (!url || !/^https?:/.test(url) || !Number.isInteger(tabId)) throw new Error('Открой PWA в обычной вкладке браузера.');
      const pattern = originPattern(url);
      const hasPermission = await chrome.permissions.contains({origins: [pattern]});
      if (!hasPermission) throw new Error('Нет разрешения на адрес PWA. Нажми подключение ещё раз.');
      await chrome.storage.local.set({pwaPattern: pattern, pwaOrigin: new URL(url).origin});
      await registerPwaOrigin(pattern);
      await chrome.scripting.executeScript({target: {tabId}, files: ['pwa-page.js'], world: 'MAIN'});
      await chrome.scripting.executeScript({target: {tabId}, files: ['pwa-content.js'], world: 'ISOLATED'});
      sendResponse({ok: true, pattern});
      return;
    }
    if (msg && msg.type === 'getStatus') {
      const cfg = await chrome.storage.local.get(['pwaPattern', 'pwaOrigin']);
      sendResponse({ok: true, ...cfg, wmsConnected: !!wmsPort, wmsTabId});
      return;
    }
    sendResponse({ok: false});
  })().catch((e) => sendResponse({ok: false, error: e.message || String(e)}));
  return true;
});
