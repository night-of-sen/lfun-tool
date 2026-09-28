/* 赞助位注入：构建期读不到数据库，所以运行时拉取（PRD 模块三）
   没有生效赞助时容器保持 hidden，页面与无赞助时像素级一致，不留空位。 */
(function () {
  "use strict";
  var boxes = document.querySelectorAll(".sponsor-block");
  if (!boxes.length || !window.fetch) return;
  var lang = window.__LANG__ || "zh";
  Array.prototype.forEach.call(boxes, function (box) {
    var slot = box.getAttribute("data-slot");
    if (!slot) return;
    var cat = box.getAttribute("data-category") || "";
    var url = "/api/slots.php?slot=" + encodeURIComponent(slot) + "&lang=" + encodeURIComponent(lang) +
      (cat ? "&category=" + encodeURIComponent(cat) : "");
    fetch(url, { credentials: "omit" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok || !j.html) return;
        var grid = box.querySelector(".grid");
        if (!grid) return;
        grid.innerHTML = j.html;
        box.hidden = false;
      })
      .catch(function () { /* 静默失败，不影响页面 */ });
  });
})();
