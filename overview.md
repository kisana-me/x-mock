# x-mock

サービス終了した [得句巣](https://github.com/kisana-me/x) を、静的コンテンツとして
一般公開するためのモックです。Cloudflare Workers の静的アセットとして配信し、
Worker スクリプトを持たないためリクエスト数の枠を消費しません。

HTML / CSS は得句巣本体の ERB とスタイルシートをそのまま静的化しており、
本番の投稿データ (19 口座 / 63 投稿) の内容を表示します。

## ページ

| パス | 元のビュー |
| --- | --- |
| `/` | `pages/index.html.erb` (サインアウト時) — 終了のお知らせ |
| `/posts` | `posts/index.html.erb` — 返信でない投稿 43 件 |
| `/@<name_id>` | `accounts/show.html.erb` (サインアウト時) — 19 ページ |
| `/404` | `errors/404.html.erb` — 存在しないパスで返す (`request_id` は省略) |

口座ページは投稿が 1 件以上ある 19 口座分のみ生成しています
(投稿が無い 37 口座は作っていません)。

本体は 10 件ずつ追加読み込みしますが、モックでは全件を一度に並べ、
「読込」ボタンの位置に `posts/_end_of_posts.html.erb` と同じ
「全投稿読込完了」を出しています。

投稿一覧は本体と同じく返信でない投稿だけを並べ、返信が付いている投稿は
直後の `<details class="post-replies">` に畳んでいます。開くと返信を読め、
返信に対する返信も入れ子の `<details>` で辿れます (5 箇所)。
口座ページは本体同様、返信も混ぜた時系列のままです。

## サービス終了の扱い

- トップページの「口座進入」の分岐を消し、赤ボーダーで囲ったサービス終了の
  お知らせに差し替えています。
- 投稿作成・返信・良 / 可 / 不可・投稿単体ページへのリンク・ヘッダの口座リンクなど
  動作しなくなったリンクとボタンには `data-service-ended` を付けており、
  押すと画面内トーストで「得句巣はサービス終了しました 詳しくはこちら」を表示します。
  「詳しくはこちら」からトップページのお知らせに遷移します。
- 利用規約・個人情報取扱・問合は `anyur.com` の同じパスに向けています。

## 本体との違い

静的化にあたって変えているのは次の点だけです。

- Turbo / Stimulus は載せず、トーストのみを素の JS で実装 (マークアップは本体のまま)
- `<meta charset="utf-8">` を追加 (本体は Rails が Content-Type ヘッダで返している)
- 投稿一覧の日時は `time_ago_in_words_kanji` の相対表記をやめ、投稿単体ページと同じ
  `to_kanji_date` の絶対表記に統一 (静的アーカイブでは相対表記が時間とともにずれるため)
- 404 ページのみ `noindex, nofollow, noarchive` (本体は全ページ `index follow`)
- `og:image` / `og:url` は `data/site.json` の `origin` を使った絶対 URL
  (本体は `request.base_url` から組み立てている)
- csrf/csp メタタグと importmap は省略。GA4 は本体と同じタグが全ページに入ります
  (本体は production のみ)。ID は `data/site.json` の `ga4_id` から差し込んでいて、
  本番 (x.amiverse.net) と同じ `G-5MW7M77S9F` です
- サインアウト時の表示だけを出しているため、投稿削除ボタン・自分の反応の
  ハイライト (`post-reacted`)・口座の各種手続リンクは存在しません
- CSS は `application.css` / `post.css` / `account.css` から必要な分だけを写し、
  末尾にモック固有の追加分 (お知らせの枠・トースト・`<details>` まわり) を置いています。
  `flash.css` と `custom_form.css` は使わなくなったので流用していません

## 構成

```
data/site.json          origin と GA4 の ID
data/x_production.json  本番データ (phpMyAdmin の JSON エクスポート)
tools/build.mjs         data/ から public/**.html を生成する
public/                 Cloudflare Workers に配信させるディレクトリ (生成物もコミット済み)
wrangler.jsonc          静的アセットのみの Worker 設定
package.json            wrangler のバージョン固定と npm scripts
```

`public/x-1.png`・`favicon.ico`・`icon.png`・`robots.txt` は得句巣本体の `public/` から
そのまま持ってきています。

## ビルド

`public/` は生成物ごとコミットしてあるので、デプロイ時にビルドは要りません。
ページを作り直すときだけ次を実行します (Node の標準ライブラリのみで動きます)。

```sh
npm run build   # = node tools/build.mjs
```

`tools/build.mjs` には `ApplicationHelper#to_kanji_date` と
`TextHelper#simple_format` を本体の挙動どおりに移植してあります。

### データについて

`data/x_production.json` は本番 DB の `accounts` / `posts` / `reactions` を
phpMyAdmin で JSON エクスポートしたものです。

このエクスポートには `accounts.status` / `accounts.visibility` / `posts.status` の
カラムが含まれていないため、本体の `from_normal_account` / `from_opened_account` /
`is_normal` に相当する絞り込みは `tools/build.mjs` では行わず、全行を描画しています。

これで問題ないことは本番と突き合わせて確認済みです。サービス終了前に
`https://x.amiverse.net/posts` を `/posts/load?offset=<aid>` で最後まで辿り、
公開されている投稿の aid を集めたところ 63 件で、エクスポートの 63 件と
**過不足なく一致**しました (エクスポート側にのみ存在する投稿は無し)。
口座も、投稿がある 19 件はすべて本番で公開されていました。

## Cloudflare へのデプロイ

`wrangler.jsonc` は `main` (Worker スクリプト) を持たない静的アセットのみの設定です。
静的アセットへのリクエストは Workers のリクエスト数にカウントされません。

### GitHub 連携 (Workers Builds) で自動デプロイする

推奨。ダッシュボードの Workers & Pages → Create application → Import a repository から
このリポジトリを選び、次を設定します。

| 設定 | 値 |
| --- | --- |
| Git branch | `main` |
| Build command | 空 (`public/` をコミットしているので不要) |
| Deploy command | `npx wrangler deploy` (既定値のまま) |

`main` に push するたびに自動でデプロイされます。
ダッシュボード側の Worker 名は `wrangler.jsonc` の `name` (`x-mock`) と
一致させる必要があります。API トークンは Cloudflare が自動発行するので用意は要りません。

### 手元からデプロイする

```sh
npm install

# 1. Cloudflare アカウントにログイン (ブラウザが開く)
npx wrangler login

# 2. デプロイ
npm run deploy   # = wrangler deploy
```

どちらの方法でも `https://x-mock.<サブドメイン>.workers.dev` で公開されます。

### 独自ドメイン (x.amiverse.net) で配信する

Rails のホスティングを置き換える場合は、デプロイ後に Cloudflare ダッシュボードの
Workers & Pages → x-mock → Settings → Domains & Routes で
Custom Domain として `x.amiverse.net` を追加します。
DNS レコードは Cloudflare が自動で張り替えるので、既存の A / CNAME は先に消しておきます。

`wrangler.jsonc` に書いておく場合は次を足します。

```jsonc
"routes": [
  { "pattern": "x.amiverse.net", "custom_domain": true }
]
```

### URL について

`/`・`/posts`・`/404` は本体と同じ URL のままリダイレクトなしで配信されます。
`/@<name_id>` は Workers の静的アセット配信が `@` を正規化するため、
`/%40<name_id>` へ 307 リダイレクトされたうえで表示されます
(本体と同じ URL のままでも到達可能)。

存在しないパスは `public/404.html` を 404 ステータスで返します。
投稿単体ページ (`/posts/<aid>`) はモックの範囲外なので 404 になりますが、
そこへのリンクはすべてトーストに差し替えてあるため踏むことはありません。

## ローカル確認

`wrangler dev` を使ってください。実際の Workers ランタイムで配信されるので、
`html_handling` (拡張子なしの URL) と `not_found_handling` (404 ページ) も本番と同じ挙動になります。

```sh
npm install
npm run dev   # = wrangler dev  -> http://localhost:8787
```

`python3 -m http.server` のような素の静的サーバーでは
`/posts` や `/@<name_id>` が 404 になるので確認になりません。
