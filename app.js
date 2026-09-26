/* warikan アプリ本体
   設定に GAS の URL と合言葉が入っていれば本物のデータで動く。
   入っていなければ見本データのまま動いて、画面の見え方だけ確かめられる。 */
'use strict';

// ===== 定数 =====
const SHARES = ['common', 'me', 'wife'];
// 2人の呼び名は設定で変えられる（2台で共通）。色は名前に関係なく 私＝青・妻＝赤・共通＝緑 で固定
const SHARE_LABEL = { common: '共通', me: '私', wife: '妻' };
const PERSON = { me: '私', wife: '妻' };
const NAMES_KEY = 'warikan.names';
// 画面に埋め込むので記号は落とす（GAS 側でも同じように落としている）
const cleanName = (v, d) => String(v || '').replace(/[<>&"'`\\]/g, '').trim().slice(0, 10) || d;
function setNames(n) {
  if (!n) return;
  PERSON.me = SHARE_LABEL.me = cleanName(n.me, '私');
  PERSON.wife = SHARE_LABEL.wife = cleanName(n.wife, '妻');
  store.set(NAMES_KEY, JSON.stringify(PERSON));
  document.querySelectorAll('[data-name]').forEach((el) => { el.textContent = PERSON[el.dataset.name]; });
}
try { setNames(JSON.parse(store.get(NAMES_KEY, 'null'))); } catch (e) { /* 前回の名前が読めなくても既定の名前で動く */ }
// 向きを「○○ → △△」の言葉にする
const dirText = (dir) => (dir === 'me_to_wife' ? `${PERSON.me} → ${PERSON.wife}` : `${PERSON.wife} → ${PERSON.me}`);
const CATS = ['食費', '外食', '日用品', '交通', '娯楽', '医療', '衣類', '水道光熱', '通信', 'その他'];

const SWAP = '<svg class="ico swap"><use href="#i-swap"/></svg>';   // 「タップで切り替わる」印
const $ = (s) => document.querySelector(s);
const pad2 = (n) => String(n).padStart(2, '0');
const yen = (n) => `${n.toLocaleString('ja-JP')}円`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const next = (arr, v) => arr[(arr.indexOf(v) + 1) % arr.length];
const other = (p) => (p === 'me' ? 'wife' : 'me');
const monthLabel = (m) => { const [y, mm] = m.split('-'); return `${y}年${Number(mm)}月`; };
const WD = ['日', '月', '火', '水', '木', '金', '土'];
// 「9/19（金）」。曜日があると「あの金曜の買い物」と記憶がつながる
const dayLabel = (d) => {
  const [y, m, dd] = d.split('-').map(Number);
  const w = new Date(y, m - 1, dd).getDay();
  return `${m}/${dd}（${WD[w]}）`;
};

// ダミーのレシート写真（本物の画像は使わず、それらしい絵を canvas で作る）
function fakePhoto(seed, w = 520, h = 340) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#d9d2c7'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#efeae1'; g.fillRect(w * 0.16, 8, w * 0.68, h - 16);
  g.fillStyle = '#8a8378';
  g.font = 'bold 20px sans-serif'; g.fillText(seed, w * 0.22, 48);
  g.font = '13px sans-serif';
  for (let i = 0; i < 9; i++) {
    const y = 76 + i * 26;
    g.fillRect(w * 0.22, y, w * 0.34 * (0.5 + ((i * 7) % 10) / 20), 7);
    g.fillRect(w * 0.66, y, 42, 7);
  }
  return c.toDataURL('image/jpeg', 0.7);
}

// ===== 今月・先月（今日の日付から毎回計算する）=====
const ymOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const todayStr = () => { const t = new Date(); return `${ymOf(t)}-${pad2(t.getDate())}`; };
let THIS_M = '', PREV_M = '', month = '';
// 月をまたいでアプリを開きっぱなしにしても、「今月」が古い月のままにならないようにする。
// 見ている月（month）はここでは変えない。9月の明細を見ながら0時を過ぎて「締める」を押したら、
// 締めるのは9月のまま（勝手に10月に変わると、違う月を締めてしまう）。
// 月が変わったら、それまでの「今月」を返す
function setToday() {
  const t = new Date();
  const now = ymOf(t);
  if (now === THIS_M) return '';
  const old = THIS_M;
  THIS_M = now;
  PREV_M = ymOf(new Date(t.getFullYear(), t.getMonth() - 1, 1));
  if (!month || month > THIS_M) month = THIS_M;
  return old;
}
setToday();

// ===== 見本データ（GAS につながっていないときだけ使う）=====

let receipts = [
  { id: 'r1', month: THIS_M, date: '2026-09-17', store: 'ライフ 三軒茶屋', payer: 'me', total: 2300, photo: 1, hasItems: true, items: [
    { n: 'スーパードライ 350ml', a: 228, s: 'me', c: '食費', rule: true },
    { n: '本麒麟 350ml', a: 158, s: 'wife', c: '食費', rule: true },
    { n: '牛乳 1L', a: 238, s: 'common', c: '食費' },
    { n: '食パン 6枚', a: 168, s: 'common', c: '食費' },
    { n: '鶏むね肉 500g', a: 498, s: 'common', c: '食費' },
    { n: 'トイレットペーパー 12R', a: 598, s: 'common', c: '日用品' },
    { n: 'ヨーグルト', a: 198, s: 'common', c: '食費' },
    { n: '割引', a: -50, s: 'common', c: '食費' },
    { n: '調整（税・割引）', a: 264, s: 'common', c: '食費', adjust: true },
  ] },
  { id: 'r2', month: THIS_M, date: '2026-09-15', store: 'スターバックス 渋谷', payer: 'wife', total: 1340, photo: 1, hasItems: false, items: [
    { n: 'スターバックス 渋谷', a: 1340, s: 'common', c: '外食' },
  ] },
  { id: 'r3', month: THIS_M, date: '2026-09-12', store: 'マツモトキヨシ', payer: 'me', total: 3280, photo: 1, hasItems: true, items: [
    { n: '化粧水', a: 1980, s: 'wife', c: '日用品' },
    { n: 'シャンプー 詰替', a: 698, s: 'common', c: '日用品' },
    { n: '絆創膏', a: 328, s: 'common', c: '医療' },
    { n: 'のど飴', a: 274, s: 'common', c: '食費' },
  ] },
  { id: 'r4', month: THIS_M, date: '2026-09-08', store: 'JR東日本', payer: 'me', total: 1520, photo: 0, hasItems: false, items: [
    { n: 'JR東日本', a: 1520, s: 'me', c: '交通' },
  ] },
  { id: 'r5', month: THIS_M, date: '2026-09-05', store: '業務スーパー', payer: 'wife', total: 4120, photo: 1, hasItems: true, items: [
    { n: '冷凍うどん 5食', a: 258, s: 'common', c: '食費' },
    { n: '豚こま 1kg', a: 980, s: 'common', c: '食費' },
    { n: '玉ねぎ 3kg', a: 498, s: 'common', c: '食費' },
    { n: '洗剤 詰替', a: 348, s: 'common', c: '日用品' },
    { n: '妻の化粧品', a: 1680, s: 'wife', c: '日用品' },
    { n: 'コーヒー豆', a: 356, s: 'me', c: '食費' },
  ] },
  { id: 'r6', month: THIS_M, date: '2026-09-03', store: '手入力', payer: 'wife', total: 3600, photo: 0, hasItems: false, items: [
    { n: '友人の結婚祝い（2人から）', a: 3600, s: 'common', c: '娯楽' },
  ] },
  { id: 'r7', month: PREV_M, date: '2026-08-20', store: 'ライフ 三軒茶屋', payer: 'me', total: 5200, photo: 0, hasItems: false, items: [
    { n: 'ライフ 三軒茶屋', a: 5200, s: 'common', c: '食費' },
  ] },
  { id: 'r8', month: PREV_M, date: '2026-08-11', store: '外食 まとめ', payer: 'wife', total: 8400, photo: 0, hasItems: false, items: [
    { n: '外食 まとめ', a: 8400, s: 'common', c: '外食' },
  ] },
];
receipts.forEach((r) => { if (r.photo) r.photoData = fakePhoto(r.store); });

// 固定費テンプレート（設定で1回登録）
const templates = [
  { id: 'f1', name: '家賃', kind: 'fixed', def: 120000, payer: 'me', share: 'common' },
  { id: 'f2', name: '電気代', kind: 'variable', def: 0, payer: 'me', share: 'common' },
  { id: 'f3', name: 'ガス代', kind: 'variable', def: 0, payer: 'me', share: 'common' },
  { id: 'f4', name: '水道代', kind: 'variable', def: 0, payer: 'me', share: 'common' },
  { id: 'f5', name: 'Netflix', kind: 'fixed', def: 1590, payer: 'me', share: 'common' },
  { id: 'f6', name: '妻のジム', kind: 'fixed', def: 8800, payer: 'wife', share: 'wife' },
];
const LAST = { f2: 9840, f3: 4380, f4: 4200 };    // 見本用：先月の実額（初期値のヒントに使う）
const LAST0 = { f2: 9120, f3: 5210, f4: 0 };      // 見本用：先月の実額（締め済み）
// テンプレート1件 → その月の1行（tid＝どのテンプレートから来たか。今月だけの項目は空）
// 毎月すべて空欄から始める（家賃も）。入れたらチェックが付くので、入れ忘れが一目で分かる
const fromTpl = (t) => ({ id: t.id, tid: t.id, name: t.name, kind: t.kind, payer: t.payer, share: t.share,
  amount: null });
const activeTpl = () => templates.filter((t) => t.active !== false);
// その月の実額。月ごとに持つ（変動費は未入力＝null から始める）
const blankMonth = () => activeTpl().map(fromTpl);
const fxByMonth = {
  [THIS_M]: blankMonth(),
  [PREV_M]: templates.map((t) => ({ ...fromTpl(t), amount: t.kind === 'fixed' ? t.def : (LAST0[t.id] ?? 0) })),
};
const fxPrevByMonth = {};                         // サーバーから来た「先月の固定費」（目安の表示用）
// 締めていない月は、あとから足したテンプレートも並べる（締めた月は中身を変えない）
function fxOf(m) {
  const list = (fxByMonth[m] ||= blankMonth());
  if (!closed[m]) activeTpl().forEach((t) => { if (!list.some((f) => f.tid === t.id)) list.push(fromTpl(t)); });
  return list;
}
// 欄の薄い字（目安）：先月の額、無ければテンプレートの金額
function fxHint(m, f) {
  const last = lastAmount(m, f);
  if (last !== null) return last;
  const t = f.tid && templates.find((x) => x.id === f.tid);
  return t && t.kind === 'fixed' && t.def ? t.def : '';
}
// 先月いくらだったか（無ければ null）
function lastAmount(m, f) {
  if (!API.ready()) return LAST[f.id] ?? null;
  const p = f.tid && (fxPrevByMonth[m] || []).find((x) => x.tid === f.tid);
  return p && p.amount !== null ? p.amount : null;
}

// 精算の記録
// 7月は精算済み、8月は締めたが未精算 → ホームに「未精算」が出る状態を見せる
let settles = [{ id: 'p1', date: '2026-08-02', month: '2026-07', dir: 'wife_to_me', amount: 38600, method: '振込', memo: '' }];
let settleMonth = '2026-08';   // いま精算しようとしている月
let closed = {
  '2026-07': { amount: 38600, dir: 'wife_to_me' },
  '2026-08': { amount: 42180, dir: 'wife_to_me' },
};

// ===== 計算（仕様書 11 章）=====
function calc(rows) {
  const paid = { me: 0, wife: 0 }, own = { me: 0, wife: 0 };
  let common = 0;
  for (const r of rows) {
    paid[r.payer] += r.amount;
    if (r.share === 'common') common += r.amount; else own[r.share] += r.amount;
  }
  const half = Math.floor(common / 2);
  const burden = { me: half + own.me, wife: half + own.wife };
  const diff = burden.me - paid.me;
  return { paid, own, burden, common, half, amount: Math.abs(diff),
    dir: diff > 0 ? 'me_to_wife' : diff < 0 ? 'wife_to_me' : 'none' };
}
const rowsOf = (r) => r.items.map((i) => ({ amount: i.a, share: i.s, payer: r.payer }));
const monthRows = (m) => receipts.filter((r) => r.month === m).flatMap(rowsOf);
const fxRows = (m) => fxOf(m).filter((f) => f.amount).map((f) => ({ amount: f.amount, share: f.share, payer: f.payer }));

function flowHTML(dir) {
  if (dir === 'none') return '<span class="flow-none">貸し借りなし</span>';
  const [f, t] = dir === 'me_to_wife' ? ['me', 'wife'] : ['wife', 'me'];
  return `<span class="who ${f}">${PERSON[f]}</span><span class="arrow">→</span><span class="who ${t}">${PERSON[t]}</span>`;
}
// 矢印の向きは取り違えやすいので、言葉でも書く
function flowWords(s) {
  if (s.dir === 'none') return '';            // 上に「貸し借りなし」が出るので重ねない
  const [f, t] = s.dir === 'me_to_wife' ? ['me', 'wife'] : ['wife', 'me'];
  return `<b>${PERSON[f]}</b>が<b>${PERSON[t]}</b>に <b>${yen(s.amount)}</b> 渡します`;
}
function shareTotals(rows) {
  const t = { common: 0, me: 0, wife: 0 };
  rows.forEach((r) => { t[r.share] += r.amount; });
  return t;
}
// 帯グラフ。積み上げ順は 共通→私→妻（色の検証はこの順で通している）
function drawTrack(prefix, totals) {
  const base = SHARES.reduce((s, k) => s + Math.abs(totals[k]), 0) || 1;
  SHARES.forEach((k) => {
    $(`#${prefix}g-${k}`).style.width = `${(Math.abs(totals[k]) / base) * 100}%`;
    $(`#${prefix}m-${k}`).textContent = yen(totals[k]);
  });
}

function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2600);
}

// ===== 画面切替 =====
const TABS = ['home', 'list', 'stats', 'settings'];
// 下タブを持たない画面は、どのタブの中にいるかを示す（タブは常に出しておく）
const PARENT = { review: 'home', manual: 'home', detail: 'list', close: 'list', settle: 'home' };
const R = { home: renderHome, review: renderReview, manual: renderManual, list: renderList,
  detail: renderDetail, close: renderClose, stats: renderStats, settle: renderSettle, settings: renderSettings };
let view = 'home';
function go(v) {
  setToday();
  if ((v === 'close' || v === 'list') && view !== v) closeUnlocked = '';   // 締めた月の確認は、開くたびに1回
  view = v;
  document.querySelectorAll('.view').forEach((s) => { s.hidden = s.id !== `v-${v}`; });
  const tab = TABS.includes(v) ? v : (v === 'review' && draft && draft.editId) ? 'list' : PARENT[v];
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
  R[v]?.();
  window.scrollTo(0, 0);
}
// 夜中に開きっぱなしにして翌月に戻ってきたら、今いるタブを今月で描き直す（入力中・締め中の画面は触らない）
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  const old = setToday();
  if (!old || !TABS.includes(view)) return;
  if (month === old) month = THIS_M;
  go(view);
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (!b) return;
  if (b.dataset.mode) draft = makeDraft(b.dataset.mode);
  go(b.dataset.go);
});

// ===== ① ホーム =====
function renderHome() {
  // 月が変わった直後や、相手のスマホで足された分を取りに行き、届いたら描き直す
  if (API.ready()) {
    [THIS_M, PREV_M].forEach((m) => {
      if (loadedMonths.has(m) && isFresh(m)) return;
      fetchMonth(m).then(() => { if (view === 'home') drawHome(); }).catch(() => {});
    });
  }
  drawHome();
}
function drawHome() {
  const s = calc(monthRows(THIS_M));
  $('#home-month').textContent = monthLabel(THIS_M);
  $('#home-amount').textContent = s.amount.toLocaleString('ja-JP');
  $('#home-flow').innerHTML = flowHTML(s.dir);
  $('#home-words').innerHTML = flowWords(s);
  const mine = receipts.filter((r) => r.month === THIS_M);
  $('#home-spend').textContent = yen(monthRows(THIS_M).reduce((t, r) => t + r.amount, 0));
  $('#home-count').textContent = `${mine.length}枚`;
  const un = unpaid();
  $('#home-unpaid').hidden = !(un.amount && un.month);   // 月が分からないものは出さない
  if (un.amount && un.month) {
    $('#unpaid-amt').textContent = yen(un.amount);
    $('#unpaid-sub').textContent = `${monthLabel(un.month)}分・${PERSON[un.dir === 'wife_to_me' ? 'wife' : 'me']}が渡す`;
  }
  // 先月にレシートがあるのに締めていなければ知らせる（月初に忘れやすい）
  const open = !closed[PREV_M] && (!API.ready() || loadedMonths.has(PREV_M))
    && receipts.some((r) => r.month === PREV_M);
  $('#home-close').hidden = !open;
  if (open) $('#close-txt').textContent = `${monthLabel(PREV_M)}はまだ締めていません`;
}
$('#home-close').addEventListener('click', () => { month = PREV_M; go('close'); });
function unpaid() {
  let owed = 0, m = null;
  for (const [k, v] of Object.entries(closed)) {
    const sign = v.dir === 'wife_to_me' ? 1 : -1;
    owed += sign * v.amount;
    if (!m || k > m) m = k;               // 後から古い月を締めても「○月分」は一番新しい月にする
  }
  settles.forEach((p) => { owed -= (p.dir === 'wife_to_me' ? 1 : -1) * p.amount; });
  return { amount: Math.abs(owed), month: m, dir: owed >= 0 ? 'wife_to_me' : 'me_to_wife' };
}

// ===== 写真を撮る（段階2） =====
// 端末内で長辺1200pxに縮めてから送る。通信も保存容量も軽くなる
function shrink(file, maxSide) {
  return new Promise((ok, ng) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); ng(new Error('画像を読み込めません')); };
    img.src = url;
  });
}

$('#camera').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';                       // 同じ写真をもう一度選べるようにする
  if (!file) return;
  let photo;
  try {
    photo = await shrink(file, 1200);
  } catch (err) {
    alert(`写真を扱えませんでした。\n${err.message}`);
    return;
  }
  const today = new Date();
  const d = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  draft = { date: d, store: '', payer: store.get(LS.owner, 'me'), total: 0,
    hasItems: false, fromCamera: true, photo, ocr: 'reading', edited: {},
    items: [{ n: 'お買い物', a: 0, s: 'common', c: 'その他' }] };
  go('review');
  readReceipt(photo);                        // 読み取りは画面を出してから裏で進める
});

// ===== 写真から店名・日付・合計・品目を読む（段階3・Gemini）=====
// 読み取れても必ず人が確かめてから送る。失敗しても手入力で続けられる。
async function readReceipt(photo) {
  if (!API.ready()) { draft.ocr = 'off'; renderReview(); return; }
  const mine = photo;                        // 途中で別の写真に変わったら捨てる
  try {
    const res = await API.call('ocr', { photo });
    if (draft.photo !== mine) return;
    const r = res.read || {};
    const items = (r.items || []).filter((x) => x.amount);
    const ed = draft.edited;                 // 人が先に打った欄は上書きしない
    if (!ed.store && r.store) draft.store = r.store;
    if (!ed.date && r.date) draft.date = r.date;
    draft.dateUnread = !r.date;              // 読めなければ今日のまま。送る前に確かめる
    if (!ed.items && items.length) {
      draft.hasItems = true;
      draft.items = items.map((x) => ({ n: x.item, a: x.amount, s: 'common', c: 'その他' }));
    }
    // 合計が読めなくても品目が読めていればその合計を使う。
    // 0 のままだと「調整（税・割引）」がマイナスで出てしまう
    if (!ed.total) {
      draft.total = r.total || draft.items.reduce((sum, x) => sum + (Number(x.a) || 0), 0);
    }
    draft.ocr = (draft.total || items.length) ? 'done' : 'empty';
  } catch (err) {
    if (draft.photo !== mine) return;
    draft.ocr = 'fail';
    draft.ocrError = err.message;
  }
  renderReview();
}

// ===== ② 確認・仕訳 =====
let draft = null;
function makeDraft(mode) {
  const t = new Date();
  const today = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
  if (mode === 'noitems') {
    return { edited: {}, date: today, store: 'ドトール 三軒茶屋', payer: 'me', total: 880, hasItems: false,
      photo: fakePhoto('ドトール 三軒茶屋'), items: [{ n: 'ドトール 三軒茶屋', a: 880, s: 'common', c: '外食' }] };
  }
  // 手元のレシートに頼らない（1枚も無い人でも押せるように）
  return { edited: {}, date: today, store: 'ライフ 三軒茶屋', payer: 'me', total: 2300, hasItems: true,
    photo: fakePhoto('ライフ 三軒茶屋'),
    items: [
      { n: '牛乳 1L', a: 238, s: 'common', c: '食費' },
      { n: '食パン 6枚', a: 168, s: 'common', c: '食費' },
      { n: '鶏むね肉 500g', a: 498, s: 'common', c: '食費' },
      { n: 'トイレットペーパー 12R', a: 598, s: 'common', c: '日用品' },
      { n: 'スーパードライ 350ml', a: 228, s: 'me', c: '食費' },
      { n: '本麒麟 350ml', a: 158, s: 'wife', c: '食費' },
    ] };
}
const oneLine = () => !draft.hasItems && draft.items.length === 1;
function draftRows() {
  const rows = draft.items.map((i) => ({ ...i, a: Number(i.a) || 0 }));
  if (oneLine()) { rows[0].a = Number(draft.total) || 0; return rows; }   // 明細なし：1行＝合計
  const gap = (Number(draft.total) || 0) - rows.reduce((s, r) => s + r.a, 0);
  if (gap !== 0) rows.push({ n: '調整（税・割引）', a: gap, s: 'common', c: '食費', adjust: true });
  return rows;
}
// いま打っている欄は書き換えない（読み取りの返事が届いても入力を邪魔しない）
function setVal(sel, v) { const el = $(sel); if (el !== document.activeElement) el.value = v; }

// 確認画面の上に出す案内。読み取りの進み具合で変える
function reviewBanner() {
  switch (draft.ocr) {
    case 'reading': return 'レシートを読んでいます…<small>数秒かかります。そのまま待つか、自分で入力しても大丈夫です</small>';
    case 'done':    return draft.dateUnread
      ? '読み取りました<small><b>日付が読めなかったので今日にしています。</b>金額・店名・日付を確かめてください</small>'
      : '読み取りました<small><b>金額と店名を必ず確かめてください。</b>押すと写真を拡大します</small>';
    case 'empty':   return '読み取れませんでした<small>写真は保存されます。合計と店名を入れてください</small>';
    case 'fail':    return `読み取りに失敗しました<small>${esc(draft.ocrError || '')}。手で入力すれば登録できます</small>`;
    case 'off':     return '設定がまだです<small>設定で GAS の URL と合言葉を入れると読み取りが使えます</small>';
    case 'edit':    return '登録済みのレシートを直しています<small>直したら下の「直した内容で保存」を押してください</small>';
    default:        return draft.hasItems ? '' : '明細なしで登録します<small>合計だけの1行です。誰の分かを選んで送ってください</small>';
  }
}
const sendLabel = () => `<svg class="ico"><use href="#i-send"/></svg>${draft && draft.editId ? '直した内容で保存' : '送る'}`;
function renderReview() {
  if (!draft) draft = makeDraft('items');
  $('#r-title').textContent = draft.editId ? 'レシートを直す' : '確認・仕訳';
  $('#r-back').dataset.go = draft.editId ? 'detail' : 'home';
  if (!$('#r-send').disabled) $('#r-send').innerHTML = sendLabel();
  // 案内は写真の見出しの中に出す。写真がなくても案内だけは見せる
  $('#noitems-txt').innerHTML = reviewBanner() || '';
  $('#r-photo').src = draft.photo || '';
  $('#r-photo').hidden = !draft.photo;
  $('#r-shot').hidden = !(draft.photo || reviewBanner());
  setVal('#r-date', draft.date);
  setVal('#r-store', draft.store);
  setVal('#r-total', draft.total || '');
  $('#r-payer').textContent = PERSON[draft.payer];
  $('#add-row-txt').textContent = draft.hasItems ? '行を追加' : '分ける（行を足す）';
  drawRows();
}
function drawRows() {
  const rows = draftRows();
  const ul = $('#r-rows'); ul.innerHTML = '';
  rows.forEach((it, i) => {
    const li = document.createElement('li');
    li.className = `row ${it.s}${it.adjust ? ' adjust' : ''}`;
    li.dataset.i = i;
    const ro = it.adjust ? 'readonly' : '';
    const roAmt = it.adjust || oneLine() ? 'readonly' : '';   // 明細なしの1行は合計と同じ額
    li.innerHTML = `
      <div class="r-main">
        <input class="name" type="text" value="${esc(it.n)}" ${ro}>
        <div class="r-sub">
          <div class="r-amt"><input class="amt" type="number" inputmode="numeric" value="${it.a}" ${roAmt}><span class="cur">円</span></div>
          <button class="cat" type="button" ${it.adjust ? 'disabled' : ''}>${it.c}</button>
        </div>
      </div>
      <button class="share" type="button" ${it.adjust ? 'disabled' : ''} aria-label="誰の分か：${SHARE_LABEL[it.s]}。タップで変更">${it.rule ? '<span class="rule">🔁</span>' : ''}${SHARE_LABEL[it.s]}${it.adjust ? '' : SWAP}</button>
      ${it.adjust ? '<span></span>' : '<button class="del" type="button" aria-label="この品目を消す">×</button>'}`;
    ul.appendChild(li);
  });
  drawTrack('s', shareTotals(rows.map((r) => ({ share: r.s, amount: r.a }))));
}
$('#r-rows').addEventListener('click', (e) => {
  const li = e.target.closest('.row'); const it = li && draft.items[li.dataset.i];
  if (!it) return;
  if (e.target.closest('.share')) { it.s = next(SHARES, it.s); it.rule = false; }
  else if (e.target.closest('.cat')) it.c = next(CATS, it.c);
  else if (e.target.closest('.del')) draft.items.splice(li.dataset.i, 1);
  else return;
  drawRows();
});
$('#r-rows').addEventListener('input', (e) => {
  const li = e.target.closest('.row'); const it = li && draft.items[li.dataset.i];
  if (!it) return;
  draft.edited.items = true;
  if (e.target.classList.contains('name')) it.n = e.target.value;
  if (e.target.classList.contains('amt')) it.a = Number(e.target.value) || 0;
  syncAdjust();
});
// 打っている最中に一覧を作り直すと、打っている欄ごと消える。
// 変わるのは「調整」行の金額と帯だけなので、そこだけ直す。
function syncAdjust() {
  const rows = draftRows();
  const li = $('#r-rows .row.adjust');
  const adj = rows.find((r) => r.adjust);
  if (Boolean(adj) !== Boolean(li)) { drawRows(); return; }   // 行が増減するときだけ作り直す
  if (li && adj) li.querySelector('.amt').value = adj.a;
  if (oneLine()) { const a = $('#r-rows .row .amt'); if (a) a.value = rows[0].a; }
  drawTrack('s', shareTotals(rows.map((r) => ({ share: r.s, amount: r.a }))));
}
$('#bulk').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bulk]'); if (!b) return;
  draft.items.forEach((i) => { i.s = b.dataset.bulk; i.rule = false; });
  drawRows();
});
$('#add-row').addEventListener('click', () => {
  if (oneLine()) draft.items[0].a = Number(draft.total) || 0;   // 分けるときは合計から始める
  draft.items.push({ n: '', a: 0, s: 'common', c: 'その他' }); drawRows();
});
$('#r-total').addEventListener('input', (e) => { draft.edited.total = true; draft.total = Number(e.target.value) || 0; syncAdjust(); });
$('#r-store').addEventListener('input', (e) => { draft.edited.store = true; draft.store = e.target.value.trim(); });
$('#r-date').addEventListener('input',  (e) => { draft.edited.date = true; if (e.target.value) draft.date = e.target.value; });
// 写真をタップで拡大（小さくした代わりに、いつでも大きく見られるように）
$('#r-shot').addEventListener('click', () => {
  if (!draft || !draft.photo) return;
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.innerHTML = `<img src="${draft.photo}" alt="レシートの写真">`;
  box.addEventListener('click', () => box.remove());
  document.body.appendChild(box);
});
$('#r-payer').addEventListener('click', () => { draft.payer = other(draft.payer); $('#r-payer').textContent = PERSON[draft.payer]; });
// 送る直前に画面の値をそのまま読み直す（イベントの取りこぼしに対する最後の砦）
function syncDraft() {
  draft.total = Number($('#r-total').value) || 0;
  draft.store = $('#r-store').value.trim();
  if ($('#r-date').value) draft.date = $('#r-date').value;
  if (oneLine()) { draft.items[0].n = $('#r-rows .row .name')?.value ?? draft.items[0].n; return; }
  document.querySelectorAll('#r-rows .row').forEach((li) => {
    const it = draft.items[li.dataset.i];
    if (!it) return;                                   // 調整行は draft.items にない
    const n = li.querySelector('.name'), a = li.querySelector('.amt');
    if (n) it.n = n.value;
    if (a) it.a = Number(a.value) || 0;
  });
}
$('#r-send').addEventListener('click', async () => {
  syncDraft();
  const rows = draftRows().filter((r) => r.a !== 0 || r.n);
  if (!rows.length) { alert('品目がありません'); return; }
  if (!Number(draft.total)) { alert('合計を入れてください'); $('#r-total').focus(); return; }
  // 円未満（12.5 など）が入ると精算に端数が出るので止める
  if (!Number.isInteger(Number(draft.total)) || rows.some((r) => !Number.isInteger(r.a))) {
    alert('金額は円単位の整数で入れてください（小数点は使えません）'); return;
  }
  if (!API.ready()) { toast('設定で GAS の URL と合言葉を入れてください'); go('settings'); return; }
  if (!checkDate(draft.date, draft.fromCamera && draft.dateUnread && !draft.edited.date)) return;

  const btn = $('#r-send');
  btn.disabled = true; btn.textContent = draft.editId ? '保存中…' : '確認中…';
  try {
    const d = draft;
    const newM = d.date.slice(0, 7);
    const body = toServer(d, rows, store.get(LS.owner, 'me'));
    if (d.editId) {
      // 直す：締めた月にかかるなら先に確かめる（元の月と、日付を変えた先の月の両方）
      const note = closedNote([d.editMonth, newM]);
      if (note && !confirm(`この内容で保存します。${note}`)) return;
      const res = await API.call('update', Object.assign({ receipt_id: d.editId }, body));
      (res.months || [d.editMonth, newM]).forEach(invalidate);
      receipts = receipts.filter((r) => r.id !== d.editId);   // 詳細は保存後の中身を取り直す
      month = newM; openId = d.editId;
      weekOpen.set(weekOf(d.date).start, true);
      reportReclosed(res.reclosed);
      toast('直しました');
      go('detail');
      return;
    }
    if (!(await confirmNew(newM, d.date, Number(d.total)))) return;
    btn.textContent = '送信中…';
    if (d.photo && d.fromCamera) body.photo = d.photo;   // 写真はドライブへ
    const res = await API.call('save', body);
    month = newM;
    weekOpen.set(weekOf(d.date).start, true);   // 保存した週を開いておく（閉じていると見えない）
    invalidate(month);                    // 保存したぶんを必ず読み直す
    reportReclosed(res.reclosed);
    toast(res.photo_saved ? `保存しました（${res.saved}品目・写真つき）` : `保存しました（${res.saved}品目）`);
    go('list');            // 一覧が自分で読み直す。ここで読み直すと二重に取りに行くことになる
  } catch (e) {
    alert(`送れませんでした。\n${e.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = sendLabel();
  }
});

// 日付がおかしくないか（未来の日付・読めずに今日にした日付）
function checkDate(date, unread) {
  if (date > todayStr() && !confirm(`日付が未来（${dayLabel(date)}）になっています。このまま送りますか？`)) return false;
  if (unread && !confirm(`レシートの日付が読めなかったので、今日（${dayLabel(date)}）で登録します。\n\n別の日のレシートなら「キャンセル」を押して日付を直してください。`)) return false;
  return true;
}

// 新しく登録する前の確認：締めた月か、二重登録ではないか
async function confirmNew(m, date, total) {
  // 相手のスマホで今しがた登録したかもしれないので、30秒以内でも必ず最新を見てから比べる
  try { await fetchMonth(m); } catch (e) { /* 見られなくても送れるようにする */ }
  const dup = receipts.find((r) => r.month === m && r.date === date && r.total === total);
  if (dup && !confirm(`同じ日・同じ金額のレシートがもうあります。\n${dayLabel(dup.date)}「${dup.store}」${yen(dup.total)}（${PERSON[dup.payer]}が払った）\n\n相手のスマホで登録済みかもしれません。それでも送りますか？`)) return false;
  const note = closedNote([m]);
  if (note && !confirm(`この内容で送ります。${note}`)) return false;
  return true;
}

// 締めた月にかかるときの注意書き（かからなければ空）
function closedNote(ms) {
  const hit = [...new Set(ms)].filter((m) => m && closed[m]);
  return hit.length
    ? `\n\n⚠️ ${hit.map(monthLabel).join('・')}はもう締めています。\n続けると精算額を計算し直し、差額は「未精算」に足されます。`
    : '';
}
const dirWord = (dir, amt) => (!amt || dir === 'none' ? '貸し借りなし'
  : `${dirText(dir)} ${yen(amt)}`);
// 締めた月の精算が変わったら、前と後を見せる
function reportReclosed(list) {
  const ch = (list || []).filter((c) => c.before !== c.after || c.before_dir !== c.after_dir);
  ch.forEach((c) => { closed[c.month] = { ...(closed[c.month] || {}), amount: c.after, dir: c.after_dir }; });
  if (!ch.length) return;
  alert(ch.map((c) => `${monthLabel(c.month)}の精算を計算し直しました\n${dirWord(c.before_dir, c.before)} → ${dirWord(c.after_dir, c.after)}`).join('\n\n')
    + '\n\n差額はホームの「未精算」に反映されます');
}

// ===== ②' 金額だけ入力 =====
function renderManual() {
  const t = new Date();
  $('#m-date').value = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
  $('#m-amount').value = '';
  $('#m-memo').value = '';
  setManualPayer(store.get(LS.owner, 'me') === 'wife' ? 'wife' : 'me');
  mShare = 'common';
  $('#m-cat').innerHTML = CATS.map((c) => `<option>${c}</option>`).join('');
  drawManualShare();
}
let mShare = 'common';
function drawManualShare() {
  $('#m-row').className = `row ${mShare}`;
  $('#m-share').innerHTML = SHARE_LABEL[mShare] + SWAP;
}
$('#m-share').addEventListener('click', () => { mShare = next(SHARES, mShare); drawManualShare(); });
$('#m-payer').addEventListener('click', (e) => { setManualPayer(other(e.target.dataset.p)); });
function setManualPayer(p) { $('#m-payer').dataset.p = p; $('#m-payer').textContent = PERSON[p]; }

// 手入力を保存する（レシートなしの現金払い・立て替え用）
$('#m-send').addEventListener('click', async () => {
  const amount = Number($('#m-amount').value);
  const date = $('#m-date').value;
  if (!Number.isInteger(amount) || amount === 0) { alert('金額を整数で入れてください'); $('#m-amount').focus(); return; }
  if (!date) { alert('日付を入れてください'); return; }
  if (!API.ready()) { toast('設定で GAS の URL と合言葉を入れてください'); go('settings'); return; }
  if (!checkDate(date, false)) return;

  const btn = $('#m-send');
  btn.disabled = true; btn.textContent = '確認中…';
  try {
    if (!(await confirmNew(date.slice(0, 7), date, amount))) return;
    btn.textContent = '送信中…';
    const memo = $('#m-memo').value.trim() || '（メモなし）';
    const res = await API.call('save', {
      receipt: { date, store: '手入力', total: amount,
        payer: $('#m-payer').dataset.p === 'wife' ? 'wife' : 'me',
        entered_by: store.get(LS.owner, 'me'), has_items: false },
      items: [{ item: memo, amount, share: mShare, category: $('#m-cat').value, rule_applied: false }],
    });
    month = date.slice(0, 7);
    weekOpen.set(weekOf(date).start, true);     // 保存した週を開いておく
    invalidate(month);                    // 保存したぶんを必ず読み直す
    reportReclosed(res.reclosed);
    toast('保存しました');
    go('list');
  } catch (e) {
    alert(`送れませんでした。\n${e.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg class="ico"><use href="#i-send"/></svg>送る';
  }
});

// ===== ③ 明細（レシート単位）=====
let openId = 'r1';
async function renderList() {
  $('#list-month').textContent = monthLabel(month);
  $('#next-m').disabled = month >= THIS_M;
  $('#demo-banner').hidden = API.ready();
  const m = month;

  if (API.ready() && !loadedMonths.has(m)) {     // 初めての月だけ待つ
    clearSummary();                              // 前の月の数字を残さない
    $('#list-cards').innerHTML = '<p class="hint">読み込み中…</p>';
    try { await fetchMonth(m); }
    catch (e) {
      if (month === m) $('#list-cards').innerHTML = `<p class="hint" style="color:var(--danger)">${esc(e.message)}</p>`;
      return;
    }
    if (month !== m) return;                  // 待っている間に月を切り替えられた
  }
  drawList(m);

  // 2回目からは手元のものをすぐ出し、裏で最新を取って差し替える。
  // ただし直前に読んだばかりなら取り直さない（タブを行き来するたびの通信を防ぐ）
  if (API.ready() && loadedMonths.has(m) && !isFresh(m)) {
    $('#list-sync').hidden = false;
    fetchMonth(m)
      .then(() => { if (view === 'list' && month === m) drawList(m); })
      .catch(() => {})
      .finally(() => { $('#list-sync').hidden = true; });
  }
}

// 読み込み中・失敗中に、前の月の数字が新しい月の見出しの下に残らないようにする
function clearSummary() {
  $('#list-sum').textContent = '';
  $('#paid-me').textContent = '—';
  $('#paid-wife').textContent = '—';
  SHARES.forEach((k) => { $(`#lg-${k}`).style.width = '0%'; $(`#lm-${k}`).textContent = '—'; });
  $('#lfx-list').innerHTML = ''; delete $('#lfx-list').dataset.keys; $('#lfx-count').textContent = '';
  $('#list-close-txt').textContent = `${monthLabel(month)}を締める`; $('#list-close-sub').textContent = '読み込み中…';
}

function drawList(m = month) {
  if (m !== month) return;
  const rows = monthRows(m);
  drawTrack('l', shareTotals(rows.map((r) => ({ share: r.share, amount: r.amount }))));
  const paid = calc(rows).paid;          // 実際に財布から出た額（負担額ではない）
  $('#paid-me').textContent = yen(paid.me);
  $('#paid-wife').textContent = yen(paid.wife);
  drawCloseBar(m);
  drawFixedList(m);
  const box = $('#list-cards'); box.innerHTML = '';
  const list = receipts.filter((r) => r.month === m).sort((a, b) => (a.date < b.date ? 1 : -1));
  $('#list-sum').textContent = list.length
    ? `${list.length}枚・${yen(list.reduce((t, r) => t + r.total, 0))}`
    : '';
  if (!list.length) { box.innerHTML = '<p class="hint">この月の明細はまだありません</p>'; return; }
  // 月曜始まりの週ごとにまとめる。月はまたがない（9/1 が火曜なら 9/1〜9/6 が最初の週）
  const weeks = [];
  list.forEach((r) => {
    const w = weekOf(r.date);
    if (!weeks.length || weeks[weeks.length - 1].start !== w.start) weeks.push({ ...w, list: [] });
    weeks[weeks.length - 1].list.push(r);
  });
  const today = todayStr();
  weeks.forEach((w) => {
    const isNow = w.start <= today && today <= w.end;
    // 最初は今週だけ開く。自分で開け閉めした週はそれを覚えておく
    const open = weekOpen.has(w.start) ? weekOpen.get(w.start) : isNow;
    const sec = document.createElement('div');
    sec.className = `week${open ? ' open' : ''}`;
    sec.innerHTML = `
      <button class="wk-head" type="button" data-week="${w.start}" aria-expanded="${open}">
        <span class="caret">▶</span>
        <span class="range">${dayLabel(w.start)}〜${dayLabel(w.end)}${isNow ? '<span class="now">今週</span>' : ''}</span>
        <span class="wk-sum">${w.list.length}枚・${yen(w.list.reduce((t, r) => t + r.total, 0))}</span>
      </button>`;
    if (open) {
      const body = document.createElement('div');
      body.className = 'wk-body';
      let lastDay = '';
      w.list.forEach((r) => {
        if (r.date !== lastDay) {                    // 日付ごとにまとめると探しやすい
          lastDay = r.date;
          const sep = document.createElement('div');
          sep.className = 'daysep';
          sep.innerHTML = `<span>${dayLabel(r.date)}</span><i></i>`;
          body.appendChild(sep);
        }
        body.appendChild(receiptCard(r));
      });
      sec.appendChild(body);
    }
    box.appendChild(sec);
  });
}
// 週の見出しを押したら開け閉めする
const weekOpen = new Map();
$('#list-cards').addEventListener('click', (e) => {
  const h = e.target.closest('[data-week]'); if (!h) return;
  weekOpen.set(h.dataset.week, h.getAttribute('aria-expanded') !== 'true');
  drawList(month);
});
// その日を含む週（月曜〜日曜）。月の外にはみ出す分は切る
function weekOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  const back = (new Date(y, m - 1, d).getDay() + 6) % 7;     // 月曜から何日目か
  const last = new Date(y, m, 0).getDate();
  const s = Math.max(1, d - back), e = Math.min(last, d - back + 6);
  return { start: `${y}-${pad2(m)}-${pad2(s)}`, end: `${y}-${pad2(m)}-${pad2(e)}` };
}
// レシート1枚のカード。写真は一覧では出さず、あるかどうかの印だけ（写真は詳細で見る）
function receiptCard(r) {
  const t = shareTotals(r.items.map((i) => ({ share: i.s, amount: i.a })));
  const base = SHARES.reduce((s, k) => s + Math.abs(t[k]), 0) || 1;
  const b = document.createElement('button');
  b.className = 'rcard'; b.dataset.rid = r.id;
  b.innerHTML = `
    <div>
      <div class="top"><span class="store">${esc(r.store)}</span><span class="total">${yen(r.total)}</span></div>
      <div class="meta"><span class="chip ${r.payer}">${PERSON[r.payer]}</span>${r.hasItems ? `${r.items.length}品目` : '明細なし'}${
        r.photoData || r.hasPhoto ? '<span class="pic"><svg class="ico"><use href="#i-camera"/></svg>写真</span>' : ''}</div>
      <div class="track">${SHARES.map((k) => `<span class="seg ${k}" style="width:${Math.abs(t[k]) / base * 100}%"></span>`).join('')}</div>
    </div>`;
  return b;
}
// ----- 明細の「この月の固定費」チェックリスト -----
// 設定で登録した固定費が毎月空欄で並び、金額を入れるとチェックが付く。月が変わればまた空欄から
function drawFixedList(m) {
  const list = fxOf(m);
  const done = list.filter((f) => f.amount !== null).length;
  $('#lfx-count').textContent = list.length ? `${done} / ${list.length} 件 入力済み` : '未登録';
  $('#lfx-count').classList.toggle('left', done < list.length);   // 入れ忘れがあれば赤字
  if (!list.length) { delete $('#lfx-list').dataset.keys; $('#lfx-list').innerHTML = '<p class="hint">設定の「固定費テンプレート」で登録すると、ここに毎月並びます</p>'; return; }
  drawFxRows($('#lfx-list'), m, list, (f) => `
      <span class="chk">✓</span>
      <div class="lfx-name">${esc(f.name)}<small></small></div>
      <div class="r-amt"><input class="amt" type="number" inputmode="numeric"><span class="cur">円</span></div>
      <button class="lfx-photo" type="button"><svg class="ico"><use href="#i-camera"/></svg></button>`, (el, f) => {
    const on = f.amount !== null;
    el.className = `lfx ${f.share}`;
    el.querySelector('.chk').classList.toggle('on', on);
    el.querySelector('.chk').setAttribute('aria-label', on ? '入力済み' : '未入力');
    el.querySelector('small').textContent = `${PERSON[f.payer]}が払う・${SHARE_LABEL[f.share]}の分`;
    const ph = el.querySelector('.lfx-photo');
    ph.classList.toggle('has', Boolean(f.hasPhoto));
    ph.setAttribute('aria-label', f.hasPhoto ? '写真を見る' : '写真を付ける');
  });
}
// 固定費の行を描く。保存のたびに全部作り直すと、次の欄に打っている途中の数字が消えてしまう。
// なので、並び（どの固定費が何番目か）が同じなら作り直さず、中身だけ書き換える。
// いま打っている欄の数字には触らない
function drawFxRows(box, m, list, shell, fill) {
  const keys = list.map(fxKey).join('|');
  if (box.dataset.keys !== `${m}#${keys}` || box.children.length !== list.length) {
    box.dataset.keys = `${m}#${keys}`;
    box.innerHTML = list.map((f, i) => `<div data-i="${i}">${shell(f)}</div>`).join('');
  }
  list.forEach((f, i) => {
    const el = box.children[i];
    fill(el, f);
    const inp = el.querySelector('.amt');
    if (inp !== document.activeElement) inp.value = f.amount ?? '';
    inp.placeholder = fxHint(m, f);
  });
}
// 固定費の欄は最初は閉じておき、押したら開く（開けた状態はアプリを閉じるまで覚えておく）
let fxOpen = false;
function setFxOpen(open) {
  fxOpen = open;
  $('#lfx-head').setAttribute('aria-expanded', String(open));
  $('#lfx-body').hidden = !open;
}
$('#lfx-head').addEventListener('click', () => setFxOpen(!fxOpen));
const fxKey = (f) => (f.tid ? `t:${f.tid}` : `n:${f.name}`);
let fxPhotoFor = null;                    // どの固定費の写真を選んでいるか
$('#lfx-list').addEventListener('click', async (e) => {
  const b = e.target.closest('.lfx-photo'); if (!b) return;
  const m = month, f = fxOf(m)[b.closest('[data-i]').dataset.i];
  if (!f || !needServer()) return;
  fxPhotoFor = { m, key: fxKey(f), name: f.name, tid: f.tid };
  if (!f.hasPhoto) { $('#lfx-file').click(); return; }
  // 写真があれば大きく見せる。そこから差し替えもできる
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.innerHTML = '<p style="color:#fff">写真を読み込み中…</p><button class="lb-btn" type="button">写真を差し替える</button>';
  box.addEventListener('click', (ev) => {
    if (ev.target.closest('.lb-btn')) $('#lfx-file').click();
    box.remove();
  });
  document.body.appendChild(box);
  try {
    const src = f.photoData || (await API.call('fixedPhoto', { month: m, template_id: f.tid, name: f.name })).photo;
    if (!box.isConnected) return;
    box.querySelector('p').outerHTML = src ? `<img src="${src}" alt="${esc(f.name)}の写真">` : '<p style="color:#fff">写真が見つかりませんでした</p>';
    if (src) f.photoData = src;
  } catch (err) {
    if (box.isConnected) box.querySelector('p').textContent = `読み込めませんでした：${err.message}`;
  }
});
$('#lfx-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  const t = fxPhotoFor;
  if (!file || !t) return;
  let photo;
  try { photo = await shrink(file, 1200); }
  catch (err) { alert(`写真を扱えませんでした。\n${err.message}`); return; }
  toast('写真を保存しています…');
  try {
    await saveFixed(t.m);                 // その月の固定費がまだ保存されていなければ、先に保存する
    await API.call('setFixedPhoto', { month: t.m, template_id: t.tid, name: t.name, photo });
    const cur = fxOf(t.m).find((x) => fxKey(x) === t.key);
    if (cur) { cur.hasPhoto = true; cur.photoData = photo; }
    fetchedAt.delete(t.m);
    toast('写真を付けました');
  } catch (err) {
    alert(`写真を保存できませんでした。\n${err.message}`);
  }
  redrawFx(t.m);
});

// 上に固定した「締める」の帯。締めたか、固定費があと何件かを出す
function drawCloseBar(m) {
  const c = closed[m];
  const left = fxOf(m).filter((f) => f.amount === null).length;
  $('.closebar').classList.toggle('done', Boolean(c));
  $('#list-close-txt').textContent = c ? `${monthLabel(m)}は締め済み` : `${monthLabel(m)}を締める`;
  $('#list-close-sub').textContent = c ? `${dirWord(c.dir, c.amount)}・押すと見直せます`
    : left ? `固定費があと ${left} 件未入力です` : '固定費は全部入っています。押して確定';
}
$('#list-cards').addEventListener('click', (e) => {
  const c = e.target.closest('[data-rid]'); if (!c) return;
  openId = c.dataset.rid; go('detail');
});
$('#refresh-m').addEventListener('click', () => {
  if (!API.ready()) { toast('設定で GAS の URL と合言葉を入れてください'); return; }
  invalidate(month); renderList();
});
// 1か月ずつ動かす（何か月前でも見に行ける。今月より先へは行かない）
const shiftMonth = (m, k) => { const [y, mm] = m.split('-').map(Number); return ymOf(new Date(y, mm - 1 + k, 1)); };
$('#prev-m').addEventListener('click', () => { month = shiftMonth(month, -1); renderList(); });
$('#next-m').addEventListener('click', () => { if (month < THIS_M) { month = shiftMonth(month, 1); renderList(); } });

// ===== ④ レシート詳細 =====
async function renderDetail() {
  let r = receipts.find((x) => x.id === openId);
  if (!r && API.ready()) {                  // 手元に無いときだけ取りに行く
    try {
      const res = await API.call('receipt', { receipt_id: openId });
      r = fromServer(res.receipt);
      if (r.id === openId) receipts = receipts.concat(r);   // 別物なら手元を汚さない
    } catch (e) { /* 取れなければ下で一覧に戻す */ }
  }
  if (!r) { go('list'); return; }
  if (view !== 'detail' || openId !== r.id) return;   // 待っている間に別の画面へ移った
  $('#d-title').textContent = r.store;
  const hasPic = Boolean(r.photoData || r.hasPhoto);
  $('#d-photo-set-txt').textContent = hasPic ? '写真を差し替える' : '写真を付ける';
  $('#d-photo-del').hidden = !hasPic;
  const box = $('#d-photo');
  if (r.photoData) {
    box.innerHTML = `<img class="photo" src="${r.photoData}" alt="${esc(r.store)}のレシート">`;
  } else if (API.ready() && r.hasPhoto) {
    box.innerHTML = '<div class="photo-none">写真を読み込み中…</div>';
    API.call('photo', { receipt_id: r.id }).then((res) => {
      if (openId !== r.id) return;                    // 別のレシートに移っていたら描かない
      if (res.photo) { r.photoData = res.photo; box.innerHTML = `<img class="photo" src="${res.photo}" alt="レシート">`; }
      else box.innerHTML = '<div class="photo-none">写真はありません<br>（2か月を過ぎて自動削除されました）</div>';
    }).catch(() => { box.innerHTML = '<div class="photo-none">写真を読み込めませんでした</div>'; });
  } else {
    box.innerHTML = '<div class="photo-none">写真はありません<br>（「写真を付ける」で追加できます）</div>';
  }
  $('#d-head').innerHTML = `
    <tr><td>日付</td><td>${r.date}</td></tr>
    <tr><td>お店</td><td>${esc(r.store)}</td></tr>
    <tr><td>支払った人</td><td>${PERSON[r.payer]}</td></tr>
    <tr class="total"><td>合計</td><td>${yen(r.total)}</td></tr>`;
  drawSplit(r);
  const ul = $('#d-rows'); ul.innerHTML = '';
  r.items.forEach((it, i) => {
    const li = document.createElement('li');
    li.className = `row ${it.s}`; li.dataset.i = i;
    li.innerHTML = `
      <div class="r-main">
        <span class="static">${esc(it.n)}</span>
        <div class="r-sub"><span class="fixed">${yen(it.a)}</span><span class="catq">${esc(it.c)}</span></div>
      </div>
      <span class="share plain">${SHARE_LABEL[it.s]}</span>`;
    ul.appendChild(li);
  });
}
// 共通を半分にすると 0.5円が出ることがある。レシート1枚では切り捨てずにそのまま見せる
const yenHalf = (v) => (Number.isInteger(v) ? yen(v)
  : `${v.toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}円`);
// このレシートの小計（共通・私・妻）と、1人ずつの負担の計
function drawSplit(r) {
  const t = shareTotals(r.items.map((i) => ({ share: i.s, amount: i.a })));
  const half = t.common / 2;
  const dot = (k) => `<i class="dot ${k}"></i>`;
  $('#d-split').innerHTML = `
    <tr><td>${dot('common')}共通</td><td>${yen(t.common)}</td></tr>
    <tr><td>${dot('me')}${esc(PERSON.me)}の分</td><td>${yen(t.me)}</td></tr>
    <tr><td>${dot('wife')}${esc(PERSON.wife)}の分</td><td>${yen(t.wife)}</td></tr>
    <tr class="total"><td>${esc(PERSON.me)}の負担 計</td><td>${yenHalf(half + t.me)}<small>共通の半分 ${yenHalf(half)} ＋ ${esc(PERSON.me)}の分 ${yen(t.me)}</small></td></tr>
    <tr class="total"><td>${esc(PERSON.wife)}の負担 計</td><td>${yenHalf(half + t.wife)}<small>共通の半分 ${yenHalf(half)} ＋ ${esc(PERSON.wife)}の分 ${yen(t.wife)}</small></td></tr>`;
  const odd = t.common % 2 !== 0;
  $('#d-split-note').hidden = !odd;
  if (odd) $('#d-split-note').textContent = '共通が奇数なので半分に0.5円が出ます。精算では月の合計で1回だけ1円未満を切り捨てます';
}

const ADJUST = '調整（税・割引）';
const openReceipt = () => receipts.find((x) => x.id === openId);
// 書き換える操作は本物のデータにだけ行う
function needServer() {
  if (API.ready()) return true;
  toast('見本のデータは直せません。設定で GAS の URL と合言葉を入れてください');
  return false;
}

// 直す：確認・仕訳の画面を「直す」用に開く
$('#d-edit').addEventListener('click', () => {
  const r = openReceipt();
  if (!r || !needServer()) return;
  draft = { editId: r.id, editMonth: r.month, date: r.date, store: r.store, total: r.total, payer: r.payer,
    hasItems: r.hasItems, photo: r.photoData || '', ocr: 'edit', edited: {},
    // 調整の行は合計との差からその場で作り直すので、持ち込まない
    items: r.items.filter((i) => i.n !== ADJUST).map((i) => ({ ...i })) };
  if (!draft.items.length) draft.items = [{ n: r.store, a: r.total, s: 'common', c: 'その他' }];
  go('review');
});

// 写真を差し替える（写真がなければ付ける）
$('#d-photo-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  const r = openReceipt();
  if (!file || !r || !needServer()) return;
  let photo;
  try { photo = await shrink(file, 1200); }
  catch (err) { alert(`写真を扱えませんでした。\n${err.message}`); return; }
  $('#d-photo').innerHTML = '<div class="photo-none">写真を保存しています…</div>';
  try {
    await API.call('setPhoto', { receipt_id: r.id, photo });
    r.photoData = photo; r.hasPhoto = true;
    invalidate(r.month);
    toast('写真を差し替えました');
  } catch (err) {
    alert(`写真を保存できませんでした。\n${err.message}`);
  }
  if (view === 'detail' && openId === r.id) renderDetail();
});

// 写真だけ消す
$('#d-photo-del').addEventListener('click', async () => {
  const r = openReceipt();
  if (!r || !needServer()) return;
  if (!confirm('このレシートの写真だけを消します。\n金額や品目は残ります。\n（写真はドライブのゴミ箱に移り、30日以内なら戻せます）')) return;
  try {
    await API.call('deletePhoto', { receipt_id: r.id });
    r.photoData = null; r.hasPhoto = false;
    invalidate(r.month);
    toast('写真を消しました');
  } catch (err) {
    alert(`消せませんでした。\n${err.message}`);
  }
  if (view === 'detail' && openId === r.id) renderDetail();
});

// レシートを消す（スプレッドシートの「ゴミ箱」に移す）
$('#d-delete').addEventListener('click', async () => {
  const r = openReceipt();
  if (!r || !needServer()) return;
  if (!confirm(`${dayLabel(r.date)}「${r.store}」${yen(r.total)} を削除します。\n（スプレッドシートの「ゴミ箱」に残るので、あとから戻せます）${closedNote([r.month])}`)) return;
  const btn = $('#d-delete');
  btn.disabled = true;
  try {
    const res = await API.call('delete', { receipt_id: r.id, by: store.get(LS.owner, 'me') });
    receipts = receipts.filter((x) => x.id !== r.id);
    invalidate(r.month);
    month = r.month;
    reportReclosed(res.reclosed);
    toast(res.already ? 'すでに削除されていました' : '削除しました');
    go('list');
  } catch (err) {
    alert(`削除できませんでした。\n${err.message}`);
  } finally {
    btn.disabled = false;
  }
});

// ===== ⑤ 月末締め =====
// 月の初日・末日（「9/1〜9/30 の登録分」と出すため）
function monthRange(m) {
  const [y, mm] = m.split('-').map(Number);
  return `${mm}/1〜${mm}/${new Date(y, mm, 0).getDate()}`;
}
function renderClose() {
  const m = month;                      // 締めるのは「見ている月」。ボタンを押した日ではない
  // まだ読んでいない月（ホームの「締めていません」から来たときなど）は読んでから描き直す
  const loading = API.ready() && !loadedMonths.has(m);
  if (loading) {
    fetchMonth(m).then(() => { if (view === 'close' && month === m) renderClose(); })
      .catch((e) => toast(`読めませんでした：${e.message}`));
  }
  const fxMonthList = fxOf(m);
  $('#c-range').textContent = `${monthLabel(m)}に登録された分（${monthRange(m)}）だけが対象です。今日の日付は関係ありません`;
  drawFxRows($('#fx-list'), m, fxMonthList, (f) => `
      <div class="r-top">
        <span class="static">${esc(f.name)}</span>
        <div class="r-amt"><input class="amt" type="number" inputmode="numeric"><span class="cur">円</span></div>
      </div>
      <p class="need-txt" style="margin:0 0 8px"></p>
      <div class="r-bot">
        <div class="pick payer-col">
          <span class="pick-label">誰が払った？</span>
          <button class="payer" type="button"></button>
        </div>
        <div class="pick share-col">
          <span class="pick-label">誰の分？</span>
          <button class="share" type="button"></button>
        </div>
      </div>`, (el, f) => {
    const need = f.amount === null;
    const last = lastAmount(m, f);
    el.className = `fx ${f.share}${need ? ' need' : ''}`;
    el.querySelector('.need-txt').hidden = !need;
    el.querySelector('.need-txt').textContent = `未入力です${last !== null ? `（先月は ${yen(last)}）` : ''}`;
    const pay = el.querySelector('.payer'), sh = el.querySelector('.share');
    pay.innerHTML = PERSON[f.payer] + SWAP; pay.setAttribute('aria-label', `誰が払ったか：${PERSON[f.payer]}。タップで変更`);
    sh.innerHTML = SHARE_LABEL[f.share] + SWAP; sh.setAttribute('aria-label', `誰の分か：${SHARE_LABEL[f.share]}。タップで変更`);
  });

  const ents = monthRows(m), fx = fxRows(m);
  const s = calc([...ents, ...fx]);
  const left = fxMonthList.filter((f) => f.amount === null).length;

  $('#c-month').textContent = `${monthLabel(m)}の精算`;
  $('#c-amount').textContent = s.amount.toLocaleString('ja-JP');
  $('#c-flow').innerHTML = flowHTML(s.dir);

  const sum = (rows) => rows.reduce((t, r) => t + r.amount, 0);
  $('#c-parts').innerHTML = `
    <tr><td>レシートの明細</td><td>${receipts.filter((r) => r.month === m).length}枚</td><td>${yen(sum(ents))}</td></tr>
    <tr><td>固定費</td><td>${fx.length}件</td><td>${yen(sum(fx))}</td></tr>
    <tr class="total"><td>合計</td><td></td><td>${yen(sum(ents) + sum(fx))}</td></tr>`;

  const d = { me: s.burden.me - s.paid.me, wife: s.burden.wife - s.paid.wife };
  const cell = (v) => `<td class="${v > 0 ? 'pay' : v < 0 ? 'get' : ''}">${v > 0 ? '+' : ''}${yen(v)}</td>`;
  $('#c-table').innerHTML = `
    <thead><tr><th></th><th>${esc(PERSON.me)}</th><th>${esc(PERSON.wife)}</th></tr></thead>
    <tbody>
      <tr><td>払った額</td><td>${yen(s.paid.me)}</td><td>${yen(s.paid.wife)}</td></tr>
      <tr><td>負担する額</td><td>${yen(s.burden.me)}</td><td>${yen(s.burden.wife)}</td></tr>
      <tr class="total"><td>差額</td>${cell(d.me)}${cell(d.wife)}</tr>
    </tbody>`;
  $('#c-note').innerHTML = `共通の合計 ${yen(s.common)} を半分にして 1人 ${yen(s.half)}。`
    + (s.common % 2 ? '<br>共通が奇数のため 1円は精算しません（切り捨て）。' : '')
    + '<br>プラスは渡す側、マイナスは受け取る側です。';

  const c = closed[m];
  $('#c-do').disabled = left > 0 || loading || closing;
  $('#c-do').innerHTML = '<svg class="ico"><use href="#i-lock"/></svg>' + (
    closing ? '締めています…'
    : loading ? '読み込み中…'
    : left > 0 ? `あと ${left} 件の固定費を入れてください`
    : c ? `締め済み（${dirWord(c.dir, c.amount)}）・計算し直す`
    : 'この月を締める');
}

// ----- 固定費の実額をサーバーに保存する -----
// 打つたびに送ると通信が多いので、少し待ってまとめて送る。
// 保存が終わるまでは、サーバーから来た古い中身で上書きしない（fxDirty）
const fxDirty = new Set();
const fxTimers = {};
let fxEdits = 0;                          // 保存中にまた変えたかを見分ける番号
let fxChain = Promise.resolve();          // 保存は1つずつ順番に送る
let closing = false;
let closeUnlocked = '';                   // 変えてよいと確かめた締め済みの月（画面を開くたびに1回）

function saveFixed(m) {
  clearTimeout(fxTimers[m]);
  if (!API.ready()) return Promise.resolve();
  const snap = ++fxEdits;
  const items = fxOf(m).map((f) => ({ template_id: f.tid || '', name: f.name, amount: f.amount, payer: f.payer, share: f.share }));
  fxChain = fxChain.catch(() => {}).then(() => API.call('saveFixed', { month: m, items })).then((res) => {
    if (snap === fxEdits) fxDirty.delete(m);
    fxSaved.add(m);
    fetchedAt.delete(m);                  // 次に開いたとき最新を取り直す
    reportReclosed(res.reclosed);
    redrawFx(m);
    return res;
  });
  return fxChain;
}
function fxChanged(m) {
  fxDirty.add(m); fxEdits++;
  clearTimeout(fxTimers[m]);
  fxTimers[m] = setTimeout(() => {
    saveFixed(m).catch((e) => toast(`固定費を保存できませんでした：${e.message}`));
  }, 800);
  redrawFx(m);
}
// 締めた月を変える前に1回だけ確かめる
// 確認の窓が出ている間に欄から指が離れると、もう一度「変わった」が来る。二重に聞かない
let askingClosed = false;
function okToEditClosed(m) {
  if (!closed[m] || closeUnlocked === m) return true;
  if (askingClosed) return false;
  askingClosed = true;
  try {
    const ok = confirm(`${monthLabel(m)}はもう締めています。\n固定費を変えると精算額を計算し直し、差額は「未精算」に足されます。\n変えますか？`);
    closeUnlocked = ok ? m : '';
  } finally { askingClosed = false; }
  return closeUnlocked === m;
}
// 固定費は「締め」画面と「明細」画面の両方で触れる。いま開いている方を描き直す
function redrawFx(m) {
  if (month !== m) return;
  if (view === 'close') renderClose();
  else if (view === 'list') { drawFixedList(m); drawCloseBar(m); }
}

// 金額を打って欄から離れたら保存する（締め画面・明細画面の両方）
function onFxAmount(e) {
  const d = e.target.closest('[data-i]'); if (!d || !e.target.classList.contains('amt')) return;
  const m = month;
  if (!okToEditClosed(m)) { redrawFx(m); return; }
  const v = e.target.value.trim();
  fxOf(m)[d.dataset.i].amount = v === '' ? null : Math.round(Number(v)) || 0;
  fxChanged(m);
}
$('#fx-list').addEventListener('change', onFxAmount);
$('#lfx-list').addEventListener('change', onFxAmount);
// 固定費も「誰の分？」「誰が払った？」をここで変えられる
$('#fx-list').addEventListener('click', (e) => {
  const d = e.target.closest('.fx'); const f = d && fxOf(month)[d.dataset.i];
  if (!f) return;
  const isShare = e.target.closest('.share'), isPayer = e.target.closest('.payer');
  if (!isShare && !isPayer) return;
  if (!okToEditClosed(month)) return;
  if (isShare) f.share = next(SHARES, f.share); else f.payer = other(f.payer);
  fxChanged(month);
});
$('#fx-add').addEventListener('click', () => {
  if (!okToEditClosed(month)) return;
  // 名前で見分けるので、2つ目からは番号を付けて重ならないようにする
  const list = fxOf(month), base = `${monthLabel(month)}だけの項目`;
  let name = base;
  for (let n = 2; list.some((f) => f.name === name); n++) name = `${base}${n}`;
  list.push({ id: 'tmp' + Date.now(), tid: '', name, kind: 'variable', payer: 'me', share: 'common', amount: null });
  fxChanged(month);
});
$('#c-do').addEventListener('click', async () => {
  const m = month;
  const s = calc([...monthRows(m), ...fxRows(m)]);
  if (!API.ready()) {                      // 見本のときは手元だけで締める
    closed[m] = { amount: s.amount, dir: s.dir };
    settleMonth = m;
    toast(`${monthLabel(m)}を締めました`);
    go('settle');
    return;
  }
  if (closed[m] && !confirm(`${monthLabel(m)}はもう締めています。いまの内容で計算し直しますか？\n差額は「未精算」に足されます。`)) return;
  closing = true; renderClose();
  try {
    await saveFixed(m);                   // 画面の固定費を先に保存してから締める
    const res = await API.call('close', { month: m });
    const got = res.settle;
    closed[m] = { amount: got.amount, dir: got.direction };
    invalidate(m);                        // 締めた内容・未精算を取り直す
    settleMonth = m;
    // 画面で見ていた額とサーバーの額が違う＝相手のスマホで足されていた
    if (got.amount !== s.amount || got.direction !== s.dir) {
      alert(`相手のスマホで登録された分があったため、精算額が画面と変わりました。\n画面：${dirWord(s.dir, s.amount)}\n確定：${dirWord(got.direction, got.amount)}`);
    }
    toast(`${monthLabel(m)}を締めました`);
    go('settle');
  } catch (e) {
    alert(`締められませんでした。\n${e.message}`);
  } finally {
    closing = false;
    if (view === 'close') renderClose();
  }
});

// ===== ⑥ 分析 =====
async function renderStats() {
  await Promise.all([ensureMonth(THIS_M), ensureMonth(PREV_M)]);   // 月が変わった直後でも今月を読んでから描く
  if (view !== 'stats') return;
  drawStats();
}
function drawStats() {
  $('#stats-month').textContent = monthLabel(THIS_M);
  const rowsNow = monthRows(THIS_M);
  const now = rowsNow.reduce((t, r) => t + r.amount, 0);

  // レシートが1枚も無い月に空の枠だけ見せない
  const empty = rowsNow.length === 0;
  $('#stats-empty').hidden = !empty;
  $('#stats-cats').hidden = empty;
  $('#stats-share').hidden = empty;

  if (!empty) {
    // 費目別は1系列なので単色。長さだけで比べ、金額は棒の右に置く
    const by = {};
    receipts.filter((r) => r.month === THIS_M)
      .forEach((r) => r.items.forEach((i) => { by[i.c] = (by[i.c] || 0) + i.a; }));
    // 返品や割引で合計がマイナスになる費目もそのまま出す（消すと内訳が合わなくなる）
    const rows = Object.entries(by).filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
    const max = Math.max(...rows.map((r) => Math.abs(r[1])), 1);
    $('#cat-chart').innerHTML = rows.map(([c, v]) => `
      <div class="bar">
        <span class="catname">${esc(c)}</span>
        <span class="lane"><span class="fill${v < 0 ? ' minus' : ''}" style="width:${Math.max((Math.abs(v) / max) * 100, 2)}%"></span></span>
        <span class="v">${v.toLocaleString('ja-JP')}</span>
      </div>`).join('');

    // 誰のものかは金額だけだと比べにくいので割合も添える
    const t = shareTotals(rowsNow.map((r) => ({ share: r.share, amount: r.amount })));
    const base = SHARES.reduce((sum, k) => sum + Math.abs(t[k]), 0) || 1;
    // 四捨五入すると合計が 101% になることがあるので、最後の1つで端数を吸収する
    let left = 100;
    SHARES.forEach((k, i) => {
      const pct = i === SHARES.length - 1 ? left : Math.round((Math.abs(t[k]) / base) * 100);
      left -= pct;
      $(`#tg-${k}`).style.width = `${(Math.abs(t[k]) / base) * 100}%`;
      $(`#tm-${k}`).textContent = `${yen(t[k])}（${Math.max(pct, 0)}%）`;
    });
  }

  const prev = monthRows(PREV_M).reduce((t, r) => t + r.amount, 0);
  // 今月はまだ途中。月初は「減った」と出やすいので、比べている範囲を書く
  const day = new Date().getDate();
  $('#stats-early').hidden = false;
  $('#stats-early').textContent = `今月は${day}日までの分、先月は1か月分です。月の途中は今月の方が少なく出ます`;
  const diff = now - prev;
  const word = diff > 0 ? '増えた' : diff < 0 ? '減った' : '同じ';
  const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
  $('#compare').innerHTML = `
    <div class="cmprow"><span>今月（${monthLabel(THIS_M)}）</span><b>${yen(now)}</b></div>
    <div class="cmprow"><span>先月（${monthLabel(PREV_M)}）</span><b>${yen(prev)}</b></div>
    <div class="cmprow"><span>差</span><span class="delta ${cls}">${diff > 0 ? '+' : ''}${yen(diff)} ${word}</span></div>`;
}

// ===== ⑦ 精算の記録 =====
function renderSettle() {
  // 相手のスマホで記録した分を取り込む（未精算を二重に渡さないように）
  if (API.ready() && !isFresh(THIS_M)) {
    fetchMonth(THIS_M).then(() => { if (view === 'settle') drawSettle(); }).catch(() => {});
  }
  $('#s-date').value = todayStr();
  $('#s-memo').value = '';
  sTouched = false;
  drawSettle();
}
// 金額や向きを自分で変えたら、あとから届いた最新の値で書き換えない
let sTouched = false;
$('#s-amt').addEventListener('input', () => { sTouched = true; });
function drawSettle() {
  const un = unpaid();
  $('#s-amount').textContent = un.amount.toLocaleString('ja-JP');
  $('#s-flow').innerHTML = un.amount ? flowHTML(un.dir) : '<span class="flow-none">すべて精算済みです</span>';
  $('#s-month').textContent = `${monthLabel(un.month || settleMonth)}分`;
  if (!sTouched) {
    $('#s-amt').value = un.amount || '';
    setSettleDir(un.dir === 'me_to_wife' ? 'me_to_wife' : 'wife_to_me');
  }
  $('#s-hist').innerHTML = settles.length ? settles.slice().reverse().map((p) => `
    <div class="hist" data-pid="${p.id}">
      <div><div class="k">${monthLabel(p.month)}分　${esc(dirText(p.dir))}</div>
      <div class="sub">${p.date} に${p.method}${p.memo ? `・${esc(p.memo)}` : ''}</div></div>
      <div class="v">${yen(p.amount)}</div>
      <button class="del" aria-label="削除">×</button>
    </div>`).join('') : '<p class="hint">まだ記録がありません</p>';
}
$('#s-dir').addEventListener('click', (e) => {
  sTouched = true; setSettleDir(e.target.dataset.dir === 'wife_to_me' ? 'me_to_wife' : 'wife_to_me');
});
function setSettleDir(d) { $('#s-dir').dataset.dir = d; $('#s-dir').textContent = dirText(d); }
$('#s-save').addEventListener('click', async () => {
  const amt = Number($('#s-amt').value);
  const date = $('#s-date').value;
  if (!Number.isInteger(amt) || amt <= 0) { alert('金額を整数で入れてください'); return; }
  if (!date) { alert('日付を入れてください'); return; }
  const un = unpaid();
  if (amt > un.amount && !confirm(`未精算（${yen(un.amount)}）より多い額です。このまま記録しますか？`)) return;
  const p = { month: un.month || settleMonth, date, amount: amt,
    method: $('#s-method').value, memo: $('#s-memo').value.trim(),
    direction: $('#s-dir').dataset.dir === 'me_to_wife' ? 'me_to_wife' : 'wife_to_me' };
  // 向きが逆だと、借りが消えずに倍になる
  if (un.amount && p.direction !== un.dir
    && !confirm(`向きが未精算と逆です（未精算は ${dirText(un.dir)}）。\n逆向きで記録すると、未精算が減らずに増えます。このまま記録しますか？`)) return;
  if (!API.ready()) {                     // 見本のときは手元だけ
    settles.push({ ...p, id: 'p' + Date.now(), dir: p.direction });
    $('#s-memo').value = ''; sTouched = false; drawSettle(); toast('記録しました'); return;
  }
  const btn = $('#s-save'); btn.disabled = true;
  try {
    const res = await API.call('settle', { settle: p });
    settles = res.settles.map(fromSettle);
    fetchedAt.clear();                    // 未精算はどの月の読み込みにも付いてくるので全部古くなる
    $('#s-memo').value = ''; sTouched = false; drawSettle(); toast('記録しました');
  } catch (e) {
    alert(`記録できませんでした。\n${e.message}`);
  } finally { btn.disabled = false; }
});
$('#s-hist').addEventListener('click', async (e) => {
  const h = e.target.closest('[data-pid]');
  if (!h || !e.target.closest('.del')) return;
  const p = settles.find((x) => x.id === h.dataset.pid);
  if (!p || !confirm(`${p.date} の ${yen(p.amount)} の記録を消しますか？\n消すと、その分がまた「未精算」に戻ります。`)) return;
  if (!API.ready()) { settles = settles.filter((x) => x !== p); drawSettle(); return; }
  try {
    const res = await API.call('deleteSettle', { id: p.id });
    settles = res.settles.map(fromSettle);
    fetchedAt.clear();
    drawSettle(); toast('記録を消しました');
  } catch (err) {
    alert(`消せませんでした。\n${err.message}`);
  }
});
const fromSettle = (p) => ({ id: String(p.id), date: p.date, month: p.month, dir: p.direction,
  amount: Number(p.amount) || 0, method: p.method || '', memo: p.memo || '' });

// ===== ⑧ 設定 =====
function renderSettings() {
  $('#cfg-url').value = API.url;
  $('#cfg-secret').value = API.secret;
  $('#cfg-state').innerHTML = API.ready()
    ? '<b style="color:var(--ok)">設定済みです</b>'
    : '未設定です。いまはデモのデータが出ています';
  document.querySelectorAll('input[name="owner"]').forEach((r) => { r.checked = r.value === store.get(LS.owner, 'me'); });
  $('#name-me').value = PERSON.me;
  $('#name-wife').value = PERSON.wife;
  const list = activeTpl();
  $('#tpl-list').innerHTML = list.length ? list.map((t) => `
    <div class="fx ${t.share}" data-id="${esc(t.id)}">
      <div class="r-top">
        <span class="static">${esc(t.name)}</span>
        <div class="r-amt">${t.kind === 'fixed'
          ? `<input class="amt tpl-amt" type="number" inputmode="numeric" value="${t.def}"><span class="cur">円</span>`
          : '<span class="cur">毎月入力</span>'}</div>
        <button class="del tpl-del" type="button" aria-label="${esc(t.name)}を消す">×</button>
      </div>
      <div class="r-bot">
        <div class="pick kind-col">
          <span class="pick-label">種別</span>
          <button class="kind" type="button">${t.kind === 'fixed' ? '定額' : '毎月'}${SWAP}</button>
        </div>
        <div class="pick payer-col">
          <span class="pick-label">誰が払う？</span>
          <button class="payer" type="button" aria-label="誰が払うか：${PERSON[t.payer]}。タップで変更">${PERSON[t.payer]}${SWAP}</button>
        </div>
        <div class="pick share-col">
          <span class="pick-label">誰の分？</span>
          <button class="share" type="button" aria-label="誰の分か：${SHARE_LABEL[t.share]}。タップで変更">${SHARE_LABEL[t.share]}${SWAP}</button>
        </div>
      </div>
    </div>`).join('') : '<p class="hint">まだありません。下から追加してください</p>';
}
const tplOf = (el) => { const d = el.closest('.fx'); return d && templates.find((t) => t.id === d.dataset.id); };

// ----- テンプレートをサーバーに保存する（件数が少ないので丸ごと送る）-----
let tplTimer = null, tplEdits = 0, tplDirty = false;
let tplChain = Promise.resolve();
// redraw=false は金額を打ったとき。作り直すと、次の欄に打ち始めた数字が消えるので描き直さない
function tplChanged(redraw = true) {
  tplDirty = true; tplEdits++;
  // 締めていない月のうち、まだ固定費を保存していない月は、テンプレートから作り直す
  Object.keys(fxByMonth).forEach((mm) => { if (!closed[mm] && !fxSaved.has(mm)) delete fxByMonth[mm]; });
  if (redraw) renderSettings();
  if (!API.ready()) { tplDirty = false; return; }
  clearTimeout(tplTimer);
  tplTimer = setTimeout(() => {
    const snap = tplEdits;
    const body = templates.map((t) => ({ id: t.id, name: t.name, kind: t.kind, amount_default: t.def,
      payer: t.payer, share: t.share, active: t.active !== false }));
    tplChain = tplChain.catch(() => {}).then(() => API.call('saveTemplates', { templates: body }))
      .then(() => { if (snap === tplEdits) tplDirty = false; fetchedAt.clear(); })
      .catch((e) => toast(`固定費を保存できませんでした：${e.message}`));
  }, 700);
}
$('#tpl-list').addEventListener('click', (e) => {
  const t = tplOf(e.target);
  if (!t) return;
  if (e.target.closest('.share')) t.share = next(SHARES, t.share);
  else if (e.target.closest('.payer')) t.payer = other(t.payer);
  else if (e.target.closest('.kind')) t.kind = t.kind === 'fixed' ? 'variable' : 'fixed';
  else if (e.target.closest('.tpl-del')) {
    if (!confirm(`固定費「${t.name}」を消しますか？\n（すでに固定費を入れた月の分は残ります）`)) return;
    templates.splice(templates.indexOf(t), 1);
  } else return;
  tplChanged();
});
$('#tpl-list').addEventListener('change', (e) => {
  const t = tplOf(e.target);
  if (!t || !e.target.classList.contains('tpl-amt')) return;
  t.def = Math.round(Number(e.target.value)) || 0;
  tplChanged(false);
});
$('#tpl-add').addEventListener('click', () => {
  const name = $('#tpl-name').value.trim();
  const v = $('#tpl-amt').value.trim();
  if (!name) { alert('名前を入れてください'); $('#tpl-name').focus(); return; }
  // 金額が空欄なら「毎月入力」（電気代など）、入っていれば「定額」
  templates.push({ id: `f-${Date.now()}`, name: name.slice(0, 40), kind: v === '' ? 'variable' : 'fixed',
    def: Math.round(Number(v)) || 0, payer: store.get(LS.owner, 'me'), share: 'common', active: true });
  $('#tpl-name').value = ''; $('#tpl-amt').value = '';
  tplChanged();
  toast(`「${name}」を追加しました`);
});

// 呼び名を保存する（2台で共通。GAS 未設定ならこのスマホだけ）
$('#name-save').addEventListener('click', async () => {
  const n = { me: cleanName($('#name-me').value, '私'), wife: cleanName($('#name-wife').value, '妻') };
  if (n.me === n.wife) { alert('2人に同じ名前は付けられません（どちらの分か分からなくなるため）'); return; }
  const btn = $('#name-save'); btn.disabled = true;
  try {
    if (API.ready()) {
      const res = await API.call('saveNames', n);
      setNames(res.names);
      fetchedAt.clear();                  // 相手のスマホも次の読み込みで新しい名前になる
    } else setNames(n);
    renderSettings();
    toast(`呼び名を「${PERSON.me}」「${PERSON.wife}」にしました`);
  } catch (e) {
    alert(`保存できませんでした。\n${e.message}`);
  } finally { btn.disabled = false; }
});

document.querySelectorAll('input[name="owner"]').forEach((r) => r.addEventListener('change', (e) => {
  store.set(LS.owner, e.target.value);
  toast(`このスマホは「${PERSON[e.target.value]}」に設定しました`);
}));

$('#cfg-test').addEventListener('click', async () => {
  const st = $('#cfg-state');
  const url = $('#cfg-url').value.trim();

  const bad = urlProblem(url);                 // 貼り間違いをここで止める
  if (bad) { st.innerHTML = `<b style="color:var(--danger)">${esc(bad)}</b>`; return; }
  if (!$('#cfg-secret').value.trim()) {
    st.innerHTML = '<b style="color:var(--danger)">合言葉を入れてください</b>'; return;
  }

  const changed = !API.ready() || API.url !== url;   // 見本からつなぐ・つなぎ先を変える
  store.set(LS.url, url);
  store.set(LS.secret, $('#cfg-secret').value.trim());
  st.textContent = '確かめています…';
  try {
    const res = await API.call('ping');
    st.innerHTML = `<b style="color:var(--ok)">つながりました</b>（シート ${res.sheets.length} 枚）`
      + `<br><small>動いているコード：${esc(res.version || '不明（古い版です。新バージョンでデプロイしてください）')}</small>`;
    toast('つながりました');
    // 見本のデータや前のつなぎ先のデータが残らないよう、読み込み直して本物だけにする
    if (changed) { toast('つながりました。本物のデータを読み込みます'); setTimeout(() => location.reload(), 1200); }
  } catch (e) {
    st.innerHTML = `<b style="color:var(--danger)">${esc(e.message)}</b>`;
  }
});

// ===== サーバーから月を読む =====
// 一度読んだ月は覚えておき、次からは手元のものをすぐ出す（待たせない）
const loadedMonths = new Set();
const fetching = new Map();
const fetchedAt = new Map();
const FRESH_MS = 30000;                 // 30秒以内に読んだ月は取り直さない
let gen = 0;                            // 保存が割り込んだかを見分ける番号

const isFresh = (m) => Date.now() - (fetchedAt.get(m) || 0) < FRESH_MS;

// 保存したら、その月について「読んだ」「新しい」をすべて取り消す。
// 途中の取得も無効にするので、保存前の古い中身をつかまない。
function invalidate(m) {
  fetchedAt.delete(m); loadedMonths.delete(m); fetching.delete(m); gen++;
}

function fetchMonth(m) {
  if (fetching.has(m)) return fetching.get(m);          // 同じ月を二重に取りに行かない
  const g = gen;
  // 自分が登録した取得だけを消す。新しい取得の登録まで消すと二重に走る
  const clear = () => { if (fetching.get(m) === p) fetching.delete(m); };
  let p;
  p = API.call('summary', { month: m }).then(
    (res) => {
      clear();
      if (g !== gen) return fetchMonth(m);              // 途中で保存された。取り直す
      receipts = receipts.filter((r) => r.month !== m).concat(res.receipts.map(fromServer));
      applyServerState(res, m);
      loadedMonths.add(m);
      fetchedAt.set(m, Date.now());
      return res;
    },
    (e) => { clear(); throw e; },
  );
  fetching.set(m, p);
  return p;
}

// 締め・精算の記録・固定費はサーバーが正。読むたびに入れ直して、2台で同じにする
const fxSaved = new Set();              // サーバーに固定費が保存されている月
const fromFixed = (f, i) => ({ id: f.template_id || `x${i}`, tid: f.template_id || '', name: f.name,
  kind: (templates.find((t) => t.id === f.template_id) || {}).kind || 'variable',
  amount: f.amount === null || f.amount === '' ? null : Number(f.amount) || 0, payer: f.payer, share: f.share,
  hasPhoto: Boolean(f.has_photo) });
function applyServerState(res, m) {
  if (!res.closedMonths) {               // 古い版の GAS（段階5より前）。未精算だけ使う
    const u = res.unpaid;
    closed = {};
    if (u && u.amount > 0) closed[u.month] = { amount: u.amount, dir: u.direction };
    settleMonth = (u && u.month) || PREV_M;
    return;
  }
  if (res.names) setNames(res.names);
  closed = {};
  res.closedMonths.forEach((c) => { closed[c.month] = { amount: Number(c.amount) || 0, dir: c.direction, at: c.closed_at }; });
  settles = (res.settles || []).map(fromSettle);
  settleMonth = (res.unpaid && res.unpaid.month) || PREV_M;
  if (!tplDirty) {                       // 自分が変えて保存中なら上書きしない
    templates.length = 0;
    (res.templates || []).forEach((t) => templates.push({ id: t.id, name: t.name, kind: t.kind,
      def: Number(t.amount_default) || 0, payer: t.payer, share: t.share, active: t.active !== false }));
  }
  if (!fxDirty.has(m)) {
    const fx = res.fixed || [];
    if (fx.length || closed[m]) { fxByMonth[m] = fx.map(fromFixed); fxSaved.add(m); }
    else { delete fxByMonth[m]; fxSaved.delete(m); }       // 未保存ならテンプレートから作る
  }
  fxPrevByMonth[m] = (res.fixedPrev || []).map(fromFixed);
}

// まだ読んでいない月だけ取りに行く
function ensureMonth(m) {
  if (!API.ready() || loadedMonths.has(m)) return Promise.resolve();
  return fetchMonth(m).catch(() => {});
}

// ===== 起動時に本物のデータを取り込む =====
// これをしないと、ホーム・分析・月末締めが見本データのままになる
async function boot() {
  if (!API.ready()) return;                       // 未設定なら見本のまま動かす
  // 見本のデータを先に捨てる（本物が入るまで空にしておく）
  receipts = [];
  settles = [];
  closed = {};
  templates.length = 0;
  Object.keys(fxByMonth).forEach((k) => { delete fxByMonth[k]; });
  try {
    await fetchMonth(THIS_M);   // 先月はホームが裏で読む（起動を速くする）
  } catch (e) {
    toast(`データを読めませんでした：${e.message}`);
  }
}

$('#home-demo').hidden = API.ready();             // 見本データで動いている印
boot().then(() => go('home'));
