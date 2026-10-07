// 業務管理 河村図書教材社  v2.10.10  (2026-10-07)
import { CONFIG } from './config.js';

export const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
export const yen = n => Number(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const BASE_CSS =
  '@page{size:A4;margin:14mm}' +
  '*{box-sizing:border-box}' +
  'body{font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","Meiryo","Noto Sans JP",sans-serif;font-size:11pt;color:#111;margin:0;padding:0}' +
  'h1{text-align:center;letter-spacing:.5em;font-size:20pt;margin:0 0 12px}' +
  'table{border-collapse:collapse;width:100%}th,td{border:1px solid #666;padding:5px 6px}th{background:#eee}.r{text-align:right}' +
  '.meta td{border:none;padding:2px 0;vertical-align:top}.meta td.r{white-space:nowrap}.co{text-align:right;margin:8px 0 4px;font-size:9.5pt;white-space:nowrap}.tot td{font-weight:bold}' +
  '.page{padding:0}@media screen{body{background:#fff}.page{max-width:190mm;margin:0 auto;padding:10mm}}';

const wrap = (title, body) => '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + BASE_CSS + '</style></head><body><div class="page">' + body + '</div></body></html>';
const company = co => {
  co = co || CONFIG.company;
  const tf = [co.tel ? 'TEL ' + co.tel : '', co.fax ? 'FAX ' + co.fax : ''].filter(Boolean).join('　');
  return '<div class="co"><b>' + esc(co.name) + '</b>' + (co.address ? '<br>' + esc(co.address) : '') + (tf ? '<br>' + esc(tf) : '') +
    (co.email ? '<br>' + esc(co.email) : '') + (co.regNo ? '<br>登録番号: ' + esc(co.regNo) : '') + '</div>';
};
const footer = co => (co && co.bank ? '<p style="font-size:10pt">お振込先: ' + esc(co.bank).replace(/\n/g, '<br>') + '</p>' : '') + (co && co.note ? '<p style="font-size:10pt">' + esc(co.note).replace(/\n/g, '<br>') + '</p>' : '');

export function quoteHtml(b, co) {
  const rows = b.lines.map(l => '<tr><td>' + esc(l.item) + '</td><td class="r">' + esc(l.qty) + ' ' + esc(l.unit) + '</td><td class="r">' + yen(l.price) + '</td><td class="r">' + yen(l.amount) + '</td><td>' + esc(l.note) + '</td></tr>').join('');
  const body =
    '<h1>御 見 積 書</h1>' +
    '<table class="meta"><tr><td style="width:60%"><b style="font-size:14pt">' + esc(b.c.name) + ' 御中</b><br>件名: ' + esc(b.q.subject || b.p.name) + '</td>' +
    '<td class="r">見積番号: ' + esc(b.q.no) + '<br>見積書発行日: ' + esc(b.q.issueDate) + '<br>有効期限: ' + esc(b.q.validUntil) + '</td></tr></table>' +
    company(co) +
    '<p style="font-size:14pt">御見積金額 <b>¥' + yen(b.q.total) + '-</b> (税込)</p>' +
    '<table><tr><th>品名</th><th style="width:14%">数量</th><th style="width:15%">単価</th><th style="width:16%">金額</th><th style="width:20%">備考</th></tr>' + rows +
    '<tr class="tot"><td colspan="3" class="r">小計</td><td class="r">' + yen(b.q.subtotal) + '</td><td></td></tr>' +
    '<tr class="tot"><td colspan="3" class="r">消費税 (' + esc(b.q.taxRate) + '%)</td><td class="r">' + yen(b.q.tax) + '</td><td></td></tr>' +
    '<tr class="tot"><td colspan="3" class="r">合計</td><td class="r">' + yen(b.q.total) + '</td><td></td></tr></table>' +
    '<p>備考: ' + esc(b.q.note).replace(/\n/g, '<br>') + '</p>' + footer(co);
  return wrap('見積書 ' + b.q.no, body);
}

export function requestHtml(r, p, v, co, lines) {
  lines = Array.isArray(lines) ? lines : [];
  const lt = lines.length ? '<table style="margin:10px 0"><tr><th style="width:7%">No</th><th>品名</th><th style="width:13%">数量</th><th style="width:11%">単位</th><th style="width:24%">備考</th><th style="width:17%">御見積単価</th></tr>' + lines.map(l => '<tr><td class="r">' + esc(l.row) + '</td><td>' + esc(l.item) + '</td><td class="r">' + esc(l.qty) + '</td><td>' + esc(l.unit) + '</td><td>' + esc(l.note) + '</td><td></td></tr>').join('') + '</table>' : '';
  const body =
    '<h1>見 積 依 頼 書</h1>' +
    '<p class="r">依頼日: ' + esc(r.requestedOn) + '</p>' +
    '<p style="font-size:14pt"><b>' + esc(r.vendor) + ' 御中</b>' + (v && v.contact ? '<br><span style="font-size:11pt">' + esc(v.contact) + ' 様</span>' : '') + '</p>' +
    company(co) +
    '<p>下記の件につきまして、御見積をお願い申し上げます。</p>' +
    '<table><tr><th style="width:22%;text-align:left">件名</th><td>' + esc(p.name) + '</td></tr>' +
    '<tr><th style="text-align:left">回答期限</th><td>' + esc(r.dueOn) + '</td></tr>' +
    '<tr><th style="text-align:left">依頼内容</th><td style="height:' + (lines.length ? '90px' : '260px') + ';vertical-align:top">' + esc(r.detail).replace(/\n/g, '<br>') + '</td></tr></table>' + lt +
    '<p>ご多忙のところ恐れ入りますが、よろしくお願い申し上げます。</p>';
  return wrap('見積依頼書 ' + r.vendor, body);
}
