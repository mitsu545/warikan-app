/**
 * warikan-app / Google Apps Script（段階1：土台）
 *
 * やること
 *   - setup()  … スプレッドシートに 7 枚のシートを作る（最初に 1 回だけ実行）
 *   - doPost() … スマホのアプリからの save / summary / receipt / ping を受ける
 *
 * 事前に「プロジェクトの設定 → スクリプト プロパティ」に登録するもの
 *   SECRET … 2人で決めた合言葉（このコードには書かない）
 *
 * 手順は docs/setup.md を見てください。
 */

// ===== シートの定義（列の順番＝仕様書 12 章） =====
var SHEETS = {
  'レシート':        ['receipt_id', 'date', 'store', 'total', 'payer', 'entered_by', 'photo_id', 'has_items', 'month', 'created_at'],
  '明細':            ['id', 'receipt_id', 'item', 'amount', 'share', 'category', 'rule_applied'],
  '固定費テンプレート': ['id', 'name', 'kind', 'amount_default', 'payer', 'share', 'active'],
  '固定費実績':      ['month', 'template_id', 'name', 'amount', 'payer', 'share'],
  'ルール':          ['keyword', 'share', 'created_at'],
  '月次精算':        ['month', 'paid_me', 'paid_wife', 'burden_me', 'burden_wife', 'settle_amount', 'settle_direction', 'closed_at'],
  '精算記録':        ['id', 'month', 'date', 'direction', 'amount', 'method', 'memo', 'created_at']
};

var SHARES = ['common', 'me', 'wife'];

// ===== 最初に 1 回だけ実行する =====
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var made = [], kept = [];

  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (sh) { kept.push(name); return; }          // あるシートには触らない（作り直さない）
    sh = ss.insertSheet(name);
    var head = SHEETS[name];
    sh.getRange(1, 1, 1, head.length).setValues([head])
      .setFontWeight('bold').setBackground('#eceff6');
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, head.length);
    made.push(name);
  });

  // 空の「シート1」が残っていたら消す
  var first = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1 && first.getLastRow() === 0) ss.deleteSheet(first);

  var msg = '作ったシート：' + (made.length ? made.join('、') : 'なし')
          + '\nもともとあったシート：' + (kept.length ? kept.join('、') : 'なし')
          + '\n\n合言葉（SECRET）の登録を忘れずに。';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert('セットアップ完了', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return msg;
}

// ===== 入口 =====
function doGet() {
  return ContentService
    .createTextOutput('warikan-app の窓口です。アプリの設定画面にこの URL を貼ってください。')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return json({ ok: false, error: '中身が空でした' });
    var req = JSON.parse(e.postData.contents);

    if (String(req.secret || '') !== String(prop('SECRET'))) {
      return json({ ok: false, error: '合言葉が違います。設定を確認してください' });
    }

    switch (req.action) {
      case 'ping':    return json({ ok: true, message: 'つながりました', sheets: Object.keys(SHEETS) });
      case 'save':    return json(actionSave(req));
      case 'summary': return json(actionSummary(req));
      case 'receipt': return json(actionReceipt(req));
      default:        return json({ ok: false, error: '知らない action です：' + req.action });
    }
  } catch (err) {
    return json({ ok: false, error: '内部エラー：' + (err && err.message ? err.message : String(err)) });
  }
}

// ===== action：保存 =====
function actionSave(req) {
  var r = req.receipt || {};
  var items = req.items || [];
  if (!r.date) return { ok: false, error: '日付がありません' };
  if (!items.length) return { ok: false, error: '品目がありません' };

  // 2台から同時に送られても ID が重ならないように鍵をかける
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var rSheet = sheet(ss, 'レシート');
    var iSheet = sheet(ss, '明細');

    var month = String(r.date).slice(0, 7);
    var id = newReceiptId(rSheet, r.date);
    var now = stamp();

    rSheet.appendRow([
      id, r.date, r.store || '', num(r.total), person(r.payer), person(r.entered_by),
      r.photo_id || '', r.has_items === false ? false : true, month, now
    ]);

    var rows = items.map(function (it, n) {
      return [
        id + '-' + pad2(n + 1), id, it.item || '', num(it.amount),
        share(it.share), it.category || 'その他', it.rule_applied === true
      ];
    });
    iSheet.getRange(iSheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

    return { ok: true, receipt_id: id, saved: rows.length, settle: settleOf(ss, month) };
  } finally {
    lock.releaseLock();
  }
}

// ===== action：その月の一覧 =====
function actionSummary(req) {
  var month = String(req.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: '月の指定が正しくありません（例 2026-09）' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var receipts = rows(ss, 'レシート').filter(function (x) { return x.month === month; });
  var byId = {};
  receipts.forEach(function (x) { byId[x.receipt_id] = x; x.items = []; });
  rows(ss, '明細').forEach(function (it) {
    if (byId[it.receipt_id]) byId[it.receipt_id].items.push(it);
  });

  receipts.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });

  return {
    ok: true, month: month,
    receipts: receipts,
    settle: settleOf(ss, month),
    closed: rows(ss, '月次精算').filter(function (c) { return c.month === month; })[0] || null,
    unpaid: unpaidOf(ss)
  };
}

// ===== action：レシート1件 =====
function actionReceipt(req) {
  var id = String(req.receipt_id || '');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var r = rows(ss, 'レシート').filter(function (x) { return x.receipt_id === id; })[0];
  if (!r) return { ok: false, error: 'そのレシートは見つかりません' };
  r.items = rows(ss, '明細').filter(function (it) { return it.receipt_id === id; });
  return { ok: true, receipt: r };
}

// ===== 精算の計算（仕様書 11 章。フロントと同じ式） =====
function calc(list) {
  var paid = { me: 0, wife: 0 }, own = { me: 0, wife: 0 }, common = 0;
  list.forEach(function (x) {
    paid[x.payer] += x.amount;
    if (x.share === 'common') common += x.amount; else own[x.share] += x.amount;
  });
  var half = Math.floor(common / 2);                 // 端数は月合計で1回だけ切り捨て
  var burden = { me: half + own.me, wife: half + own.wife };
  var diff = burden.me - paid.me;                    // 正なら私→妻、負なら妻→私
  return {
    paid: paid, burden: burden, common: common, half: half,
    amount: Math.abs(diff),
    direction: diff > 0 ? 'me_to_wife' : diff < 0 ? 'wife_to_me' : 'none'
  };
}

// その月のレシート分の精算（固定費は締めるときに足す：仕様書 7-3）
function settleOf(ss, month) {
  var payerOf = {};
  rows(ss, 'レシート').forEach(function (r) { if (r.month === month) payerOf[r.receipt_id] = r.payer; });
  var list = [];
  rows(ss, '明細').forEach(function (it) {
    if (payerOf[it.receipt_id]) list.push({ payer: payerOf[it.receipt_id], share: it.share, amount: it.amount });
  });
  return calc(list);
}

// 締めた合計 − 記録した精算 ＝ 未精算
function unpaidOf(ss) {
  var owed = 0, month = null;
  rows(ss, '月次精算').forEach(function (c) {
    owed += (c.settle_direction === 'wife_to_me' ? 1 : -1) * num(c.settle_amount);
    month = c.month;
  });
  rows(ss, '精算記録').forEach(function (p) {
    owed -= (p.direction === 'wife_to_me' ? 1 : -1) * num(p.amount);
  });
  return { amount: Math.abs(owed), month: month, direction: owed >= 0 ? 'wife_to_me' : 'me_to_wife' };
}

// ===== 小道具 =====
function prop(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('シート「' + name + '」がありません。setup() を実行してください');
  return sh;
}

// 1行目を見出しとして、各行をオブジェクトの配列にする
function rows(ss, name) {
  var sh = sheet(ss, name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  var head = values[0];
  return values.slice(1).map(function (row) {
    var o = {};
    head.forEach(function (h, i) { o[h] = row[i]; });
    if (o.amount !== undefined) o.amount = num(o.amount);
    if (o.total !== undefined) o.total = num(o.total);
    if (o.date instanceof Date) o.date = fmtDate(o.date);
    return o;
  });
}

// r-20260917-001 の形。同じ日のレシート数 +1
function newReceiptId(rSheet, date) {
  var prefix = 'r-' + String(date).replace(/-/g, '') + '-';
  var last = rSheet.getLastRow();
  var n = 0;
  if (last >= 2) {
    rSheet.getRange(2, 1, last - 1, 1).getValues().forEach(function (row) {
      var v = String(row[0]);
      if (v.indexOf(prefix) === 0) n = Math.max(n, parseInt(v.slice(prefix.length), 10) || 0);
    });
  }
  return prefix + pad3(n + 1);
}

function num(v) { var n = Number(v); return isNaN(n) ? 0 : Math.round(n); }
function person(v) { return v === 'wife' ? 'wife' : 'me'; }
function share(v) { return SHARES.indexOf(v) >= 0 ? v : 'common'; }
function pad2(n) { return ('0' + n).slice(-2); }
function pad3(n) { return ('00' + n).slice(-3); }
function fmtDate(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function stamp() {
  var d = new Date();
  return fmtDate(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

// ===== 動作確認用（Apps Script のエディタから実行する） =====
function テスト保存() {
  var res = actionSave({
    receipt: { date: fmtDate(new Date()), store: 'テスト商店', total: 1000, payer: 'me', entered_by: 'me', has_items: true },
    items: [
      { item: 'テスト品A', amount: 600, share: 'common', category: '食費' },
      { item: 'テスト品B', amount: 400, share: 'me', category: '食費' }
    ]
  });
  Logger.log(JSON.stringify(res, null, 2));
}

function テスト一覧() {
  Logger.log(JSON.stringify(actionSummary({ month: fmtDate(new Date()).slice(0, 7) }), null, 2));
}
