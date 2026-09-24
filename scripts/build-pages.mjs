#!/usr/bin/env node
// 静态站点生成器：由 data/tools.json 生成全部页面（中英双语）
// 用法: node scripts/build-pages.mjs [域名]
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// 工具站部署在子域名；占卜站占用 lfun.cloud 主域名
const DOMAIN = (process.argv[2] || process.env.SITE_DOMAIN || "https://tools.lfun.cloud").replace(/[/]+$/, "");
const LANGS = ["zh", "en"];

// 静态资源加内容指纹，避免浏览器缓存旧 CSS/JS
// （.htaccess 给 CSS/JS 设了 1 小时缓存，不加版本号的话改完样式用户要等一小时才看到）
const ASSET_V = await (async function () {
  const h = createHash("sha1");
  for (const f of ["styles.css", "app.js", "online.js"]) {
    try { h.update(await readFile(join(ROOT, f))); } catch (e) {}
  }
  return h.digest("hex").slice(0, 8);
})();

const data = JSON.parse(await readFile(join(ROOT, "data/tools.json"), "utf8"));
const T = JSON.parse(await readFile(join(ROOT, "scripts/i18n.json"), "utf8"));
const items = data.items;
const syncedAt = (data.generatedAt || "").slice(0, 10);

// README 摘要缓存（由 scripts/fetch-readmes.mjs 生成）
let readmes = {};
try { readmes = JSON.parse(await readFile(join(ROOT, "data", "readmes.json"), "utf8")); } catch (e) {}

// 静态内容页（关于 / 免责声明）
const PAGES = JSON.parse(await readFile(join(ROOT, "scripts", "pages.json"), "utf8"));

// 站内在线工具（浏览器里直接可用，不是外链）
const APPS = JSON.parse(await readFile(join(ROOT, "scripts", "apps.json"), "utf8"));

// 搜索别名（人工维护，补上数据里搜不到的中文名和俗称）
let ALIASES = {};
try { ALIASES = JSON.parse(await readFile(join(ROOT, "scripts", "aliases.json"), "utf8")); } catch (e) {}
function readmeOf(t) {
  const r = readmes[t.id];
  return r && r.summary ? r.summary : "";
}

// 把 README 里抽到的 docker 命令挂到工具对象上，供工具页渲染
items.forEach(function (t) {
  var r = readmes[t.id];
  t.dockerCmd = r && r.docker ? r.docker : "";
});

/* ---------------- 基础工具 ---------------- */
function s(v) { return v == null ? "" : String(v); }
function esc(v) {
  return s(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function fmtStars(n) { return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n); }
function has(t, u) { return (t.usage || []).indexOf(u) !== -1; }
function sceneKey(t) { return t.scene || "general"; }

var LANG_COLORS = {
  TypeScript:"#3178c6", JavaScript:"#f1e05a", Vue:"#41b883", Clojure:"#db5855",
  Java:"#b07219", Scala:"#c22d40", Rust:"#dea584", "C++":"#f34b7d",
  Markdown:"#083fa1", Python:"#3572A5", Go:"#00ADD8", C:"#555555", Ruby:"#701516",
  "C#":"#178600", Dart:"#00B4AB", Swift:"#F05138", Shell:"#89e051",
  PowerShell:"#012456", Kotlin:"#A97BFF", HTML:"#e34c26", PHP:"#4F5D95",
  Elixir:"#6e4a7e", Haskell:"#5e5086"
};
var PLATFORM_LABELS = { windows:"Win", macos:"macOS", linux:"Linux", android:"Android", ios:"iOS" };

function langPrefix(lang) { return lang === "zh" ? "" : "/en"; }
function homePath(lang) { return lang === "zh" ? "/" : "/en/"; }
function toolPath(lang, id) { return langPrefix(lang) + "/tool/" + id + "/"; }
function catPath(lang, key) { return langPrefix(lang) + "/category/" + key + "/"; }
function categoriesPath(lang) { return langPrefix(lang) + "/categories/"; }
function contentPath(lang, key) { return langPrefix(lang) + "/" + key + "/"; }
function onlinePath(lang, id) { return langPrefix(lang) + "/online/" + id + "/"; }
function onlineIndexPath(lang) { return langPrefix(lang) + "/online/"; }
function comparePath(lang, x, y) { return langPrefix(lang) + "/compare/" + x + "-vs-" + y + "/"; }

// 两个工具必须共享至少一个标签或一种使用方式，才值得对比
// 否则会出现 "Documenso 和 cookieconsent 怎么选？" 这种跨用途的荒谬配对
function relevantPair(a, b) {
  var ta = a.tags || [], tb = b.tags || [];
  if (ta.some(function (x) { return tb.indexOf(x) !== -1; })) return true;
  var ua = a.usage || [], ub = b.usage || [];
  return ua.some(function (x) { return ub.indexOf(x) !== -1; });
}

// 每个分类取星数前 3，两两配对 -> 最多 3 组/分类
function comparePairs() {
  var byCat = {};
  items.forEach(function (t) { (byCat[t.category] = byCat[t.category] || []).push(t); });
  var out = [];
  Object.keys(byCat).forEach(function (k) {
    var list = byCat[k].slice().sort(function (a, b) { return b.stars - a.stars; }).slice(0, 3);
    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) {
        if (!relevantPair(list[i], list[j])) continue;
        out.push({ a: list[i], b: list[j], category: k });
      }
    }
  });
  return out;
}
var ICON = {
  home: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  bolt: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4.5 13H11l-1 9 8.5-11H12l1-9z"/></svg>',
  grid: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/></svg>',
  shield: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/></svg>'
};

function abs(p) { return DOMAIN + p; }
function descOf(t, lang) { return lang === "en" ? (t.descEn || t.desc || "") : (t.desc || t.descEn || ""); }
function catLabel(lang, k) { return T[lang].categories[k] || k; }
// 标签翻译：英文页查映射表；本来就是英文的标签没有映射，原样返回
function tagLabel(lang, tag) {
  if (lang !== "en") return tag;
  return (T.tagTranslations && T.tagTranslations[tag]) || tag;
}

function primaryAction(t, lang) {
  var L = T[lang];
  var repoUrl = "https://github.com/" + t.repo;
  var releases = repoUrl + "/releases";
  // 厂商有托管版时，优先引导过去——这才是「点开就能用」的最短路径
  if (t.cloud) return { label: lang === "zh" ? "云版" : "Cloud", url: t.cloud };
  if (has(t, "online")) {
    return t.homepage ? { label: L.btnOnline, url: t.homepage } : { label: L.btnNoOnline, url: "" };
  }
  if (has(t, "extension")) return { label: L.btnAddon, url: t.homepage || releases };
  if (has(t, "desktop") || has(t, "cli")) return { label: L.btnDownload, url: releases };
  if (has(t, "selfhost")) return { label: L.btnDeploy, url: t.homepage || releases };
  if (has(t, "lib")) return { label: L.btnDocs, url: t.homepage || repoUrl };
  return { label: L.btnRepo, url: repoUrl };
}

/* ---------------- 页面骨架 ---------------- */
function head(lang, opt) {
  var L = T[lang];
  var alts = LANGS.map(function (l) {
    return '<link rel="alternate" hreflang="' + (l === "zh" ? "zh-CN" : "en") + '" href="' + esc(abs(opt.paths[l])) + '">';
  }).join("\n");
  var jsonld = opt.jsonld ? opt.jsonld.map(function (o) {
    return '<script type="application/ld+json">' + JSON.stringify(o).split("</").join("<\\/") + "</script>";
  }).join("\n") : "";
  var i18nJs = JSON.stringify(T[lang]).split("</").join("<\\/");

  return [
    "<!doctype html>",
    '<html lang="' + L.htmlLang + '" data-theme="dark">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>" + esc(opt.title) + "</title>",
    '<meta name="description" content="' + esc(opt.desc) + '">',
    '<meta name="theme-color" content="#0b0b0b">',
    '<link rel="canonical" href="' + esc(abs(opt.paths[lang])) + '">',
    alts,
    '<link rel="alternate" hreflang="x-default" href="' + esc(abs(opt.paths.zh)) + '">',
    '<meta property="og:type" content="' + (opt.ogType || "website") + '">',
    '<meta property="og:title" content="' + esc(opt.title) + '">',
    '<meta property="og:description" content="' + esc(opt.desc) + '">',
    '<meta property="og:url" content="' + esc(abs(opt.paths[lang])) + '">',
    '<meta property="og:image" content="' + DOMAIN + '/og.png">',
    '<meta property="og:site_name" content="' + esc(L.siteName) + '">',
    '<meta name="twitter:card" content="summary_large_image">',
    jsonld,
    '<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🧰</text></svg>">',
    '<link rel="stylesheet" href="/styles.css?v=' + ASSET_V + '">',
    '<script>window.__LANG__=' + JSON.stringify(lang) + ";window.__I18N__=" + i18nJs + ";</script>",
    "</head>",
    "<body>",
    '<div class="app-frame">'
  ].join("\n");
}

function header(lang, isHome) {
  var L = T[lang];
  var rows = [
    '<header class="topbar">',
    '  <div class="topbar-inner">',
    '    <a class="brand" href="' + homePath(lang) + '">',
    '      <span class="brand-mark">🧰</span>',
    "      <div>",
    '        <span class="brand-name">' + esc(L.siteName) + "</span>",
    '        <p class="brand-sub">' + L.brandSub + "</p>",
    "      </div>",
    "    </a>",
    '    <nav class="topnav">',
    '      <a class="nav-item' + (isHome ? " active" : "") + '" href="' + homePath(lang) + '">' + ICON.home + esc(L.navHome) + "</a>",
    '      <a class="nav-item" href="' + onlineIndexPath(lang) + '">' + ICON.bolt + esc(L.navOnline) + "</a>",
    '      <a class="nav-item" href="' + categoriesPath(lang) + '">' + ICON.grid + esc(L.navCategories) + "</a>",
    '      <a class="nav-item" href="' + contentPath(lang, "about") + '">' + ICON.info + esc(L.navAbout) + "</a>",
    "    </nav>",
    '    <div class="topbar-actions">',
    (isHome ? '      <button id="menu-toggle" class="btn-ghost" title="' + esc(L.menuToggle) + '">☰<span class="menu-label">' + esc(L.filterHint) + "</span></button>" : ""),
    '      <a class="btn-ghost" href="' + L.langSwitchHref + '">' + esc(L.langSwitch) + "</a>"
  ];
  if (isHome) {
    rows.push('      <button id="fav-toggle" class="btn-ghost" title="' + esc(L.favOnly) + '">★ <span id="fav-count">0</span></button>');
  }
  rows.push('      <button id="theme-toggle" class="btn-ghost" title="' + esc(L.themeTitle) + '">🌙</button>');
  rows.push("    </div>");
  rows.push("  </div>");
  rows.push("</header>");
  return rows.join("\n");
}

/* ---------------- 卡片 ---------------- */
function card(t, lang) {
  var L = T[lang];
  var color = LANG_COLORS[t.language] || "#8b949e";
  var owner = t.repo.split("/")[0];
  var initial = (t.name || "?").charAt(0);
  // 搜索索引同时包含原文标签和译文标签，中英文都能搜到
  var search = [t.name, t.repo, t.desc, t.descEn, t.language,
    (t.tags || []).join(" "),
    (t.tags || []).map(function (x) { return tagLabel("en", x); }).join(" "),
    (ALIASES[t.id] || []).join(" ")]
    .join(" ").toLowerCase();

  var badges = "";
  if (t.archived) badges += '<span class="badge">' + esc(L.archived) + "</span>";
  if (t.caution) badges += '<span class="badge warn">' + esc(L.cautions[t.caution] || t.caution) + "</span>";

  var plats = (t.platforms || []).filter(function (p) { return PLATFORM_LABELS[p]; })
    .map(function (p) { return '<span class="tag plat">' + PLATFORM_LABELS[p] + "</span>"; }).join("");
  var tags = (t.tags || []).map(function (x) { return '<span class="tag">' + esc(tagLabel(lang, x)) + "</span>"; }).join("");
  var a = primaryAction(t, lang);
  var primaryBtn = a.url
    ? '<a class="btn-primary" href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.label) + "</a>"
    : '<span class="btn-secondary is-muted">' + esc(a.label) + "</span>";

  return [
    '<article class="card" data-id="' + esc(t.id) + '" data-scene="' + sceneKey(t) + '"',
    '  data-usage="' + esc((t.usage || []).join(" ")) + '" data-category="' + esc(t.category) + '"',
    '  data-stars="' + (t.stars || 0) + '" data-name="' + esc(t.name) + '"',
    '  data-updated="' + esc(t.pushedAt || "") + '" data-search="' + esc(search) + '">',
    '  <button class="fav" data-fav="' + esc(t.id) + '" title="' + esc(L.favTitle) + '">☆</button>',
    '  <div class="card-head">',
    '    <img class="icon" src="https://github.com/' + esc(owner) + '.png?size=96" alt="" loading="lazy"',
    '         data-initial="' + esc(initial) + '" onerror="iconFail(this)">',
    '    <div class="card-titles">',
    '      <h3 class="card-name"><a href="' + toolPath(lang, t.id) + '">' + esc(t.name) + "</a>" + badges + "</h3>",
    '      <div class="card-repo">' + esc(t.repo) + "</div>",
    '      <div class="tier tier-' + deployTier(t) + '">' + esc(tierLabel(t, lang)) + "</div>",
    "    </div>",
    "  </div>",
    '  <p class="card-desc">' + esc(descOf(t, lang)) + "</p>",
    '  <div class="tags">' + plats + tags + "</div>",
    '  <div class="card-foot">',
    '    <span class="stat" title="' + esc(L.specStars) + '">★ <span class="star-n">' + fmtStars(t.stars) + "</span></span>",
    '    <span class="stat"><i class="lang-dot" style="background:' + color + '"></i>' + esc(t.language || "—") + "</span>",
    '    <span class="actions">' + primaryBtn +
      '<a class="btn-secondary" href="https://github.com/' + esc(t.repo) + '" target="_blank" rel="noopener">' + esc(L.btnRepo) + "</a></span>",
    "  </div>",
    "</article>"
  ].join("\n");
}

/* ---------------- 首页 ---------------- */
function countFilled(L) {
  var o = {};
  for (var k in L) o[k] = L[k];
  var n = String(items.length);
  o.homeTitle = String(L.homeTitle || "").split("{n}").join(n);
  o.homeDesc = String(L.homeDesc || "").split("{n}").join(n);
  return o;
}

function homePage(lang) {
  var L = countFilled(T[lang]);
  var cards = items.map(function (t) { return card(t, lang); }).join("\n");
  var scenes = ["all", "general", "overseas"].map(function (k) {
    return '<button class="scene-btn' + (k === "all" ? " active" : "") + '" data-scene="' + k + '">' + esc(L.scenes[k]) + "</button>";
  }).join("");
  var paths = {};
  LANGS.forEach(function (l) { paths[l] = homePath(l); });

  var official = items.filter(function (t) { return t.homepage; }).length;

  var jsonld = [{
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": L.siteName,
    "url": abs(homePath(lang)),
    "inLanguage": L.htmlLang,
    "description": L.homeDesc
  }, {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": L.siteName,
    "numberOfItems": items.length,
    "itemListElement": items.map(function (t, i) {
      return { "@type": "ListItem", "position": i + 1, "url": abs(toolPath(lang, t.id)), "name": t.name };
    })
  }];

  return [
    head(lang, { title: L.homeTitle, desc: L.homeDesc, paths: paths, jsonld: jsonld, ogType: "website" }),
    "",
    header(lang, true),
    "",
    '<div class="layout" id="layout">',
    '  <aside class="sidebar" id="sidebar">',
    '    <div class="sidebar-head">',
    '      <span>' + esc(L.filterHint) + "</span>",
    '      <button class="sidebar-close" id="sidebar-close" aria-label="close">✕</button>',
    "    </div>",
    '<nav class="side-block">',
    '      <h3 class="side-title">' + esc(L.sideNav) + "</h3>",
    '      <a class="nav-item active" href="' + homePath(lang) + '">' + ICON.home + esc(L.navHome) + "</a>",
    '      <a class="nav-item" href="' + onlineIndexPath(lang) + '">' + ICON.bolt + esc(L.navOnline) + "</a>",
    '      <a class="nav-item" href="' + categoriesPath(lang) + '">' + ICON.grid + esc(L.navCategories) + "</a>",
    '      <a class="nav-item" href="' + contentPath(lang, "about") + '">' + ICON.info + esc(L.navAbout) + "</a>",
    '      <a class="nav-item" href="' + contentPath(lang, "disclaimer") + '">' + ICON.shield + esc(L.navDisclaimer) + "</a>",
    "    </nav>",
    '    <div class="side-block">',
    '      <h3 class="side-title">' + esc(L.sideScene) + "</h3>",
    '      <div class="scene-switch">' + scenes + "</div>",
    "    </div>",
    '    <div class="side-block">',
    '      <h3 class="side-title">' + esc(L.sideUsage) + "</h3>",
    '      <div id="usage-chips" class="chips chips-usage"></div>',
    "    </div>",
    '    <div class="side-block">',
    '      <h3 class="side-title">' + esc(L.sideCategory) + "</h3>",
    '      <div id="chips" class="chips"></div>',
    "    </div>",
    '    <div class="side-block">',
    '      <h3 class="side-title">' + esc(L.sideSort) + "</h3>",
    '      <select id="sort" class="sort" aria-label="sort">',
    '        <option value="stars">' + esc(L.sortStars) + "</option>",
    '        <option value="name">' + esc(L.sortName) + "</option>",
    '        <option value="updated">' + esc(L.sortUpdated) + "</option>",
    "      </select>",
    "    </div>",
    "  </aside>",
    '  <div class="sidebar-backdrop" id="sidebar-backdrop"></div>',
    '  <main class="content">',
    '<section class="hero">',
    '  <h1 class="hero-title">' + esc(L.homeTitle) + "</h1>",
    '  <p class="hero-sub">' + items.length + " " + (lang === "zh" ? "个项目 · 其中 " + official + " 个有在线版或官网" : "projects · " + official + " with an online version or website") + "</p>",
    '  <div class="search-box">',
    '    <span class="search-icon">🔍</span>',
    '    <input id="search" type="search" placeholder="' + esc(L.searchPlaceholder) + '" autocomplete="off">',
    '    <button id="clear-search" class="search-clear" hidden>✕</button>',
    "  </div>",
    '  <div class="meta-row">',
    '    <span id="result-count"></span>',
    '    <span class="dot-sep">·</span>',
    '    <span class="sync-time">' + esc(todayLabel(lang)) + "</span>",
    "  </div>",
    "</section>",
    '    <div id="grid" class="grid">',
    cards,
    "    </div>",
    '    <div id="empty" class="empty" hidden>',
    '      <p class="empty-emoji">🫥</p>',
    '      <p id="empty-text">' + esc(L.emptyMatch) + "</p>",
    '      <button id="reset-filters" class="btn-primary">' + esc(L.clearFilters) + "</button>",
    "    </div>",
    "  </main>",
    "</div>",
    "",
    footer(lang),
    '<script src="/app.js?v=' + ASSET_V + '"></script>',
    "</div>",
    "</body>",
    "</html>"
  ].join("\n");
}

function todayLabel(lang) {
  return lang === "zh" ? "共 " + items.length + " 个工具 · 数据更新于 " + syncedAt
                       : items.length + " tools · data synced " + syncedAt;
}

function footer(lang) {
  var L = T[lang];
  return [
    '<footer class="footer wrap">',
    "  <p>" + esc(L.siteName) + " · " + esc(L.footerNote) + "</p>",
    '  <p class="footer-links"><a href="' + onlineIndexPath(lang) + '">' + esc(L.onlineHeading) + "</a>" +
      '<a href="' + categoriesPath(lang) + '">' + esc(L.categoriesHeading) + "</a>" +
      '<a href="' + contentPath(lang, "about") + '">' + esc(L.aboutLabel) + "</a>" +
      '<a href="' + contentPath(lang, "disclaimer") + '">' + esc(L.disclaimerLabel) + "</a>" +
      '<a href="' + L.langSwitchHref + '">' + esc(L.langSwitch) + "</a></p>",
    "</footer>"
  ].join("\n");
}

/* ---------------- 工具详情页 ---------------- */
function toolPage(t, lang) {
  var L = T[lang];
  var color = LANG_COLORS[t.language] || "#8b949e";
  var owner = t.repo.split("/")[0];
  var initial = (t.name || "?").charAt(0);
  var a = primaryAction(t, lang);
  var paths = {};
  LANGS.forEach(function (l) { paths[l] = toolPath(l, t.id); });

  var badges = "";
  if (t.archived) badges += '<span class="badge">' + esc(L.archived) + "</span>";
  if (t.caution) badges += '<span class="badge warn">' + esc(L.cautions[t.caution] || t.caution) + "</span>";

  var plats = (t.platforms || []).filter(function (p) { return PLATFORM_LABELS[p]; })
    .map(function (p) { return '<span class="tag plat">' + PLATFORM_LABELS[p] + "</span>"; }).join("");
  var tags = (t.tags || []).map(function (x) { return '<span class="tag">' + esc(tagLabel(lang, x)) + "</span>"; }).join("");

  var related = items.filter(function (x) {
    return x.id !== t.id && x.category === t.category && sceneKey(x) === sceneKey(t);
  }).sort(function (x, y) { return y.stars - x.stars; }).slice(0, 6);
  if (related.length < 3) {
    var extra = items.filter(function (x) {
      return x.id !== t.id && x.category === t.category && related.indexOf(x) === -1;
    }).sort(function (x, y) { return y.stars - x.stars; }).slice(0, 6 - related.length);
    related = related.concat(extra);
  }

  var specs = [
    [L.specStars, "★ " + fmtStars(t.stars)],
    [L.specLang, t.language || "—"],
    [L.specLicense, t.license && t.license !== "-" ? t.license : L.noLicense],
    [L.specUpdated, t.pushedAt || "—"],
    [L.specCategory, catLabel(lang, t.category)],
    [L.specScene, L.scenes[sceneKey(t)]]
  ].map(function (row) {
    return '    <div class="spec"><dt>' + esc(row[0]) + "</dt><dd>" + esc(row[1]) + "</dd></div>";
  }).join("\n");

  var jsonld = [{
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": t.name,
    "description": descOf(t, lang),
    "url": abs(paths[lang]),
    "inLanguage": L.htmlLang,
    "applicationCategory": "UtilitiesApplication",
    "operatingSystem": (t.platforms || []).map(function (p) { return PLATFORM_LABELS[p] || p; }).join(" / ") || "Web",
    "codeRepository": "https://github.com/" + t.repo,
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
    "author": { "@type": "Organization", "name": owner },
    "keywords": (t.tags || []).map(function (x) { return tagLabel(lang, x); }).join(", ")
  }, {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": L.backToAll, "item": abs(homePath(lang)) },
      { "@type": "ListItem", "position": 2, "name": catLabel(lang, t.category), "item": abs(catPath(lang, t.category)) },
      { "@type": "ListItem", "position": 3, "name": t.name, "item": abs(paths[lang]) }
    ]
  }];

  var title = lang === "zh"
    ? t.name + " · " + catLabel(lang, t.category) + " · " + L.siteName
    : t.name + " · " + catLabel(lang, t.category) + " · " + L.siteName;
  var desc = (descOf(t, lang) + " ⭐ " + fmtStars(t.stars) + " · " + (t.language || "") + " · " + (t.license || "")).slice(0, 300);

  var lines = [
    head(lang, { title: title, desc: desc, paths: paths, jsonld: jsonld, ogType: "article" }),
    "",
    header(lang, false),
    "",
    '<main class="wrap">',
    '  <nav class="crumbs">',
    '    <a href="' + homePath(lang) + '">' + esc(L.backToAll) + "</a>",
    '    <span>/</span><a href="' + catPath(lang, t.category) + '">' + esc(catLabel(lang, t.category)) + "</a>",
    '    <span>/</span><strong>' + esc(t.name) + "</strong>",
    "  </nav>",
    '  <article class="detail">',
    '    <header class="detail-head">',
    '      <img class="icon icon-lg" src="https://github.com/' + esc(owner) + '.png?size=160" alt="" data-initial="' + esc(initial) + '" onerror="iconFail(this)">',
    "      <div>",
    '        <h1 class="detail-name">' + esc(t.name) + badges + "</h1>",
    '        <div class="card-repo">' + esc(t.repo) + "</div>",
    "      </div>",
    '      <button class="fav fav-lg" data-fav="' + esc(t.id) + '" title="' + esc(L.favTitle) + '">☆</button>',
    "    </header>",
    '    <div class="tier-banner tier-' + deployTier(t) + '">',
    '      <strong>' + esc(tierLabel(t, lang)) + "</strong>",
    '      <span>' + esc(TIER_DESC[lang][deployTier(t)]) + "</span>",
    "    </div>",
    '    <p class="detail-desc">' + esc(descOf(t, lang)) + "</p>",
    '    <div class="tags">' + plats + tags + "</div>",
    "    " + visualHtml(t, lang),
    (t.dockerCmd ? '    <div class="deploy-block">' +
      '<div class="deploy-head"><h2>' + esc(lang === "zh" ? "部署命令" : "Deploy command") + "</h2>" +
      '<button class="copy-btn" type="button" data-copy="' + esc(t.dockerCmd) + '">' +
      esc(lang === "zh" ? "复制" : "Copy") + "</button></div>" +
      "<pre><code>" + esc(t.dockerCmd) + "</code></pre>" +
      '<p class="deploy-note">' + esc(lang === "zh"
        ? "摘自项目 README。需要一台装了 Docker 的服务器，命令可能还需补充环境变量。"
        : "Taken from the project README. You need a server with Docker; you may still need to add environment variables.") + "</p></div>" : ""),
    (readmeOf(t) ? '    <div class="readme"><h2>' + esc(L.readmeHeading) + "</h2><p>" + esc(readmeOf(t)) + "</p></div>" : ""),
    '    <dl class="specs">',
    specs,
    "    </dl>",
    '    <div class="detail-actions">',
    (a.url ? '      <a class="btn-primary btn-lg" href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.label) + "</a>" : ""),
    '      <a class="btn-secondary btn-lg" href="https://github.com/' + esc(t.repo) + '" target="_blank" rel="noopener">' + esc(L.btnRepo) + "</a>",
    "    </div>",
    "  </article>"
  ];

  if (related.length) {
    lines.push('  <section class="related">');
    lines.push("    <h2>" + esc(L.related) + "</h2>");
    lines.push('    <div class="grid">');
    related.forEach(function (r) { lines.push(card(r, lang)); });
    lines.push("    </div>");
    lines.push("  </section>");
  }

  lines.push('  <p class="back-link"><a href="' + homePath(lang) + '">← ' + esc(L.backToAll) + "</a></p>");
  lines.push("</main>");
  lines.push("");
  lines.push(footer(lang));
  lines.push('<script src="/app.js?v=' + ASSET_V + '"></script>');
  lines.push("</div>");
  lines.push("</body>");
  lines.push("</html>");
  return lines.join("\n");
}

/* ---------------- sitemap / robots ---------------- */
/* ---------------- 使用门槛分级 ---------------- */
// 回答一个问题：这个工具点开就能用吗？
var TIER_LABELS = {
  zh: { ready: "打开就能用", cloud: "官方云版", onecmd: "一条命令部署", setup: "需要自己配置", install: "需下载安装", library: "写代码时引用", resource: "可直接查阅" },
  en: { ready: "Ready to use", cloud: "Official cloud", onecmd: "One-command deploy", setup: "Needs setup", install: "Download & install", library: "Library", resource: "Read or browse" }
};
var TIER_DESC = {
  zh: {
    ready: "有官方在线版，点开就能用，不用安装也不用部署。",
    cloud: "厂商提供托管版，注册后即可使用，不用自己部署。免费额度或试用期以厂商为准。",
    onecmd: "需要一台自己的服务器，但 README 里有可直接执行的 Docker 命令，复制粘贴就能跑起来。",
    setup: "需要一台自己的服务器，而且要配置数据库、环境变量、域名或邮件等，建议先看官方部署文档。",
    install: "下载安装到本机使用，不需要服务器。",
    library: "不是一个独立应用，需要装进你自己的项目里写代码调用。",
    resource: "这是清单、资料或提示词集合，不用安装也不用部署，打开仓库直接看就行。"
  },
  en: {
    ready: "There is an official hosted version — open it and go. No install, no deployment.",
    cloud: "The vendor offers a hosted version: sign up and use it without deploying anything. Free tier or trial depends on the vendor.",
    onecmd: "You need your own server, but the README has a copy-paste Docker command that gets it running.",
    setup: "You need your own server plus database, environment variables, domain or mail configuration. Read the official deployment docs first.",
    install: "Download and install locally. No server needed.",
    library: "Not a standalone app — install it into your own project and call it from code.",
    resource: "A curated list, reference or prompt collection. Nothing to install or deploy — just open the repository."
  }
};
var TIER_ORDER = ["ready", "cloud", "onecmd", "setup", "install", "library", "resource"];

function deployTier(t) {
  if (has(t, "online") && t.homepage) return "ready";
  if (t.cloud) return "cloud";
  if (has(t, "list")) return "resource";
  if (has(t, "desktop") || has(t, "cli") || has(t, "extension")) return "install";
  if (has(t, "lib")) return "library";
  if (has(t, "selfhost")) {
    var r = readmes[t.id];
    return r && r.docker ? "onecmd" : "setup";
  }
  if (has(t, "online")) return "ready";
  return "setup";
}

function tierLabel(t, lang) { return TIER_LABELS[lang][deployTier(t)]; }

/* ---------------- 视觉卡片 ---------------- */
// 有官网地址就用 WordPress mShots 截真实网页；否则退回 GitHub 自动生成的仓库卡片
function visualHtml(t, lang) {
  var alt = t.name + (lang === "zh" ? " 网站截图" : " website screenshot");
  if (t.homepage) {
    var shot = "https://s0.wp.com/mshots/v1/" + encodeURIComponent(t.homepage) + "?w=1200";
    return '<figure class="repo-card-wrap"><img class="repo-card" src="' + esc(shot) +
      '" alt="' + esc(alt) + '" width="1200" height="675" loading="lazy" referrerpolicy="no-referrer"></figure>';
  }
  return '<figure class="repo-card-wrap"><img class="repo-card" src="https://opengraph.githubassets.com/1/' +
    esc(t.repo) + '" alt="' + esc(t.name + (lang === "zh" ? " 仓库概览卡片" : " repository card")) +
    '" width="1200" height="675" loading="lazy"></figure>';
}

/* ---------------- 静态内容页 ---------------- */
function contentPage(lang, key) {
  var L = T[lang];
  var C = PAGES[key][lang];
  var paths = {};
  LANGS.forEach(function (l) { paths[l] = contentPath(l, key); });

  var jsonld = [{
    "@context": "https://schema.org",
    "@type": key === "about" ? "AboutPage" : "WebPage",
    "name": C.title,
    "url": abs(paths[lang]),
    "inLanguage": L.htmlLang,
    "description": C.desc
  }, {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": L.backToAll, "item": abs(homePath(lang)) },
      { "@type": "ListItem", "position": 2, "name": C.h1, "item": abs(paths[lang]) }
    ]
  }];

  var blocks = C.blocks.map(function (b) {
    return '  <section class="prose-block"><h2>' + esc(b.h) + "</h2><p>" + esc(b.p) + "</p></section>";
  }).join("\n");

  return [
    head(lang, { title: C.title + " · " + L.siteName, desc: C.desc, paths: paths, jsonld: jsonld, ogType: "article" }),
    "",
    header(lang, false),
    "",
    '<main class="wrap">',
    '  <nav class="crumbs">',
    '    <a href="' + homePath(lang) + '">' + esc(L.backToAll) + "</a>",
    '    <span>/</span><strong>' + esc(C.h1) + "</strong>",
    "  </nav>",
    '  <h1 class="hero-title">' + esc(C.h1) + "</h1>",
    '  <p class="hero-sub">' + esc(C.sub) + "</p>",
    '  <div class="prose">',
    blocks,
    "  </div>",
    '  <p class="back-link"><a href="' + homePath(lang) + '">← ' + esc(L.backToAll) + "</a></p>",
    "</main>",
    "",
    footer(lang),
    '<script src="/app.js?v=' + ASSET_V + '"></script>',
    "</div>",
    "</body>",
    "</html>"
  ].join("\n");
}

/* ---------------- 对比页 ---------------- */
var USAGE_WORD = {
  zh: { online: "在线即用", selfhost: "自托管部署", desktop: "桌面客户端", cli: "命令行", lib: "作为开发库引用", list: "当清单查阅", extension: "装到浏览器" },
  en: { online: "online use", selfhost: "self-hosting", desktop: "a desktop app", cli: "CLI use", lib: "use as a library", list: "reading the list", extension: "installing an add-on" }
};
var PLATFORM_WORD = { zh: { windows: "Windows", macos: "macOS", linux: "Linux", android: "Android", ios: "iOS" },
  en: { windows: "Windows", macos: "macOS", linux: "Linux", android: "Android", ios: "iOS" } };

// 由数据推导「怎么选」，而不是套模板废话
function compareAdvice(pair, lang) {
  var a = pair.a, b = pair.b;
  var W = USAGE_WORD[lang], P = PLATFORM_WORD[lang];
  var tips = [];
  var onlyA = (a.usage || []).filter(function (u) { return (b.usage || []).indexOf(u) === -1; });
  var onlyB = (b.usage || []).filter(function (u) { return (a.usage || []).indexOf(u) === -1; });
  var words = function (arr) { return arr.map(function (u) { return W[u] || u; }).join(lang === "zh" ? "、" : ", "); };
  if (onlyA.length) tips.push(lang === "zh" ? "只有 " + a.name + " 支持" + words(onlyA) + "。" : "Only " + a.name + " supports " + words(onlyA) + ".");
  if (onlyB.length) tips.push(lang === "zh" ? "只有 " + b.name + " 支持" + words(onlyB) + "。" : "Only " + b.name + " supports " + words(onlyB) + ".");
  if (!onlyA.length && !onlyB.length) tips.push(lang === "zh" ? "两者的使用方式完全一致，差别主要在同生态和实现细节。" : "They support exactly the same usage modes; the difference is in ecosystem and implementation details.");
  var pa = (a.platforms || []).filter(function (p) { return (b.platforms || []).indexOf(p) === -1; });
  var pb = (b.platforms || []).filter(function (p) { return (a.platforms || []).indexOf(p) === -1; });
  if (pa.length) tips.push(lang === "zh" ? a.name + " 额外支持 " + pa.map(function (x) { return P[x] || x; }).join("、") + "。" : a.name + " additionally supports " + pa.map(function (x) { return P[x] || x; }).join(", ") + ".");
  if (pb.length) tips.push(lang === "zh" ? b.name + " 额外支持 " + pb.map(function (x) { return P[x] || x; }).join("、") + "。" : b.name + " additionally supports " + pb.map(function (x) { return P[x] || x; }).join(", ") + ".");
  var big = a.stars >= b.stars ? a : b, small = a.stars >= b.stars ? b : a;
  var ratio = small.stars > 0 ? big.stars / small.stars : 1;
  if (ratio >= 1.5) {
    tips.push(lang === "zh"
      ? big.name + " 的社区规模明显更大（" + fmtStars(big.stars) + " vs " + fmtStars(small.stars) + "），遇到问题更容易搜到答案、插件和教程。"
      : big.name + " has a clearly larger community (" + fmtStars(big.stars) + " vs " + fmtStars(small.stars) + "), so answers, plugins and tutorials are easier to find.");
  } else {
    tips.push(lang === "zh" ? "两者关注度接近，选择时可以更看重功能和体验细节。" : "Both have comparable traction, so pick based on features and day-to-day experience.");
  }
  if (a.pushedAt && b.pushedAt && a.pushedAt !== b.pushedAt) {
    var fresh = a.pushedAt > b.pushedAt ? a : b;
    tips.push(lang === "zh" ? fresh.name + " 最近更新更晚（" + fresh.pushedAt + "），活跃度更高。" : fresh.name + " was updated more recently (" + fresh.pushedAt + ").");
  }
  if (a.license && b.license && a.license !== b.license) {
    tips.push(lang === "zh" ? "许可证不同（" + a.license + " vs " + b.license + "），商用前请确认条款。" : "Different licenses (" + a.license + " vs " + b.license + ") — check the terms before commercial use.");
  }
  return tips;
}

function comparePage(lang, pair) {
  var L = T[lang];
  var a = pair.a, b = pair.b;
  var paths = {};
  LANGS.forEach(function (l) { paths[l] = comparePath(l, a.id, b.id); });
  var title = lang === "zh" ? a.name + " 和 " + b.name + " 怎么选？· " + L.siteName : a.name + " vs " + b.name + " · " + L.siteName;
  var desc = (lang === "zh"
    ? a.name + " 与 " + b.name + " 的对比：星数、许可证、使用方式、支持平台逐项对照，并给出怎么选的建议。"
    : "A side-by-side comparison of " + a.name + " and " + b.name + ": stars, license, usage modes and platforms, plus how to choose.").slice(0, 300);

  var rows = [
    [L.specStars, "★ " + fmtStars(a.stars), "★ " + fmtStars(b.stars)],
    [L.specLang, a.language || "—", b.language || "—"],
    [L.specLicense, a.license || "—", b.license || "—"],
    [L.specUpdated, a.pushedAt || "—", b.pushedAt || "—"],
    [lang === "zh" ? "使用方式" : "Usage", (a.usage || []).map(function (u) { return (T[lang].usages || {})[u] || u; }).join(" / "),
      (b.usage || []).map(function (u) { return (T[lang].usages || {})[u] || u; }).join(" / ")],
    [lang === "zh" ? "平台" : "Platforms", (a.platforms || []).map(function (p) { return PLATFORM_WORD[lang][p] || p; }).join(" ") || "—", (b.platforms || []).map(function (p) { return PLATFORM_WORD[lang][p] || p; }).join(" ") || "—"],
    [L.specCategory, catLabel(lang, a.category), catLabel(lang, b.category)]
  ];

  var table = rows.map(function (r) {
    return "    <tr><th>" + esc(r[0]) + "</th><td>" + esc(r[1]) + "</td><td>" + esc(r[2]) + "</td></tr>";
  }).join("\n");

  var tips = compareAdvice(pair, lang).map(function (t) { return "    <li>" + esc(t) + "</li>"; }).join("\n");

  var cardFor = function (t) {
    return [
      '  <div class="cmp-col">',
      "    " + visualHtml(t, lang),
      '    <h2 class="cmp-name"><a href="' + toolPath(lang, t.id) + '">' + esc(t.name) + "</a></h2>",
      '    <p class="cmp-desc">' + esc(descOf(t, lang)) + "</p>",
      '    <div class="tags">' + (t.tags || []).slice(0, 4).map(function (x) { return '<span class="tag">' + esc(tagLabel(lang, x)) + "</span>"; }).join("") + "</div>",
      '    <p class="cmp-link"><a href="' + toolPath(lang, t.id) + '">' + esc(lang === "zh" ? "查看详情 →" : "View details →") + "</a></p>",
      "  </div>"
    ].join("\n");
  };

  var jsonld = [{
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title,
    "url": abs(paths[lang]),
    "inLanguage": L.htmlLang,
    "description": desc,
    "about": [
      { "@type": "SoftwareApplication", "name": a.name, "url": abs(toolPath(lang, a.id)) },
      { "@type": "SoftwareApplication", "name": b.name, "url": abs(toolPath(lang, b.id)) }
    ]
  }, {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": L.backToAll, "item": abs(homePath(lang)) },
      { "@type": "ListItem", "position": 2, "name": catLabel(lang, a.category), "item": abs(catPath(lang, a.category)) }
    ]
  }];

  return [
    head(lang, { title: title, desc: desc, paths: paths, jsonld: jsonld, ogType: "article" }),
    "",
    header(lang, false),
    "",
    '<main class="wrap">',
    '  <nav class="crumbs">',
    '    <a href="' + homePath(lang) + '">' + esc(L.backToAll) + "</a>",
    '    <span>/</span><a href="' + catPath(lang, a.category) + '">' + esc(catLabel(lang, a.category)) + "</a>",
    '    <span>/</span><strong>' + esc(lang === "zh" ? "对比" : "Compare") + "</strong>",
    "  </nav>",
    '  <h1 class="hero-title">' + esc(lang === "zh" ? a.name + " 和 " + b.name + " 怎么选？" : a.name + " vs " + b.name) + "</h1>",
    '  <p class="hero-sub">' + esc(lang === "zh"
      ? "同属「" + catLabel(lang, a.category) + "」，逐项对照"
      : "Both in " + catLabel(lang, a.category) + " — compared item by item") + "</p>",
    '  <div class="cmp">',
    cardFor(a),
    cardFor(b),
    "  </div>",
    '  <table class="cmp-table">',
    '    <thead><tr><th></th><th>' + esc(a.name) + "</th><th>" + esc(b.name) + "</th></tr></thead>",
    "    <tbody>",
    table,
    "    </tbody>",
    "  </table>",
    '  <section class="prose">',
    '    <h2>' + esc(lang === "zh" ? "怎么选" : "How to choose") + "</h2>",
    '    <ul class="cmp-advice">',
    tips,
    "    </ul>",
    "  </section>",
    '  <p class="back-link"><a href="' + homePath(lang) + '">← ' + esc(L.backToAll) + "</a></p>",
    "</main>",
    "",
    footer(lang),
    '<script src="/app.js?v=' + ASSET_V + '"></script>',
    "</div>",
    "</body>",
    "</html>"
  ].join("\n");
}

/* ---------------- 站内在线工具 ---------------- */
function onlineAppPage(lang, app) {
  var L = T[lang];
  var paths = {};
  LANGS.forEach(function (l) { paths[l] = onlinePath(l, app.id); });
  var name = lang === "zh" ? app.zhName : app.enName;
  var desc = lang === "zh" ? app.zhDesc : app.enDesc;
  var bodyText = lang === "zh" ? app.body : (app.bodyEn || app.body);
  var title = name + " · " + L.siteName;

  var jsonld = [{
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": name,
    "description": desc,
    "url": abs(paths[lang]),
    "inLanguage": L.htmlLang,
    "applicationCategory": "UtilitiesApplication",
    "operatingSystem": "Any modern browser",
    "browserRequirements": "Requires JavaScript",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "CNY" }
  }, {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": L.backToAll, "item": abs(homePath(lang)) },
      { "@type": "ListItem", "position": 2, "name": L.onlineHeading, "item": abs(onlineIndexPath(lang)) },
      { "@type": "ListItem", "position": 3, "name": name, "item": abs(paths[lang]) }
    ]
  }];

  return [
    head(lang, { title: title, desc: desc, paths: paths, jsonld: jsonld, ogType: "website" }),
    "",
    header(lang, false),
    "",
    '<main class="wrap">',
    '  <nav class="crumbs">',
    '    <a href="' + homePath(lang) + '">' + esc(L.backToAll) + "</a>",
    '    <span>/</span><a href="' + onlineIndexPath(lang) + '">' + esc(L.onlineHeading) + "</a>",
    '    <span>/</span><strong>' + esc(name) + "</strong>",
    "  </nav>",
    '  <h1 class="hero-title">' + esc(app.icon + " " + name) + "</h1>",
    '  <p class="hero-sub">' + esc(desc) + "</p>",
    '  <div class="app" data-app="' + esc(app.id) + '">',
    app.html.split("\n").map(function (l) { return "    " + l; }).join("\n"),
    "  </div>",
    '  <p class="privacy-note">' + esc(L.privacyNote) + "</p>",
    '  <section class="prose"><h2>' + esc(L.aboutThisTool) + "</h2><p>" + esc(bodyText) + "</p></section>",
    '  <p class="back-link"><a href="' + onlineIndexPath(lang) + '">← ' + esc(L.onlineHeading) + "</a></p>",
    "</main>",
    "",
    footer(lang),
    '<script src="/app.js?v=' + ASSET_V + '"></script>',
    '<script src="/online.js?v=' + ASSET_V + '"></script>',
    "</div>",
    "</body>",
    "</html>"
  ].join("\n");
}

function onlineIndexPage(lang) {
  var L = T[lang];
  var paths = {};
  LANGS.forEach(function (l) { paths[l] = onlineIndexPath(l); });
  var title = L.onlineHeading + " · " + L.siteName;
  var desc = L.onlineSub;

  var cards = APPS.map(function (a) {
    var name = lang === "zh" ? a.zhName : a.enName;
    var d = lang === "zh" ? a.zhDesc : a.enDesc;
    return '<a class="app-card" href="' + onlinePath(lang, a.id) + '">' +
      '<span class="app-card-icon">' + esc(a.icon) + "</span>" +
      '<span class="app-card-name">' + esc(name) + "</span>" +
      '<span class="app-card-desc">' + esc(d) + "</span></a>";
  }).join("\n");

  var jsonld = [{
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": title,
    "url": abs(paths[lang]),
    "inLanguage": L.htmlLang,
    "description": desc
  }, {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "numberOfItems": APPS.length,
    "itemListElement": APPS.map(function (a, i) {
      return { "@type": "ListItem", "position": i + 1, "url": abs(onlinePath(lang, a.id)),
        "name": lang === "zh" ? a.zhName : a.enName };
    })
  }];

  return [
    head(lang, { title: title, desc: desc, paths: paths, jsonld: jsonld, ogType: "website" }),
    "",
    header(lang, false),
    "",
    '<main class="wrap">',
    '  <nav class="crumbs">',
    '    <a href="' + homePath(lang) + '">' + esc(L.backToAll) + "</a>",
    '    <span>/</span><strong>' + esc(L.onlineHeading) + "</strong>",
    "  </nav>",
    '  <h1 class="hero-title">' + esc(L.onlineHeading) + "</h1>",
    '  <p class="hero-sub">' + esc(L.onlineSub) + "</p>",
    '  <div class="app-grid">',
    cards,
    "  </div>",
    '  <p class="privacy-note">' + esc(L.privacyNote) + "</p>",
    '  <p class="back-link"><a href="' + homePath(lang) + '">← ' + esc(L.backToAll) + "</a></p>",
    "</main>",
    "",
    footer(lang),
    '<script src="/app.js?v=' + ASSET_V + '"></script>',
    "</div>",
    "</body>",
    "</html>"
  ].join("\n");
}

/* ---------------- 分类页 ---------------- */
function categoryPage(lang, key) {
  var L = T[lang];
  var list = items.filter(function (t) { return t.category === key; })
    .sort(function (a, b) { return b.stars - a.stars; });
  var cards = list.map(function (t) { return card(t, lang); }).join("\n");
  var label = catLabel(lang, key);
  var paths = {};
  LANGS.forEach(function (l) { paths[l] = catPath(l, key); });

  var title = label + " · " + L.siteName;
  var desc = (lang === "zh"
    ? "开源" + label + "工具推荐，共 " + list.length + " 个精选 GitHub 项目，标注清楚怎么用。"
    : "Curated open-source " + label + " tools — " + list.length + " GitHub projects with clear usage notes.").slice(0, 300);

  var jsonld = [{
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": title,
    "url": abs(paths[lang]),
    "inLanguage": L.htmlLang,
    "description": desc
  }, {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "numberOfItems": list.length,
    "itemListElement": list.map(function (t, i) {
      return { "@type": "ListItem", "position": i + 1, "url": abs(toolPath(lang, t.id)), "name": t.name };
    })
  }, {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": L.backToAll, "item": abs(homePath(lang)) },
      { "@type": "ListItem", "position": 2, "name": L.categoriesHeading, "item": abs(categoriesPath(lang)) },
      { "@type": "ListItem", "position": 3, "name": label, "item": abs(paths[lang]) }
    ]
  }];

  return [
    head(lang, { title: title, desc: desc, paths: paths, jsonld: jsonld, ogType: "website" }),
    "",
    header(lang, false),
    "",
    '<main class="wrap">',
    '  <nav class="crumbs">',
    '    <a href="' + homePath(lang) + '">' + esc(L.backToAll) + "</a>",
    '    <span>/</span><a href="' + categoriesPath(lang) + '">' + esc(L.categoriesHeading) + "</a>",
    '    <span>/</span><strong>' + esc(label) + "</strong>",
    "  </nav>",
    '  <h1 class="hero-title">' + esc(label) + "</h1>",
    '  <p class="hero-sub">' + esc(L.catPageSub.replace("{n}", String(list.length))) + "</p>",
    '  <div class="grid">',
    cards,
    "  </div>",
    '  <p class="back-link"><a href="' + homePath(lang) + '">← ' + esc(L.backToAll) + "</a></p>",
    "</main>",
    "",
    footer(lang),
    '<script src="/app.js?v=' + ASSET_V + '"></script>',
    "</div>",
    "</body>",
    "</html>"
  ].join("\n");
}

function categoriesIndexPage(lang) {
  var L = T[lang];
  var paths = {};
  LANGS.forEach(function (l) { paths[l] = categoriesPath(l); });

  var counts = {};
  items.forEach(function (t) { counts[t.category] = (counts[t.category] || 0) + 1; });
  var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });

  var title = L.categoriesHeading + " · " + L.siteName;
  var desc = (lang === "zh"
    ? "按分类浏览 " + items.length + " 个精选开源项目：" + keys.map(function (k) { return catLabel(lang, k); }).join("、") + "。"
    : "Browse " + items.length + " curated open-source projects by category: " + keys.map(function (k) { return catLabel(lang, k); }).join(", ") + ".").slice(0, 300);

  var jsonld = [{
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": title,
    "url": abs(paths[lang]),
    "inLanguage": L.htmlLang,
    "description": desc
  }, {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "numberOfItems": keys.length,
    "itemListElement": keys.map(function (k, i) {
      return { "@type": "ListItem", "position": i + 1, "url": abs(catPath(lang, k)), "name": catLabel(lang, k) };
    })
  }];

  var cards = keys.map(function (k) {
    return '<a class="cat-card" href="' + catPath(lang, k) + '">' +
      '<span class="cat-name">' + esc(catLabel(lang, k)) + "</span>" +
      '<span class="cat-count">' + counts[k] + "</span></a>";
  }).join("\n");

  return [
    head(lang, { title: title, desc: desc, paths: paths, jsonld: jsonld, ogType: "website" }),
    "",
    header(lang, false),
    "",
    '<main class="wrap">',
    '  <nav class="crumbs">',
    '    <a href="' + homePath(lang) + '">' + esc(L.backToAll) + "</a>",
    '    <span>/</span><strong>' + esc(L.categoriesHeading) + "</strong>",
    "  </nav>",
    '  <h1 class="hero-title">' + esc(L.categoriesHeading) + "</h1>",
    '  <p class="hero-sub">' + esc(L.catPageSub.replace("{n}", String(items.length))) + "</p>",
    '  <div class="cat-grid">',
    cards,
    "  </div>",
    '  <p class="back-link"><a href="' + homePath(lang) + '">← ' + esc(L.backToAll) + "</a></p>",
    "</main>",
    "",
    footer(lang),
    '<script src="/app.js?v=' + ASSET_V + '"></script>',
    "</div>",
    "</body>",
    "</html>"
  ].join("\n");
}

// lastmod 逐页不同才有意义：全站同一个日期 Google 会直接忽略这个字段
function newestDate(list) {
  var d = "";
  list.forEach(function (t) { if (t.pushedAt && t.pushedAt > d) d = t.pushedAt; });
  return d || syncedAt;
}

function sitemap() {
  var urls = [];
  var siteMod = newestDate(items);
  var codeMod = syncedAt || new Date().toISOString().slice(0, 10);
  LANGS.forEach(function (l) {
    urls.push({ loc: abs(homePath(l)), paths: { zh: homePath("zh"), en: homePath("en") }, pri: "1.0", freq: "daily", mod: siteMod });
  });
  items.forEach(function (t) {
    LANGS.forEach(function (l) {
      urls.push({ loc: abs(toolPath(l, t.id)), paths: { zh: toolPath("zh", t.id), en: toolPath("en", t.id) }, pri: "0.7", freq: "weekly", mod: t.pushedAt || codeMod });
    });
  });
  LANGS.forEach(function (l) {
    urls.push({ loc: abs(categoriesPath(l)), paths: { zh: categoriesPath("zh"), en: categoriesPath("en") }, pri: "0.8", freq: "weekly", mod: siteMod });
  });
  comparePairs().forEach(function (p) {
    var pm = newestDate([p.a, p.b]);
    LANGS.forEach(function (l) {
      urls.push({ loc: abs(comparePath(l, p.a.id, p.b.id)), paths: { zh: comparePath("zh", p.a.id, p.b.id), en: comparePath("en", p.a.id, p.b.id) }, pri: "0.6", freq: "monthly", mod: pm });
    });
  });
  LANGS.forEach(function (l) {
    urls.push({ loc: abs(onlineIndexPath(l)), paths: { zh: onlineIndexPath("zh"), en: onlineIndexPath("en") }, pri: "0.9", freq: "monthly", mod: codeMod });
  });
  APPS.forEach(function (a) {
    LANGS.forEach(function (l) {
      urls.push({ loc: abs(onlinePath(l, a.id)), paths: { zh: onlinePath("zh", a.id), en: onlinePath("en", a.id) }, pri: "0.9", freq: "monthly", mod: codeMod });
    });
  });
  ["about", "disclaimer"].forEach(function (key) {
    LANGS.forEach(function (l) {
      urls.push({ loc: abs(contentPath(l, key)), paths: { zh: contentPath("zh", key), en: contentPath("en", key) }, pri: "0.5", freq: "monthly", mod: codeMod });
    });
  });
  var catKeys = {};
  items.forEach(function (t) { catKeys[t.category] = true; });
  Object.keys(catKeys).forEach(function (k) {
    var cm = newestDate(items.filter(function (t) { return t.category === k; }));
    LANGS.forEach(function (l) {
      urls.push({ loc: abs(catPath(l, k)), paths: { zh: catPath("zh", k), en: catPath("en", k) }, pri: "0.8", freq: "weekly", mod: cm });
    });
  });
  var body = urls.map(function (u) {
    return [
      "  <url>",
      "    <loc>" + esc(u.loc) + "</loc>",
      '    <xhtml:link rel="alternate" hreflang="zh-CN" href="' + esc(abs(u.paths.zh)) + '"/>',
      '    <xhtml:link rel="alternate" hreflang="en" href="' + esc(abs(u.paths.en)) + '"/>',
      '    <xhtml:link rel="alternate" hreflang="x-default" href="' + esc(abs(u.paths.zh)) + '"/>',
      "    <lastmod>" + u.mod + "</lastmod>",
      "    <changefreq>" + u.freq + "</changefreq>",
      "    <priority>" + u.pri + "</priority>",
      "  </url>"
    ].join("\n");
  }).join("\n");

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    body + "\n</urlset>\n";
}

function robots() {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    "Disallow: /scripts/",
    "Disallow: /.git/",
    "",
    "Sitemap: " + DOMAIN + "/sitemap.xml",
    ""
  ].join("\n");
}

/* ---------------- 写盘 ---------------- */
await rm(join(ROOT, "tool"), { recursive: true, force: true });
await rm(join(ROOT, "category"), { recursive: true, force: true });
await rm(join(ROOT, "categories"), { recursive: true, force: true });
await rm(join(ROOT, "compare"), { recursive: true, force: true });
await rm(join(ROOT, "online"), { recursive: true, force: true });
await rm(join(ROOT, "about"), { recursive: true, force: true });
await rm(join(ROOT, "disclaimer"), { recursive: true, force: true });
await rm(join(ROOT, "en"), { recursive: true, force: true });

var written = 0;
var allCatKeys = {};
items.forEach(function (t) { allCatKeys[t.category] = true; });
var catKeyList = Object.keys(allCatKeys).sort();
var pairList = comparePairs();

for (var li = 0; li < LANGS.length; li++) {
  var lang = LANGS[li];
  var homeDir = lang === "zh" ? ROOT : join(ROOT, "en");
  await mkdir(homeDir, { recursive: true });
  await writeFile(join(homeDir, "index.html"), homePage(lang), "utf8");
  written++;
  for (var ti = 0; ti < items.length; ti++) {
    var t = items[ti];
    var dir = join(ROOT, toolPath(lang, t.id).replace(/^[/]/, ""));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), toolPage(t, lang), "utf8");
    written++;
  }
  // 分类总览页
  var catIdxDir = join(ROOT, categoriesPath(lang).replace(/^[/]/, ""));
  await mkdir(catIdxDir, { recursive: true });
  await writeFile(join(catIdxDir, "index.html"), categoriesIndexPage(lang), "utf8");
  written++;
  // 各分类落地页
  for (var ci = 0; ci < catKeyList.length; ci++) {
    var ck = catKeyList[ci];
    var cdir = join(ROOT, catPath(lang, ck).replace(/^[/]/, ""));
    await mkdir(cdir, { recursive: true });
    await writeFile(join(cdir, "index.html"), categoryPage(lang, ck), "utf8");
    written++;
  }
  // 对比页
  for (var xi = 0; xi < pairList.length; xi++) {
    var pr = pairList[xi];
    var xdir = join(ROOT, comparePath(lang, pr.a.id, pr.b.id).replace(/^[/]/, ""));
    await mkdir(xdir, { recursive: true });
    await writeFile(join(xdir, "index.html"), comparePage(lang, pr), "utf8");
    written++;
  }
  // 站内在线工具
  var oIdxDir = join(ROOT, onlineIndexPath(lang).replace(/^[/]/, ""));
  await mkdir(oIdxDir, { recursive: true });
  await writeFile(join(oIdxDir, "index.html"), onlineIndexPage(lang), "utf8");
  written++;
  for (var ai = 0; ai < APPS.length; ai++) {
    var adir = join(ROOT, onlinePath(lang, APPS[ai].id).replace(/^[/]/, ""));
    await mkdir(adir, { recursive: true });
    await writeFile(join(adir, "index.html"), onlineAppPage(lang, APPS[ai]), "utf8");
    written++;
  }
  // 静态内容页
  var contentKeys = ["about", "disclaimer"];
  for (var pi = 0; pi < contentKeys.length; pi++) {
    var pk = contentKeys[pi];
    var pdir = join(ROOT, contentPath(lang, pk).replace(/^[/]/, ""));
    await mkdir(pdir, { recursive: true });
    await writeFile(join(pdir, "index.html"), contentPage(lang, pk), "utf8");
    written++;
  }
}
await writeFile(join(ROOT, "sitemap.xml"), sitemap(), "utf8");
await writeFile(join(ROOT, "robots.txt"), robots(), "utf8");

// 404.html 是手写页，只替换其中的资源引用，让版本号跟着一起更新
try {
  const nfPath = join(ROOT, "404.html");
  const nfHtml = await readFile(nfPath, "utf8");
  const patched = nfHtml
    .replace(/href="\/styles\.css[^"]*"/, 'href="/styles.css?v=' + ASSET_V + '"')
    .replace(/src="\/app\.js[^"]*"/, 'src="/app.js?v=' + ASSET_V + '"');
  if (patched !== nfHtml) await writeFile(nfPath, patched, "utf8");
} catch (e) {}

console.log("生成完成");
console.log("  语言: " + LANGS.join(" / "));
console.log("  工具数: " + items.length);
console.log("  分类数: " + catKeyList.length);
console.log("  页面总数: " + written + "（首页 " + LANGS.length + " + 工具页 " + items.length * LANGS.length +
  " + 分类总览 " + LANGS.length + " + 分类页 " + catKeyList.length * LANGS.length +
  " + 对比页 " + pairList.length * LANGS.length + " + 在线工具 " + (APPS.length + 1) * LANGS.length +
  " + 内容页 " + 2 * LANGS.length + "）");
console.log("  sitemap.xml 已重新生成");
console.log("  域名: " + DOMAIN);
