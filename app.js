/* 开源工具集 —— 零依赖前端：过滤已渲染的静态 DOM（不再 fetch 数据） */
(function () {
  "use strict";

  var L = window.__I18N__ || {};
  var LANG = window.__LANG__ || "zh";
  var USAGE_ORDER = ["online", "selfhost", "desktop", "extension", "mobile", "cli", "lib", "list"];
  var CATEGORY_ORDER = Object.keys(L.categories || {});
  var FAV_KEY = "gh-tools:favs";
  var THEME_KEY = "gh-tools:theme";

  var cards = [];
  var state = {
    query: "", scene: "all", usage: "all", category: "all",
    // P3：默认排序改为最新（按 data-added，即 addedAt 或 pushedAt）；星数排序保留，
    // 但只对有 GitHub 的子集有意义——无 GitHub 工具卡片上不显示星数（见 build-pages card）
    sort: "latest", form: "all", price: "all", onlyFav: false, favs: loadFavs()
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function loadFavs() {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); }
    catch (e) { return new Set(); }
  }
  function saveFavs() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(state.favs))); } catch (e) {}
  }
  function countText(tpl, n, total) {
    return String(tpl || "{n} / {total}")
      .replace("{n}", String(n)).replace("{total}", String(total));
  }

  window.iconFail = function (img) {
    var span = document.createElement("span");
    span.className = "icon-fallback";
    span.textContent = (img.getAttribute("data-initial") || "?").charAt(0);
    img.parentNode.replaceChild(span, img);
  };

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var btn = document.getElementById("theme-toggle");
    if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (saved) return applyTheme(saved);
    applyTheme("dark");
  }

  function readCards() {
    var grid = document.getElementById("grid");
    if (!grid) return [];
    return Array.prototype.map.call(grid.querySelectorAll(".card"), function (el) {
      return {
        el: el,
        id: el.getAttribute("data-id") || "",
        scene: el.getAttribute("data-scene") || "general",
        usage: (el.getAttribute("data-usage") || "").split(" ").filter(Boolean),
        category: el.getAttribute("data-category") || "",
        stars: Number(el.getAttribute("data-stars")) || 0,
        sponsored: el.getAttribute("data-sponsored") === "1",
        name: el.getAttribute("data-name") || "",
        updated: el.getAttribute("data-updated") || "",
        added: el.getAttribute("data-added") || el.getAttribute("data-updated") || "",
        form: el.getAttribute("data-form") || "",
        price: el.getAttribute("data-price") || "",
        votes: Number(el.getAttribute("data-votes")) || 0,
        // 可见文本直接从 DOM 读，避免在 HTML 里再存一份；
        // data-extra 只带另一种语言的描述/标签和中文别名
        search: [
          el.getAttribute("data-name") || "",
          (function () { var n = el.querySelector(".card-repo"); return n ? n.textContent : ""; })(),
          (function () { var n = el.querySelector(".card-desc"); return n ? n.textContent : ""; })(),
          (function () { var n = el.querySelector(".tags"); return n ? n.textContent : ""; })(),
          el.getAttribute("data-extra") || ""
        ].join(" ").toLowerCase()
      };
    });
  }

  function afterScene() {
    return cards.filter(function (c) {
      if (state.onlyFav && !state.favs.has(c.id)) return false;
      if (state.scene !== "all" && c.scene !== state.scene) return false;
      return true;
    });
  }
  function afterUsage() {
    return afterScene().filter(function (c) {
      return state.usage === "all" || c.usage.indexOf(state.usage) !== -1;
    });
  }
  function matches(c) {
    if (state.category !== "all" && c.category !== state.category) return false;
    // 形态未知（CLI-only 等老工具无 form 派生）只在“全部形态”下出现，不硬编形态
    if (state.form !== "all" && c.form !== state.form) return false;
    if (state.price !== "all" && c.price !== state.price) return false;
    if (state.query && c.search.indexOf(state.query) === -1) return false;
    return true;
  }

  function afterCategory() {
    return afterUsage().filter(function (c) {
      return state.category === "all" || c.category === state.category;
    });
  }

  function sortCards() {
    var grid = document.getElementById("grid");
    if (!grid) return;
    if (state.sort === "name") {
      cards.sort(function (a, b) { return a.name.localeCompare(b.name, LANG === "en" ? "en" : "zh"); });
    } else if (state.sort === "updated") {
      cards.sort(function (a, b) { return b.updated.localeCompare(a.updated); });
    } else if (state.sort === "trending") {
      // 今日热门：按点赞数排，无点赞数据时（全为 0）自然退化为按最新排，不编造热度
      cards.sort(function (a, b) {
        if (b.votes !== a.votes) return b.votes - a.votes;
        return b.added.localeCompare(a.added);
      });
    } else if (state.sort === "latest") {
      cards.sort(function (a, b) { return b.added.localeCompare(a.added); });
    } else {
      // 默认按星数排序时，联盟赞助卡片置顶（首屏可见），其余按星数
      cards.sort(function (a, b) {
        if (!!a.sponsored !== !!b.sponsored) return a.sponsored ? -1 : 1;
        return b.stars - a.stars;
      });
    }
    cards.forEach(function (c) { grid.appendChild(c.el); });
  }

  function renderSceneButtons() {
    var host = document.querySelector(".scene-switch");
    if (!host) return;
    var pool = cards.filter(function (c) { return !state.onlyFav || state.favs.has(c.id); });
    var counts = { all: pool.length, general: 0, overseas: 0 };
    pool.forEach(function (c) { counts[c.scene] = (counts[c.scene] || 0) + 1; });

    Array.prototype.forEach.call(host.querySelectorAll(".scene-btn"), function (btn) {
      var key = btn.getAttribute("data-scene");
      if (!btn.getAttribute("data-label")) btn.setAttribute("data-label", btn.textContent.trim());
      var label = btn.getAttribute("data-label");
      btn.innerHTML = esc(label) + ' <span class="chip-n">' + (counts[key] || 0) + "</span>";
      btn.classList.toggle("active", state.scene === key);
      if (!btn.getAttribute("data-bound")) {
        btn.setAttribute("data-bound", "1");
        btn.addEventListener("click", function () {
          state.scene = key;
          state.usage = "all";
          state.category = "all";
          render();
        });
      }
    });
  }

  function renderUsageChips() {
    var host = document.getElementById("usage-chips");
    if (!host) return;
    var pool = afterScene();
    var counts = { all: pool.length };
    pool.forEach(function (c) {
      USAGE_ORDER.forEach(function (u) {
        if (c.usage.indexOf(u) !== -1) counts[u] = (counts[u] || 0) + 1;
      });
    });
    var order = ["all"].concat(USAGE_ORDER.filter(function (u) { return counts[u]; }));
    host.innerHTML = order.map(function (key) {
      var label = key === "all" ? (L.allUsage || "All") : ((L.usages || {})[key] || key);
      var active = state.usage === key ? " active" : "";
      return '<button class="chip chip-lg' + active + '" data-usage="' + key + '">' +
        esc(label) + ' <span class="chip-n">' + (counts[key] || 0) + "</span></button>";
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll(".chip"), function (btn) {
      btn.addEventListener("click", function () {
        state.usage = btn.getAttribute("data-usage");
        state.category = "all";
        render();
      });
    });
  }

  var openGroups = {};
  // 11 个主分类平铺展示（旧 50 分类已在 P1 并入 11 个主分类）
  function renderCategoryChips() {
    var host = document.getElementById("chips");
    if (!host) return;
    var pool = afterUsage();
    var counts = {};
    pool.forEach(function (c) { counts[c.category] = (counts[c.category] || 0) + 1; });

    var groups = L.categoryGroups || [];
    var inGroup = {};
    groups.forEach(function (g) { g.cats.forEach(function (k) { inGroup[k] = 1; }); });

    function chip(key) {
      var label = (L.categories || {})[key] || key;
      var active = state.category === key ? " active" : "";
      return '<button class="chip' + active + '" data-cat="' + key + '">' +
        esc(label) + ' <span class="chip-n">' + (counts[key] || 0) + "</span></button>";
    }

    var html = '<button class="chip' + (state.category === "all" ? " active" : "") + '" data-cat="all">' +
      esc(L.allCategories || "All") + ' <span class="chip-n">' + pool.length + "</span></button>";

    groups.forEach(function (g) {
      var cats = g.cats.filter(function (k) { return counts[k]; });
      if (!cats.length) return;
      var total = cats.reduce(function (s, k) { return s + counts[k]; }, 0);
      var open = openGroups[g.key] || cats.indexOf(state.category) !== -1;
      html += '<details class="side-group" data-group="' + g.key + '"' + (open ? " open" : "") + ">" +
        "<summary>" + esc(LANG === "zh" ? g.zh : g.en) +
        ' <span class="side-group-n">' + total + "</span></summary>" +
        '<div class="side-group-body">' + cats.map(chip).join("") + "</div></details>";
    });

    var rest = Object.keys(counts).filter(function (k) { return !inGroup[k]; }).sort();
    if (rest.length) html += rest.map(chip).join("");

    host.innerHTML = html;

    Array.prototype.forEach.call(host.querySelectorAll(".chip"), function (btn) {
      btn.addEventListener("click", function () {
        state.category = btn.getAttribute("data-cat");
        render();
      });
    });
    Array.prototype.forEach.call(host.querySelectorAll(".side-group"), function (d) {
      d.addEventListener("toggle", function () { openGroups[d.getAttribute("data-group")] = d.open; });
    });
  }

  // P3：形态 / 价格筛选的左侧计数按当前（场景+使用方式+分类）池子重算，不用旧合计数
  function renderFormPriceFilters() {
    var pool = afterCategory();
    [["form-filter", "form"], ["price-filter", "price"]].forEach(function (pair) {
      var sel = document.getElementById(pair[0]);
      // 最小 DOM 桩（smoke）没有 options，跳过；真实浏览器才有
      if (!sel || !sel.options) return;
      var key = pair[1];
      var counts = { all: pool.length };
      pool.forEach(function (c) { if (c[key]) counts[c[key]] = (counts[c[key]] || 0) + 1; });
      Array.prototype.forEach.call(sel.options, function (opt) {
        if (!opt.getAttribute("data-label")) opt.setAttribute("data-label", opt.textContent.trim().replace(/\s*\(\d+\)\s*$/, ""));
        var label = opt.getAttribute("data-label");
        var n = counts[opt.value];
        opt.textContent = n == null ? label : label + " (" + n + ")";
      });
    });
  }

  function applyFilters() {
    var visible = afterUsage().filter(matches);
    var shown = new Set(visible.map(function (c) { return c.id; }));
    cards.forEach(function (c) { c.el.hidden = !shown.has(c.id); });

    var empty = document.getElementById("empty");
    if (empty) empty.hidden = visible.length > 0;
    var emptyText = document.getElementById("empty-text");
    if (emptyText && !visible.length) {
      emptyText.textContent = state.onlyFav ? (L.emptyFav || "") : (L.emptyMatch || "");
    }
    var rc = document.getElementById("result-count");
    if (rc) rc.textContent = countText(L.countTemplate, visible.length, cards.length);
    var fc = document.getElementById("fav-count");
    if (fc) fc.textContent = String(state.favs.size);
  }

  function render() {
    renderSceneButtons();
    renderUsageChips();
    renderCategoryChips();
    renderFormPriceFilters();
    applyFilters();
  }

  function syncFavButtons() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-fav]"), function (btn) {
      var id = btn.getAttribute("data-fav");
      var on = state.favs.has(id);
      btn.textContent = on ? "★" : "☆";
      btn.classList.toggle("on", on);
      if (!btn.getAttribute("data-bound")) {
        btn.setAttribute("data-bound", "1");
        btn.addEventListener("click", function () {
          if (state.favs.has(id)) state.favs.delete(id); else state.favs.add(id);
          saveFavs();
          syncFavButtons();
          if (document.getElementById("grid")) render();
        });
      }
    });
  }

  function bind() {
    var input = document.getElementById("search");
    if (input) {
      var timer = null;
      input.addEventListener("input", function () {
        var clear = document.getElementById("clear-search");
        if (clear) clear.hidden = !input.value;
        clearTimeout(timer);
        timer = setTimeout(function () {
          state.query = input.value.trim().toLowerCase();
          render();
        }, 120);
      });
      var clearBtn = document.getElementById("clear-search");
      if (clearBtn) {
        clearBtn.addEventListener("click", function () {
          input.value = ""; state.query = ""; clearBtn.hidden = true; render(); input.focus();
        });
      }
      document.addEventListener("keydown", function (e) {
        if (e.key === "/" && document.activeElement !== input) { e.preventDefault(); input.focus(); }
        if (e.key === "Escape" && document.activeElement === input) {
          input.value = ""; state.query = ""; input.blur(); render();
        }
      });
    }

    var sort = document.getElementById("sort");
    if (sort) {
      sort.addEventListener("change", function () { state.sort = this.value; sortCards(); applyFilters(); });
    }
    var formSel = document.getElementById("form-filter");
    if (formSel) {
      formSel.addEventListener("change", function () { state.form = this.value; render(); });
    }
    var priceSel = document.getElementById("price-filter");
    if (priceSel) {
      priceSel.addEventListener("change", function () { state.price = this.value; render(); });
    }
    var themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", function () {
        applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
      });
    }
    var favToggle = document.getElementById("fav-toggle");
    if (favToggle) {
      favToggle.addEventListener("click", function () {
        state.onlyFav = !state.onlyFav;
        this.classList.toggle("active", state.onlyFav);
        render();
      });
    }
    var reset = document.getElementById("reset-filters");
    if (reset) {
      reset.addEventListener("click", function () {
        state.query = ""; state.scene = "all"; state.usage = "all"; state.category = "all"; state.form = "all"; state.price = "all"; state.onlyFav = false;
        var fs = document.getElementById("form-filter"); if (fs) fs.value = "all";
        var ps = document.getElementById("price-filter"); if (ps) ps.value = "all";
        if (input) { input.value = ""; }
        var clear = document.getElementById("clear-search");
        if (clear) clear.hidden = true;
        if (favToggle) favToggle.classList.remove("active");
        render();
      });
    }
  }

  /* ---------- 复制部署命令 ---------- */
  function bindCopyButtons() {
    Array.prototype.forEach.call(document.querySelectorAll(".copy-btn[data-copy]"), function (btn) {
      btn.addEventListener("click", function () {
        var text = btn.getAttribute("data-copy") || "";
        var done = function () {
          var old = btn.textContent;
          btn.textContent = LANG === "en" ? "Copied" : "已复制";
          btn.classList.add("done");
          setTimeout(function () { btn.textContent = old; btn.classList.remove("done"); }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
        } else {
          fallbackCopy(text, done);
        }
      });
    });
  }
  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* ---------- 侧边栏 ---------- */
  var SIDEBAR_KEY = "gh-tools:sidebar";

  function bindSidebar() {
    var toggle = document.getElementById("menu-toggle");
    var close = document.getElementById("sidebar-close");
    var backdrop = document.getElementById("sidebar-backdrop");
    // document.body 不存在时直接跳过（测试环境）
    if (!toggle || !document.body || !document.body.classList) return;

    var isMobile = function () {
      return !!(window.matchMedia && window.matchMedia("(max-width: 900px)").matches);
    };

    try {
      if (localStorage.getItem(SIDEBAR_KEY) === "closed") document.body.classList.add("sidebar-collapsed");
    } catch (e) {}

    toggle.addEventListener("click", function () {
      if (isMobile()) {
        document.body.classList.toggle("sidebar-open");
      } else {
        var closed = document.body.classList.toggle("sidebar-collapsed");
        try { localStorage.setItem(SIDEBAR_KEY, closed ? "closed" : "open"); } catch (e) {}
      }
    });

    var shut = function () { document.body.classList.remove("sidebar-open"); };
    if (close) close.addEventListener("click", shut);
    if (backdrop) backdrop.addEventListener("click", shut);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") document.body.classList.remove("sidebar-open");
    });
  }

  /* ---------- P6 点赞 / 试用点击 / 浏览（最小可用版） ---------- */
  var VOTE_KEY = "gh-tools:votes";
  var VOTE_TOKEN_KEY = "gh-tools:vote-token";
  function loadVoteSet() {
    try { return new Set(JSON.parse(localStorage.getItem(VOTE_KEY) || "[]")); }
    catch (e) { return new Set(); }
  }
  function saveVoteSet(s) {
    try { localStorage.setItem(VOTE_KEY, JSON.stringify(Array.from(s))); } catch (e) {}
  }
  function voteToken() {
    try {
      var tk = localStorage.getItem(VOTE_TOKEN_KEY);
      if (!tk) {
        var bytes = new Uint8Array(16);
        if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
        else for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
        tk = Array.prototype.map.call(bytes, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
        localStorage.setItem(VOTE_TOKEN_KEY, tk);
      }
      return tk;
    } catch (e) { return ""; }
  }
  function bindVoteButtons() {
    var voted = loadVoteSet();
    Array.prototype.forEach.call(document.querySelectorAll("[data-vote]"), function (btn) {
      var id = btn.getAttribute("data-vote");
      var num = btn.querySelector(".vote-n");
      if (voted.has(id)) btn.classList.add("on");
      if (!btn.getAttribute("data-vote-bound")) {
        btn.setAttribute("data-vote-bound", "1");
        btn.addEventListener("click", function () {
          if (voted.has(id)) return; // 同一浏览器重复点赞不重复计（前端也挡一道）
          var fd = new FormData();
          fd.append("tool_id", id);
          fd.append("voter_token", voteToken());
          fetch("/api/vote.php", { method: "POST", body: fd, credentials: "same-origin" })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (d && d.ok) {
                voted.add(id); saveVoteSet(voted);
                btn.classList.add("on");
                if (num) num.textContent = String(d.count);
              }
            }).catch(function () {});
        });
      }
    });
    // 已点赞工具刷新真实计数（只查已点赞的少量工具，不全量拉 841 个）
    if (voted.size && window.fetch) {
      voted.forEach(function (id) {
        fetch("/api/vote.php?tool_id=" + encodeURIComponent(id), { credentials: "same-origin" })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d && d.ok) {
              Array.prototype.forEach.call(document.querySelectorAll('[data-vote="' + id + '"] .vote-n'), function (n) { n.textContent = String(d.count); });
            }
          }).catch(function () {});
      });
    }
  }
  function bindTryClicks() {
    // 主按钮（卡片 / 详情页 / 常驻试用条）点击时用 sendBeacon 记一笔试用点击，不阻塞跳转
    Array.prototype.forEach.call(document.querySelectorAll(".card .btn-primary, .detail-actions .btn-primary, .detail-trybar .btn-primary"), function (a) {
      if (a.getAttribute("data-try-bound")) return;
      a.setAttribute("data-try-bound", "1");
      a.addEventListener("click", function () {
        var article = a.closest ? a.closest("[data-id]") : null;
        var id = article ? article.getAttribute("data-id") : null;
        if (!id) {
          var fav = document.querySelector("[data-fav]");
          id = fav ? fav.getAttribute("data-fav") : null;
        }
        if (!id || !navigator.sendBeacon) return;
        var fd = new FormData();
        fd.append("tool_id", id);
        try { navigator.sendBeacon("/api/try.php", fd); } catch (e) {}
      });
    });
  }
  function trackDetailView() {
    // 详情页浏览：只在详情页触发（有 .detail 且无 #grid）；首页不触发，避免误记首张卡片
    if (!document.querySelector(".detail") || document.getElementById("grid")) return;
    var fav = document.querySelector("[data-fav]");
    if (!fav || !navigator.sendBeacon) return;
    var id = fav.getAttribute("data-fav");
    var key = "gh-tools:viewed:" + id;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch (e) { return; }
    var fd = new FormData();
    fd.append("tool_id", id);
    try { navigator.sendBeacon("/api/view.php", fd); } catch (e) {}
  }

  // 运行时定价（PRD §7 实时生效）：拉取站根 pricing.json，用实时价格覆盖页面上的 baked 价格；
  // 改价只需更新站根 pricing.json，无需重建。失败时静默保留构建期价格。
  function refreshPricing() {
    if (!document.querySelector("[data-price-key]") && !document.getElementById("submit-form")) return;
    fetch("/pricing.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (p) {
      var map = {};
      (p.items || []).forEach(function (it) { map[it.key] = it.price; });
      window.__PRICING_MAP__ = map;
      window.__PRICING__ = { fast: map.fast_review, featured: map.spotlight };
      document.querySelectorAll("[data-price-key]").forEach(function (el) {
        var k = el.getAttribute("data-price-key");
        if (map[k] != null) el.textContent = "$" + map[k];
      });
    }).catch(function () {});
  }

  initTheme();
  bind();
  bindVoteButtons();
  bindTryClicks();
  trackDetailView();
  bindCopyButtons();
  bindSidebar();
  refreshPricing();

  if (document.getElementById("grid")) {
    cards = readCards();
    sortCards();
    render();
  }
  syncFavButtons();
})();