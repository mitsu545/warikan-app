// warikan-app v1 段階1：GAS なし・ダミーデータで「撮る → 仕訳 → 精算額」を動かす
'use strict';

// ===== 定数 =====
const SHARES = ['common', 'me', 'wife'];                 // タップで回る順
const SHARE_LABEL = { common: '共通', me: '私', wife: '妻' };
const PERSON_LABEL = { me: '私', wife: '妻' };
const LS = {
  settings: 'warikan.settings', entries: 'warikan.entries', draft: 'warikan.draft',
  fixed: 'warikan.fixed', closes: 'warikan.closes',
};

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
let fixedCosts = store.get(LS.fixed, []);                 // 固定費（家賃・光熱費・サブスク）
let closes = store.get(LS.closes, {});                    // 締めた月の記録（月をキーにする）
let viewMonth = null;                                     // 明細・締めで見ている月

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
function calc(rows) {
  const paid = { me: 0, wife: 0 }, own = { me: 0, wife: 0 };
  let common = 0;
  for (const r of rows) {
    paid[r.payer] += r.amount;
    if (r.share === 'common') common += r.amount; else own[r.share] += r.amount;
  }
  const half = Math.floor(common / 2);   // 端数は切り捨て（月合計で1回だけ）
  const burden = { me: half + own.me, wife: half + own.wife };
  const diff = burden.me - paid.me;      // 正なら私 → 妻、負なら妻 → 私
  return { paid, own, burden, common, half,
    amount: Math.abs(diff), direction: diff > 0 ? 'me_to_wife' : diff < 0 ? 'wife_to_me' : 'none' };
}
const monthEntries = (month) => entries.filter((e) => e.month === month);
const activeFixed = () => fixedCosts.filter((f) => f.active && f.amount);
// ホームと一覧はレシート分だけ。固定費は「締める」時に足す（仕様書 5-4）
const settlement = (month) => calc(monthEntries(month));
function settleText(month) {
  const s = settlement(month);
  const head = month === thisMonth() ? '今月の精算' : `${monthLabel(month)}の精算`;
  if (s.direction === 'none') return `${head}：0円（貸し借りなし）`;
  const [from, to] = s.direction === 'me_to_wife' ? ['私', '妻'] : ['妻', '私'];
  return `${head}：${from} → ${to} ${yen(s.amount)}`;
}

// ===== 画面切替 =====
const TAB_VIEWS = ['home', 'list', 'settings'];
function show(view) {
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${view}`; });
  // 作業中の画面（確認・仕訳／金額だけ入力）ではタブバーを隠して集中できるようにする
  const useTab = TAB_VIEWS.includes(view);
  $('#tabbar').hidden = !useTab;
  document.body.classList.toggle('has-tabbar', useTab);
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === view));
  if (view === 'home') renderHome();
  if (view === 'review') renderReview();
  if (view === 'manual') renderManual();
  if (view === 'list') renderList();
  if (view === 'close') renderClose();
  if (view === 'settings') renderSettings();
  window.scrollTo(0, 0);
}
document.addEventListener('click', (ev) => {
  const nav = ev.target.closest('[data-nav]');
  if (nav) show(nav.dataset.nav);
});

// ===== ① ホーム =====
function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function flowHTML(direction) {
  if (direction === 'none') return '<span class="flow-none">貸し借りなし</span>';
  const [from, to] = direction === 'me_to_wife' ? ['me', 'wife'] : ['wife', 'me'];
  return `<span class="who ${from}">${PERSON_LABEL[from]}</span><span class="arrow">→</span><span class="who ${to}">${PERSON_LABEL[to]}</span>`;
}
function monthLabel(month) {
  const [y, m] = month.split('-');
  return `${y}年${Number(m)}月`;
}
function renderHome() {
  const s = settlement(thisMonth());
  $('#home-month').textContent = monthLabel(thisMonth());
  $('#home-amount').textContent = s.amount.toLocaleString('ja-JP');
  $('#home-flow').innerHTML = flowHTML(s.direction);
  $('#home-fixed-note').hidden = activeFixed().length === 0;
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
  $('#r-payer').textContent = PERSON_LABEL[draft.payer];
  renderRows();
}

function renderRows() {
  const ul = $('#rows');
  const rows = draftRows();
  ul.innerHTML = '';
  rows.forEach((it, idx) => {
    const li = document.createElement('li');
    li.className = `row ${it.share}${it.adjust ? ' adjust' : ''}`;
    li.dataset.idx = idx;
    const ro = it.adjust ? 'readonly' : '';
    li.innerHTML = `
      <input class="name" type="text" value="${esc(it.item)}" ${ro}>
      <div class="ctrl">
        <input class="amt" type="number" inputmode="numeric" value="${it.amount}" ${ro}>
        <span class="cur">円</span>
        <button class="share" type="button" ${it.adjust ? 'disabled' : ''}>${it.rule ? '<span class="rule">🔁</span>' : ''}${SHARE_LABEL[it.share]}</button>
        ${it.adjust ? '' : '<button class="del" type="button" aria-label="削除">×</button>'}
      </div>`;
    ul.appendChild(li);
  });
  renderSumbar(rows);
}

// 共通・私・妻の内訳を帯グラフで表示（マイナス金額は幅の計算だけ絶対値にする）
function renderSumbar(rows) {
  const total = { common: 0, me: 0, wife: 0 };
  rows.forEach((r) => { total[r.share] += r.amount; });
  const base = SHARES.reduce((s, k) => s + Math.abs(total[k]), 0) || 1;
  SHARES.forEach((k) => {
    $(`#seg-${k}`).style.width = `${(Math.abs(total[k]) / base) * 100}%`;
    $(`#sum-${k}`).textContent = yen(total[k]);
  });
}

// 行の操作（区分タップ・削除・編集）
$('#rows').addEventListener('click', (ev) => {
  const li = ev.target.closest('.row');
  if (!li) return;
  const it = draft.items[li.dataset.idx];
  if (!it) return;                                   // 調整行は対象外
  if (ev.target.closest('.share')) {
    it.share = nextShare(it.share);
    it.rule = false;                                 // 手で変えたらルール印は消す
  } else if (ev.target.closest('.del')) {
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
// まとめて区分を変える（自分の分だけのレシートを1タップで終わらせる）
$('#bulk').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-bulk]');
  if (!btn || !draft) return;
  draft.items.forEach((it) => { it.share = btn.dataset.bulk; it.rule = false; });
  saveDraft();
  renderRows();
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
  $('#r-payer').textContent = PERSON_LABEL[draft.payer];
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
  viewMonth = month;
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
  viewMonth = date.slice(0, 7);
  show('home');
  toast(settleText(date.slice(0, 7)));
});

// ===== ③ 今月の一覧 =====
function renderList() {
  const month = viewMonth || (viewMonth = thisMonth());
  $('#list-month').textContent = monthLabel(month);
  $('#list-settle').textContent = settleText(month);
  $('#next-month').disabled = month >= thisMonth();      // 未来の月は見ない
  const ul = $('#list-rows');
  ul.innerHTML = '';
  const rows = monthEntries(month).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (rows.length === 0) { ul.innerHTML = '<li class="hint">この月の明細はまだありません</li>'; return; }
  rows.forEach((e) => {
    const li = document.createElement('li');
    li.className = `row ${e.share}`;
    li.dataset.id = e.id;
    li.innerHTML = `
      <div><div class="name-static">${esc(e.item)}</div><div class="meta">${e.date.slice(5).replace('-', '/')} ${esc(e.store)}・支払 ${PERSON_LABEL[e.payer]}</div></div>
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
  if (ev.target.closest('.share')) {
    e.share = nextShare(e.share);
  } else if (ev.target.closest('.del')) {
    if (!confirm(`「${e.item}」を削除しますか？`)) return;
    entries = entries.filter((x) => x.id !== e.id);
  } else return;
  store.set(LS.entries, entries);
  renderList();
});

$('#prev-month').addEventListener('click', () => { viewMonth = shiftMonth(viewMonth, -1); renderList(); });
$('#next-month').addEventListener('click', () => { viewMonth = shiftMonth(viewMonth, 1); renderList(); });
$('#go-close').addEventListener('click', () => show('close'));

// ===== ④ 月末締め =====
function renderClose() {
  const month = viewMonth || (viewMonth = thisMonth());
  const ents = monthEntries(month);
  const fx = activeFixed();
  const s = calc([...ents, ...fx]);                       // 締めはレシート＋固定費
  const rec = closes[month];

  $('#close-month').textContent = `${monthLabel(month)}の精算`;
  $('#close-amount').textContent = s.amount.toLocaleString('ja-JP');
  $('#close-flow').innerHTML = flowHTML(s.direction);

  // 何を合計したか
  const sum = (rows) => rows.reduce((t, r) => t + r.amount, 0);
  $('#close-parts').innerHTML = `
    <tr><td>レシートの明細</td><td>${ents.length}件</td><td>${yen(sum(ents))}</td></tr>
    <tr><td>固定費</td><td>${fx.length}件</td><td>${yen(sum(fx))}</td></tr>
    <tr class="total"><td>合計</td><td></td><td>${yen(sum(ents) + sum(fx))}</td></tr>`;

  // 計算の内訳
  const d = { me: s.burden.me - s.paid.me, wife: s.burden.wife - s.paid.wife };
  const cell = (v) => `<td class="${v > 0 ? 'pay' : v < 0 ? 'get' : ''}">${v > 0 ? '+' : ''}${yen(v)}</td>`;
  $('#close-table').innerHTML = `
    <thead><tr><th></th><th>私</th><th>妻</th></tr></thead>
    <tbody>
      <tr><td>払った額</td><td>${yen(s.paid.me)}</td><td>${yen(s.paid.wife)}</td></tr>
      <tr><td>負担する額</td><td>${yen(s.burden.me)}</td><td>${yen(s.burden.wife)}</td></tr>
      <tr class="diff"><td>差額</td>${cell(d.me)}${cell(d.wife)}</tr>
    </tbody>`;
  const odd = s.common % 2 === 1;
  $('#close-note').innerHTML = `共通の合計 ${yen(s.common)} を半分にして 1人 ${yen(s.half)}。`
    + (odd ? '<br>共通が奇数のため、1円は精算しません（切り捨て）。' : '')
    + '<br>プラスは渡す側、マイナスは受け取る側です。';

  // 締め済みかどうか
  $('#close-done').hidden = !rec;
  if (rec) $('#close-done-txt').textContent = `${rec.closed_at} に締めました`;
  $('#do-close').innerHTML = rec
    ? '<svg class="ico"><use href="#i-lock"/></svg>締め直す'
    : '<svg class="ico"><use href="#i-lock"/></svg>この月を締める';
}

$('#do-close').addEventListener('click', () => {
  const month = viewMonth;
  const s = calc([...monthEntries(month), ...activeFixed()]);
  const again = Boolean(closes[month]);
  if (again && !confirm(`${monthLabel(month)} は締め済みです。今の明細で締め直しますか？`)) return;
  closes[month] = {
    month,
    paid_me: s.paid.me, paid_wife: s.paid.wife,
    burden_me: s.burden.me, burden_wife: s.burden.wife,
    settle_amount: s.amount, settle_direction: s.direction,
    closed_at: fmtDateTime(new Date()),
  };
  store.set(LS.closes, closes);
  renderClose();
  toast(again ? `${monthLabel(month)} を締め直しました` : `${monthLabel(month)} を締めました`);
});

// ===== ⑤ 設定 =====
function renderSettings() {
  document.querySelectorAll('input[name="owner"]').forEach((r) => { r.checked = r.value === settings.owner; });
  renderFixed();
}

// 固定費の一覧。行は明細と同じ見た目（品名・金額・支払者・区分）
function renderFixed() {
  const ul = $('#fixed-rows');
  ul.innerHTML = '';
  if (fixedCosts.length === 0) {
    ul.innerHTML = '<li class="hint">まだ登録がありません。下の「固定費を追加」から家賃や光熱費を入れてください</li>';
    return;
  }
  fixedCosts.forEach((f, idx) => {
    const li = document.createElement('li');
    li.className = `row ${f.share}${f.active ? '' : ' off'}`;
    li.dataset.idx = idx;
    li.innerHTML = `
      <input class="name" type="text" value="${esc(f.name)}" placeholder="例：家賃">
      <div class="ctrl">
        <input class="amt" type="number" inputmode="numeric" value="${f.amount}">
        <span class="cur">円</span>
        <button class="payer" type="button">${PERSON_LABEL[f.payer]}</button>
        <button class="share" type="button">${SHARE_LABEL[f.share]}</button>
        <button class="del" type="button" aria-label="削除">×</button>
      </div>`;
    ul.appendChild(li);
  });
}

$('#fixed-rows').addEventListener('click', (ev) => {
  const li = ev.target.closest('.row');
  const f = li && fixedCosts[li.dataset.idx];
  if (!f) return;
  if (ev.target.closest('.share')) f.share = nextShare(f.share);
  else if (ev.target.closest('.payer')) f.payer = otherPerson(f.payer);
  else if (ev.target.closest('.del')) {
    if (!confirm(`「${f.name || '名前なし'}」を削除しますか？`)) return;
    fixedCosts.splice(li.dataset.idx, 1);
  } else return;
  store.set(LS.fixed, fixedCosts);
  renderFixed();
});
$('#fixed-rows').addEventListener('change', (ev) => {
  const li = ev.target.closest('.row');
  const f = li && fixedCosts[li.dataset.idx];
  if (!f) return;
  if (ev.target.classList.contains('name')) f.name = ev.target.value.trim();
  if (ev.target.classList.contains('amt')) f.amount = Number(ev.target.value) || 0;
  store.set(LS.fixed, fixedCosts);
});
$('#add-fixed').addEventListener('click', () => {
  fixedCosts.push({ name: '', amount: 0, payer: settings.owner, share: 'common', active: true });
  store.set(LS.fixed, fixedCosts);
  renderFixed();
  $('#fixed-rows .row:last-of-type .name')?.focus();
});
document.querySelectorAll('input[name="owner"]').forEach((r) => r.addEventListener('change', (ev) => {
  settings.owner = ev.target.value;
  store.set(LS.settings, settings);
  toast(`このスマホは「${PERSON_LABEL[settings.owner]}」に設定しました`);
}));
$('#clear-all').addEventListener('click', () => {
  if (!confirm('端末内の明細・固定費・締めの記録を全部消します。よろしいですか？')) return;
  entries = []; draft = null; fixedCosts = []; closes = {};
  store.set(LS.entries, entries); store.set(LS.fixed, fixedCosts); store.set(LS.closes, closes); saveDraft();
  show('home');
  toast('消しました');
});

// ===== 起動 =====
show('home');
