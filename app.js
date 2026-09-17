// warikan-app v1 段階1：GAS なし・ダミーデータで「撮る → 仕訳 → 精算額」を動かす
'use strict';

// ===== 定数 =====
const SHARES = ['common', 'me', 'wife'];                 // タップで回る順
const SHARE_LABEL = { common: '共通', me: '私', wife: '妻' };
const PERSON_LABEL = { me: '私', wife: '妻' };
const LS = { settings: 'warikan.settings', entries: 'warikan.entries', draft: 'warikan.draft' };

// ===== 端末内の保存（localStorage）=====
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
};
let settings = store.get(LS.settings, { owner: 'me' });   // このスマホの持ち主
let entries = store.get(LS.entries, []);                  // 送信済みの明細（仕様書 7 章の列）
let draft = store.get(LS.draft, null);                    // 確認中のレシート（未送信）

// ===== 小道具 =====
const $ = (sel) => document.querySelector(sel);
const pad2 = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fmtDateTime = (d) => `${fmtDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const today = () => fmtDate(new Date());
const thisMonth = () => today().slice(0, 7);
const yen = (n) => `${n.toLocaleString('ja-JP')}円`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nextShare = (s) => SHARES[(SHARES.indexOf(s) + 1) % SHARES.length];
const otherPerson = (p) => (p === 'me' ? 'wife' : 'me');

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2500);
}

// ===== 精算の計算（仕様書 6 章）=====
// 自分の負担（共通の月合計÷2 切り捨て ＋ 自分専用分）− 自分が払った額 ＝ 相手に渡す額
function settlement(month) {
  const paid = { me: 0, wife: 0 }, own = { me: 0, wife: 0 };
  let common = 0;
  for (const e of entries.filter((e) => e.month === month)) {
    paid[e.payer] += e.amount;
    if (e.share === 'common') common += e.amount; else own[e.share] += e.amount;
  }
  const half = Math.floor(common / 2);
  const burden = { me: half + own.me, wife: half + own.wife };
  const diff = burden.me - paid.me;   // 正なら私 → 妻、負なら妻 → 私
  return { paid, burden, amount: Math.abs(diff), direction: diff > 0 ? 'me_to_wife' : diff < 0 ? 'wife_to_me' : 'none' };
}
function settleText(month) {
  const s = settlement(month);
  if (s.direction === 'none') return '今月の精算：0円（貸し借りなし）';
  const [from, to] = s.direction === 'me_to_wife' ? ['私', '妻'] : ['妻', '私'];
  return `今月の精算：${from} → ${to} ${yen(s.amount)}`;
}

// ===== 画面切替 =====
function show(view) {
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${view}`; });
  if (view === 'home') renderHome();
  if (view === 'review') renderReview();
  if (view === 'manual') renderManual();
  if (view === 'list') renderList();
  if (view === 'settings') renderSettings();
  window.scrollTo(0, 0);
}
document.addEventListener('click', (ev) => {
  const nav = ev.target.closest('[data-nav]');
  if (nav) show(nav.dataset.nav);
});

// ===== ① ホーム =====
function renderHome() {
  $('#home-settle').textContent = settleText(thisMonth());
  $('#home-draft').hidden = !draft;
}

// ===== 撮る → 縮小 → （ダミー）読み取り → 確認へ =====
$('#camera').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';                       // 同じ写真をもう一度選べるようにリセット
  if (!file) return;
  try {
    const image = await shrink(file, 1200);   // 長辺 1200px の JPEG（base64）
    draft = dummyParse(image);                // ⚠️ 段階3で GAS の parse に置き換える
    saveDraft();
    show('review');
  } catch (err) {
    alert(`画像の処理に失敗しました：${err.message}`);
  }
});

// Canvas で縮小して JPEG の base64 を返す
function shrink(file, maxSide) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み込めません')); };
    img.src = url;
  });
}

// ダミーの読み取り結果（GAS の parse と同じ形）。合計と品目合計をわざとずらして「調整」行を試せるようにしている
function dummyParse(image) {
  return {
    receipt_id: `r-${today().replace(/-/g, '')}-${String(Date.now()).slice(-3)}`,
    date: today(),
    store: 'ライフ 三軒茶屋',
    payer: settings.owner,
    total: 2199,
    image,
    items: [
      { item: 'スーパードライ 350ml', amount: 228, share: 'me', rule: true },
      { item: '本麒麟 350ml', amount: 158, share: 'wife', rule: true },
      { item: '牛乳 1L', amount: 238, share: 'common' },
      { item: '食パン 6枚', amount: 168, share: 'common' },
      { item: '鶏むね肉 500g', amount: 498, share: 'common' },
      { item: 'トイレットペーパー 12R', amount: 598, share: 'common' },
      { item: 'ヨーグルト', amount: 198, share: 'common' },
      { item: '割引', amount: -50, share: 'common' },
    ],
  };
}
function saveDraft() {
  // 画像は大きいので端末保存から外す（再送時に画像は不要）
  store.set(LS.draft, draft ? { ...draft, image: null } : null);
}

// ===== ② 確認・仕訳 =====
// 品目合計とレシート合計の差を「調整」行として足したリストを返す
function draftRows() {
  const rows = draft.items.map((it) => ({ ...it, amount: Number(it.amount) || 0 }));
  const sum = rows.reduce((s, r) => s + r.amount, 0);
  const adjust = (Number(draft.total) || 0) - sum;
  if (adjust !== 0) rows.push({ item: '調整（税・割引）', amount: adjust, share: 'common', adjust: true });
  return rows;
}

function renderReview() {
  if (!draft) { show('home'); return; }
  const thumb = $('#thumb');
  thumb.hidden = !draft.image;
  if (draft.image) thumb.src = draft.image;
  $('#r-date').value = draft.date;
  $('#r-store').value = draft.store;
  $('#r-total').value = draft.total;
  $('#r-payer').textContent = `支払: ${PERSON_LABEL[draft.payer]}`;
  renderRows();
}

function renderRows() {
  const ul = $('#rows');
  ul.innerHTML = '';
  draftRows().forEach((it, idx) => {
    const li = document.createElement('li');
    li.className = `row ${it.share}${it.adjust ? ' adjust' : ''}`;
    li.dataset.idx = idx;
    const ro = it.adjust ? 'readonly' : '';
    li.innerHTML = `
      <input class="name" type="text" value="${esc(it.item)}" ${ro}>
      <input class="amt" type="number" inputmode="numeric" value="${it.amount}" ${ro}>
      <button class="share" type="button" ${it.adjust ? 'disabled' : ''}>${it.rule ? '🔁' : ''}${SHARE_LABEL[it.share]}</button>
      ${it.adjust ? '' : '<button class="del" type="button" aria-label="削除">×</button>'}`;
    ul.appendChild(li);
  });
}

// 行の操作（区分タップ・削除・編集）
$('#rows').addEventListener('click', (ev) => {
  const li = ev.target.closest('.row');
  if (!li) return;
  const it = draft.items[li.dataset.idx];
  if (!it) return;                                   // 調整行は対象外
  if (ev.target.classList.contains('share')) {
    it.share = nextShare(it.share);
    it.rule = false;                                 // 手で変えたらルール印は消す
  } else if (ev.target.classList.contains('del')) {
    draft.items.splice(li.dataset.idx, 1);
  } else return;
  saveDraft();
  renderRows();
});
$('#rows').addEventListener('change', (ev) => {
  const li = ev.target.closest('.row');
  const it = li && draft.items[li.dataset.idx];
  if (!it) return;
  if (ev.target.classList.contains('name')) it.item = ev.target.value.trim();
  if (ev.target.classList.contains('amt')) it.amount = Number(ev.target.value) || 0;
  saveDraft();
  renderRows();                                      // 調整行を計算し直す
});
$('#add-row').addEventListener('click', () => {
  draft.items.push({ item: '', amount: 0, share: 'common' });
  saveDraft();
  renderRows();
  $('#rows .row:last-of-type .name')?.focus();
});

// ヘッダの編集
$('#r-date').addEventListener('change', (ev) => { draft.date = ev.target.value; saveDraft(); });
$('#r-store').addEventListener('change', (ev) => { draft.store = ev.target.value.trim(); saveDraft(); });
$('#r-total').addEventListener('change', (ev) => { draft.total = Number(ev.target.value) || 0; saveDraft(); renderRows(); });
$('#r-payer').addEventListener('click', () => {
  draft.payer = otherPerson(draft.payer);
  $('#r-payer').textContent = `支払: ${PERSON_LABEL[draft.payer]}`;
  saveDraft();
});

// 送る（段階1は端末内に保存するだけ。段階2で GAS の save を呼ぶ）
$('#send').addEventListener('click', () => {
  if (!draft.date) { alert('日付を入れてください'); return; }
  const rows = draftRows().filter((r) => r.amount !== 0 || r.item);
  if (rows.length === 0) { alert('品目がありません'); return; }
  const now = new Date();
  rows.forEach((r, i) => entries.push({
    id: `${draft.receipt_id}-${pad2(i + 1)}`,
    receipt_id: draft.receipt_id,
    date: draft.date,
    store: draft.store,
    item: r.item,
    amount: r.amount,
    payer: draft.payer,
    share: r.share,
    entered_by: settings.owner,
    created_at: fmtDateTime(now),
    month: draft.date.slice(0, 7),
  }));
  store.set(LS.entries, entries);
  const month = draft.date.slice(0, 7);
  draft = null;
  saveDraft();
  show('home');
  toast(settleText(month));
});

// ===== ②' 金額だけ入力 =====
const manual = { share: 'common', payer: 'me' };
function renderManual() {
  manual.share = 'common';
  manual.payer = settings.owner;
  $('#m-amount').value = '';
  $('#m-memo').value = '';
  $('#m-date').value = today();
  $('#m-share').textContent = SHARE_LABEL[manual.share];
  $('#m-payer').textContent = PERSON_LABEL[manual.payer];
}
$('#m-share').addEventListener('click', () => { manual.share = nextShare(manual.share); $('#m-share').textContent = SHARE_LABEL[manual.share]; });
$('#m-payer').addEventListener('click', () => { manual.payer = otherPerson(manual.payer); $('#m-payer').textContent = PERSON_LABEL[manual.payer]; });
$('#m-send').addEventListener('click', () => {
  const amount = Number($('#m-amount').value);
  const date = $('#m-date').value;
  if (!Number.isInteger(amount) || amount === 0) { alert('金額を整数で入れてください'); return; }
  if (!date) { alert('日付を入れてください'); return; }
  const rid = `m-${date.replace(/-/g, '')}-${String(Date.now()).slice(-3)}`;
  entries.push({
    id: `${rid}-01`, receipt_id: rid, date, store: '手入力',
    item: $('#m-memo').value.trim() || '（メモなし）', amount,
    payer: manual.payer, share: manual.share, entered_by: settings.owner,
    created_at: fmtDateTime(new Date()), month: date.slice(0, 7),
  });
  store.set(LS.entries, entries);
  show('home');
  toast(settleText(date.slice(0, 7)));
});

// ===== ③ 今月の一覧 =====
function renderList() {
  const month = thisMonth();
  $('#list-settle').textContent = settleText(month);
  const ul = $('#list-rows');
  ul.innerHTML = '';
  const rows = entries.filter((e) => e.month === month).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (rows.length === 0) { ul.innerHTML = '<li class="hint">まだ明細がありません</li>'; return; }
  rows.forEach((e) => {
    const li = document.createElement('li');
    li.className = `row ${e.share}`;
    li.dataset.id = e.id;
    li.innerHTML = `
      <div><div>${esc(e.item)}</div><div class="meta">${e.date.slice(5).replace('-', '/')} ${esc(e.store)}・支払 ${PERSON_LABEL[e.payer]}</div></div>
      <div class="amt">${yen(e.amount)}</div>
      <button class="share" type="button">${SHARE_LABEL[e.share]}</button>
      <button class="del" type="button" aria-label="削除">×</button>`;
    ul.appendChild(li);
  });
}
$('#list-rows').addEventListener('click', (ev) => {
  const li = ev.target.closest('.row');
  const e = li && entries.find((x) => x.id === li.dataset.id);
  if (!e) return;
  if (ev.target.classList.contains('share')) {
    e.share = nextShare(e.share);
  } else if (ev.target.classList.contains('del')) {
    if (!confirm(`「${e.item}」を削除しますか？`)) return;
    entries = entries.filter((x) => x.id !== e.id);
  } else return;
  store.set(LS.entries, entries);
  renderList();
});

// ===== ⑤ 設定 =====
function renderSettings() {
  document.querySelectorAll('input[name="owner"]').forEach((r) => { r.checked = r.value === settings.owner; });
}
document.querySelectorAll('input[name="owner"]').forEach((r) => r.addEventListener('change', (ev) => {
  settings.owner = ev.target.value;
  store.set(LS.settings, settings);
  toast(`このスマホは「${PERSON_LABEL[settings.owner]}」に設定しました`);
}));
$('#clear-all').addEventListener('click', () => {
  if (!confirm('端末内の明細・下書きを全部消します。よろしいですか？')) return;
  entries = []; draft = null;
  store.set(LS.entries, entries); saveDraft();
  show('home');
  toast('消しました');
});

// ===== 起動 =====
show('home');
