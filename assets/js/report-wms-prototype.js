/* Lenfer v57 — WMS recounting → Report prototype
   Uses the existing Android bridge: lookupWmsRecountingTasks.
   No WMS credentials/tokens enter this file or Yandex AI proxy. */
(function () {
  'use strict';

  const REPORT_WMS_TASKS = {
    taskCold: 'Пересчет мест хранения по заданиям на пересчет (Холод)',
    taskDry: 'Пересчет мест хранения по заданиям на пересчет (Сухой)',
    planCold: 'Плановый пересчет хранения (Холод)',
    planDry: 'Плановый пересчет хранения (Сухой)'
  };

  let reportWmsLast = null;
  let reportWmsAiBusy = false;

  function esc(value) {
    if (typeof window.escHtml === 'function') return window.escHtml(value);
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function isoToday() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function reportWmsDate() {
    const el = document.getElementById('report-wms-date');
    return (el && String(el.value || '').trim()) || isoToday();
  }

  function setReportWmsStatus(text, state) {
    const el = document.getElementById('report-wms-status');
    if (!el) return;
    el.style.color = state === 'err' ? 'var(--red-bright)' : (state === 'ok' ? 'var(--gold)' : 'var(--muted)');
    el.textContent = text;
  }

  function zoneGroup(row) {
    const zone = String((row && row.zoneName) || '').toLowerCase();
    const cell = String((row && row.cellAddress) || '').toUpperCase();
    if (zone.includes('холод') || cell.startsWith('HH-')) return 'Холод';
    if (zone.includes('сух') || cell.startsWith('SH-')) return 'Сухой';
    return 'Другое';
  }

  function isPlannedRecount(row) {
    return String((row && row.scope) || '').toUpperCase() === 'FULL' &&
      String((row && row.reason) || '').toUpperCase() === 'CREATED_ON_PDT';
  }

  function taskDate(row) {
    if (typeof window.wmsDateIsoDay === 'function') return window.wmsDateIsoDay((row && (row.completedAt || row.createdAt)) || '');
    return String((row && (row.completedAt || row.createdAt)) || '').slice(0, 10);
  }

  function emptyBucket() {
    return { 'Холод': 0, 'Сухой': 0, 'Другое': 0, rows: [] };
  }

  function summarizeRows(rows, date) {
    const planned = emptyBucket();
    const byTasks = emptyBucket();
    const excluded = [];

    (rows || []).forEach((row) => {
      if (String(row.status || '').toUpperCase() !== 'COMPLETED') return;
      if (taskDate(row) !== date) return;
      const bucket = isPlannedRecount(row) ? planned : byTasks;
      const zone = zoneGroup(row);
      bucket[zone] += 1;
      bucket.rows.push(row);
      if (zone === 'Другое') excluded.push(row);
    });

    return {
      date,
      total: planned.rows.length + byTasks.rows.length,
      planned,
      byTasks,
      otherZone: excluded,
      definition: {
        planned: 'Полный пересчёт (FULL) с причиной CREATED_ON_PDT',
        byTasks: 'Остальные завершённые задания пересчёта'
      }
    };
  }

  function resultLine(label, bucket) {
    const total = bucket.rows.length;
    return '<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:7px;align-items:center;padding:9px 0;border-bottom:1px solid var(--border);font-size:12px;">' +
      '<b style="color:var(--text);">' + esc(label) + '</b>' +
      '<span title="Холод" style="color:var(--muted);">Х: <b style="color:var(--gold);">' + esc(bucket['Холод']) + '</b></span>' +
      '<span title="Сухой" style="color:var(--muted);">С: <b style="color:var(--gold);">' + esc(bucket['Сухой']) + '</b></span>' +
      '<span style="font-family:\'JetBrains Mono\',monospace;color:var(--text);">' + esc(total) + '</span>' +
      '</div>';
  }

  function snapshotFromStats(stats) {
    const appliedCounts = {};
    appliedCounts[REPORT_WMS_TASKS.taskCold] = stats.byTasks['Холод'];
    appliedCounts[REPORT_WMS_TASKS.taskDry] = stats.byTasks['Сухой'];
    appliedCounts[REPORT_WMS_TASKS.planCold] = stats.planned['Холод'];
    appliedCounts[REPORT_WMS_TASKS.planDry] = stats.planned['Сухой'];
    return {
      version: 1,
      source: 'WMS / recounting/tasks',
      date: stats.date,
      fetchedAt: new Date().toISOString(),
      definition: stats.definition,
      totalTasks: stats.total,
      planned: { cold: stats.planned['Холод'], dry: stats.planned['Сухой'], other: stats.planned['Другое'], total: stats.planned.rows.length },
      byTasks: { cold: stats.byTasks['Холод'], dry: stats.byTasks['Сухой'], other: stats.byTasks['Другое'], total: stats.byTasks.rows.length },
      otherZoneCount: stats.otherZone.length,
      appliedCounts
    };
  }

  function reportWmsRender(stats) {
    const box = document.getElementById('report-wms-result');
    if (!box) return;
    if (!stats) {
      box.innerHTML = '';
      return;
    }
    const unknown = stats.otherZone.length
      ? '<div style="font-size:11px;color:var(--red-bright);margin-top:8px;line-height:1.35;">Не записано в строки «Холод/Сухой»: ' + esc(stats.otherZone.length) + ' заданий без понятной зоны.</div>'
      : '';
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px;">' +
        '<b style="font-size:13px;color:var(--text);">Задания WMS за ' + esc(stats.date.split('-').reverse().join('.')) + '</b>' +
        '<span style="font-family:\'JetBrains Mono\',monospace;color:var(--gold);">' + esc(stats.total) + '</span>' +
      '</div>' +
      resultLine('Пересчёт по заданиям', stats.byTasks) +
      resultLine('Плановый пересчёт', stats.planned) +
      '<div style="font-size:10px;color:var(--muted);line-height:1.35;margin-top:9px;">Плановый: ' + esc(stats.definition.planned) + '. По заданиям: ' + esc(stats.definition.byTasks) + '.</div>' +
      unknown +
      '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:11px;">' +
        '<button class="exi-btn primary" onclick="reportWmsApply()">Записать в отчёт</button>' +
        '<button class="exi-btn" onclick="reportWmsAiSummary()">ИИ-сводка</button>' +
      '</div>' +
      '<div id="report-wms-ai-answer" style="display:none;margin-top:10px;padding:10px;border-radius:8px;background:var(--bg2);font-size:12px;line-height:1.42;color:var(--text);"></div>';
  }

  function ensureDayForDate(date) {
    const all = typeof window.getReportAll === 'function' ? window.getReportAll() : {};
    if (!all[date]) {
      const defaults = (window.REPORT_DEFAULT_TASKS || []).map((name) => ({ name, qty: 0 }));
      all[date] = typeof window.normalizeReportDay === 'function' ? window.normalizeReportDay({ tasks: defaults }) : { tasks: defaults };
    } else if (typeof window.normalizeReportDay === 'function') {
      all[date] = window.normalizeReportDay(all[date]);
    }
    return { all, day: all[date] };
  }

  function saveDayForDate(date, all, day) {
    all[date] = day;
    localStorage.setItem('report', JSON.stringify(all));
  }

  function formatText(text) {
    return esc(String(text || '')).replace(/\n/g, '<br>');
  }

  async function askAi(action, data) {
    if (typeof window.wmsGetFirebaseToken !== 'function') throw new Error('Firebase-авторизация ещё не готова. Открой приложение заново.');
    const token = await window.wmsGetFirebaseToken(false);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 70000);
    try {
      const response = await fetch(window.WAREHOUSE_AI_URL || 'https://functions.yandexcloud.net/d4eouqic8u5nntn17at2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Firebase-Token': token },
        body: JSON.stringify({ action, data }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || ('ИИ-сервис вернул ' + response.status));
      if (!payload.answer) throw new Error('ИИ-сервис не вернул ответ');
      return payload.answer;
    } finally {
      clearTimeout(timer);
    }
  }

  window.reportWmsLoad = async function () {
    const date = reportWmsDate();
    setReportWmsStatus('Подтягиваю завершённые задания из WMS…', 'wait');
    reportWmsLast = null;
    try {
      if (typeof window.wmsCallNative !== 'function' || typeof window.wmsNormalizeRecountingResult !== 'function') {
        throw new Error('Автоподтягивание доступно в Android-обёртке после входа в WMS.');
      }
      const raw = await window.wmsCallNative('lookupWmsRecountingTasks', [JSON.stringify({ status: 'COMPLETED' })], 45000);
      const normalized = window.wmsNormalizeRecountingResult(raw);
      const stats = summarizeRows(normalized.rows || [], date);
      reportWmsLast = { stats, rawTotal: normalized.totalRows || 0 };
      reportWmsRender(stats);
      setReportWmsStatus('WMS: найдено ' + stats.total + ' завершённых заданий за дату. Проверь раскладку и запиши в отчёт.', 'ok');
    } catch (error) {
      const message = (error && error.message) || String(error);
      reportWmsRender(null);
      setReportWmsStatus('Не удалось подтянуть WMS: ' + message, 'err');
    }
  };

  window.reportWmsApply = function () {
    if (!reportWmsLast || !reportWmsLast.stats) {
      setReportWmsStatus('Сначала подтяни задания из WMS.', 'err');
      return;
    }
    const stats = reportWmsLast.stats;
    const snapshot = snapshotFromStats(stats);
    const data = ensureDayForDate(stats.date);
    const day = data.day;
    const applied = snapshot.appliedCounts;
    (day.tasks || []).forEach((task) => {
      if (Object.prototype.hasOwnProperty.call(applied, task.name)) task.qty = Number(applied[task.name]) || 0;
    });
    day.wmsRecounting = snapshot;
    saveDayForDate(stats.date, data.all, day);

    if (stats.date === isoToday() && typeof window.renderReport === 'function') window.renderReport();
    setReportWmsStatus('WMS-значения записаны в отчёт за ' + stats.date.split('-').reverse().join('.') + '.', 'ok');
  };

  window.reportWmsAiSummary = async function () {
    if (reportWmsAiBusy) return;
    if (!reportWmsLast || !reportWmsLast.stats) {
      setReportWmsStatus('Сначала подтяни задания из WMS.', 'err');
      return;
    }
    const answerBox = document.getElementById('report-wms-ai-answer');
    if (answerBox) {
      answerBox.style.display = 'block';
      answerBox.innerHTML = '<span style="color:var(--muted);">ИИ собирает сводку…</span>';
    }
    reportWmsAiBusy = true;
    try {
      const s = reportWmsLast.stats;
      const data = {
        kind: 'report_wms_recounting_prototype',
        date: s.date,
        definitions: s.definition,
        tasks: {
          recountingByTasks: { cold: s.byTasks['Холод'], dry: s.byTasks['Сухой'], other: s.byTasks['Другое'], total: s.byTasks.rows.length },
          plannedRecounting: { cold: s.planned['Холод'], dry: s.planned['Сухой'], other: s.planned['Другое'], total: s.planned.rows.length }
        },
        totalCompletedTasks: s.total,
        note: 'Это агрегированная сводка WMS. ФИО исполнителей и токены WMS не передаются.'
      };
      const answer = await askAi('shift_summary', data);
      if (answerBox) answerBox.innerHTML = '<b style="display:block;color:var(--gold);margin-bottom:5px;">ИИ-сводка</b>' + formatText(answer);
      setReportWmsStatus('ИИ-сводка готова.', 'ok');
    } catch (error) {
      const message = (error && error.name === 'AbortError') ? 'ИИ не ответил за 70 секунд.' : ((error && error.message) || String(error));
      if (answerBox) answerBox.innerHTML = '<b style="color:var(--red-bright);">ИИ-сводка не выполнена</b><br>' + formatText(message);
      setReportWmsStatus('ИИ-сводка не выполнена: ' + message, 'err');
    } finally {
      reportWmsAiBusy = false;
    }
  };

  // Export report with a source column: manual vs WMS snapshot.
  window.reportExportTSV = function () {
    const date = typeof window.todayKey === 'function' ? window.todayKey() : isoToday();
    const all = typeof window.getReportAll === 'function' ? window.getReportAll() : {};
    const day = all[date] || (typeof window.ensureReportToday === 'function' ? window.ensureReportToday() : { tasks: [] });
    const applied = (day.wmsRecounting && day.wmsRecounting.appliedCounts) || {};
    const rows = [['Дата', 'Задача', 'Кол-во', 'Источник']];
    (day.tasks || []).forEach((task, index) => {
      const source = Object.prototype.hasOwnProperty.call(applied, task.name) ? 'WMS' : 'вручную';
      rows.push([index === 0 ? date.split('-').reverse().join('.') : '', task.name || '', Number(task.qty) || 0, source]);
    });
    return rows.map((row) => row.map((v) => String(v == null ? '' : v).replace(/\t/g, ' ').replace(/\r?\n/g, ' ')).join('\t')).join('\n');
  };

  window.copyReportTSV = function () {
    const text = window.reportExportTSV();
    const ok = () => { try { alert('TSV отчёта скопирован. WMS-строки помечены отдельным источником.'); } catch (e) {} };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(() => {
        const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); ok();
      });
    } else {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); ok();
    }
  };

  function init() {
    const el = document.getElementById('report-wms-date');
    if (el && !el.value) el.value = isoToday();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
