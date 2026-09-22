#!/usr/bin/env node
// 静态站点生成器：由 data/tools.json 生成全部页面（中英双语）
// 用法: node scripts/build-pages.mjs [域名]
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// 工具站部署在子域名；占卜站占用 lfun.cloud 主域名
const DOMAIN = (process.argv[2] || process.env.SITE_DOMAIN || "https://tools.lfun.cloud").replace(/[/]+$/, "");
const LANGS = ["zh", "en"];

const data = JSON.parse(await readFile(join(ROOT, "data/tools.json"), "utf8"));
const T = JSON.parse(await readFile(join(ROOT, "scripts/i18n.json"), "utf8"));
const items = data.items;
const syncedAt = (data.generatedAt || "").slice(0, 10);

// README 摘要缓存（由 scripts/fetch-readmes.mjs 生成）
let readmes = {};
try { readmes = JSON.parse(await readFile(join(ROOT, "data", "readmes.json"), "utf8")); } catch (e) {}
function readmeOf(t) {
  const r = readmes[t.id];
  return r && r.summary ? r.summary : "";
}

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
  if (has(t, "online")) {
    return t.homepage ? { label: L.btnOnline, url: t.homepage } : { label: L.btnNoOnline, url: "" };
  }
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
    '<html lang="' + L.htmlLang + '">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>" + esc(opt.title) + "</title>",
    '<meta name="description" content="' + esc(opt.desc) + '">',
    '<meta name="theme-color" content="#2563eb">',
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
    '<link rel="stylesheet" href="/styles.css">',
    '<script>window.__LANG__=' + JSON.stringify(lang) + ";window.__I18N__=" + i18nJs + ";</script>",
    "</head>"
  ].join("\n");
}

function header(lang, isHome) {
  var L = T[lang];
  var rows = [
    '<header class="topbar">',
    '  <div class="wrap topbar-inner">',
    '    <a class="brand" href="' + homePath(lang) + '">',
    '      <span class="brand-mark">🧰</span>',
    "      <div>",
    '        <span class="brand-name">' + esc(L.siteName) + "</span>",
    '        <p class="brand-sub">' + L.brandSub + "</p>",
    "      </div>",
    "    </a>",
    '    <div class="topbar-actions">',
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
    (t.tags || []).map(function (x) { return tagLabel("en", x); }).join(" ")]
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
function homePage(lang) {
  var L = T[lang];
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
    '<section class="hero">',
    '  <div class="wrap">',
    '    <h1 class="hero-title">' + esc(L.homeTitle) + "</h1>",
    '    <p class="hero-sub">' + items.length + " " + (lang === "zh" ? "个项目 · 其中 " + official + " 个有在线版或官网" : "projects · " + official + " with an online version or website") + "</p>",
    '    <div class="search-box">',
    '      <span class="search-icon">🔍</span>',
    '      <input id="search" type="search" placeholder="' + esc(L.searchPlaceholder) + '" autocomplete="off">',
    '      <button id="clear-search" class="search-clear" hidden>✕</button>',
    "    </div>",
    '    <div class="meta-row">',
    '      <span id="result-count"></span>',
    '      <span class="dot-sep">·</span>',
    '      <span class="sync-time">' + esc(todayLabel(lang)) + "</span>",
    "    </div>",
    "  </div>",
    "</section>",
    "",
    '<nav class="filters">',
    '  <div class="wrap filters-row filters-row-scene">',
    '    <div class="scene-switch">' + scenes + "</div>",
    '    <select id="sort" class="sort" aria-label="sort">',
    '      <option value="stars">' + esc(L.sortStars) + "</option>",
    '      <option value="name">' + esc(L.sortName) + "</option>",
    '      <option value="updated">' + esc(L.sortUpdated) + "</option>",
    "    </select>",
    "  </div>",
    '  <div class="wrap filters-row filters-row-usage">',
    '    <div id="usage-chips" class="chips chips-usage"></div>',
    "  </div>",
    '  <div class="wrap filters-row filters-row-cat">',
    '    <div id="chips" class="chips"></div>',
    "  </div>",
    "</nav>",
    "",
    '<main class="wrap">',
    '  <div id="grid" class="grid">',
    cards,
    "  </div>",
    '  <div id="empty" class="empty" hidden>',
    '    <p class="empty-emoji">🫥</p>',
    '    <p id="empty-text">' + esc(L.emptyMatch) + "</p>",
    '    <button id="reset-filters" class="btn-primary">' + esc(L.clearFilters) + "</button>",
    "  </div>",
    "</main>",
    "",
    footer(lang),
    '<script src="/app.js"></script>',
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
    '  <p class="footer-links"><a href="' + categoriesPath(lang) + '">' + esc(L.categoriesHeading) + "</a>" +
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
    '    <p class="detail-desc">' + esc(descOf(t, lang)) + "</p>",
    '    <div class="tags">' + plats + tags + "</div>",
    '    <figure class="repo-card-wrap">',
    '      <img class="repo-card" src="https://opengraph.githubassets.com/1/' + esc(t.repo) + '"',
    '           alt="' + esc(t.name) + ' 仓库概览卡片" width="1200" height="600" loading="lazy">',
    "    </figure>",
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
  lines.push('<script src="/app.js"></script>');
  lines.push("</body>");
  lines.push("</html>");
  return lines.join("\n");
}

/* ---------------- sitemap / robots ---------------- */
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
    '<script src="/app.js"></script>',
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
    '<script src="/app.js"></script>',
    "</body>",
    "</html>"
  ].join("\n");
}

function sitemap() {
  var urls = [];
  LANGS.forEach(function (l) {
    urls.push({ loc: abs(homePath(l)), paths: { zh: homePath("zh"), en: homePath("en") }, pri: "1.0", freq: "daily" });
  });
  items.forEach(function (t) {
    LANGS.forEach(function (l) {
      urls.push({ loc: abs(toolPath(l, t.id)), paths: { zh: toolPath("zh", t.id), en: toolPath("en", t.id) }, pri: "0.7", freq: "weekly" });
    });
  });
  LANGS.forEach(function (l) {
    urls.push({ loc: abs(categoriesPath(l)), paths: { zh: categoriesPath("zh"), en: categoriesPath("en") }, pri: "0.8", freq: "weekly" });
  });
  var catKeys = {};
  items.forEach(function (t) { catKeys[t.category] = true; });
  Object.keys(catKeys).forEach(function (k) {
    LANGS.forEach(function (l) {
      urls.push({ loc: abs(catPath(l, k)), paths: { zh: catPath("zh", k), en: catPath("en", k) }, pri: "0.8", freq: "weekly" });
    });
  });
  var body = urls.map(function (u) {
    return [
      "  <url>",
      "    <loc>" + esc(u.loc) + "</loc>",
      '    <xhtml:link rel="alternate" hreflang="zh-CN" href="' + esc(abs(u.paths.zh)) + '"/>',
      '    <xhtml:link rel="alternate" hreflang="en" href="' + esc(abs(u.paths.en)) + '"/>',
      '    <xhtml:link rel="alternate" hreflang="x-default" href="' + esc(abs(u.paths.zh)) + '"/>',
      "    <lastmod>" + syncedAt + "</lastmod>",
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
await rm(join(ROOT, "en"), { recursive: true, force: true });

var written = 0;
var allCatKeys = {};
items.forEach(function (t) { allCatKeys[t.category] = true; });
var catKeyList = Object.keys(allCatKeys).sort();

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
}
await writeFile(join(ROOT, "sitemap.xml"), sitemap(), "utf8");
await writeFile(join(ROOT, "robots.txt"), robots(), "utf8");

console.log("生成完成");
console.log("  语言: " + LANGS.join(" / "));
console.log("  工具数: " + items.length);
console.log("  分类数: " + catKeyList.length);
console.log("  页面总数: " + written + "（首页 " + LANGS.length + " + 工具页 " + items.length * LANGS.length +
  " + 分类总览 " + LANGS.length + " + 分类页 " + catKeyList.length * LANGS.length + "）");
console.log("  sitemap.xml 已重新生成");
console.log("  域名: " + DOMAIN);
