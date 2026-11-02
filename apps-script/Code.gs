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
var CAPS = ['digest']; // özellikler: uygulama bunları görünce ilgili ayarları açar
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
  return { ok: true, version: version_(), tables: tables, meta: meta, caps: CAPS };
}

function apply_(ops) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    ops.forEach(function (op) {
      if (op.t === 'put') put_(sheet_(TABLES[op.table]), op.rows);
      else if (op.t === 'del') del_(sheet_(TABLES[op.table]), op.ids);
      else if (op.t === 'log') put_(sheet_(TABLES.log), op.entries, true);
      else if (op.t === 'categories' || op.t === 'members' || op.t === 'admin' || op.t === 'digest') setMeta_(op.t, op.value);
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

// ---------- haftalık e-posta özeti ----------
// Kurulum: haftalikOzetKur() fonksiyonunu BİR KEZ çalıştırın (e-posta gönderme izni ister).
// Gün, alıcılar ve ekli yedek, uygulamada Ayarlar > Haftalık e-posta özeti bölümünden seçilir.

function haftalikOzetKur() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'gunlukKontrol') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('gunlukKontrol').timeBased().everyDays(1).atHour(8).create();
  Logger.log('Kuruldu: her sabah ~08:00 kontrol edilir; e-posta yalnızca Ayarlar bölümünde seçtiğiniz gün gider.');
}

/** Zamanlayıcı bunu çağırır. */
function gunlukKontrol() { return digest_(false); }

/** Elle deneme: gün kontrolü olmadan şimdi gönderir. */
function testEposta() { return digest_(true); }

function metaJson_(key) {
  var rows = readObjects_(sheet_(META));
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].key) === key) {
      try { return JSON.parse(rows[i].value); } catch (e) { return null; }
    }
  }
  return null;
}

function digest_(force) {
  var cfg = metaJson_('digest');
  if (!cfg || !cfg.enabled || !cfg.emails || !cfg.emails.length) return 'kapalı';
  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var dow = Number(Utilities.formatDate(now, tz, 'u')); // 1 = Pazartesi … 7 = Pazar
  var props = PropertiesService.getScriptProperties();
  if (!force) {
    if (dow !== Number(cfg.day)) return 'bugün gönderim günü değil';
    if (props.getProperty('LAST_DIGEST') === today) return 'bugün zaten gönderildi';
  }
  var rep = report_(today);
  var opts = {
    to: cfg.emails.join(','),
    subject: 'Lab Stok özeti: ' + rep.crit.length + ' kritik, ' + rep.exp.length + ' SKT, ' + rep.low.length + ' azalan',
    htmlBody: reportHtml_(rep, cfg.appUrl),
    name: 'Lab Stok Takip'
  };
  if (cfg.backup) {
    opts.attachments = [Utilities.newBlob(JSON.stringify(backupData_(), null, 1), 'application/json', 'labstok-yedek-' + today + '.json')];
  }
  MailApp.sendEmail(opts);
  props.setProperty('LAST_DIGEST', today);
  return 'gönderildi';
}

function num_(v) { var x = Number(v); return v === '' || v === null || v === undefined || isNaN(x) ? 0 : x; }

function daysUntil_(iso, today) {
  if (!iso) return null;
  var a = Date.parse(iso + 'T00:00:00Z'), b = Date.parse(today + 'T00:00:00Z');
  return isNaN(a) || isNaN(b) ? null : Math.round((a - b) / 86400000);
}

/** Uygulamadaki kurallarla aynı: kritik = toplam < minimum, azalan = açık şişe < %15, SKT <= 30 gün. */
function report_(today) {
  var items = readObjects_(sheet_(TABLES.items));
  var bottles = readObjects_(sheet_(TABLES.bottles));
  var openBy = {};
  bottles.forEach(function (b) { (openBy[b.itemId] = openBy[b.itemId] || []).push(num_(b.remaining)); });
  var crit = [], low = [], exp = [];
  items.forEach(function (it) {
    var open = openBy[it.id] || [];
    var total = num_(it.sealed) + open.length;
    var min = num_(it.minStock), size = num_(it.bottleSize);
    var loc = [it.cabinet, it.shelf, it.box].filter(function (x) { return x; }).join(' / ');
    var row = { name: it.name, brand: it.brand, loc: loc };
    if (min > 0 && total < min) crit.push(Object.assign({ info: total + ' / min ' + min }, row));
    if (size > 0 && open.some(function (r) { return r / size < 0.15; })) {
      low.push(Object.assign({ info: open.map(function (r) { return r + ' ' + (it.sizeUnit || ''); }).join(', ') }, row));
    }
    var d = daysUntil_(it.skt, today);
    if (d !== null && d <= 30) exp.push(Object.assign({ days: d, info: d < 0 ? (-d) + ' gün geçti' : d + ' gün kaldı' }, row));
  });
  exp.sort(function (a, b) { return a.days - b.days; });
  return { crit: crit, low: low, exp: exp, total: items.length };
}

function esc_(s) {
  return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function section_(title, color, rows) {
  if (!rows.length) return '';
  var max = 25;
  var html = '<h3 style="margin:18px 0 6px;color:' + color + '">' + esc_(title) + ' (' + rows.length + ')</h3>' +
    '<table style="border-collapse:collapse;width:100%;font-size:14px">';
  rows.slice(0, max).forEach(function (r) {
    html += '<tr><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb"><b>' + esc_(r.name) + '</b>' +
      (r.brand ? ' <span style="color:#6b7280">' + esc_(r.brand) + '</span>' : '') +
      (r.loc ? '<br><span style="color:#6b7280;font-size:12px">' + esc_(r.loc) + '</span>' : '') +
      '</td><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap">' + esc_(r.info) + '</td></tr>';
  });
  html += '</table>';
  if (rows.length > max) html += '<p style="color:#6b7280;font-size:12px">… ve ' + (rows.length - max) + ' ürün daha (uygulamada tamamını görün).</p>';
  return html;
}

function reportHtml_(rep, appUrl) {
  var ok = !rep.crit.length && !rep.low.length && !rep.exp.length;
  var html = '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;color:#111827">' +
    '<h2 style="margin:0 0 4px">Lab Stok haftalık özeti</h2>' +
    '<p style="margin:0;color:#6b7280">' + rep.total + ' stok ürünü izleniyor.</p>';
  if (ok) html += '<p style="font-size:16px">✅ Bu hafta dikkat gerektiren bir şey yok.</p>';
  html += section_('Kritik stok', '#b91c1c', rep.crit) + section_('Son kullanma tarihi', '#b45309', rep.exp) + section_('Azalan şişeler', '#b45309', rep.low);
  if (appUrl) html += '<p style="margin-top:20px"><a href="' + esc_(appUrl) + '" style="background:#2563eb;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Uygulamayı aç</a></p>';
  return html + '<p style="color:#9ca3af;font-size:12px;margin-top:24px">Bu e-posta, Lab Stok Takip uygulamasının Ayarlar bölümündeki seçimlere göre otomatik gönderilir.</p></div>';
}

/** Uygulamanın içe aktarma/yedek biçiminde (labstok-import-v1) tüm veri. Yönetici şifresi dahil değildir. */
function backupData_() {
  var items = readObjects_(sheet_(TABLES.items)).map(function (r) {
    r.bottleSize = num_(r.bottleSize); r.sealed = num_(r.sealed); r.minStock = num_(r.minStock); r.version = num_(r.version);
    r.ordered = r.ordered === true || r.ordered === 'true';
    return r;
  });
  var bottles = readObjects_(sheet_(TABLES.bottles)).map(function (r) { r.remaining = num_(r.remaining); return r; });
  var primers = readObjects_(sheet_(TABLES.primers)).map(function (r) {
    r.fwTm = r.fwTm === '' ? null : num_(r.fwTm); r.rvTm = r.rvTm === '' ? null : num_(r.rvTm); r.version = num_(r.version);
    return r;
  });
  return {
    format: 'labstok-import-v1', exportedAt: new Date().toISOString(), exportedBy: 'e-posta özeti',
    categories: metaJson_('categories') || undefined, members: metaJson_('members') || undefined,
    items: items, bottles: bottles, primers: primers
  };
}
