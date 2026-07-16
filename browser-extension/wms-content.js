'use strict';
if (!window.__lenferWmsContentInstalled) {
  window.__lenferWmsContentInstalled = true;
  const port = chrome.runtime.connect({name: 'lenfer-wms'});
  port.onMessage.addListener((msg) => {
    window.postMessage({...msg, source: 'lenfer-extension-content'}, '*');
  });
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== 'lenfer-wms-page') return;
    try { port.postMessage(msg); } catch (_) {}
  });
}
