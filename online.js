/* 站内在线工具 —— 零依赖纯前端实现。所有数据只在浏览器内存里处理，不上传。 */
(function () {
  "use strict";

  var LANG = window.__LANG__ || "zh";
  var T = {
    zh: { copied: "已复制", err: "出错", ok: "没问题", valid: "JSON 校验通过",
          empty: "请先输入内容", badB64: "不是合法的 Base64", badJson: "JSON 解析失败",
          original: "原图", download: "下载", line: "第 {n} 行", chars: "字符" },
    en: { copied: "Copied", err: "Error", ok: "OK", valid: "Valid JSON",
          empty: "Please enter something first", badB64: "Not valid Base64", badJson: "JSON parse failed",
          original: "Original", download: "Download", line: "line {n}", chars: "chars" }
  }[LANG];

  var host = document.querySelector("[data-app]");
  if (!host) return;
  var kind = host.getAttribute("data-app");

  function el(id) { return document.getElementById(id); }
  function val(id) { var e = el(id); return e ? e.value : ""; }
  function setVal(id, v) { var e = el(id); if (e) e.value = v; }
  function qsa(sel, root) { return Array.prototype.slice.call((root || host).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function msg(id, text, type) {
    var e = el(id);
    if (!e) return;
    e.textContent = text || "";
    e.className = "app-msg" + (type ? " " + type : "");
  }
  function copyText(text, btn) {
    var done = function () {
      var old = btn.getAttribute("data-label") || btn.textContent;
      btn.setAttribute("data-label", old);
      btn.textContent = T.copied;
      btn.classList.add("done");
      setTimeout(function () { btn.textContent = old; btn.classList.remove("done"); }, 1500);
    };
    var fb = function () {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done)["catch"](fb);
    } else { fb(); }
  }
  function bindCopy(scope) {
    qsa("[data-copy]", scope).forEach(function (btn) {
      if (btn.getAttribute("data-bound")) return;
      btn.setAttribute("data-bound", "1");
      btn.addEventListener("click", function () {
        var target = el(btn.getAttribute("data-copy"));
        var text = target ? (target.getAttribute("data-raw") || target.value || target.textContent || "") : "";
        if (text) copyText(text, btn);
      });
    });
  }
  function bindActions(scope, map) {
    qsa("[data-act]", scope).forEach(function (btn) {
      var act = btn.getAttribute("data-act");
      if (map[act]) btn.addEventListener("click", function () { map[act](btn); });
    });
  }
  function row2(k, v) {
    return '<div class="app-item"><span class="app-k">' + esc(k) + '</span><code class="app-v">' + esc(v) + "</code></div>";
  }

  /* ---------- 1. JSON ---------- */
  function jsonFormat() {
    var src = el("jf-in"), out = el("jf-out");
    function run(mode) {
      var text = src.value.trim();
      out.value = "";
      if (!text) { msg("jf-msg", ""); return; }
      try {
        var obj = JSON.parse(text);
        if (mode === "validate") { msg("jf-msg", T.valid, "ok"); return; }
        if (mode === "minify") { out.value = JSON.stringify(obj); }
        else {
          // 缩进值无效时回退到 2 空格，而不是静默输出压缩结果
          var ind = el("jf-indent").value;
          var gap = ind === "tab" ? "\t" : (Number(ind) > 0 ? Number(ind) : 2);
          out.value = JSON.stringify(obj, null, gap);
        }
        msg("jf-msg", T.ok + " · " + out.value.length + " " + T.chars, "ok");
      } catch (e) {
        var m = /position (\d+)/.exec(e.message);
        var where = "";
        if (m) {
          var pos = Number(m[1]);
          var before = text.slice(0, pos);
          var ln = before.split("\n").length;
          var col = pos - before.lastIndexOf("\n");
          where = " → " + T.line.replace("{n}", String(ln)) + (LANG === "zh" ? "，第 " + col + " 列" : ", col " + col);
        }
        msg("jf-msg", T.badJson + ": " + e.message + where, "err");
      }
    }
    bindActions(host, {
      format: function () { run("format"); },
      minify: function () { run("minify"); },
      validate: function () { run("validate"); },
      clear: function () { src.value = ""; out.value = ""; msg("jf-msg", ""); }
    });
  }

  /* ---------- 2. Base64 ---------- */
  function b64Encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "", CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin);
  }
  function b64Decode(b64) {
    var bin = atob(String(b64).replace(/\s+/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function base64App() {
    var src = el("b64-in"), out = el("b64-out");
    function run(dir) {
      var text = src.value;
      if (!text.trim()) { setVal("b64-out", ""); msg("b64-msg", ""); return; }
      try {
        out.value = dir === "encode" ? b64Encode(text) : b64Decode(text);
        msg("b64-msg", T.ok, "ok");
      } catch (e) { out.value = ""; msg("b64-msg", T.badB64, "err"); }
    }
    bindActions(host, {
      encode: function () { run("encode"); },
      decode: function () { run("decode"); },
      swap: function () { var a = src.value; src.value = out.value; out.value = a; }
    });
  }

  /* ---------- 3. 哈希 ---------- */
  function hexOf(buf) {
    var b = new Uint8Array(buf), s = "";
    for (var i = 0; i < b.length; i++) s += ("0" + b[i].toString(16)).slice(-2);
    return s;
  }
  function hashApp() {
    var src = el("hs-in"), out = el("hs-out");
    var boxes = qsa("[data-alg]"), timer = null;
    function run() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var text = src.value;
        if (!text) { out.innerHTML = ""; return; }
        var algs = boxes.filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute("data-alg"); });
        if (!algs.length) { out.innerHTML = ""; return; }
        var buf = new TextEncoder().encode(text);
        Promise.all(algs.map(function (a) {
          return crypto.subtle.digest(a, buf).then(function (d) { return row2(a, hexOf(d)); });
        })).then(function (rows) { out.innerHTML = rows.join(""); });
      }, 150);
    }
    src.addEventListener("input", run);
    boxes.forEach(function (c) { c.addEventListener("change", run); });
  }

  /* ---------- 4. 时间戳 ---------- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmtDate(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
           pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }
  function timestampApp() {
    var nowEl = el("ts-now"), src = el("ts-in"), out = el("ts-out");
    function tick() { var ms = Date.now(); nowEl.textContent = Math.floor(ms / 1000) + " (s) · " + ms + " (ms)"; }
    tick(); setInterval(tick, 1000);
    function toDate() {
      var v = src.value.trim();
      if (!v) { out.value = ""; return; }
      var n = Number(v);
      if (isNaN(n)) { out.value = T.err; return; }
      var ms = v.length <= 10 ? n * 1000 : n;
      var d = new Date(ms);
      out.value = (LANG === "zh" ? "本地时间" : "Local") + ": " + fmtDate(d) + "\n" +
                  "UTC: " + d.toISOString() + "\n" +
                  (LANG === "zh" ? "秒" : "Seconds") + ": " + Math.floor(ms / 1000) + "\n" +
                  (LANG === "zh" ? "毫秒" : "Millis") + ": " + ms;
    }
    function toTs() {
      var v = src.value.trim();
      if (!v) { out.value = ""; return; }
      var d = new Date(v.replace(" ", "T"));
      if (isNaN(d.getTime())) { out.value = T.err; return; }
      out.value = (LANG === "zh" ? "秒" : "Seconds") + ": " + Math.floor(d.getTime() / 1000) + "\n" +
                  (LANG === "zh" ? "毫秒" : "Millis") + ": " + d.getTime();
    }
    bindActions(host, {
      toDate: toDate, toTs: toTs,
      useNow: function () { src.value = String(Math.floor(Date.now() / 1000)); toDate(); }
    });
  }

  /* ---------- 5. 图片压缩 ---------- */
  function human(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(2) + " MB";
  }
  function imageCompressApp() {
    var fileEl = el("ic-file"), out = el("ic-out"), qEl = el("ic-q"), wEl = el("ic-w"), qv = el("ic-qv");
    qEl.addEventListener("input", function () { qv.textContent = Number(qEl.value).toFixed(2); });
    fileEl.addEventListener("change", function () {
      out.innerHTML = "";
      Array.prototype.slice.call(fileEl.files || []).forEach(process);
    });
    function process(file) {
      var item = document.createElement("div");
      item.className = "app-item img-item";
      item.innerHTML = '<span class="app-k">' + esc(file.name) + '</span><span class="app-v">' +
        esc(T.original) + " " + human(file.size) + " · " + (LANG === "zh" ? "处理中…" : "working…") + "</span>";
      out.appendChild(item);
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var maxW = Number(wEl.value) || 0;
        var scale = (maxW && img.width > maxW) ? maxW / img.width : 1;
        var cv = document.createElement("canvas");
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        var type = /png/i.test(file.type) ? "image/jpeg" : (file.type || "image/jpeg");
        cv.toBlob(function (blob) {
          if (!blob) { item.querySelector(".app-v").textContent = T.err; return; }
          var saved = Math.max(0, Math.round((1 - blob.size / file.size) * 100));
          var dl = URL.createObjectURL(blob);
          var ext = type === "image/jpeg" ? ".jpg" : (type === "image/webp" ? ".webp" : ".png");
          item.className = "app-item img-item done";
          item.innerHTML =
            '<span class="app-k">' + esc(file.name) + "</span>" +
            '<span class="app-v">' + human(file.size) + " → <strong>" + human(blob.size) + "</strong>" +
            (saved > 0 ? "  （-" + saved + "%）" : "") + " · " + cv.width + "×" + cv.height + "</span>" +
            '<img class="img-preview" src="' + dl + '" alt="">' +
            '<a class="app-btn" href="' + dl + '" download="' + esc(file.name.replace(/\.[^.]+$/, "")) + ext + '">' + esc(T.download) + "</a>";
        }, type, Number(qEl.value));
      };
      img.onerror = function () { item.querySelector(".app-v").textContent = T.err; };
      img.src = url;
    }
  }

  /* ---------- 6. 颜色 ---------- */
  function hexToRgb(hex) {
    var h = String(hex).trim().replace(/^#/, "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    var k = function (n) { return (n + h / 30) % 12; };
    var a = s * Math.min(l, 1 - l);
    var f = function (n) { return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
    var to = function (x) { return ("0" + Math.round(x * 255).toString(16)).slice(-2); };
    return "#" + to(f(0)) + to(f(8)) + to(f(4));
  }
  function colorApp() {
    var pick = el("cl-pick"), input = el("cl-in"), out = el("cl-out"), scale = el("cl-scale");
    function render(hex) {
      var rgb = hexToRgb(hex);
      if (!rgb) { out.innerHTML = '<div class="app-item"><code class="app-v">' + esc(T.err) + "</code></div>"; return; }
      var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      out.innerHTML = row2("HEX", hex.toLowerCase()) +
        row2("RGB", "rgb(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ")") +
        row2("HSL", "hsl(" + hsl.h + ", " + hsl.s + "%, " + hsl.l + "%)");
      scale.innerHTML = [5, 15, 25, 40, 50, 60, 75, 85, 95].map(function (l) {
        var c = hslToHex(hsl.h, hsl.s, l);
        return '<div class="swatch" style="background:' + c + '" title="' + c + '"></div>';
      }).join("");
    }
    input.addEventListener("input", function () {
      var v = input.value.trim();
      var m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(v);
      if (m) {
        v = "#" + [m[1], m[2], m[3]].map(function (x) { return ("0" + Number(x).toString(16)).slice(-2); }).join("");
        input.value = v;
      }
      if (!/^#/.test(v)) v = "#" + v;
      if (hexToRgb(v)) { pick.value = v; render(v); }
    });
    pick.addEventListener("input", function () { input.value = pick.value; render(pick.value); });
    render(pick.value);
  }

  /* ---------- 7. 命名风格 ---------- */
  function splitWords(s) {
    return String(s)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .replace(/[_\-.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim().split(" ").filter(Boolean)
      .map(function (w) { return w.toLowerCase(); });
  }
  function caseApp() {
    var src = el("cc-in"), out = el("cc-out");
    function run() {
      var w = splitWords(src.value);
      if (!w.length) { out.innerHTML = ""; return; }
      var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
      out.innerHTML = [
        ["camelCase", w[0] + w.slice(1).map(cap).join("")],
        ["PascalCase", w.map(cap).join("")],
        ["snake_case", w.join("_")],
        ["kebab-case", w.join("-")],
        ["CONSTANT_CASE", w.join("_").toUpperCase()],
        ["Title Case", w.map(cap).join(" ")]
      ].map(function (s) { return row2(s[0], s[1]); }).join("");
    }
    src.addEventListener("input", run);
  }

  /* ---------- 8. 密码 ---------- */
  function passwordApp() {
    var out = el("pw-out"), lenEl = el("pw-len"), lenV = el("pw-lenv"), countEl = el("pw-count");
    lenEl.addEventListener("input", function () { lenV.textContent = lenEl.value; });
    var POOLS = { up: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", low: "abcdefghijklmnopqrstuvwxyz",
                  num: "0123456789", sym: "!@#$%^&*()-_=+[]{};:,.?" };
    var AMB = "0O1lI|'\"";
    function rand(max) {
      var limit = Math.floor(4294967296 / max) * max;
      var a = new Uint32Array(1);
      do { crypto.getRandomValues(a); } while (a[0] >= limit);
      return a[0] % max;
    }
    function run() {
      var pool = "";
      Object.keys(POOLS).forEach(function (k) {
        var box = el("pw-" + k);
        if (box && box.checked) pool += POOLS[k];
      });
      if (el("pw-amb").checked) {
        pool = pool.split("").filter(function (c) { return AMB.indexOf(c) === -1; }).join("");
      }
      if (!pool) { out.innerHTML = '<div class="app-item"><code class="app-v">' + esc(T.empty) + "</code></div>"; return; }
      var len = Number(lenEl.value), count = Number(countEl.value) || 5;
      var lines = [];
      for (var i = 0; i < count; i++) {
        var p = "";
        for (var j = 0; j < len; j++) p += pool.charAt(rand(pool.length));
        lines.push(p);
      }
      out.setAttribute("data-raw", lines.join("\n"));
      out.innerHTML = lines.map(function (p) { return '<div class="app-item"><code class="app-v">' + esc(p) + "</code></div>"; }).join("");
    }
    bindActions(host, { gen: run });
    run();
  }

  /* ---------- 9. URL ---------- */
  function urlApp() {
    var src = el("ue-in"), out = el("ue-out");
    function mode() {
      var r = qsa('input[name="ue-mode"]').filter(function (x) { return x.checked; })[0];
      return r ? r.value : "component";
    }
    function run(dir) {
      var text = src.value;
      if (!text) { out.value = ""; return; }
      try {
        if (dir === "encode") out.value = mode() === "full" ? encodeURI(text) : encodeURIComponent(text);
        else out.value = mode() === "full" ? decodeURI(text) : decodeURIComponent(text);
      } catch (e) { out.value = T.err + ": " + e.message; }
    }
    bindActions(host, { encode: function () { run("encode"); }, decode: function () { run("decode"); } });
  }

  /* ---------- 10. 文本对比 ---------- */
  function diffApp() {
    function lcs(a, b) {
      var n = a.length, m = b.length, dp = [], i, j;
      for (i = 0; i <= n; i++) { var r = new Array(m + 1); for (j = 0; j <= m; j++) r[j] = 0; dp.push(r); }
      for (i = n - 1; i >= 0; i--) {
        for (j = m - 1; j >= 0; j--) {
          dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
      var out = [], x = 0, y = 0;
      while (x < n && y < m) {
        if (a[x] === b[y]) { out.push([" ", a[x]]); x++; y++; }
        else if (dp[x + 1][y] >= dp[x][y + 1]) { out.push(["-", a[x]]); x++; }
        else { out.push(["+", b[y]]); y++; }
      }
      while (x < n) out.push(["-", a[x++]]);
      while (y < m) out.push(["+", b[y++]]);
      return out;
    }
    function run() {
      var a = val("df-a").split("\n"), b = val("df-b").split("\n");
      var box = el("df-out");
      if (a.length > 2000 || b.length > 2000) { box.innerHTML = '<div class="diff-line">' + esc(T.err) + "</div>"; return; }
      var add = 0, del = 0, rows = [];
      lcs(a, b).forEach(function (p) {
        if (p[0] === "+") add++;
        if (p[0] === "-") del++;
        rows.push('<div class="diff-line ' + (p[0] === "+" ? "add" : p[0] === "-" ? "del" : "same") + '">' +
          '<span class="diff-sign">' + (p[0] === " " ? "&nbsp;" : p[0]) + "</span>" + esc(p[1]) + "</div>");
      });
      box.innerHTML = '<div class="diff-stat">+' + add + " / -" + del + "</div>" + rows.join("");
    }
    bindActions(host, {
      diff: run,
      clear: function () { setVal("df-a", ""); setVal("df-b", ""); el("df-out").innerHTML = ""; }
    });
  }

  /* ---------- 11. Markdown ---------- */
  var MD_PREFIX = String.fromCharCode(92) + "u";
  function mdInline(t) {
    return t
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  function splitRow(l) {
    return l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(function (c) { return c.trim(); });
  }
  function mdRender(src) {
    var s = String(src).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    var lines = s.split("\n"), html = [], i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (/^\s*```/.test(line)) {
        var code = []; i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i]); i++; }
        i++;
        html.push("<pre><code>" + code.join("\n") + "</code></pre>");
        continue;
      }
      var h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) { html.push("<h" + h[1].length + ">" + mdInline(h[2]) + "</h" + h[1].length + ">"); i++; continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { html.push("<hr>"); i++; continue; }
      if (/^>\s?/.test(line)) {
        var q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, "")); i++; }
        html.push("<blockquote>" + mdInline(q.join(" ")) + "</blockquote>");
        continue;
      }
      if (line.indexOf("|") !== -1 && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
        var head = splitRow(line); i += 2;
        var rows = [];
        while (i < lines.length && lines[i].indexOf("|") !== -1 && lines[i].trim()) { rows.push(splitRow(lines[i])); i++; }
        html.push("<table><thead><tr>" + head.map(function (c) { return "<th>" + mdInline(c) + "</th>"; }).join("") +
          "</tr></thead><tbody>" + rows.map(function (r) {
            return "<tr>" + r.map(function (c) { return "<td>" + mdInline(c) + "</td>"; }).join("") + "</tr>";
          }).join("") + "</tbody></table>");
        continue;
      }
      var li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
      if (li) {
        var ordered = /\d/.test(li[1]), items = [];
        while (i < lines.length) {
          var m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
          if (!m) break;
          var task = /^\[([ xX])\]\s+(.*)$/.exec(m[2]);
          if (task) {
            items.push('<li class="task"><input type="checkbox" disabled' + (task[1].toLowerCase() === "x" ? " checked" : "") + ">" + mdInline(task[2]) + "</li>");
          } else items.push("<li>" + mdInline(m[2]) + "</li>");
          i++;
        }
        html.push((ordered ? "<ol>" : "<ul>") + items.join("") + (ordered ? "</ol>" : "</ul>"));
        continue;
      }
      if (/^\s*$/.test(line)) { i++; continue; }
      var para = [];
      while (i < lines.length && lines[i].trim() &&
             !/^(#{1,6}\s|>|\s*```|\s*([-*+]|\d+[.)])\s)/.test(lines[i])) { para.push(lines[i]); i++; }
      html.push("<p>" + mdInline(para.join(" ")) + "</p>");
    }
    return html.join("\n");
  }
  function markdownApp() {
    var src = el("md-in"), out = el("md-out");
    var timer = null;
    function run() {
      clearTimeout(timer);
      timer = setTimeout(function () { out.innerHTML = mdRender(src.value); }, 120);
    }
    src.addEventListener("input", run);
  }

  /* ---------- 12. 正则 ---------- */
  function regexApp() {
    var pat = el("re-pat"), fl = el("re-flags"), src = el("re-in");
    function run() {
      var text = src.value, p = pat.value;
      if (!p) { msg("re-msg", ""); el("re-out").innerHTML = ""; el("re-hl").innerHTML = esc(text); return; }
      var re;
      try { re = new RegExp(p, fl.value); }
      catch (e) { msg("re-msg", e.message, "err"); el("re-out").innerHTML = ""; el("re-hl").innerHTML = esc(text); return; }
      var matches = [], m, guard = 0, global = fl.value.indexOf("g") !== -1;
      if (global) {
        re.lastIndex = 0;
        while ((m = re.exec(text)) !== null && guard++ < 5000) {
          matches.push({ index: m.index, full: m[0], groups: Array.prototype.slice.call(m, 1) });
          if (m.index === re.lastIndex) re.lastIndex++;
        }
      } else {
        m = re.exec(text);
        if (m) matches.push({ index: m.index, full: m[0], groups: Array.prototype.slice.call(m, 1) });
      }
      msg("re-msg", matches.length + (LANG === "zh" ? " 个匹配" : " match(es)"), matches.length ? "ok" : "err");
      var hl = "", last = 0;
      matches.forEach(function (mm) {
        hl += esc(text.slice(last, mm.index)) + "<mark>" + esc(mm.full) + "</mark>";
        last = mm.index + mm.full.length;
      });
      hl += esc(text.slice(last));
      el("re-hl").innerHTML = hl || '<span class="app-hint">' + (LANG === "zh" ? "（无内容）" : "(nothing)") + "</span>";
      el("re-out").innerHTML = matches.slice(0, 40).map(function (mm, i) {
        var g = mm.groups.map(function (v, j) { return "$" + (j + 1) + "=" + (v === undefined ? "—" : v); }).join("  ");
        return row2("#" + (i + 1) + " @" + mm.index, mm.full + (g ? "    " + g : ""));
      }).join("");
    }
    ["re-pat", "re-flags", "re-in"].forEach(function (id) { el(id).addEventListener("input", run); });
    run();
  }

  /* ---------- 13. 字数统计 ---------- */
  function countCJK(t) {
    var n = 0;
    for (var i = 0; i < t.length; i++) { var c = t.charCodeAt(i); if (c >= 0x4e00 && c <= 0x9fff) n++; }
    return n;
  }
  function wordCountApp() {
    var src = el("wc-in"), out = el("wc-out");
    function run() {
      var t = src.value;
      var cjk = countCJK(t);
      var words = (t.match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
      var lines = t ? t.split("\n").length : 0;
      var paras = t.trim() ? t.split(/\n\s*\n/).filter(function (x) { return x.trim(); }).length : 0;
      var mins = cjk / 400 + words / 220;
      var readTxt = mins < 1 ? (LANG === "zh" ? "不到 1 分钟" : "under 1 min")
        : (LANG === "zh" ? Math.ceil(mins) + " 分钟" : Math.ceil(mins) + " min");
      var zh = LANG === "zh";
      out.innerHTML =
        row2(zh ? "总字符" : "Characters", t.length) +
        row2(zh ? "不含空格" : "No spaces", t.replace(/\s/g, "").length) +
        row2(zh ? "中文字符" : "CJK chars", cjk) +
        row2(zh ? "英文单词" : "Words", words) +
        row2(zh ? "行数" : "Lines", lines) +
        row2(zh ? "段落" : "Paragraphs", paras) +
        row2(zh ? "预计阅读" : "Read time", readTxt);
    }
    src.addEventListener("input", run);
  }

  /* ---------- 14. 文本批处理 ---------- */
  function randInt(max) {
    var limit = Math.floor(4294967296 / max) * max, a = new Uint32Array(1);
    do { crypto.getRandomValues(a); } while (a[0] >= limit);
    return a[0] % max;
  }
  function textToolsApp() {
    var src = el("tt-in"), out = el("tt-out");
    function cur() { return (out.value || src.value).split("\n"); }
    function put(a) { out.value = a.join("\n"); }
    bindActions(host, {
      dedupe: function () { var seen = {}; put(cur().filter(function (l) { var k = l.trim(); if (seen[k]) return false; seen[k] = 1; return true; })); },
      sort: function () { put(cur().slice().sort(function (a, b) { return a.localeCompare(b, "zh"); })); },
      sortDesc: function () { put(cur().slice().sort(function (a, b) { return b.localeCompare(a, "zh"); })); },
      trim: function () { put(cur().map(function (l) { return l.trim(); })); },
      dropEmpty: function () { put(cur().filter(function (l) { return l.trim(); })); },
      shuffle: function () {
        var a = cur().slice();
        for (var i = a.length - 1; i > 0; i--) { var j = randInt(i + 1); var tmp = a[i]; a[i] = a[j]; a[j] = tmp; }
        put(a);
      }
    });
  }

  /* ---------- 15. JWT ---------- */
  function b64urlDecode(s) {
    s = String(s).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function rowPre(k, v) {
    return '<div class="app-item pre"><span class="app-k">' + esc(k) + "</span><pre class=\"app-pre\">" + esc(v) + "</pre></div>";
  }
  function jwtApp() {
    var src = el("jwt-in"), out = el("jwt-out");
    function run() {
      var t = src.value.trim();
      out.innerHTML = ""; msg("jwt-msg", "");
      if (!t) return;
      var parts = t.split(".");
      if (parts.length < 2) { msg("jwt-msg", LANG === "zh" ? "不是有效的 JWT（至少要有两段）" : "Not a valid JWT", "err"); return; }
      try {
        var head = JSON.parse(b64urlDecode(parts[0]));
        var body = JSON.parse(b64urlDecode(parts[1]));
        out.innerHTML = rowPre("Header", JSON.stringify(head, null, 2)) + rowPre("Payload", JSON.stringify(body, null, 2));
        if (body.exp) {
          var left = body.exp * 1000 - Date.now();
          msg("jwt-msg", left > 0
            ? (LANG === "zh" ? "有效，还有 " + Math.round(left / 60000) + " 分钟过期" : "Valid, " + Math.round(left / 60000) + " min left")
            : (LANG === "zh" ? "已于 " + new Date(body.exp * 1000).toLocaleString() + " 过期" : "Expired at " + new Date(body.exp * 1000).toISOString()),
            left > 0 ? "ok" : "err");
        } else {
          msg("jwt-msg", LANG === "zh" ? "解析成功（这个 token 没有 exp 字段）" : "Decoded (no exp claim)", "ok");
        }
      } catch (e) { msg("jwt-msg", T.err + ": " + e.message, "err"); }
    }
    src.addEventListener("input", run);
  }

  /* ---------- 16. 进制转换 ---------- */
  function numberBaseApp() {
    var src = el("nb-in"), from = el("nb-from"), out = el("nb-out");
    function run() {
      var raw = src.value.trim().replace(/^0[bxo]/i, "");
      if (!raw) { out.innerHTML = ""; return; }
      var n = parseInt(raw, Number(from.value));
      if (isNaN(n)) { out.innerHTML = row2("—", T.err); return; }
      var zh = LANG === "zh";
      out.innerHTML =
        row2("HEX", "0x" + n.toString(16).toUpperCase()) +
        row2("DEC", String(n)) +
        row2("OCT", "0o" + n.toString(8)) +
        row2("BIN", "0b" + n.toString(2)) +
        row2(zh ? "32 位有符号" : "int32", String(n | 0)) +
        row2(zh ? "32 位无符号" : "uint32", String(n >>> 0));
    }
    src.addEventListener("input", run);
    from.addEventListener("change", run);
    run();
  }

  /* ---------- 17. 转义 ---------- */
  function escapeApp() {
    var src = el("es-in"), out = el("es-out");
    var bs = String.fromCharCode(92);
    var uniRe = new RegExp(bs + bs + "u([0-9a-fA-F]{4})", "g");
    bindActions(host, {
      htmlEnc: function () {
        out.value = src.value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
      },
      htmlDec: function () {
        out.value = src.value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
      },
      uniEnc: function () {
        var s = "";
        for (var i = 0; i < src.value.length; i++) {
          var c = src.value.charCodeAt(i);
          s += (c > 126 || c < 32) ? MD_PREFIX + ("000" + c.toString(16)).slice(-4) : src.value.charAt(i);
        }
        out.value = s;
      },
      uniDec: function () {
        out.value = src.value.replace(uniRe, function (_, hex) { return String.fromCharCode(parseInt(hex, 16)); });
      },
      jsonStr: function () {
        var j = JSON.stringify(src.value);
        out.value = j.slice(1, -1);
      }
    });
  }

  /* ---------- 18. CSV ↔ JSON ---------- */
  function parseCSV(text) {
    var clean = String(text).replace(new RegExp("^" + String.fromCharCode(0xFEFF)), "");
    var rows = [], row = [], field = "", inQ = false;
    for (var i = 0; i < clean.length; i++) {
      var ch = clean.charAt(i);
      if (inQ) {
        if (ch === '"') {
          if (clean.charAt(i + 1) === '"') { field += '"'; i++; } else inQ = false;
        } else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch !== "\r") field += ch;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.length > 1 || (r[0] || "").trim() !== ""; });
  }
  function csvCell(v) {
    var s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvJsonApp() {
    var src = el("cj-in"), out = el("cj-out");
    bindActions(host, {
      csv2json: function () {
        var rows = parseCSV(src.value);
        if (rows.length < 2) { msg("cj-msg", LANG === "zh" ? "至少需要表头 + 一行数据" : "Need a header and at least one row", "err"); out.value = ""; return; }
        var head = rows[0];
        var list = rows.slice(1).map(function (r) {
          var o = {};
          head.forEach(function (k, i) { o[k.trim()] = r[i] === undefined ? "" : r[i]; });
          return o;
        });
        out.value = JSON.stringify(list, null, 2);
        msg("cj-msg", list.length + (LANG === "zh" ? " 行 → JSON 数组" : " rows → JSON"), "ok");
      },
      json2csv: function () {
        var data;
        try { data = JSON.parse(src.value); } catch (e) { msg("cj-msg", e.message, "err"); out.value = ""; return; }
        if (!Array.isArray(data) || !data.length) { msg("cj-msg", LANG === "zh" ? "需要一个非空 JSON 数组" : "Need a non-empty JSON array", "err"); out.value = ""; return; }
        var keys = [];
        data.forEach(function (o) { Object.keys(o).forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); }); });
        var lines = [keys.map(csvCell).join(",")];
        data.forEach(function (o) { lines.push(keys.map(function (k) { return csvCell(o[k]); }).join(",")); });
        out.value = lines.join("\n");
        msg("cj-msg", data.length + (LANG === "zh" ? " 条 → CSV" : " records → CSV"), "ok");
      }
    });
  }

  /* ---------- 19. 图片格式转换 ---------- */
  function imageConvertApp() {
    var fileEl = el("icv-file"), out = el("icv-out"), tEl = el("icv-type"), qEl = el("icv-q"), wEl = el("icv-w"), qv = el("icv-qv");
    qEl.addEventListener("input", function () { qv.textContent = Number(qEl.value).toFixed(2); });
    fileEl.addEventListener("change", function () {
      out.innerHTML = "";
      Array.prototype.slice.call(fileEl.files || []).forEach(process);
    });
    function process(file) {
      var item = document.createElement("div");
      item.className = "app-item img-item";
      item.innerHTML = '<span class="app-k">' + esc(file.name) + "</span><span class=\"app-v\">" +
        (LANG === "zh" ? "处理中…" : "working…") + "</span>";
      out.appendChild(item);
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var maxW = Number(wEl.value) || 0;
        var scale = (maxW && img.width > maxW) ? maxW / img.width : 1;
        var cv = document.createElement("canvas");
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        var ctx = cv.getContext("2d");
        if (tEl.value === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); }
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(function (blob) {
          if (!blob) { item.querySelector(".app-v").textContent = T.err; return; }
          var dl = URL.createObjectURL(blob);
          var ext = tEl.value === "image/webp" ? ".webp" : (tEl.value === "image/jpeg" ? ".jpg" : ".png");
          item.className = "app-item img-item done";
          item.innerHTML =
            '<span class="app-k">' + esc(file.name) + "</span>" +
            '<span class="app-v">' + human(file.size) + " → <strong>" + human(blob.size) + "</strong> · " +
            cv.width + "×" + cv.height + " · " + ext.slice(1).toUpperCase() + "</span>" +
            '<img class="img-preview" src="' + dl + '" alt="">' +
            '<a class="app-btn" href="' + dl + '" download="' + esc(file.name.replace(/\.[^.]+$/, "")) + ext + '">' + esc(T.download) + "</a>";
        }, tEl.value, Number(qEl.value));
      };
      img.onerror = function () { item.querySelector(".app-v").textContent = T.err; };
      img.src = url;
    }
  }

  /* ---------- 20. Cron ---------- */
  function parseCronField(expr, min, max) {
    var set = {};
    String(expr).split(",").forEach(function (part) {
      var step = 1, body = part;
      var slash = part.indexOf("/");
      if (slash !== -1) { body = part.slice(0, slash); step = Number(part.slice(slash + 1)) || 1; }
      var lo, hi;
      if (body === "*" || body === "") { lo = min; hi = max; }
      else if (body.indexOf("-") !== -1) { var seg = body.split("-"); lo = Number(seg[0]); hi = Number(seg[1]); }
      else { lo = hi = Number(body); }
      if (isNaN(lo) || isNaN(hi)) return;
      for (var v = lo; v <= hi; v += step) if (v >= min && v <= max) set[v] = 1;
    });
    return set;
  }
  function cronApp() {
    var src = el("cr-in"), out = el("cr-out");
    var NAMES = LANG === "zh"
      ? ["分钟", "小时", "日", "月", "星期"]
      : ["minute", "hour", "day", "month", "weekday"];
    var WD = LANG === "zh"
      ? ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    function describe(part, idx) {
      var f = String(part).trim();
      if (f === "*") return LANG === "zh" ? "每" + NAMES[idx] : "every " + NAMES[idx];
      if (f.indexOf("/") !== -1 && f.indexOf("*") === 0) return (LANG === "zh" ? "每 " : "every ") + f.split("/")[1] + " " + NAMES[idx];
      return f;
    }
    function run() {
      var raw = src.value.trim();
      out.innerHTML = ""; msg("cr-msg", "");
      var parts = raw.split(/\s+/);
      if (parts.length !== 5) { msg("cr-msg", LANG === "zh" ? "需要 5 段：分 时 日 月 周" : "Need 5 fields: min hour day month weekday", "err"); return; }
      var mins = parseCronField(parts[0], 0, 59), hrs = parseCronField(parts[1], 0, 23);
      var dom = parseCronField(parts[2], 1, 31), mon = parseCronField(parts[3], 1, 12);
      var wd = parseCronField(parts[4].replace(/7/g, "0"), 0, 6);
      if (!Object.keys(mins).length || !Object.keys(hrs).length) { msg("cr-msg", LANG === "zh" ? "表达式无法解析" : "Cannot parse", "err"); return; }
      var zh = LANG === "zh";
      out.innerHTML = parts.map(function (p, i) { return row2(NAMES[i], describe(p, i)); }).join("");
      // 接下来 5 次
      var next = [], d = new Date();
      d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1);
      for (var i = 0; i < 527040 && next.length < 5; i++) {
        var m = d.getMinutes(), h = d.getHours(), day = d.getDate(), mo = d.getMonth() + 1, w = d.getDay();
        if (mins[m] && hrs[h] && dom[day] && mon[mo] && wd[w]) next.push(new Date(d.getTime()));
        d.setMinutes(d.getMinutes() + 1);
      }
      if (next.length) {
        out.innerHTML += row2(zh ? "接下来 5 次" : "Next 5 runs",
          next.map(function (x) { return fmtDate(x) + " " + WD[x.getDay()]; }).join("\n"));
        msg("cr-msg", zh ? "解析成功" : "Parsed", "ok");
      } else {
        msg("cr-msg", zh ? "未来一年内没有匹配时间" : "No match within a year", "err");
      }
    }
    src.addEventListener("input", run);
    bindActions(host, { });
    qsa("[data-preset]").forEach(function (b) {
      b.addEventListener("click", function () { src.value = b.getAttribute("data-preset"); run(); });
    });
    run();
  }

  var APPS = {
    "json-format": jsonFormat, "base64": base64App, "hash": hashApp, "timestamp": timestampApp,
    "image-compress": imageCompressApp, "color": colorApp, "case-convert": caseApp,
    "password": passwordApp, "url-encode": urlApp, "diff": diffApp,
    "markdown": markdownApp, "regex": regexApp, "word-count": wordCountApp, "text-tools": textToolsApp,
    "jwt": jwtApp, "number-base": numberBaseApp, "escape": escapeApp, "csv-json": csvJsonApp,
    "image-convert": imageConvertApp, "cron": cronApp
  };
  if (APPS[kind]) APPS[kind]();
  bindCopy(host);
})();
