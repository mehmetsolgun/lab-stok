/**
 * Lab Stok Takip — Google E-Tablo arka ucu.
 *
 * Bu dosya, veritabanı olarak kullanacağınız E-Tablonun içindeki Apps Script
 * projesine yapıştırılır (bkz. KURULUM.md). Uygulama bu web uygulamasıyla
 * konuşur; üyelerin Google hesabıyla giriş yapmasına gerek kalmaz.
 * Her istekte laboratuvar erişim anahtarı (ACCESS_KEY) doğrulanır.
 */

var TABLES = { items: 'Items', bottles: 'Bottles', primers: 'Primers', log: 'Log' };
var META = 'Meta';
var BULK_LIMIT = 40; // bu kadardan fazla satır değişirse tabloyu toptan yeniden yaz

// ---------- kurulum (tek seferlik, elle çalıştırılır) ----------

function setup() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('ACCESS_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('ACCESS_KEY', key);
  }
  if (!props.getProperty('VERSION')) props.setProperty('VERSION', '0');
  Object.keys(TABLES).forEach(function (k) { sheet_(TABLES[k]); });
  sheet_(META);
  Logger.log('LAB ERİŞİM ANAHTARI: ' + key);
  return key;
}

/** Anahtarı unuttuysanız bunu çalıştırıp Yürütme günlüğüne bakın. */
function showKey() {
  Logger.log('LAB ERİŞİM ANAHTARI: ' + PropertiesService.getScriptProperties().getProperty('ACCESS_KEY'));
}

/** Anahtarı değiştirmek (eski linkleri geçersiz kılmak) için. */
function resetKey() {
  var key = Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('ACCESS_KEY', key);
  Logger.log('YENİ ANAHTAR: ' + key);
  return key;
}

// ---------- web uygulaması ----------

function doGet() {
  return ContentService.createTextOutput('Lab Stok API çalışıyor.');
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    var expected = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
    if (!expected) throw new Error('Kurulum yapılmamış: setup() fonksiyonunu çalıştırın.');
    if (!req.key || req.key !== expected) throw new Error('Erişim anahtarı geçersiz.');
    if (req.action === 'ping') out = { ok: true, version: version_() };
    else if (req.action === 'load') out = load_();
    else if (req.action === 'version') out = { ok: true, version: version_() };
    else if (req.action === 'apply') out = apply_(req.ops || []);
    else throw new Error('Bilinmeyen işlem: ' + req.action);
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- işlemler ----------

function version_() {
  return Number(PropertiesService.getScriptProperties().getProperty('VERSION') || 0);
}

function load_() {
  var tables = {};
  Object.keys(TABLES).forEach(function (k) { tables[k] = readObjects_(sheet_(TABLES[k])); });
  var meta = {};
  readObjects_(sheet_(META)).forEach(function (r) { meta[r.key] = r.value; });
  return { ok: true, version: version_(), tables: tables, meta: meta };
}

function apply_(ops) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    ops.forEach(function (op) {
      if (op.t === 'put') put_(sheet_(TABLES[op.table]), op.rows);
      else if (op.t === 'del') del_(sheet_(TABLES[op.table]), op.ids);
      else if (op.t === 'log') put_(sheet_(TABLES.log), op.entries, true);
      else if (op.t === 'categories' || op.t === 'members' || op.t === 'admin') setMeta_(op.t, op.value);
      else throw new Error('Bilinmeyen operasyon: ' + op.t);
    });
    var v = version_() + 1;
    PropertiesService.getScriptProperties().setProperty('VERSION', String(v));
    return { ok: true, version: v };
  } finally {
    lock.releaseLock();
  }
}

// ---------- sayfa yardımcıları ----------

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function cell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function headers_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (sheet.getLastRow() < 1 || lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
}

/** Satırlardaki yeni alanlar için başlık sütunları ekler; güncel başlıkları döndürür. */
function ensureHeaders_(sheet, rows) {
  var headers = headers_(sheet);
  var added = false;
  rows.forEach(function (r) {
    Object.keys(r).forEach(function (k) {
      if (headers.indexOf(k) < 0) { headers.push(k); added = true; }
    });
  });
  if (added || sheet.getLastRow() < 1) {
    var range = sheet.getRange(1, 1, 1, headers.length);
    range.setNumberFormat('@');
    range.setValues([headers]);
  }
  return headers;
}

function readObjects_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var head = values[0].map(String);
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var o = {};
    for (var j = 0; j < head.length; j++) if (head[j]) o[head[j]] = values[i][j];
    out.push(o);
  }
  return out;
}

function toRow_(headers, obj) {
  return headers.map(function (h) { return cell_(obj[h]); });
}

function writeBlock_(sheet, startRow, matrix, width) {
  if (!matrix.length) return;
  var range = sheet.getRange(startRow, 1, matrix.length, width);
  range.setNumberFormat('@'); // metin olarak sakla: tarih/formül dönüşümünü engeller
  range.setValues(matrix);
}

/** Satırları ekler veya (id eşleşirse) günceller. appendOnly=true → hep ekle (log). */
function put_(sheet, rows, appendOnly) {
  if (!rows.length) return;
  var headers = ensureHeaders_(sheet, rows);
  var width = headers.length;
  var lastRow = Math.max(sheet.getLastRow(), 1);
  if (appendOnly) {
    writeBlock_(sheet, lastRow + 1, rows.map(function (r) { return toRow_(headers, r); }), width);
    return;
  }
  var idCol = headers.indexOf('id');
  if (idCol < 0) throw new Error('Tabloda id sütunu yok: ' + sheet.getName());
  var rowOf = {};
  if (lastRow > 1) {
    var ids = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) rowOf[String(ids[i][0])] = i + 2;
  }
  var updates = [];
  var appends = [];
  rows.forEach(function (r) {
    var at = rowOf[String(r.id)];
    if (at) updates.push({ at: at, row: r });
    else appends.push(r);
  });
  if (updates.length > BULK_LIMIT) {
    var all = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];
    updates.forEach(function (u) { all[u.at - 2] = toRow_(headers, u.row); });
    all.forEach(function (row, i) { if (row.length < width) all[i] = row.concat(new Array(width - row.length).fill('')); });
    writeBlock_(sheet, 2, all, width);
  } else {
    updates.forEach(function (u) { writeBlock_(sheet, u.at, [toRow_(headers, u.row)], width); });
  }
  if (appends.length) writeBlock_(sheet, lastRow + 1, appends.map(function (r) { return toRow_(headers, r); }), width);
}

function del_(sheet, ids) {
  if (!ids.length) return;
  var headers = headers_(sheet);
  var idCol = headers.indexOf('id');
  var lastRow = sheet.getLastRow();
  if (idCol < 0 || lastRow < 2) return;
  var gone = {};
  ids.forEach(function (id) { gone[String(id)] = true; });
  var col = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  var rowsToDelete = [];
  for (var i = 0; i < col.length; i++) if (gone[String(col[i][0])]) rowsToDelete.push(i + 2);
  if (!rowsToDelete.length) return;
  if (rowsToDelete.length > BULK_LIMIT) {
    var all = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    var keep = all.filter(function (_, i) { return !gone[String(col[i][0])]; });
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
    writeBlock_(sheet, 2, keep, headers.length);
  } else {
    for (var k = rowsToDelete.length - 1; k >= 0; k--) sheet.deleteRow(rowsToDelete[k]);
  }
}

function setMeta_(key, value) {
  var sheet = sheet_(META);
  var headers = ensureHeaders_(sheet, [{ key: '', value: '' }]);
  var lastRow = sheet.getLastRow();
  var json = JSON.stringify(value);
  if (lastRow > 1) {
    var keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === key) { writeBlock_(sheet, i + 2, [[key, json]], headers.length); return; }
    }
  }
  writeBlock_(sheet, Math.max(lastRow, 1) + 1, [[key, json]], headers.length);
}
