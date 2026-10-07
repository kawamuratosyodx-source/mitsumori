// 業務管理 河村図書教材社  v2.10.6  (2026-10-07)
import { CONFIG, TABLES, NUMERIC } from './config.js';
import { verifyAccess, login, getSecurity, checkAdmin, checkCommon, hashPw, ADMIN_NAME } from './auth.js';
import { quoteHtml, requestHtml } from './pdf.js';
import { SCHEMA } from './schema.js';
import { driveConfigured, isDriveRef, driveId, drivePing, driveUpload, driveGet, driveDelete } from './gdrive.js';

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
  if (isDriveRef(f.chunks)) { // Googleドライブに保存してあるもの
    if (!driveConfigured(env)) return null;
    try { return { ctype: f.ctype, bytes: await driveGet(env, driveId(f.chunks)) }; } catch (e) { console.error('drive get', e && e.message); return null; }
  }
  const { results } = await env.DB.prepare('SELECT "data" FROM "file_chunks" WHERE "fid" = ? ORDER BY "seq"').bind(id).all();
  if (results.length !== Number(f.chunks)) return null;
  return { ctype: f.ctype, bytes: b64ToBytes(results.map(r => r.data).join('')) };
}
async function deleteFile(env, id) {
  try {
    const f = await env.DB.prepare('SELECT "chunks" FROM "files" WHERE "id" = ?').bind(id).first();
    if (f && isDriveRef(f.chunks) && driveConfigured(env)) await driveDelete(env, driveId(f.chunks));
  } catch (e) { console.error('drive delete', e && e.message); }
  await env.DB.batch([env.DB.prepare('DELETE FROM "file_chunks" WHERE "fid" = ?').bind(id), env.DB.prepare('DELETE FROM "files" WHERE "id" = ?').bind(id)]);
}

function fail(msg) { const e = new Error(msg); e.app = true; return e; }

// ===== 機能(Apps Script版と同じ名前) =====
const API = {
  // have: 画面が持っている版の一覧。渡されたときは、変わった表だけを返す(読み取り行数の節約)
  async getAll(env, ctx, have) {
    await ensureSchema(env);
    await ensureReqLines(env);
    const dv = await dvGet(env);
    const h = (have && typeof have === 'object') ? have : null;
    const need = t => !h || !dv[t] || h[t] !== dv[t];
    const o = {};
    o.me = { name: ctx.email, admin: !!ctx.admin };
    o.company = await getCompany(env);
    o.dv = dv;
    o.part = !!h;
    for (const k of Object.keys(TABLES)) if (need(k)) o[k] = await readAll(env, k);
    if (need('reqLines')) o.reqLines = ((await env.DB.prepare('SELECT reqId,row,item,qty,unit,note,price FROM request_lines ORDER BY reqId,row').all()).results || []).map(x => ({ reqId: x.reqId, row: Number(x.row) || 0, item: x.item || '', qty: x.qty === '' || x.qty == null ? '' : Number(x.qty), unit: x.unit || '', note: x.note || '', price: x.price === '' || x.price == null ? '' : Number(x.price) }));
    o.dbUrl = '';
    return o;
  },

  // 会社情報(見積書などに載る自社の情報)
  // 保存容量(管理者のみ)。無料枠はD1の1データベースあたり500MB
  async getStorage(env, ctx) {
    if (!ctx.admin) throw fail('保存容量を見られるのは管理者だけです');
    const one = async (sql) => (await env.DB.prepare(sql).first()) || {};
    const t = await env.DB.prepare('SELECT 1 AS x').all();
    const dbBytes = Number(t.meta && t.meta.size_after) || 0;
    const f = await one('SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN "chunks" LIKE \'drive:%\' THEN 0 ELSE CAST("size" AS INTEGER) END),0) AS b FROM "files"');
    const fd = await one('SELECT COUNT(*) AS n, COALESCE(SUM(CAST("size" AS INTEGER)),0) AS b FROM "files" WHERE "chunks" LIKE \'drive:%\'');
    // 売上データは件数が多いので、全部は読まない。取り込み時に数えた件数と、先頭200行から見積もった大きさを使う
    const sb = await one('SELECT COUNT(*) AS n, COALESCE(SUM(CAST("count" AS INTEGER)),0) AS rows FROM "sales_batches"');
    const smp = await one('SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH("data")+LENGTH("search")),0) AS b FROM (SELECT "data","search" FROM "sales_rows" LIMIT 200)');
    const srows = Number(sb.rows) || 0;
    const sbytes = smp.n ? Math.round(Number(smp.b) / smp.n * srows) : 0;
    // 操作履歴は古いものから消えるので、番号の幅でおよその件数が分かる(全部は読まない)
    let logs = 0; try { const lg = await one('SELECT COALESCE(MAX(id),0) AS mx, COALESCE(MIN(id),0) AS mn FROM "logs"'); logs = lg.mx ? lg.mx - lg.mn + 1 : 0; } catch (e) {}
    return { dbBytes: dbBytes, limit: 500 * 1024 * 1024, files: { n: (f.n || 0) - (fd.n || 0), bytes: Math.round((Number(f.b) || 0) * 4 / 3) }, drive: { n: fd.n || 0, bytes: Number(fd.b) || 0 },
      sales: { batches: sb.n || 0, rows: srows, bytes: sbytes, approx: true }, logs: logs,
      reads: { today: await readsToday(env), limit: 5000000 } };
  },
  // 仕入先に保存してある写真・PDFの一覧(古い順)。管理者のみ
  async listFiles(env, ctx) {
    if (!ctx.admin) throw fail('管理者だけが使えます');
    const reqs = await readAll(env, 'requests');
    const projs = {}; for (const p of await readAll(env, 'projects')) projs[p.id] = p;
    const fr = (await env.DB.prepare('SELECT "id","ctype","name","size","created","chunks" FROM "files"').all()).results || [];
    const fm = {}; for (const x of fr) fm[x.id] = x;
    const used = new Set(), out = [];
    for (const r of reqs) for (const tk of String(r.photos || '').split(',').filter(Boolean)) {
      const id = tk.split('|')[0], x = fm[id]; used.add(id);
      if (!x) continue;
      out.push({ id: id, created: x.created, kind: tk.endsWith('|pdf') ? 'PDF' : '写真', size: Math.round(Number(x.size) || 0), vendor: r.vendor, project: (projs[r.projectId] || {}).name || '', gid: isDriveRef(x.chunks) ? driveId(x.chunks) : '' });
    }
    for (const x of fr) if (!used.has(x.id)) out.push({ id: x.id, created: x.created, kind: '未使用', size: Math.round(Number(x.size) || 0), vendor: '', project: '', gid: isDriveRef(x.chunks) ? driveId(x.chunks) : '' });
    out.sort((a, b) => String(a.created).localeCompare(String(b.created)));
    return out;
  },
  // 指定した日より前に保存した写真・PDFを、まとめて削除する(管理者のみ)
  async purgeFiles(env, ctx, before) {
    if (!ctx.admin) throw fail('管理者だけが使えます');
    before = String(before || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) throw fail('日付を指定してください');
    const fr = (await env.DB.prepare('SELECT "id","size","chunks" FROM "files" WHERE "created" < ?').bind(before).all()).results || [];
    if (!fr.length) return { n: 0, bytes: 0 };
    const gone = new Set(fr.map(x => x.id));
    for (const r of await readAll(env, 'requests')) {
      const toks = String(r.photos || '').split(',').filter(Boolean);
      const left = toks.filter(tk => !gone.has(tk.split('|')[0]));
      if (left.length !== toks.length) await env.DB.prepare('UPDATE "requests" SET "photos" = ? WHERE "id" = ?').bind(left.join(','), r.id).run();
    }
    let bytes = 0;
    for (let i = 0; i < fr.length; i += 20) {
      const part = fr.slice(i, i + 20), st = [];
      for (const x of part) { bytes += Math.round(Number(x.size) || 0); if (isDriveRef(x.chunks) && driveConfigured(env)) { try { await driveDelete(env, driveId(x.chunks)); } catch (e) { /* ドライブ側が消えていても続ける */ } } st.push(env.DB.prepare('DELETE FROM "file_chunks" WHERE "fid" = ?').bind(x.id), env.DB.prepare('DELETE FROM "files" WHERE "id" = ?').bind(x.id)); }
      await env.DB.batch(st);
    }
    await writeLog(env, ctx.email, 'op', '一括削除', '回答の写真・PDF ' + before + 'より前 ' + fr.length + '件', '');
    return { n: fr.length, bytes: bytes };
  },
  async driveStatus(env, ctx) {
    if (!ctx.admin) throw fail('管理者だけが使えます');
    return { configured: driveConfigured(env) };
  },
  // 接続の確認(受付口に声をかけて、保存先フォルダがあるか見る)
  async driveTest(env, ctx) {
    if (!ctx.admin) throw fail('管理者だけが使えます');
    if (!driveConfigured(env)) throw fail('まだ設定されていません');
    await drivePing(env);
    return true;
  },
  async getLogs(env, ctx, opt) {
    if (!ctx.admin) throw fail('操作履歴を見られるのは管理者だけです');
    await ensureLogs(env);
    opt = opt || {};
    const w = [], b = [];
    if (opt.kind === 'login' || opt.kind === 'op') { w.push('kind = ?'); b.push(opt.kind); }
    const q = String(opt.q || '').trim();
    if (q) for (const t of q.split(/\s+/).slice(0, 5)) { w.push("(who || ' ' || action || ' ' || detail) LIKE ?"); b.push('%' + t.replace(/[%_]/g, '') + '%'); }
    const off = Math.max(0, Number(opt.offset) || 0);
    const r = await env.DB.prepare('SELECT id,at,who,kind,action,detail,ip FROM logs' + (w.length ? ' WHERE ' + w.join(' AND ') : '') + ' ORDER BY id DESC LIMIT 101 OFFSET ' + off).bind(...b).all();
    const rows = r.results || [];
    return { rows: rows.slice(0, 100), more: rows.length > 100 };
  },
  // 合言葉の変更(管理者のみ)。kind: 'common'=みんなで使う合言葉 / 'admin'=管理者用。確認のため、管理者用の今の合言葉が必要
  async changePassword(env, ctx, kind, newPw, adminPw) {
    if (!ctx.admin) throw fail('合言葉を変更できるのは管理者だけです');
    newPw = String(newPw || '');
    if (kind !== 'common' && kind !== 'admin') throw fail('変更する合言葉を選んでください');
    if (newPw.length < 8) throw fail('新しい合言葉は8文字以上にしてください');
    if (newPw.length > 100) throw fail('新しい合言葉が長すぎます');
    await new Promise(r => setTimeout(r, 800));
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS "settings" ("key" TEXT PRIMARY KEY, "value" TEXT)').run();
    const sec = await getSecurity(env);
    if (!(await checkAdmin(env, sec, adminPw))) throw fail('管理者用の今の合言葉が違います');
    if (kind === 'common' && (await checkAdmin(env, sec, newPw))) throw fail('管理者用と同じ合言葉は、みんなで使う合言葉にできません');
    if (kind === 'admin' && (await checkCommon(env, sec, newPw))) throw fail('みんなで使う合言葉と同じものは、管理者用にできません');
    const up = (k, v) => env.DB.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v);
    const ver = crypto.randomUUID().replace(/-/g, '');
    await env.DB.batch([up(kind === 'admin' ? 'adminpw' : 'pw', await hashPw(newPw)), up('authver', ver)]);
    return true; // 全員のログインが切れる(新しい合言葉で入り直す)
  },
  async getCompany(env) { return getCompany(env); },
  async saveCompany(env, ctx, obj) {
    if (!ctx.admin) throw fail('会社情報を変更できるのは管理者だけです');
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
    await env.DB.batch([upsertStmt(env, key, obj), bumpStmt(env, key)]);
    return obj;
  },

  // 仕入先への見積依頼の保存(明細つき)。明細に回答の単価が入っていれば、回答金額を自動で計算する
  async saveRequest(env, ctx, r, lines) {
    await ensureReqLines(env);
    r = Object.assign({}, r);
    if (!String(r.vendor || '').trim()) throw fail('仕入先名を入力してください');
    if (!r.id) r.id = newId();
    if (!r.created) r.created = nowStr();
    if (!r.author) r.author = ctx.email;
    const cur = (await readAll(env, 'requests', '"id" = ?', r.id))[0];
    r.photos = cur ? cur.photos : '';
    const num = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? '' : Number(v));
    const ls = (Array.isArray(lines) ? lines : []).filter(l => String((l && l.item) || '').trim() !== '').slice(0, 200).map((l, i) => ({
      reqId: r.id, row: i + 1, item: String(l.item).slice(0, 200), qty: num(l.qty), unit: String(l.unit || '').slice(0, 20), note: String(l.note || '').slice(0, 300), price: num(l.price),
    }));
    const priced = ls.filter(l => l.price !== '');
    if (priced.length) r.amount = priced.reduce((t, l) => t + Math.round((l.qty === '' ? 1 : l.qty) * l.price), 0);
    const st = [upsertStmt(env, 'requests', r), env.DB.prepare('DELETE FROM request_lines WHERE reqId = ?').bind(r.id)];
    for (const l of ls) st.push(env.DB.prepare('INSERT INTO request_lines (reqId,row,item,qty,unit,note,price) VALUES (?,?,?,?,?,?,?)').bind(l.reqId, l.row, l.item, String(l.qty), l.unit, l.note, String(l.price)));
    st.push(bumpStmt(env, 'requests'), bumpStmt(env, 'reqLines'));
    await env.DB.batch(st);
    return { r: r, lines: ls, isNew: !cur };
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
      await ensureReqLines(env);
      stmts.push(env.DB.prepare('DELETE FROM request_lines WHERE reqId = ?').bind(id));
      const r = (await readAll(env, 'requests', '"id" = ?', id))[0];
      if (r) for (const t of String(r.photos || '').split(',').filter(Boolean)) { try { await deleteFile(env, t.split('|')[0]); } catch (e) { /* 既に無い */ } }
    }
    stmts.push(delStmt(env, key, TABLES[key][0], id), bumpStmt(env, key));
    if (key === 'quotes') stmts.push(bumpStmt(env, 'lines'));
    if (key === 'requests') stmts.push(bumpStmt(env, 'reqLines'));
    if (key === 'projects') stmts.push(bumpStmt(env, 'memos'));
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
    stmts.push(bumpStmt(env, 'quotes'), bumpStmt(env, 'lines'));
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
    let saved = false;
    if (driveConfigured(env)) { // 連携しているときは、Googleドライブに保存する
      try {
        const p = (await readAll(env, 'projects', '"id" = ?', r.projectId))[0] || {};
        const dn = (nowStr().slice(0, 10) + ' ' + [p.name, r.vendor, name].filter(Boolean).join('_')).replace(/[\\/:*?"<>|]/g, '-').slice(0, 150);
        const gid = await driveUpload(env, dn, m[1], m[2]);
        await env.DB.prepare('INSERT INTO "files" ("id","ctype","name","size","chunks","created") VALUES (?,?,?,?,?,?)').bind(id, m[1], String(name || ''), String(Math.floor(m[2].length * 3 / 4)), 'drive:' + gid, nowStr()).run();
        saved = true;
      } catch (e) {
        console.error('drive upload', e && e.message);
        await writeLog(env, ctx.email, 'op', '保存', 'Googleドライブに保存できなかったため、アプリ内に保存しました', '');
      }
    }
    if (!saved) await putFile(env, id, m[1], name, m[2]);
    const token = isPdf ? id + '|pdf' : id;
    const ids = String(r.photos || '').split(',').filter(Boolean);
    ids.push(token);
    await env.DB.batch([env.DB.prepare('UPDATE "requests" SET "photos" = ? WHERE "id" = ?').bind(ids.join(','), requestId), bumpStmt(env, 'requests')]);
    return token;
  },

  async removePhoto(env, ctx, requestId, token) {
    const r = (await readAll(env, 'requests', '"id" = ?', requestId))[0];
    if (!r) return false;
    const left = String(r.photos || '').split(',').filter(x => x && x !== token);
    await env.DB.batch([env.DB.prepare('UPDATE "requests" SET "photos" = ? WHERE "id" = ?').bind(left.join(','), requestId), bumpStmt(env, 'requests')]);
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
    await ensureReqLines(env);
    const ls = ((await env.DB.prepare('SELECT row,item,qty,unit,note FROM request_lines WHERE reqId = ? ORDER BY row').bind(requestId).all()).results || []);
    return { name: '見積依頼書_' + r.vendor + '_' + (r.requestedOn || '') + '.pdf', html: requestHtml(r, p, v, await getCompany(env), ls) };
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
    await salesCacheClear(env);
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
    await salesCacheClear(env);
    const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM sales_rows WHERE batch = ?').bind(String(batchId)).first();
    await env.DB.prepare('UPDATE sales_batches SET count = ? WHERE id = ?').bind(String(c.n), String(batchId)).run();
    return c.n;
  },
  async salesDelete(env, ctx, batchId) {
    await salesCacheClear(env);
    await env.DB.prepare('DELETE FROM sales_rows WHERE batch = ?').bind(String(batchId)).run();
    await env.DB.prepare('DELETE FROM sales_batches WHERE id = ?').bind(String(batchId)).run();
    return true;
  },
  // opt: {dcol, from, to, scol}  日付列での期間絞り込みと、金額列の合計
  // batchId が '*' のときは、最新のデータと見出しが同じすべてのデータをまたいで検索する
  async salesSearch(env, ctx, batchId, q, offset, opt) {
    await guardHeavy(env, '売上データの検索');
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
    let ranged = false;
    if (Number.isInteger(dcol) && dcol >= 0 && dcol < 300) {
      const f = ymd(opt.from), t = ymd(opt.to);
      if (f) { where += ` AND json_extract(r.data,'$[${dcol}]') >= ?`; binds.push(f); ranged = true; }
      if (t) { where += ` AND json_extract(r.data,'$[${dcol}]') <= ?`; binds.push(t); ranged = true; }
    }
    const off = Math.max(0, Number(offset) || 0), LIM = 100;
    const sumExpr = Number.isInteger(scol) && scol >= 0 && scol < 300 ? `, SUM(CAST(REPLACE(json_extract(r.data,'$[${scol}]'),',','') AS REAL)) AS s` : '';
    // 件数と合計は、表の全部を読まないと分からない(D1の読み取り行数を大きく使う)。そのため、
    //  ・2ページ目以降は数え直さない(画面が1ページ目の件数をそのまま使う)
    //  ・絞り込みが無く、合計も要らないときは、取り込み時に数えた件数を使う
    //  ・同じ条件の検索は、しばらくの間は覚えておいて使い回す
    let total = null, sum = null, cached = false;
    const plain = !terms.length && !ranged && !sumExpr;
    const ckey = JSON.stringify([ids, terms, dcol, opt.from || '', opt.to || '', scol]);
    if (off === 0) {
      if (plain) {
        const bs = await env.DB.prepare('SELECT COALESCE(SUM(CAST("count" AS INTEGER)),0) AS n FROM sales_batches WHERE id IN (' + ids.map(() => '?').join(',') + ')').bind(...ids).first();
        total = Number(bs && bs.n) || 0;
      } else {
        const hit = SCACHE.get(ckey);
        if (hit && Date.now() - hit.at < 600000) { total = hit.total; sum = hit.sum; cached = true; }
        else {
          const sk = 'sc:' + hashKey(ckey);
          const saved = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(sk).all();
          const sv = (saved.results || [])[0];
          let o = null;
          if (sv) { try { const x = JSON.parse(sv.value); if (x && x.k === ckey && Date.now() - x.at < 86400000) o = x; } catch (e) {} }
          if (o) { total = o.t; sum = o.s; cached = true; }
          else {
            const agg = await env.DB.prepare('SELECT COUNT(*) AS n' + sumExpr + ' FROM sales_rows r WHERE ' + where).bind(...binds).all();
            const a0 = (agg.results || [])[0] || {};
            total = a0.n; sum = sumExpr ? (a0.s == null ? 0 : a0.s) : null;
            try { await env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(sk, JSON.stringify({ k: ckey, t: total, s: sum, at: Date.now() })).run(); } catch (e) {}
          }
          SCACHE.set(ckey, { total: total, sum: sum, at: Date.now() });
          if (SCACHE.size > 60) SCACHE.clear();
        }
      }
    }
    const pkey = ckey + '|' + off;
    const ph = PCACHE.get(pkey);
    if (ph && Date.now() - ph.at < 600000) return { total: total == null ? ph.total : total, sum: sum == null ? ph.sum : sum, cached: true, offset: off, limit: LIM, rows: ph.rows, names: ph.names, skipped: skipped };
    const r = await env.DB.prepare('SELECT r.data AS data, b.name AS name FROM sales_rows r JOIN sales_batches b ON b.id = r.batch WHERE ' + where + ' ORDER BY b.created, r.batch, r.seq LIMIT ' + LIM + ' OFFSET ' + off).bind(...binds).all();
    const rows = (r.results || []).map(x => JSON.parse(x.data)), names = (r.results || []).map(x => x.name);
    if (PCACHE.size > 12) PCACHE.clear();
    PCACHE.set(pkey, { rows: rows, names: names, total: total, sum: sum, at: Date.now() });
    return { total: total, sum: sum, cached: cached, offset: off, limit: LIM, rows: rows, names: names, skipped: skipped };
  },

  // 税率別の売上高(月ごと)。スマイルワークスの売上CSVにある「伝票ごとの税率別合計」の列を、伝票番号で重複を除いて合計する
  async salesTax(env, ctx, batchId) {
    await guardHeavy(env, '税率別の売上高の集計');
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
    const tkey = 'tx:' + hashKey(sql + '|' + ids.join(','));
    let rows = null;
    const sv = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(tkey).first();
    if (sv) { try { rows = JSON.parse(sv.value); } catch (e) {} }
    if (!rows) {
      rows = ((await env.DB.prepare(sql).bind(...ids).all()).results) || [];
      try { await env.DB.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(tkey, JSON.stringify(rows)).run(); } catch (e) {}
    }
    const r = { results: rows };
    const R = x => Math.round(Number(x) || 0);
    const months = (r.results || []).map(x => {
      const o = { m: x.m || '', slips: x.slips, cats: cats.map((c, k) => ({ name: c.name, plain: !!c.plain, base: R(x['b' + k]), tax: c.t >= 0 ? R(x['t' + k]) : 0 })) };
      o.base = o.cats.reduce((a, c) => a + c.base, 0); o.tax = o.cats.reduce((a, c) => a + c.tax, 0); o.total = o.base + o.tax;
      return o;
    });
    return { months: months, need: [], skipped: skipped };
  },

  // ===== 入金照合(スマイルワークスの入金実績CSV と 実際の入金の突き合わせ) =====
  async depMonths(env) {
    await ensureDep(env);
    // 集計は保存しておき、取込・入力があったときだけ作り直す(読み取り行数の節約)
    const c0 = await env.DB.prepare("SELECT value FROM settings WHERE key = 'depmeta'").first();
    if (c0) { try { const o = JSON.parse(c0.value); o.accts = await depAccts(env); return o; } catch (e) {} }
    const r = await env.DB.prepare('SELECT substr(ymd,1,7) AS m, COUNT(*) AS n FROM dep_rows GROUP BY m ORDER BY m').all();
    const c = await env.DB.prepare('SELECT substr(ymd,1,7) AS m FROM dep_cells GROUP BY m').all();
    const mm = await env.DB.prepare('SELECT MIN(ymd) AS a, MAX(ymd) AS b, COUNT(*) AS n FROM dep_rows').first();
    const o = { months: r.results || [], entered: (c.results || []).map(x => x.m), from: mm && mm.a || '', to: mm && mm.b || '', n: mm ? mm.n : 0 };
    await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('depmeta',?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(o)).run();
    o.accts = await depAccts(env);
    return o;
  },
  async depMonth(env, ctx, m) {
    await ensureDep(env);
    m = String(m || '');
    if (!/^\d{4}-\d{2}$/.test(m)) throw fail('月が正しくありません');
    const lo = m + '-01', hi = m + '-32';
    const s = await env.DB.prepare('SELECT ymd, COUNT(*) AS n, SUM(amount) AS amount, SUM(cash) AS cash, SUM(bank) AS bank, SUM(fee) AS fee, SUM(off) AS off FROM dep_rows WHERE ymd >= ? AND ymd < ? GROUP BY ymd').bind(lo, hi).all();
    const c = await env.DB.prepare('SELECT ymd, k, amount, expr FROM dep_cells WHERE ymd >= ? AND ymd < ?').bind(lo, hi).all();
    const n = await env.DB.prepare('SELECT ymd, note, ok, by, at FROM dep_notes WHERE ymd >= ? AND ymd < ?').bind(lo, hi).all();
    return { m: m, smile: s.results || [], cells: c.results || [], notes: n.results || [], accts: await depAccts(env) };
  },
  async depDay(env, ctx, ymd) {
    await ensureDep(env);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) throw fail('日付が正しくありません');
    const r = await env.DB.prepare('SELECT slip, code, name, amount, cash, bank, fee, off FROM dep_rows WHERE ymd = ? ORDER BY id').bind(String(ymd)).all();
    return r.results || [];
  },
  // 1マスの入力。式(例 5000+3840)も受け付ける。空にするとそのマスを消す
  async depSet(env, ctx, ymd, k, expr) {
    await ensureDep(env);
    await env.DB.prepare("DELETE FROM settings WHERE key = 'depmeta'").run();
    ymd = String(ymd); k = String(k);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw fail('日付が正しくありません');
    const ok = k === 'cash' || k === 'fee' || (await depAccts(env)).some(a => a.id === k);
    if (!ok) throw fail('入力先が正しくありません');
    expr = String(expr == null ? '' : expr).normalize('NFKC').replace(/[,，\s]/g, '').replace(/^=/, '');
    if (expr === '') { await env.DB.prepare('DELETE FROM dep_cells WHERE ymd = ? AND k = ?').bind(ymd, k).run(); return { amount: null, expr: '' }; }
    const v = evalSum(expr);
    if (v === null) throw fail('金額は数字と + - ( ) だけで入力してください（例: 5000+3840）');
    if (Math.abs(v) > 1e11) throw fail('金額が大きすぎます');
    const isExpr = !/^-?\d+$/.test(expr);
    await env.DB.prepare('INSERT INTO dep_cells (ymd,k,amount,expr) VALUES (?,?,?,?) ON CONFLICT(ymd,k) DO UPDATE SET amount = excluded.amount, expr = excluded.expr').bind(ymd, k, v, isExpr ? expr.slice(0, 100) : '').run();
    return { amount: v, expr: isExpr ? expr : '' };
  },
  // 日ごとのメモと「確認済み」(差額があっても了承した印)
  async depNote(env, ctx, ymd, note, ok) {
    await ensureDep(env);
    ymd = String(ymd);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw fail('日付が正しくありません');
    note = String(note || '').slice(0, 300);
    if (!note && !ok) { await env.DB.prepare('DELETE FROM dep_notes WHERE ymd = ?').bind(ymd).run(); return true; }
    await env.DB.prepare('INSERT INTO dep_notes (ymd,note,ok,by,at) VALUES (?,?,?,?,?) ON CONFLICT(ymd) DO UPDATE SET note = excluded.note, ok = excluded.ok, by = excluded.by, at = excluded.at').bind(ymd, note, ok ? 1 : 0, ctx.email || '', nowStr()).run();
    return true;
  },
  // 入金実績CSVの取込。from〜to の期間の既存分を消してから入れ直す(同じ期間を何度取り込んでも二重にならない)
  async depImportBegin(env, ctx, from, to) {
    await ensureDep(env);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(to))) throw fail('期間が正しくありません');
    await env.DB.prepare("DELETE FROM settings WHERE key = 'depmeta'").run();
    await env.DB.prepare('DELETE FROM dep_rows WHERE ymd >= ? AND ymd <= ?').bind(String(from), String(to)).run();
    return true;
  },
  // rows: [ymd, 伝票番号, 得意先コード, 得意先名, 入金額, 現金, 振込など(銀行へ入るもの), 手数料, 相殺など(お金が動かないもの)]
  async depImportAdd(env, ctx, rows) {
    await ensureDep(env);
    if (!Array.isArray(rows) || rows.length > 500) throw fail('一度に送れる行数を超えています');
    await env.DB.prepare("DELETE FROM settings WHERE key = 'depmeta'").run();
    const I = v => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : 0; };
    const stmts = [];
    for (const r of rows) {
      if (!Array.isArray(r) || !/^\d{4}-\d{2}-\d{2}$/.test(String(r[0]))) continue;
      stmts.push(env.DB.prepare('INSERT INTO dep_rows (ymd,slip,code,name,amount,cash,bank,fee,off) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(String(r[0]), String(r[1] || '').slice(0, 30), String(r[2] || '').slice(0, 30), String(r[3] || '').slice(0, 100), I(r[4]), I(r[5]), I(r[6]), I(r[7]), I(r[8])));
    }
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    return stmts.length;
  },
  // ===== バックアップと復元(管理者のみ) =====
  // 文字のデータ(顧客・案件・見積・メモ・仕入先・入金照合・売上データ・会社情報)を対象にする。写真・PDF、合言葉、操作履歴は含まない
  async backupInfo(env, ctx) {
    if (!ctx.admin) throw fail('バックアップは管理者だけが使えます');
    await ensureDep(env);
    const out = {};
    for (const t of Object.keys(BK)) {
      if (t === 'sales_rows') { const c = await env.DB.prepare('SELECT COALESCE(SUM(CAST("count" AS INTEGER)),0) AS n FROM sales_batches').first(); out[t] = Number(c && c.n) || 0; continue; }
      const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM "' + t + '"' + (t === 'settings' ? " WHERE key IN ('company','depaccts')" : '')).first();
      out[t] = c.n;
    }
    const last = await env.DB.prepare("SELECT value FROM settings WHERE key = 'lastbackup'").first();
    return { counts: out, last: last ? last.value : '', labels: BK_LABEL };
  },
  // 1つの表を、決まった件数ずつ取り出す
  async backupRead(env, ctx, table, offset) {
    if (!ctx.admin) throw fail('バックアップは管理者だけが使えます');
    await guardHeavy(env, 'バックアップの作成', 4800000);
    if (!BK[table]) throw fail('対象外の表です');
    await ensureDep(env);
    const cols = BK[table], off = Math.max(0, Number(offset) || 0), LIM = table === 'sales_rows' ? 800 : 2000;
    const where = table === 'settings' ? " WHERE key IN ('company','depaccts')" : '';
    const r = await env.DB.prepare('SELECT ' + cols.map(c => '"' + c + '"').join(',') + ' FROM "' + table + '"' + where + ' ORDER BY rowid LIMIT ' + (LIM + 1) + ' OFFSET ' + off).all();
    const rows = (r.results || []).map(o => cols.map(c => o[c]));
    return { cols: cols, rows: rows.slice(0, LIM), more: rows.length > LIM, next: off + LIM };
  },
  async backupDone(env, ctx) {
    if (!ctx.admin) throw fail('バックアップは管理者だけが使えます');
    await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('lastbackup',?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(nowStr() + ' ' + (ctx.email || '')).run();
    return true;
  },
  // 復元: 表ごとに、いったん空にしてから入れ直す
  async backupClear(env, ctx, table) {
    if (!ctx.admin) throw fail('復元は管理者だけができます');
    if (!BK[table]) throw fail('対象外の表です');
    await ensureDep(env);
    await env.DB.prepare("DELETE FROM settings WHERE key = 'depmeta'").run();
    if (table === 'settings') await env.DB.prepare("DELETE FROM settings WHERE key IN ('company','depaccts')").run();
    else await env.DB.prepare('DELETE FROM "' + table + '"').run();
    return true;
  },
  async backupWrite(env, ctx, table, cols, rows) {
    if (!ctx.admin) throw fail('復元は管理者だけができます');
    if (!BK[table]) throw fail('対象外の表です');
    if (!Array.isArray(cols) || cols.join('|') !== BK[table].join('|')) throw fail('バックアップの形式が今のアプリと合いません（' + table + '）');
    if (!Array.isArray(rows) || rows.length > 800) throw fail('一度に送れる行数を超えています');
    const sql = 'INSERT OR REPLACE INTO "' + table + '" (' + cols.map(c => '"' + c + '"').join(',') + ') VALUES (' + cols.map(() => '?').join(',') + ')';
    const st = [];
    for (const r of rows) {
      if (!Array.isArray(r) || r.length !== cols.length) throw fail('バックアップのデータが壊れています（' + table + '）');
      if (table === 'settings' && !['company', 'depaccts'].includes(r[0])) continue;
      st.push(env.DB.prepare(sql).bind(...r.map(v => (v === undefined ? null : typeof v === 'object' && v !== null ? JSON.stringify(v) : v))));
    }
    for (let i = 0; i < st.length; i += 50) await env.DB.batch(st.slice(i, i + 50));
    return st.length;
  },

  // 入金チェック表(Excel)の取込。items: [ymd, 列の名前('現金'/'手数料'/口座名), 金額, 式] 。口座名が未登録なら口座を追加する
  async depImportCells(env, ctx, items) {
    await ensureDep(env);
    await env.DB.prepare("DELETE FROM settings WHERE key = 'depmeta'").run();
    if (!Array.isArray(items) || items.length > 600) throw fail('一度に送れる件数を超えています');
    const accts = await depAccts(env);
    let changed = false;
    const st = [];
    for (const it of items) {
      if (!Array.isArray(it) || !/^\d{4}-\d{2}-\d{2}$/.test(String(it[0]))) continue;
      const name = String(it[1] || '').trim().slice(0, 20), amt = Math.round(Number(it[2]));
      if (!name || !Number.isFinite(amt) || Math.abs(amt) > 1e11) continue;
      let k;
      if (name === '現金') k = 'cash'; else if (name === '手数料') k = 'fee';
      else {
        let a = accts.find(x => x.name === name);
        if (!a) { if (accts.length >= 20) throw fail('口座が多すぎます(20個まで)'); a = { id: 'a' + newId().slice(0, 6), name: name }; accts.push(a); changed = true; }
        k = a.id;
      }
      const ex = String(it[3] || '').replace(/\s/g, '').slice(0, 100);
      st.push(env.DB.prepare('INSERT INTO dep_cells (ymd,k,amount,expr) VALUES (?,?,?,?) ON CONFLICT(ymd,k) DO UPDATE SET amount = excluded.amount, expr = excluded.expr').bind(String(it[0]), k, amt, /^[0-9+\-()]+$/.test(ex) && !/^-?\d+$/.test(ex) ? ex : ''));
    }
    if (changed) await env.DB.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind('depaccts', JSON.stringify(accts)).run();
    for (let i = 0; i < st.length; i += 50) await env.DB.batch(st.slice(i, i + 50));
    return st.length;
  },
  // 口座の一覧(管理者のみ変更)。list: [{id?, name}]  idのあるものは名前の変更、ないものは追加。消せるのは入力が無い口座だけ
  async depAccounts(env, ctx, list) {
    if (!ctx.admin) throw fail('口座の変更は管理者だけができます');
    await ensureDep(env);
    if (!Array.isArray(list) || !list.length || list.length > 20) throw fail('口座は1〜20個にしてください');
    const old = await depAccts(env), out = [];
    const names = new Set();
    for (const a of list) {
      const name = String((a && a.name) || '').trim().slice(0, 20);
      if (!name) continue;
      if (names.has(name)) throw fail('同じ名前の口座があります: ' + name);
      names.add(name);
      let id = a.id && old.some(o => o.id === a.id) ? a.id : 'a' + newId().slice(0, 6);
      out.push({ id: id, name: name });
    }
    if (!out.length) throw fail('口座の名前を入力してください');
    for (const o of old) if (!out.some(x => x.id === o.id)) {
      const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM dep_cells WHERE k = ?').bind(o.id).first();
      if (c.n) throw fail('「' + o.name + '」には入力済みの金額があるため、削除できません');
    }
    await env.DB.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind('depaccts', JSON.stringify(out)).run();
    return out;
  },

  // 手書きメモの文字起こし(Gemini)
  async ocrImage(env, ctx, dataUrl) {
    const m = /^data:(image\/.+?);base64,(.*)$/s.exec(dataUrl || '');
    if (!m) throw fail('画像形式が不正です');
    if (!env.GEMINI_API_KEY) return { text: '', engine: 'none', note: '文字起こしの設定（GEMINI_API_KEY）がまだ行われていません。管理者に連絡してください。' };
    // 古いモデルは、新しい利用者には使えなくなることがある。指定のモデルが使えない(404)ときは、次の候補を順に試す
    const models = Array.from(new Set([env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'].filter(Boolean)));
    let lastErr = '';
    for (const model of models) {
      try {
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ parts: [{ text: GEMINI_PROMPT }, { inline_data: { mime_type: m[1], data: m[2] } }] }],
            generationConfig: { temperature: 0 },
          }),
        });
        // 使えない(404)・混み合っている(503)・回数制限(429)・一時的な不具合(500)のときは、次のモデルを試す
        if ([404, 429, 500, 503].includes(res.status)) { lastErr = model + ' ' + res.status + ': ' + (await res.text()).replace(/\s+/g, ' ').slice(0, 120); continue; }
        if (!res.ok) throw new Error('Gemini ' + res.status + ' (' + model + '): ' + (await res.text()).replace(/\s+/g, ' ').slice(0, 200));
        const j = await res.json();
        const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
        return { text: parts.map(p => p.text || '').join('').trim(), engine: 'gemini' };
      } catch (e) {
        return { text: '', engine: 'none', note: '文字起こしに失敗しました。しばらくしてからもう一度お試しください。\n(' + String(e.message || e).slice(0, 200) + ')' };
      }
    }
    return { text: '', engine: 'none', note: '文字起こしのAIが混み合っているか、使えません。少し時間をおいて、もう一度お試しください。\n(' + lastErr + ')' };
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


// ===== バックアップの対象 =====
const BK = Object.assign({}, TABLES, {
  request_lines: ['reqId', 'row', 'item', 'qty', 'unit', 'note', 'price'],
  sales_batches: ['id', 'name', 'headers', 'count', 'created', 'by'],
  sales_rows: ['batch', 'seq', 'data', 'search'],
  dep_rows: ['ymd', 'slip', 'code', 'name', 'amount', 'cash', 'bank', 'fee', 'off'],
  dep_cells: ['ymd', 'k', 'amount', 'expr'],
  dep_notes: ['ymd', 'note', 'ok', 'by', 'at'],
  settings: ['key', 'value'],
});
const BK_LABEL = { customers: '顧客', projects: '案件', quotes: '見積書', lines: '見積の明細', requests: '仕入先への依頼', request_lines: '仕入先への依頼の明細', memos: 'メモ', vendors: '仕入先', sales_batches: '売上データ（取込の単位）', sales_rows: '売上データ（行）', dep_rows: '入金照合：スマイルの入金', dep_cells: '入金照合：入力した金額', dep_notes: '入金照合：メモ・確認済み', settings: '会社情報・口座の一覧' };

// 売上検索の件数・合計の覚え書き(メモリ上。D1の読み取り行数を減らすため)
const SCACHE = new Map();
// 検索結果そのものの覚え書き(同じ条件・同じページを引き直さない)
const PCACHE = new Map();

// 売上データが変わったときに、検索の件数・税率別集計の覚え書きを消す
async function salesCacheClear(env) {
  SCACHE.clear(); PCACHE.clear();
  try { await env.DB.prepare("DELETE FROM settings WHERE key >= 'sc:' AND key < 'sc;'").run(); } catch (e) {}
  try { await env.DB.prepare("DELETE FROM settings WHERE key >= 'tx:' AND key < 'tx;'").run(); } catch (e) {}
}

// ===== 読み取り行数の目安を数える =====
// D1の無料枠は1日500万行まで。使いすぎに気づけるよう、おおよその行数を記録する
const RD = { n: 0, flushed: 0 };
const jstDay = () => new Date(Date.now() + JST).toISOString().slice(0, 10);
// 1回の呼び出しが終わるたびに、増えた分を settings に足す(細かすぎる書き込みは避ける)
async function flushReads(env) {
  const add = RD.n - RD.flushed;
  if (add < 2000) return;
  RD.flushed = RD.n;
  try {
    await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('rd',?) ON CONFLICT(key) DO UPDATE SET value = CASE WHEN substr(value,1,10) = substr(excluded.value,1,10) THEN substr(value,1,11) || CAST(CAST(substr(value,12) AS INTEGER) + ? AS TEXT) ELSE excluded.value END")
      .bind(jstDay() + ' ' + add, add).run();
    RDC.at = 0;
  } catch (e) { /* 数えられなくても動作に支障はない */ }
}
// D1の読み書きを数えるための包み。すべての呼び出しでこれを通す
function meterDB(real) {
  const add = (r) => { RD.n += (r && r.meta && r.meta.rows_read) || 0; return r; };
  const wrap = (st) => ({
    _st: st,
    bind: (...a) => wrap(st.bind(...a)),
    all: async () => add(await st.all()),
    first: async (...a) => { const r = add(await st.all()); const row = (r.results || [])[0] || null; return a.length ? (row ? row[a[0]] : null) : row; },
    run: async () => add(await st.run()),
  });
  return {
    prepare: (q) => wrap(real.prepare(q)),
    batch: async (l) => { const r = await real.batch(l.map(x => (x && x._st) ? x._st : x)); for (const x of r) add(x); return r; },
    exec: (...a) => real.exec(...a),
    _real: real,
  };
}

// ===== 使いすぎの見張り =====
// 無料枠は1日500万行。上限に当たるとアプリ全体が止まるので、その手前で「重い機能」だけを休ませる
const RD_LIMIT = 5000000, RD_GUARD = 4300000;
const RDC = { n: 0, at: 0 };
// mark: この処理を止める目安。バックアップは「いざという時」に使うので、ぎりぎりまで通す
async function guardHeavy(env, what, mark) {
  let n = RDC.n;
  if (Date.now() - RDC.at > 60000) { n = await readsToday(env); RDC.n = n; RDC.at = Date.now(); }
  if (n + RD.n - RD.flushed >= (mark || RD_GUARD)) {
    throw fail(what + 'は、今日はお休みです。データベースの1日の読み取り（無料枠500万行）が残りわずかなため、全体が止まらないように重い処理だけを止めています。明日の朝9時に戻ります。（ほかの機能はそのまま使えます）');
  }
}
async function readsToday(env) {
  try {
    const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'rd'").first();
    if (!r) return 0;
    const v = String(r.value);
    return v.slice(0, 10) === jstDay() ? Number(v.slice(11)) || 0 : 0;
  } catch (e) { return 0; }
}

// 短い文字列から番号を作る(検索結果の覚え書きのキー用)
function hashKey(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + '_' + str.length.toString(36);
}

// ===== データの版(どの表が変わったか) =====
// 画面を読み込むたびに全部の表を読むと、D1の「読み取り行数」(無料枠は1日500万行)をすぐ使い切ってしまう。
// 表ごとに版の番号を持ち、変わっていない表は読まないようにする。
const DVT = Object.keys(TABLES).concat(['reqLines']);
const bumpStmt = (env, t) => env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,'1') ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER)+1 AS TEXT)").bind('dv:' + t);
async function bump(env, ...tables) {
  const ts = tables.length ? tables : DVT;
  try { await env.DB.batch(ts.map(t => bumpStmt(env, t))); } catch (e) { console.error('bump', e && e.message); }
}
// 操作ごとに、変わる表。ここに無い操作は、念のため全部の表を新しい版にする(= 次の読み込みで全部読み直す)
const BUMPMAP = {
  save: a => [String(a[0] || '')],
  remove: a => [String(a[0] || ''), a[0] === 'quotes' ? 'lines' : a[0] === 'requests' ? 'reqLines' : ''],
  saveQuote: () => ['quotes', 'lines'],
  saveRequest: () => ['requests', 'reqLines'],
  uploadPhoto: () => ['requests'],
  removePhoto: () => ['requests'],
  purgeFiles: () => ['requests'],
  importCustomers: () => ['customers'],
};
// 表が変わらない操作(読み取りだけ、または別の置き場所を使うもの)
const NOBUMP = new Set(['getAll', 'getStorage', 'listFiles', 'driveStatus', 'driveTest', 'getLogs', 'getCompany', 'saveCompany',
  'changePassword', 'getQuoteBundle', 'makePdf', 'makeRequestPdf', 'makeCsv', 'ocrImage',
  'salesBatches', 'salesBegin', 'salesAdd', 'salesFinish', 'salesDelete', 'salesSearch', 'salesTax',
  'depMonths', 'depMonth', 'depDay', 'depSet', 'depNote', 'depImportBegin', 'depImportAdd', 'depImportCells', 'depAccounts',
  'backupInfo', 'backupRead', 'backupDone']);
async function bumpFor(env, fn, args) {
  if (NOBUMP.has(fn)) return;
  const f = BUMPMAP[fn];
  if (!f) { await bump(env); return; }
  const ts = f(args || []).filter(t => DVT.includes(t));
  if (ts.length) await bump(env, ...ts);
}
async function dvGet(env) {
  const o = {};
  try {
    const r = await env.DB.prepare("SELECT key, value FROM settings WHERE key >= 'dv:' AND key < 'dv;'").all();
    for (const x of r.results || []) o[String(x.key).slice(3)] = String(x.value);
  } catch (e) { /* 表がまだ無いときは全部読む */ }
  return o;
}

// ===== 表の自動点検 =====
// 古い版から更新したときに、足りない表・列があれば自動で足す(すでにある表やデータは変わらない)。最初の読み込みで1回だけ行う
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  try {
    await env.DB.batch(SCHEMA.filter(q => /^CREATE TABLE/i.test(q)).map(q => env.DB.prepare(q)));
    for (const t of Object.keys(TABLES)) {
      const have = new Set(((await env.DB.prepare('PRAGMA table_info("' + t + '")').all()).results || []).map(x => x.name));
      for (const c of TABLES[t]) if (!have.has(c)) await env.DB.prepare('ALTER TABLE "' + t + '" ADD COLUMN "' + c + '" TEXT').run();
    }
    for (const q of SCHEMA.filter(q => /^CREATE INDEX/i.test(q))) { try { await env.DB.prepare(q).run(); } catch (e) { console.error('index', e && e.message); } }
    try { await env.DB.batch(DVT.map(t => env.DB.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,'1')").bind('dv:' + t))); } catch (e) { console.error('dv', e && e.message); }
    schemaReady = true;
  } catch (e) { console.error('schema', e && e.message); }
}

// ===== 入金照合のしたく =====
const DEP_DEFAULT = ['UFJ', 'JA', '蒲信', '蒲信当座', '豊信東', '豊信小坂井', '豊信吉田方', '川信', '商工', 'ゆうちょ'];
let depReady = false;
let rlReady = false;
async function ensureReqLines(env) {
  if (rlReady) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS request_lines (reqId TEXT, row INTEGER, item TEXT, qty TEXT, unit TEXT, note TEXT, price TEXT)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS request_lines_req ON request_lines (reqId)'),
  ]);
  rlReady = true;
}
async function ensureDep(env) {
  await ensureReqLines(env);
  if (depReady) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS "settings" ("key" TEXT PRIMARY KEY, "value" TEXT)').run();
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS dep_rows (id INTEGER PRIMARY KEY AUTOINCREMENT, ymd TEXT, slip TEXT, code TEXT, name TEXT, amount INTEGER, cash INTEGER, bank INTEGER, fee INTEGER, off INTEGER)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS dep_rows_ymd ON dep_rows (ymd)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS dep_cells (ymd TEXT, k TEXT, amount INTEGER, expr TEXT, PRIMARY KEY (ymd, k))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS dep_notes (ymd TEXT PRIMARY KEY, note TEXT, ok INTEGER, by TEXT, at TEXT)'),
  ]);
  depReady = true;
}
async function depAccts(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'depaccts'").first();
  if (r) { try { const a = JSON.parse(r.value); if (Array.isArray(a) && a.length) return a; } catch (e) {} }
  return DEP_DEFAULT.map((n, i) => ({ id: 'a' + (i + 1), name: n }));
}
// 足し算・引き算・かっこだけの式を計算する(それ以外は null)。例: "-3690+414147"
function evalSum(src) {
  if (!/^[0-9+\-()]+$/.test(src) || src.length > 100) return null;
  let i = 0;
  const num = () => {
    if (src[i] === '(') { i++; const v = expr(); if (src[i] !== ')') throw 0; i++; return v; }
    if (src[i] === '-') { i++; return -num(); }
    if (src[i] === '+') { i++; return num(); }
    const m = /^\d+/.exec(src.slice(i)); if (!m) throw 0; i += m[0].length; return Number(m[0]);
  };
  const expr = () => { let v = num(); while (src[i] === '+' || src[i] === '-') { const o = src[i++]; const w = num(); v = o === '+' ? v + w : v - w; } return v; };
  try { const v = expr(); return i === src.length && Number.isFinite(v) ? v : null; } catch (e) { return null; }
}

// ===== 操作ログ・ログインログ =====
let logReady = false;
async function ensureLogs(env) {
  if (logReady) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, who TEXT, kind TEXT, action TEXT, detail TEXT, ip TEXT)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS logs_at ON logs (at)').run();
  logReady = true;
}
// kind: 'login'(ログイン・ログアウト) / 'op'(操作)。ログの失敗で本来の処理を止めない
async function writeLog(env, who, kind, action, detail, ip) {
  try {
    await ensureLogs(env);
    await env.DB.prepare('INSERT INTO logs (at,who,kind,action,detail,ip) VALUES (?,?,?,?,?,?)')
      .bind(new Date(Date.now() + JST).toISOString().slice(0, 19).replace('T', ' '), String(who || ''), kind, String(action || ''), String(detail || '').slice(0, 300), String(ip || '')).run();
    if (Math.random() < 0.02) {
      const old = new Date(Date.now() + JST - 400 * 86400000).toISOString().slice(0, 10);
      await env.DB.prepare('DELETE FROM logs WHERE at < ?').bind(old).run();
    }
  } catch (e) { console.error('log', e && e.message); }
}
const TLABEL = { customers: '顧客', projects: '案件', memos: 'メモ', vendors: '仕入先', requests: '仕入先依頼', quotes: '見積書' };
const nameOf = (key, o) => {
  o = o || {};
  const v = key === 'memos' ? String(o.body || '').split('\n')[0] : key === 'quotes' ? [o.no, o.subject].filter(Boolean).join(' ') : key === 'requests' ? o.vendor : o.name;
  return String(v || '').slice(0, 60);
};
// 呼び出しごとの記録内容。null は記録しない(読み取りだけの操作)
async function describeOp(env, fn, args, before) {
  switch (fn) {
    case 'save': { const k = args[0], o = args[1] || {}; return [(o.id ? '更新' : '追加'), TLABEL[k] + ' ' + nameOf(k, o)]; }
    case 'remove': return ['削除', (TLABEL[args[0]] || args[0]) + ' ' + (before || '')];
    case 'saveQuote': { const q = args[0] || {}; return [(q.id ? '更新' : '追加'), '見積書 ' + nameOf('quotes', q)]; }
    case 'saveCompany': return ['更新', '会社情報'];
    case 'changePassword': return ['変更', args[0] === 'admin' ? '管理者用の合言葉' : 'みんなで使う合言葉'];
    case 'uploadPhoto': return ['追加', '仕入先の回答ファイル ' + String(args[2] || '')];
    case 'removePhoto': return ['削除', '仕入先の回答ファイル'];
    case 'makePdf': return ['出力', '見積書PDF ' + (before || '')];
    case 'makeCsv': return ['出力', '見積書CSV ' + (Array.isArray(args[0]) ? args[0].length + '件' : '')];
    case 'saveRequest': { const r = args[0] || {}; return [(r.id ? '更新' : '追加'), '仕入先への見積依頼 ' + String(r.vendor || '') + '（' + (Array.isArray(args[1]) ? args[1].filter(l => l && String(l.item || '').trim()).length : 0) + '行）']; }
    case 'makeRequestPdf': return ['出力', '見積依頼書PDF ' + (before || '')];
    case 'importCustomers': return ['取込', '顧客CSV ' + (Array.isArray(args[0]) ? args[0].length + '行' : '')];
    case 'salesBegin': return ['取込', '売上データ ' + String(args[0] || '')];
    case 'salesDelete': return ['削除', '売上データ ' + (before || '')];
    case 'salesSearch': { const o = args[3] || {}; return args[2] ? null : ['検索', '売上データ「' + String(args[1] || '') + '」' + (o.from || o.to ? ' ' + (o.from || '') + '〜' + (o.to || '') : '')]; }
    case 'salesTax': return ['閲覧', '売上データの税率別集計'];
    case 'depImportBegin': return ['取込', '入金実績 ' + String(args[0] || '') + '〜' + String(args[1] || '')];
    case 'depSet': return ['入力', '入金照合 ' + String(args[0] || '') + ' ' + String(args[1] || '') + ' ' + String(args[2] || '')];
    case 'depNote': return ['更新', '入金照合のメモ ' + String(args[0] || '') + (args[2] ? '（確認済み）' : '')];
    case 'depImportCells': return ['取込', '入金チェック表 ' + (Array.isArray(args[0]) ? args[0].length + '件' : '')];
    case 'backupDone': return ['出力', 'バックアップ'];
    case 'backupClear': return ['復元', 'バックアップから復元 ' + String(args[0] || '')];
    case 'depAccounts': return ['変更', '入金照合の口座一覧'];
    case 'ocrImage': return ['利用', '手書きの文字起こし'];
    default: return null;
  }
}
async function beforeName(env, fn, args) {
  try {
    if (fn === 'remove' && TABLES[args[0]]) { const r = (await readAll(env, args[0], '"id" = ?', String(args[1])))[0]; return r ? nameOf(args[0], r) : ''; }
    if (fn === 'salesDelete') { const r = await env.DB.prepare('SELECT name FROM sales_batches WHERE id = ?').bind(String(args[0])).first(); return r ? r.name : ''; }
    if (fn === 'makePdf') { const q = (await readAll(env, 'quotes', '"id" = ?', String(args[0])))[0]; return q ? nameOf('quotes', q) : ''; }
    if (fn === 'makeRequestPdf') { const q = (await readAll(env, 'requests', '"id" = ?', String(args[0])))[0]; return q ? q.vendor : ''; }
  } catch (e) {}
  return '';
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
      const ip = request.headers.get('cf-connecting-ip') || '';
      const nm = String(b.name || '').trim().slice(0, 30) || '利用者';
      if (!cookie) { await writeLog(env, nm, 'login', 'ログイン失敗', '名前または合言葉が違います', ip); return json({ ok: false, error: '名前または合言葉が違います' }, 401); }
      await writeLog(env, nm, 'login', 'ログイン', '', ip);
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'set-cookie': cookie } });
    }
    if (request.method === 'POST' && url.pathname === '/api/logout') {
      try { const a0 = await verifyAccess(request, env); if (a0.ok) await writeLog(env, a0.email, 'login', 'ログアウト', '', request.headers.get('cf-connecting-ip') || ''); } catch (e) {}
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': 'sess=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' } });
    }

    // 読み取り行数を数える(無料枠の使いすぎを見張るため。アプリの動きは変わらない)
    env = Object.create(env, { DB: { value: meterDB(env.DB) } });
    const auth = await verifyAccess(request, env);
    if (!auth.ok) return json({ ok: false, error: auth.error, login: !!auth.login }, 401);
    const ctx = { email: auth.email || '', admin: !!auth.admin };

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
        const reads0 = RD.n;
        const args = Array.isArray(body.args) ? body.args : [];
        await ensureSchema(env);
        const pre = (fn === 'remove' || fn === 'salesDelete' || fn === 'makePdf' || fn === 'makeRequestPdf') ? await beforeName(env, fn, args) : '';
        const result = await API[fn](env, ctx, ...args);
        try { const d = await describeOp(env, fn, args, pre); if (d) await writeLog(env, ctx.email, 'op', d[0], d[1], ''); } catch (e) {}
        try { await bumpFor(env, fn, args); } catch (e) {}
        try { await flushReads(env); } catch (e) {}
        return json({ ok: true, result: result, __reads: RD.n - reads0 });
      } catch (e) {
        if (!e.app) { console.error(fn, e && e.stack || e); try { await writeLog(env, ctx.email, 'op', 'エラー', fn + ': ' + String(e && e.message || e).slice(0, 200), ''); } catch (e2) {} }
        return json({ ok: false, error: e.app ? e.message : 'サーバーでエラーが起きました。もう一度お試しください。（' + String(e && e.message || e).replace(/\s+/g, ' ').slice(0, 160) + '）' });
      }
    }
    return json({ ok: false, error: 'not found' }, 404);
  },
};
