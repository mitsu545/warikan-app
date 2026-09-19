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
function go(v) {
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
  try {
    const photo = await shrink(file, 1200);
    const today = new Date();
    const d = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
    draft = { date: d, store: '', payer: store.get(LS.owner, 'me'), total: 0,
      hasItems: false, fromCamera: true, photo,
      items: [{ n: 'お買い物', a: 0, s: 'common', c: 'その他' }] };
    go('review');
  } catch (err) {
    alert(`写真を扱えませんでした。\n${err.message}`);
  }
});

// ===== ② 確認・仕訳 =====
let draft = null;
function makeDraft(mode) {
  const t = new Date();
  const today = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
  if (mode === 'noitems') {
    return { date: today, store: 'ドトール 三軒茶屋', payer: 'me', total: 880, hasItems: false,
      photo: fakePhoto('ドトール 三軒茶屋'), items: [{ n: 'ドトール 三軒茶屋', a: 880, s: 'common', c: '外食' }] };
  }
  // 手元のレシートに頼らない（1枚も無い人でも押せるように）
  return { date: today, store: 'ライフ 三軒茶屋', payer: 'me', total: 2300, hasItems: true,
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
function renderReview() {
  if (!draft) draft = makeDraft('items');
  $('#noitems-banner').hidden = draft.hasItems;
  $('#noitems-txt').innerHTML = draft.fromCamera
    ? '写真を保存します<small>合計と店名を入れて、誰の分かを選んでください。品目の読み取りは段階3です</small>'
    : '明細が読み取れませんでした<small>合計だけで登録します。区分を選んで送るだけです</small>';
  $('#r-photo').src = draft.photo;
  $('#r-date').value = draft.date;
  $('#r-store').value = draft.store;
  $('#r-total').value = draft.total;
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
      <div class="r-top">
        <input class="name" type="text" value="${esc(it.n)}" ${ro}>
        <div class="r-amt"><input class="amt" type="number" inputmode="numeric" value="${it.a}" ${ro}><span class="cur">円</span></div>
      </div>
      <div class="r-bot">
        <button class="cat" type="button" ${it.adjust ? 'disabled' : ''}>${it.c}</button>
        <button class="share" type="button" ${it.adjust ? 'disabled' : ''} aria-label="誰の分か：${SHARE_LABEL[it.s]}。タップで変更">${it.rule ? '<span class="rule">🔁</span>' : ''}${SHARE_LABEL[it.s]}${it.adjust ? '' : SWAP}</button>
        ${it.adjust ? '' : '<button class="del" type="button" aria-label="削除">×</button>'}
      </div>`;
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
$('#r-total').addEventListener('input', (e) => { draft.total = Number(e.target.value) || 0; drawRows(); });
$('#r-store').addEventListener('input', (e) => { draft.store = e.target.value.trim(); });
$('#r-date').addEventListener('input', (e) => { if (e.target.value) draft.date = e.target.value; });
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

  if (API.ready()) {                       // 本物のデータに入れ替える
    const box = $('#list-cards');
    box.innerHTML = '<p class="hint">読み込み中…</p>';
    try {
      const res = await API.call('summary', { month });
      const got = res.receipts.map(fromServer);
      receipts = receipts.filter((r) => r.month !== month).concat(got);
    } catch (e) {
      box.innerHTML = `<p class="hint" style="color:var(--danger)">${esc(e.message)}</p>`;
      return;
    }
  }

  drawTrack('l', shareTotals(monthRows(month).map((r) => ({ share: r.share, amount: r.amount }))));
  const box = $('#list-cards'); box.innerHTML = '';
  const list = receipts.filter((r) => r.month === month).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!list.length) { box.innerHTML = '<p class="hint">この月の明細はまだありません</p>'; return; }
  list.forEach((r) => {
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
        <div class="meta">${r.date.slice(5).replace('-', '/')}・${PERSON[r.payer]}が支払い・${r.hasItems ? `${r.items.length}品目` : '明細なし'}</div>
        <div class="track">${SHARES.map((k) => `<span class="seg ${k}" style="width:${Math.abs(t[k]) / base * 100}%"></span>`).join('')}</div>
      </div>`;
    box.appendChild(b);
  });
}
$('#list-cards').addEventListener('click', (e) => {
  const c = e.target.closest('[data-rid]'); if (!c) return;
  openId = c.dataset.rid; go('detail');
});
$('#prev-m').addEventListener('click', () => { month = PREV_M; renderList(); });
$('#next-m').addEventListener('click', () => { month = THIS_M; renderList(); });

// ===== ④ レシート詳細 =====
async function renderDetail() {
  if (API.ready()) {
    try {
      const res = await API.call('receipt', { receipt_id: openId });
      const got = fromServer(res.receipt);
      receipts = receipts.map((x) => (x.id === openId ? Object.assign(x, got) : x));
    } catch (e) { /* 取れなければ手元のものを表示する */ }
  }
  const r = receipts.find((x) => x.id === openId);
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
      <div class="r-top">
        <span class="static">${esc(it.n)}</span>
        <div class="r-amt"><span class="fixed">${yen(it.a)}</span></div>
      </div>
      <div class="r-bot">
        <button class="cat" type="button">${it.c}</button>
        <button class="share" type="button" aria-label="誰の分か：${SHARE_LABEL[it.s]}。タップで変更">${SHARE_LABEL[it.s]}${SWAP}</button>
        <button class="del" type="button" aria-label="削除">×</button>
      </div>`;
    ul.appendChild(li);
  });
}
$('#d-rows').addEventListener('click', (e) => {
  const li = e.target.closest('.row'); if (!li) return;
  const r = receipts.find((x) => x.id === openId); const it = r.items[li.dataset.i];
  if (e.target.closest('.share')) it.s = next(SHARES, it.s);
  else if (e.target.closest('.cat')) it.c = next(CATS, it.c);
  else if (e.target.closest('.del')) r.items.splice(li.dataset.i, 1);
  else return;
  renderDetail();
});

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
function renderStats() {
  $('#stats-month').textContent = monthLabel(THIS_M);
  // 費目別は1系列なので単色。値は棒の先に直接置く（薄い色でも読めるように）
  const by = {};
  receipts.filter((r) => r.month === THIS_M).forEach((r) => r.items.forEach((i) => { by[i.c] = (by[i.c] || 0) + i.a; }));
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...rows.map((r) => r[1]), 1);
  $('#cat-chart').innerHTML = rows.map(([c, v]) => `
    <div class="bar-row" title="${c} ${yen(v)}">
      <span class="cat-name">${c}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.max(v / max * 100, 1)}%"></span></span>
      <span class="val">${yen(v)}</span>
    </div>`).join('');

  drawTrack('t', shareTotals(monthRows(THIS_M).map((r) => ({ share: r.share, amount: r.amount }))));

  const now = monthRows(THIS_M).reduce((s, r) => s + r.amount, 0);
  const prev = monthRows(PREV_M).reduce((s, r) => s + r.amount, 0);
  const diff = now - prev;
  $('#compare').innerHTML = `
    <div class="compare"><span class="k">今月（${monthLabel(THIS_M)}）</span><span class="v">${yen(now)}</span></div>
    <div class="compare"><span class="k">先月（${monthLabel(PREV_M)}）</span><span class="v">${yen(prev)}</span></div>
    <div class="compare"><span class="k">差</span><span class="delta ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '+' : ''}${yen(diff)}</span></div>`;
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
    st.innerHTML = `<b style="color:var(--ok)">つながりました</b>（シート ${res.sheets.length} 枚を確認）`;
    toast('つながりました');
  } catch (e) {
    st.innerHTML = `<b style="color:var(--danger)">${esc(e.message)}</b>`;
  }
});

// ===== 起動時に本物のデータを取り込む =====
// これをしないと、ホーム・分析・月末締めが見本データのままになる
async function boot() {
  if (!API.ready()) return;                       // 未設定なら見本のまま動かす
  try {
    const [cur, prev] = await Promise.all([
      API.call('summary', { month: THIS_M }),
      API.call('summary', { month: PREV_M }),
    ]);
    receipts = [...cur.receipts, ...prev.receipts].map(fromServer);

    // 見本の精算・固定費を捨てる（本物が入るまで空にしておく）
    settles = [];
    closed = {};
    const u = cur.unpaid;
    if (u && u.amount > 0) closed[u.month] = { amount: u.amount, dir: u.direction };
    settleMonth = (u && u.month) || PREV_M;
    templates.length = 0;
    Object.keys(fxByMonth).forEach((k) => { delete fxByMonth[k]; });
  } catch (e) {
    toast(`データを読めませんでした：${e.message}`);
  }
}

$('#home-demo').hidden = API.ready();             // 見本データで動いている印
boot().then(() => go('home'));
