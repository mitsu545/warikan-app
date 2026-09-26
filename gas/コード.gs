/**
 * warikan-app / Google Apps Script（段階2：土台＋レシート写真）
 *
 * やること
 *   - setup()      … シート7枚を作り、写真用フォルダを用意し、自動削除の予約を入れる
 *   - doPost()     … アプリからの ping / save / summary / receipt / photo を受ける
 *   - 写真の掃除   … 1日1回、期限を過ぎた写真を消す（setup が予約する）
 *
 * 「プロジェクトの設定 → スクリプト プロパティ」に登録するもの
 *   SECRET          … 2人で決めた合言葉（このコードには書かない）
 *   PHOTO_KEEP_DAYS … 写真を残す日数。省略すると 62日（約2か月）
 *   PHOTO_FOLDER_ID … setup が自動で入れます。手で触らなくてよい
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

// このコードの版。貼り替えるたびに変える。
// アプリの設定画面で「つなぐ」を押すとこの文字が出るので、
// 新バージョンでデプロイできているかを目で確かめられる。
var VERSION = '2026-09-26 / 段階3（読み取り・速度改善）';

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

  var folder = photoFolder();          // 写真の置き場（非公開）を用意する
  setupPhotoCleanup();                 // 1日1回の自動削除を予約する

  var msg = '作ったシート：' + (made.length ? made.join('、') : 'なし')
          + '\nもともとあったシート：' + (kept.length ? kept.join('、') : 'なし')
          + '\n写真の保存先：' + folder.getName()
          + '\n写真を残す日数：' + keepDays() + '日'
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
      case 'ping':    return json({ ok: true, message: 'つながりました', sheets: Object.keys(SHEETS), version: VERSION });
      case 'save':    return json(actionSave(req));
      case 'summary': return json(actionSummary(req));
      case 'receipt': return json(actionReceipt(req));
      case 'photo':   return json(actionPhoto(req));
      case 'ocr':     return json(actionOcr(req));
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

    // 写真が付いていればドライブに保存し、そのファイルIDだけをシートに残す
    var photoId = '';
    if (req.photo) {
      try { photoId = savePhoto(req.photo, id); }
      catch (e) { photoId = ''; }     // 写真が失敗しても明細は保存する
    }

    // 日付の欄は先に「文字列」と指定してから書く（勝手に日付に変換されるのを防ぐ）
    var line = rSheet.getLastRow() + 1;
    rSheet.getRange(line, 2).setNumberFormat('@');    // date
    rSheet.getRange(line, 9).setNumberFormat('@');    // month
    rSheet.getRange(line, 10).setNumberFormat('@');   // created_at
    rSheet.getRange(line, 1, 1, 10).setValues([[
      id, r.date, r.store || '', num(r.total), person(r.payer), person(r.entered_by),
      photoId, r.has_items === false ? false : true, month, now
    ]]);

    var rows = items.map(function (it, n) {
      return [
        id + '-' + pad2(n + 1), id, it.item || '', num(it.amount),
        share(it.share), it.category || 'その他', it.rule_applied === true
      ];
    });
    iSheet.getRange(iSheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

    bumpSumVersion();                       // 保存したら記憶を全部無効にする
    return { ok: true, receipt_id: id, saved: rows.length, photo_saved: Boolean(photoId), settle: settleOf(ss, month) };
  } finally {
    lock.releaseLock();
  }
}

// ===== action：その月の一覧 =====
// 同じ月を続けて聞かれたとき用の短い記憶。
// 鍵に「版」を混ぜてある。保存のたびに版を変えるので、
// 保存より前に始まった集計があとから書き込んでも、古い鍵になって読まれない。
function sumVersion() {
  var c = CacheService.getScriptCache();
  var v = c.get('sumver');
  if (!v) { v = String(Date.now()); c.put('sumver', v, 21600); }
  return v;
}
function bumpSumVersion() {
  CacheService.getScriptCache().put('sumver', String(Date.now()) + '-' + Math.random(), 21600);
}
function sumCacheKey(month) { return 'sum-' + sumVersion() + '-' + month; }

function actionSummary(req) {
  var month = String(req.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: '月の指定が正しくありません（例 2026-09）' };

  var cache = CacheService.getScriptCache();
  var key = sumCacheKey(month);
  var hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* 壊れていたら作り直す */ } }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var receipts = rows(ss, 'レシート').filter(function (x) { return x.month === month; });
  var byId = {};
  receipts.forEach(function (x) { byId[x.receipt_id] = x; x.items = []; });
  rows(ss, '明細').forEach(function (it) {
    if (byId[it.receipt_id]) byId[it.receipt_id].items.push(it);
  });

  receipts.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });

  var out = {
    ok: true, month: month,
    receipts: receipts,
    settle: settleOf(ss, month),
    closed: rows(ss, '月次精算').filter(function (c) { return c.month === month; })[0] || null,
    unpaid: unpaidOf(ss)
  };
  // 記憶は 100KB まで。日本語は1文字で3バイトになるので余裕をみる。
  // 入りきらなくても集計は返す（覚えられないだけ）
  try {
    var text = JSON.stringify(out);
    if (text.length < 30000) cache.put(key, text, 120);   // 2分だけ覚える
  } catch (e) { /* 覚えられなくても動きに影響はない */ }
  return out;
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

// ===== 写真（段階2） =====

// 何日残すか。スクリプトプロパティ PHOTO_KEEP_DAYS で変えられる
function keepDays() {
  var v = parseInt(prop('PHOTO_KEEP_DAYS'), 10);
  return (v > 0) ? v : 62;              // 省略時は 62日（約2か月）
}

// 写真の置き場。なければ作る。⚠️ 共有設定はしない（GAS 経由でしか見せない）
function photoFolder() {
  var id = prop('PHOTO_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* 消えていたら作り直す */ }
  }
  var name = 'warikan レシート写真';
  var found = DriveApp.getFoldersByName(name);
  var folder = found.hasNext() ? found.next() : DriveApp.createFolder(name);
  PropertiesService.getScriptProperties().setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

// base64（data:image/jpeg;base64,... の形）を受け取って保存し、ファイルIDを返す
function savePhoto(dataUrl, receiptId) {
  var m = String(dataUrl).match(/^data:(image\/[a-z]+);base64,(.+)$/i);
  if (!m) throw new Error('写真の形式が違います');
  var bytes = Utilities.base64Decode(m[2]);
  var blob = Utilities.newBlob(bytes, m[1], receiptId + '.jpg');
  return photoFolder().createFile(blob).getId();
}

// アプリから写真を取り出す。ドライブを公開しないので必ずここを通す
function actionPhoto(req) {
  var id = String(req.receipt_id || '');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var r = rows(ss, 'レシート').filter(function (x) { return x.receipt_id === id; })[0];
  if (!r) return { ok: false, error: 'そのレシートは見つかりません' };
  if (!r.photo_id) return { ok: true, photo: '', reason: 'なし' };
  try {
    var f = DriveApp.getFileById(r.photo_id);
    var b = f.getBlob();
    return { ok: true, photo: 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()) };
  } catch (e) {
    return { ok: true, photo: '', reason: '期限切れ' };   // 自動削除済み
  }
}

// ===== レシートの読み取り（Gemini・段階3） =====
// 写真を Gemini に渡して 店名・日付・合計・品目 を読ませる。
// API キーはスクリプトプロパティ GEMINI_KEY にだけ置く。コードには書かない。

// モデル名は変わることがある。404 で「no longer available」と言われたら、
// 返事に書かれている新しい名前をスクリプトプロパティ GEMINI_MODEL に入れれば
// コードを貼り替えずに切り替えられる。
function geminiModel() { return prop('GEMINI_MODEL') || 'gemini-3.6-flash'; }

var OCR_PROMPT = [
  'これは日本のレシートの写真です。書かれている内容だけを読み取ってください。',
  '推測で補わないでください。読めない項目は空にしてください。',
  '次の形の JSON だけを返してください。説明文は不要です。',
  '{"store":"店名","date":"YYYY-MM-DD","total":合計金額の数値,',
  ' "items":[{"item":"品名","amount":金額の数値}]}',
  '注意：',
  '- 金額は数値のみ（円やカンマを付けない）。値引きはマイナスの数値にする。',
  '- total はレシートに印字された「合計」の金額。税込の支払額。',
  '- items には商品の行だけを入れる。小計・税・合計・お預り・お釣りは入れない。',
  '- 日付が読めないときは date を空文字にする。'
].join('\n');

function actionOcr(req) {
  var key = prop('GEMINI_KEY');
  if (!key) return { ok: false, error: 'GEMINI_KEY が未設定です（スクリプトプロパティに登録してください）' };

  var m = String(req.photo || '').match(/^data:(image\/[a-z]+);base64,(.+)$/i);
  if (!m) return { ok: false, error: '写真がありません' };

  var body = {
    contents: [{ parts: [
      { text: OCR_PROMPT },
      { inline_data: { mime_type: m[1], data: m[2] } }
    ] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' }
  };

  // キーは URL ではなくヘッダーで渡す（エラーの文面に混ざって画面に出るのを防ぐ）
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/'
          + geminiModel() + ':generateContent';
  var res;
  try {
    res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      headers: { 'x-goog-api-key': key },
      payload: JSON.stringify(body), muteHttpExceptions: true
    });
  } catch (e) {
    // URL は取り除いてから返す（エラー文に混ざって画面に出るのを防ぐ）
    var msg = String((e && e.message) || '').replace(/https?:\/\/\S+/g, '').trim();
    if (/permission|権限|authoriz|承認/i.test(msg)) {
      return { ok: false, error: '外部への通信が許可されていません。Apps Script で「テスト読み取り」を実行して承認し、新バージョンでデプロイしてください' };
    }
    return { ok: false, error: '読み取りに行けませんでした：' + (msg || '通信を確認してください') };
  }

  var code = res.getResponseCode();
  if (code === 429) return { ok: false, error: '無料枠の上限に達しました。少し待って試してください' };
  if (code !== 200) return { ok: false, error: '読み取りが失敗しました（' + code + '）' };

  var text;
  try {
    var out = JSON.parse(res.getContentText());
    text = out.candidates[0].content.parts[0].text;
  } catch (e) {
    return { ok: false, error: '読み取りの返事が読めませんでした' };
  }
  return { ok: true, read: normalizeOcr(text) };
}

// Gemini の返事を、アプリがそのまま使える形に整える。
// おかしな値はここで落とす（金額の取り違えは事故になるため）
function normalizeOcr(text) {
  var o;
  try { o = JSON.parse(String(text).replace(/^```(json)?|```$/g, '').trim()); }
  catch (e) { return { store: '', date: '', total: 0, items: [] }; }

  var items = [];
  (o.items || []).forEach(function (x) {
    var name = String(x && x.item != null ? x.item : '').trim().slice(0, 60);
    var amt = num(x && x.amount);
    if (!name && !amt) return;
    if (Math.abs(amt) > 10000000) return;              // 桁の読み違いは捨てる
    items.push({ item: name || '（品名なし）', amount: Math.round(amt) });
  });

  var total = Math.round(num(o.total));
  if (total < 0 || total > 10000000) total = 0;

  var date = String(o.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = '';   // 形が違えば使わない
  if (date) {                                          // 実在しない日付も使わない
    var p = date.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (d.getFullYear() !== Number(p[0]) || d.getMonth() + 1 !== Number(p[1])
        || d.getDate() !== Number(p[2])) date = '';
  }

  return { store: String(o.store || '').trim().slice(0, 60), date: date, total: total, items: items };
}

// 読み取りの調子を調べる（Apps Script のエディタから実行し、実行ログを見る）
// 何が起きているかをそのまま出す。キーの中身は絶対に出さない。
function テスト読み取り() {
  var key = prop('GEMINI_KEY');
  var out = [];
  out.push('■ このコードの版：' + VERSION);
  out.push('■ モデル：' + geminiModel());
  out.push('■ GEMINI_KEY：' + (key ? '登録あり（' + key.length + '文字）' : '★未登録★'));
  if (!key) {
    out.push('→ スクリプトプロパティに GEMINI_KEY を登録してください');
    Logger.log(out.join('\n')); return out.join('\n');
  }

  // 1x1 の白い画像で、実際に Gemini まで行けるか試す
  var png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  try {
    var res = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + geminiModel() + ':generateContent',
      { method: 'post', contentType: 'application/json',
        headers: { 'x-goog-api-key': key },
        payload: JSON.stringify({ contents: [{ parts: [
          { text: 'この画像に何が写っていますか。10文字以内で答えてください。' },
          { inline_data: { mime_type: 'image/png', data: png } }
        ] }] }),
        muteHttpExceptions: true });
    out.push('■ 通信：できた');
    var c = res.getResponseCode();
    out.push('■ 返事の番号：' + c + '（200 なら成功）');
    if (c === 404 && /no longer available/.test(res.getContentText())) {
      out.push('→ モデル名が古い。下の返事に書かれた新しい名前を');
      out.push('   スクリプトプロパティ GEMINI_MODEL に入れれば直る');
    }
    if (c === 403 || c === 400) out.push('→ GEMINI_KEY が違うかもしれない');
    out.push('■ 返事の中身（先頭300文字）：');
    out.push(String(res.getContentText()).slice(0, 300));
  } catch (e) {
    out.push('■ 通信：★できなかった★');
    out.push('■ そのままのエラー：' + String((e && e.message) || e).replace(key, '＜キー＞'));
    out.push('→ 「permission」「権限」と出ていたら、承認がまだです');
  }
  Logger.log(out.join('\n'));
  return out.join('\n');
}

// ===== 写真の自動削除（1日1回） =====

// setup から呼ばれる。同じ予約を二重に作らない
function setupPhotoCleanup() {
  var already = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'cleanupPhotos';
  });
  if (already) return;
  ScriptApp.newTrigger('cleanupPhotos').timeBased().everyDays(1).atHour(3).create();
}

// 期限を過ぎた写真を消し、シートの photo_id を空にする
function cleanupPhotos() {
  var limit = new Date(Date.now() - keepDays() * 24 * 60 * 60 * 1000);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = sheet(ss, 'レシート');
  var last = sh.getLastRow();
  if (last < 2) return 0;

  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var col = head.indexOf('photo_id') + 1;
  if (col < 1) return 0;

  var ids = sh.getRange(2, col, last - 1, 1).getValues();
  var removed = 0;
  for (var i = 0; i < ids.length; i++) {
    var id = String(ids[i][0] || '');
    if (!id) continue;
    try {
      var f = DriveApp.getFileById(id);
      if (f.getDateCreated() < limit) { f.setTrashed(true); ids[i][0] = ''; removed++; }
    } catch (e) {
      ids[i][0] = '';                 // もう無いファイルは記録も消す
    }
  }
  if (removed) sh.getRange(2, col, ids.length, 1).setValues(ids);
  Logger.log('消した写真：' + removed + '枚（' + keepDays() + '日より前）');
  return removed;
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
// スプレッドシートは "2026-09" や "2026-09-19" を打ち込むと勝手に日付に変えてしまう。
// そのまま読むと文字列と一致せず、月で探しても1件も見つからなくなる。
// 読むときに必ず元の文字列に戻す。シートを読む処理は必ず rows() を通すこと。
function asText(key, v) {
  if (!(v instanceof Date)) return v;
  if (key === 'month') return v.getFullYear() + '-' + pad2(v.getMonth() + 1);
  if (key === 'created_at' || key === 'closed_at') {
    return fmtDate(v) + ' ' + pad2(v.getHours()) + ':' + pad2(v.getMinutes());
  }
  return fmtDate(v);                       // date など日付の欄
}

function rows(ss, name) {
  var sh = sheet(ss, name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  var head = values[0];
  return values.slice(1).map(function (row) {
    var o = {};
    head.forEach(function (h, i) { o[h] = asText(h, row[i]); });
    if (o.amount !== undefined) o.amount = num(o.amount);
    if (o.total !== undefined) o.total = num(o.total);
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

function テスト写真の掃除() {
  Logger.log('消した枚数：' + cleanupPhotos());
}

function テスト一覧() {
  Logger.log(JSON.stringify(actionSummary({ month: fmtDate(new Date()).slice(0, 7) }), null, 2));
}
