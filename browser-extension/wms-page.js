(() => {
  'use strict';
  if (window.__lenferWmsPageInstalled) return;
  window.__lenferWmsPageInstalled = true;

  const API = {
    PRODUCTS_SEARCH: 'https://api.samokat.ru/wmsops-wwh/products/search',
    STOCKS_DETAILS: 'https://api.samokat.ru/wmsops-wwh/stocks/details',
    STOCKS_CHANGES: 'https://api.samokat.ru/wmsops-wwh/stocks/changes/search',
    CHANGES_EXECUTORS: 'https://api.samokat.ru/wmsops-wwh/stocks/changes/executors/filter',
    RECOUNTING_TASKS: 'https://api.samokat.ru/wmsops-wwh/recounting/tasks',
    CELL_SEARCH: 'https://api.samokat.ru/wmsops-wwh/topology/cells/filters/by-address-search',
    TOPOLOGY_CELLS: 'https://api.samokat.ru/wmsops-wwh/topology/cells',
    CELL_LABELS: 'https://api.samokat.ru/wmsops-wwh/topology/cells/labels',
    ACTIVITY_PROGRESS: 'https://api.samokat.ru/wmsops-wwh/activity-monitor/selection/handling-units-in-progress',
    ACTIVITY_STATS: 'https://api.samokat.ru/wmsops-wwh/activity-monitor/selection/stats',
    HANDLING_UNITS: 'https://api.samokat.ru/wmsops-wwh/handling-units',
    SHIPMENT_ROUTES: 'https://api-p01.samokat.ru/wmsout-wwh/shipments/routes',
    SESSION_PING: 'https://api.samokat.ru/wmsin-wwh/warehouses'
  };

  const originalFetch = window.fetch.bind(window);
  const state = {
    authorization: '',
    xAuthToken: '',
    lastDiagnostic: '',
    cancelRequested: false,
    observedPickingUrls: new Map()
  };

  function short(value, max = 800) {
    const s = String(value == null ? '' : value);
    return s.length > max ? s.slice(0, max) + '…' : s;
  }
  function asArray(v) { return Array.isArray(v) ? v : []; }
  function sourceMeta(mode, extra = {}) { return {_source:'LenferBrowserExtension', _mode:mode, ...extra}; }
  function post(type, requestId, data = {}) { window.postMessage({source:'lenfer-wms-page', type, requestId, ...data}, '*'); }
  function progress(requestId, payload) { post('progress', requestId, {payload}); }
  function responseItems(resp) {
    if (!resp || typeof resp !== 'object') return [];
    if (Array.isArray(resp)) return resp;
    const v = resp.value;
    if (Array.isArray(v)) return v;
    if (v && Array.isArray(v.items)) return v.items;
    if (v && Array.isArray(v.cells)) return v.cells;
    if (Array.isArray(resp.items)) return resp.items;
    if (Array.isArray(resp.cells)) return resp.cells;
    if (Array.isArray(resp.data)) return resp.data;
    return [];
  }

  function captureHeaderPair(name, value) {
    const n = String(name || '').toLowerCase();
    const v = String(value || '').trim();
    if (!v) return;
    if (n === 'authorization') state.authorization = v;
    if (n === 'x-auth-token') state.xAuthToken = v;
  }
  function captureHeaders(headers) {
    try {
      if (!headers) return;
      new Headers(headers).forEach((v, k) => captureHeaderPair(k, v));
    } catch (_) {}
  }
  function scanStorage(storage) {
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i) || '';
        let value = storage.getItem(key) || '';
        if (!value) continue;
        const lk = key.toLowerCase();
        if (lk.includes('x-auth') || lk.includes('xauthtoken')) {
          try { const parsed = JSON.parse(value); value = typeof parsed === 'string' ? parsed : value; } catch (_) {}
          if (value && value.length < 5000) state.xAuthToken = value.replace(/^"|"$/g, '');
        }
        if (lk.includes('authorization') || lk.includes('access_token') || lk.includes('accesstoken') || lk === 'token') {
          try {
            const parsed = JSON.parse(value);
            if (typeof parsed === 'string') value = parsed;
            else if (parsed && typeof parsed === 'object') value = parsed.access_token || parsed.accessToken || parsed.token || value;
          } catch (_) {}
          value = String(value).replace(/^"|"$/g, '');
          if (/^Bearer\s+/i.test(value)) state.authorization = value;
          else if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) state.authorization = 'Bearer ' + value;
        }
      }
    } catch (_) {}
  }
  function refreshAuthFromStorage() { scanStorage(localStorage); scanStorage(sessionStorage); }
  refreshAuthFromStorage();
  setInterval(refreshAuthFromStorage, 15000);

  window.fetch = function(input, init) {
    try {
      if (input instanceof Request) captureHeaders(input.headers);
      captureHeaders(init && init.headers);
      const url = typeof input === 'string' ? input : input && input.url;
      if (url && /api(?:-p01)?\.samokat\.ru/.test(url)) {
        const m = (init && init.method) || (input instanceof Request ? input.method : 'GET');
        state.lastDiagnostic = `page fetch ${m} ${url}`;
      }
    } catch (_) {}
    return originalFetch(input, init);
  };

  try {
    const open = XMLHttpRequest.prototype.open;
    const set = XMLHttpRequest.prototype.setRequestHeader;
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this.__lenferMethod = method;
      this.__lenferUrl = url;
      return open.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
      captureHeaderPair(name, value);
      return set.call(this, name, value);
    };
    XMLHttpRequest.prototype.send = function(body) {
      try {
        if (this.__lenferUrl && /api(?:-p01)?\.samokat\.ru/.test(String(this.__lenferUrl))) {
          state.lastDiagnostic = `page xhr ${this.__lenferMethod || 'GET'} ${this.__lenferUrl}`;
        }
      } catch (_) {}
      return send.call(this, body);
    };
  } catch (_) {}

  function authHeaders(extra) {
    refreshAuthFromStorage();
    const h = new Headers(extra || {});
    if (state.authorization && !h.has('Authorization')) h.set('Authorization', state.authorization);
    if (state.xAuthToken && !h.has('x-auth-token')) h.set('x-auth-token', state.xAuthToken);
    if (!h.has('Accept')) h.set('Accept', 'application/json, text/plain, */*');
    return h;
  }

  async function apiRequest(url, opts = {}) {
    if (state.cancelRequested) throw new Error('Остановлено пользователем');
    const method = String(opts.method || 'GET').toUpperCase();
    const headers = authHeaders(opts.headers);
    let body = opts.body;
    if (body !== undefined && body !== null && !(body instanceof Blob) && !(body instanceof FormData) && typeof body !== 'string') {
      body = JSON.stringify(body);
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json;charset=UTF-8');
    }
    const started = Date.now();
    const resp = await originalFetch(url, {method, headers, body, credentials:'include', cache:'no-store', redirect:'follow'});
    const contentType = resp.headers.get('content-type') || '';
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const text = new TextDecoder('utf-8').decode(bytes);
    state.lastDiagnostic = [
      'Lenfer Browser WMS diagnostic v1',
      `time: ${new Date().toISOString()}`,
      `method: ${method}`,
      `url: ${url}`,
      `status: ${resp.status}`,
      `content-type: ${contentType}`,
      `elapsedMs: ${Date.now()-started}`,
      `hasBearer: ${!!state.authorization}`,
      `hasXAuth: ${!!state.xAuthToken}`,
      `body: ${short(text, 1500)}`
    ].join('\n');
    if (!resp.ok) throw new Error(`WMS ответила ${resp.status}: ${short(text, 400)}`);
    if (opts.binary) return {status:resp.status, contentType, bytes, text};
    const t = text.trim();
    if (!t) return {};
    if (t[0] !== '{' && t[0] !== '[') {
      const challenge = /servicepipe|js-challenge|captcha|<html/i.test(t);
      throw new Error(challenge
        ? 'Servicepipe вернул браузерную проверку вместо JSON. Обнови открытую вкладку WMS, дождись загрузки и повтори.'
        : 'WMS вернула не JSON: ' + short(t, 220));
    }
    try { return JSON.parse(t); }
    catch (e) { throw new Error('Не удалось разобрать JSON WMS: ' + e.message); }
  }
  const getJson = (url) => apiRequest(url);
  const postJson = (url, body) => apiRequest(url, {method:'POST', body});

  function baseStocksPayload() {
    return {productId:null,parts:null,statuses:null,cellId:null,handlingUnitBarcode:null,levels:null,locationIds:null,owner:null,pageNumber:1,pageSize:100,rows:null,sections:null,sortByQuantity:null,zoneIds:null};
  }
  function baseChangesPayload() {
    return {executorId:null,operationCompletedAtFrom:null,operationCompletedAtTo:null,operationStartedAtFrom:null,operationStartedAtTo:null,operationTypes:[],pageNumber:1,pageSize:100,parts:[],productId:null,sourceCellId:null,sourceHandlingUnitBarcode:null,targetCellId:null,targetHandlingUnitBarcode:null};
  }

  async function fetchAllPagedItems(url, basePayload, maxPages = 50) {
    const pageSize = Math.max(1, Number(basePayload.pageSize || 100));
    const all = [];
    let total = 0;
    let first = null;
    for (let page = 1; page <= maxPages; page++) {
      if (state.cancelRequested) throw new Error('Остановлено пользователем');
      const payload = {...basePayload, pageNumber:page, pageSize};
      const resp = await postJson(url, payload);
      if (!first) first = resp;
      const value = resp && resp.value;
      const items = value && Array.isArray(value.items) ? value.items : [];
      total = Math.max(total, Number(value && value.total || 0));
      if (!items.length) return page === 1 ? resp : {value:{items:all,total:total||all.length},_allPages:true,_loadedRows:all.length};
      all.push(...items);
      if ((total && all.length >= total) || items.length < pageSize) break;
    }
    return {value:{items:all,total:total||all.length},_allPages:true,_loadedRows:all.length};
  }

  async function fetchAllGetPaged(baseUrl, baseParams = {}, repeatedKey = '', repeatedValues = [], maxPages = 100) {
    const pageSize = Math.max(1, Number(baseParams.pageSize || 100));
    const all = [];
    let total = 0;
    let first = null;
    for (let page = 1; page <= maxPages; page++) {
      if (state.cancelRequested) throw new Error('Остановлено пользователем');
      const u = new URL(baseUrl);
      for (const [k,v] of Object.entries({...baseParams,pageNumber:page,pageSize})) {
        if (v !== undefined && v !== null && String(v) !== '') u.searchParams.set(k, String(v));
      }
      for (const v of repeatedValues || []) if (v) u.searchParams.append(repeatedKey, String(v));
      const resp = await getJson(u.toString());
      if (!first) first = resp;
      const value = resp && resp.value;
      const items = value && Array.isArray(value.items) ? value.items : [];
      total = Math.max(total, Number(value && value.total || 0));
      if (!items.length) return page === 1 ? resp : {value:{items:all,total:total||all.length},_allPages:true,_loadedRows:all.length};
      all.push(...items);
      if ((total && all.length >= total) || items.length < pageSize) break;
    }
    return {value:{items:all,total:total||all.length},_allPages:true,_loadedRows:all.length};
  }

  function cleanQuery(code) {
    let s = String(code || '').trim().replace(/\s+/g, ' ');
    s = s.replace(/^ut[-\s]?/i, 'УТ-').replace(/^ут[-\s]?/iu, 'УТ-');
    if (/^\d{5,8}$/.test(s)) s = 'УТ-' + s;
    return s;
  }
  function isUtCode(q) { return /^УТ-?\d{3,}/i.test(String(q || '').trim()); }
  function isLikelyHuBarcode(q) { return /^0\d{11}$/.test(String(q || '').trim()); }
  function isLikelyCellAddress(q) {
    const s = String(q || '').trim().toUpperCase();
    if (!s || s.startsWith('УТ-') || /\s/.test(s) || /^\d+$/.test(s)) return false;
    return (s.includes('-') && /^[A-ZА-Я0-9]{1,8}-[A-ZА-Я0-9-]{1,32}$/.test(s)) || /^(HH|SH)[A-ZА-Я0-9-]*$/.test(s) || /^[A-ZА-Я]{1,4}\d{1,4}[A-ZА-Я]?$/.test(s) || /^\d{2,4}[A-ZА-Я]{1,3}$/.test(s);
  }
  function normalizeSearchText(s) { return String(s || '').toLowerCase().replace(/ё/g,'е').replace(/[’`]/g,"'").replace(/[^a-zа-я0-9]+/g,' ').replace(/\s+/g,' ').trim(); }
  function searchTokens(query) { return [...new Set(normalizeSearchText(query).split(' ').filter(t => t && (t.length >= 2 || /^\d+$/.test(t)) && !['самокат','арт','шт'].includes(t)))]; }
  function productSearchVariants(query) {
    const original = String(query || '').trim();
    const norm = normalizeSearchText(original);
    const out = [];
    const add = (x) => { if (x && !out.includes(x)) out.push(x); };
    add(original); add(norm);
    const tokens = searchTokens(original);
    if (tokens.length > 1) { add(tokens.join(' ')); add(tokens[0]+' '+tokens[tokens.length-1]); }
    let longest = ''; for (const t of tokens) if (t.length > longest.length) longest = t;
    if (longest.length >= 4) add(longest);
    return out.slice(0,5);
  }
  function productSearchPayload(type, value) { return {productFilter:type==='PRODUCT_NOMENCLATURE_CODE'?{type,nomenclatureCode:value}:{type,name:value},pageSize:30,pageNumber:1}; }
  function productScore(query, item) {
    const q = normalizeSearchText(query), name = normalizeSearchText(item.productName || item.name), code = normalizeSearchText(item.nomenclatureCode);
    const tokens = searchTokens(query); let score = 0, matched = 0;
    if (q) { if (name===q || code===q) score+=500; if (name.includes(q)) score+=120; if (code.includes(q.replace('ут ',''))) score+=160; }
    for (const t of tokens) if (name.includes(t) || code.includes(t)) { matched++; score += /^\d+$/.test(t)?28:14; }
    if (tokens.length && matched===tokens.length) score+=80;
    score += matched*5; return score;
  }
  async function searchProductsSmart(query) {
    const byId = new Map(); let total = 0; let exactSinglePreferred = false;
    if (isUtCode(query)) {
      const ut = query.toUpperCase();
      const resp = await postJson(API.PRODUCTS_SEARCH, productSearchPayload('PRODUCT_NOMENCLATURE_CODE',ut));
      const data = asArray(resp && resp.value && resp.value.data); total = Number(resp && resp.value && resp.value.total || data.length);
      data.forEach((item,i)=>{item={...item,_matchScore:productScore(query,item)+1000,_matchVariant:ut};byId.set(item.id||`item_${i}`,item);});
      exactSinglePreferred = byId.size===1;
    } else {
      for (const variant of productSearchVariants(query)) {
        const resp = await postJson(API.PRODUCTS_SEARCH, productSearchPayload('PRODUCT_NAME',variant));
        const data = asArray(resp && resp.value && resp.value.data); total=Math.max(total,Number(resp&&resp.value&&resp.value.total||data.length));
        data.forEach((item,i)=>{const id=item.id||item.productId||`item_${i}_${variant}`;const score=productScore(query,item);const prev=byId.get(id);if(!prev||score>Number(prev._matchScore||0))byId.set(id,{...item,_matchScore:score,_matchVariant:variant});});
        if (byId.size>=30) break;
      }
    }
    const items=[...byId.values()].sort((a,b)=>Number(b._matchScore||0)-Number(a._matchScore||0));
    if(items.length===1) exactSinglePreferred=true;
    return {items,total:total||items.length,exactSinglePreferred};
  }
  function productChoices(search, query, mode) {
    return {...sourceMeta(mode),_kind:'productChoices',_query:query,total:search.total,products:search.items.map(item=>({productId:item.id||item.productId||'',name:item.productName||item.name||'',nomenclatureCode:item.nomenclatureCode||'',imageUrl:item.imageUrl||'',matchScore:item._matchScore||0,matchVariant:item._matchVariant||''}))};
  }

  async function searchCellsRaw(address) {
    const resp = await getJson(API.CELL_SEARCH+'?cellAddressSearch='+encodeURIComponent(address));
    return asArray(resp && resp.value && resp.value.cells);
  }
  async function searchCellsByAddress(address) {
    const cells=(await searchCellsRaw(address)).map(c=>({...c,cellId:c.id||'',fullAddress:c.fullAddress||c.address||'',barcode:c.barcode||c.code||'',zoneName:c.zoneName||c.zone||''}));
    return {...sourceMeta('cellSearch'),_query:address,cells,total:cells.length};
  }
  async function lookupStocksByProductId(productId) {
    const r=await fetchAllPagedItems(API.STOCKS_DETAILS,{...baseStocksPayload(),productId,cellId:null});
    return {...r,...sourceMeta('product'),_productId:productId};
  }
  async function lookupStocksByCellId(cellId,address) {
    const r=await fetchAllPagedItems(API.STOCKS_DETAILS,{...baseStocksPayload(),productId:null,cellId});
    return {...r,...sourceMeta('cell'),_cellId:cellId,_cellAddress:address||''};
  }
  async function lookupStocksByHuBarcode(hu) {
    const r=await fetchAllPagedItems(API.STOCKS_DETAILS,{...baseStocksPayload(),productId:null,cellId:null,handlingUnitBarcode:hu});
    return {...r,...sourceMeta('hu'),_query:hu,_hu:hu};
  }
  async function lookupByCellAddress(address, changes=false) {
    const cells=await searchCellsRaw(address);
    if(!cells.length) throw new Error('Ячейка не найдена: '+address);
    if(cells.length>1) return {...sourceMeta(changes?'changesChoices':'cellChoices'),_kind:'cellChoices',_query:address,cells:cells.map(c=>({cellId:c.id||'',fullAddress:c.fullAddress||c.address||''}))};
    const c=cells[0],id=c.id||'',full=c.fullAddress||address;
    if(!id) throw new Error('В ответе поиска ячейки нет cellId');
    return changes?lookupChangesByCellId(id,full):lookupStocksByCellId(id,full);
  }
  async function lookupUniversal(query) {
    if(isLikelyCellAddress(query)) return lookupByCellAddress(query,false);
    if(isLikelyHuBarcode(query)) return lookupStocksByHuBarcode(query);
    const search=await searchProductsSmart(query);
    if(!search.items.length) throw new Error('Товар не найден: '+query);
    if(search.items.length>1&&!search.exactSinglePreferred)return productChoices(search,query,'productChoices');
    const found=search.items[0],id=found.id||found.productId||'';
    if(!id)throw new Error('В ответе products/search нет productId');
    return {...await lookupStocksByProductId(id),_searchedCode:query,_productSearchResult:found};
  }

  function mergeChangeResponses(a,b) {
    const items=[]; const seen=new Set();
    for(const item of [...responseItems(a),...responseItems(b)]) {
      const key=item.id||item.operationId||JSON.stringify(item);
      if(seen.has(key))continue;seen.add(key);items.push(item);
    }
    const total=Math.max(items.length,Number(a&&a.value&&a.value.total||0)+Number(b&&b.value&&b.value.total||0));
    return {value:{items,total}};
  }
  async function lookupChangesByProductId(productId) {
    const r=await fetchAllPagedItems(API.STOCKS_CHANGES,{...baseChangesPayload(),productId});
    return {...r,...sourceMeta('changesProduct'),_productId:productId};
  }
  async function lookupChangesByCellId(cellId,address) {
    const [a,b]=await Promise.all([
      fetchAllPagedItems(API.STOCKS_CHANGES,{...baseChangesPayload(),sourceCellId:cellId}),
      fetchAllPagedItems(API.STOCKS_CHANGES,{...baseChangesPayload(),targetCellId:cellId})
    ]);
    return {...mergeChangeResponses(a,b),...sourceMeta('changesCell'),_cellId:cellId,_cellAddress:address||'',_query:address||''};
  }
  async function lookupChangesByHuBarcode(hu) {
    const [a,b]=await Promise.all([
      fetchAllPagedItems(API.STOCKS_CHANGES,{...baseChangesPayload(),sourceHandlingUnitBarcode:hu}),
      fetchAllPagedItems(API.STOCKS_CHANGES,{...baseChangesPayload(),targetHandlingUnitBarcode:hu})
    ]);
    return {...mergeChangeResponses(a,b),...sourceMeta('changesHu'),_query:hu,_hu:hu};
  }
  async function fetchAllExecutors() {
    const r=await getJson(API.CHANGES_EXECUTORS); const v=r&&r.value;
    if(Array.isArray(v))return v;if(v&&Array.isArray(v.executors))return v.executors;if(v&&Array.isArray(v.items))return v.items;if(Array.isArray(r.executors))return r.executors;return responseItems(r);
  }
  function filterExecutors(all,q) { const needle=String(q||'').trim().toLowerCase(); return asArray(all).filter(e=>!needle||`${e.lastName||''} ${e.firstName||''} ${e.middleName||''}`.toLowerCase().includes(needle)); }
  async function loadChangesByExecutor(executor,from='',to='') {
    const id=executor.id||'';if(!id)throw new Error('У исполнителя нет ID');
    const full=`${executor.lastName||''} ${executor.firstName||''} ${executor.middleName||''}`.trim();
    const payload={...baseChangesPayload(),executorId:id};if(from)payload.operationStartedAtFrom=from;if(to)payload.operationStartedAtTo=to;
    const r=await fetchAllPagedItems(API.STOCKS_CHANGES,payload);return {...r,...sourceMeta('changesExecutor'),_query:full,_executorId:id,_executorName:full};
  }
  async function lookupChangesUniversal(query) {
    if(isLikelyCellAddress(query))return lookupByCellAddress(query,true);
    if(isLikelyHuBarcode(query))return lookupChangesByHuBarcode(query);
    const search=await searchProductsSmart(query);
    if(!search.items.length){const execs=filterExecutors(await fetchAllExecutors(),query);if(!execs.length)throw new Error('Товар и исполнитель не найдены: '+query);if(execs.length===1)return loadChangesByExecutor(execs[0]);return {...sourceMeta('changesChoices'),_kind:'executorChoices',_query:query,executors:execs};}
    if(search.items.length>1&&!search.exactSinglePreferred)return productChoices(search,query,'changesChoices');
    const found=search.items[0],id=found.id||found.productId||'';return {...await lookupChangesByProductId(id),_query:query,_productSearchResult:found};
  }

  async function lookupChangesCombined(cellQ,huQ,productQ,execQ,from,to) {
    const payload=baseChangesPayload();
    if(from)payload.operationStartedAtFrom=from;if(to)payload.operationStartedAtTo=to;
    if(cellQ){const cells=await searchCellsRaw(cellQ);if(cells.length!==1)throw new Error(cells.length?'Уточни ячейку: найдено '+cells.length:'Ячейка не найдена: '+cellQ);payload.sourceCellId=cells[0].id;payload.targetCellId=cells[0].id;}
    if(huQ){payload.sourceHandlingUnitBarcode=huQ;payload.targetHandlingUnitBarcode=huQ;}
    if(productQ){const s=await searchProductsSmart(cleanQuery(productQ));if(s.items.length!==1)throw new Error(s.items.length?'Уточни товар: найдено '+s.items.length:'Товар не найден: '+productQ);payload.productId=s.items[0].id||s.items[0].productId;}
    if(execQ){const e=filterExecutors(await fetchAllExecutors(),execQ);if(e.length!==1)throw new Error(e.length?'Уточни исполнителя: найдено '+e.length:'Исполнитель не найден: '+execQ);payload.executorId=e[0].id;}
    if(cellQ||huQ){
      const source={...payload,targetCellId:null,targetHandlingUnitBarcode:null};
      const target={...payload,sourceCellId:null,sourceHandlingUnitBarcode:null};
      const [a,b]=await Promise.all([fetchAllPagedItems(API.STOCKS_CHANGES,source),fetchAllPagedItems(API.STOCKS_CHANGES,target)]);
      return {...mergeChangeResponses(a,b),...sourceMeta('changesCombined'),_query:[cellQ,huQ,productQ,execQ].filter(Boolean).join(' · ')};
    }
    const r=await fetchAllPagedItems(API.STOCKS_CHANGES,payload);return {...r,...sourceMeta('changesCombined'),_query:[productQ,execQ].filter(Boolean).join(' · ')};
  }

  function recountReasons(filters) { const a=asArray(filters&&filters.reasons).map(x=>String(x||'').trim().toUpperCase()).filter(Boolean);if(!a.length&&filters&&filters.reason&&String(filters.reason).toUpperCase()!=='ALL')a.push(String(filters.reason).toUpperCase());return [...new Set(a)]; }
  async function lookupRecountingTasks(filters={}) {
    const p={pageSize:100,sortCompletedDate:'DESC'};const status=String(filters.status||'all');if(status&&status!=='all'&&status!=='DISCREPANCY')p.status=status;if(filters.executorId)p.executorId=filters.executorId;
    let out;
    try { out=await fetchAllGetPaged(API.RECOUNTING_TASKS,p,'reason',recountReasons(filters)); }
    catch(firstError){
      const statuses=['COMPLETED','AWAITING_CONFIRMATION','IN_PROGRESS','CREATED','REJECTED','DECLINED','CANCELLED','WITHOUT_REVIEW','COMPLETED_WITH_DISCREPANCY'];const map=new Map();let ok=0;
      for(const s of statuses){try{const part=await fetchAllGetPaged(API.RECOUNTING_TASKS,{...p,status:s},'reason',recountReasons(filters));ok++;responseItems(part).forEach((x,i)=>map.set(x.id||`${s}_${i}`,x));}catch(_){}}
      if(!ok)throw firstError;out={value:{items:[...map.values()],total:map.size},_allStatusesFallback:true,_loadedRows:map.size};
    }
    return {...out,...sourceMeta('recountingTasks'),_filters:filters};
  }
  async function lookupRecountingTaskDetails(ids) {
    const tasks=[],errors=[];for(const id of asArray(ids).slice(0,120)){if(!id)continue;try{const r=await getJson(API.RECOUNTING_TASKS+'/'+encodeURIComponent(id));const task=(r.value&&r.value.task)||r.task||r;tasks.push({...task,_loadedDetailId:id});}catch(e){errors.push({id,error:short(e.message,300)});}}
    return {...sourceMeta('recountingTaskDetails'),value:{tasks,errors,requested:asArray(ids).length,loaded:tasks.length}};
  }
  async function confirmRecount(payload) { const id=payload.taskId;if(!id)throw new Error('Не вижу taskId');const r=await postJson(API.RECOUNTING_TASKS+'/'+encodeURIComponent(id)+'/confirm',payload);return {...r,...sourceMeta('recountingDecision'),_taskId:id,_status:payload.status}; }

  async function fetchTopologyCells(requestId) {
    state.cancelRequested=false;const all=[];let page=1,total=0;
    while(page<=1000){if(state.cancelRequested)throw new Error('Остановлено пользователем');const u=new URL(API.TOPOLOGY_CELLS);u.searchParams.set('pageSize','100');u.searchParams.set('pageNumber',String(page));u.searchParams.set('sortCellAddress','ASC');const r=await getJson(u.toString());const items=responseItems(r);const v=r&&r.value;total=Math.max(total,Number(v&& (v.total||v.count) ||0));if(items.length){all.push(...items);progress(requestId,{items,total:total||all.length});}if(!items.length||items.length<100||(total&&all.length>=total))break;page++;}
    return {...sourceMeta('upperStorageCells'),value:{items:all,total:all.length},_allPages:true,_loadedRows:all.length};
  }
  async function lookupUpperStorageOccupancy(cells) {
    state.cancelRequested=false;const items=[],errors=[];let stopped=false,sessionExpired=false;
    for(const c of asArray(cells).slice(0,80)){if(state.cancelRequested){stopped=true;break;}const id=c.cellId||c.id||'',address=c.address||c.cellAddress||'',zoneName=c.zoneName||'';if(!id)continue;const one={cellId:id,address,zoneName};try{const r=await lookupStocksByCellId(id,address);const rows=responseItems(r);let qty=0;const hus=new Set();for(const x of rows){qty+=Number(x.quantity||x.totalQuantity||0);const a=x.address||{};const hu=a.handlingUnitBarcode||x.handlingUnitBarcode||'';if(hu)hus.add(hu);}items.push({...one,stockRows:rows.length,quantity:qty,huCount:hus.size,hasStock:qty>0||hus.size>0});}catch(e){const err={...one,stockRows:-1,quantity:0,huCount:0,hasError:true,error:short(e.message,300)};items.push(err);errors.push(err);if(/401|403|Servicepipe|не JSON/i.test(e.message)){sessionExpired=true;break;}}}
    return {...sourceMeta('upperStorageOccupancy'),value:{items,errors,requested:asArray(cells).length,loaded:items.length,stopped,sessionExpired}};
  }

  async function shipmentRoutes(from,to) {
    const payload={dateFrom:from,dateTo:to||null,status:null,availableForFreezeOnly:null,driverFirstName:null,driverLastName:null,driverMiddleName:null,gateId:null,handlingUnitBarcode:null,pageNumber:1,pageSize:100,routeNumber:null,shipToId:null,temperatureMode:['LOW_COLD','MEDIUM_COLD','ORDINARY'],vehicleNumber:null};
    const summary=await postJson(API.SHIPMENT_ROUTES,payload);let list=responseItems(summary);if(!list.length&&summary.value&&typeof summary.value==='object'&&!Array.isArray(summary.value)&&(summary.value.id||summary.value.routeNumber))list=[summary.value];const routes=[];
    for(const s of list.slice(0,120)){const id=s&&s.id;if(!id){routes.push(s);continue;}try{const d=await getJson(API.SHIPMENT_ROUTES+'/'+encodeURIComponent(id));routes.push((d&&d.value)||s);}catch(_){routes.push(s);}}
    return {...sourceMeta('shipmentRoutes'),routes,total:routes.length,_raw:routes.length?'':short(JSON.stringify(summary),4000)};
  }
  function bytesToBase64(bytes) { let binary='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(binary); }
  async function binaryResult(url,method='GET',body) { const r=await apiRequest(url,{method,body,binary:true});const looksPdf=r.bytes.length>=4&&r.bytes[0]===37&&r.bytes[1]===80&&r.bytes[2]===68&&r.bytes[3]===70;const out={status:r.status,contentType:r.contentType,length:r.bytes.length,isPdf:looksPdf};if(/json/i.test(r.contentType)&&!looksPdf){try{out.json=JSON.parse(r.text);}catch(_){out.bodyText=short(r.text,8000);}}else out.base64=bytesToBase64(r.bytes);return out; }

  const handlers = {
    async getLastWmsDiagnostic(){ return state.lastDiagnostic; },
    async checkWmsAuth(){
      refreshAuthFromStorage();let ping=false,debug='';try{await getJson(API.SESSION_PING);ping=true;}catch(e){debug=e.message;}
      return {hasAuth:ping||!!state.authorization||!!state.xAuthToken,hasBearer:!!state.authorization,hasXAuth:!!state.xAuthToken,hasCookie:!!document.cookie,href:location.href,debug};
    },
    async lookupWmsByCode(code){return lookupUniversal(cleanQuery(code));},
    async lookupWmsByProductId(id){return lookupStocksByProductId(String(id||'').trim());},
    async lookupWmsByCellId(id,address){return lookupStocksByCellId(String(id||'').trim(),String(address||''));},
    async lookupWmsChangesByCode(code){return lookupChangesUniversal(cleanQuery(code));},
    async lookupWmsChangesByProductId(id){return lookupChangesByProductId(String(id||'').trim());},
    async lookupWmsChangesByCellId(id,address){return lookupChangesByCellId(String(id||'').trim(),String(address||''));},
    async lookupWmsChangesForExecutor(id,name,from,to){return loadChangesByExecutor({id,lastName:name},from,to);},
    async lookupWmsActivityInProgress(){return {...await getJson(API.ACTIVITY_PROGRESS),...sourceMeta('activityInProgress')};},
    async lookupWmsActivityStats(from,to){const u=new URL(API.ACTIVITY_STATS);if(from)u.searchParams.set('createdAtFrom',from);if(to)u.searchParams.set('createdAtTo',to);return {...await getJson(u.toString()),...sourceMeta('activityStats')};},
    async createWmsHandlingUnits(qty,type){const q=Math.max(1,Math.min(200,Number(qty)||1));return {...await postJson(API.HANDLING_UNITS,{quantity:q,type:type||'EUR'}),...sourceMeta('handlingUnitsCreated')};},
    async lookupWmsChangesByDateRange(from,to){const p=baseChangesPayload();if(from)p.operationStartedAtFrom=from;if(to)p.operationStartedAtTo=to;return {...await fetchAllPagedItems(API.STOCKS_CHANGES,p),...sourceMeta('changesDateRange'),_query:'за период'};},
    async lookupWmsExecutorChanges(lastName,from,to){const e=filterExecutors(await fetchAllExecutors(),lastName);if(!e.length)throw new Error('Исполнитель не найден: '+lastName);if(e.length===1)return loadChangesByExecutor(e[0],from,to);return {...sourceMeta('changesChoices'),_kind:'executorChoices',_query:lastName,executors:e};},
    async lookupWmsChangesExecutors(lastName){const executors=filterExecutors(await fetchAllExecutors(),lastName);return {...sourceMeta('changesExecutors'),executors,query:lastName||''};},
    async lookupWmsChangesCombined(cell,hu,product,executor,from,to){return lookupChangesCombined(cell,hu,product,executor,from,to);},
    async lookupWmsUpperStorageCells(_filters,requestId){return fetchTopologyCells(requestId);},
    async lookupWmsUpperStorageOccupancy(cellsJson){return lookupUpperStorageOccupancy(JSON.parse(cellsJson||'[]'));},
    async lookupWmsDailyStorageLosses(filtersJson){const f=JSON.parse(filtersJson||'{}');const p={...baseChangesPayload(),operationStartedAtFrom:f.from,operationStartedAtTo:f.to};if(String(f.kind||'').toLowerCase()==='writeoff')p.operationTypes=['DEFECTIVE_STOCK_WRITE_OFF'];return {...await fetchAllPagedItems(API.STOCKS_CHANGES,p),...sourceMeta('changesStorageLosses'),_filters:f};},
    async lookupWmsRecountingTasks(filtersJson){return lookupRecountingTasks(JSON.parse(filtersJson||'{}'));},
    async lookupWmsRecountingTaskDetails(idsJson){return lookupRecountingTaskDetails(JSON.parse(idsJson||'[]'));},
    async confirmWmsRecountingTask(payloadJson){return confirmRecount(JSON.parse(payloadJson||'{}'));},
    async lookupWmsObservedPicking(){return {...sourceMeta('observedPicking'),value:{items:[],total:0},note:'Расширение не использует перехват открытых заказов; применяй режим резерва ячейки.'};},
    async clearWmsObservedPicking(){state.observedPickingUrls.clear();return {ok:true};},
    async lookupWmsShipmentRoutes(from,to){return shipmentRoutes(from,to);},
    async lookupWmsPackagingList(routeId){return {...sourceMeta('packagingList'),...await binaryResult(API.SHIPMENT_ROUTES+'/'+encodeURIComponent(routeId)+'/PACKAGING_LIST')};},
    async lookupWmsCellLabels(cellId){return {...sourceMeta('cellLabel'),...await binaryResult(API.CELL_LABELS,'POST',{ids:[cellId]})};},
    async lookupWmsCellSearch(address){return searchCellsByAddress(String(address||'').trim());},
    async printBarcodeLabel(){throw new Error('Прямая TCP-печать на TSC доступна только в Android-wrapper. В браузере открой PDF/ШК и печатай системным диалогом.');},
    async checkForUpdate(){return {available:false,currentVersion:'browser-extension-1.0.0',message:'Расширение обновляется отдельно от APK.'};},
    async downloadAndInstallUpdate(){throw new Error('Установка APK доступна только на Android.');}
  };

  async function execute(requestId, method, args) {
    const fn = handlers[method];
    if (!fn) throw new Error('Метод не реализован расширением: '+method);
    if (method !== 'lookupWmsUpperStorageCells') return fn(...(args||[]));
    return fn((args||[])[0],requestId);
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== 'lenfer-extension-content') return;
    if (msg.type === 'cancel') { state.cancelRequested = true; return; }
    if (msg.type !== 'request') return;
    state.cancelRequested = false;
    try { post('resolve', msg.requestId, {payload: await execute(msg.requestId, msg.method, msg.args)}); }
    catch (e) { post('reject', msg.requestId, {message:(e&&e.message)||String(e)}); }
  });
})();
