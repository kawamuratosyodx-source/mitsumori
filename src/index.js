import { CONFIG, TABLES, NUMERIC } from './config.js';
import { verifyAccess, login } from './auth.js';
import { quoteHtml, requestHtml } from './pdf.js';

const JST = 9 * 3600 * 1000;
const nowStr = () => new Date(Date.now() + JST).toISOString().slice(0, 16).replace('T', ' ');
const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 8);
const newFileId = () => crypto.randomUUID().replace(/-/g, '');

// 検索用に表記ゆれをそろえる(全角/半角・大文字/小文字・カタカナ/ひらがな)
function normSearch(t) {
  return String(t == null ? '' : t).normalize('NFKC').toLowerCase().replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

function salesMeta(raw) {
  let m; try { m = JSON.parse(raw || '[]'); } catch (e) { m = []; }
  if (Array.isArray(m)) return { h: m, show: [], scols: [], dcol: -1, scol: -1 };
  return { h: m.h || [], show: m.show || [], scols: m.scols || [], dcol: Number.isInteger(m.dcol) ? m.dcol : -1, scol: Number.isInteger(m.scol) ? m.scol : -1 };
}

// 会社情報: 画面で保存した内容を優先し、なければ config.js の初期値を使う
async function getCompany(env) {
  const base = Object.assign({}, CONFIG.company);
  try {
    const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('company').first();
    if (r && r.value) { const v = JSON.parse(r.value); for (const k of Object.keys(base)) if (v[k] != null) base[k] = String(v[k]); }
  } catch (e) { /* 表がまだ無い場合は初期値 */ }
  return base;
}

// ===== D1の読み書き =====
function conv(key, r) {
  const o = {};
  for (const c of TABLES[key]) {
    let v = r[c];
    if (v === null || v === undefined) v = '';
    if (v !== '' && (NUMERIC[key] || []).includes(c)) v = Number(v);
    o[c] = v;
  }
  return o;
}
async function readAll(env, key, where, ...binds) {
  const sql = 'SELECT * FROM "' + key + '"' + (where ? ' WHERE ' + where : '');
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return results.map(r => conv(key, r));
}
const rowVals = (key, obj) => TABLES[key].map(c => (obj[c] === undefined || obj[c] === null ? '' : String(obj[c])));
function upsertStmt(env, key, obj) {
  const cols = TABLES[key];
  return env.DB.prepare('INSERT OR REPLACE INTO "' + key + '" (' + cols.map(c => '"' + c + '"').join(',') + ') VALUES (' + cols.map(() => '?').join(',') + ')').bind(...rowVals(key, obj));
}
const delStmt = (env, key, col, val) => env.DB.prepare('DELETE FROM "' + key + '" WHERE "' + col + '" = ?').bind(String(val));

// ===== 写真・PDFの保存(D1の中。大きなファイルは小分けにして保存する) =====
const CHUNK = 600 * 1000; // 1行の上限(約2MB)に収まるよう、base64文字列を600KBずつ保存
function bytesToB64(u8) {
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64ToBytes(b64) {
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
async function putFile(env, id, ctype, name, b64) {
  const parts = [];
  for (let i = 0; i < b64.length; i += CHUNK) parts.push(b64.slice(i, i + CHUNK));
  const stmts = [env.DB.prepare('INSERT INTO "files" ("id","ctype","name","size","chunks","created") VALUES (?,?,?,?,?,?)').bind(id, ctype, String(name || ''), String(Math.floor(b64.length * 3 / 4)), String(parts.length), nowStr())];
  parts.forEach((d, i) => stmts.push(env.DB.prepare('INSERT INTO "file_chunks" ("fid","seq","data") VALUES (?,?,?)').bind(id, i, d)));
  try { await env.DB.batch(stmts); }
  catch (e) { try { await deleteFile(env, id); } catch (e2) { /* 後始末 */ } throw e; }
}
async function getFile(env, id) {
  const f = await env.DB.prepare('SELECT * FROM "files" WHERE "id" = ?').bind(id).first();
  if (!f) return null;
  const { results } = await env.DB.prepare('SELECT "data" FROM "file_chunks" WHERE "fid" = ? ORDER BY "seq"').bind(id).all();
  if (results.length !== Number(f.chunks)) return null;
  return { ctype: f.ctype, bytes: b64ToBytes(results.map(r => r.data).join('')) };
}
async function deleteFile(env, id) {
  await env.DB.batch([env.DB.prepare('DELETE FROM "file_chunks" WHERE "fid" = ?').bind(id), env.DB.prepare('DELETE FROM "files" WHERE "id" = ?').bind(id)]);
}

function fail(msg) { const e = new Error(msg); e.app = true; return e; }

// ===== 機能(Apps Script版と同じ名前) =====
const API = {
  async getAll(env) {
    const o = {};
    o.company = await getCompany(env);
    for (const k of Object.keys(TABLES)) o[k] = await readAll(env, k);
    o.dbUrl = '';
    return o;
  },

  // 会社情報(見積書などに載る自社の情報)
  async getCompany(env) { return getCompany(env); },
  async saveCompany(env, ctx, obj) {
    const out = {};
    for (const k of Object.keys(CONFIG.company)) out[k] = String((obj && obj[k]) == null ? '' : obj[k]).slice(0, 500);
    if (!out.name.trim()) throw fail('会社名を入力してください');
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS "settings" ("key" TEXT PRIMARY KEY, "value" TEXT)').run();
    await env.DB.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind('company', JSON.stringify(out)).run();
    return out;
  },

  async save(env, ctx, key, obj) {
    if (!TABLES[key] || key === 'lines' || key === 'quotes') throw fail('invalid table');
    obj = Object.assign({}, obj);
    if (!obj.id) obj.id = newId();
    if (!obj.created) obj.created = nowStr();
    if (key === 'requests') {
      if (!obj.author) obj.author = ctx.email;
      // 写真の紐付けは別の操作で更新されるため、保存のたびに最新のものを引き継ぐ(古い画面からの上書きを防ぐ)
      const cur = (await readAll(env, 'requests', '"id" = ?', obj.id))[0];
      obj.photos = cur ? cur.photos : '';
    }
    if (key === 'memos') { if (!obj.author) obj.author = ctx.email; obj.updated = nowStr(); }
    await upsertStmt(env, key, obj).run();
    return obj;
  },

  async remove(env, ctx, key, id) {
    if (!TABLES[key] || key === 'lines') throw fail('invalid table');
    id = String(id);
    const stmts = [];
    if (key === 'customers') {
      const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM "projects" WHERE "customerId" = ?').bind(id).first();
      if (n.n > 0) throw fail('この顧客には案件があるため削除できません');
    }
    if (key === 'projects') {
      const a = await env.DB.prepare('SELECT COUNT(*) AS n FROM "quotes" WHERE "projectId" = ?').bind(id).first();
      const b = await env.DB.prepare('SELECT COUNT(*) AS n FROM "requests" WHERE "projectId" = ?').bind(id).first();
      if (a.n > 0 || b.n > 0) throw fail('見積または仕入先が残っているため削除できません');
      stmts.push(env.DB.prepare('UPDATE "memos" SET "projectId" = \'\' WHERE "projectId" = ?').bind(id));
    }
    if (key === 'quotes') stmts.push(delStmt(env, 'lines', 'quoteId', id));
    if (key === 'requests') {
      const r = (await readAll(env, 'requests', '"id" = ?', id))[0];
      if (r) for (const t of String(r.photos || '').split(',').filter(Boolean)) { try { await deleteFile(env, t.split('|')[0]); } catch (e) { /* 既に無い */ } }
    }
    stmts.push(delStmt(env, key, TABLES[key][0], id));
    await env.DB.batch(stmts);
    return true;
  },

  async saveQuote(env, ctx, q, lines) {
    q = Object.assign({}, q);
    const rate = Number(q.taxRate);
    let sub = 0;
    const ls = (lines || []).filter(l => String(l.item || '').trim() !== '').map((l, i) => {
      const qty = Number(l.qty) || 0, price = Number(l.price) || 0;
      const amount = Math.round(qty * price);
      sub += amount;
      const hasCost = !(l.cost === '' || l.cost === null || l.cost === undefined);
      return { quoteId: '', row: i + 1, item: l.item, qty: qty, unit: l.unit || '', price: price, amount: amount, note: l.note || '', cost: hasCost ? (Number(l.cost) || 0) : '' };
    });
    q.taxRate = isNaN(rate) || q.taxRate === '' ? CONFIG.defaultTaxRate : rate;
    q.subtotal = sub;
    q.tax = Math.floor(sub * q.taxRate / 100);
    q.total = q.subtotal + q.tax;
    q.updated = nowStr();
    if (!q.result) q.result = '未定';
    if (!q.id) q.id = newId();
    if (!q.created) { q.created = q.updated; q.author = ctx.email; }
    if (!q.no) {
      const ym = new Date(Date.now() + JST).toISOString().slice(0, 7).replace('-', '');
      const { results } = await env.DB.prepare('SELECT "no" FROM "quotes" WHERE "no" LIKE ?').bind('Q' + ym + '-%').all();
      let max = 0;
      results.forEach(r => { const n = parseInt(String(r.no).split('-')[1], 10); if (n > max) max = n; });
      q.no = 'Q' + ym + '-' + ('000' + (max + 1)).slice(-3);
    }
    const stmts = [upsertStmt(env, 'quotes', q), delStmt(env, 'lines', 'quoteId', q.id)];
    ls.forEach(l => { l.quoteId = q.id; stmts.push(upsertStmt(env, 'lines', l)); });
    await env.DB.batch(stmts);
    return q;
  },

  // ----- 写真・PDF(D1に保存。token = ファイルID または ファイルID|pdf) -----
  async uploadPhoto(env, ctx, requestId, dataUrl, name) {
    const m = /^data:(.+?);base64,(.*)$/s.exec(dataUrl || '');
    if (!m) throw fail('画像形式が不正です');
    const isPdf = m[1] === 'application/pdf';
    if (!isPdf && m[1].indexOf('image/') !== 0) throw fail('写真またはPDFのみ保存できます');
    const r = (await readAll(env, 'requests', '"id" = ?', requestId))[0];
    if (!r) throw fail('仕入先が見つかりません');
    if (m[2].length > 8 * 1024 * 1024 * 4 / 3) throw fail('ファイルが大きすぎます（8MBまで）');
    const id = newFileId();
    await putFile(env, id, m[1], name, m[2]);
    const token = isPdf ? id + '|pdf' : id;
    const ids = String(r.photos || '').split(',').filter(Boolean);
    ids.push(token);
    await env.DB.prepare('UPDATE "requests" SET "photos" = ? WHERE "id" = ?').bind(ids.join(','), requestId).run();
    return token;
  },

  async removePhoto(env, ctx, requestId, token) {
    const r = (await readAll(env, 'requests', '"id" = ?', requestId))[0];
    if (!r) return false;
    const left = String(r.photos || '').split(',').filter(x => x && x !== token);
    await env.DB.prepare('UPDATE "requests" SET "photos" = ? WHERE "id" = ?').bind(left.join(','), requestId).run();
    try { await deleteFile(env, String(token).split('|')[0]); } catch (e) { /* 既に無い */ }
    return true;
  },

  // ----- 出力 -----
  async getQuoteBundle(env, ctx, quoteId) { return bundle(env, quoteId); },

  async makePdf(env, ctx, quoteId) {
    const b = await bundle(env, quoteId);
    return { name: '見積書_' + b.q.no + '_' + (b.c.name || '') + '.pdf', html: quoteHtml(b, await getCompany(env)) };
  },

  async makeRequestPdf(env, ctx, requestId) {
    const r = (await readAll(env, 'requests', '"id" = ?', requestId))[0];
    if (!r) throw fail('仕入先が見つかりません');
    const p = (await readAll(env, 'projects', '"id" = ?', r.projectId))[0] || {};
    const v = (await readAll(env, 'vendors', '"name" = ?', r.vendor))[0] || {};
    return { name: '見積依頼書_' + r.vendor + '_' + (r.requestedOn || '') + '.pdf', html: requestHtml(r, p, v, await getCompany(env)) };
  },

  // スマイルワークス取込用CSV。文字コード(Shift_JIS)への変換は画面側で行う
  async makeCsv(env, ctx, quoteIds) {
    const cell = v => { const s = String(v === undefined || v === null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const slash = d => String(d || '').replace(/-/g, '/');
    const out = [CONFIG.csvColumns.map(c => cell(c[1])).join(',')];
    const noCode = [];
    for (const id of quoteIds) {
      const b = await bundle(env, id);
      if (!b.c.code && b.c.name && noCode.indexOf(b.c.name) < 0) noCode.push(b.c.name);
      b.lines.forEach((l, i) => {
        const v = {
          issueDate: slash(b.q.issueDate), validUntil: slash(b.q.validUntil), no: b.q.no,
          customerCode: b.c.code, customer: b.c.name, customerContact: b.c.contact,
          subject: b.q.subject || b.p.name,
          row: i + 1, item: l.item, qty: l.qty, unit: l.unit, price: l.price, note: l.note, cost: l.cost,
        };
        out.push(CONFIG.csvColumns.map(c => cell(c[0] ? v[c[0]] : '')).join(','));
      });
    }
    const d = new Date(Date.now() + JST).toISOString();
    return {
      name: 'mitsumori_' + d.slice(0, 10).replace(/-/g, '') + '_' + d.slice(11, 16).replace(':', '') + '.csv',
      text: out.join('\r\n') + '\r\n',
      warn: noCode.length ? '得意先コードが未設定です: ' + noCode.join('、') + '\n顧客の編集画面で入力してください。' : '',
    };
  },

  // スマイルワークスの得意先マスタCSVから取り込んだ顧客を一括登録(得意先コードが同じなら上書き)
  async importCustomers(env, ctx, list) {
    const cur = await readAll(env, 'customers');
    const byCode = {};
    cur.forEach(c => { if (c.code !== '') byCode[String(c.code)] = c; });
    let added = 0, updated = 0;
    const stmts = [];
    for (const x of list || []) {
      if (!x.code || !x.name) continue;
      const code = String(x.code);
      let row = byCode[code];
      if (row) { updated++; }
      else { row = { id: newId(), created: nowStr(), memo: '' }; added++; byCode[code] = row; }
      Object.assign(row, { code: code, name: x.name || '', contact: x.contact || '', address: x.address || '', tel: x.tel || '', email: x.email || '' });
      stmts.push(upsertStmt(env, 'customers', row));
    }
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    return { added: added, updated: updated };
  },

  // ===== 売上データ(CSVを取り込んで検索) =====
  // headers 列にはJSON {h:[見出し], show:[初期表示の列番号], scols:[検索対象の列番号], dcol:日付列, scol:金額列} を入れる(旧形式の配列も読める)
  async salesBatches(env) {
    const r = await env.DB.prepare('SELECT id,name,headers,count,created,"by" FROM sales_batches ORDER BY created DESC, id DESC').all();
    return (r.results || []).map(b => { const m = salesMeta(b.headers); return { id: b.id, name: b.name, headers: m.h, show: m.show, dcol: m.dcol, scol: m.scol, count: Number(b.count) || 0, created: b.created, by: b.by }; });
  },
  async salesBegin(env, ctx, name, meta, replace) {
    name = String(name || '').trim().slice(0, 100);
    if (!name) throw fail('名前を入力してください');
    const h = meta && Array.isArray(meta.h) ? meta.h : [];
    if (!h.length || h.length > 300) throw fail('見出し行が正しくありません');
    const okIdx = a => (Array.isArray(a) ? a : []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < h.length);
    const m = { h: h.map(x => String(x == null ? '' : x).slice(0, 100)), show: okIdx(meta.show), scols: okIdx(meta.scols), dcol: Number.isInteger(meta.dcol) ? meta.dcol : -1, scol: Number.isInteger(meta.scol) ? meta.scol : -1 };
    if (replace) {
      const old = await env.DB.prepare('SELECT id FROM sales_batches WHERE name = ?').bind(name).all();
      for (const o of old.results || []) await API.salesDelete(env, ctx, o.id);
    }
    const id = newId() + newId();
    await env.DB.prepare('INSERT INTO sales_batches (id,name,headers,count,created,"by") VALUES (?,?,?,?,?,?)')
      .bind(id, name, JSON.stringify(m), '0', nowStr(), ctx.email || '').run();
    return id;
  },
  async salesAdd(env, ctx, batchId, startSeq, rows) {
    const b = await env.DB.prepare('SELECT headers FROM sales_batches WHERE id = ?').bind(String(batchId)).first();
    if (!b) throw fail('取り込み先が見つかりません');
    const meta = salesMeta(b.headers);
    if (!Array.isArray(rows) || rows.length > 500) throw fail('一度に送れる行数を超えています');
    const stmts = [];
    rows.forEach((r, i) => {
      const cells = (Array.isArray(r) ? r : []).map(c => String(c == null ? '' : c).slice(0, 2000));
      const text = (meta.scols.length ? meta.scols : cells.map((_, k) => k)).map(k => cells[k] || '').join(' ');
      stmts.push(env.DB.prepare('INSERT INTO sales_rows (batch,seq,data,search) VALUES (?,?,?,?)')
        .bind(String(batchId), Number(startSeq) + i, JSON.stringify(cells), normSearch(text)));
    });
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    return rows.length;
  },
  async salesFinish(env, ctx, batchId) {
    const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM sales_rows WHERE batch = ?').bind(String(batchId)).first();
    await env.DB.prepare('UPDATE sales_batches SET count = ? WHERE id = ?').bind(String(c.n), String(batchId)).run();
    return c.n;
  },
  async salesDelete(env, ctx, batchId) {
    await env.DB.prepare('DELETE FROM sales_rows WHERE batch = ?').bind(String(batchId)).run();
    await env.DB.prepare('DELETE FROM sales_batches WHERE id = ?').bind(String(batchId)).run();
    return true;
  },
  // opt: {dcol, from, to, scol}  日付列での期間絞り込みと、金額列の合計
  // batchId が '*' のときは、最新のデータと見出しが同じすべてのデータをまたいで検索する
  async salesSearch(env, ctx, batchId, q, offset, opt) {
    opt = opt || {};
    let ids = [String(batchId)], skipped = 0;
    if (batchId === '*') {
      const all = (await env.DB.prepare('SELECT id,headers FROM sales_batches ORDER BY created DESC, id DESC').all()).results || [];
      if (!all.length) return { total: 0, sum: null, offset: 0, limit: 100, rows: [], names: [], skipped: 0 };
      const key = salesMeta(all[0].headers).h.join('\u0001');
      ids = all.filter(x => salesMeta(x.headers).h.join('\u0001') === key).map(x => x.id);
      skipped = all.length - ids.length;
    }
    const terms = normSearch(q).split(/\s+/).filter(Boolean).slice(0, 8);
    let where = 'r.batch IN (' + ids.map(() => '?').join(',') + ')'; const binds = ids.slice();
    for (const t of terms) { where += " AND r.search LIKE ? ESCAPE '\\'"; binds.push('%' + t.replace(/[\\%_]/g, m => '\\' + m) + '%'); }
    const dcol = Number(opt.dcol), scol = Number(opt.scol);
    const ymd = v => { const m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/.exec(String(v || '').trim()); return m ? m[1] + '/' + m[2].padStart(2, '0') + '/' + m[3].padStart(2, '0') : ''; };
    if (Number.isInteger(dcol) && dcol >= 0 && dcol < 300) {
      const f = ymd(opt.from), t = ymd(opt.to);
      if (f) { where += ` AND json_extract(r.data,'$[${dcol}]') >= ?`; binds.push(f); }
      if (t) { where += ` AND json_extract(r.data,'$[${dcol}]') <= ?`; binds.push(t); }
    }
    const off = Math.max(0, Number(offset) || 0), LIM = 100;
    const sumExpr = Number.isInteger(scol) && scol >= 0 && scol < 300 ? `, SUM(CAST(REPLACE(json_extract(r.data,'$[${scol}]'),',','') AS REAL)) AS s` : '';
    const agg = await env.DB.prepare('SELECT COUNT(*) AS n' + sumExpr + ' FROM sales_rows r WHERE ' + where).bind(...binds).first();
    const r = await env.DB.prepare('SELECT r.data AS data, b.name AS name FROM sales_rows r JOIN sales_batches b ON b.id = r.batch WHERE ' + where + ' ORDER BY b.created, r.batch, r.seq LIMIT ' + LIM + ' OFFSET ' + off).bind(...binds).all();
    return { total: agg.n, sum: sumExpr ? (agg.s == null ? 0 : agg.s) : null, offset: off, limit: LIM, rows: (r.results || []).map(x => JSON.parse(x.data)), names: (r.results || []).map(x => x.name), skipped: skipped };
  },

  // 税率別の売上高(月ごと)。スマイルワークスの売上CSVにある「伝票ごとの税率別合計」の列を、伝票番号で重複を除いて合計する
  async salesTax(env, ctx, batchId) {
    let ids = [String(batchId)], skipped = 0, head;
    if (batchId === '*') {
      const all = (await env.DB.prepare('SELECT id,name,headers FROM sales_batches ORDER BY created DESC, id DESC').all()).results || [];
      if (!all.length) return { months: [], need: [] };
      head = salesMeta(all[0].headers).h;
      const key = head.join('\u0001');
      ids = all.filter(x => salesMeta(x.headers).h.join('\u0001') === key).map(x => x.id);
      skipped = all.length - ids.length;
    } else {
      const b = await env.DB.prepare('SELECT headers FROM sales_batches WHERE id = ?').bind(String(batchId)).first();
      if (!b) throw fail('データが見つかりません');
      head = salesMeta(b.headers).h;
    }
    // 税率の区分は、見出しから自動で見つける(「○○対象：本体価格合計」と「○○対象：消費税」の組)。税率が増えて列が増えても拾える
    const need = [];
    const slipI = head.indexOf('売上番号'), dateI = head.indexOf('売上日');
    if (slipI < 0) need.push('売上番号');
    if (dateI < 0) need.push('売上日');
    const cats = [];
    head.forEach((h, i) => {
      const m = /^(.+?)対象：本体価格合計$/.exec(h);
      if (m) cats.push({ name: m[1], b: i, t: head.indexOf(m[1] + '対象：消費税') });
      else if (/^(非課税|対象外)：本体価格合計$/.test(h)) cats.push({ name: h.split('：')[0] === '対象外' ? '対象外（不課税）' : '非課税', b: i, t: -1, plain: true });
    });
    if (!cats.length) need.push('○○対象：本体価格合計（税率ごとの列）');
    if (need.length) return { months: [], need: need, skipped: skipped };
    const J = i => `json_extract(data,'$[${Number(i)}]')`;
    const N = i => `SUM(CAST(REPLACE(${J(i)},',','') AS REAL))`;
    const inList = ids.map(() => '?').join(',');
    const cols = [];
    cats.forEach((c, k) => { cols.push(`${N(c.b)} AS b${k}`); if (c.t >= 0) cols.push(`${N(c.t)} AS t${k}`); });
    const sql = `SELECT substr(${J(dateI)},1,7) AS m, COUNT(*) AS slips, ${cols.join(', ')}
      FROM sales_rows WHERE id IN (SELECT MIN(id) FROM sales_rows WHERE batch IN (${inList}) GROUP BY ${J(slipI)}) GROUP BY m ORDER BY m DESC`;
    const r = await env.DB.prepare(sql).bind(...ids).all();
    const R = x => Math.round(Number(x) || 0);
    const months = (r.results || []).map(x => {
      const o = { m: x.m || '', slips: x.slips, cats: cats.map((c, k) => ({ name: c.name, plain: !!c.plain, base: R(x['b' + k]), tax: c.t >= 0 ? R(x['t' + k]) : 0 })) };
      o.base = o.cats.reduce((a, c) => a + c.base, 0); o.tax = o.cats.reduce((a, c) => a + c.tax, 0); o.total = o.base + o.tax;
      return o;
    });
    return { months: months, need: [], skipped: skipped };
  },

  // 手書きメモの文字起こし(Gemini)
  async ocrImage(env, ctx, dataUrl) {
    const m = /^data:(image\/.+?);base64,(.*)$/s.exec(dataUrl || '');
    if (!m) throw fail('画像形式が不正です');
    if (!env.GEMINI_API_KEY) return { text: '', engine: 'none', note: '文字起こしの設定（GEMINI_API_KEY）がまだ行われていません。管理者に連絡してください。' };
    const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: GEMINI_PROMPT }, { inline_data: { mime_type: m[1], data: m[2] } }] }],
          generationConfig: { temperature: 0 },
        }),
      });
      if (!res.ok) throw new Error('Gemini ' + res.status + ': ' + (await res.text()).slice(0, 200));
      const j = await res.json();
      const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
      return { text: parts.map(p => p.text || '').join('').trim(), engine: 'gemini' };
    } catch (e) {
      return { text: '', engine: 'none', note: '文字起こしに失敗しました。しばらくしてからもう一度お試しください。\n(' + String(e.message || e).slice(0, 160) + ')' };
    }
  },
};

const GEMINI_PROMPT = 'これは手書きのメモ(日本語)の写真です。書かれている文字を、見たとおりに文字起こししてください。' +
  '改行・箇条書き・段落の区切りは元のメモに合わせ、表や矢印は文字で分かるように書いてください。' +
  '推測で内容を足したり、要約や説明を付けたりしないでください。読み取れない部分は【判読不能】と書いてください。' +
  '出力は文字起こしの本文だけにしてください。';

async function bundle(env, quoteId) {
  const q = (await readAll(env, 'quotes', '"id" = ?', quoteId))[0];
  if (!q) throw fail('見積が見つかりません');
  const lines = (await readAll(env, 'lines', '"quoteId" = ?', quoteId)).sort((a, b) => a.row - b.row);
  const p = (await readAll(env, 'projects', '"id" = ?', q.projectId))[0] || {};
  const c = (await readAll(env, 'customers', '"id" = ?', p.customerId))[0] || {};
  return { q: q, lines: lines, p: p, c: c };
}

// ===== 受付 =====
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    // 合言葉ログイン
    if (request.method === 'POST' && url.pathname === '/api/login') {
      let b = {}; try { b = await request.json(); } catch (e) {}
      const cookie = await login(env, b.name, b.password);
      if (!cookie) return json({ ok: false, error: '名前または合言葉が違います' }, 401);
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'set-cookie': cookie } });
    }
    if (request.method === 'POST' && url.pathname === '/api/logout') {
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': 'sess=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' } });
    }

    const auth = await verifyAccess(request, env);
    if (!auth.ok) return json({ ok: false, error: auth.error, login: !!auth.login }, 401);
    const ctx = { email: auth.email || '' };

    // 写真・PDFの表示
    if (request.method === 'GET' && url.pathname.startsWith('/api/file/')) {
      const id = url.pathname.slice('/api/file/'.length);
      if (!/^[0-9a-f]{32}$/.test(id)) return new Response('not found', { status: 404 });
      const obj = await getFile(env, id);
      if (!obj) return new Response('not found', { status: 404 });
      return new Response(obj.bytes, { headers: { 'content-type': obj.ctype || 'application/octet-stream', 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' } });
    }

    // 機能の呼び出し: POST /api/rpc/<名前>  本文 {"args":[...]}
    if (request.method === 'POST' && url.pathname.startsWith('/api/rpc/')) {
      const fn = url.pathname.slice('/api/rpc/'.length);
      if (!Object.prototype.hasOwnProperty.call(API, fn)) return json({ ok: false, error: '不明な操作です' }, 404);
      try {
        const body = await request.json();
        const args = Array.isArray(body.args) ? body.args : [];
        const result = await API[fn](env, ctx, ...args);
        return json({ ok: true, result: result });
      } catch (e) {
        if (!e.app) console.error(fn, e && e.stack || e);
        return json({ ok: false, error: e.app ? e.message : 'サーバーでエラーが起きました。もう一度お試しください。' });
      }
    }
    return json({ ok: false, error: 'not found' }, 404);
  },
};
