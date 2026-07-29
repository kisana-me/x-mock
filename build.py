#!/usr/bin/env python3
"""得句巣 (x) 静的モック生成器

kisana-me/x の ERB ビュー・ヘルパを Python に写し取り、
data/x_production.json (phpMyAdmin エクスポート) から dist/ 以下に
静的 HTML を書き出す。生成物はコミットされているので、
Cloudflare 側でビルドコマンドを設定する必要はない。

    python3 build.py
"""

import html
import json
import os
import re
import shutil
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data", "x_production.json")
DIST = os.path.join(ROOT, "dist")

# 本体アプリでの外部リンク先 (利用規約等はドメインのみ anyur.com へ)
ANYUR = "https://anyur.com"


# ---------------------------------------------------------------- helpers
# 以下は app/helpers/application_helper.rb の移植


def to_kanji_single_number(number):
    kanji_map = "零一二三四五六七八九"
    return "".join(kanji_map[int(c)] for c in str(number))


def to_kanji_date(date):
    return "{}年{}月{}日、{}時{}分".format(
        to_kanji_single_number(date.year),
        to_kanji_single_number(date.month),
        to_kanji_single_number(date.day),
        to_kanji_single_number(date.hour),
        to_kanji_single_number(date.minute),
    )


def simple_format(text):
    """ActionView::Helpers::TextHelper#simple_format 相当。

    本体は sanitize だが、モックでは全てエスケープする
    (実データに HTML 特殊文字は含まれないため出力は同一)。
    """
    text = text or ""
    if not text.strip():
        return "<p></p>"
    text = html.escape(re.sub(r"\r\n?", "\n", text))
    paragraphs = re.split(r"\n\n+", text)
    paragraphs = [re.sub(r"([^\n]\n)(?=[^\n])", r"\1<br />", p) for p in paragraphs]
    return "\n\n".join("<p>{}</p>".format(p) for p in paragraphs)


def e(text):
    return html.escape(str(text), quote=True)


def indent_block(text, indent):
    return "\n".join(indent + line if line else line for line in text.split("\n"))


# ---------------------------------------------------------------- layout
# app/views/layouts/application.html.erb の移植


def full_title(title):
    base_title = "得句巣"
    return base_title if not title else "{} | {}".format(title, base_title)


def layout(title, path, body):
    return """<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <title>{title}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="theme-color" content="#ffffff" />
    <meta name="color-scheme" content="light" />
    <meta name="author" content="kisana" />
    <meta name="generator" content="amiverse" />
    <meta name="description" content="次世代中華風電子共同体" />
    <meta name="keywords" content="中華風, 偽中国語, 漢字" />
    <meta name="robots" content="index follow" />
    <meta name="creator" content="kisana" />
    <meta name="googlebot" content="index follow" />
    <meta name="publisher" content="amiverse" />
    <meta name="format-detection" content="email=no,telephone=no,address=no" />
    <meta property="og:url" content="{path}" />
    <meta property="og:title" content="{title}" />
    <meta property="og:type" content="website" />
    <meta property="og:description" content="次世代中華風電子共同体" />
    <meta property="og:image" content="/x-1.png" />
    <meta property="og:locale" content="ja_JP" />
    <meta property="og:site_name" content="得句巣" >
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="得句巣" />
    <meta name="twitter:title" content="{title}" />
    <meta name="twitter:description" content="次世代中華風電子共同体" />
    <meta name="twitter:image" content="/x-1.png" />
    <meta name="twitter:image:alt" content="" />
    <meta name="twitter:creator" content="kisana" />
    <meta name="twitter:creator:id" content="kisana_me" />

    <link rel="icon" href="/favicon.ico">

    <link rel="stylesheet" href="/assets/app.css">
    <script src="/assets/mock.js" defer></script>
  </head>

  <body>
    <header>
      <div class="h-left">
        <a href="/">得句巣</a>
      </div>
      <div class="h-right">
        <a href="/" data-toast>口座：作成・進入</a>
      </div>
    </header>
    <main>
{body}
    </main>
    <div id="flash"></div>
    <footer>
      <div class="f-top">
        <a href="/">得句巣</a>
      </div>
      <div class="f-middle">
        <a href="{anyur}/terms-of-service">利用規約</a>
        <a href="{anyur}/privacy-policy">個人情報取扱</a>
        <a href="{anyur}/contact">問合</a>
      </div>
      <div class="f-bottom">
        <small>著作権：得句巣 全権利保有</small>
      </div>
    </footer>
  </body>
</html>
""".format(title=e(full_title(title)), path=e(path), body=body, anyur=ANYUR)


# ---------------------------------------------------------------- partials
# app/views/posts/_post.html.erb / _console.html.erb の移植

KIND_LABELS = [("0", "良"), ("1", "可"), ("2", "不可")]


def render_console(post):
    """_console.html.erb 相当。全ボタンは押すとトーストが出るだけ。"""
    buttons = [
        '        <form class="button_to"><button type="button" class="post-button"'
        ' data-toast>返信 {}</button></form>'.format(len(post["replies"]))
    ]
    for kind, label in KIND_LABELS:
        buttons.append(
            '        <form class="button_to"><button type="button" class="post-button"'
            ' data-toast>{} {}</button></form>'.format(label, post["reactions"].get(kind, 0))
        )
    return '      <div class="post-console">\n{}\n      </div>'.format("\n".join(buttons))


def render_post(post, indent=""):
    """_post.html.erb 相当。"""
    account = post["account"]
    replied = (
        '          <a href="#" data-toast>返信</a>\n' if post["replied"] else ""
    )
    body = """  <div class="post">
    <div class="post-account">
      <a href="/@{name_id}/">{name}</a>
    </div>
    <div class="post-info">
      <div>
{replied}      </div>
      <a href="#" data-toast>{date}</a>
    </div>
    <div class="post-content">
{content}
    </div>
    <div class="post-console" id="{aid}-console">
{console}
    </div>
  </div>""".format(
        name_id=e(account["name_id"]),
        name=e(account["name"]),
        replied=replied,
        date=e(to_kanji_date(post["created_at"])),
        content=indent_block(simple_format(post["content"]), "      "),
        aid=e(post["aid"]),
        console=render_console(post),
    )
    return indent_block(body, indent) if indent else body


def render_thread(post, indent=""):
    """返信ぶら下がりを <details> に畳んで返す。返信の返信も入れ子で辿れる。"""
    out = [render_post(post, indent)]
    if post["replies"]:
        out.append(
            '{i}  <details class="post-replies">\n'
            "{i}    <summary>返信 {n} 件</summary>".format(i=indent, n=len(post["replies"]))
        )
        for reply in post["replies"]:
            out.append(render_thread(reply, indent + "    "))
        out.append("{i}  </details>".format(i=indent))
    return "\n".join(out)


# ---------------------------------------------------------------- pages


def page_top():
    """pages/index.html.erb 相当。口座進入の代わりに終了告知を置く。"""
    body = """<h1>次世代中華風電子共同体</h1>
<a href="/posts/">投稿一覧</a>
<br /><br />
<img src="/x-1.png" style="width: 100%" />
<div class="ended">
  <h2>本服務終了</h2>
  <p>得句巣はサービスを終了しました。</p>
  <p>口座の作成・進入、投稿、反応などの機能は全て停止しています。</p>
  <p>本ページは当時の投稿を読むためだけに残された静的な保存版です。</p>
</div>"""
    return layout(None, "/", body)


def page_posts(roots):
    """posts/index.html.erb 相当。一度に全件を出すため読込ボタンは終端表示。"""
    posts = "\n".join(render_thread(post) for post in roots)
    body = """<h1>投稿一覧</h1>

<a href="#" data-toast>作成</a>

<div class="posts" id="posts">
{posts}
</div>

<div id="load-more-button">
  <div>
    全投稿読込完了
  </div>
</div>""".format(posts=posts)
    return layout("投稿一覧", "/posts/", body)


def page_account(account):
    """accounts/show.html.erb 相当。本体同様、返信も混ぜて時系列で並べる。"""
    posts = "\n".join(render_post(post) for post in account["posts"])
    body = """<div class="account">
  <div class="account-name">
    {name}
  </div>
  <div class="account-bio">
    自己紹介：{description}
  </div>
  <div class="account-info">
    利用開始：{created_at}
  </div>
</div>

<div class="posts" id="posts">
{posts}
</div>

<div id="load-more-button">
  <div>
    全投稿読込完了
  </div>
</div>""".format(
        name=e(account["name"]),
        description=simple_format(account["description"]),
        created_at=e(to_kanji_date(account["created_at"])),
        posts=posts,
    )
    return layout("口座拝見", "/@{}/".format(account["name_id"]), body)


# ---------------------------------------------------------------- build


def parse_time(value):
    return datetime.strptime(value.split(".")[0], "%Y-%m-%d %H:%M:%S")


def load():
    with open(DATA, encoding="utf-8") as f:
        export = json.load(f)
    tables = {t["name"]: t["data"] for t in export if t.get("type") == "table"}

    accounts = {}
    for row in tables["accounts"]:
        accounts[row["id"]] = {
            "id": row["id"],
            "aid": row["aid"],
            "name": row["name"],
            "name_id": row["name_id"],
            "description": row["description"],
            "created_at": parse_time(row["created_at"]),
            "posts": [],
        }

    posts = {}
    for row in tables["posts"]:
        posts[row["id"]] = {
            "id": row["id"],
            "aid": row["aid"],
            "post_id": row["post_id"],
            "content": row["content"],
            "created_at": parse_time(row["created_at"]),
            "account": accounts[row["account_id"]],
            "replied": None,
            "replies": [],
            "reactions": {},
        }

    for row in tables["reactions"]:
        counts = posts[row["post_id"]]["reactions"]
        counts[row["kind"]] = counts.get(row["kind"], 0) + 1

    for post in posts.values():
        post["account"]["posts"].append(post)
        if post["post_id"]:
            post["replied"] = posts[post["post_id"]]
            posts[post["post_id"]]["replies"].append(post)

    for post in posts.values():
        post["replies"].sort(key=lambda p: p["created_at"])
    for account in accounts.values():
        account["posts"].sort(key=lambda p: p["created_at"], reverse=True)

    roots = sorted(
        (p for p in posts.values() if not p["post_id"]),
        key=lambda p: p["created_at"],
        reverse=True,
    )
    return accounts, roots


def write(path, content):
    full = os.path.join(DIST, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)
    print("  {}".format(path))


def main():
    accounts, roots = load()

    # 生成物だけを消し、静的ファイル (assets/画像) はそのまま残す
    for name in os.listdir(DIST):
        if name.startswith("@"):
            shutil.rmtree(os.path.join(DIST, name))
    if os.path.isdir(os.path.join(DIST, "posts")):
        shutil.rmtree(os.path.join(DIST, "posts"))

    print("生成:")
    write("index.html", page_top())
    write("posts/index.html", page_posts(roots))

    posted = [a for a in accounts.values() if a["posts"]]
    posted.sort(key=lambda a: a["created_at"])
    for account in posted:
        write("@{}/index.html".format(account["name_id"]), page_account(account))

    print(
        "\n口座 {} 件 / 投稿 {} 件 (内 親投稿 {} 件)".format(
            len(posted),
            sum(len(a["posts"]) for a in posted),
            len(roots),
        )
    )


if __name__ == "__main__":
    main()
