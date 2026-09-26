/* warikan アプリ本体
   設定に GAS の URL と合言葉が入っていれば本物のデータで動く。
   入っていなければ見本データのまま動いて、画面の見え方だけ確かめられる。 */
'use strict';

// ===== 定数 =====
const SHARES = ['common', 'me', 'wife'];
const SHARE_LABEL = { common: '共通', me: '私', wife: '妻' };
const PERSON = { me: '私', wife: '妻' };
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
const TODAY = new Date();
const THIS_M = ymOf(TODAY);
const PREV_M = ymOf(new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1));
let month = THIS_M;

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
const LAST = { f2: 9840, f3: 4380, f4: 4200 };    // 先月の実額（初期値のヒントに使う）
const LAST0 = { f2: 9120, f3: 5210, f4: 0 };      // 8月の実額（締め済み）
// その月の実額。月ごとに持つ（変動費は未入力＝null から始める）
const blankMonth = () => templates.map((t) => ({ ...t, amount: t.kind === 'fixed' ? t.def : null }));
const fxByMonth = {
  [THIS_M]: blankMonth(),
  [PREV_M]: templates.map((t) => ({ ...t, amount: t.kind === 'fixed' ? t.def : (LAST0[t.id] ?? 0) })),
};
const fxOf = (m) => (fxByMonth[m] ||= blankMonth());

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
  view = v;
  document.querySelectorAll('.view').forEach((s) => { s.hidden = s.id !== `v-${v}`; });
  const tab = TABS.includes(v) ? v : PARENT[v];
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
  R[v]?.();
  window.scrollTo(0, 0);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (!b) return;
  if (b.dataset.mode) draft = makeDraft(b.dataset.mode);
  go(b.dataset.go);
});

// ===== ① ホーム =====
function renderHome() {
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
}
function unpaid() {
  let owed = 0, m = null, dir = 'none';
  for (const [k, v] of Object.entries(closed)) {
    const sign = v.dir === 'wife_to_me' ? 1 : -1;
    owed += sign * v.amount; m = k; dir = v.dir;
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
function draftRows() {
  const rows = draft.items.map((i) => ({ ...i, a: Number(i.a) || 0 }));
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
    case 'done':    return '読み取りました<small><b>金額と店名を必ず確かめてください。</b>押すと写真を拡大します</small>';
    case 'empty':   return '読み取れませんでした<small>写真は保存されます。合計と店名を入れてください</small>';
    case 'fail':    return `読み取りに失敗しました<small>${esc(draft.ocrError || '')}。手で入力すれば登録できます</small>`;
    case 'off':     return '設定がまだです<small>設定で GAS の URL と合言葉を入れると読み取りが使えます</small>';
    default:        return draft.hasItems ? '' : '明細なしで登録します<small>合計だけの1行です。誰の分かを選んで送ってください</small>';
  }
}
function renderReview() {
  if (!draft) draft = makeDraft('items');
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
    li.innerHTML = `
      <div class="r-main">
        <input class="name" type="text" value="${esc(it.n)}" ${ro}>
        <div class="r-sub">
          <div class="r-amt"><input class="amt" type="number" inputmode="numeric" value="${it.a}" ${ro}><span class="cur">円</span></div>
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
  drawTrack('s', shareTotals(rows.map((r) => ({ share: r.s, amount: r.a }))));
}
$('#bulk').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bulk]'); if (!b) return;
  draft.items.forEach((i) => { i.s = b.dataset.bulk; i.rule = false; });
  drawRows();
});
$('#add-row').addEventListener('click', () => {
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
  if (!API.ready()) { toast('設定で GAS の URL と合言葉を入れてください'); go('settings'); return; }

  const btn = $('#r-send');
  btn.disabled = true; btn.textContent = '送信中…';
  try {
    const body = toServer(draft, rows, store.get(LS.owner, 'me'));
    if (draft.photo && draft.fromCamera) body.photo = draft.photo;   // 写真はドライブへ
    const res = await API.call('save', body);
    month = draft.date.slice(0, 7);
    invalidate(month);                    // 保存したぶんを必ず読み直す
    toast(res.photo_saved ? `保存しました（${res.saved}品目・写真つき）` : `保存しました（${res.saved}品目）`);
    go('list');            // 一覧が自分で読み直す。ここで読み直すと二重に取りに行くことになる
  } catch (e) {
    alert(`送れませんでした。\n${e.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg class="ico"><use href="#i-send"/></svg>送る';
  }
});

// ===== ②' 金額だけ入力 =====
function renderManual() {
  const t = new Date();
  $('#m-date').value = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
  $('#m-amount').value = '';
  $('#m-memo').value = '';
  $('#m-payer').textContent = PERSON[store.get(LS.owner, 'me')];
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
$('#m-payer').addEventListener('click', (e) => { e.target.textContent = e.target.textContent === '私' ? '妻' : '私'; });

// 手入力を保存する（レシートなしの現金払い・立て替え用）
$('#m-send').addEventListener('click', async () => {
  const amount = Number($('#m-amount').value);
  const date = $('#m-date').value;
  if (!Number.isInteger(amount) || amount === 0) { alert('金額を整数で入れてください'); $('#m-amount').focus(); return; }
  if (!date) { alert('日付を入れてください'); return; }
  if (!API.ready()) { toast('設定で GAS の URL と合言葉を入れてください'); go('settings'); return; }

  const btn = $('#m-send');
  btn.disabled = true; btn.textContent = '送信中…';
  try {
    const memo = $('#m-memo').value.trim() || '（メモなし）';
    await API.call('save', {
      receipt: { date, store: '手入力', total: amount,
        payer: $('#m-payer').textContent === '妻' ? 'wife' : 'me',
        entered_by: store.get(LS.owner, 'me'), has_items: false },
      items: [{ item: memo, amount, share: mShare, category: $('#m-cat').value, rule_applied: false }],
    });
    month = date.slice(0, 7);
    invalidate(month);                    // 保存したぶんを必ず読み直す
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
}

function drawList(m = month) {
  if (m !== month) return;
  const rows = monthRows(m);
  drawTrack('l', shareTotals(rows.map((r) => ({ share: r.share, amount: r.amount }))));
  const paid = calc(rows).paid;          // 実際に財布から出た額（負担額ではない）
  $('#paid-me').textContent = yen(paid.me);
  $('#paid-wife').textContent = yen(paid.wife);
  const box = $('#list-cards'); box.innerHTML = '';
  const list = receipts.filter((r) => r.month === m).sort((a, b) => (a.date < b.date ? 1 : -1));
  $('#list-sum').textContent = list.length
    ? `${list.length}枚・${yen(list.reduce((t, r) => t + r.total, 0))}`
    : '';
  if (!list.length) { box.innerHTML = '<p class="hint">この月の明細はまだありません</p>'; return; }
  let lastDay = '';
  list.forEach((r) => {
    if (r.date !== lastDay) {                      // 日付ごとにまとめると探しやすい
      lastDay = r.date;
      const sep = document.createElement('div');
      sep.className = 'daysep';
      sep.innerHTML = `<span>${dayLabel(r.date)}</span><i></i>`;
      box.appendChild(sep);
    }
    const t = shareTotals(r.items.map((i) => ({ share: i.s, amount: i.a })));
    const base = SHARES.reduce((s, k) => s + Math.abs(t[k]), 0) || 1;
    const b = document.createElement('button');
    b.className = 'rcard'; b.dataset.rid = r.id;
    b.innerHTML = `
      ${r.photoData ? `<img class="thumb" src="${r.photoData}" alt="">`
        : r.hasPhoto ? '<div class="nophoto has"><svg class="ico"><use href="#i-camera"/></svg>写真</div>'
        : '<div class="nophoto">写真<br>なし</div>'}
      <div>
        <div class="top"><span class="store">${esc(r.store)}</span><span class="total">${yen(r.total)}</span></div>
        <div class="meta"><span class="chip ${r.payer}">${PERSON[r.payer]}</span>${r.hasItems ? `${r.items.length}品目` : '明細なし'}</div>
        <div class="track">${SHARES.map((k) => `<span class="seg ${k}" style="width:${Math.abs(t[k]) / base * 100}%"></span>`).join('')}</div>
      </div>`;
    box.appendChild(b);
  });
}
$('#list-cards').addEventListener('click', (e) => {
  const c = e.target.closest('[data-rid]'); if (!c) return;
  openId = c.dataset.rid; go('detail');
});
$('#refresh-m').addEventListener('click', () => {
  if (!API.ready()) { toast('設定で GAS の URL と合言葉を入れてください'); return; }
  invalidate(month); renderList();
});
$('#prev-m').addEventListener('click', () => { month = PREV_M; renderList(); });
$('#next-m').addEventListener('click', () => { month = THIS_M; renderList(); });

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
  $('#d-title').textContent = r.store;
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
    box.innerHTML = '<div class="photo-none">写真はありません<br>（手入力で登録されたレシートです）</div>';
  }
  $('#d-head').innerHTML = `
    <tr><td>日付</td><td>${r.date}</td></tr>
    <tr><td>お店</td><td>${esc(r.store)}</td></tr>
    <tr><td>支払った人</td><td>${PERSON[r.payer]}</td></tr>
    <tr class="total"><td>合計</td><td>${yen(r.total)}</td></tr>`;
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
// ===== ⑤ 月末締め =====
// 月の初日・末日（「9/1〜9/30 の登録分」と出すため）
function monthRange(m) {
  const [y, mm] = m.split('-').map(Number);
  return `${mm}/1〜${mm}/${new Date(y, mm, 0).getDate()}`;
}
function renderClose() {
  const m = month;                      // 締めるのは「見ている月」。ボタンを押した日ではない
  const fxMonthList = fxOf(m);
  $('#c-range').textContent = `${monthLabel(m)}に登録された分（${monthRange(m)}）だけが対象です。今日の日付は関係ありません`;
  const box = $('#fx-list'); box.innerHTML = '';
  fxMonthList.forEach((f, i) => {
    const need = f.amount === null;
    const d = document.createElement('div');
    d.className = `fx ${f.share}${need ? ' need' : ''}`;
    d.dataset.i = i;
    d.innerHTML = `
      <div class="r-top">
        <span class="static">${esc(f.name)}</span>
        <div class="r-amt"><input class="amt" type="number" inputmode="numeric" value="${f.amount ?? ''}" placeholder="${LAST[f.id] ?? 0}"><span class="cur">円</span></div>
      </div>
      ${need ? `<p class="need-txt" style="margin:0 0 8px">未入力です（先月は ${yen(LAST[f.id] ?? 0)}）</p>` : ''}
      <div class="r-bot">
        <div class="pick payer-col">
          <span class="pick-label">誰が払った？</span>
          <button class="payer" type="button" aria-label="誰が払ったか：${PERSON[f.payer]}。タップで変更">${PERSON[f.payer]}${SWAP}</button>
        </div>
        <div class="pick share-col">
          <span class="pick-label">誰の分？</span>
          <button class="share" type="button" aria-label="誰の分か：${SHARE_LABEL[f.share]}。タップで変更">${SHARE_LABEL[f.share]}${SWAP}</button>
        </div>
      </div>`;
    box.appendChild(d);
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
    <thead><tr><th></th><th>私</th><th>妻</th></tr></thead>
    <tbody>
      <tr><td>払った額</td><td>${yen(s.paid.me)}</td><td>${yen(s.paid.wife)}</td></tr>
      <tr><td>負担する額</td><td>${yen(s.burden.me)}</td><td>${yen(s.burden.wife)}</td></tr>
      <tr class="total"><td>差額</td>${cell(d.me)}${cell(d.wife)}</tr>
    </tbody>`;
  $('#c-note').innerHTML = `共通の合計 ${yen(s.common)} を半分にして 1人 ${yen(s.half)}。`
    + (s.common % 2 ? '<br>共通が奇数のため 1円は精算しません（切り捨て）。' : '')
    + '<br>プラスは渡す側、マイナスは受け取る側です。';

  $('#c-do').disabled = left > 0;
  $('#c-do').innerHTML = left > 0
    ? `<svg class="ico"><use href="#i-lock"/></svg>あと ${left} 件の固定費を入れてください`
    : '<svg class="ico"><use href="#i-lock"/></svg>この月を締める';
}
$('#fx-list').addEventListener('change', (e) => {
  const d = e.target.closest('.fx'); if (!d || !e.target.classList.contains('amt')) return;
  const v = e.target.value.trim();
  fxOf(month)[d.dataset.i].amount = v === '' ? null : Number(v) || 0;
  renderClose();
});
// 固定費も「誰の分？」「誰が払った？」をここで変えられる
$('#fx-list').addEventListener('click', (e) => {
  const d = e.target.closest('.fx'); const f = d && fxOf(month)[d.dataset.i];
  if (!f) return;
  if (e.target.closest('.share')) f.share = next(SHARES, f.share);
  else if (e.target.closest('.payer')) f.payer = other(f.payer);
  else return;
  renderClose();
});
$('#fx-add').addEventListener('click', () => {
  fxOf(month).push({ id: 'tmp' + Date.now(), name: `${monthLabel(month)}だけの項目`, kind: 'variable', payer: 'me', share: 'common', amount: null });
  renderClose();
});
$('#c-do').addEventListener('click', () => {
  const m = month;
  const s = calc([...monthRows(m), ...fxRows(m)]);
  closed[m] = { amount: s.amount, dir: s.dir };
  settleMonth = m;
  toast(`${monthLabel(m)}を締めました`);
  go('settle');
});

// ===== ⑥ 分析 =====
async function renderStats() {
  await ensureMonth(PREV_M);               // 先月との比較に要る
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
  const un = unpaid();
  $('#s-amount').textContent = un.amount.toLocaleString('ja-JP');
  $('#s-flow').innerHTML = un.amount ? flowHTML(un.dir) : '<span class="flow-none">すべて精算済みです</span>';
  $('#s-month').textContent = `${monthLabel(un.month || settleMonth)}分`;
  $('#s-date').value = '2026-10-03';
  $('#s-amt').value = un.amount || '';
  $('#s-dir').textContent = un.dir === 'wife_to_me' ? '妻 → 私' : '私 → 妻';
  $('#s-hist').innerHTML = settles.length ? settles.map((p) => `
    <div class="hist" data-pid="${p.id}">
      <div><div class="k">${monthLabel(p.month)}分　${p.dir === 'wife_to_me' ? '妻 → 私' : '私 → 妻'}</div>
      <div class="sub">${p.date} に${p.method}${p.memo ? `・${esc(p.memo)}` : ''}</div></div>
      <div class="v">${yen(p.amount)}</div>
      <button class="del" aria-label="削除">×</button>
    </div>`).join('') : '<p class="hint">まだ記録がありません</p>';
}
$('#s-dir').addEventListener('click', (e) => { e.target.textContent = e.target.textContent === '妻 → 私' ? '私 → 妻' : '妻 → 私'; });
$('#s-save').addEventListener('click', () => {
  const amt = Number($('#s-amt').value);
  if (!amt) { alert('金額を入れてください'); return; }
  settles.unshift({ id: 'p' + Date.now(), date: $('#s-date').value, month: unpaid().month || settleMonth,
    method: $('#s-method').value, memo: $('#s-memo').value, amount: amt,
    dir: $('#s-dir').textContent === '妻 → 私' ? 'wife_to_me' : 'me_to_wife' });
  $('#s-memo').value = '';
  renderSettle(); toast('記録しました');
});
$('#s-hist').addEventListener('click', (e) => {
  const h = e.target.closest('[data-pid]');
  if (!h || !e.target.closest('.del')) return;
  settles = settles.filter((p) => p.id !== h.dataset.pid);
  renderSettle();
});

// ===== ⑧ 設定 =====
function renderSettings() {
  $('#cfg-url').value = API.url;
  $('#cfg-secret').value = API.secret;
  $('#cfg-state').innerHTML = API.ready()
    ? '<b style="color:var(--ok)">設定済みです</b>'
    : '未設定です。いまはデモのデータが出ています';
  document.querySelectorAll('input[name="owner"]').forEach((r) => { r.checked = r.value === store.get(LS.owner, 'me'); });
  $('#tpl-list').innerHTML = templates.map((t, i) => `
    <div class="fx ${t.share}" data-i="${i}">
      <div class="r-top">
        <span class="static">${esc(t.name)}</span>
        <div class="r-amt">${t.kind === 'fixed'
          ? `<span class="fixed">${yen(t.def)}</span>`
          : '<span class="cur">毎月入力</span>'}</div>
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
    </div>`).join('');
}
$('#tpl-list').addEventListener('click', (e) => {
  const d = e.target.closest('.fx'); const t = d && templates[d.dataset.i];
  if (!t) return;
  if (e.target.closest('.share')) t.share = next(SHARES, t.share);
  else if (e.target.closest('.payer')) t.payer = other(t.payer);
  else if (e.target.closest('.kind')) t.kind = t.kind === 'fixed' ? 'variable' : 'fixed';
  else return;
  // テンプレートを変えたら、まだ締めていない月の分にも反映する
  Object.keys(fxByMonth).forEach((mm) => {
    if (closed[mm]) return;                      // 締め済みの月は触らない
    fxByMonth[mm] = templates.map((x) => {
      const cur = fxByMonth[mm].find((y) => y.id === x.id);
      return { ...x, amount: x.kind === 'fixed' ? x.def : (cur ? cur.amount : null) };
    });
  });
  renderSettings();
});
$('#tpl-add').addEventListener('click', () => toast('固定費の保存は段階5で作ります'));

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

  store.set(LS.url, url);
  store.set(LS.secret, $('#cfg-secret').value.trim());
  st.textContent = '確かめています…';
  try {
    const res = await API.call('ping');
    st.innerHTML = `<b style="color:var(--ok)">つながりました</b>（シート ${res.sheets.length} 枚）`
      + `<br><small>動いているコード：${esc(res.version || '不明（古い版です。新バージョンでデプロイしてください）')}</small>`;
    toast('つながりました');
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
      loadedMonths.add(m);
      fetchedAt.set(m, Date.now());
      return res;
    },
    (e) => { clear(); throw e; },
  );
  fetching.set(m, p);
  return p;
}

// 未精算はサーバーが持つ値。起動時に1回だけ入れる。
// 毎回入れ直すと、手元で締めた内容を消してしまい、向きが逆の未精算が出てしまう。
function applyUnpaid(res) {
  const u = res && res.unpaid;
  closed = {}; settles = [];
  if (u && u.amount > 0) closed[u.month] = { amount: u.amount, dir: u.direction };
  settleMonth = (u && u.month) || PREV_M;
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
    applyUnpaid(await fetchMonth(THIS_M));   // 先月は必要になってから読む（起動を速くする）
  } catch (e) {
    toast(`データを読めませんでした：${e.message}`);
  }
}

$('#home-demo').hidden = API.ready();             // 見本データで動いている印
boot().then(() => go('home'));
