// Lenfer WMS proxy — даёт браузерной PWA то же самое, что LenferAndroidWms
// делает нативно в Android: ищет товар/ячейку/ШК в ВМС (wwh.samokat.ru /
// api.samokat.ru) и возвращает остатки. Логика поиска (варианты запроса,
// скоринг совпадений, порядок эндпоинтов) — честный порт из MainActivity.java
// того же репозитория (Warehouse-1), чтобы поведение не отличалось от APK.
//
// Токен НЕ хранится на диске — только в памяти процесса, с TTL. Каждый
// сотрудник логинится в ВМС сам (см. bookmarklet.js) — сервер не знает и не
// хранит ничьих паролей, только уже выданный ВМС bearer-токен, временно.

'use strict';

const express = require('express');
const crypto = require('crypto');

const PORT = process.env.PORT || 8787;
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 12 * 60 * 60 * 1000); // 12 часов
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// Домен ВМС всегда разрешён для приёма токена от букмарклета, вне зависимости
// от ALLOWED_ORIGINS (это не PWA, а сама wwh.samokat.ru, шлёт нам токен).
const WMS_ORIGIN = 'https://wwh.samokat.ru';

const WMS = {
  PRODUCTS_SEARCH_URL: 'https://api.samokat.ru/wmsops-wwh/products/search',
  STOCKS_DETAILS_URL: 'https://api.samokat.ru/wmsops-wwh/stocks/details',
  CELL_ADDRESS_SEARCH_URL: 'https://api.samokat.ru/wmsops-wwh/topology/cells/filters/by-address-search',
};

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Токены сессий, только в памяти процесса ──
/** @type {Map<string, {authorization:string, xAuthToken:string, cookieHeader:string, createdAt:number, lastUsedAt:number, owner:string}>} */
const sessions = new Map();

function cleanupSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastUsedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}
setInterval(cleanupSessions, 15 * 60 * 1000).unref();

function requireSession(req, res, next) {
  const id = req.get('x-lenfer-session') || req.query.session;
  const s = id && sessions.get(String(id));
  if (!s) {
    res.status(401).json({ error: 'Нет активной сессии ВМС. Заново нажми букмарклет на wwh.samokat.ru.' });
    return;
  }
  s.lastUsedAt = Date.now();
  req.wmsAuth = s;
  next();
}

// ── CORS ──
function corsMiddleware(req, res, next) {
  const origin = req.get('origin') || '';
  if (origin === WMS_ORIGIN || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-lenfer-session');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

// ── Низкоуровневые вызовы ВМС (те же заголовки, что в Android postJson/getJson) ──
async function wmsFetch(url, { method = 'GET', body, auth }) {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    Origin: WMS_ORIGIN,
    Referer: WMS_ORIGIN + '/',
    'User-Agent': USER_AGENT,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json;charset=UTF-8';
  if (auth.authorization) headers.Authorization = auth.authorization;
  if (auth.xAuthToken) headers['x-auth-token'] = auth.xAuthToken;
  if (auth.cookieHeader) headers.Cookie = auth.cookieHeader;

  const resp = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  if (resp.status >= 400) {
    throw new Error(`ВМС ответила ${resp.status}: ${text.slice(0, 300)}`);
  }
  if (!text || !text.trim()) throw new Error('Пустой ответ ВМС');
  const trimmed = text.trim();
  if (trimmed[0] !== '{' && trimmed[0] !== '[') {
    throw new Error('ВМС вернула не JSON (похоже, сессия истекла — обнови токен букмарклетом)');
  }
  return JSON.parse(text);
}

function postJson(url, payload, auth) {
  return wmsFetch(url, { method: 'POST', body: payload, auth });
}
function getJson(url, auth) {
  return wmsFetch(url, { method: 'GET', auth });
}

async function fetchAllPagedItems(url, basePayload, auth) {
  const maxPages = 50;
  const pageSize = Math.max(1, (basePayload && basePayload.pageSize) || 100);
  const all = [];
  let reportedTotal = 0;
  let firstResponse = null;

  for (let page = 1; page <= maxPages; page++) {
    const payload = { ...basePayload, pageNumber: page, pageSize };
    const resp = await postJson(url, payload, auth);
    if (!firstResponse) firstResponse = resp;

    const value = resp && resp.value;
    const items = value && value.items;
    const total = (value && value.total) || 0;
    if (total > reportedTotal) reportedTotal = total;

    if (!items || !items.length) {
      if (page === 1 && firstResponse) return firstResponse;
      break;
    }
    all.push(...items);
    if (total > 0 && all.length >= total) break;
    if (items.length < pageSize) break;
  }

  return { value: { items: all, total: reportedTotal || all.length }, _allPages: true, _loadedRows: all.length };
}

function baseStocksPayload() {
  return {
    productId: null,
    parts: null,
    statuses: null,
    cellId: null,
    handlingUnitBarcode: null,
    levels: null,
    locationIds: null,
    owner: null,
    pageNumber: 1,
    pageSize: 100,
    rows: null,
    sections: null,
    sortByQuantity: null,
    zoneIds: null,
  };
}

// ── Разбор и скоринг поискового запроса — 1:1 порт из MainActivity.java ──
function cleanQuery(code) {
  if (!code) return '';
  let s = String(code).trim().replace(/\s+/g, ' ').trim();
  s = s.replace(/^ut[-\s]?/i, 'УТ-');
  s = s.replace(/^ут[-\s]?/iu, 'УТ-');
  if (/^[0-9]{5,8}$/.test(s)) s = 'УТ-' + s;
  return s.trim();
}
function isUtCode(q) {
  return !!q && /^УТ-?\d{3,}.*$/.test(String(q).trim().toUpperCase());
}
function isLikelyCellAddress(q) {
  if (!q) return false;
  const s = String(q).trim().toUpperCase();
  if (s.startsWith('УТ-')) return false;
  if (s.includes(' ')) return false;
  if (/^[0-9]+$/.test(s)) return false;
  if (s.includes('-') && /^[A-ZА-Я0-9]{1,8}-[A-ZА-Я0-9-]{1,32}$/.test(s)) return true;
  return /^(HH|SH)[A-ZА-Я0-9-]*$/.test(s) || /^[A-ZА-Я]{1,4}[0-9]{1,4}[A-ZА-Я]?$/.test(s) || /^[0-9]{2,4}[A-ZА-Я]{1,3}$/.test(s);
}
function isLikelyHuBarcode(q) {
  return !!q && /^0[0-9]{11}$/.test(String(q).trim());
}
function normalizeSearchText(s) {
  if (!s) return '';
  let x = String(s).toLowerCase().replace(/ё/g, 'е').replace(/Ё/g, 'е').replace(/[’`]/g, "'");
  x = x.replace(/[^a-zа-я0-9]+/g, ' ');
  return x.replace(/\s+/g, ' ').trim();
}
function searchTokens(query) {
  const norm = normalizeSearchText(query);
  if (!norm) return [];
  const out = [];
  for (let t of norm.split(' ')) {
    t = t.trim();
    if (!t) continue;
    if (t.length < 2 && !/^[0-9]+$/.test(t)) continue;
    if (t === 'самокат' || t === 'арт' || t === 'шт') continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}
function productSearchVariants(query) {
  const variants = [];
  const original = (query || '').trim();
  const norm = normalizeSearchText(original);
  if (original) variants.push(original);
  if (norm && !variants.includes(norm)) variants.push(norm);
  const tokens = searchTokens(original);
  if (tokens.length > 1) {
    const joined = tokens.join(' ');
    if (!variants.includes(joined)) variants.push(joined);
    const edge = tokens[0] + ' ' + tokens[tokens.length - 1];
    if (!variants.includes(edge)) variants.push(edge);
  }
  let longest = '';
  for (const t of tokens) if (t.length > longest.length) longest = t;
  if (longest.length >= 4 && !variants.includes(longest)) variants.push(longest);
  return variants.slice(0, 5);
}
function productSearchPayload(type, value) {
  const productFilter = { type };
  if (type === 'PRODUCT_NOMENCLATURE_CODE') productFilter.nomenclatureCode = value;
  else productFilter.name = value;
  return { productFilter, pageSize: 30, pageNumber: 1 };
}
function productScore(query, item) {
  const q = normalizeSearchText(query);
  const name = normalizeSearchText(item.productName || item.name || '');
  const code = normalizeSearchText(item.nomenclatureCode || '');
  const tokens = searchTokens(query);
  let score = 0;
  if (q) {
    if (name === q || code === q) score += 500;
    if (name.includes(q)) score += 120;
    if (code.includes(q.replace('ут ', ''))) score += 160;
  }
  let matched = 0;
  for (const t of tokens) {
    const hit = name.includes(t) || code.includes(t);
    if (hit) {
      matched++;
      score += /^[0-9]+$/.test(t) ? 28 : 14;
      if (new RegExp('(^| )' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(name)) score += 4;
    }
  }
  if (tokens.length && matched === tokens.length) score += 80;
  if (tokens.length) score += matched * 5;
  return score;
}

async function searchProductsSmart(query, auth) {
  const byId = new Map();
  let reportedTotal = 0;
  let exactSinglePreferred = false;

  if (isUtCode(query)) {
    const ut = query.toUpperCase();
    const resp = await postJson(WMS.PRODUCTS_SEARCH_URL, productSearchPayload('PRODUCT_NOMENCLATURE_CODE', ut), auth);
    const data = resp && resp.value && resp.value.data;
    reportedTotal = (resp && resp.value && resp.value.total) || (data ? data.length : 0);
    (data || []).forEach((item, i) => {
      if (!item) return;
      item._matchScore = productScore(query, item) + 1000;
      item._matchVariant = ut;
      byId.set(item.id || 'item_' + i, item);
    });
    exactSinglePreferred = byId.size === 1;
  } else {
    for (const variant of productSearchVariants(query)) {
      if (!variant.trim()) continue;
      const resp = await postJson(WMS.PRODUCTS_SEARCH_URL, productSearchPayload('PRODUCT_NAME', variant), auth);
      const data = resp && resp.value && resp.value.data;
      if (resp && resp.value) reportedTotal = Math.max(reportedTotal, resp.value.total || (data ? data.length : 0));
      if (!data) continue;
      data.forEach((item, i) => {
        if (!item) return;
        const id = item.id || item.productId || `item_${i}_${variant}`;
        const score = productScore(query, item);
        const existing = byId.get(id);
        if (!existing || score > (existing._matchScore || 0)) {
          item._matchScore = score;
          item._matchVariant = variant;
          byId.set(id, item);
        }
      });
      if (byId.size >= 30) break;
    }
  }

  const sorted = [...byId.values()].sort((a, b) => (b._matchScore || 0) - (a._matchScore || 0));
  if (sorted.length === 1) exactSinglePreferred = true;
  return { items: sorted, total: reportedTotal || sorted.length, exactSinglePreferred };
}

async function lookupStocksByProductId(productId, auth) {
  const payload = { ...baseStocksPayload(), productId, cellId: null };
  const resp = await fetchAllPagedItems(WMS.STOCKS_DETAILS_URL, payload, auth);
  resp._mode = 'product';
  resp._productId = productId;
  return resp;
}
async function lookupStocksByCellId(cellId, fullAddress, auth) {
  const payload = { ...baseStocksPayload(), productId: null, cellId };
  const resp = await fetchAllPagedItems(WMS.STOCKS_DETAILS_URL, payload, auth);
  resp._mode = 'cell';
  resp._cellId = cellId;
  resp._cellAddress = fullAddress || '';
  return resp;
}
async function lookupStocksByHuBarcode(hu, auth) {
  const payload = { ...baseStocksPayload(), productId: null, cellId: null, handlingUnitBarcode: hu };
  const resp = await fetchAllPagedItems(WMS.STOCKS_DETAILS_URL, payload, auth);
  resp._mode = 'hu';
  resp._query = hu;
  resp._hu = hu;
  return resp;
}
async function lookupByCellAddress(address, auth) {
  const url = WMS.CELL_ADDRESS_SEARCH_URL + '?cellAddressSearch=' + encodeURIComponent(address);
  const resp = await getJson(url, auth);
  const cells = resp && resp.value && resp.value.cells;
  if (!cells || !cells.length) throw new Error('Ячейка не найдена: ' + address);
  if (cells.length > 1) {
    return {
      _kind: 'cellChoices',
      _query: address,
      cells: cells.map((c) => ({ cellId: c.id || '', fullAddress: c.fullAddress || c.address || '' })),
    };
  }
  const cell = cells[0];
  const cellId = cell.id || '';
  if (!cellId) throw new Error('В ответе поиска ячейки нет cellId');
  return lookupStocksByCellId(cellId, cell.fullAddress || address, auth);
}

async function lookupUniversal(query, auth) {
  if (isLikelyCellAddress(query)) return lookupByCellAddress(query, auth);
  if (isLikelyHuBarcode(query)) return lookupStocksByHuBarcode(query, auth);

  const search = await searchProductsSmart(query, auth);
  if (!search.items.length) throw new Error('Товар не найден: ' + query);

  if (search.items.length > 1 && !search.exactSinglePreferred) {
    return { _kind: 'productChoices', _query: query, items: search.items, total: search.total };
  }

  const found = search.items[0];
  const productId = found.id || found.productId || '';
  if (!productId) throw new Error('В ответе products/search нет productId');

  const stockResp = await lookupStocksByProductId(productId, auth);
  stockResp._searchedCode = query;
  stockResp._productSearchResult = found;
  return stockResp;
}

// ── HTTP-приложение ──
const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(corsMiddleware);

app.get('/health', (req, res) => res.json({ ok: true }));

// Букмарклет шлёт сюда токен, извлечённый на wwh.samokat.ru.
app.post('/api/wms/token', (req, res) => {
  const { authorization, xAuthToken, cookieHeader, owner } = req.body || {};
  if (!authorization && !xAuthToken) {
    res.status(400).json({ error: 'Не вижу ни Authorization, ни x-auth-token — букмарклет не нашёл токен.' });
    return;
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  sessions.set(id, {
    authorization: authorization || '',
    xAuthToken: xAuthToken || '',
    cookieHeader: cookieHeader || '',
    createdAt: now,
    lastUsedAt: now,
    owner: String(owner || '').slice(0, 120),
  });
  res.json({ sessionId: id, expiresInMs: SESSION_TTL_MS });
});

app.get('/api/wms/whoami', requireSession, (req, res) => {
  res.json({ owner: req.wmsAuth.owner, createdAt: req.wmsAuth.createdAt });
});

app.post('/api/wms/logout', requireSession, (req, res) => {
  const id = req.get('x-lenfer-session') || req.query.session;
  sessions.delete(String(id));
  res.json({ ok: true });
});

app.get('/api/wms/search', requireSession, async (req, res) => {
  const query = cleanQuery(req.query.q || '');
  if (!query) {
    res.status(400).json({ error: 'Введи УТ, ШК, название или ячейку' });
    return;
  }
  try {
    const result = await lookupUniversal(query, req.wmsAuth);
    res.json({ ok: true, ...result, _source: 'wms-proxy' });
  } catch (e) {
    res.status(502).json({ error: (e && e.message) || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`Lenfer WMS proxy listening on :${PORT}`);
});
