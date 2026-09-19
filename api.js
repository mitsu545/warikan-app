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

// サーバーの形 → 画面の形
function fromServer(r) {
  return {
    id: r.receipt_id, month: r.month, date: r.date, store: r.store,
    payer: r.payer === 'wife' ? 'wife' : 'me',
    total: Number(r.total) || 0,
    photo: 0, photoData: null,
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
