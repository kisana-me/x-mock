#!/usr/bin/env node
// data/x_production.json と data/site.json から public/ 以下の静的ページを書き出す。
//
// HTML は得句巣 (Rails) の ERB をそのまま静的化したもの。
//   - layouts/application.html.erb -> layout()
//   - pages/index.html.erb         -> トップページ (サインアウト時の分岐)
//   - posts/index.html.erb         -> 投稿一覧
//   - posts/_post.html.erb         -> postCard()
//   - posts/_console.html.erb      -> console()
//   - posts/_end_of_posts.html.erb -> 「全投稿読込完了」
//   - accounts/show.html.erb       -> 口座拝見 (投稿がある口座のみ)
//   - errors/404.html.erb          -> 404 ページ (request_id は静的化により省略)
//
// サービス終了により動作しないリンク・ボタンには data-service-ended を付け、
// public/assets/application.js がトースト通知に差し替える。

import { mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const publicDir = join(root, "public")

const site = JSON.parse(await readFile(join(root, "data", "site.json"), "utf8"))
const { origin, ga4_id: ga4Id } = site

const dump = JSON.parse(
  await readFile(join(root, "data", "x_production.json"), "utf8")
)

// ---- ヘルパー ----

// ApplicationHelper#full_title
const fullTitle = (title) => (title ? `${title} | 得句巣` : "得句巣")

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const indent = (text, pad) =>
  text
    .split("\n")
    .map((line) => (line ? pad + line : line))
    .join("\n")

// ApplicationHelper#to_kanji_single_number
const KANJI_DIGITS = "零一二三四五六七八九"
const toKanjiSingleNumber = (number) =>
  String(number)
    .split("")
    .map((char) => KANJI_DIGITS[Number(char)])
    .join("")

// ApplicationHelper#to_kanji_date
// 本体の一覧は time_ago_in_words_kanji による相対表記だが、静的アーカイブでは
// 時間が経つほどずれるため、投稿単体ページと同じ絶対表記に統一している。
const toKanjiDate = (time) =>
  `${toKanjiSingleNumber(time.year)}年${toKanjiSingleNumber(time.month)}月` +
  `${toKanjiSingleNumber(time.day)}日、${toKanjiSingleNumber(time.hour)}時` +
  `${toKanjiSingleNumber(time.minute)}分`

// config.active_record.default_timezone = :local + config.time_zone = "Tokyo" なので
// エクスポートの値はそのまま JST。タイムゾーン変換をせずに読む。
const parseTime = (value) => {
  const [, year, month, day, hour, minute] = value
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
    .map(Number)
  return { year, month, day, hour, minute }
}

// ActionView::Helpers::TextHelper#simple_format 相当。
// 本体は sanitize だが、モックでは全てエスケープする
// (実データに HTML 特殊文字は含まれないため出力は同一)。
const simpleFormat = (text) => {
  if (!text || !text.trim()) return "<p></p>"
  return escapeHtml(text.replace(/\r\n?/g, "\n"))
    .split(/\n\n+/)
    .map((paragraph) => paragraph.replace(/([^\n]\n)(?=[^\n])/g, "$1<br />"))
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join("\n\n")
}

const accountPath = (account) => `/@${account.name_id}`
const postPath = (post) => `/posts/${post.aid}`

// ---- データの組み立て ----

const tables = Object.fromEntries(
  dump.filter((entry) => entry.type === "table").map((t) => [t.name, t.data])
)

const accounts = new Map(
  tables.accounts.map((row) => [
    row.id,
    {
      aid: row.aid,
      name: row.name,
      name_id: row.name_id,
      description: row.description,
      created_at: parseTime(row.created_at),
      posts: [],
    },
  ])
)

const posts = new Map(
  tables.posts.map((row) => [
    row.id,
    {
      aid: row.aid,
      content: row.content,
      created_at: parseTime(row.created_at),
      created_at_raw: row.created_at,
      account: accounts.get(row.account_id),
      post_id: row.post_id,
      replied: null,
      replies: [],
      // Reaction の enum { good: 0, ok: 1, bad: 2 }
      reactions: { 0: 0, 1: 0, 2: 0 },
    },
  ])
)

for (const row of tables.reactions) {
  posts.get(row.post_id).reactions[row.kind] += 1
}

for (const post of posts.values()) {
  post.account.posts.push(post)
  if (post.post_id) {
    post.replied = posts.get(post.post_id)
    post.replied.replies.push(post)
  }
}

const byNewest = (a, b) => (a.created_at_raw < b.created_at_raw ? 1 : -1)
const byOldest = (a, b) => (a.created_at_raw < b.created_at_raw ? -1 : 1)

for (const post of posts.values()) post.replies.sort(byOldest)
for (const account of accounts.values()) account.posts.sort(byNewest)

// posts#index の絞り込み (返信でないもの) と order(created_at: :desc)
const rootPosts = [...posts.values()].filter((p) => !p.post_id).sort(byNewest)
// 投稿がある口座のみページを作る
const postedAccounts = [...accounts.values()]
  .filter((a) => a.posts.length > 0)
  .sort((a, b) => (a.name_id < b.name_id ? -1 : 1))

// ---- レイアウト ----

// layouts/application.html.erb の Google タグ相当。本体は production のみで出す。
const ga4Tag = ga4Id
  ? `
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-${ga4Id}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag("js", new Date());
      gtag("config", "G-${ga4Id}");
    </script>`
  : ""

// layouts/application.html.erb 相当。csrf/csp と importmap は静的化により省いている。
// ヘッダの口座リンクはサインアウト時の分岐 (「口座：作成・進入」) のまま。
const layout = ({ title, path, robots = "index follow", body }) => `<!DOCTYPE html>
<html lang="ja">
  <head>
    <!-- 本体は Rails が Content-Type ヘッダで charset を返すが、静的配信では明示しておく -->
    <meta charset="utf-8">
    <title>${escapeHtml(fullTitle(title))}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="theme-color" content="#ffffff" />
    <meta name="color-scheme" content="light" />
    <meta name="author" content="kisana" />
    <meta name="generator" content="amiverse" />
    <meta name="description" content="次世代中華風電子共同体" />
    <meta name="keywords" content="中華風, 偽中国語, 漢字" />
    <meta name="robots" content="${robots}" />
    <meta name="creator" content="kisana" />
    <meta name="googlebot" content="${robots}" />
    <meta name="publisher" content="amiverse" />
    <meta name="format-detection" content="email=no,telephone=no,address=no" />
    <meta property="og:url" content="${origin}${path}" />
    <meta property="og:title" content="${escapeHtml(fullTitle(title))}" />
    <meta property="og:type" content="website" />
    <meta property="og:description" content="次世代中華風電子共同体" />
    <meta property="og:image" content="${origin}/x-1.png" />
    <meta property="og:locale" content="ja_JP" />
    <meta property="og:site_name" content="得句巣" >
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="得句巣" />
    <meta name="twitter:site:id" content="x.amiverse.net" />
    <meta name="twitter:title" content="${escapeHtml(fullTitle(title))}" />
    <meta name="twitter:description" content="次世代中華風電子共同体" />
    <meta name="twitter:image" content="${origin}/x-1.png" />
    <meta name="twitter:image:alt" content="" />
    <meta name="twitter:creator" content="kisana" />
    <meta name="twitter:creator:id" content="kisana_me" />

    <link rel="icon" href="/favicon.ico">
    <link rel="stylesheet" href="/assets/application.css">
    <script src="/assets/application.js" defer></script>${ga4Tag}
  </head>

  <body>
    <header>
      <div class="h-left">
        <a href="/">得句巣</a>
      </div>
      <div class="h-right">
        <a href="/" data-service-ended>口座：作成・進入</a>
      </div>
    </header>
    <main>
${body}
    </main>
    <footer>
      <div class="f-top">
        <a href="/">得句巣</a>
      </div>
      <div class="f-middle">
        <a href="https://anyur.com/terms-of-service">利用規約</a>
        <a href="https://anyur.com/privacy-policy">個人情報取扱</a>
        <a href="https://anyur.com/contact">問合</a>
      </div>
      <div class="f-bottom">
        <small>著作権：得句巣 全権利保有</small>
      </div>
    </footer>
    <div class="toast" data-toast>
      得句巣はサービス終了しました <a href="/">詳しくはこちら</a>
    </div>
  </body>
</html>
`

// ---- パーシャル ----

// posts/_console.html.erb 相当。button_to の出力に合わせて form で包んでいる。
// サインアウト時なので投稿削除ボタンは出ず、反応の post-reacted も付かない。
const REACTIONS = [
  ["良", "good", 0],
  ["可", "ok", 1],
  ["不可", "bad", 2],
]

const console_ = (post) => {
  const buttons = [
    `<form class="button_to" method="get" action="/posts/new">` +
      `<input type="hidden" name="replied" value="${post.aid}" />` +
      `<button class="post-button" type="submit" data-service-ended>返信 ${post.replies.length}</button></form>`,
    ...REACTIONS.map(
      ([label, kind, value]) =>
        `<form class="button_to" method="post" action="/react">` +
        `<input type="hidden" name="aid" value="${post.aid}" />` +
        `<input type="hidden" name="kind" value="${kind}" />` +
        `<button class="post-button" type="submit" data-service-ended>${label} ${post.reactions[value]}</button></form>`
    ),
  ]
  return `    <div class="post-console">
${buttons.map((button) => `      ${button}`).join("\n")}
    </div>`
}

// posts/_post.html.erb 相当。
const postCard = (post) => `<div class="post">
  <div class="post-account">
    <a href="${accountPath(post.account)}">${escapeHtml(post.account.name)}</a>
  </div>
  <div class="post-info">
    <div>
${post.replied ? `      <a href="${postPath(post.replied)}" data-service-ended>返信</a>` : ""}
    </div>
    <a href="${postPath(post)}" data-service-ended>${toKanjiDate(post.created_at)}</a>
  </div>
  <div class="post-content">
${indent(simpleFormat(post.content), "    ")}
  </div>
  <div class="post-console" id="${post.aid}-console">
${console_(post)}
  </div>
</div>`

// 投稿一覧では返信でない投稿だけを並べ、返信は直後の <details> に畳む。
// 返信に対する返信も入れ子の <details> で辿れる。
const thread = (post) => {
  const card = postCard(post)
  if (post.replies.length === 0) return card
  return `${card}
<details class="post-replies">
  <summary>返信 ${post.replies.length} 件</summary>
${indent(post.replies.map(thread).join("\n"), "  ")}
</details>`
}

// posts/_end_of_posts.html.erb 相当。
// 本来は「読込」ボタンだが、全件を出しているので読み込み完了の表示にしている。
const loadEnd = `      <div id="load-more-button">
        <div>
          全投稿読込完了
        </div>
      </div>`

const timeline = (list, render) => `      <div class="posts" id="posts">
${indent(list.map(render).join("\n"), "        ")}
      </div>

${loadEnd}`

// ---- ページ ----

// pages/index.html.erb 相当 (@current_account が nil のとき)。
// 「口座進入」の分岐はサービス終了のお知らせに差し替えている。
const indexPage = () =>
  layout({
    title: null,
    path: "/",
    body: `      <h1>次世代中華風電子共同体</h1>
      <a href="/posts">投稿一覧</a>
      <br /><br />
      <img src="/x-1.png" style="width: 100%" />

      <div class="service-ended">
        <p><strong>得句巣はサービスを終了しました。</strong></p>
        <p>2026/07/29をもってすべてのサービスを終了し、現在は当時の投稿を閲覧できる静的なアーカイブとして公開しています。</p>
        <p>これまでと同様に、アプリケーションのソースコードは<a href="https://github.com/kisana-me/x" target="_blank" rel="noopener noreferrer">GitHubにて公開</a>しています。</p>
        <p>閲覧以外の操作 (口座の作成・進入、投稿、反応など) はご利用いただけません。ご利用ありがとうございました。</p>
      </div>`,
  })

// posts/index.html.erb 相当。
const postsPage = () =>
  layout({
    title: "投稿一覧",
    path: "/posts",
    body: `      <h1>投稿一覧</h1>

      <a href="/posts/new" data-service-ended>作成</a>

${timeline(rootPosts, thread)}`,
  })

// accounts/show.html.erb 相当 (@current_account が nil のとき)。
// 本体と同じく返信も混ぜた時系列で並べるので、ここでは <details> に畳まない。
const accountPage = (account) =>
  layout({
    title: "口座拝見",
    path: accountPath(account),
    body: `      <div class="account">
        <div class="account-name">
          ${escapeHtml(account.name)}
        </div>
        <div class="account-bio">
          自己紹介：${simpleFormat(account.description)}
        </div>
        <div class="account-info">
          利用開始：${toKanjiDate(account.created_at)}
        </div>
      </div>

${timeline(account.posts, postCard)}`,
  })

// errors/404.html.erb 相当。request_id は静的配信では出せないので省いている。
// 存在しないパスなのでここだけ noindex にしている。
const notFoundPage = () =>
  layout({
    title: "404 - 存在無",
    path: "/404",
    robots: "noindex, nofollow, noarchive",
    body: `      <h1>404 - 存在無</h1>
      <p>存在無。</p>
      <a href="/">初期位置戻</a>`,
  })

// ---- 書き出し ----

// wrangler.jsonc の html_handling: auto-trailing-slash では、/foo は /foo.html を
// そのまま返す (/foo/index.html だと /foo/ へリダイレクトされる)。
// 本体と同じ URL をリダイレクトなしで配信するため、拡張子つきで書き出す。
const write = async (path, html) => {
  const file = join(publicDir, path === "" ? "index.html" : `${path}.html`)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, html)
  return path === "" ? "/" : `/${path}`
}

// 口座を減らしたときに古いページが残らないよう、生成物だけ先に消す
for (const name of await readdir(publicDir)) {
  if (name.startsWith("@")) await rm(join(publicDir, name))
}

const written = [await write("", indexPage())]
written.push(await write("posts", postsPage()))
for (const account of postedAccounts) {
  written.push(await write(`@${account.name_id}`, accountPage(account)))
}
// wrangler.jsonc の not_found_handling: 404-page が参照する
written.push(await write("404", notFoundPage()))

console.log(`wrote ${written.length} pages:`)
for (const path of written) console.log(`  ${path}`)
console.log(
  `\n口座 ${postedAccounts.length} 件 / 投稿 ${posts.size} 件 (内 親投稿 ${rootPosts.length} 件)`
)
