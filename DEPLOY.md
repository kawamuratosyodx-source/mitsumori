<!-- v2.10.2 (2026-10-05) -->
# 業務管理アプリ（Cloudflare版）公開の手順

所要時間の目安: 30〜40分（初回のみ）。Macのターミナルで行います。
**パスワードやAPIキーは、チャットやメールに書かないでください。**

## 0. 準備

1. Cloudflareの無料アカウントを作ります（https://dash.cloudflare.com/sign-up）。
2. Node.js（LTS版）をインストールします（https://nodejs.org）。
3. このフォルダ（`mitsumori-cf`）を、ターミナルで開きます。
   例: `cd ~/Downloads/mitsumori-cf`

## 1. 部品のインストールとログイン

```
npm install
npx wrangler login
```
ブラウザが開くので、Cloudflareで「許可」を押します。

## 2. データベース（D1）を作る

```
npx wrangler d1 create mitsumori-db
```
表示される `database_id = "…"` の値を、`wrangler.toml` の `database_id` に貼り付けて保存します。

続けて、表を作ります。
```
npx wrangler d1 execute mitsumori-db --remote --file=schema.sql
```

## 3. 写真・PDFの保存先について

写真・PDFは、手順2で作ったデータベース（D1）の中に保存します。**R2は使わないので、クレジットカードの登録も不要です。**

- 無料枠では、データベース全体で500MBまでです（写真は1枚あたり数百KB。数千枚が目安です）。
- 1つのPDFは8MBまでです。
- 容量が足りなくなったら、Cloudflareのダッシュボード（「ストレージとデータベース」→「D1」→ mitsumori-db）で使用量を確認できます。不要な写真は、アプリの画面から削除してください。

> すでに手順2の表の作成を済ませている場合も、もう一度 `npx wrangler d1 execute mitsumori-db --remote --file=schema.sql` を実行してください（写真・PDF用の表が追加されます。すでにある表やデータは変わりません）。

## 4. 公開する

```
npx wrangler deploy
```
最後に `https://mitsumori.○○○.workers.dev` というアドレスが表示されます（これが利用者に渡すアドレスです）。

> この時点では、アプリを開いても「ログイン保護が設定されていません」と表示されて使えません。これは、設定前に誰でもデータを見られる状態になるのを防ぐための仕様です。次の手順5（合言葉の設定）で使えるようになります。

## 5. ログイン（合言葉）を設定する【必須・カード登録不要】

Cloudflare Access（Zero Trust）はカード登録が必要なため、このアプリには**合言葉ログイン**を内蔵しています。無料で、カード登録は一切不要です。

1. 合言葉を決めます（12文字以上の、推測されにくいもの。例: 単語を3つ並べるなど）。
2. ターミナルで次を実行し、聞かれたら合言葉を入力します（画面には表示されません）。
   ```
   npx wrangler secret put APP_PASSWORD
   ```
3. 公開し直します（秘密の登録後、通常は自動で反映されますが念のため）。
   ```
   npx wrangler deploy
   ```
4. アプリのアドレスを開くと「ログイン」画面が出ます。**お名前**（誰が使ったかの目印。自由入力）と**合言葉**を入れると使えます。一度ログインすると30日間はそのまま使えます。
5. 合言葉を変えると、全員が自動的にログアウトされます（手順2をやり直すだけ）。退職者が出たときなどに変更してください。

> 合言葉は5人で共有する1つです。外部に漏れないよう、LINEのグループなど不特定多数が見られる場所には書かないでください。
> （Cloudflare Access を使う場合は、wrangler.toml の ACCESS_TEAM_DOMAIN / ACCESS_AUD を設定すれば、そちらが優先されます。）

※画面の表記は、Cloudflare側の更新で変わることがあります。

## 6. 手書きメモの文字起こし（Gemini）を使う場合

Google AI Studio（https://aistudio.google.com）でAPIキーを作り、次を実行します。キーはその場で貼り付けて入力します（どこにも書き残さないでください）。
```
npx wrangler secret put GEMINI_API_KEY
```
設定しないと、文字起こしのボタンは「設定がまだ行われていません」と案内します（その他の機能は使えます）。
※Google版にあった「Googleの標準の文字認識」への切り替えは、この版にはありません。

## 7. データの入れ方

- 顧客: アプリの「マスタ」→「顧客」→「スマイルワークス取込」から、得意先マスタのCSVを取り込みます。
- Google版（Apps Script）で登録済みの案件・見積・メモは、自動では移りません。本格運用前なら、新しく登録し直してください。移す必要があるときはお知らせください。

## 8. 更新・バックアップ

- プログラムを更新するとき: ファイルを差し替えて `npx wrangler deploy`。
- バックアップ（月に1回の目安）:
  ```
  npx wrangler d1 export mitsumori-db --remote --output=backup.sql
  ```
  写真・PDFもデータベースの中にあるので、このバックアップに含まれます。

## 9. 自社情報の変更

会社名・住所・電話番号は `src/config.js` の `CONFIG.company` です。書き換えて `npx wrangler deploy` で反映されます。

## 10. 動作確認のしかた（パソコン上）

`.dev.vars` に `ALLOW_NO_AUTH=1` を書いておくと、ログインなしで試せます。
```
npx wrangler d1 execute mitsumori-db --local --file=schema.sql
npx wrangler dev
```
`http://localhost:8787` を開きます。**この `.dev.vars` は公開用の設定には含めないでください（Cloudflareには送られません）。**
