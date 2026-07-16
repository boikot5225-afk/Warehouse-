(() => {
  'use strict';
  if (window.__lenferExtensionBridgeInstalled) return;
  window.__lenferExtensionBridgeInstalled = true;

  const asyncMethods = [
    'getLastWmsDiagnostic','checkWmsAuth','lookupWmsByCode','lookupWmsByProductId','lookupWmsByCellId',
    'lookupWmsChangesByCode','lookupWmsChangesByProductId','lookupWmsChangesByCellId','lookupWmsChangesForExecutor',
    'lookupWmsActivityInProgress','lookupWmsActivityStats','createWmsHandlingUnits','lookupWmsChangesByDateRange',
    'lookupWmsExecutorChanges','lookupWmsChangesExecutors','lookupWmsChangesCombined','lookupWmsUpperStorageCells',
    'lookupWmsUpperStorageOccupancy','lookupWmsDailyStorageLosses','lookupWmsRecountingTasks',
    'lookupWmsRecountingTaskDetails','confirmWmsRecountingTask','lookupWmsObservedPicking','clearWmsObservedPicking',
    'lookupWmsShipmentRoutes','lookupWmsPackagingList','lookupWmsCellLabels','lookupWmsCellSearch',
    'printBarcodeLabel','checkForUpdate','downloadAndInstallUpdate'
  ];

  const bridge = {
    openWmsLogin() { window.postMessage({source:'lenfer-pwa-page', type:'openWms'}, '*'); },
    reloadWmsLogin() { window.postMessage({source:'lenfer-pwa-page', type:'reloadWms'}, '*'); },
    showLenferApp() { window.postMessage({source:'lenfer-pwa-page', type:'showPwa'}, '*'); },
    cancelWmsWork() { window.postMessage({source:'lenfer-pwa-page', type:'cancel', requestId:'cancel_'+Date.now()}, '*'); }
  };
  for (const method of asyncMethods) {
    bridge[method] = function(requestId, ...args) {
      window.postMessage({source:'lenfer-pwa-page', type:'request', requestId, method, args}, '*');
    };
  }
  window.LenferAndroidWms = bridge;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== 'lenfer-extension') return;
    if (msg.type === 'resolve') {
      const payload = typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload ?? {});
      if (typeof window.lenferWmsNativeResolve === 'function') window.lenferWmsNativeResolve(msg.requestId, payload);
    } else if (msg.type === 'reject') {
      if (typeof window.lenferWmsNativeReject === 'function') window.lenferWmsNativeReject(msg.requestId, msg.message || 'Ошибка расширения WMS');
    } else if (msg.type === 'progress') {
      const payload = typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload ?? {});
      if (typeof window.lenferWmsCellsProgress === 'function') window.lenferWmsCellsProgress(msg.requestId, payload);
    }
  });

  window.dispatchEvent(new CustomEvent('lenfer-wms-extension-ready'));
})();
