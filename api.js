/* GAS とのやりとり。設定が空のときはダミーデータのまま動く（デザイン確認用） */
'use strict';

const LS = { url: 'warikan.gasUrl', secret: 'warikan.secret', owner: 'warikan.owner' };

const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

const API = {
  get url() { return store.get(LS.url, ''); },
  get secret() { return store.get(LS.secret, ''); },
  ready() { return Boolean(this.url && this.secret); },

  /* GAS は OPTIONS（事前確認）に答えないので、text/plain で送って事前確認を起こさない。
     中身は JSON のまま。GAS 側は e.postData.contents を JSON.parse する。
     ⚠️未検証：実機での通信は本人の環境で確認が必要 */
  async call(action, payload = {}) {
    if (!this.ready()) throw new Error('GAS の URL と合言葉を設定してください');
    let res;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({}, payload, { action, secret: this.secret })),
        redirect: 'follow',
      });
    } catch (e) {
      throw new Error('つながりませんでした。URL と電波を確認してください');
    }
    if (!res.ok) throw new Error(`サーバーが ${res.status} を返しました。URL と公開設定を確認してください`);
    let data;
    try { data = await res.json(); }
    catch { throw new Error('返事の形がおかしいです。URL が正しいか確認してください'); }
    if (!data.ok) throw new Error(data.error || '不明なエラー');
    return data;
  },
};

/* 貼られた URL がおかしければ、何が違うかを日本語で返す（問題なければ null）
   スプレッドシートの URL を貼ってしまう間違いが多いので、そこを名指しで教える */
function urlProblem(u) {
  const v = (u || '').trim();
  if (!v) return 'URL を入れてください';
  if (v.includes('docs.google.com/spreadsheets')) {
    return 'これはスプレッドシートの URL です。Apps Script の「デプロイ」で出る、末尾が /exec の URL を貼ってください';
  }
  if (v.includes('script.google.com/home') || v.includes('script.google.com/u/')) {
    return 'これは Apps Script の編集画面の URL です。「デプロイ」→「新しいデプロイ」→「ウェブアプリ」で出る URL を貼ってください';
  }
  if (!v.startsWith('https://script.google.com/')) {
    return 'Apps Script の URL ではないようです。https://script.google.com/macros/s/… の形になります';
  }
  if (v.endsWith('/dev')) return '末尾が /dev になっています。/exec で終わる方の URL を使ってください';
  if (!v.endsWith('/exec')) return '末尾が /exec になっていません。デプロイ画面の URL をそのまま貼ってください';
  return null;
}

// サーバーの形 → 画面の形
function fromServer(r) {
  return {
    id: r.receipt_id, month: r.month, date: r.date, store: r.store,
    payer: r.payer === 'wife' ? 'wife' : 'me',
    total: Number(r.total) || 0,
    photo: 0, photoData: null,
    hasPhoto: Boolean(r.photo_id),
    hasItems: r.has_items === true || r.has_items === 'TRUE',
    items: (r.items || []).map((it) => ({
      n: it.item, a: Number(it.amount) || 0,
      s: ['common', 'me', 'wife'].includes(it.share) ? it.share : 'common',
      c: it.category || 'その他', rule: it.rule_applied === true,
    })),
  };
}

// 画面の形 → サーバーの形
function toServer(d, rows, owner) {
  return {
    receipt: {
      date: d.date, store: d.store, total: Number(d.total) || 0,
      payer: d.payer, entered_by: owner, has_items: d.hasItems,
    },
    items: rows.map((r) => ({
      item: r.n, amount: Number(r.a) || 0, share: r.s,
      category: r.c || 'その他', rule_applied: r.rule === true,
    })),
  };
}
