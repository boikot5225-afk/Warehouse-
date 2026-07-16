'use strict';
if (!window.__lenferPwaContentInstalled) {
  window.__lenferPwaContentInstalled = true;
  const port = chrome.runtime.connect({name: 'lenfer-pwa'});
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== 'lenfer-pwa-page') return;
    try { port.postMessage(msg); } catch (_) {}
  });
  port.onMessage.addListener((msg) => {
    window.postMessage({...msg, source: 'lenfer-extension'}, '*');
  });
}
