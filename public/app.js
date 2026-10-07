// 業務管理 河村図書教材社  v2.10.8  (2026-10-07)
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const yen = n => Number(n || 0).toLocaleString('ja-JP');
const fmtNum = v => { const t = String(v == null ? '' : v).replace(/,/g, ''); if (t === '' || isNaN(Number(t))) return t; const m = /^(-?)(\d*)(\.\d*)?$/.exec(t); return m ? m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (m[3] || '') : t; };
const rawNum = v => String(v == null ? '' : v).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 65248)).replace(/[，、,]/g, '').replace(/[．。]/g, '.').replace(/[－ー−]/g, '-');
function numIn(el, ev){
  if (ev && ev.isComposing) return;
  const digitsBefore = rawNum(el.value.slice(0, el.selectionStart || 0)).replace(/[^0-9.]/g, '').length;
  const t = rawNum(el.value).replace(/[^0-9.\-]/g, '');
  el.value = fmtNum(t);
  let n = 0, pos = 0;
  while (pos < el.value.length && n < digitsBefore) { if (/[0-9.]/.test(el.value[pos])) n++; pos++; }
  try { el.setSelectionRange(pos, pos); } catch (e) {}
}
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
let busyN = 0;
function busy(d){ busyN += d; $('#busy').style.display = busyN > 0 ? 'block' : 'none'; }
let AUTH = false; // ログイン済みか(サーバーからデータを受け取れたら true)
async function run(fn, ...a){
  busy(1);
  try {
    const res = await fetch('/api/rpc/' + fn, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({args: a})});
    let j = null;
    try { j = await res.json(); } catch (e) { /* 下で処理 */ }
    if (!j) throw new Error('サーバーから正しい応答がありません。ページを開き直してください（ログインの有効期限が切れた可能性があります）。');
    if (!j.ok && j.login) { AUTH = false; showLogin(); const er = new Error('ログインが必要です'); er.silent = true; throw er; }
    if (!j.ok) throw new Error(j.error || 'エラーが起きました');
    return j.result;
  } catch (e) {
    if (e.silent) throw e;
    alert('エラー: ' + (e.message || e));
    throw e;
  } finally { busy(-1); }
}
function showLogin(){
  document.body.classList.add('noauth'); document.body.dataset.sec = 'menu'; const tb = $('#tb'); if (tb) tb.innerHTML = ''; DB = {customers:[],projects:[],quotes:[],lines:[],requests:[],vendors:[],memos:[],company:DB && DB.company ? {name: ''} : null}; SALES = {batches: null, res: null};
  $('#app').innerHTML = '<div class="card" style="max-width:360px;margin:30px auto"><b style="font-size:17px">ログイン</b><label>お名前</label><input id="lgn" autocomplete="username"><label>合言葉</label><input id="lgp" type="password" autocomplete="current-password"><div id="lge" style="color:#b42318;margin-top:8px"></div><div style="margin-top:12px"><button class="pri" id="lgb">ログイン</button></div></div>';
  const go1 = async () => {
    $('#lge').textContent = ''; $('#lgb').disabled = true;
    try {
      const r = await fetch('/api/login', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({name: $('#lgn').value, password: $('#lgp').value})});
      const j = await r.json().catch(() => null);
      if (j && j.ok) { try { localStorage.setItem('lgn', $('#lgn').value); } catch (e) {} reload(); return; }
      $('#lge').textContent = (j && j.error) || 'ログインできませんでした';
    } catch (e) { $('#lge').textContent = '通信エラーです'; }
    $('#lgb').disabled = false;
  };
  $('#lgb').onclick = go1;
  $('#lgp').onkeydown = e => { if (e.key === 'Enter') go1(); };
  try { $('#lgn').value = localStorage.getItem('lgn') || ''; } catch (e) {}
}
let DB = {customers:[],projects:[],quotes:[],lines:[],requests:[],vendors:[],memos:[]};
const HASHV = {menu: 1, memos: 1, home: 1, sales: 1, report: 1, customers: 1, vendors: 1, salesimport: 1, company: 1, salestax: 1, logs: 1, storage: 1, deposit: 1, backup: 1};
let view = {n: HASHV[location.hash.slice(1)] ? location.hash.slice(1) : 'menu'};
const TABS = [['menu', '🏠 メニュー'], ['memos', '📝 メモ帳'], ['home', '📄 見積管理'], ['sales', '💴 売上データ検索'], ['deposit', '💳 入金照合']];
let backView = null;
function tabOf(n){ if (n === 'form' && backView && backView.n && backView.n !== 'form') n = backView.n; return n === 'memos' ? 'memos' : n === 'deposit' ? 'deposit' : (n === 'sales' || n === 'salestax') ? 'sales' : (n === 'menu' || n === 'customers' || n === 'vendors' || n === 'salesimport' || n === 'company' || n === 'logs' || n === 'storage' || n === 'backup') ? '' : 'home'; }
function tbHtml(){
  const cur = view.n === 'menu' ? 'menu' : tabOf(view.n);
  const me = DB && DB.me ? DB.me : null;
  return TABS.map(t => `<div data-sec="${t[0]}" class="tg${t[0] === cur ? ' on' : ''}"><a href="#${t[0]}" onclick="return tbGo(event,'${t[0]}')">${t[1]}</a><a class="x" href="#${t[0]}" target="_blank" rel="noopener" title="別のタブで開く">↗</a></div>`).join('') + `<div class="tg out"><a href="#" onclick="return doLogout()" title="${me ? esc(me.name) + ' としてログイン中' : ''}">${me ? '👤 ' + esc(me.name) + '　' : ''}ログアウト</a></div>`;
}
async function doLogout(){
  if (!confirm('ログアウトします。よろしいですか？')) return false;
  try { await fetch('/api/logout', {method: 'POST'}); } catch (e) {}
  AUTH = false; try { history.replaceState(null, '', location.pathname); } catch (e) {}
  showLogin(); return false;
}
// 通常のクリックはアプリ内で切り替え、Ctrl/⌘/Shift+クリックや中クリックはブラウザの新しいタブで開く
function tbGo(e, n){ if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return true; go(n); return false; }
const V = {};
async function reload(){
  try { DB = await run('getAll'); AUTH = true; render(); }
  catch (e) { if (e && e.silent) return; $('#app').innerHTML = '<div class="card"><b>データの読み込みに失敗しました</b><div class="mute" style="margin:8px 0;white-space:pre-wrap">' + esc((e && e.message) || e) + '</div><button onclick="reload()">再読み込み</button></div>'; }
}
setTimeout(() => { if ($('#app').textContent.indexOf('読み込み中') === 0) $('#app').innerHTML += '<p class="mute">読み込みに時間がかかっています。通信状況を確認して、しばらくお待ちください。</p>'; }, 15000);
function go(n, p){ view = Object.assign({n:n}, p || {}); try { if (HASHV[n]) history.replaceState(null, '', '#' + n); } catch (e) {} render(); window.scrollTo(0, 0); }
function render(){ if (!AUTH) return showLogin(); document.body.classList.remove('noauth'); { const co = document.querySelector('header .co'); if (co && DB.company && DB.company.name) co.textContent = DB.company.name; } { const vn = (view.n === 'form' && backView && backView.n) || view.n; document.body.dataset.sec = tabOf(view.n) || (vn === 'customers' || vn === 'vendors' || vn === 'salesimport' || vn === 'company' || vn === 'logs' || vn === 'storage' || vn === 'backup' ? 'master' : 'menu'); } $('#tb').innerHTML = tbHtml(); $('#app').innerHTML = V[view.n](); if (view.n === 'project') loadThumbs(); }
const cust = id => DB.customers.find(c => c.id === id) || {};
const proj = id => DB.projects.find(p => p.id === id) || {};

// ---------- 検索 ----------
function hay(p){
  const c = cust(p.customerId);
  const qs = DB.quotes.filter(q => q.projectId === p.id);
  const ls = DB.lines.filter(l => qs.some(q => q.id === l.quoteId)).map(l => l.item + ' ' + l.note).join(' ');
  const rs = DB.requests.filter(r => r.projectId === p.id).map(r => [r.vendor, r.memo, r.status].join(' ')).join(' ');
  return [p.name, p.memo, p.status, c.name, c.contact, qs.map(q => [q.no, q.subject, q.note].join(' ')).join(' '), ls, rs].join(' ').toLowerCase();
}
function listHtml(){
  const words = (view.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const st = p => p.status || '進行中';
  const byNew = (a, b) => String(b.created).localeCompare(String(a.created));
  const rank = p => { const i = PSTAT.indexOf(st(p)); return i < 0 ? 99 : i; };
  const cmp = {
    new: byNew,
    old: (a, b) => -byNew(a, b),
    stat: (a, b) => rank(a) - rank(b) || byNew(a, b),
    cust: (a, b) => String(cust(a.customerId).name || '').localeCompare(String(cust(b.customerId).name || ''), 'ja') || byNew(a, b),
    name: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ja') || byNew(a, b),
  }[HOME.so] || byNew;
  const list = DB.projects.filter(p => (!HOME.ps || st(p) === HOME.ps) && (() => { const h = hay(p); return words.every(w => h.includes(w)); })()).sort(cmp);
  // 状態別のときは、状態ごとに見出しを入れる
  let lastSt = null;
  return list.map(p => {
    const head = HOME.so === 'stat' && st(p) !== lastSt ? (lastSt = st(p), `<div class="mute" style="margin:12px 4px 4px"><b>${esc(st(p))}</b>（${list.filter(x => st(x) === st(p)).length}件）</div>`) : '';
    const nq = DB.quotes.filter(q => q.projectId === p.id).length;
    const nr = DB.requests.filter(r => r.projectId === p.id).length;
    return head + `<div class="card click" onclick="go('project',{id:'${p.id}'})"><div class="row"><b class="sp">${esc(p.name)}</b><span class="badge">${esc(p.status || '進行中')}</span></div>
    <div class="mute">${esc(cust(p.customerId).name || '(顧客未設定)')}　見積 ${nq}件 / 仕入先 ${nr}件${(() => { const S = projSummary(p.id); return S && S.pf.n ? '　粗利 ¥' + yen(S.pf.profit) + '（' + pct(S.pf.profit, S.pf.rev) + '）' : ''; })()}</div></div>`;
  }).join('') || '<p class="mute">該当する案件がありません</p>';
}
function search(v){ view.q = v; $('#list').innerHTML = listHtml(); }
V.menu = () => {
  const open = DB.memos.filter(m => m.status !== '完了').length;
  return `<div class="tiles">
  <div class="card click tile" data-sec="memos" onclick="go('memos')"><span class="ic">📝</span><b>メモ帳</b><div class="mute">問い合わせ・注文・連絡事項</div>${open ? `<div><span class="badge" style="background:#fde8e8;color:#b42318">未完了 ${open}件</span></div>` : ''}</div>
  <div class="card click tile" data-sec="home" onclick="go('home')"><span class="ic">📄</span><b>見積管理</b><div class="mute">見積・案件・仕入先・集計</div><div class="mute">案件 ${DB.projects.length}件</div></div>
  <div class="card click tile" data-sec="sales" onclick="go('sales')"><span class="ic">💴</span><b>売上データ検索</b><div class="mute">売上CSVを取り込んで検索</div></div>
  <div class="card click tile" data-sec="deposit" onclick="go('deposit')"><span class="ic">💳</span><b>入金照合</b><div class="mute">スマイルの入金と実際の入金を照合</div></div></div>
  <h2><span>マスタ</span></h2><div class="row"><button class="mbtn" onclick="go('customers')">顧客</button><button class="mbtn" onclick="go('vendors')">仕入先</button><button class="mbtn" onclick="go('salesimport')">売上データ取込</button><button class="mbtn" onclick="go('company')">会社情報</button>${DB.me && DB.me.admin ? `<button class="mbtn" onclick="go('logs')">操作履歴</button><button class="mbtn" onclick="go('storage')">保存容量</button><button class="mbtn" onclick="go('backup')">バックアップ</button>` : ''}</div>`;
};
// ---------- 売上データ(CSV取込・検索) ----------
let SALES = {batches: null, res: null};
const salesCur = () => {
  const bs = SALES.batches || [];
  if (view.b === '*' && bs.length) return Object.assign({}, bs[0], {id: '*', name: 'すべて', count: bs.reduce((a, x) => a + x.count, 0)});
  return bs.find(b => b.id === view.b);
};
function salesCols(b){ // 表示する列(利用者が選んだもの。なければ初期値)
  try { const v = JSON.parse(localStorage.getItem('scols:' + b.id) || 'null'); if (Array.isArray(v) && v.length) return v; } catch (e) {}
  return b.show && b.show.length ? b.show : b.headers.map((_, i) => i);
}
const ST = {info: null, files: null, drive: null};
function gasScript(key){
  return [
    "// 業務管理アプリ用: 写真・PDFをGoogleドライブに保存する受付口",
    "const KEY = '" + key + "';",
    "const FOLDER_NAME = '業務管理 写真・PDF';",
    "function folder_() { const it = DriveApp.getFoldersByName(FOLDER_NAME); return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME); }",
    "function inFolder_(f) { const id = folder_().getId(), ps = f.getParents(); while (ps.hasNext()) { if (ps.next().getId() === id) return true; } return false; }",
    "function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }",
    "function doPost(e) {",
    "  try {",
    "    const p = JSON.parse(e.postData.contents);",
    "    if (p.key !== KEY) return out_({ok: false, error: 'key'});",
    "    if (p.action === 'ping') return out_({ok: true, folder: folder_().getId()});",
    "    if (p.action === 'put') { const f = folder_().createFile(Utilities.newBlob(Utilities.base64Decode(p.data), p.ctype, p.name)); return out_({ok: true, id: f.getId()}); }",
    "    if (p.action === 'get') { const f = DriveApp.getFileById(p.id); if (!inFolder_(f)) return out_({ok: false, error: 'folder'}); return out_({ok: true, data: Utilities.base64Encode(f.getBlob().getBytes())}); }",
    "    if (p.action === 'del') { const f = DriveApp.getFileById(p.id); if (!inFolder_(f)) return out_({ok: false, error: 'folder'}); f.setTrashed(true); return out_({ok: true}); }",
    "    return out_({ok: false, error: 'action'});",
    "  } catch (err) { return out_({ok: false, error: String(err)}); }",
    "}"
  ].join('\n');
}
function copyText(id){ const el = $('#' + id); try { navigator.clipboard.writeText(el.value || el.textContent); alert('コピーしました'); } catch (e) { el.select && el.select(); alert('選択しました。コピー（Ctrl+C）してください'); } }
async function driveTest(){ await run('driveTest'); alert('つながりました。これから保存する写真・PDFは、Googleドライブに入ります。'); }
function driveCard(){
  const d = ST.drive || {};
  if (d.configured) return `<div class="card"><b>☁ Googleドライブ連携</b><div class="mute" style="margin:6px 0">設定済みです。新しく保存する写真・PDFは、Googleドライブの「業務管理 写真・PDF」フォルダに入ります。アプリの容量は使いません。</div><div class="row"><button onclick="driveTest()">接続を確認</button></div><div class="mute" style="margin-top:6px">やめるときは、Cloudflareの「変数とシークレット」から DRIVE_GAS_URL と DRIVE_GAS_KEY を削除します。すでにドライブに入れたファイルは、設定を消すとアプリから開けなくなります（ドライブには残ります）。</div></div>`;
  if (!ST.gkey) { const a = new Uint8Array(20); crypto.getRandomValues(a); ST.gkey = Array.from(a, x => x.toString(16).padStart(2, '0')).join(''); }
  return `<div class="card"><b>☁ Googleドライブ連携（準備が必要です）</b>
  <div class="mute" style="margin:6px 0">写真・PDFをGoogleドライブに保存できるようにします。最初に1回だけ、次の準備をします。Google Cloudは使わないので、カード登録は要りません。</div>
  <ol style="margin:6px 0 6px 18px;padding:0;font-size:14px;line-height:1.6">
  <li>保存先にしたいGoogleアカウントで、<a href="https://script.google.com" target="_blank" rel="noopener">script.google.com</a> を開き、「新しいプロジェクト」を作ります。</li>
  <li>最初からある文字を全部消して、下の文字を貼り付けて保存します。<br><button onclick="copyText('gas_code')">スクリプトをコピー</button><textarea id="gas_code" readonly rows="5" style="font-size:11px;margin-top:6px">${esc(gasScript(ST.gkey))}</textarea></li>
  <li>右上の「デプロイ」→「新しいデプロイ」→ 種類は「ウェブアプリ」。「次のユーザーとして実行」は<b>自分</b>、「アクセスできるユーザー」は<b>全員</b>にして、デプロイします。</li>
  <li>初回は「アクセスを承認」が出ます。自分のアカウントを選び、「詳細」→「（プロジェクト名）に移動」→「許可」を押します。</li>
  <li>出てきた「ウェブアプリのURL」（https://script.google.com/macros/s/…/exec）をコピーします。</li>
  <li>Cloudflareの「変数とシークレット」に、2つ登録して保存します。<br>・名前 <code>DRIVE_GAS_URL</code> ＝ 手順5のURL<br>・名前 <code>DRIVE_GAS_KEY</code> ＝ <code id="gas_key">${esc(ST.gkey)}</code> <button onclick="copyText('gas_key')">コピー</button></li>
  <li>デプロイが終わったら、この画面を開き直して「接続を確認」を押します。</li></ol>
  <div class="mute">この画面を開き直すと、キーが変わります。手順2と6のキーは、必ず同じものを使ってください。</div></div>`;
}
const fmtRows = n => n >= 1000000 ? (n / 1000000).toFixed(2) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n);
function rdHtml(rd){
  if (!rd) return '';
  const pct = Math.min(100, rd.today / rd.limit * 100);
  const col = pct >= 80 ? '#b42318' : pct >= 50 ? '#e07b00' : 'var(--c)';
  return `<div class="card"><b>今日のデータベースの読み取り</b>
    <div style="margin:8px 0 4px;font-size:22px"><b style="color:${col}">${fmtRows(rd.today)}</b> <span class="mute" style="font-size:14px">/ ${fmtRows(rd.limit)}行（${pct.toFixed(1)}%）</span></div>
    <div style="height:14px;background:#e5e7eb;border-radius:7px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${col}"></div></div>
    <div class="mute" style="margin-top:8px">無料枠は1日500万行までです。使い切ると、その日はデータを読めなくなります（毎朝9時に戻ります）。アプリが数えたおよその値です。${pct >= 80 ? '<br><b style="color:#b42318">上限に近づいています。売上データ検索の使用を控えてください。</b>' : ''}</div></div>`;
}
const fmtB = n => n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
async function loadStorage(){
  try { ST.info = await run('getStorage'); ST.files = await run('listFiles'); ST.drive = await run('driveStatus'); } catch (e) { return; }
  if (view.n === 'storage') render();
}
function purgeCut(){ const el = $('#pg_date'); return el ? el.value : ''; }
function purgePreview(){
  const c = purgeCut(), t = $('#pg_prev'); if (!t) return;
  const hit = (ST.files || []).filter(f => c && String(f.created).slice(0, 10) < c);
  t.textContent = c ? c + ' より前: ' + hit.length + '件（約 ' + fmtB(hit.reduce((s, f) => s + f.size, 0)) + '）が削除されます' : '日付を選んでください';
  const b = $('#pg_btn'); if (b) b.disabled = !hit.length;
}
async function purgeNow(){
  const c = purgeCut(); const hit = (ST.files || []).filter(f => c && String(f.created).slice(0, 10) < c);
  if (!hit.length) return;
  if (!confirm(c + ' より前に保存した写真・PDF（' + hit.length + '件）を削除します。\n削除したものは元に戻せません。よろしいですか？')) return;
  const r = await run('purgeFiles', c);
  alert(r.n + '件（約 ' + fmtB(r.bytes) + '）を削除しました。');
  ST.info = null; ST.files = null; render();
}
V.storage = () => {
  const back = `<div class="bar"><button onclick="go('menu')">← メニュー</button></div><h2><span>💾 保存容量</span></h2>`;
  setTimeout(purgePreview, 0);
  if (!(DB.me && DB.me.admin)) return back + '<div class="card">保存容量を見られるのは管理者だけです。</div>';
  if (!ST.info) { loadStorage(); return back + '<div class="card">読み込み中...</div>'; }
  const i = ST.info, pct = Math.min(100, i.dbBytes / i.limit * 100), left = Math.max(0, i.limit - i.dbBytes);
  const col = pct >= 90 ? '#b42318' : pct >= 70 ? '#e07b00' : 'var(--c)';
  const other = Math.max(0, i.dbBytes - i.files.bytes - i.sales.bytes);
  const fl = ST.files || [], oldest = fl.length ? String(fl[0].created).slice(0, 10) : '';
  const d0 = new Date(Date.now() + 9 * 3600e3); d0.setUTCFullYear(d0.getUTCFullYear() - 1);
  return back + `<div class="card"><b>データベースの使用量</b>
    <div style="margin:8px 0 4px;font-size:22px"><b>${fmtB(i.dbBytes)}</b> <span class="mute" style="font-size:14px">/ ${fmtB(i.limit)}（${pct.toFixed(1)}%）</span></div>
    <div style="height:14px;background:#e5e7eb;border-radius:7px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${col}"></div></div>
    <div style="margin-top:6px">無料で使える残り: <b style="color:${col}">約 ${fmtB(left)}</b></div>
    <table style="width:100%;margin-top:10px;font-size:14px"><tr><td>📎 回答の写真・PDF（${i.files.n}件）</td><td class="n">${fmtB(i.files.bytes)}</td></tr>
    ${i.drive && i.drive.n ? `<tr><td>☁ Googleドライブに保存（${i.drive.n}件）</td><td class="n">${fmtB(i.drive.bytes)}（アプリの容量は使わない）</td></tr>` : ''}
    <tr><td>💴 売上データ（${i.sales.batches}件・${i.sales.rows}行）</td><td class="n">${i.sales.approx ? '約 ' : ''}${fmtB(i.sales.bytes)}</td></tr>
    <tr><td>その他（メモ・案件・見積・操作履歴 約${i.logs}件など）</td><td class="n">${fmtB(other)}</td></tr></table>
    <div class="mute" style="margin-top:8px">無料プランは、1つのデータベースが500MBまでです（Cloudflareの無料枠）。上限に近づくと、保存や取り込みができなくなります。</div></div>
  ${rdHtml(i.reads)}
  ${driveCard()}
  <div class="card"><b>過去の写真・PDFをまとめて削除</b>
    <div class="mute" style="margin:4px 0">仕入先の回答に保存した写真・PDFが対象です。見積書や案件、メモは消えません。削除したものは戻せません。${oldest ? '一番古いのは ' + oldest + ' です。' : '保存されたファイルはありません。'}</div>
    <label>この日より前に保存したものを削除</label><input id="pg_date" type="date" value="${d0.toISOString().slice(0, 10)}" oninput="purgePreview()">
    <div id="pg_prev" style="margin-top:8px;font-weight:700"></div>
    <div class="row" style="margin-top:10px"><button class="dng" id="pg_btn" onclick="purgeNow()">まとめて削除</button></div>
    <div class="mute" style="margin-top:6px">削除してもグラフの数字がすぐには減らないことがあります（空いた場所は、このあと再利用されます）。</div></div>
  ${fl.length ? `<div class="card"><b>保存されているファイル（古い順・先頭50件）</b><div style="overflow:auto"><table style="width:100%;font-size:13px"><tr><th>保存日</th><th>種類</th><th>仕入先</th><th>案件</th><th>場所</th><th class="n">大きさ</th></tr>${fl.slice(0, 50).map(f => `<tr><td style="white-space:nowrap">${esc(String(f.created).slice(0, 10))}</td><td>${esc(f.kind)}</td><td>${esc(f.vendor)}</td><td>${esc(f.project)}</td><td>${f.gid ? `<a href="https://drive.google.com/file/d/${esc(f.gid)}/view" target="_blank" rel="noopener">ドライブ</a>` : 'アプリ'}</td><td class="n" style="white-space:nowrap">${fmtB(f.size)}</td></tr>`).join('')}</table></div></div>` : ''}`;
};
const LOGS = {rows: [], more: false, kind: '', q: '', loading: false};
async function loadLogs(more){
  if (LOGS.loading) return; LOGS.loading = true;
  try {
    const r = await run('getLogs', {kind: LOGS.kind, q: LOGS.q, offset: more ? LOGS.rows.length : 0});
    LOGS.rows = more ? LOGS.rows.concat(r.rows) : r.rows; LOGS.more = r.more;
  } finally { LOGS.loading = false; }
  const el = $('#loglist'); if (el) el.innerHTML = logsHtml();
}
function logsHtml(){
  const rows = LOGS.rows.map(r => {
    const bad = r.action === 'ログイン失敗', del = r.action === '削除';
    return `<tr><td style="white-space:nowrap">${esc(r.at.slice(5, 16))}</td><td>${esc(r.who)}</td><td style="white-space:nowrap${bad ? ';color:#b42318;font-weight:700' : del ? ';color:#b42318' : ''}">${esc(r.action)}</td><td>${esc(r.detail)}${r.ip ? ' <span class="mute">(' + esc(r.ip) + ')</span>' : ''}</td></tr>`;
  }).join('');
  return rows ? `<div style="overflow:auto"><table class="tbl" style="width:100%;font-size:13px"><tr><th>日時</th><th>お名前</th><th>操作</th><th>内容</th></tr>${rows}</table></div>` + (LOGS.more ? `<div class="row" style="margin-top:8px"><button onclick="loadLogs(true)">さらに100件表示</button></div>` : '') : '<p class="mute">記録はありません</p>';
}
V.logs = () => {
  if (!(DB.me && DB.me.admin)) return `<div class="bar"><button onclick="go('menu')">← メニュー</button></div><div class="card">操作履歴を見られるのは管理者だけです。</div>`;
  setTimeout(() => loadLogs(false), 0);
  return `<div class="bar"><button onclick="go('menu')">← メニュー</button><span class="sp"></span></div>
  <h2><span>操作履歴（ログイン・操作）</span></h2>
  <div class="bar"><select style="width:auto" onchange="LOGS.kind=this.value;loadLogs(false)">${[['', 'すべて'], ['login', 'ログイン・ログアウト'], ['op', '操作']].map(x => `<option value="${x[0]}" ${LOGS.kind === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select>
  <input placeholder="お名前・内容で検索" value="${esc(LOGS.q)}" oninput="LOGS.q=this.value;clearTimeout(LOGS.t);LOGS.t=setTimeout(()=>loadLogs(false),350)"></div>
  <div id="loglist">${logsHtml()}</div>`;
};
V.company = () => {
  const c = DB.company || {};
  const F = [['name', '会社名', 'text'], ['address', '住所（〒を含めて入力）', 'text'], ['tel', '電話番号（例: 0532-39-5311）', 'text'], ['fax', 'FAX番号（例: 0532-39-5312）', 'text'],
    ['email', 'メールアドレス', 'text'], ['regNo', 'インボイス登録番号（例: T1234567890123）', 'text'],
    ['bank', '振込先（見積書の下部に載せます）', 'area'], ['note', '見積書の下部に載せる文（支払条件・納期の目安など）', 'area']];
  const adm = !!(DB.me && DB.me.admin), dis = adm ? '' : ' disabled';
  return `<div class="bar"><button onclick="go('menu')">← メニュー</button></div>
  <h2><span>🏢 会社情報</span></h2>
  <div class="card"><div class="mute" style="margin-bottom:4px">見積書・見積依頼書・Excelに載る、自社の情報です。空欄の項目は載りません。${adm ? '' : '<br><b style="color:#b42318">編集できるのは管理者だけです（お名前「管理者」でログインしてください）。</b>'}</div>
  ${F.map(f => `<label>${f[1]}</label>` + (f[2] === 'area' ? `<textarea id="co_${f[0]}" rows="3"${dis}>${esc(c[f[0]])}</textarea>` : `<input id="co_${f[0]}" value="${esc(c[f[0]])}"${dis}>`)).join('')}
  ${adm ? '<div class="row" style="margin-top:14px"><button class="pri" onclick="saveCompany()">保存</button></div>' : ''}</div>
  <div class="card"><b>見積書での載り方（見本）</b><div style="text-align:right;font-size:13px;margin-top:6px">${coPreview(c)}</div></div>
  ${adm ? pwCard() : ''}`;
};
function pwCard(){
  return `<div class="card"><b>🔑 合言葉の変更（管理者のみ）</b>
  <div class="mute" style="margin:4px 0">変更すると、全員のログインが切れます。新しい合言葉で入り直してください。合言葉は8文字以上にしてください。</div>
  <label>変更する合言葉</label><select id="pw_kind"><option value="common">みんなで使う合言葉</option><option value="admin">管理者用の合言葉</option></select>
  <label>新しい合言葉</label><input id="pw_new" type="password" autocomplete="new-password">
  <label>新しい合言葉（もう一度）</label><input id="pw_new2" type="password" autocomplete="new-password">
  <label>管理者用の今の合言葉（確認のため）</label><input id="pw_cur" type="password" autocomplete="current-password">
  <div class="row" style="margin-top:14px"><button class="pri" onclick="changePw()">合言葉を変更</button></div></div>`;
}
async function changePw(){
  const n1 = $('#pw_new').value, n2 = $('#pw_new2').value, cur = $('#pw_cur').value;
  if (n1.length < 8) return alert('新しい合言葉は8文字以上にしてください');
  if (n1 !== n2) return alert('新しい合言葉が、2回の入力で一致しません');
  if (!cur) return alert('管理者用の今の合言葉を入力してください');
  if (!confirm('合言葉を変更します。全員のログインが切れます。よろしいですか？')) return;
  await run('changePassword', $('#pw_kind').value, n1, cur);
  alert('合言葉を変更しました。新しい合言葉でログインし直してください。');
  location.reload();
}
function coPreview(c){
  const tf = [c.tel ? 'TEL ' + c.tel : '', c.fax ? 'FAX ' + c.fax : ''].filter(Boolean).join('　');
  return `<b>${esc(c.name)}</b>${c.address ? '<br>' + esc(c.address) : ''}${tf ? '<br>' + esc(tf) : ''}${c.email ? '<br>' + esc(c.email) : ''}${c.regNo ? '<br>登録番号: ' + esc(c.regNo) : ''}`;
}
async function saveCompany(){
  const o = {}; ['name', 'address', 'tel', 'fax', 'email', 'regNo', 'bank', 'note'].forEach(k => o[k] = $('#co_' + k).value.trim());
  if (!o.name) return alert('会社名を入力してください');
  DB.company = await run('saveCompany', o);
  alert('保存しました。次に作る見積書から反映されます。');
  render();
}
V.salestax = () => {
  if (!SALES.batches) { loadSales3(); return '<div class="card">読み込み中...</div>'; }
  const bs = SALES.batches;
  if (view.b == null || (view.b !== '*' && !bs.find(b => b.id === view.b))) view.b = bs.length ? bs[0].id : '';
  if (!bs.length) return `<div class="bar"><button onclick="go('sales')">← 売上データ検索</button></div><div class="card"><p class="mute" style="margin:0 0 8px">まだ売上データがありません。マスタの「売上データ取込」からCSVを取り込んでください。</p><button class="pri" onclick="go('salesimport')">売上データを取り込む</button></div>`;
  if (view.tax === undefined || view.taxFor !== view.b) { view.tax = null; view.taxFor = view.b; loadTax(); }
  return `<div class="bar"><button onclick="go('sales',{b:view.b})">← 売上データ検索</button></div>
  <h2><span>📊 税率別の売上高</span></h2>
  <div class="card"><label style="margin-top:0">集計するデータ</label>
    <select onchange="go('salestax',{b:this.value})">${bs.length > 1 ? `<option value="*"${view.b === '*' ? ' selected' : ''}>★ すべて（月ごとに集計）</option>` : ''}${bs.map(b => `<option value="${b.id}"${b.id === view.b ? ' selected' : ''}>${esc(b.name)}（${b.count}行）</option>`).join('')}</select></div>
  <div id="taxres">${taxHtml()}</div>`;
};
async function loadSales3(){ SALES.batches = await run('salesBatches'); if (view.n === 'salestax') render(); }
async function loadTax(){
  const id = view.b; if (!id) return;
  const r = await run('salesTax', id);
  if (view.b !== id) return;
  view.tax = r; const e = $('#taxres'); if (e) e.innerHTML = taxHtml();
}
const fy = n => (n < 0 ? '-' : '') + fmtNum(String(Math.abs(Math.round(n))));
function rateLabel(c){ // 税率は金額から求める(税額÷税抜)。税率が変わっても、列が増えても、そのまま表示できる
  if (c.plain || !c.base) return '';
  const r = c.tax / c.base * 100, n = Math.round(r);
  return Math.abs(r - n) < 0.35 ? '（' + n + '%）' : '（約' + r.toFixed(1) + '%）';
}
function taxBlock(m, title){
  const row = c => `<tr><td>${esc(c.name)}${rateLabel(c)}</td><td class="n">${fy(c.base)}</td><td class="n">${fy(c.tax)}</td><td class="n">${fy(c.base + c.tax)}</td></tr>`;
  return `<div class="card"><b style="font-size:16px">${esc(title)}</b> <span class="mute">伝票 ${m.slips}枚</span>
  <div style="overflow:auto;margin-top:8px"><table style="border-collapse:collapse;width:100%;font-size:14px"><thead><tr><th style="text-align:left">税率区分</th><th>税抜売上高</th><th>消費税額</th><th>税込</th></tr></thead><tbody>
  ${m.cats.filter(c => !c.plain || c.base).map(row).join('')}
  <tr style="font-weight:bold;background:var(--cl)"><td>合計</td><td class="n">${fy(m.base)}</td><td class="n">${fy(m.tax)}</td><td class="n">${fy(m.total)}</td></tr></tbody></table></div></div>`;
}
function taxHtml(){
  const r = view.tax;
  if (!r) return '<p class="mute">集計中...</p>';
  if (r.need && r.need.length) return `<div class="card"><b>このCSVでは税率別の集計ができません</b><div class="mute" style="margin-top:6px">スマイルワークスの売上伝票CSVにある、次の列が見つかりませんでした。<br>${r.need.map(esc).join('<br>')}</div></div>`;
  if (!r.months.length) return '<p class="mute">集計できるデータがありません</p>';
  const all = {slips: 0, cats: [], base: 0, tax: 0, total: 0};
  r.months.forEach(m => { all.slips += m.slips; all.base += m.base; all.tax += m.tax; all.total += m.total; m.cats.forEach(c => { let x = all.cats.find(y => y.name === c.name); if (!x) all.cats.push(x = {name: c.name, plain: c.plain, base: 0, tax: 0}); x.base += c.base; x.tax += c.tax; }); });
  const label = m => /^\d{4}\/\d{2}$/.test(m) ? m.slice(0, 4) + '年' + Number(m.slice(5)) + '月分' : (m || '日付なし');
  return r.months.map(m => taxBlock(m, label(m.m))).join('') + (r.months.length > 1 ? taxBlock(all, '全期間の合計') : '') +
  `<div class="mute" style="margin:6px 2px">・伝票ごとの税率別合計を、伝票番号で重複を除いて集計しています（スマイルワークスの伝票計の値と同じです）。<br>・返品や値引は差し引き済みの金額です。<br>・売上日の月ごとに分けています。${r.skipped ? `<br>・形式の違う ${r.skipped} 件のデータは含まれていません。` : ''}${view.b === '*' ? '<br>・同じ伝票番号が複数のデータにあっても、1枚として数えます。' : ''}</div>`;
}
V.sales = () => {
  if (!SALES.batches) { loadSales(); return '<div class="card">読み込み中...</div>'; }
  const bs = SALES.batches;
  if (view.b == null) view.b = bs.length ? bs[0].id : '';
  const cur = salesCur();
  if (cur && view.dcol == null) { view.dcol = cur.dcol; view.scol = cur.scol; }
  const opts = (sel) => '<option value="-1">（なし）</option>' + (cur ? cur.headers.map((h, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(h)}</option>`).join('') : '');
  return `<div class="row" style="margin-bottom:8px"><button onclick="go('menu')">← メニュー</button><span class="sp"></span></div>
  <h2><span>💴 売上データ</span></h2>
  ${bs.length ? `<div class="card"><label style="margin-top:0">検索するデータ</label>
    <div class="row"><select id="sb" style="flex:1" onchange="SALES.res=null;go('sales',{b:this.value})">${bs.length > 1 ? `<option value="*"${view.b === '*' ? ' selected' : ''}>★ すべて（月をまたいで検索）</option>` : ''}${bs.map(b => `<option value="${b.id}"${b.id === view.b ? ' selected' : ''}>${esc(b.name)}（${b.count}件・${esc(b.created)}）</option>`).join('')}</select>
    </div>
    <div style="margin-top:8px"><button onclick="go('salestax',{b:view.b})">📊 税率別の売上高を見る</button></div>
    <label>検索（空白で区切ると、すべてを含む行だけ表示）</label>
    <input id="sq" value="${esc(view.sq || '')}" placeholder="得意先名・商品名・金額など" oninput="salesQ()">
    <div class="g" style="grid-template-columns:1fr 1fr;margin-top:6px">
      <div><label>期間（から）</label><input id="sfrom" type="date" value="${esc(view.from || '')}" onchange="salesQ(1)"></div>
      <div><label>期間（まで）</label><input id="sto" type="date" value="${esc(view.to || '')}" onchange="salesQ(1)"></div>
      <div><label>期間に使う列</label><select id="sdcol" onchange="salesQ(1)">${opts(view.dcol)}</select></div>
      <div><label>合計する列</label><select id="sscol" onchange="salesQ(1)">${opts(view.scol)}</select></div></div>
    <details style="margin-top:10px"><summary class="mute" style="cursor:pointer">表示する列を選ぶ</summary>
      <div class="row" style="margin:8px 0"><button onclick="salesColsAll(true)">すべて</button><button onclick="salesColsAll(false)">初期の列に戻す</button></div>
      <div style="max-height:220px;overflow:auto;font-size:13px">${cur.headers.map((h, i) => `<label style="display:inline-block;width:48%;margin:2px 0;color:#1f2937"><input type="checkbox" style="width:auto" ${salesCols(cur).includes(i) ? 'checked' : ''} onchange="salesColToggle(${i},this.checked)"> ${esc(h)}</label>`).join('')}</div></details></div>
  <div id="sres">${salesResHtml()}</div>` : '<div class="card"><p class="mute" style="margin:0 0 8px">まだ売上データがありません。マスタの「売上データ取込」からCSVを取り込んでください。</p><button class="pri" onclick="go(\'salesimport\')">売上データを取り込む</button></div>'}`;
};
V.salesimport = () => {
  if (!SALES.batches) { loadSales2(); return '<div class="card">読み込み中...</div>'; }
  const bs = SALES.batches;
  return `<div class="bar"><button onclick="go('menu')">← メニュー</button><span class="sp"></span><button onclick="go('sales')">売上データ検索へ →</button></div>
  <h2><span>💴 売上データ取込</span></h2>
  <div class="card"><b>CSVを取り込む</b><div class="mute" style="margin:4px 0 8px">1行目が見出しのCSV（Shift_JIS・UTF-8どちらも可）。同じ名前で取り込むと置き換えます。</div>
    <label>データの名前（例: 2026年8月売上）</label><input id="sname" placeholder="名前">
    <div style="margin-top:8px"><label class="fb">CSVファイルを選ぶ<input type="file" accept=".csv,.txt,text/csv" style="display:none" onchange="importSales(this)"></label></div></div>
  <h2><span>取り込み済みのデータ（${bs.length}件）</span></h2>
  ${bs.map(b => `<div class="card"><div class="row"><div class="sp"><b>${esc(b.name)}</b><div class="mute">${b.count}件・${esc(b.created)}</div></div><button onclick="go('salestax',{b:'${b.id}'})">📊 税率別</button><button onclick="go('sales',{b:'${b.id}'})">検索</button><button class="dng" onclick="delSales('${b.id}')">削除</button></div></div>`).join('') || '<p class="mute">まだありません</p>'}`;
};
async function loadSales2(){ SALES.batches = await run('salesBatches'); if (view.n === 'salesimport') render(); }
async function loadSales(){ SALES.batches = await run('salesBatches'); if (view.n === 'sales') render(); }
let salesTimer = null, salesSeq = 0;
function salesQ(now){
  view.sq = ($('#sq') || {}).value || ''; view.from = ($('#sfrom') || {}).value || ''; view.to = ($('#sto') || {}).value || '';
  view.dcol = Number(($('#sdcol') || {value: -1}).value); view.scol = Number(($('#sscol') || {value: -1}).value);
  view.off = 0; clearTimeout(salesTimer); salesTimer = setTimeout(doSales, now ? 0 : 500);
}
async function doSales(){
  if (!view.b) return;
  const my = ++salesSeq;
  const r = await run('salesSearch', view.b, view.sq || '', view.off || 0, {dcol: view.dcol, from: view.from, to: view.to, scol: view.scol});
  if (my !== salesSeq) return;
  if (r.total == null && SALES.res) { r.total = SALES.res.total; r.sum = SALES.res.sum; }
  SALES.res = r; const e = $('#sres'); if (e) e.innerHTML = salesResHtml();
}
function salesPage(d){ view.off = Math.max(0, (view.off || 0) + d); doSales(); $('#sres').scrollIntoView(); }
function salesColToggle(i, on){
  const b = salesCur(); let c = salesCols(b).slice();
  c = on ? c.concat([i]) : c.filter(x => x !== i);
  c = Array.from(new Set(c)).sort((x, y) => x - y);
  try { localStorage.setItem('scols:' + b.id, JSON.stringify(c)); } catch (e) {}
  $('#sres').innerHTML = salesResHtml();
}
function salesColsAll(all){
  const b = salesCur();
  try { if (all) localStorage.setItem('scols:' + b.id, JSON.stringify(b.headers.map((_, i) => i))); else localStorage.removeItem('scols:' + b.id); } catch (e) {}
  render();
}
function salesResHtml(){
  const b = salesCur();
  if (!b) return '';
  if (!SALES.res) { setTimeout(doSales, 0); return '<p class="mute">検索中...</p>'; }
  const r = SALES.res, H = b.headers, cols = salesCols(b).filter(i => i < H.length);
  const isMoney = i => /(金額|単価|額|合計|税|原価|粗利|売上|仕入|利益|送料|値引|返品)/.test(H[i]) && !/(コード|番号|日|率|区分|方法|状態)/.test(H[i]);
  const from = r.total ? r.offset + 1 : 0, to = r.offset + r.rows.length;
  const cell = (row, i) => { const v = row[i] == null ? '' : row[i]; if (isMoney(i)) { const n = String(v).replace(/,/g, ''); return `<td class="n">${esc(n !== '' && !isNaN(Number(n)) ? fmtNum(String(Number(n))) : v)}</td>`; } return `<td>${esc(v)}</td>`; };
  const all = view.b === '*';
  const sumTxt = r.sum != null && view.scol >= 0 ? `　／　「${esc(H[view.scol])}」の合計 <b>${esc(fmtNum(String(Math.round(r.sum * 100) / 100)))}</b>` : '';
  return `<div class="mute" style="margin:6px 0">${r.total}件中 ${from}〜${to}件を表示${sumTxt}</div>
  <div style="overflow:auto;background:#fff;border-radius:8px;max-height:70vh"><table style="border-collapse:collapse;font-size:13px;white-space:nowrap"><thead><tr>${all ? '<th style="background:var(--cl);text-align:left;position:sticky;top:0">データ名</th>' : ''}${cols.map(i => `<th style="background:var(--cl);text-align:left;position:sticky;top:0">${esc(H[i])}</th>`).join('')}</tr></thead><tbody>${
    r.rows.map((row, k) => '<tr>' + (all ? `<td>${esc((r.names || [])[k])}</td>` : '') + cols.map(i => cell(row, i)).join('') + '</tr>').join('') || `<tr><td colspan="${cols.length + 1}" class="mute">該当するデータがありません</td></tr>`}</tbody></table></div>
  ${all && r.skipped ? `<div class="mute">※見出しの形式が違う ${r.skipped}件のデータは、この検索に含まれません。個別に選んで検索してください。</div>` : ''}
  ${all ? '<div class="mute">※同じ期間のデータを重ねて取り込んでいると、二重に数えられます。</div>' : ''}
  <div class="row" style="margin:10px 0"><button ${r.offset <= 0 ? 'disabled' : ''} onclick="salesPage(-${r.limit})">← 前の${r.limit}件</button><button ${to >= r.total ? 'disabled' : ''} onclick="salesPage(${r.limit})">次の${r.limit}件 →</button></div>`;
}
// 取り込み時に、表示する列・検索に使う列・日付列・金額列を見出しとデータから決める
function salesPlan(head, data){
  const n = head.length;
  const distinct = i => { const s = new Set(); for (let k = 0; k < data.length && s.size < 2; k++) s.add(data[k][i] == null ? '' : data[k][i]); return s.size; };
  const nonEmpty = i => data.some(r => r[i] != null && String(r[i]).trim() !== '');
  const varying = head.map((_, i) => nonEmpty(i) && distinct(i) > 1);
  const own = /^自社(名称|郵便|住所|電話|FAX|：振込先)/;
  const scols = head.map((_, i) => i).filter(i => varying[i] && !own.test(head[i]));
  const pref = ['売上日', '伝票日付', '日付', '売上番号', '伝票番号', '得意先コード', '得意先名', '得意先', '件名', '商品コード', '商品名', '商品名（下段）', '数量', '販売単価', '単価', '販売額', '金額', '備考'];
  let show = pref.map(p => head.indexOf(p)).filter(i => i >= 0 && nonEmpty(i));
  show = Array.from(new Set(show)).sort((a, b) => a - b);
  if (show.length < 3) show = scols.slice(0, 12);
  const find = (names, re) => { for (const nm of names) { const i = head.indexOf(nm); if (i >= 0) return i; } return head.findIndex(h => re.test(h)); };
  const dcol = find(['売上日', '伝票日付', '日付'], /(売上日|伝票日|日付)$/);
  const scol = find(['販売額', '金額'], /(販売額|金額|売上額)/);
  return {h: head, show: show, scols: scols, dcol: dcol, scol: scol};
}
let SALES_NEW = null;
async function importSales(inp){
  const file = inp.files[0]; inp.value = ''; if (!file) return;
  const name = ($('#sname').value || '').trim() || file.name.replace(/\.[^.]+$/, '');
  const buf = await file.arrayBuffer();
  let text; try { text = new TextDecoder('utf-8', {fatal: true}).decode(buf); } catch (e) { text = new TextDecoder('shift_jis').decode(buf); }
  text = text.replace(/^﻿/, '');
  const rows = parseCsv(text).filter(r => r.some(c => String(c).trim() !== ''));
  if (rows.length < 2) return alert('データが見つかりませんでした（見出し行とデータ行が必要です）');
  const head = rows[0].map(h => String(h).trim()), data = rows.slice(1);
  if (!confirm('「' + name + '」として ' + data.length + '件を取り込みます。\n同じ名前のデータがあれば置き換えます。よろしいですか？')) return;
  const plan = salesPlan(head, data);
  busy(1);
  try {
    const id = await run('salesBegin', name, plan, true);
    for (let i = 0; i < data.length; i += 200) {
      $('#busy').textContent = '取込中 ' + Math.min(i + 200, data.length) + ' / ' + data.length;
      await run('salesAdd', id, i, data.slice(i, i + 200));
    }
    await run('salesFinish', id);
    SALES_NEW = id; SALES = {batches: null, res: null};
    alert('取り込みました（' + data.length + '件）');
  } finally { busy(-1); $('#busy').textContent = '処理中...'; }
  go('salestax', {b: SALES_NEW});
}
async function delSales(id){
  const b = (SALES.batches || []).find(x => x.id === id);
  if (!b || !confirm('「' + b.name + '」（' + b.count + '件）を削除します。よろしいですか？')) return;
  await run('salesDelete', b.id);
  SALES = {batches: null, res: null}; go('salesimport');
}
V.report = () => {
  const won = q => q.result === '受注', lost = q => q.result === '失注';
  const M = {};
  DB.quotes.forEach(q => {
    const k = String(q.issueDate || '').slice(0, 7) || '(日付なし)';
    const m = M[k] = M[k] || {n: 0, amt: 0, w: 0, wamt: 0, l: 0, profit: 0};
    m.n++; m.amt += Number(q.total) || 0;
    if (won(q)) { m.w++; m.wamt += Number(q.total) || 0; m.profit += profitOf(DB.lines.filter(l => l.quoteId === q.id)).profit; }
    if (lost(q)) m.l++;
  });
  const keys = Object.keys(M).sort().reverse().slice(0, 24);
  const T = keys.reduce((t, k) => { const m = M[k]; ['n','amt','w','wamt','l','profit'].forEach(f => t[f] += m[f]); return t; }, {n:0, amt:0, w:0, wamt:0, l:0, profit:0});
  const rate = m => (m.w + m.l) ? Math.round(m.w / (m.w + m.l) * 100) + '%' : '-';
  const row = (k, m, b) => `<tr${b ? ' style="font-weight:bold;background:#f3f4f6"' : ''}><td>${k}</td><td class="n">${m.n}</td><td class="n">${yen(m.amt)}</td><td class="n">${m.w}</td><td class="n">${yen(m.wamt)}</td><td class="n">${m.l}</td><td class="n">${rate(m)}</td><td class="n">${m.profit ? yen(m.profit) : '-'}</td></tr>`;
  const open = DB.quotes.filter(q => (q.result || '未定') === '未定');
  return `<div class="bar"><button onclick="go('home')">← 見積管理</button></div>
  <div class="card" style="overflow-x:auto"><b>月別集計（見積書発行日ベース・直近24か月）</b>
  <table style="border-collapse:collapse;width:100%;margin-top:8px;font-size:13px;white-space:nowrap"><thead><tr style="background:#eef1f6"><th>月</th><th>見積件数</th><th>見積金額(税込)</th><th>受注件数</th><th>受注金額(税込)</th><th>失注件数</th><th>受注率</th><th>粗利(原価入力分)</th></tr></thead><tbody>${keys.map(k => row(k, M[k])).join('') + (keys.length ? row('合計', T, true) : '<tr><td colspan="8" class="mute">見積書がまだありません</td></tr>')}</tbody></table>
  <div class="mute" style="margin-top:8px">受注率 = 受注 ÷ (受注 + 失注)。見積書の編集画面で「結果」を受注/失注にすると集計されます。</div></div>
  <div class="card"><b>結果が未定の見積書（${open.length}件）</b>${open.slice().sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate))).slice(0, 30).map(q => { const p = proj(q.projectId); return `<div class="card click" style="margin:8px 0 0" onclick="go('project',{id:'${q.projectId}'})"><div class="row"><span class="sp">${esc(cust(p.customerId).name || '')} / ${esc(q.subject || p.name)}</span><b>¥${yen(q.total)}</b></div><div class="mute">${esc(q.no)}　発行 ${esc(q.issueDate)}</div></div>`; }).join('') || '<div class="mute">なし</div>'}</div>`;
};
const PSTAT = ['進行中', '見積提出済', '受注', '失注', '完了'];
// 案件一覧の並べ方・絞り込み(画面を開き直しても、この端末では覚えておく)
const HOME = (() => { let o = {}; try { o = JSON.parse(localStorage.getItem('homeopt') || '{}') || {}; } catch (e) {} return {so: o.so || 'new', ps: o.ps || ''}; })();
function homeOpt(k, v){ HOME[k] = v; try { localStorage.setItem('homeopt', JSON.stringify(HOME)); } catch (e) {} $('#list').innerHTML = listHtml(); }
V.home = () => `<div class="bar"><button onclick="go('menu')">← メニュー</button><button onclick="go('report')">📊 集計</button><input id="q" placeholder="案件を検索（顧客・見積・品名・仕入先）" value="${esc(view.q)}" oninput="search(this.value)"><button class="pri" onclick="editProject()">＋案件</button></div>
<div class="bar"><select style="width:auto" onchange="homeOpt('ps',this.value)">${[''].concat(PSTAT).map(x => `<option value="${x}" ${HOME.ps === x ? 'selected' : ''}>${x ? '状態: ' + x + '（' + DB.projects.filter(p => (p.status || '進行中') === x).length + '）' : '状態: すべて（' + DB.projects.length + '）'}</option>`).join('')}</select>
<select style="width:auto" onchange="homeOpt('so',this.value)">${[['new', '並べ方: 新しい順'], ['old', '並べ方: 古い順'], ['stat', '並べ方: 状態別'], ['cust', '並べ方: 顧客名'], ['name', '並べ方: 案件名']].map(o => `<option value="${o[0]}" ${HOME.so === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div>
<div id="list">${listHtml()}</div>`;

// ---------- 汎用フォーム ----------
function fld(f, v){
  const val = v[f.k] == null ? '' : v[f.k];
  const id = 'f_' + f.k;
  if (f.t === 'textarea') return `<label>${f.l}</label><textarea id="${id}" rows="${f.rows || 3}">${esc(val)}</textarea>`;
  if (f.t === 'select') return `<label>${f.l}</label><select id="${id}" ${f.blank ? 'data-blank="1"' : ''} ${f.blankText ? 'data-bt="' + esc(f.blankText) + '"' : ''}>${f.o.map(o => `<option value="${esc(o[0])}" ${String(o[0]) === String(val) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
  if (f.t === 'money') return `<label>${f.l}</label><input id="${id}" type="text" inputmode="numeric" value="${esc(fmtNum(val))}" oninput="numIn(this,event)" oncompositionend="numIn(this)" onchange="numIn(this)">`;
  return `<label>${f.l}</label><input id="${id}" type="${f.t || 'text'}" value="${esc(val)}"${f.oi ? ` oninput="${f.oi}"` : ''}>`;
}
V.form = () => {
  const c = view.cfg;
  return `<div class="card"><h2><span>${c.title}</span></h2>${c.fields.map(f => fld(f, c.vals)).join('')}${c.extra || ''}
  <div class="row" style="margin-top:14px"><button class="pri" onclick="submitForm()">保存</button><button onclick="history_back()">キャンセル</button><span class="sp"></span>${c.onDelete ? '<button class="dng" onclick="delForm()">削除</button>' : ''}</div></div>`;
};
const newLine = () => ({item:'',qty:1,unit:'式',price:0,note:'',cost:''});
function openForm(cfg){ backView = view; go('form', {cfg: cfg}); }
function history_back(){ view = backView || {n:'menu'}; render(); }
async function submitForm(){
  const c = view.cfg; const o = Object.assign({}, c.vals);
  c.fields.forEach(f => { o[f.k] = $('#f_' + f.k).value; if (f.t === 'money') o[f.k] = rawNum(o[f.k]); });
  if (o.vendorPick) o.vendor = o.vendorPick;
  if (c.table === 'projects') {
    const nc = String(o.newCust || '').trim(); delete o.newCust;
    if (nc) {
      const hit = DB.customers.find(x => x.name === nc);
      if (hit) o.customerId = hit.id;
      else {
        if (!confirm('「' + nc + '」を新しい顧客として登録します。よろしいですか？\n（顧客の詳細は、あとでメニューの「顧客」から編集できます）')) return;
        const cu = await run('save', 'customers', {name: nc, code: '', contact: '', address: '', tel: '', email: '', memo: ''});
        o.customerId = cu.id;
      }
    }
    if (!o.customerId) return alert('顧客を選ぶか、新しい顧客名を入力してください');
  }
  if (c.required && !o[c.required]) return alert('必須項目が未入力です');
  if (c.saving) return;           // 連打・二重送信を防ぐ
  c.saving = true;
  try {
    const saved = await run('save', c.table, o);
    // 保存できたあとに読み直しで失敗しても、次の「保存」は同じものの更新になる(新しく増やさない)
    c.vals = Object.assign({}, c.vals, {id: saved.id, created: saved.created});
    await reload0();
    if (c.after) c.after(saved); else history_back();
  } finally { c.saving = false; }
}
async function delForm(){
  if (!confirm('削除しますか？')) return;
  try { await run('remove', view.cfg.table, view.cfg.vals[view.cfg.idKey || 'id']); } catch (e) { return; }
  await reload0();
  if (view.cfg.afterDelete) view.cfg.afterDelete(); else go('home');
}
// 画面のデータを読み直す。前回から変わった表だけをサーバーから受け取り、通信とデータベースの読み取りを減らす
async function reload0(){
  const r = await run('getAll', (DB && DB.dv) || null);
  DB = (r.part && DB) ? Object.assign({}, DB, r) : r;
  AUTH = true;
}

// ---------- 顧客 ----------
V.customers = () => `<div class="bar"><button onclick="go('menu')">← メニュー</button><span class="sp"></span><label class="fb">スマイルワークス取込<input type="file" accept=".csv" style="display:none" onchange="importSmile(this)"></label><button class="pri" onclick="editCustomer()">＋顧客</button></div>
  <div class="bar"><input placeholder="顧客を検索（名前・コード・担当者）" value="${esc(view.cq || '')}" oninput="searchCust(this.value)"></div><div id="clist">${custListHtml()}</div>`;
function custListHtml(){
  const words = (view.cq || '').toLowerCase().split(/\s+/).filter(Boolean);
  const all = DB.customers.filter(c => { const t = [c.code, c.name, c.contact, c.address].join(' ').toLowerCase(); return words.every(w => t.includes(w)); });
  const list = all.slice(0, 200);
  return list.map(c => `<div class="card click" onclick="editCustomer('${c.id}')"><b>${esc(c.name)}</b> <span class="mute">${esc(c.code)}</span><div class="mute">${esc(c.contact)} ${esc(c.tel)}</div></div>`).join('') +
    (all.length > 200 ? `<p class="mute">${all.length}件中200件を表示しています。検索で絞り込んでください。</p>` : '') || '<p class="mute">該当する顧客がありません</p>';
}
function searchCust(v){ view.cq = v; $('#clist').innerHTML = custListHtml(); }

// ---------- 入金照合(スマイルの入金実績 と 実際の入金の突き合わせ) ----------
let DEP = {meta: null, m: null, data: null, sel: null, detail: null, only: false};
const depMonthAdd = (m, d) => { const [y, mo] = m.split('-').map(Number); const t = new Date(y, mo - 1 + d, 1); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0'); };
const depNorm = v => String(v == null ? '' : v).normalize('NFKC').replace(/[,\s]/g, '').replace(/^=/, '');
function depKeys(){ return [{k: 'cash', n: '現金'}].concat(DEP.data.accts.map(a => ({k: a.id, n: a.name})), [{k: 'fee', n: '手数料'}]); }
function depIndex(){ // 日ごとに引きやすい形にする
  const D = DEP.data; DEP.sm = {}; DEP.cm = {}; DEP.nt = {};
  D.smile.forEach(x => DEP.sm[Number(x.ymd.slice(8))] = x);
  D.cells.forEach(x => { const d = Number(x.ymd.slice(8)); (DEP.cm[d] = DEP.cm[d] || {})[x.k] = {amount: x.amount, expr: x.expr || ''}; });
  D.notes.forEach(x => DEP.nt[Number(x.ymd.slice(8))] = x);
}
function depCalc(d){
  const s = DEP.sm[d] || {n: 0, amount: 0, cash: 0, bank: 0, fee: 0, off: 0}, c = DEP.cm[d] || {}, nt = DEP.nt[d];
  const S = s.cash + s.bank + s.fee;
  let E = 0, any = false, cashE = 0;
  Object.keys(c).forEach(k => { E += c[k].amount; any = true; if (k === 'cash') cashE = c[k].amount; });
  const diff = E - S;
  let st = 'none';
  if (s.n || any) {
    if (diff === 0 && (any || S === 0)) st = (any && cashE !== s.cash) ? 'split' : 'match';
    else if (!any) st = 'todo';
    else st = 'diff';
  }
  const ok = !!(nt && nt.ok);
  return {s: s, S: S, E: E, any: any, diff: diff, st: st, ok: ok, note: nt ? nt.note : ''};
}
const DEP_LABEL = {match: ['✓ 一致', '#067647'], split: ['✓ 一致（現金と振込の内訳が違う）', '#b54708'], todo: ['未入力', '#b54708'], diff: ['差異', '#b42318'], none: ['', '#6b7280']};
function depStatusHtml(r){
  if (r.ok && r.st !== 'match') return '<span style="color:#175cd3;font-weight:600">確認済み</span>' + (r.diff ? ' <span class="mute">(' + (r.diff > 0 ? '+' : '') + yen(r.diff) + ')</span>' : '');
  const l = DEP_LABEL[r.st];
  return r.st === 'diff' ? '<span style="color:' + l[1] + ';font-weight:600">差異 ' + (r.diff > 0 ? '+' : '') + yen(r.diff) + '</span>' : '<span style="color:' + l[1] + '">' + l[0] + '</span>';
}
const depBad = r => (r.st === 'diff' || r.st === 'todo') && !r.ok;
V.deposit = () => {
  if (!DEP.meta) { loadDepMeta(); return '<div class="card">読み込み中...</div>'; }
  if (!DEP.m) {
    const all = DEP.meta.months.map(x => x.m).concat(DEP.meta.entered).sort();
    DEP.m = all.length ? all[all.length - 1] : today().slice(0, 7);
  }
  if (!DEP.data || DEP.data.m !== DEP.m) { loadDepMonth(); return '<div class="card">読み込み中...</div>'; }
  depIndex();
  return depHtml();
};
async function loadDepMeta(){ try { DEP.meta = await run('depMonths'); } catch (e) { return; } if (view.n === 'deposit') render(); }
async function loadDepMonth(){ const m = DEP.m; try { const d = await run('depMonth', m); if (DEP.m !== m) return; DEP.data = d; } catch (e) { return; } if (view.n === 'deposit') render(); }
function depGoMonth(m){ if (!/^\d{4}-\d{2}$/.test(m)) return; DEP.m = m; DEP.data = null; DEP.sel = null; DEP.detail = null; render(); }
function depHtml(){
  const M = DEP.m, [Y, MO] = M.split('-').map(Number), meta = DEP.meta, ks = depKeys();
  const wareki = Y >= 2019 ? '令和' + (Y - 2018) + '年' : '';
  const hasSmile = DEP.data.smile.length > 0;
  const imp = meta.n ? `取込済み: ${meta.from.replace(/-/g, '/')} 〜 ${meta.to.replace(/-/g, '/')}（${yen(meta.n)}件）` : 'まだスマイルの入金実績を取り込んでいません';
  const admin = DB.me && DB.me.admin;
  return `<div class="bar"><button onclick="go('menu')">← メニュー</button><span class="sp"></span></div>
  <h2><span>💳 入金照合</span></h2>
  <div class="card"><div class="row" style="align-items:center">
    <button onclick="depGoMonth('${depMonthAdd(M, -1)}')">◀ 前月</button>
    <div class="sp" style="text-align:center"><b style="font-size:18px">${Y}年${MO}月</b><span class="mute"> ${wareki}${MO}月分</span><div><input type="month" value="${M}" onchange="depGoMonth(this.value)" style="width:auto;margin-top:4px"></div></div>
    <button onclick="depGoMonth('${depMonthAdd(M, 1)}')">翌月 ▶</button></div></div>
  <div class="row" style="margin:0 0 8px"><span class="sp"></span><button onclick="depPrint()">🖨 この月をA4で印刷</button></div>
  <div class="card"><div class="mute" style="margin-bottom:6px">${imp}</div>
    <label class="fb">📥 スマイルの入金実績CSVを取り込む<input type="file" accept=".csv,.txt,text/csv" style="display:none" onchange="depImport(this)"></label>
    <div class="mute" style="margin-top:6px">スマイルワークスの「入金実績一覧表」をCSVで出力したものです。月の途中までのCSVでも、同じ期間をもう一度取り込めば置き換わります（入力済みの金額は消えません）。</div>
    <div style="margin-top:12px"><label class="fb">📗 入金チェック表（Excel）の入力済みデータを取り込む<input type="file" accept=".xlsx,.xlsm" style="display:none" onchange="depImportXlsx(this)"></label></div>
    <div class="mute" style="margin-top:6px">月ごとのシート（R8.8 など）の現金・口座・手数料の金額を、そのまま登録します。先にスマイルのCSVを取り込んでおくと、すぐ照合結果が見られます。</div></div>
  <div id="dsum">${depSumHtml()}</div>
  ${hasSmile ? '' : `<div class="card" style="border-left:4px solid #f79009"><b>${Y}年${MO}月のスマイルの入金実績がありません。</b><div class="mute">CSVを取り込むと、日ごとに自動で照合します。</div></div>`}
  <div class="row" style="margin:8px 0;align-items:center"><label style="margin:0"><input type="checkbox" style="width:auto" ${DEP.only ? 'checked' : ''} onchange="DEP.only=this.checked;depRows()"> 差異・未入力の日だけ表示</label></div>
  <div class="dwrap" style="overflow:auto;max-height:78vh;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.12)">
  <table class="dt"><thead><tr><th class="sk">日</th><th>スマイル<div class="mute" style="font-weight:400">現金・振込</div></th><th>差額・状態</th>${ks.map(k => `<th>${esc(k.n)}</th>`).join('')}<th>入力計</th></tr></thead>
  <tbody id="dbody">${depRowsHtml()}</tbody></table></div>
  <div class="mute" style="margin:8px 0">金額の欄には、式も入れられます（例: <code>5000+3840</code>）。Enterで下の日に進みます。「差異」の日は、「明細」ボタンで、その日のスマイルの入金を見られます。</div>
  ${admin ? depAcctEditor() : ''}`;
}
// ===== 入金照合表のA4印刷(横向き・1か月分を1枚に) =====
function depPrintHtml(){
  const [Y, MO] = DEP.m.split('-').map(Number), days = new Date(Y, MO, 0).getDate(), ks = depKeys();
  const co = (DB.company && DB.company.name) || '';
  const wareki = Y >= 2019 ? '令和' + (Y - 2018) + '年' + MO + '月分' : '';
  const n = v => (v || v === 0) && v !== '' ? yen(v) : '';
  const z = v => (v ? yen(v) : '');
  let S = {cash: 0, bank: 0, fee: 0, off: 0}, E = 0, cnt = {match: 0, diff: 0, todo: 0, ok: 0};
  const colTot = {}; ks.forEach(k => colTot[k.k] = 0);
  let rows = '';
  const notes = [];
  for (let d = 1; d <= days; d++) {
    const r = depCalc(d), s = r.s, wd = new Date(Y, MO - 1, d).getDay();
    S.cash += s.cash; S.bank += s.bank; S.fee += s.fee; S.off += s.off || 0; E += r.E;
    ks.forEach(k => { const c = (DEP.cm[d] || {})[k.k]; if (c) colTot[k.k] += c.amount; });
    let st = '';
    if (r.ok && r.st !== 'match') { st = '確認済'; cnt.ok++; }
    else if (r.st === 'match' || r.st === 'split') { st = '✓'; cnt.match++; }
    else if (r.st === 'diff') { st = '差異 ' + (r.diff > 0 ? '+' : '') + yen(r.diff); cnt.diff++; }
    else if (r.st === 'todo') { st = '未入力'; cnt.todo++; }
    if (r.note) notes.push(d + '日: ' + r.note + (r.ok ? '（確認済み）' : ''));
    const cls = (wd === 0 ? 'su ' : wd === 6 ? 'sa ' : '') + (r.st === 'diff' ? 'bad' : r.st === 'todo' ? 'todo' : '');
    rows += `<tr class="${cls}"><td class="d">${d} ${WD[wd]}</td><td>${z(s.cash)}</td><td>${z(s.bank)}</td><td>${z(s.fee)}</td>
      ${ks.map(k => { const c = (DEP.cm[d] || {})[k.k]; return '<td>' + (c ? yen(c.amount) : '') + '</td>'; }).join('')}
      <td class="b">${r.any ? yen(r.E) : ''}</td><td class="st">${st}</td></tr>`;
  }
  const St = S.cash + S.bank + S.fee, df = E - St;
  const tot = `<tr class="tot"><td class="d">月計</td><td>${yen(S.cash)}</td><td>${yen(S.bank)}</td><td>${yen(S.fee)}</td>${ks.map(k => '<td>' + yen(colTot[k.k]) + '</td>').join('')}<td class="b">${yen(E)}</td><td class="st">${df ? (df > 0 ? '+' : '') + yen(df) : '一致'}</td></tr>`;
  const css = `@page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{font-family:"Hiragino Sans","Yu Gothic","Meiryo",sans-serif;color:#111;margin:0;font-size:8pt}
    h1{font-size:13pt;margin:0 0 2px}.sub{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:4px;font-size:8.5pt}
    table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:.4pt solid #666;padding:1.2pt 2.5pt;text-align:right;white-space:nowrap;overflow:hidden;font-size:7.6pt;line-height:1.25}
    th{background:#e5e7eb;text-align:center;font-weight:600;font-size:7.2pt}td.d{text-align:left;font-weight:600}td.st{text-align:left;font-size:7pt}td.b{font-weight:600}
    tr.su td{background:#fdecec}tr.sa td{background:#eaf2ff}tr.bad td{background:#ffdcd8}tr.todo td{background:#fff3cc}tr.tot td{background:#e5e7eb;font-weight:700;border-top:1.2pt solid #333}
    .g{background:#d0d5dd}.note{margin-top:5px;font-size:7.5pt}.note div{margin:1px 0}.foot{margin-top:4px;font-size:7pt;color:#555}`;
  const head = `<tr><th rowspan="2" style="width:9%">日</th><th colspan="3" class="g">スマイル（実績）</th><th colspan="${ks.length}" class="g">実際の入金（入力）</th><th rowspan="2" style="width:7%">入力計</th><th rowspan="2" style="width:10%">照合</th></tr>
    <tr><th>現金</th><th>振込等</th><th>手数料</th>${ks.map(k => `<th>${esc(k.n)}</th>`).join('')}</tr>`;
  const now = new Date(), stamp = now.getFullYear() + '/' + (now.getMonth() + 1) + '/' + now.getDate();
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>入金照合表 ${Y}年${MO}月</title><style>${css}</style></head><body>
    <div class="sub"><div><h1>入金照合表　${Y}年${MO}月（${wareki}）</h1><span>${esc(co)}</span></div>
    <div style="text-align:right">スマイル計 ${yen(St)}　入力計 ${yen(E)}　差額 ${df ? (df > 0 ? '+' : '') + yen(df) : '0'}<br>一致 ${cnt.match}日　差異 ${cnt.diff}日　未入力 ${cnt.todo}日　確認済み ${cnt.ok}日</div></div>
    <table><thead>${head}</thead><tbody>${rows}${tot}</tbody></table>
    ${notes.length ? '<div class="note"><b>メモ</b>' + notes.map(t => '<div>' + esc(t) + '</div>').join('') + '</div>' : ''}
    <div class="foot">出力日 ${stamp}　※「振込等」は振込・手形・口振・カード・預け金。相殺・貸倒は、お金が動かないため照合の対象外です。</div></body></html>`;
}
function depPrint(){
  if (!DEP.data || !DEP.cm) return alert('画面の読み込みが終わってから押してください');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  setTimeout(() => viewDoc({html: depPrintHtml()}), 150);   // 入力中の欄の保存を待つ
}
function depSumHtml(){
  let S = {cash: 0, bank: 0, fee: 0}, E = 0, cnt = {match: 0, split: 0, todo: 0, diff: 0, ok: 0};
  const days = new Date(Number(DEP.m.slice(0, 4)), Number(DEP.m.slice(5)), 0).getDate();
  for (let d = 1; d <= days; d++) {
    const r = depCalc(d); S.cash += r.s.cash; S.bank += r.s.bank; S.fee += r.s.fee; E += r.E;
    if (r.ok && r.st !== 'match') cnt.ok++; else if (cnt[r.st] != null) cnt[r.st]++;
  }
  const St = S.cash + S.bank + S.fee, df = E - St;
  const chip = (t, n, c) => n ? `<span class="badge" style="background:${c[0]};color:${c[1]}">${t} ${n}日</span> ` : '';
  return `<div class="card"><div class="row" style="gap:16px;flex-wrap:wrap">
    <div><div class="mute">スマイル 月計</div><b style="font-size:18px">${yen(St)}</b><div class="mute">現金 ${yen(S.cash)} / 振込 ${yen(S.bank)} / 手数料 ${yen(S.fee)}</div></div>
    <div><div class="mute">入力 月計</div><b style="font-size:18px">${yen(E)}</b></div>
    <div><div class="mute">差額</div><b style="font-size:18px;color:${df ? '#b42318' : '#067647'}">${df > 0 ? '+' : ''}${yen(df)}</b></div></div>
    <div style="margin-top:8px">${chip('✓ 一致', cnt.match + cnt.split, ['#dcfae6', '#067647'])}${chip('差異', cnt.diff, ['#fee4e2', '#b42318'])}${chip('未入力', cnt.todo, ['#fef0c7', '#b54708'])}${chip('確認済み', cnt.ok, ['#d1e9ff', '#175cd3'])}${cnt.diff + cnt.todo ? '' : (S.cash + S.bank + S.fee ? '<span class="badge" style="background:#dcfae6;color:#067647">すべて照合できています</span>' : '')}</div></div>`;
}
const WD = ['日', '月', '火', '水', '木', '金', '土'];
function depRowsHtml(){
  const [Y, MO] = DEP.m.split('-').map(Number), days = new Date(Y, MO, 0).getDate(), ks = depKeys();
  let h = '';
  for (let d = 1; d <= days; d++) {
    const r = depCalc(d);
    if (DEP.only && !depBad(r)) continue;
    const wd = new Date(Y, MO - 1, d).getDay();
    const dc = wd === 0 ? '#b42318' : wd === 6 ? '#175cd3' : '#1f2937';
    const s = r.s;
    h += `<tr id="dr_${d}" class="${depRowCls(r)}"><td class="sk" style="color:${dc};white-space:nowrap"><b>${d}</b> ${WD[wd]}</td>
      <td class="n" style="white-space:nowrap">${s.n ? `<b>${yen(r.S)}</b><div class="mute" style="font-size:11px">現${yen(s.cash)}・振${yen(s.bank)}${s.fee ? '・手' + yen(s.fee) : ''}${s.off ? '<br>相殺等 ' + yen(s.off) : ''}</div>` : '<span class="mute">—</span>'}</td>
      <td id="ds_${d}" style="white-space:nowrap">${depStatusHtml(r)} ${s.n || r.any ? `<button class="sm" onclick="depOpen(${d})">${DEP.sel === d ? '閉じる' : '明細'}</button>` : ''}${r.note ? ' <span title="' + esc(r.note) + '">📝</span>' : ''}</td>
      ${ks.map(k => { const c = (DEP.cm[d] || {})[k.k]; return `<td class="ci"><input class="dc" id="c_${d}_${k.k}" inputmode="text" autocomplete="off" value="${c ? yen(c.amount) : ''}" title="${c && c.expr ? esc('=' + c.expr) : ''}" onfocus="depFocus(this,${d},'${k.k}')" onblur="depBlur(this,${d},'${k.k}')" onkeydown="depKey(event,this,${d},'${k.k}')"></td>`; }).join('')}
      <td class="n" id="dt_${d}">${r.any ? yen(r.E) : ''}</td></tr>`;
    if (DEP.sel === d) h += `<tr class="det"><td colspan="${ks.length + 4}" id="dd_${d}">${depDetailHtml(d)}</td></tr>`;
  }
  return h || `<tr><td colspan="${ks.length + 4}" class="mute" style="text-align:center;padding:16px">差異・未入力の日はありません</td></tr>`;
}
function depRowCls(r){ return r.ok && r.st !== 'match' ? 'ok' : r.st === 'diff' ? 'bad' : r.st === 'todo' ? 'todo' : ''; }
function depRows(){ const e = $('#dbody'); if (e) e.innerHTML = depRowsHtml(); }
function depRefresh(d){ // 1日分の計算結果だけ更新(入力中の欄はそのまま)
  const r = depCalc(d), tr = $('#dr_' + d); if (!tr) return;
  tr.className = depRowCls(r);
  $('#dt_' + d).textContent = r.any ? yen(r.E) : '';
  const s = $('#ds_' + d);
  s.innerHTML = depStatusHtml(r) + ' ' + (r.s.n || r.any ? `<button class="sm" onclick="depOpen(${d})">${DEP.sel === d ? '閉じる' : '明細'}</button>` : '') + (r.note ? ' <span title="' + esc(r.note) + '">📝</span>' : '');
  const sm = $('#dsum'); if (sm) sm.innerHTML = depSumHtml();
}
function depFocus(el, d, k){ if (!DEP.cm) return; const c = (DEP.cm[d] || {})[k]; el.value = c ? (c.expr || String(c.amount)) : ''; el.select(); }
async function depBlur(el, d, k){
  if (!DEP.cm || !el.isConnected) return;
  const c = (DEP.cm[d] || {})[k], cur = c ? (c.expr || String(c.amount)) : '', raw = depNorm(el.value);
  if (raw === cur) { el.value = c ? yen(c.amount) : ''; return; }
  const M0 = DEP.m, ymd = DEP.m + '-' + String(d).padStart(2, '0');
  try {
    const r = await run('depSet', ymd, k, raw);
    if (DEP.m !== M0 || !DEP.cm) return; // 保存中に月を移った
    DEP.cm[d] = DEP.cm[d] || {};
    if (r.amount === null) delete DEP.cm[d][k]; else DEP.cm[d][k] = {amount: r.amount, expr: r.expr};
    if (document.activeElement !== el) el.value = r.amount === null ? '' : yen(r.amount);
    el.title = r.expr ? '=' + r.expr : '';
  } catch (e) { el.value = c ? yen(c.amount) : ''; }
  if (DEP.m === M0 && DEP.cm) depRefresh(d);
}
function depKey(ev, el, d, k){
  if (ev.isComposing) return;
  if (ev.key === 'Enter' || ev.key === 'ArrowDown') { ev.preventDefault(); const n = $('#c_' + (d + 1) + '_' + k); if (n) n.focus(); else el.blur(); }
  else if (ev.key === 'ArrowUp') { ev.preventDefault(); const n = $('#c_' + (d - 1) + '_' + k); if (n) n.focus(); }
}
async function depOpen(d){
  DEP.sel = DEP.sel === d ? null : d; DEP.detail = null; depRows();
  if (DEP.sel !== d) return;
  const ymd = DEP.m + '-' + String(d).padStart(2, '0');
  try { DEP.detail = {d: d, rows: await run('depDay', ymd)}; } catch (e) { return; }
  const e = $('#dd_' + d); if (e && DEP.sel === d) e.innerHTML = depDetailHtml(d);
}
function depDetailHtml(d){
  const r = depCalc(d), nt = DEP.nt[d] || {}, det = DEP.detail && DEP.detail.d === d ? DEP.detail.rows : null;
  const ymd = DEP.m + '-' + String(d).padStart(2, '0');
  const lst = det === null ? '<div class="mute">読み込み中...</div>' : !det.length ? '<div class="mute">この日のスマイルの入金はありません</div>' :
    `<div style="max-height:320px;overflow:auto"><table style="width:100%;font-size:13px"><tr><th>得意先</th><th>入金額</th><th>現金</th><th>振込</th><th>手数料</th><th>相殺等</th><th>伝票</th></tr>${det.map(x => `<tr><td>${esc(x.name)}</td><td class="n">${yen(x.amount)}</td><td class="n">${x.cash ? yen(x.cash) : ''}</td><td class="n">${x.bank ? yen(x.bank) : ''}</td><td class="n">${x.fee ? yen(x.fee) : ''}</td><td class="n">${x.off ? yen(x.off) : ''}</td><td class="mute">${esc(x.slip)}</td></tr>`).join('')}</table></div>`;
  return `<div style="padding:8px 4px"><b>${DEP.m.slice(5).replace(/^0/, '')}月${d}日のスマイルの入金（${det ? det.length : (r.s.n)}件）</b>
    <div class="mute" style="margin:2px 0 6px">スマイル計 ${yen(r.S)}（現金 ${yen(r.s.cash)} + 振込 ${yen(r.s.bank)} + 手数料 ${yen(r.s.fee)}）／ 入力計 ${yen(r.E)}${r.s.off ? '／ 相殺など ' + yen(r.s.off) + '（お金が動かないので、照合には入れていません）' : ''}</div>
    ${lst}
    <div class="row" style="margin-top:10px;align-items:center;gap:8px;flex-wrap:wrap"><input id="nt_${d}" value="${esc(nt.note || '')}" placeholder="メモ（差額の理由など）" style="flex:1;min-width:200px">
      <label style="margin:0;white-space:nowrap"><input type="checkbox" id="ok_${d}" style="width:auto" ${nt.ok ? 'checked' : ''}> 確認済み（差額があっても了承）</label>
      <button class="pri" onclick="depNoteSave(${d})">保存</button></div>
    ${nt.at ? `<div class="mute" style="margin-top:4px">${esc(nt.at)} ${esc(nt.by || '')}</div>` : ''}</div>`;
}
async function depNoteSave(d){
  const note = $('#nt_' + d).value.trim(), ok = $('#ok_' + d).checked, ymd = DEP.m + '-' + String(d).padStart(2, '0');
  await run('depNote', ymd, note, ok);
  if (!note && !ok) delete DEP.nt[d]; else DEP.nt[d] = {ymd: ymd, note: note, ok: ok ? 1 : 0, by: (DB.me && DB.me.name) || '', at: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16).replace('T', ' ')};
  depRefresh(d); DEP.sel = null; depRows();
}
// --- 口座の一覧(管理者) ---
function depAcctEditor(){
  return `<details class="card" style="margin-top:10px"><summary>⚙ 口座の追加・名前の変更（管理者）</summary>
    <div class="mute" style="margin:6px 0">入力した金額がある口座は、削除できません。名前だけの変更はできます。</div>
    <div id="dacc">${DEP.data.accts.map(a => depAcctRow(a.id, a.name)).join('')}</div>
    <div class="row" style="margin-top:8px"><button onclick="depAcctAdd()">＋ 口座を追加</button><button class="pri" onclick="depAcctSave()">この内容で保存</button></div></details>`;
}
const depAcctRow = (id, name) => `<div class="row" style="margin:4px 0" data-id="${esc(id)}"><input value="${esc(name)}" maxlength="20" style="flex:1"><button class="dng" onclick="this.parentNode.remove()">削除</button></div>`;
function depAcctAdd(){ $('#dacc').insertAdjacentHTML('beforeend', depAcctRow('', '')); }
async function depAcctSave(){
  const list = [...document.querySelectorAll('#dacc > div')].map(e => ({id: e.dataset.id, name: e.querySelector('input').value}));
  await run('depAccounts', list);
  DEP.data = null; render();
}
// ---------- バックアップと復元(管理者) ----------
let BKP = {info: null};
V.backup = () => {
  if (!(DB.me && DB.me.admin)) return '<div class="card">バックアップは管理者だけが使えます。</div>';
  if (!BKP.info) { loadBackup(); return '<div class="card">読み込み中...</div>'; }
  const i = BKP.info, L = i.labels;
  return `<div class="bar"><button onclick="go('menu')">← メニュー</button></div>
  <h2><span>💾 バックアップと復元</span></h2>
  <div class="card"><b>バックアップをダウンロード</b>
    <div class="mute" style="margin:4px 0 8px">いまの文字のデータを、1つのファイルに保存します。パソコンやGoogleドライブなど、アプリの外に置いてください。最後に保存した日時: <b>${i.last ? esc(i.last) : 'まだありません'}</b></div>
    <table style="width:100%;font-size:14px">${Object.keys(L).map(t => `<tr><td>${esc(L[t])}</td><td class="n">${yen(i.counts[t] || 0)}件</td></tr>`).join('')}</table>
    <div style="margin:8px 0"><label style="margin:0"><input type="checkbox" id="bk_sales" style="width:auto" checked> 売上データ（CSVの取込分）も含める</label></div>
    <button class="pri" onclick="backupDownload()">📥 バックアップをダウンロード</button>
    <div class="mute" style="margin-top:8px">含まないもの: 写真・PDF（Googleドライブ連携で別に保存されます）、合言葉、操作履歴。月に1回など、定期的な保存をおすすめします。</div></div>
  <div class="card"><b>バックアップから復元</b>
    <div class="mute" style="margin:4px 0 8px">保存したファイルを読み込んで、データをその時点に戻します。ファイルに入っている種類のデータは<b>いまの内容がすべて置き換わります</b>（その後に入力した分は消えます）。復元の直前に、いまのデータも自動でダウンロードされます。</div>
    <label class="fb">📤 バックアップのファイルを選ぶ<input type="file" accept=".json,application/json" style="display:none" onchange="backupRestore(this)"></label></div>`;
};
async function loadBackup(){ try { BKP.info = await run('backupInfo'); } catch (e) { return; } if (view.n === 'backup') render(); }
async function backupBuild(withSales){
  const info = await run('backupInfo'), tables = {};
  const names = Object.keys(info.labels).filter(t => withSales || !t.startsWith('sales_'));
  let done = 0;
  for (const t of names) {
    let off = 0, cols = null, rows = [];
    for (;;) {
      $('#busy').textContent = 'バックアップ中 ' + (done + 1) + ' / ' + names.length + '（' + info.labels[t] + '）';
      const r = await run('backupRead', t, off);
      cols = r.cols; rows = rows.concat(r.rows);
      if (!r.more) break; off = r.next;
    }
    tables[t] = {cols: cols, rows: rows}; done++;
  }
  const ver = (document.querySelector('.ver') || {}).textContent || '';
  return {app: 'kawamura-gyomu', format: 1, version: ver, created: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' '), tables: tables};
}
function backupName(prefix){ return prefix + new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_') + '.json'; }
async function backupDownload(){
  busy(1);
  try {
    const obj = await backupBuild($('#bk_sales').checked);
    dlBlob(backupName('gyomu-backup_'), new Blob([JSON.stringify(obj)], {type: 'application/json'}));
    await run('backupDone');
  } finally { busy(-1); $('#busy').textContent = '処理中...'; }
  BKP.info = null; render();
  alert('バックアップをダウンロードしました。ファイル名は gyomu-backup_日付.json です。ダウンロードのフォルダを確認し、安全な場所に保管してください。');
}
async function backupRestore(inp){
  const file = inp.files[0]; inp.value = ''; if (!file) return;
  let obj; try { obj = JSON.parse(await file.text()); } catch (e) { return alert('バックアップのファイルとして読み込めませんでした'); }
  if (!obj || obj.app !== 'kawamura-gyomu' || !obj.tables || typeof obj.tables !== 'object') return alert('このアプリのバックアップファイルではありません');
  const L = (BKP.info && BKP.info.labels) || (await run('backupInfo')).labels;
  const names = Object.keys(obj.tables).filter(t => L[t]);
  if (!names.length) return alert('復元できるデータが入っていません');
  const sum = names.map(t => '・' + L[t] + ' ' + yen((obj.tables[t].rows || []).length) + '件').join('\n');
  if (!confirm('「' + (obj.created || '日時不明') + '」のバックアップ（' + (obj.version || '') + '）から復元します。\n\n' + sum + '\n\n上の種類のデータは、いまの内容がすべて置き換わります。\nよろしいですか？')) return;
  const w = prompt('最終確認です。復元を実行するには「復元」と入力してください。');
  if (w !== '復元') return alert('復元を中止しました');
  busy(1);
  try {
    // 復元の直前に、いまのデータを保存(失敗したときに戻せるように)
    $('#busy').textContent = '復元前のデータを保存中...';
    dlBlob(backupName('gyomu-before-restore_'), new Blob([JSON.stringify(await backupBuild(true))], {type: 'application/json'}));
    let n = 0;
    for (const t of names) {
      $('#busy').textContent = '復元中 ' + (++n) + ' / ' + names.length + '（' + L[t] + '）';
      const T = obj.tables[t], rows = T.rows || [];
      await run('backupClear', t);
      for (let i = 0; i < rows.length; i += 700) await run('backupWrite', t, T.cols, rows.slice(i, i + 700));
    }
  } finally { busy(-1); $('#busy').textContent = '処理中...'; }
  BKP.info = null; DEP = {meta: null, m: null, data: null, sel: null, detail: null, only: false}; SALES = {batches: null, res: null};
  await reload0(); render();
  alert('復元しました。');
  go('backup');
}
// --- 入金チェック表(Excel)の取込 ---
// 見出しの名前の違い(昔の月の表)を、今の口座名にそろえる
const DEP_ALIAS = {'豊信': '豊信東', '豊信2': '豊信小坂井', '豊信3': '豊信吉田方'};
async function depImportXlsx(inp){
  const file = inp.files[0]; inp.value = ''; if (!file) return;
  if (typeof XLSX === 'undefined') return alert('Excelを読む部品がまだ読み込まれていません。少し待ってからもう一度お試しください。');
  const wb = XLSX.read(await file.arrayBuffer(), {type: 'array', cellFormula: true});
  const items = [], months = [], cols = new Set(), skipped = [];
  for (const name of wb.SheetNames) {
    const t = name.normalize('NFKC').replace(/\s/g, '');
    const m = /^R(\d+)\.(\d+)$/.exec(t);
    if (!m) { skipped.push(name.trim()); continue; }
    const ym = (Number(m[1]) + 2018) + '-' + m[2].padStart(2, '0');
    const ws = wb.Sheets[name], rng = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const heads = [];
    for (let c = 1; c <= rng.e.c; c++) { const h = ws[XLSX.utils.encode_cell({r: 0, c: c})]; heads[c] = h ? String(h.v == null ? '' : h.v).normalize('NFKC').replace(/\s/g, '') : ''; }
    const use = [];
    heads.forEach((h, c) => { if (h && !['計', '突合', '振込計'].includes(h)) use.push([c, DEP_ALIAS[h] || h]); });
    const days = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0).getDate();
    let n = 0;
    for (let r = 1; r <= Math.min(rng.e.r, 40); r++) {
      const dc = ws[XLSX.utils.encode_cell({r: r, c: 0})], day = dc ? Number(dc.v) : 0;
      if (!Number.isInteger(day) || day < 1 || day > days) continue;
      for (const [c, nm] of use) {
        const cell = ws[XLSX.utils.encode_cell({r: r, c: c})];
        if (!cell || cell.v === '' || cell.v == null || typeof cell.v !== 'number' || cell.v === 0) continue;
        items.push([ym + '-' + String(day).padStart(2, '0'), nm, cell.v, cell.f ? String(cell.f) : '']); n++; cols.add(nm);
      }
    }
    if (n) months.push(ym);
  }
  if (!items.length) return alert('取り込める入力が見つかりませんでした。シート名が「R8.8」の形の月ごとの表が必要です。');
  months.sort();
  const known = new Set(['現金', '手数料'].concat(DEP.data.accts.map(a => a.name)));
  const fresh = [...cols].filter(c => !known.has(c));
  if (!confirm('入金チェック表から ' + months.length + 'か月分（' + months[0] + ' 〜 ' + months[months.length - 1] + '）、' + items.length + '件の金額を取り込みます。\n同じ日・同じ欄に入力済みの金額は、Excelの内容で置き換わります。\n' + (fresh.length ? '新しく追加される口座: ' + fresh.join('、') + '\n' : '') + (skipped.length ? '（取り込まないシート: ' + skipped.join('、') + '）\n' : '') + 'よろしいですか？')) return;
  busy(1);
  try {
    for (let i = 0; i < items.length; i += 500) {
      $('#busy').textContent = '取込中 ' + Math.min(i + 500, items.length) + ' / ' + items.length;
      await run('depImportCells', items.slice(i, i + 500));
    }
  } finally { busy(-1); $('#busy').textContent = '処理中...'; }
  const keep = DEP.m;
  DEP = {meta: null, m: keep, data: null, sel: null, detail: null, only: false};
  alert('取り込みました（' + items.length + '件）');
  go('deposit');
}
// --- スマイルの入金実績CSVの取込 ---
async function depImport(inp){
  const file = inp.files[0]; inp.value = ''; if (!file) return;
  const buf = await file.arrayBuffer();
  let text; try { text = new TextDecoder('utf-8', {fatal: true}).decode(buf); } catch (e) { text = new TextDecoder('shift_jis').decode(buf); }
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const hi = rows.findIndex(r => r.indexOf('伝票番号') >= 0 && r.indexOf('入金日') >= 0);
  if (hi < 0) return alert('入金実績一覧表のCSVではないようです（「伝票番号」「入金日」の列が見つかりません）');
  const H = rows[hi].map(x => String(x).trim()), ix = n => H.indexOf(n);
  for (const n of ['入金額', '現金', '振込']) if (ix(n) < 0) return alert('「' + n + '」の列が見つかりません');
  const num = (r, n) => { const i = ix(n); if (i < 0) return 0; const v = Number(String(r[i] || '').replace(/[,\s]/g, '')); return Number.isFinite(v) ? v : 0; };
  const out = []; let bad = 0;
  for (const r of rows.slice(hi + 1)) {
    const m = /^(\d{2,4})\/(\d{1,2})\/(\d{1,2})$/.exec(String(r[ix('入金日')] || '').trim());
    if (!m) continue; // 小計・合計の行など
    const y = Number(m[1]) < 100 ? Number(m[1]) + 2018 : Number(m[1]);
    const ymd = y + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    const amount = num(r, '入金額'), cash = num(r, '現金'), bank = num(r, '振込') + num(r, '手形') + num(r, '口振') + num(r, 'カード') + num(r, '預け金'), fee = num(r, 'その他'), off = num(r, '相殺') + num(r, '貸倒');
    if (amount !== cash + bank + fee + off) bad++;
    out.push([ymd, r[ix('伝票番号')], r[ix('得意先コード')], r[ix('得意先名')], amount, cash, bank, fee, off]);
  }
  if (!out.length) return alert('取り込めるデータがありませんでした');
  const ds = out.map(x => x[0]).sort(), from = ds[0], to = ds[ds.length - 1];
  if (!confirm(from.replace(/-/g, '/') + ' 〜 ' + to.replace(/-/g, '/') + ' の ' + yen(out.length) + '件を取り込みます。\nこの期間にすでに取り込んだデータは置き換えます（入力済みの金額は消えません）。\n' + (bad ? '※ 内訳が合わない行が ' + bad + '件あります。\n' : '') + 'よろしいですか？')) return;
  busy(1);
  try {
    await run('depImportBegin', from, to);
    for (let i = 0; i < out.length; i += 400) {
      $('#busy').textContent = '取込中 ' + Math.min(i + 400, out.length) + ' / ' + out.length;
      await run('depImportAdd', out.slice(i, i + 400));
    }
  } finally { busy(-1); $('#busy').textContent = '処理中...'; }
  DEP = {meta: null, m: to.slice(0, 7), data: null, sel: null, detail: null, only: false};
  alert('取り込みました（' + yen(out.length) + '件）');
  go('deposit');
}

// ---------- スマイルワークス得意先CSVの取込 ----------
function parseCsv(text){
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}
async function importSmile(inp){
  const file = inp.files[0]; inp.value = ''; if (!file) return;
  const text = new TextDecoder('shift_jis').decode(await file.arrayBuffer());
  const rows = parseCsv(text);
  const hi = rows.findIndex(r => r.indexOf('得意先コード') >= 0);
  if (hi < 0) return alert('得意先マスタのCSVではないようです（「得意先コード」の列が見つかりません）');
  const H = rows[hi], ix = n => H.indexOf(n);
  const col = {code: ix('得意先コード'), name: ix('得意先名称'), contact: ix('得意先担当者名'), zip1: ix('郵便番号（親番）'), zip2: ix('郵便番号（枝番）'),
    a1: ix('住所（上段）'), a2: ix('住所（下段）'), tel: ix('電話番号１'), email: ix('E-mailアドレス')};
  const get = (r, k) => col[k] >= 0 ? String(r[col[k]] || '').trim() : '';
  const list = rows.slice(hi + 1).map(r => {
    const zip = get(r, 'zip1') && get(r, 'zip2') ? '〒' + get(r, 'zip1') + '-' + get(r, 'zip2') + ' ' : '';
    return {code: get(r, 'code'), name: get(r, 'name'), contact: get(r, 'contact'), address: zip + get(r, 'a1') + get(r, 'a2'), tel: get(r, 'tel'), email: get(r, 'email')};
  }).filter(x => x.code && x.name);
  if (!list.length) return alert('取り込める得意先がありませんでした');
  if (!confirm(list.length + '件の得意先を取り込みます。\n得意先コードが同じ顧客は、名前・住所などを上書きします。よろしいですか？')) return;
  const res = await run('importCustomers', list);
  await reload0();
  alert('取込が完了しました。新規 ' + res.added + '件 / 更新 ' + res.updated + '件');
  render();
}
function editCustomer(id){
  const vals = id ? Object.assign({}, cust(id)) : {};
  openForm({title: id ? '顧客の編集' : '顧客の追加', table: 'customers', vals: vals, required: 'name',
    fields: [{k:'code',l:'得意先コード（スマイルワークスのコード）'},{k:'name',l:'顧客名（会社名）'},{k:'contact',l:'担当者'},{k:'address',l:'住所'},{k:'tel',l:'電話'},{k:'email',l:'メール'},{k:'memo',l:'メモ',t:'textarea'}],
    onDelete: !!id, afterDelete: () => go('customers'), after: () => go('customers')});
}

// ---------- 仕入先マスタ ----------
V.vendors = () => `<div class="bar"><button onclick="go('menu')">← メニュー</button><span class="sp"></span><button class="pri" onclick="editVendor()">＋仕入先</button></div>` +
  (DB.vendors.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja')).map(v => `<div class="card click" onclick="editVendor('${v.id}')"><b>${esc(v.name)}</b><div class="mute">${esc(v.contact)} ${esc(v.tel)}</div></div>`).join('') || '<p class="mute">仕入先が未登録です</p>');
function editVendor(id){
  const vals = id ? Object.assign({}, DB.vendors.find(v => v.id === id)) : {};
  openForm({title: id ? '仕入先の編集' : '仕入先の追加', table: 'vendors', vals: vals, required: 'name',
    fields: [{k:'name',l:'仕入先名（会社名）'},{k:'contact',l:'担当者'},{k:'tel',l:'電話'},{k:'email',l:'メール'},{k:'address',l:'住所'},{k:'memo',l:'メモ',t:'textarea'}],
    onDelete: !!id, afterDelete: () => go('vendors'), after: () => go('vendors')});
}

// ---------- メモ帳 ----------
V.memos = () => `<div class="bar"><button onclick="go('menu')">← メニュー</button><span class="sp"></span><button class="pri" onclick="editMemo()">＋メモ</button></div>
  <div class="bar"><input placeholder="メモを検索（内容・顧客・相手先）" value="${esc(view.mq || '')}" oninput="view.mq=this.value;$('#mlist').innerHTML=memoListHtml()">
  <select style="width:auto" onchange="view.ms=this.value;$('#mlist').innerHTML=memoListHtml()">${['', '未対応', '対応中', '完了'].map(x => `<option value="${x}" ${(view.ms || '') === x ? 'selected' : ''}>${x || 'すべて'}</option>`).join('')}</select></div>
  <div id="mlist">${memoListHtml()}</div>`;
function stampHtml(o){
  if (!o) return '';
  const c = String(o.created || '').slice(0, 16), u = String(o.updated || '').slice(0, 16);
  const parts = [];
  if (c || o.author) parts.push('作成 ' + [c, o.author].filter(Boolean).join('　'));
  if (u && u !== c) parts.push('更新 ' + u);
  return parts.join('　／　');
}
function memoListHtml(){
  const words = (view.mq || '').toLowerCase().split(/\s+/).filter(Boolean);
  const stamp = m => String(m.updated || m.created || '');
  const list = DB.memos.filter(m => {
    if (view.ms && m.status !== view.ms) return false;
    const c = cust(m.customerId);
    const t = [m.body, m.who, m.kind, c.name, c.code].join(' ').toLowerCase();
    return words.every(w => t.includes(w));
  }).sort((a, b) => stamp(b).localeCompare(stamp(a)));
  const col = {'未対応': '#fde8e8', '対応中': '#fff4e0', '完了': '#e6f4ea'};
  return list.slice(0, 200).map(m => {
    const c = cust(m.customerId), lines = String(m.body || '').split('\n');
    return `<div class="card click" onclick="editMemo('${m.id}')"><div class="row"><b class="sp">${esc(lines[0].slice(0, 60) || '(無題)')}</b><span class="badge">${esc(m.kind)}</span>${m.projectId ? '<span class="badge" style="background:#e5edff">案件あり</span>' : ''}<span class="badge" style="background:${col[m.status] || '#eee'};color:#333">${esc(m.status)}</span></div>
    <div class="mute">${esc(c.name || '')} ${esc(m.who)}</div>
    <div class="mute">${esc(stampHtml(m))}</div>
    ${lines.length > 1 ? `<div style="white-space:pre-wrap;margin-top:4px;max-height:4.5em;overflow:hidden">${esc(lines.slice(1).join('\n'))}</div>` : ''}
    ${m.status !== '完了' ? `<div class="row" style="margin-top:6px" onclick="event.stopPropagation()"><button onclick="markMemo('${m.id}','完了')">完了にする</button></div>` : ''}</div>`;
  }).join('') || '<p class="mute">メモはありません</p>';
}
async function markMemo(id, status){
  const m = DB.memos.find(x => x.id === id); if (!m) return;
  await run('save', 'memos', Object.assign({}, m, {status: status}));
  await reload0(); render();
}
async function ocrMemo(inp){
  const f = inp.files[0]; inp.value = ''; if (!f) return;
  const d = await resize(f, 2000);
  const r = await run('ocrImage', d);
  if (r.note) alert(r.note);
  if (!r.text) return alert('文字を読み取れませんでした。明るい場所で、ノートを真上から大きく撮影してみてください。');
  const ta = $('#f_body'); ta.value = ta.value ? ta.value + '\n' + r.text : r.text;
}
function editMemo(id){
  const vals = id ? Object.assign({}, DB.memos.find(m => m.id === id)) : {status: '未対応', kind: '問い合わせ'};
  openForm({title: id ? 'メモの編集' : 'メモの追加', table: 'memos', vals: vals, required: 'body',
    fields: [{k:'custFilter',l:'顧客を検索（名前・コード）',oi:'filterCust(this.value)'},
      {k:'customerId',l:'顧客',t:'select',blank:true,o:[['', '（顧客なし・未登録の相手）']].concat(DB.customers.map(c => [c.id, c.name + '（' + c.code + '）']))},
      {k:'who',l:'相手先・担当者名（顧客未登録の場合など）'},
      {k:'kind',l:'種別',t:'select',o:['問い合わせ','注文','依頼','連絡事項','クレーム','その他'].map(x => [x, x])},
      {k:'status',l:'対応状況',t:'select',o:['未対応','対応中','完了'].map(x => [x, x])},
      {k:'body',l:'内容（1行目が見出しになります）',t:'textarea',rows:9}],
    extra: (id && stampHtml(vals) ? `<div class="mute" style="margin-top:10px">${esc(stampHtml(vals))}</div>` : '') + (id ? `<div class="row" style="margin-top:10px">${vals.projectId ? `<button onclick="go('project',{id:'${vals.projectId}'})">📄 関連する案件を開く</button>` : `<button onclick="memoToProject('${id}')">📄 このメモから案件を作る</button>`}</div>` : '') + `<div class="row" style="margin-top:10px"><label class="fb">✍ 手書きを撮影して文字起こし<input type="file" accept="image/*" capture="environment" style="display:none" onchange="ocrMemo(this)"></label><label class="fb">🖼 写真から文字起こし<input type="file" accept="image/*" style="display:none" onchange="ocrMemo(this)"></label></div><div class="mute" style="margin-top:4px">文字起こしは内容の欄の末尾に追加されます。手書きは誤読があるため、数字・電話番号・名前は必ず確認してください。</div>`,
    onDelete: !!id, afterDelete: () => go('memos'), after: () => go('memos')});
}

// ---------- 案件 ----------
function filterCust(v){
  const sel = $('#f_customerId'), cur = sel.value, words = String(v).toLowerCase().split(/\s+/).filter(Boolean);
  const opts = DB.customers.filter(c => { const t = [c.code, c.name].join(' ').toLowerCase(); return c.id === cur || words.every(w => t.includes(w)); });
  const blank = sel.dataset.blank ? '<option value="">' + esc(sel.dataset.bt || '（顧客なし・未登録の相手）') + '</option>' : '';
  sel.innerHTML = blank + opts.map(c => `<option value="${esc(c.id)}" ${c.id === cur ? 'selected' : ''}>${esc(c.name)}（${esc(c.code)}）</option>`).join('');
}
function memoToProject(mid){
  const m = DB.memos.find(x => x.id === mid); if (!m) return;
  const lines = String(m.body || '').split('\n');
  editProject('', {customerId: m.customerId || '', name: lines[0].slice(0, 60), memo: m.body, fromMemo: m, newCust: m.customerId ? '' : (m.who || '')});
}
function editProject(id, pre){
  const vals = id ? Object.assign({}, proj(id)) : Object.assign({status:'進行中'}, pre && {customerId: pre.customerId, name: pre.name, memo: pre.memo, newCust: pre.newCust});
  openForm({title: id ? '案件の編集' : '案件の追加', table: 'projects', vals: vals, required: 'name',
    fields: [{k:'custFilter',l:'顧客を検索（名前・コード）',oi:'filterCust(this.value)'},{k:'customerId',l:'顧客（登録済みから選ぶ）',t:'select',blank:true,blankText:'（選択してください）',o:[['', '（選択してください）']].concat(DB.customers.map(c => [c.id, c.name]))},
      {k:'newCust',l:'登録されていない顧客は、ここに名前を入力（保存と同時に顧客として登録されます）'},{k:'name',l:'案件名'},
      {k:'status',l:'状態',t:'select',o:['進行中','見積提出済','受注','失注','完了'].map(x => [x, x])},{k:'memo',l:'メモ',t:'textarea'}],
    onDelete: !!id, afterDelete: () => go('home'),
    after: pre && pre.fromMemo ? async (s) => { await run('save', 'memos', Object.assign({}, pre.fromMemo, {projectId: s.id, customerId: pre.fromMemo.customerId || s.customerId, status: pre.fromMemo.status === '未対応' ? '対応中' : pre.fromMemo.status})); await reload0(); go('project', {id: s.id}); } : () => go('home')});
}
V.project = () => {
  const p = proj(view.id), c = cust(p.customerId);
  const qs = DB.quotes.filter(q => q.projectId === p.id).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const rs = DB.requests.filter(r => r.projectId === p.id).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  return `<div class="bar"><button onclick="go('home')">← 一覧</button><span class="sp"></span><button onclick="editProject('${p.id}')">案件編集</button></div>
  <div class="card"><b style="font-size:17px">${esc(p.name)}</b> <span class="badge">${esc(p.status)}</span><div class="mute">${esc(c.name)}　${esc(c.contact)}</div>${p.memo ? `<div style="margin-top:6px;white-space:pre-wrap">${esc(p.memo)}</div>` : ''}</div>
  ${(() => { const S = projSummary(p.id); if (!S) return ''; if (!S.pf.n) return `<div class="card"><b>粗利</b> <span class="mute">（${S.label}）</span><div class="mute">原価が未入力です。見積書の明細に「原価(単価)」を入れると粗利が出ます。</div></div>`; return `<div class="card"><b>粗利</b> <span class="mute">（${S.label}・税抜）</span><div class="row" style="margin-top:6px"><div class="sp">売上 ¥${yen(S.pf.rev)}<br>原価 ¥${yen(S.pf.cost)}</div><div style="text-align:right"><b style="font-size:20px">粗利 ¥${yen(S.pf.profit)}</b><br>粗利率 ${pct(S.pf.profit, S.pf.rev)}</div></div>${S.partial ? '<div class="mute" style="margin-top:4px">※原価が未入力の行があります（入力済みの' + S.pf.n + '行のみの計算）</div>' : ''}</div>`; })()}
  <h2><span>見積書</span><button class="pri" onclick="newQuote('${p.id}')">＋作成</button></h2>
  ${qs.map(q => `<div class="card"><div class="row"><b class="sp">${esc(q.no)}</b><span class="badge" style="background:${{'受注':'#e6f4ea','失注':'#fde8e8'}[q.result] || '#eee'};color:#333">${esc(q.result || '未定')}</span><b>¥${yen(q.total)}</b></div><div class="mute">${esc(q.subject)}　発行日 ${esc(q.issueDate)}</div><div class="mute">${esc(stampHtml(q))}</div>${(() => { const pf = profitOf(DB.lines.filter(l => l.quoteId === q.id)); return pf.n ? `<div class="mute">粗利 ¥${yen(pf.profit)}（${pct(pf.profit, pf.rev)}）</div>` : ''; })()}
    <div class="row" style="margin-top:8px"><button onclick="editQuote('${q.id}')">編集</button><button onclick="dupQuote('${q.id}')">複製</button><button onclick="editRequest('${p.id}',null,'${q.id}')" title="この見積書の明細を、仕入先への見積依頼にコピーします">📋 仕入先に依頼</button><button onclick="expPdf('${q.id}')">PDF</button><button onclick="expXlsx('${q.id}')">Excel</button><button onclick="expCsv('${q.id}')">CSV</button></div></div>`).join('') || '<p class="mute">見積書はまだありません</p>'}
  ${compareHtml(rs)}
  ${memosOf(p.id)}
  <h2><span>仕入先（回答）</span><button class="pri" onclick="editRequest('${p.id}')">＋仕入先</button></h2>
  ${rs.map(r => `<div class="card"><div class="row"><b class="sp">${esc(r.vendor)}</b><span class="badge">${esc(r.status)}</span></div>
    <div class="mute">依頼 ${esc(r.requestedOn)} / 期限 ${esc(r.dueOn)} / 回答 ${esc(r.answeredOn) || '未'}${r.amount !== '' && r.amount != null ? ' / ¥' + yen(r.amount) : ''}</div>
    ${reqLinesOf(r.id).length ? `<div style="margin:6px 0;font-size:13px">${reqLinesOf(r.id).map(l => `<div class="row" style="padding:2px 0"><span class="sp">${esc(l.item)}${l.qty !== '' ? ' ' + esc(l.qty) + esc(l.unit) : ''}</span>${l.price !== '' ? `<b>@¥${yen(l.price)}</b>` : '<span class="mute">単価 未回答</span>'}</div>`).join('')}</div>` : ''}
    ${r.memo ? `<div style="white-space:pre-wrap">${esc(r.memo)}</div>` : ''}
    <div class="thumbs" data-req="${r.id}">${String(r.photos || '').split(',').filter(String).map(t => t.endsWith('|pdf') ? `<div class="pdf" data-tok="${t}" data-req="${r.id}">📄<br>PDF</div>` : `<img data-tok="${t}" data-req="${r.id}" alt="">`).join('')}</div>
    <div class="row" style="margin-top:8px"><button onclick="editRequest('${p.id}','${r.id}')">編集</button><button onclick="expReqPdf('${r.id}')">依頼書PDF</button>
      <label class="fb">📷 撮影<input type="file" accept="image/*" capture="environment" style="display:none" onchange="addFiles('${r.id}',this)"></label>
      <label class="fb">🖼 写真から選択<input type="file" accept="image/*" multiple style="display:none" onchange="addFiles('${r.id}',this)"></label>
      <label class="fb">📄 PDF追加<input type="file" accept="application/pdf" multiple style="display:none" onchange="addFiles('${r.id}',this)"></label></div></div></div>`).join('') || '<p class="mute">仕入先はまだありません</p>'}`;
};
function compareHtml(rs){
  const a = rs.filter(r => r.amount !== '' && r.amount != null && Number(r.amount) > 0 && r.status !== '辞退').sort((x, y) => Number(x.amount) - Number(y.amount));
  if (a.length < 2) return '';
  const min = Number(a[0].amount);
  return `<h2><span>回答金額の比較</span></h2><div class="card">${a.map((r, i) => `<div class="row" style="padding:4px 0"><span class="sp">${i === 0 ? '🏆 ' : ''}${esc(r.vendor)} <span class="mute">${esc(r.status)}</span></span><b>¥${yen(r.amount)}</b><span class="mute" style="min-width:90px;text-align:right">${i === 0 ? '最安' : '+¥' + yen(Number(r.amount) - min) + '（+' + Math.round((Number(r.amount) - min) / min * 1000) / 10 + '%）'}</span></div>`).join('')}</div>`;
}
function memosOf(pid){
  const ms = DB.memos.filter(m => m.projectId === pid);
  if (!ms.length) return '';
  return `<h2><span>関連メモ</span></h2>` + ms.map(m => `<div class="card click" onclick="editMemo('${m.id}')"><div class="row"><b class="sp">${esc(String(m.body || '').split('\n')[0].slice(0, 60))}</b><span class="badge">${esc(m.kind)}</span></div><div class="mute">${esc(String(m.updated || m.created || '').slice(0, 16))}</div></div>`).join('');
}
// ---------- 仕入先への見積依頼(明細つき) ----------
const reqLinesOf = id => (DB.reqLines || []).filter(l => l.reqId === id).sort((a, b) => a.row - b.row);
const newReqLine = () => ({item: '', qty: 1, unit: '', note: '', price: ''});
const quoteLinesToReq = qid => DB.lines.filter(l => l.quoteId === qid).sort((a, b) => a.row - b.row).map(l => ({item: l.item, qty: l.qty, unit: l.unit, note: l.note, price: ''}));
// qid を渡すと、その見積書の明細(品名・数量・単位・備考)を複写して新しい依頼を作る
function editRequest(pid, id, qid){
  const r = id ? Object.assign({}, DB.requests.find(x => x.id === id)) : {projectId: pid, requestedOn: today(), status: '依頼中', vendor: '', dueOn: '', answeredOn: '', amount: '', detail: '', memo: ''};
  let lines = id ? reqLinesOf(id).map(l => Object.assign({}, l)) : [];
  if (qid) lines = quoteLinesToReq(qid);
  if (!lines.length) lines = [newReqLine()];
  view = {n: 'request', r: r, lines: lines};
  render(); window.scrollTo(0, 0);
}
const reqPriced = () => view.lines.filter(l => String(l.item).trim() && l.price !== '' && l.price != null);
const reqTotal = () => reqPriced().reduce((t, l) => t + Math.round((l.qty === '' || l.qty == null ? 1 : Number(l.qty) || 0) * (Number(l.price) || 0)), 0);
function updReq(){
  const n = reqPriced().length, e = $('#rtot'); if (!e) return;
  e.innerHTML = n ? `回答金額（明細の合計） <b style="font-size:18px">¥${yen(reqTotal())}</b><div class="mute">回答の単価を入れた${n}行の「数量×単価」の合計です</div>` : '<span class="mute">回答の単価を入れると、回答金額を自動で計算します</span>';
  const m = $('#ramt'); if (m) m.style.display = n ? 'none' : '';
}
V.request = () => {
  const r = view.r, p = proj(r.projectId), qs = DB.quotes.filter(q => q.projectId === r.projectId);
  return `<div class="bar"><button onclick="go('project',{id:'${r.projectId}'})">← 案件へ</button></div>
  <div class="card"><b>${esc(cust(p.customerId).name)} / ${esc(p.name)}</b>
  <h2 style="margin-top:8px"><span>${r.id ? '仕入先の見積依頼（編集）' : '仕入先に見積を依頼'}</span></h2>
  ${DB.vendors.length ? `<label>仕入先マスタから選択</label><select onchange="view.r.vendor=this.value;$('#rvn').value=this.value"><option value="">（選ばず直接入力する）</option>${DB.vendors.map(v => `<option ${v.name === r.vendor ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>` : ''}
  <label>仕入先名</label><input id="rvn" value="${esc(r.vendor)}" oninput="view.r.vendor=this.value">
  <div class="g" style="grid-template-columns:1fr 1fr"><div><label>依頼日</label><input type="date" value="${esc(r.requestedOn)}" oninput="view.r.requestedOn=this.value"></div>
  <div><label>回答期限</label><input type="date" value="${esc(r.dueOn)}" oninput="view.r.dueOn=this.value"></div>
  <div><label>回答日</label><input type="date" value="${esc(r.answeredOn)}" oninput="view.r.answeredOn=this.value"></div>
  <div><label>状態</label><select onchange="view.r.status=this.value">${['依頼中', '回答あり', '辞退', '採用'].map(x => `<option ${r.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
  <h2><span>見積を依頼する明細</span></h2>
  <div class="row" style="margin-bottom:8px;align-items:center"><select id="rcq" style="flex:1;min-width:200px"><option value="">見積書の明細を複写する…</option>${qs.map(q => `<option value="${q.id}">${esc(q.no)} ${esc(q.subject)}（${DB.lines.filter(l => l.quoteId === q.id).length}行）</option>`).join('')}</select><button onclick="reqCopyFromQuote()">複写</button></div>
  ${view.lines.map((l, i) => `<div class="ln"><input placeholder="品名" value="${esc(l.item)}" oninput="view.lines[${i}].item=this.value">
    <div class="g" style="margin-top:6px"><input type="number" inputmode="decimal" placeholder="数量" value="${esc(l.qty)}" oninput="view.lines[${i}].qty=this.value;updReq()"><input placeholder="単位" value="${esc(l.unit)}" oninput="view.lines[${i}].unit=this.value"><input type="text" inputmode="decimal" placeholder="回答の単価" value="${esc(fmtNum(l.price))}" oninput="numIn(this,event);view.lines[${i}].price=rawNum(this.value);updReq()" oncompositionend="numIn(this);view.lines[${i}].price=rawNum(this.value);updReq()"></div>
    <div class="row" style="margin-top:6px"><input class="sp" placeholder="備考（規格・納期の希望など）" value="${esc(l.note)}" oninput="view.lines[${i}].note=this.value"><button class="dng" onclick="reqDelLine(${i})">削除</button></div></div>`).join('')}
  <button onclick="reqAddLine()">＋行を追加</button>
  <div class="card tot" id="rtot" style="margin-top:12px"></div>
  <div id="ramt"><label>回答金額（円）</label><input type="text" inputmode="numeric" value="${esc(fmtNum(r.amount))}" oninput="numIn(this,event);view.r.amount=rawNum(this.value)" oncompositionend="numIn(this);view.r.amount=rawNum(this.value)"><div class="mute">明細ごとの単価を入れない場合は、合計金額をここに入れます。</div></div>
  <label>依頼内容（見積依頼書に印字されます）</label><textarea oninput="view.r.detail=this.value">${esc(r.detail)}</textarea>
  <label>社内メモ（依頼書には載りません）</label><textarea oninput="view.r.memo=this.value">${esc(r.memo)}</textarea>
  <div class="row" style="margin-top:14px"><button class="pri" onclick="saveReq()">保存</button><button onclick="go('project',{id:'${r.projectId}'})">キャンセル</button><span class="sp"></span>${r.id ? '<button class="dng" onclick="delReq()">削除</button>' : ''}</div></div>`;
};
setTimeout(() => { const o = new MutationObserver(() => { if (view.n === 'request') updReq(); }); o.observe(document.getElementById('app'), {childList: true}); }, 0);
function reqAddLine(){ view.lines.push(newReqLine()); render(); }
function reqDelLine(i){ view.lines.splice(i, 1); if (!view.lines.length) view.lines.push(newReqLine()); render(); }
function reqCopyFromQuote(){
  const qid = $('#rcq').value; if (!qid) return alert('複写する見積書を選んでください');
  const add = quoteLinesToReq(qid);
  if (!add.length) return alert('その見積書には明細がありません');
  const cur = view.lines.filter(l => String(l.item).trim());
  if (cur.length && !confirm('いまの明細（' + cur.length + '行）の下に、' + add.length + '行を追加します。よろしいですか？\n（キャンセルすると何も変わりません）')) return;
  view.lines = cur.concat(add); render();
}
async function saveReq(){
  const r = view.r;
  if (!String(r.vendor).trim()) return alert('仕入先名を入力してください');
  const saved = await run('saveRequest', r, view.lines);
  await reload0(); go('project', {id: saved.r.projectId});
}
async function delReq(){
  if (!confirm('この仕入先の依頼を削除しますか？（添付した写真・PDFも消えます）')) return;
  const pid = view.r.projectId; await run('remove', 'requests', view.r.id); await reload0(); go('project', {id: pid});
}

// ---------- 写真 ----------
function resize(file, max){
  return new Promise((ok, ng) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url); ok(cv.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = ng; img.src = url;
  });
}
function readAsDataUrl(file){
  return new Promise((ok, ng) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ng; r.readAsDataURL(file); });
}
async function addFiles(reqId, inp){
  const files = Array.from(inp.files); inp.value = ''; if (!files.length) return;
  for (const f of files) {
    try {
      if (f.type === 'application/pdf') {
        if (f.size > 8 * 1024 * 1024) { alert(f.name + ' は8MBを超えているため保存できません'); continue; }
        await run('uploadPhoto', reqId, await readAsDataUrl(f), f.name);
      } else {
        await run('uploadPhoto', reqId, await resize(f, 1600), 'answer_' + Date.now() + '.jpg');
      }
    } catch (e) { /* エラーは run() で通知済み */ }
  }
  await reload();
}
function loadThumbs(){
  document.querySelectorAll('.thumbs .pdf').forEach(el => { el.onclick = () => openPhoto(el.dataset.req, el.dataset.tok); });
  document.querySelectorAll('.thumbs img').forEach(im => {
    im.src = '/api/file/' + im.dataset.tok;
    im.onclick = () => openPhoto(im.dataset.req, im.dataset.tok);
  });
}
let pdfjsP = null;
function loadPdfJs(){
  if (pdfjsP) return pdfjsP;
  pdfjsP = new Promise((ok, ng) => {
    const sc = document.createElement('script'); sc.src = '/vendor/pdf.min.js';
    sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js'; ok(window.pdfjsLib); };
    sc.onerror = () => ng(new Error('pdf.js load failed'));
    document.head.appendChild(sc);
  });
  pdfjsP.catch(() => { pdfjsP = null; });
  return pdfjsP;
}
// 保存したPDFを画面内で表示する(ダウンロード不要)。u8: PDFのバイト列
async function showPdf(u8){
  const box = $('#pdfbox');
  box.style.display = 'block'; box.innerHTML = '<div style="padding:20px">PDFを読み込み中...</div>';
  try {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({data: u8.slice()}).promise;
    box.innerHTML = '';
    const w = Math.min(box.clientWidth - 16 || 600, 900), dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n), v0 = page.getViewport({scale: 1}), sc = w / v0.width, vp = page.getViewport({scale: sc * dpr});
      const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; cv.style.width = Math.round(vp.width / dpr) + 'px';
      box.appendChild(cv);
      await page.render({canvasContext: cv.getContext('2d'), viewport: vp}).promise;
    }
  } catch (e) {
    // 予備: ブラウザ内蔵のPDF表示
    const url = URL.createObjectURL(new Blob([u8], {type: 'application/pdf'}));
    box.innerHTML = '<iframe src="' + url + '" style="width:100%;height:100%;border:0;background:#fff"></iframe>';
  }
}
function openOv(){ $('#ov').style.display = 'flex'; }
async function openPhoto(reqId, tok){
  const isPdf = tok.endsWith('|pdf'), id = tok.split('|')[0];
  $('#ovimg').src = ''; $('#ovimg').style.display = isPdf ? 'none' : 'block';
  $('#pdfbox').style.display = 'none'; $('#pdfbox').innerHTML = '';
  $('#ovdl').textContent = 'PDFをダウンロード'; $('#ovdl').style.display = isPdf ? 'inline-block' : 'none';
  $('#ovdel').style.display = 'inline-block';
  openOv();
  $('#ovdel').onclick = async () => { if (!confirm('削除しますか？')) return; closeOv(); await run('removePhoto', reqId, tok); await reload(); };
  if (isPdf) {
    busy(1);
    try {
      const res = await fetch('/api/file/' + id);
      if (!res.ok) throw new Error('ファイルを読み込めませんでした');
      const buf = await res.arrayBuffer(), u8 = new Uint8Array(buf);
      $('#ovdl').onclick = () => dlBlob('回答_' + id.slice(0, 6) + '.pdf', new Blob([u8], {type: 'application/pdf'}));
      busy(-1);
      await showPdf(u8);
    } catch (e) { busy(-1); closeOv(); alert('エラー: ' + (e.message || e)); }
  } else {
    $('#ovimg').src = '/api/file/' + id;
  }
}
// 作成した見積書・見積依頼書をその場で表示(印刷またはPDF保存はボタンから)
function viewDoc(r){
  $('#ovimg').style.display = 'none'; $('#ovdel').style.display = 'none';
  const box = $('#pdfbox');
  box.style.display = 'block';
  box.innerHTML = '<iframe style="width:100%;height:100%;border:0;background:#fff"></iframe>';
  const fr = box.querySelector('iframe');
  fr.srcdoc = r.html;
  $('#ovdl').textContent = '印刷 / PDFで保存'; $('#ovdl').style.display = 'inline-block';
  $('#ovdl').onclick = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { alert('印刷画面を開けませんでした。'); } };
  openOv();
}
function closeOv(){ $('#ov').style.display = 'none'; $('#pdfbox').innerHTML = ''; $('#pdfbox').style.display = 'none'; }

// ---------- 見積編集 ----------
function newQuote(pid){
  view = {n:'quote', q:{projectId: pid, issueDate: today(), validUntil: addDays(today(), 30), taxRate: 10, subject: proj(pid).name}, lines:[newLine()]};
  render(); window.scrollTo(0, 0);
}
function editQuote(id){
  const q = Object.assign({}, DB.quotes.find(x => x.id === id));
  const ls = DB.lines.filter(l => l.quoteId === id).sort((a, b) => a.row - b.row).map(l => Object.assign({}, l));
  view = {n:'quote', q: q, lines: ls.length ? ls : [newLine()]};
  render(); window.scrollTo(0, 0);
}
function dupQuote(id){
  const q = Object.assign({}, DB.quotes.find(x => x.id === id));
  ['id','no','created','author','updated','subtotal','tax','total','resultOn'].forEach(k => { q[k] = ''; });
  q.issueDate = today(); q.validUntil = addDays(today(), 30); q.result = '未定';
  const ls = DB.lines.filter(l => l.quoteId === id).sort((a, b) => a.row - b.row).map(l => Object.assign({}, l));
  view = {n:'quote', q: q, lines: ls.length ? ls : [newLine()]};
  render(); window.scrollTo(0, 0);
  alert('見積書を複製しました。内容を確認して「保存」を押してください（保存するまで登録されません）。');
}
function pickCost(i, v){
  if (v === '') return;
  const l = view.lines[i], qty = Number(l.qty) || 1;
  // 先頭が u のものは「単価」をそのまま原価に。それ以外は回答の合計金額なので数量で割る
  l.cost = v[0] === 'u' ? Number(v.slice(1)) : Math.round(Number(v) / qty); render();
}
const replyReqs = pid => DB.requests.filter(r => r.projectId === pid && reqLinesOf(r.id).some(l => l.price !== ''));
const itemKey = t => String(t == null ? '' : t).normalize('NFKC').replace(/\s/g, '').toLowerCase();
function applyReplyCost(){
  const rid = $('#rcost').value, rl = reqLinesOf(rid).filter(l => l.price !== '');
  let n = 0; const miss = [];
  view.lines.forEach(l => {
    if (!String(l.item).trim()) return;
    const hit = rl.find(x => itemKey(x.item) === itemKey(l.item));
    if (hit) { l.cost = hit.price; n++; } else miss.push(l.item);
  });
  render();
  alert(n + '行の原価に、仕入先の回答の単価を入れました。' + (miss.length ? '\n\n品名が一致せず、入れられなかった行:\n・' + miss.join('\n・') : ''));
}
async function quoteToRequest(){
  if (!view.lines.some(l => String(l.item).trim())) return alert('先に明細を入力してください');
  if (!confirm('この見積書を保存して、明細（品名・数量・単位・備考）を仕入先への見積依頼にコピーします。\n原価・販売単価はコピーしません。よろしいですか？')) return;
  const pid = view.q.projectId;
  const q = await run('saveQuote', view.q, view.lines);
  await reload0(); editRequest(pid, null, q.id);
}
function calc(){
  const sub = view.lines.reduce((s, l) => s + Math.round((Number(l.qty) || 0) * (Number(l.price) || 0)), 0);
  const tax = Math.floor(sub * (Number(view.q.taxRate) || 0) / 100);
  return {sub: sub, tax: tax, total: sub + tax};
}
function profitOf(lines){
  const cl = lines.filter(l => l.cost !== '' && l.cost != null);
  const rev = cl.reduce((s, l) => s + Math.round((Number(l.qty) || 0) * (Number(l.price) || 0)), 0);
  const cost = cl.reduce((s, l) => s + Math.round((Number(l.qty) || 0) * (Number(l.cost) || 0)), 0);
  return {n: cl.length, rev: rev, cost: cost, profit: rev - cost};
}
const mk = {rate: 20, method: 'markup', unit: 1, round: 'ceil'};
function mkPrice(cost){
  const r = Number(mk.rate) || 0;
  const p = mk.method === 'gross' ? (r >= 100 ? NaN : cost / (1 - r / 100)) : cost * (1 + r / 100);
  if (isNaN(p)) return NaN;
  const u = Number(mk.unit) || 1, x = p / u;
  return u * (mk.round === 'ceil' ? Math.ceil(x - 1e-9) : mk.round === 'floor' ? Math.floor(x + 1e-9) : Math.round(x));
}
function applyMarkup(i){
  if (Number(mk.method === 'gross' ? mk.rate : 0) >= 100) return alert('粗利率は100%未満で指定してください');
  const idx = i == null ? view.lines.map((l, k) => k) : [i];
  let n = 0;
  idx.forEach(k => { const l = view.lines[k]; if (l.cost === '' || l.cost == null || isNaN(Number(l.cost))) return; const p = mkPrice(Number(l.cost)); if (!isNaN(p)) { l.price = p; n++; } });
  if (!n) return alert('原価(単価)が入力されている行がありません。先に原価を入力してください。');
  render();
}
function projSummary(pid){
  const qs = DB.quotes.filter(q => q.projectId === pid).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  if (!qs.length) return null;
  const won = qs.filter(q => q.result === '受注'), basis = won.length ? won : [qs[0]];
  const ls = DB.lines.filter(l => basis.some(q => q.id === l.quoteId));
  const pf = profitOf(ls);
  return {label: won.length ? '受注した見積' + (won.length > 1 ? '（' + won.length + '件の合計）' : '') : '最新の見積（結果未定）', pf: pf, sales: ls.reduce((t, l) => t + (Number(l.amount) || 0), 0), partial: ls.length > pf.n, total: ls.length};
}
const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 + '%' : '-';
function upd(){
  const t = calc(), pf = profitOf(view.lines);
  $('#tot').innerHTML = `小計 ¥${yen(t.sub)}<br>消費税 ¥${yen(t.tax)}<br><b style="font-size:18px">合計 ¥${yen(t.total)}</b>` +
    (pf.n ? `<div class="mute" style="margin-top:6px">粗利 ¥${yen(pf.profit)}（${pf.rev ? Math.round(pf.profit / pf.rev * 1000) / 10 : 0}%）※原価を入力した${pf.n}行の分・PDFには載りません</div>` : '');
}
V.quote = () => {
  const q = view.q, p = proj(q.projectId);
  return `<div class="bar"><button onclick="go('project',{id:'${q.projectId}'})">← 案件へ</button></div>
  <div class="card"><b>${esc(cust(p.customerId).name)} / ${esc(p.name)}</b>${stampHtml(q) ? `<div class="mute">${esc(stampHtml(q))}</div>` : ''}
  <label>件名</label><input value="${esc(q.subject)}" oninput="view.q.subject=this.value">
  <div class="g" style="grid-template-columns:1fr 1fr"><div><label>見積書発行日</label><input type="date" value="${esc(q.issueDate)}" oninput="view.q.issueDate=this.value"></div>
  <div><label>有効期限</label><input id="vu" type="date" value="${esc(q.validUntil)}" oninput="view.q.validUntil=this.value"></div></div>
  <div class="row" style="margin-top:6px"><span class="mute">有効期限:</span><button onclick="setValid(30)">発行日から30日</button><button onclick="setValid(60)">60日</button><button onclick="setValid(90)">90日</button></div>
  <label>結果（受注・失注）</label><select onchange="view.q.result=this.value;if(this.value!=='未定'&&!view.q.resultOn)view.q.resultOn=today();if(this.value==='未定')view.q.resultOn=''">${['未定','受注','失注'].map(x => `<option ${(q.result || '未定') === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
  <label>消費税率（%）</label><select onchange="view.q.taxRate=this.value;upd()">${[10,8,0].map(r => `<option ${Number(q.taxRate) === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
  <h2><span>明細</span><button onclick="quoteToRequest()" title="この明細を保存して、仕入先への見積依頼にコピーします">📋 仕入先に見積を依頼</button></h2>
  <div class="card" style="background:#f8fafc"><b>仕入金額から見積金額を計算</b>
    <div class="g" style="grid-template-columns:1fr 1fr;margin-top:6px"><div><label>計算方法</label><select onchange="mk.method=this.value"><option value="markup" ${mk.method === 'markup' ? 'selected' : ''}>原価に○%上乗せ（掛け率）</option><option value="gross" ${mk.method === 'gross' ? 'selected' : ''}>粗利率○%になる価格</option></select></div>
    <div><label>率（%）</label><input type="text" inputmode="decimal" value="${esc(mk.rate)}" oninput="mk.rate=this.value"></div>
    <div><label>端数の単位</label><select onchange="mk.unit=this.value">${[1, 10, 100, 1000].map(u => `<option value="${u}" ${Number(mk.unit) === u ? 'selected' : ''}>${u}円</option>`).join('')}</select></div>
    <div><label>端数処理</label><select onchange="mk.round=this.value">${[['ceil', '切り上げ'], ['round', '四捨五入'], ['floor', '切り捨て']].map(o => `<option value="${o[0]}" ${mk.round === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div></div>
    <div class="row" style="margin-top:8px"><button class="pri" onclick="applyMarkup()">原価が入った全行の単価を計算</button></div>
    ${replyReqs(q.projectId).length ? `<div style="margin-top:10px;border-top:1px solid #e5e7eb;padding-top:8px"><b>仕入先の回答を原価に反映</b><div class="row" style="margin-top:6px"><select id="rcost" style="flex:1;min-width:200px">${replyReqs(q.projectId).map(r => `<option value="${r.id}">${esc(r.vendor)}（${reqLinesOf(r.id).filter(l => l.price !== '').length}行に単価）</option>`).join('')}</select><button onclick="applyReplyCost()">品名が同じ行の原価に入れる</button></div></div>` : ''}
    <div class="mute" style="margin-top:4px">各行の「原価(単価)」から販売単価を計算して入れます。上乗せ: 原価×(1+率) ／ 粗利率: 原価÷(1−率)。行ごとにも「率で単価」ボタンで計算できます。</div></div>
  ${view.lines.map((l, i) => `<div class="ln"><input placeholder="品名" value="${esc(l.item)}" oninput="view.lines[${i}].item=this.value">
    <div class="g" style="margin-top:6px"><input type="number" inputmode="decimal" placeholder="数量" value="${esc(l.qty)}" oninput="view.lines[${i}].qty=this.value;upd()"><input placeholder="単位" value="${esc(l.unit)}" oninput="view.lines[${i}].unit=this.value"><input type="text" inputmode="decimal" placeholder="単価" value="${esc(fmtNum(l.price))}" oninput="numIn(this,event);view.lines[${i}].price=rawNum(this.value);upd()" oncompositionend="numIn(this);view.lines[${i}].price=rawNum(this.value);upd()" onchange="numIn(this);view.lines[${i}].price=rawNum(this.value);upd()"></div>
    <div class="g" style="margin-top:6px;grid-template-columns:1fr 2fr"><input type="text" inputmode="decimal" placeholder="原価(単価)" value="${esc(fmtNum(l.cost))}" oninput="numIn(this,event);view.lines[${i}].cost=rawNum(this.value);upd()" oncompositionend="numIn(this);view.lines[${i}].cost=rawNum(this.value);upd()" onchange="numIn(this);view.lines[${i}].cost=rawNum(this.value);upd()">
      <select onchange="pickCost(${i},this.value)"><option value="">仕入先の回答から原価を入れる</option>${DB.requests.filter(r => r.projectId === q.projectId && r.amount !== '' && r.amount != null && !reqLinesOf(r.id).some(l => l.price !== '')).map(r => `<option value="${esc(r.amount)}">${esc(r.vendor)} ¥${yen(r.amount)}（合計）</option>`).join('')}${DB.requests.filter(r => r.projectId === q.projectId).map(r => reqLinesOf(r.id).filter(l => l.price !== '').map(l => `<option value="u${l.price}">${esc(r.vendor)}：${esc(l.item)} @¥${yen(l.price)}</option>`).join('')).join('')}</select></div>
    <div class="row" style="margin-top:6px"><input class="sp" placeholder="備考" value="${esc(l.note)}" oninput="view.lines[${i}].note=this.value"><button onclick="applyMarkup(${i})">率で単価</button><button class="dng" onclick="delLine(${i})">削除</button></div></div>`).join('')}
  <button onclick="addLine()">＋行を追加</button>
  <div class="card tot" id="tot" style="margin-top:12px"></div>
  <label>備考</label><textarea oninput="view.q.note=this.value">${esc(q.note)}</textarea>
  <div class="row" style="margin-top:14px"><button class="pri" onclick="saveQuote()">保存</button>${q.id ? '<button class="dng" onclick="delQuote()">削除</button>' : ''}</div>`;
};
function addDays(d, n){ const t = new Date((d || today()) + 'T00:00:00'); t.setDate(t.getDate() + n); return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function setValid(n){ view.q.validUntil = addDays(view.q.issueDate, n); $('#vu').value = view.q.validUntil; }
function addLine(){ view.lines.push(newLine()); render(); setTimeout(upd, 0); }
function delLine(i){ view.lines.splice(i, 1); if (!view.lines.length) view.lines.push(newLine()); render(); setTimeout(upd, 0); }
async function saveQuote(){
  if (!view.lines.some(l => String(l.item).trim())) return alert('明細を入力してください');
  const pid = view.q.projectId;
  await run('saveQuote', view.q, view.lines);
  await reload0(); go('project', {id: pid});
}
async function delQuote(){
  if (!confirm('この見積書を削除しますか？')) return;
  const pid = view.q.projectId; await run('remove', 'quotes', view.q.id); await reload0(); go('project', {id: pid});
}
setTimeout(() => { const o = new MutationObserver(() => { if (view.n === 'quote') upd(); }); o.observe(document.getElementById('app'), {childList: true}); }, 0);

// ---------- 出力 ----------
function dlBlob(name, blob){
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
async function expPdf(id){ viewDoc(await run('makePdf', id)); }
async function expReqPdf(id){ viewDoc(await run('makeRequestPdf', id)); }
async function expCsv(id){
  const r = await run('makeCsv', [id]); if (r.warn) alert(r.warn);
  // スマイルワークスはShift_JISの文字コードを使うため、ここで変換してから保存する
  const sjis = Encoding.convert(Encoding.stringToCode(r.text), {to: 'SJIS', from: 'UNICODE'});
  dlBlob(r.name, new Blob([new Uint8Array(sjis)], {type: 'text/csv'}));
}
async function expXlsx(id){
  const b = await run('getQuoteBundle', id);
  const co = DB.company || {};
  const aoa = [['御見積書'], [co.name || ''], [co.address || ''], [[co.tel ? 'TEL ' + co.tel : '', co.fax ? 'FAX ' + co.fax : ''].filter(Boolean).join('　')], [co.regNo ? '登録番号: ' + co.regNo : ''], ['宛先', (b.c.name || '') + ' 御中'], ['件名', b.q.subject], ['見積番号', b.q.no], ['発行日', b.q.issueDate], ['有効期限', b.q.validUntil], [],
    ['品名', '数量', '単位', '単価', '金額', '備考']]
    .concat(b.lines.map(l => [l.item, l.qty, l.unit, l.price, l.amount, l.note]))
    .concat([[], ['', '', '', '小計', b.q.subtotal], ['', '', '', '消費税(' + b.q.taxRate + '%)', b.q.tax], ['', '', '', '合計', b.q.total], [], ['備考', b.q.note]].concat(co.bank ? [['お振込先', co.bank]] : []).concat(co.note ? [['', co.note]] : []));
  const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = [{wch:34},{wch:8},{wch:8},{wch:12},{wch:14},{wch:24}];
  Object.keys(ws).forEach(a => { if (a[0] !== '!' && ws[a].t === 'n' && a[0] !== 'B') ws[a].z = '#,##0'; });
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '見積書');
  XLSX.writeFile(wb, '見積書_' + b.q.no + '.xlsx');
}

reload();
