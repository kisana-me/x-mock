# x-mock

[得句巣 (kisana-me/x)](https://github.com/kisana-me/x) の静的モック。

サービス終了後も当時の投稿を読めるように、本体アプリの画面を静的 HTML として焼き直したもの。
Cloudflare 側では静的アセットとして配信するだけなので、Worker の実行枠を消費しない。

## 収録範囲

| ページ | パス | 元のビュー |
| --- | --- | --- |
| トップページ | `/` | `app/views/pages/index.html.erb` |
| 投稿一覧 | `/posts/` | `app/views/posts/index.html.erb` |
| 口座拝見 | `/@<name_id>/` | `app/views/accounts/show.html.erb` |

口座ページは投稿が 1 件以上ある 19 口座分のみ生成する (投稿が無い口座は作らない)。

## 本体との差分

- **全件を一度に描画する。** 本体は数投稿ずつ読み込むが、モックでは全投稿を出し切り、
  読込ボタンの位置には `_end_of_posts.html.erb` 相当の「全投稿読込完了」を置く。
- **投稿一覧は返信でない投稿のみを並べる。** 返信が付いている投稿は直後の
  `<details class="post-replies">` に畳んであり、開くと返信を読める。
  返信に対する返信も入れ子の `<details>` で辿れる。
  口座ページは本体同様、返信も混ぜた時系列のまま。
- **動かなくなったリンク・ボタンは全てトーストを出すだけ。**
  「得句巣はサービス終了しました 詳しくはこちら」と表示し、リンクからトップページへ飛ぶ。
  見た目は本体の flash (`shared/_flash.html.erb`) をそのまま流用している。
  対象は投稿作成、返信、良 / 可 / 不可、投稿単体ページへのリンク、ヘッダの口座リンク。
- **トップページの「口座進入」は削除**し、代わりに赤ボーダーのサービス終了告知を置いた。
- **利用規約・個人情報取扱・問合はドメインを `anyur.com` に変更**し、パスはそのまま
  (`/terms-of-service`, `/privacy-policy`, `/contact`)。中継ページは作らず直接リンクする。
- **日時は絶対表記に統一。** 本体の一覧は `time_ago_in_words_kanji` による相対表記だが、
  静的な保存版では時間が経つほどずれるため、投稿単体ページと同じ `to_kanji_date` を使う。
- 口座の状態 (在否・公開範囲)、自分の反応のハイライト、投稿削除ボタンなど、
  ログインを前提とする表示は存在しない。

HTML と CSS は本体の書き方に合わせてある。CSS は `application.css` / `post.css` /
`account.css` / `flash.css` から必要な分だけを写し、末尾にモック専用の追加分
(終了告知の枠と `<details>` まわり) を置いた。

## 構成

```
data/x_production.json   実データ (phpMyAdmin エクスポート)
build.py                 静的 HTML 生成器
dist/                    生成物。そのまま配信されるディレクトリ
```

`dist/` はコミット済みなので、配信側でビルドを走らせる必要はない。

## 生成し直す

```sh
python3 build.py
```

依存パッケージは無い。`dist/index.html`, `dist/posts/index.html`,
`dist/@<name_id>/index.html` が上書きされる。
`dist/assets/`、画像、`404.html`、`robots.txt` は生成対象外なので手で編集する。

ローカルで確認するには:

```sh
python3 -m http.server 8000 --directory dist
```

## デプロイ

Cloudflare の GitHub 連携で、このリポジトリを繋いで以下を設定する。

- ビルドコマンド: なし (空欄)
- ビルド出力ディレクトリ: `dist`

生成物をコミット済みのため、ビルドは走らない。全て静的ファイルとして配信され、
Worker のリクエスト枠は消費しない。
