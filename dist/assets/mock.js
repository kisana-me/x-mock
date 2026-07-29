// 得句巣 モック版
// 本体アプリで動いていたボタン・リンクは全て無効。
// 押された場合は本体の flash と同じ見た目のトーストで終了を知らせる。
// (本体: app/views/shared/_flash.html.erb + app/javascript/controllers/flash_controller.js)

(function () {
  "use strict";

  var TIMEOUT = 3000;
  var timer = null;

  function close(flash) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (flash && flash.parentNode) {
      flash.remove();
    }
  }

  function toast() {
    var container = document.getElementById("flash");
    if (!container) {
      return;
    }
    container.innerHTML = "";

    var flash = document.createElement("div");
    flash.className = "flash alert";

    var span = document.createElement("span");
    span.append("得句巣はサービス終了しました ");
    var link = document.createElement("a");
    link.href = "/";
    link.textContent = "詳しくはこちら";
    span.append(link);

    var button = document.createElement("button");
    button.type = "button";
    button.className = "flash-button";
    button.innerHTML = "&times;";
    button.addEventListener("click", function () {
      close(flash);
    });

    var bar = document.createElement("div");
    bar.className = "flash-bar";

    flash.append(span, button, bar);
    container.append(flash);

    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(function () {
      close(flash);
    }, TIMEOUT);
  }

  document.addEventListener("click", function (event) {
    var target = event.target.closest("[data-toast]");
    if (!target) {
      return;
    }
    event.preventDefault();
    toast();
  });
})();
