// Cloudflare Access のログイン確認。ACCESS_TEAM_DOMAIN と ACCESS_AUD が設定されているときだけ検証する。
// 未設定のまま公開すると全員が使えてしまうため、未設定のときは(開発用の ALLOW_NO_AUTH=1 がない限り)すべて拒否する
function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
let jwksCache = { at: 0, keys: null };

export async function verifyAccess(request, env, fetchImpl = fetch) {
  const team = env.ACCESS_TEAM_DOMAIN, aud = env.ACCESS_AUD;
  if ((!team || !aud) && env.APP_PASSWORD) return verifySession(request, env);
  if (!team || !aud) {
    // ログイン保護が未設定のまま公開してしまわないよう、開発用の印(ALLOW_NO_AUTH)がない限り拒否する
    if (env.ALLOW_NO_AUTH === '1') return { ok: true, email: 'dev@localhost', unchecked: true };
    return { ok: false, error: 'ログイン（合言葉）がまだ設定されていません。管理者に連絡してください。' };
  }
  const jwt = request.headers.get('cf-access-jwt-assertion');
  if (!jwt) return { ok: false, error: 'ログインが必要です' };
  const parts = jwt.split('.');
  if (parts.length !== 3) return { ok: false, error: 'ログイン情報が不正です' };
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
    if (header.alg !== 'RS256') return { ok: false, error: 'ログイン情報が不正です' };
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return { ok: false, error: 'ログインの有効期限が切れました。ページを開き直してください' };
    if (payload.nbf && payload.nbf > now + 60) return { ok: false, error: 'ログイン情報が不正です' };
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(aud)) return { ok: false, error: 'ログイン情報が不正です' };
    if (payload.iss !== 'https://' + team) return { ok: false, error: 'ログイン情報が不正です' };
    if (!jwksCache.keys || Date.now() - jwksCache.at > 3600 * 1000) {
      const r = await fetchImpl('https://' + team + '/cdn-cgi/access/certs');
      if (!r.ok) return { ok: false, error: 'ログインの確認に失敗しました' };
      jwksCache = { at: Date.now(), keys: (await r.json()).keys || [] };
    }
    const jwk = jwksCache.keys.find(k => k.kid === header.kid);
    if (!jwk) { jwksCache.at = 0; return { ok: false, error: 'ログイン情報が不正です' }; }
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const good = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!good) return { ok: false, error: 'ログイン情報が不正です' };
    return { ok: true, email: payload.email || '' };
  } catch (e) {
    return { ok: false, error: 'ログインの確認に失敗しました' };
  }
}
export function _resetJwksCache() { jwksCache = { at: 0, keys: null }; }

// ===== 合言葉ログイン(Cloudflare Access を使わない方式) =====
// 秘密の APP_PASSWORD が設定されているとき有効。ログイン成功で署名付きクッキー(30日)を発行する
const enc = new TextEncoder();
const SESSION_DAYS = 30;
function bytesToB64url(u8) { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
async function hmac(env, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode('mitsumori-session:' + env.APP_PASSWORD), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToB64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text))));
}
function safeEq(a, b) { // 長さに依らず一定時間で比較
  const x = enc.encode(a), y = enc.encode(b); let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}
function getCookie(request, name) {
  const m = (request.headers.get('cookie') || '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return m ? m.slice(name.length + 1) : '';
}
export async function verifySession(request, env) {
  const v = getCookie(request, 'sess');
  const parts = v.split('.');
  if (parts.length !== 2) return { ok: false, login: true, error: 'ログインが必要です' };
  let payload;
  try { payload = new TextDecoder().decode(b64urlToBytes(parts[0])); } catch (e) { return { ok: false, login: true, error: 'ログインが必要です' }; }
  if (!safeEq(await hmac(env, parts[0]), parts[1])) return { ok: false, login: true, error: 'ログインが必要です' };
  const i = payload.indexOf('|'), exp = Number(payload.slice(0, i));
  if (!(exp > Date.now())) return { ok: false, login: true, error: 'ログインの有効期限が切れました' };
  return { ok: true, email: payload.slice(i + 1) };
}
export async function login(env, name, password) {
  if (!env.APP_PASSWORD) return null;
  await new Promise(r => setTimeout(r, 800)); // 総当たり対策の待ち
  if (!safeEq(String(password || ''), env.APP_PASSWORD)) return null;
  const who = String(name || '').trim().slice(0, 30) || '利用者';
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const b = bytesToB64url(enc.encode(exp + '|' + who));
  return 'sess=' + b + '.' + await hmac(env, b) + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + SESSION_DAYS * 86400;
}
