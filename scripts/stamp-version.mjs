// バージョンを全ファイルに反映する: node scripts/stamp-version.mjs 2.1.0
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const rd = f => readFileSync(new URL(f, root), 'utf8');
const wr = (f, s) => writeFileSync(new URL(f, root), s);
const pkg = JSON.parse(rd('package.json'));
const ver = process.argv[2] || pkg.version;
const date = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

pkg.version = ver; wr('package.json', JSON.stringify(pkg, null, 2) + '\n');
wr('public/version.json', JSON.stringify({ version: ver, date: date }, null, 2) + '\n');

// 画面の見出しのバージョンと、app.js の読み込みURL(更新時に古い版がキャッシュされないようにする)
let h = rd('public/index.html');
h = h.replace(/<span class="ver">[^<]*<\/span>/, '<span class="ver">v' + ver + '</span>').replace(/<script src="\/app\.js[^"]*" defer>/, '<script src="/app.js?v=' + ver + '" defer>');
wr('public/index.html', h);

// 各ファイルの先頭にバージョンの印を付ける(何度実行しても1行だけ)
const stamp = '// 業務管理 河村図書教材社  v' + ver + '  (' + date + ')\n';
for (const f of ['public/app.js', 'src/index.js', 'src/auth.js', 'src/pdf.js', 'src/config.js']) {
  let s = rd(f).replace(/^\/\/ 業務管理 河村図書教材社  v[^\n]*\n/, '');
  wr(f, stamp + s);
}
let w = rd('wrangler.toml').replace(/^# 業務管理 河村図書教材社  v[^\n]*\n/, '');
wr('wrangler.toml', '# 業務管理 河村図書教材社  v' + ver + '  (' + date + ')\n' + w);
let d = rd('DEPLOY.md').replace(/^<!-- v[^>]*-->\n/, '');
wr('DEPLOY.md', '<!-- v' + ver + ' (' + date + ') -->\n' + d);
console.log('version', ver, date);
