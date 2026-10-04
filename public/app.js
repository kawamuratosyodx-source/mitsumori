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
const HASHV = {menu: 1, memos: 1, home: 1, sales: 1, report: 1, customers: 1, vendors: 1, salesimport: 1, company: 1, salestax: 1};
let view = {n: HASHV[location.hash.slice(1)] ? location.hash.slice(1) : 'menu'};
const TABS = [['memos', '📝 メモ帳'], ['home', '📄 見積管理'], ['sales', '💴 売上データ検索']];
function tabOf(n){ return n === 'memos' ? 'memos' : (n === 'sales' || n === 'salestax') ? 'sales' : (n === 'menu' || n === 'customers' || n === 'vendors' || n === 'salesimport' || n === 'company') ? '' : 'home'; }
function tbHtml(){
  const cur = tabOf(view.n);
  return TABS.map(t => `<div data-sec="${t[0]}" class="tg${t[0] === cur ? ' on' : ''}"><a href="#${t[0]}" onclick="return tbGo(event,'${t[0]}')">${t[1]}</a><a class="x" href="#${t[0]}" target="_blank" rel="noopener" title="別のタブで開く">↗</a></div>`).join('');
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
function render(){ if (!AUTH) return showLogin(); document.body.classList.remove('noauth'); { const co = document.querySelector('header .co'); if (co && DB.company && DB.company.name) co.textContent = DB.company.name; } document.body.dataset.sec = tabOf(view.n) || (view.n === 'customers' || view.n === 'vendors' || view.n === 'salesimport' || view.n === 'company' ? 'master' : 'menu'); $('#tb').innerHTML = tbHtml(); $('#app').innerHTML = V[view.n](); if (view.n === 'project') loadThumbs(); }
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
  const list = DB.projects.filter(p => { const h = hay(p); return words.every(w => h.includes(w)); })
    .sort((a, b) => String(b.created).localeCompare(String(a.created)));
  return list.map(p => {
    const nq = DB.quotes.filter(q => q.projectId === p.id).length;
    const nr = DB.requests.filter(r => r.projectId === p.id).length;
    return `<div class="card click" onclick="go('project',{id:'${p.id}'})"><div class="row"><b class="sp">${esc(p.name)}</b><span class="badge">${esc(p.status || '進行中')}</span></div>
    <div class="mute">${esc(cust(p.customerId).name || '(顧客未設定)')}　見積 ${nq}件 / 仕入先 ${nr}件${(() => { const S = projSummary(p.id); return S && S.pf.n ? '　粗利 ¥' + yen(S.pf.profit) + '（' + pct(S.pf.profit, S.pf.rev) + '）' : ''; })()}</div></div>`;
  }).join('') || '<p class="mute">該当する案件がありません</p>';
}
function search(v){ view.q = v; $('#list').innerHTML = listHtml(); }
V.menu = () => {
  const open = DB.memos.filter(m => m.status !== '完了').length;
  return `<div class="tiles">
  <div class="card click tile" data-sec="memos" onclick="go('memos')"><span class="ic">📝</span><b>メモ帳</b><div class="mute">問い合わせ・注文・連絡事項</div>${open ? `<div><span class="badge" style="background:#fde8e8;color:#b42318">未完了 ${open}件</span></div>` : ''}</div>
  <div class="card click tile" data-sec="home" onclick="go('home')"><span class="ic">📄</span><b>見積管理</b><div class="mute">見積・案件・仕入先・集計</div><div class="mute">案件 ${DB.projects.length}件</div></div>
  <div class="card click tile" data-sec="sales" onclick="go('sales')"><span class="ic">💴</span><b>売上データ検索</b><div class="mute">売上CSVを取り込んで検索</div></div></div>
  <h2><span>マスタ</span></h2><div class="row"><button class="mbtn" onclick="go('customers')">顧客</button><button class="mbtn" onclick="go('vendors')">仕入先</button><button class="mbtn" onclick="go('salesimport')">売上データ取込</button><button class="mbtn" onclick="go('company')">会社情報</button></div>`;
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
V.company = () => {
  const c = DB.company || {};
  const F = [['name', '会社名', 'text'], ['address', '住所（〒を含めて入力）', 'text'], ['tel', '電話番号（例: 0532-39-5311）', 'text'], ['fax', 'FAX番号（例: 0532-39-5312）', 'text'],
    ['email', 'メールアドレス', 'text'], ['regNo', 'インボイス登録番号（例: T1234567890123）', 'text'],
    ['bank', '振込先（見積書の下部に載せます）', 'area'], ['note', '見積書の下部に載せる文（支払条件・納期の目安など）', 'area']];
  return `<div class="bar"><button onclick="go('menu')">← メニュー</button></div>
  <h2><span>🏢 会社情報</span></h2>
  <div class="card"><div class="mute" style="margin-bottom:4px">見積書・見積依頼書・Excelに載る、自社の情報です。空欄の項目は載りません。</div>
  ${F.map(f => `<label>${f[1]}</label>` + (f[2] === 'area' ? `<textarea id="co_${f[0]}" rows="3">${esc(c[f[0]])}</textarea>` : `<input id="co_${f[0]}" value="${esc(c[f[0]])}">`)).join('')}
  <div class="row" style="margin-top:14px"><button class="pri" onclick="saveCompany()">保存</button></div></div>
  <div class="card"><b>見積書での載り方（見本）</b><div style="text-align:right;font-size:13px;margin-top:6px">${coPreview(c)}</div></div>`;
};
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
  view.off = 0; clearTimeout(salesTimer); salesTimer = setTimeout(doSales, now ? 0 : 350);
}
async function doSales(){
  if (!view.b) return;
  const my = ++salesSeq;
  const r = await run('salesSearch', view.b, view.sq || '', view.off || 0, {dcol: view.dcol, from: view.from, to: view.to, scol: view.scol});
  if (my !== salesSeq) return;
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
V.home = () => `<div class="bar"><button onclick="go('menu')">← メニュー</button><button onclick="go('report')">📊 集計</button><input id="q" placeholder="案件を検索（顧客・見積・品名・仕入先）" value="${esc(view.q)}" oninput="search(this.value)"><button class="pri" onclick="editProject()">＋案件</button></div><div id="list">${listHtml()}</div>`;

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
let backView = null;
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
  const saved = await run('save', c.table, o);
  await reload0();
  if (c.after) c.after(saved); else history_back();
}
async function delForm(){
  if (!confirm('削除しますか？')) return;
  try { await run('remove', view.cfg.table, view.cfg.vals[view.cfg.idKey || 'id']); } catch (e) { return; }
  await reload0();
  if (view.cfg.afterDelete) view.cfg.afterDelete(); else go('home');
}
async function reload0(){ DB = await run('getAll'); AUTH = true; }

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
    <div class="mute">${esc(c.name || '')} ${esc(m.who)}　${esc(stamp(m).slice(0, 16))}</div>
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
    extra: (id ? `<div class="row" style="margin-top:10px">${vals.projectId ? `<button onclick="go('project',{id:'${vals.projectId}'})">📄 関連する案件を開く</button>` : `<button onclick="memoToProject('${id}')">📄 このメモから案件を作る</button>`}</div>` : '') + `<div class="row" style="margin-top:10px"><label class="fb">✍ 手書きを撮影して文字起こし<input type="file" accept="image/*" capture="environment" style="display:none" onchange="ocrMemo(this)"></label><label class="fb">🖼 写真から文字起こし<input type="file" accept="image/*" style="display:none" onchange="ocrMemo(this)"></label></div><div class="mute" style="margin-top:4px">文字起こしは内容の欄の末尾に追加されます。手書きは誤読があるため、数字・電話番号・名前は必ず確認してください。</div>`,
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
  ${qs.map(q => `<div class="card"><div class="row"><b class="sp">${esc(q.no)}</b><span class="badge" style="background:${{'受注':'#e6f4ea','失注':'#fde8e8'}[q.result] || '#eee'};color:#333">${esc(q.result || '未定')}</span><b>¥${yen(q.total)}</b></div><div class="mute">${esc(q.subject)}　発行日 ${esc(q.issueDate)}</div>${(() => { const pf = profitOf(DB.lines.filter(l => l.quoteId === q.id)); return pf.n ? `<div class="mute">粗利 ¥${yen(pf.profit)}（${pct(pf.profit, pf.rev)}）</div>` : ''; })()}
    <div class="row" style="margin-top:8px"><button onclick="editQuote('${q.id}')">編集</button><button onclick="dupQuote('${q.id}')">複製</button><button onclick="expPdf('${q.id}')">PDF</button><button onclick="expXlsx('${q.id}')">Excel</button><button onclick="expCsv('${q.id}')">CSV</button></div></div>`).join('') || '<p class="mute">見積書はまだありません</p>'}
  ${compareHtml(rs)}
  ${memosOf(p.id)}
  <h2><span>仕入先（回答）</span><button class="pri" onclick="editRequest('${p.id}')">＋仕入先</button></h2>
  ${rs.map(r => `<div class="card"><div class="row"><b class="sp">${esc(r.vendor)}</b><span class="badge">${esc(r.status)}</span></div>
    <div class="mute">依頼 ${esc(r.requestedOn)} / 期限 ${esc(r.dueOn)} / 回答 ${esc(r.answeredOn) || '未'}${r.amount !== '' && r.amount != null ? ' / ¥' + yen(r.amount) : ''}</div>
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
function editRequest(pid, id){
  const vals = id ? Object.assign({}, DB.requests.find(r => r.id === id)) : {projectId: pid, requestedOn: today(), status: '依頼中'};
  if (DB.vendors.some(v => v.name === vals.vendor)) vals.vendorPick = vals.vendor;
  openForm({title: id ? '仕入先の編集' : '仕入先の追加', table: 'requests', vals: vals, required: 'vendor',
    fields: [].concat(DB.vendors.length ? [{k:'vendorPick',l:'仕入先マスタから選択',t:'select',o:[['','（選ばず直接入力する）']].concat(DB.vendors.map(v => [v.name, v.name]))}] : [],
      [{k:'vendor',l:'仕入先名（マスタから選ばない場合に入力）'},{k:'requestedOn',l:'依頼日',t:'date'},{k:'dueOn',l:'回答期限',t:'date'},{k:'answeredOn',l:'回答日',t:'date'},
      {k:'amount',l:'回答金額（円）',t:'money'},{k:'status',l:'状態',t:'select',o:['依頼中','回答あり','辞退','採用'].map(x => [x, x])},
      {k:'detail',l:'依頼内容（見積依頼書に印字されます）',t:'textarea'},{k:'memo',l:'社内メモ（依頼書には載りません）',t:'textarea'}]),
    onDelete: !!id, afterDelete: () => go('project', {id: pid}), after: () => go('project', {id: pid})});
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
  l.cost = Math.round(Number(v) / qty); render();
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
  <div class="card"><b>${esc(cust(p.customerId).name)} / ${esc(p.name)}</b>
  <label>件名</label><input value="${esc(q.subject)}" oninput="view.q.subject=this.value">
  <div class="g" style="grid-template-columns:1fr 1fr"><div><label>見積書発行日</label><input type="date" value="${esc(q.issueDate)}" oninput="view.q.issueDate=this.value"></div>
  <div><label>有効期限</label><input id="vu" type="date" value="${esc(q.validUntil)}" oninput="view.q.validUntil=this.value"></div></div>
  <div class="row" style="margin-top:6px"><span class="mute">有効期限:</span><button onclick="setValid(30)">発行日から30日</button><button onclick="setValid(60)">60日</button><button onclick="setValid(90)">90日</button></div>
  <label>結果（受注・失注）</label><select onchange="view.q.result=this.value;if(this.value!=='未定'&&!view.q.resultOn)view.q.resultOn=today();if(this.value==='未定')view.q.resultOn=''">${['未定','受注','失注'].map(x => `<option ${(q.result || '未定') === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
  <label>消費税率（%）</label><select onchange="view.q.taxRate=this.value;upd()">${[10,8,0].map(r => `<option ${Number(q.taxRate) === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
  <h2><span>明細</span></h2>
  <div class="card" style="background:#f8fafc"><b>仕入金額から見積金額を計算</b>
    <div class="g" style="grid-template-columns:1fr 1fr;margin-top:6px"><div><label>計算方法</label><select onchange="mk.method=this.value"><option value="markup" ${mk.method === 'markup' ? 'selected' : ''}>原価に○%上乗せ（掛け率）</option><option value="gross" ${mk.method === 'gross' ? 'selected' : ''}>粗利率○%になる価格</option></select></div>
    <div><label>率（%）</label><input type="text" inputmode="decimal" value="${esc(mk.rate)}" oninput="mk.rate=this.value"></div>
    <div><label>端数の単位</label><select onchange="mk.unit=this.value">${[1, 10, 100, 1000].map(u => `<option value="${u}" ${Number(mk.unit) === u ? 'selected' : ''}>${u}円</option>`).join('')}</select></div>
    <div><label>端数処理</label><select onchange="mk.round=this.value">${[['ceil', '切り上げ'], ['round', '四捨五入'], ['floor', '切り捨て']].map(o => `<option value="${o[0]}" ${mk.round === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div></div>
    <div class="row" style="margin-top:8px"><button class="pri" onclick="applyMarkup()">原価が入った全行の単価を計算</button></div>
    <div class="mute" style="margin-top:4px">各行の「原価(単価)」から販売単価を計算して入れます。上乗せ: 原価×(1+率) ／ 粗利率: 原価÷(1−率)。行ごとにも「率で単価」ボタンで計算できます。</div></div>
  ${view.lines.map((l, i) => `<div class="ln"><input placeholder="品名" value="${esc(l.item)}" oninput="view.lines[${i}].item=this.value">
    <div class="g" style="margin-top:6px"><input type="number" inputmode="decimal" placeholder="数量" value="${esc(l.qty)}" oninput="view.lines[${i}].qty=this.value;upd()"><input placeholder="単位" value="${esc(l.unit)}" oninput="view.lines[${i}].unit=this.value"><input type="text" inputmode="decimal" placeholder="単価" value="${esc(fmtNum(l.price))}" oninput="numIn(this,event);view.lines[${i}].price=rawNum(this.value);upd()" oncompositionend="numIn(this);view.lines[${i}].price=rawNum(this.value);upd()" onchange="numIn(this);view.lines[${i}].price=rawNum(this.value);upd()"></div>
    <div class="g" style="margin-top:6px;grid-template-columns:1fr 2fr"><input type="text" inputmode="decimal" placeholder="原価(単価)" value="${esc(fmtNum(l.cost))}" oninput="numIn(this,event);view.lines[${i}].cost=rawNum(this.value);upd()" oncompositionend="numIn(this);view.lines[${i}].cost=rawNum(this.value);upd()" onchange="numIn(this);view.lines[${i}].cost=rawNum(this.value);upd()">
      <select onchange="pickCost(${i},this.value)"><option value="">仕入先の回答から原価を入れる</option>${DB.requests.filter(r => r.projectId === q.projectId && r.amount !== '' && r.amount != null).map(r => `<option value="${esc(r.amount)}">${esc(r.vendor)} ¥${yen(r.amount)}</option>`).join('')}</select></div>
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
