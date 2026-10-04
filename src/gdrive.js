// Googleドライブ連携(写真・PDFをドライブに保存する)
// Google Cloudは使わない。管理者が自分のGoogleアカウントに小さなスクリプト(Apps Script)を置き、
// このアプリはその「受付口」に、合言葉(キー)つきでファイルを渡す。ドライブ側の権限は、そのスクリプトだけが持つ。
export const driveConfigured = env => !!(env.DRIVE_GAS_URL && env.DRIVE_GAS_KEY);
export const isDriveRef = chunks => String(chunks || '').startsWith('drive:');
export const driveId = chunks => String(chunks).slice(6);

async function call(env, payload) {
  const r = await fetch(env.DRIVE_GAS_URL, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, redirect: 'follow',
    body: JSON.stringify(Object.assign({ key: env.DRIVE_GAS_KEY }, payload)) });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) { /* 下で処理 */ }
  if (!r.ok || !j) throw new Error('Googleドライブの受付口から正しい返事がありません');
  if (!j.ok) throw new Error('Googleドライブの受付口が断りました（' + String(j.error || '') + '）');
  return j;
}
export async function drivePing(env) { return call(env, { action: 'ping' }); }
export async function driveUpload(env, name, ctype, b64) { return (await call(env, { action: 'put', name: name, ctype: ctype, data: b64 })).id; }
export async function driveGet(env, gid) {
  const j = await call(env, { action: 'get', id: gid });
  const bin = atob(j.data), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
export async function driveDelete(env, gid) { await call(env, { action: 'del', id: gid }); return true; }
