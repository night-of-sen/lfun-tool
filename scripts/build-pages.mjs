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
// 默认语言构建到根路径，另一种语言构建到 /<lang>/ 子目录
// 改默认语言只改这里：URL 前缀、hreflang 的 x-default、写盘目录都会跟着变
const DEFAULT_LANG = "en";

// 静态资源加内容指纹，避免浏览器缓存旧 CSS/JS
// （.htaccess 给 CSS/JS 设了 1 小时缓存，不加版本号的话改完样式用户要等一小时才看到）
const ASSET_V = await (async function () {
  const h = createHash("sha1");
  for (const f of ["styles.css", "app.js", "online.js", "sponsors.js"]) {
    try { h.update(await readFile(join(ROOT, f))); } catch (e) {}
  }
  return h.digest("hex").slice(0, 8);
})();

const data = JSON.parse(await readFile(join(ROOT, "data/tools.json"), "utf8"));
const T = JSON.parse(await readFile(join(ROOT, "scripts/i18n.json"), "utf8"));
const items = data.items;
const syncedAt = (data.generatedAt || "").slice(0, 10);
// 工具名+分类碰撞预计算：同名同分类的工具（如 skills/skills-2）title 必须加 repo 所有者区分，
// 否则 seo-audit 的"标题重复"检查会失败（2026-10-14 起 workflow 因此连续失败）
const titleKeyCount = {};
for (const t of items) {
  const k = (t.name || "") + "\0" + (t.category || "");
  titleKeyCount[k] = (titleKeyCount[k] || 0) + 1;
}
function titleNeedsOwner(t) {
  const k = (t.name || "") + "\0" + (t.category || "");
  return (titleKeyCount[k] || 0) > 1;
}
// 定价与广告位配置（PRD §7：全部可配置，不 hardcode）
const PRICING = JSON.parse(await readFile(join(ROOT, "scripts", "pricing.json"), "utf8"));
// 联盟链接配置（tool_id -> 联盟 URL；运行时 /go/ 优先读数据库，此处用于构建期卡片 Sponsored 版位）
const AFFILIATES = JSON.parse(await readFile(join(ROOT, "scripts", "affiliates.json"), "utf8"));
for (const t of items) {
  if (AFFILIATES[t.id]) { t.affiliate_url = AFFILIATES[t.id]; t.affiliate_enabled = true; }
}

// README 摘要缓存（由 scripts/fetch-readmes.mjs 生成）
let readmes = {};
try { readmes = JSON.parse(await readFile(join(ROOT, "data", "readmes.json"), "utf8")); } catch (e) {}
// 中文 README 摘要（批量翻译生成，独立文件，不受 fetch-readmes 覆盖）
let readmesZh = {};
try { readmesZh = JSON.parse(await readFile(join(ROOT, "data", "readmes-zh.json"), "utf8")); } catch (e) {}
// 中文短描述补丁（批量翻译生成，供缺 desc 的工具中文页使用）
let descZh = {};
try { descZh = JSON.parse(await readFile(join(ROOT, "data", "desc-zh.json"), "utf8")); } catch (e) {}

// 静态内容页（关于 / 免责声明）
const PAGES = JSON.parse(await readFile(join(ROOT, "scripts", "pages.json"), "utf8"));

// 站内在线工具（浏览器里直接可用，不是外链）
const APPS = JSON.parse(await readFile(join(ROOT, "scripts", "apps.json"), "utf8"));

// 搜索别名（人工维护，补上数据里搜不到的中文名和俗称）
let ALIASES = {};
try { ALIASES = JSON.parse(await readFile(join(ROOT, "scripts", "aliases.json"), "utf8")); } catch (e) {}
function readmeOf(t, lang) {
  if (lang === "zh" && readmesZh[t.id]) return readmesZh[t.id];
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

function langPrefix(lang) { return lang === DEFAULT_LANG ? "" : "/" + lang; }
function homePath(lang) { return lang === DEFAULT_LANG ? "/" : "/" + lang + "/"; }
function toolPath(lang, id) { return langPrefix(lang) + "/tool/" + id + "/"; }
function catPath(lang, key) { return langPrefix(lang) + "/category/" + key + "/"; }
function categoriesPath(lang) { return langPrefix(lang) + "/categories/"; }
function contentPath(lang, key) { return langPrefix(lang) + "/" + key + "/"; }
// P5 创作者：作者名 -> slug（小写、非字母数字转连字符）；老工具作者即仓库所有者，干净无冲突
function authorSlug(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}
function authorPath(lang, slug) { return langPrefix(lang) + "/author/" + slug + "/"; }
// 按 slug 聚合作者作品；只给 >=2 个作品的作者生成主页（39 位），单作品作者不单独建页
function authorGroups() {
  var map = {};
  items.forEach(function (x) {
    var name = authorOf(x);
    if (!name) return;
    var slug = authorSlug(name);
    if (!map[slug]) map[slug] = { slug: slug, name: name, works: [] };
    map[slug].works.push(x);
  });
  return Object.keys(map).map(function (k) { return map[k]; });
}
function multiAuthors() {
  return authorGroups().filter(function (g) { return g.works.length >= 2; });
}
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
  shield: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>',
  external: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/></svg>'
};

function abs(p) { return DOMAIN + p; }
function descOf(t, lang) { return lang === "en" ? (t.descEn || t.desc || "") : (t.desc || descZh[t.id] || t.descEn || ""); }
function catLabel(lang, k) { return T[lang].categories[k] || k; }
// 标签翻译：英文页查映射表；本来就是英文的标签没有映射，原样返回
function tagLabel(lang, tag) {
  if (lang !== "en") return tag;
  return (T.tagTranslations && T.tagTranslations[tag]) || tag;
}

/* ---------- 盈利化：联盟链接与跳转（PRD 模块二） ---------- */
// affiliate_url / affiliate_enabled 都是可空字段，向后兼容：
// 两个字段都不存在时，行为与改造前完全一致。
function affiliateOf(t) { return (t.affiliate_enabled && t.affiliate_url) ? t.affiliate_url : ""; }
function goPathFor(id) { return "/go/" + id + "/"; }
// 有联盟链接的外链一律带 sponsored nofollow（PRD 总体原则 2）
function outRel(t) { return affiliateOf(t) ? "sponsored nofollow noopener" : "noopener"; }

function baseAction(t, lang) {
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

// 联盟链接优先：外链统一改走 /go/[tool_id]（PRD 模块二）
function primaryAction(t, lang) {
  var act = baseAction(t, lang);
  if (affiliateOf(t) && act.url) return { label: act.label, url: goPathFor(t.id), sponsored: true };
  return act;
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
    "<!-- Google tag (gtag.js) -->",
    '<script async src="https://www.googletagmanager.com/gtag/js?id=G-573M99RHVE"></script>',
    "<script>",
    "  window.dataLayer = window.dataLayer || [];",
    "  function gtag(){dataLayer.push(arguments);}",
    "  gtag('js', new Date());",
    "",
    "  gtag('config', 'G-573M99RHVE');",
    "</script>",
    "<title>" + esc(opt.title) + "</title>",
    '<meta name="description" content="' + esc(opt.desc) + '">',
    '<meta name="theme-color" content="#0b0b0b">',
    '<link rel="canonical" href="' + esc(abs(opt.paths[lang])) + '">',
    alts,
    '<link rel="alternate" hreflang="x-default" href="' + esc(abs(opt.paths[DEFAULT_LANG])) + '">',
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

function header(lang, isHome, showMenu) {
  // 分类页也需要菜单按钮：窄屏下侧栏是抽屉，没有它就打不开；收藏按钮仍只在首页出现。
  var showMenuBtn = showMenu !== undefined ? showMenu : isHome;
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
    '      <a class="nav-item" href="' + contentPath(lang, "submit") + '">' + ICON.plus + esc(L.navSubmit) + "</a>",
    '      <a class="nav-item" href="https://globalfacthub.com" target="_blank" rel="noopener">' + ICON.external + esc(L.navGlobalFactHub) + "</a>",
    "    </nav>",
    '    <div class="topbar-actions">',
    '      <a class="btn-primary topbar-submit" href="' + contentPath(lang, "submit") + '">' + esc(L.submitH1) + "</a>",
    (showMenuBtn ? '      <button id="menu-toggle" class="btn-ghost" title="' + esc(L.menuToggle) + '">☰<span class="menu-label">' + esc(L.filterHint) + "</span></button>" : ""),
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
// P3：形态与价格派生（不编造：老工具无 form/price 字段时按 usage/repo 派生，
// CLI-only 工具形态未知，form 留空，只在“全部形态”下出现）
function formOf(t) {
  if (t.form) return t.form;
  var u = t.usage || [];
  if (u.indexOf("extension") !== -1) return "extension";
  if (u.indexOf("mobile") !== -1) return "mobile";
  if (u.indexOf("desktop") !== -1) return "desktop";
  if (u.indexOf("online") !== -1) return "web";
  if (u.indexOf("lib") !== -1) return "api";
  if (u.indexOf("list") !== -1) return "template";
  if (u.indexOf("selfhost") !== -1) return "web";
  return "";
}
function priceKeyOf(t) {
  if (t.price_model) return t.price_model;
  if (t.repo) return "opensource";
  return "";
}
function priceLabelOf(t, lang) {
  var L = T[lang];
  var k = priceKeyOf(t);
  if (!k) return "";
  return { free: L.priceFree, freemium: L.priceFreemium, paid: L.pricePaid, opensource: L.priceOpenSource }[k] || "";
}
function authorOf(t) {
  if (t.author_name) return t.author_name;
  if (t.repo) return t.repo.split("/")[0];
  return "";
}

function card(t, lang) {
  var L = T[lang];
  var color = LANG_COLORS[t.language] || "#8b949e";
  var owner = t.repo.split("/")[0];
  var initial = (t.name || "?").charAt(0);
  // 搜索文本的大头（名称/仓库/描述/标签）前端可以直接从卡片 DOM 读，
  // 这里只放 DOM 里没有的：另一种语言的描述与标签 + 中文别名。
  // 早先把整份索引塞进 data-search，光这一项就占了首页 16% 的体积。
  var extra = [];
  if (lang === "zh") {
    if (t.descEn) extra.push(t.descEn);
    (t.tags || []).forEach(function (x) { var e = tagLabel("en", x); if (e && e !== x) extra.push(e); });
  } else {
    if (t.desc) extra.push(t.desc);
    (t.tags || []).forEach(function (x) { extra.push(x); });
  }
  (ALIASES[t.id] || []).forEach(function (x) { extra.push(x); });
  if (t.language) extra.push(t.language);   // 保留「按语言搜索」，卡面 DOM 里只有可见文案
  var extraStr = extra.join(" ");

  var badges = "";
  if (t.archived) badges += '<span class="badge">' + esc(L.archived) + "</span>";
  if (t.caution) badges += '<span class="badge warn">' + esc(L.cautions[t.caution] || t.caution) + "</span>";
  // 联盟卡片：明确标注 Sponsored/赞助（PRD 总体原则 2）
  if (affiliateOf(t)) badges += '<span class="badge sponsored">' + esc(lang === "zh" ? "赞助" : "Sponsored") + "</span>";

  var plats = (t.platforms || []).filter(function (p) { return PLATFORM_LABELS[p]; })
    .map(function (p) { return '<span class="tag plat">' + PLATFORM_LABELS[p] + "</span>"; }).join("");
  var priceBadge = priceLabelOf(t, lang)
    ? '<span class="tag price-badge">' + esc(priceLabelOf(t, lang)) + "</span>" : "";
  // 标签最多 3 个展示；其余标签放进 data-extra，保证搜索不丢（见 extraStr 追加）
  var shownTags = (t.tags || []).slice(0, 3);
  var restTags = (t.tags || []).slice(3);
  var tags = shownTags.map(function (x) { return '<span class="tag">' + esc(tagLabel(lang, x)) + "</span>"; }).join("");
  // data-extra 追加：剩余标签 + 平台标签（卡片 .tags 不再含平台，避免搜索丢平台词）
  extraStr = [extraStr].concat(restTags).concat((t.platforms || []).filter(function (p) { return PLATFORM_LABELS[p]; }).map(function (p) { return PLATFORM_LABELS[p]; })).join(" ").trim();
  var a = primaryAction(t, lang);
  var primaryBtn = a.url
    ? '<a class="btn-primary" href="' + esc(a.url) + '" target="_blank" rel="' + outRel(t) + '">' + esc(a.label) + "</a>"
    : '<span class="btn-secondary is-muted">' + esc(a.label) + "</span>";
  var repoBtn = t.repo
    ? '<a class="btn-secondary" href="https://github.com/' + esc(t.repo) + '" target="_blank" rel="noopener">' + esc(L.btnRepo) + "</a>" : "";
  var author = authorOf(t);
  // 封面：新投稿有截图链接时用截图（加载失败自动移除，不留破图）；
  // 老工具无截图字段时用现有仓库头像图标兜底（加载失败走 iconFail，不留空白大图）
  var cover = t.screenshot_url
    ? '<div class="card-cover"><img class="card-cover-img" src="' + esc(t.screenshot_url) + '" alt="" loading="lazy" onerror="this.remove()"></div>'
    : '<div class="card-cover"><img class="icon" src="https://github.com/' + esc(owner) + '.png?size=96" alt="" loading="lazy" data-initial="' + esc(initial) + '" onerror="iconFail(this)"></div>';
  var starsStat = t.repo
    ? '    <span class="stat" title="' + esc(L.specStars) + '">★ <span class="star-n">' + fmtStars(t.stars) + "</span></span>" : "";
  var langStat = t.language
    ? '    <span class="stat"><i class="lang-dot" style="background:' + color + '"></i>' + esc(t.language) + "</span>" : "";

  return [
    '<article class="card" data-id="' + esc(t.id) + '" data-scene="' + sceneKey(t) + '"' + (affiliateOf(t) ? ' data-sponsored="1"' : ""),
    '  data-usage="' + esc((t.usage || []).join(" ")) + '" data-category="' + esc(t.category) + '"',
    '  data-stars="' + (t.stars || 0) + '" data-name="' + esc(t.name) + '"',
    '  data-updated="' + esc(t.pushedAt || "") + '" data-added="' + esc(t.addedAt || t.pushedAt || "") + '"',
    '  data-form="' + esc(formOf(t)) + '" data-price="' + esc(priceKeyOf(t)) + '" data-votes="0"',
    '  data-extra="' + esc(extraStr) + '">',
    '  <button class="fav" data-fav="' + esc(t.id) + '" title="' + esc(L.favTitle) + '">☆</button>',
    cover,
    '  <div class="card-meta">' + plats + priceBadge + "</div>",
    '    <div class="card-titles">',
    '      <h3 class="card-name"><a href="' + toolPath(lang, t.id) + '">' + esc(t.name) + "</a>" + badges + "</h3>",
    (t.repo ? '      <div class="card-repo">' + esc(t.repo) + "</div>" : ""),
    '      <div class="tier tier-' + deployTier(t) + '">' + esc(tierLabel(t, lang)) + "</div>",
    "    </div>",
    '  <p class="card-desc">' + esc(descOf(t, lang)) + "</p>",
    '  <div class="tags">' + tags + "</div>",
    '  <div class="card-foot">',
    (author ? '    <span class="card-author">' + esc(author) + "</span>" : ""),
    '    <button class="vote-btn" data-vote="' + esc(t.id) + '" type="button" title="' + esc(L.voteLabel) + '">♡ <span class="vote-n">0</span></button>',
    starsStat,
    langStat,
    '    <span class="actions">' + primaryBtn + repoBtn + "</span>",
    "  </div>",
    "</article>"
  ].join("\n").replace(/\n\s*/g, " ");
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
  // 联盟赞助卡片置顶（首屏可见），其余保持原顺序；运行时 sortCards() 会做同样处理
  var sorted = items.slice().sort(function (a, b) {
    var sa = affiliateOf(a) ? 1 : 0, sb = affiliateOf(b) ? 1 : 0;
    return sb - sa;
  });
  var cards = sorted.map(function (t) { return card(t, lang); }).join("\n");
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
    '      <a class="nav-item" href="' + contentPath(lang, "submit") + '">' + ICON.plus + esc(L.navSubmit) + "</a>",
    '      <a class="nav-item" href="https://globalfacthub.com" target="_blank" rel="noopener">' + ICON.external + esc(L.navGlobalFactHub) + "</a>",
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
    '        <option value="latest">' + esc(L.sortLatest) + "</option>",
    '        <option value="trending">' + esc(L.sortTrending) + "</option>",
    '        <option value="stars">' + esc(L.sortStars) + "</option>",
    '        <option value="name">' + esc(L.sortName) + "</option>",
    '        <option value="updated">' + esc(L.sortUpdated) + "</option>",
    "      </select>",
    // P3：形态 + 价格筛选放在排序区块内，不新增 side-title 区块（smoke 要求侧栏分区标题为 5 个）
    '      <label class="sort-label">' + esc(L.filterForm) + '<select id="form-filter" class="sort"><option value="all">' + esc(L.formAll) + "</option>" +
      [["web", L.formWeb], ["mobile", L.formMobile], ["desktop", L.formDesktop], ["extension", L.formExtension], ["plugin", L.formPlugin], ["api", L.formApi], ["template", L.formTemplate]].map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + "</option>"; }).join("") + "</select></label>",
    '      <label class="sort-label">' + esc(L.filterPrice) + '<select id="price-filter" class="sort"><option value="all">' + esc(L.priceAll) + "</option>" +
      [["free", L.priceFree], ["freemium", L.priceFreemium], ["paid", L.pricePaid], ["opensource", L.priceOpenSource]].map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + "</option>"; }).join("") + "</select></label>",
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
    '  <p class="hero-tagline">' + esc(L.heroTagline) + "</p>",
    '  <div class="hero-cta"><a class="btn-primary btn-lg" href="' + contentPath(lang, "submit") + '">' + esc(L.submitH1) + "</a></div>",
    '  <div class="meta-row">',
    '    <span id="result-count"></span>',
    '    <span class="dot-sep">·</span>',
    '    <span class="sync-time">' + esc(todayLabel(lang)) + "</span>",
    "  </div>",
    "</section>",
    // P5 展示区：全部用 spot-card / creator-card / cat-tile，不用 class="card"，
    // 也不放“立即试用”主按钮（试用按钮只在主列表卡片与详情页），避免 smoke 的按钮计数翻倍
    (function () {
      var catCounts = {};
      items.forEach(function (x) { catCounts[x.category] = (catCounts[x.category] || 0) + 1; });
      var catTiles = Object.keys(catCounts).sort().map(function (k) {
        return '<a class="cat-tile" href="' + catPath(lang, k) + '"><strong>' + esc(catLabel(lang, k)) + "</strong><span>" + catCounts[k] + "</span></a>";
      }).join("");
      var byAdded = items.slice().sort(function (a, b) {
        return String(b.addedAt || b.pushedAt || "").localeCompare(String(a.addedAt || a.pushedAt || ""));
      });
      function spot(t2) {
        return '<article class="spot-card"><h3><a href="' + toolPath(lang, t2.id) + '">' + esc(t2.name) + "</a></h3>" +
          '<p>' + esc(descOf(t2, lang)) + "</p>" +
          '<div class="spot-meta">' + esc(catLabel(lang, t2.category)) +
          (priceLabelOf(t2, lang) ? " · " + esc(priceLabelOf(t2, lang)) : "") + "</div></article>";
      }
      var todayHtml = byAdded.slice(0, 8).map(spot).join("");
      // 热门趋势：构建期点赞全为 0，按任务默认值退化为按最新排，并如实标注，不编造热度
      var trendHtml = byAdded.slice(0, 8).map(spot).join("");
      var creators = authorGroups().map(function (g) {
        var stars = g.works.reduce(function (s, x) { return s + (x.stars || 0); }, 0);
        return { g: g, stars: stars };
      }).sort(function (a, b) {
        if (b.g.works.length !== a.g.works.length) return b.g.works.length - a.g.works.length;
        return b.stars - a.stars;
      }).slice(0, 6);
      var creatorHtml = creators.map(function (c) {
        var g = c.g;
        var top = g.works.slice().sort(function (a, b) { return (b.stars || 0) - (a.stars || 0); }).slice(0, 3);
        var nameHtml = g.works.length >= 2
          ? '<a href="' + authorPath(lang, g.slug) + '">' + esc(g.name) + "</a>"
          : esc(g.name);
        return '<article class="creator-card">' +
          '<img class="icon" src="https://github.com/' + esc(g.name) + '.png?size=96" alt="" data-initial="' + esc(g.name.charAt(0)) + '" onerror="iconFail(this)">' +
          "<h3>" + nameHtml + "</h3>" +
          "<p>" + g.works.length + esc(L.creatorWorks) + "</p>" +
          '<ul>' + top.map(function (x) { return '<li><a href="' + toolPath(lang, x.id) + '">' + esc(x.name) + "</a></li>"; }).join("") + "</ul></article>";
      }).join("");
      return '<section class="showcase"><h2>' + esc(L.catTilesTitle) + '</h2><div class="cat-tiles">' + catTiles + "</div></section>" +
        '<section class="showcase"><h2>' + esc(L.todayNew) + '</h2><div class="spot-grid">' + todayHtml + "</div></section>" +
        '<section class="showcase"><h2>' + esc(L.trendingTitle) + "</h2><p class=\"showcase-note\">" + esc(L.trendingFallback) + '</p><div class="spot-grid">' + trendHtml + "</div></section>" +
        '<section class="showcase"><h2>' + esc(L.creatorSpotlight) + '</h2><div class="creator-grid">' + creatorHtml + "</div></section>";
    })(),
    // 赞助位：数据在数据库里，构建期读不到，所以留空容器由 sponsors.js 运行时注入。
    // 没有生效赞助时容器保持 hidden —— 不留空位（PRD 5.3 的精神）。
    '<section class="sponsor-block" id="sponsor-home" data-slot="homepage" hidden>',
    '  <h2 class="sponsor-title">' + esc(L.weeklyPicks) + "</h2>",
    '  <div class="grid" id="sponsor-home-grid"></div>',
    "</section>",
    '<script src="/sponsors.js?v=' + ASSET_V + '" defer></script>',
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
    newsPopup(lang),
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

/* ---------------- Newsletter 订阅（PRD 模块六）：页脚订阅框 + 首页弹窗 ---------------- */
function newsForm(lang, ctx) {
  var L = T[lang];
  return [
    '<form class="news-form" data-news-form data-ctx="' + ctx + '" method="POST" action="/api/subscribe.php">',
    '  <input type="text" name="_hp" class="hp" tabindex="-1" autocomplete="off">',
    '  <div class="news-row">',
    '    <input type="email" name="email" required placeholder="you@example.com" aria-label="' + esc(L.newsTitle) + '">',
    '    <button type="submit" class="btn-primary">' + esc(L.newsBtn) + "</button>",
    "  </div>",
    '  <p class="news-msg" data-news-msg aria-live="polite" hidden></p>',
    "</form>"
  ].join("\n");
}

function newsPopup(lang) {
  var L = T[lang];
  return [
    '<div class="news-popup" data-news-popup hidden>',
    '  <div class="news-popup-card" role="dialog" aria-modal="true" aria-label="' + esc(L.newsTitle) + '">',
    '    <button class="news-popup-close" data-news-close aria-label="✕">✕</button>',
    "    <h3>" + esc(L.newsTitle) + "</h3>",
    "    <p>" + esc(L.newsDesc) + "</p>",
    newsForm(lang, "popup"),
    "  </div>",
    "</div>"
  ].join("\n");
}

function newsScript(lang) {
  var L = T[lang];
  var js = [
    "(function(){",
    "var OK=" + JSON.stringify(L.newsOk) + ",ALREADY=" + JSON.stringify(L.newsAlready) + ",ERR=" + JSON.stringify(L.newsErr) + ";",
    "function stamp(){try{localStorage.setItem('nl_ts',String(Date.now()));}catch(e){}}",
    "function bind(form){",
    "var msg=form.querySelector('[data-news-msg]');",
    "form.addEventListener('submit',function(ev){",
    "ev.preventDefault();",
    "fetch(form.action,{method:'POST',body:new FormData(form),credentials:'same-origin'})",
    ".then(function(r){return r.json().then(function(d){return{ok:r.ok&&d&&d.ok,already:!!(d&&d.already),err:d&&d.error};});})",
    ".then(function(res){",
    "msg.hidden=false;",
    "if(res.ok){msg.textContent=res.already?ALREADY:OK;msg.className='news-msg ok';stamp();form.querySelector('input[type=email]').value='';}",
    "else{msg.textContent=res.err||ERR;msg.className='news-msg err';}",
    "})",
    ".catch(function(){msg.hidden=false;msg.textContent=ERR;msg.className='news-msg err';});",
    "});}",
    "var forms=document.querySelectorAll('[data-news-form]');",
    "for(var i=0;i<forms.length;i++)bind(forms[i]);",
    "var pop=document.querySelector('[data-news-popup]');",
    "if(pop){",
    "var last=0;try{last=parseInt(localStorage.getItem('nl_ts')||'0',10)||0;}catch(e){}",
    "function hide(){pop.hidden=true;stamp();}",
    "var closeBtn=pop.querySelector('[data-news-close]');",
    "if(closeBtn)closeBtn.addEventListener('click',hide);",
    "pop.addEventListener('click',function(ev){if(ev.target===pop)hide();});",
    "if(Date.now()-last>30*24*3600*1000){setTimeout(function(){pop.hidden=false;},10000);}",
    "}",
    "})();"
  ].join("\n");
  return "<script>" + js + "</script>";
}

function footer(lang) {
  var L = T[lang];
  return [
    '<footer class="footer wrap">',
    "  <p>" + esc(L.siteName) + " · " + esc(L.footerNote) + "</p>",
    '  <div class="news-block">',
    '    <div class="news-text"><strong>' + esc(L.newsTitle) + "</strong><span>" + esc(L.newsDesc) + "</span></div>",
    newsForm(lang, "footer"),
    "  </div>",
    '  <p class="footer-links"><a href="' + onlineIndexPath(lang) + '">' + esc(L.onlineHeading) + "</a>" +
      '<a href="' + categoriesPath(lang) + '">' + esc(L.categoriesHeading) + "</a>" +
      '<a href="' + contentPath(lang, "about") + '">' + esc(L.aboutLabel) + "</a>" +
      '<a href="' + contentPath(lang, "partner") + '">' + esc(L.navPartner) + "</a>" +
      '<a href="' + contentPath(lang, "submit") + '">' + esc(L.navSubmit) + "</a>" +
      '<a href="' + contentPath(lang, "disclaimer") + '">' + esc(L.disclaimerLabel) + "</a>" +
      '<a href="' + L.langSwitchHref + '">' + esc(L.langSwitch) + "</a></p>",
    '  <p class="footer-disclosure">' + esc(L.affiliateDisclosure) + "</p>",
    "</footer>",
    newsScript(lang)
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
  // 联盟卡片：明确标注 Sponsored/赞助（PRD 总体原则 2）
  if (affiliateOf(t)) badges += '<span class="badge sponsored">' + esc(lang === "zh" ? "赞助" : "Sponsored") + "</span>";

  var plats = (t.platforms || []).filter(function (p) { return PLATFORM_LABELS[p]; })
    .map(function (p) { return '<span class="tag plat">' + PLATFORM_LABELS[p] + "</span>"; }).join("");
  var tags = (t.tags || []).map(function (x) { return '<span class="tag">' + esc(tagLabel(lang, x)) + "</span>"; }).join("");

  // P4 相似工具：先同主分类 + 同标签（共享标签数多者优先），不足 3 个再用同分类补齐
  function sharedTags(x) {
    var a = t.tags || [], b = x.tags || [];
    return b.filter(function (v) { return a.indexOf(v) !== -1; }).length;
  }
  var related = items.filter(function (x) {
    return x.id !== t.id && x.category === t.category && sharedTags(x) > 0;
  }).sort(function (x, y) {
    var d = sharedTags(y) - sharedTags(x);
    if (d) return d;
    return (y.stars || 0) - (x.stars || 0);
  }).slice(0, 6);
  if (related.length < 3) {
    var extra = items.filter(function (x) {
      return x.id !== t.id && x.category === t.category && related.indexOf(x) === -1;
    }).sort(function (x, y) { return y.stars - x.stars; }).slice(0, 6 - related.length);
    related = related.concat(extra);
  }

  // P4：GitHub 信息（星数）只在 repo 非空时出现；语言/许可证无值时不硬填
  var specRows = [];
  if (t.repo) specRows.push([L.specStars, "★ " + fmtStars(t.stars)]);
  if (t.language) specRows.push([L.specLang, t.language]);
  if (t.license && t.license !== "-") specRows.push([L.specLicense, t.license]);
  else if (t.repo) specRows.push([L.specLicense, L.noLicense]);
  if (t.pushedAt) specRows.push([L.specUpdated, t.pushedAt]);
  specRows.push([L.specCategory, catLabel(lang, t.category)]);
  specRows.push([L.specScene, L.scenes[sceneKey(t)]]);
  var specs = specRows.map(function (row) {
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
    "author": { "@type": "Organization", "name": authorOf(t) || owner },
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

  // P4：codeRepository 与免费 offers 只在对应数据真实存在时写入 JSON-LD，不编造
  if (t.repo) jsonld[0].codeRepository = "https://github.com/" + t.repo;
  if (priceKeyOf(t) === "free" || priceKeyOf(t) === "opensource") {
    jsonld[0].offers = { "@type": "Offer", "price": "0", "priceCurrency": "USD" };
  } else if (t.price_detail) {
    jsonld[0].offers = { "@type": "Offer", "priceCurrency": "USD", "description": t.price_detail };
  }
  var titleName = titleNeedsOwner(t) ? t.name + " (" + t.repo.split("/")[0] + ")" : t.name;
  var title = lang === "zh"
    ? titleName + " · " + catLabel(lang, t.category) + " · " + L.siteName
    : titleName + " · " + catLabel(lang, t.category) + " · " + L.siteName;
  var descBase = descOf(t, lang);
  // 工具名强制前缀：保证所有工具页 meta 描述全局唯一
  // （不同工具的 descEn 可能完全相同，如 tinyrenderer/tinyraytracer、opencode/opencode-2）
  descBase = t.name + (lang === "en" ? ": " : " - ") + descBase;
  var desc = (descBase + (t.repo ? " ⭐ " + fmtStars(t.stars) + " · " : " · ") + (t.language || "") + " · " + (t.license || "")).slice(0, 300);

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
    // P4 头部常驻试用按钮：文章顶部 sticky 条，随滚动常驻（底部 detail-actions 保留）
    (a.url ? '    <div class="detail-trybar"><a class="btn-primary" href="' + esc(a.url) + '" target="_blank" rel="' + outRel(t) + '">' + esc(a.label) + "</a></div>" : ""),
    '    <header class="detail-head">',
    (t.repo
      ? '      <img class="icon icon-lg" src="https://github.com/' + esc(owner) + '.png?size=160" alt="" data-initial="' + esc(initial) + '" onerror="iconFail(this)">'
      : (t.screenshot_url
        ? '      <img class="icon icon-lg" src="' + esc(t.screenshot_url) + '" alt="" data-initial="' + esc(initial) + '" onerror="iconFail(this)">'
        : '      <span class="icon icon-lg icon-fallback">' + esc(initial) + "</span>")),
    "      <div>",
    '        <h1 class="detail-name">' + esc(t.name) + badges + "</h1>",
    (t.repo ? '        <div class="card-repo">' + esc(t.repo) + "</div>" : ""),
    // P4 价格与平台徽章跟标题走
    '        <div class="card-meta">' + plats + (priceLabelOf(t, lang) ? '<span class="tag price-badge">' + esc(priceLabelOf(t, lang)) + "</span>" : "") + "</div>",
    "      </div>",
    '      <button class="fav fav-lg" data-fav="' + esc(t.id) + '" title="' + esc(L.favTitle) + '">☆</button>',
    "    </header>",
    '    <div class="tier-banner tier-' + deployTier(t) + '">',
    '      <strong>' + esc(tierLabel(t, lang)) + "</strong>",
    '      <span>' + esc(TIER_DESC[lang][deployTier(t)]) + "</span>",
    "    </div>",
    '    <p class="detail-desc">' + esc(descOf(t, lang)) + "</p>",
    '    <div class="tags">' + tags + "</div>",
    // P4 正文顺序：截图/视频轮播 → 亮点 → 价格说明 → 更新记录 → 作者卡 → 信任信息 → 试用反馈
    (t.screenshot_url
      ? '    <figure class="repo-card-wrap"><img class="repo-card" src="' + esc(t.screenshot_url) + '" alt="' + esc(t.name) + '" loading="lazy"></figure>'
      : "    " + visualHtml(t, lang)),
    (t.video_url
      ? '    <p><a class="btn-secondary btn-lg" href="' + esc(t.video_url) + '" target="_blank" rel="noopener">' + esc(L.detailVideo) + "</a></p>"
      : ""),
    (t.highlights
      ? '    <section class="detail-sec"><h2>' + esc(L.detailHighlights) + "</h2><ul>" +
        String(t.highlights).split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 5).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") +
        "</ul></section>"
      : ""),
    ((priceLabelOf(t, lang) || t.price_detail)
      ? '    <section class="detail-sec"><h2>' + esc(L.detailPricing) + "</h2><p>" +
        esc((priceLabelOf(t, lang) ? priceLabelOf(t, lang) : "") + (t.price_detail ? (priceLabelOf(t, lang) ? " · " : "") + t.price_detail : "")) + "</p></section>"
      : ""),
    ((t.pushedAt || t.addedAt)
      ? '    <section class="detail-sec"><h2>' + esc(L.detailUpdates) + "</h2><p>" +
        esc((t.pushedAt ? (lang === "zh" ? "最后更新 " : "Last updated ") + t.pushedAt : "") +
        (t.addedAt ? (t.pushedAt ? "；" : "") + (lang === "zh" ? "收录 " : "Listed ") + t.addedAt : "")) + "</p></section>"
      : ""),
    (authorOf(t)
      ? '    <section class="detail-sec"><h2>' + esc(L.detailAuthor) + "</h2><p>" +
        (t.author_url
          ? '<a href="' + esc(t.author_url) + '" target="_blank" rel="noopener">' + esc(authorOf(t)) + "</a>"
          : esc(authorOf(t))) + "</p>" +
        (function () {
          var works = items.filter(function (x) { return x.id !== t.id && authorOf(x) === authorOf(t); }).slice(0, 6);
          if (!works.length) return "";
          return "<h3>" + esc(L.detailAuthorWorks) + "</h3><ul>" +
            works.map(function (x) { return '<li><a href="' + toolPath(lang, x.id) + '">' + esc(x.name) + "</a></li>"; }).join("") + "</ul>";
        })() + "</section>"
      : ""),
    // P4 信任信息：只写真实日期——收录时间（addedAt，新投稿上架时填）、最后更新（pushedAt）、
    // 数据同步时间（syncedAt）；没有 approval 时间字段，不把同步时间冒充为审核/检查时间
    '    <section class="detail-sec"><h2>' + esc(L.detailTrust) + "</h2><p>" +
      esc([
        t.addedAt ? (L.detailAdded + " " + t.addedAt) : "",
        t.pushedAt ? (L.specUpdated + " " + t.pushedAt) : "",
        t.syncedAt ? (L.detailSynced + " " + String(t.syncedAt).slice(0, 10)) : ""
      ].filter(Boolean).join(lang === "zh" ? "；" : "; ") || (lang === "zh" ? "暂无可验证日期" : "No verifiable dates yet")) + "</p></section>",
    '    <section class="detail-sec"><h2>' + esc(L.detailFeedback) + "</h2><p>" + esc(L.detailVoteHint) + "</p>" +
    '      <button class="vote-btn" data-vote="' + esc(t.id) + '" type="button">' + esc(L.voteLabel) + ' ♡ <span class="vote-n">0</span></button></section>',
    (t.dockerCmd ? '    <div class="deploy-block">' +
      '<div class="deploy-head"><h2>' + esc(lang === "zh" ? "部署命令" : "Deploy command") + "</h2>" +
      '<button class="copy-btn" type="button" data-copy="' + esc(t.dockerCmd) + '">' +
      esc(lang === "zh" ? "复制" : "Copy") + "</button></div>" +
      "<pre><code>" + esc(t.dockerCmd) + "</code></pre>" +
      '<p class="deploy-note">' + esc(lang === "zh"
        ? "摘自项目 README。需要一台装了 Docker 的服务器，命令可能还需补充环境变量。"
        : "Taken from the project README. You need a server with Docker; you may still need to add environment variables.") + "</p></div>" : ""),
    (readmeOf(t, lang) ? '    <div class="readme"><h2>' + esc(L.readmeHeading) + "</h2><p>" + esc(readmeOf(t, lang)) + "</p></div>" : ""),
    '    <dl class="specs">',
    specs,
    "    </dl>",
    '    <div class="detail-actions">',
    (a.url ? '      <a class="btn-primary btn-lg" href="' + esc(a.url) + '" target="_blank" rel="' + outRel(t) + '">' + esc(a.label) + "</a>" : ""),
    (t.repo ? '      <a class="btn-secondary btn-lg" href="https://github.com/' + esc(t.repo) + '" target="_blank" rel="noopener">' + esc(L.btnRepo) + "</a>" : ""),
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

/* ---------------- P5 创作者主页（作者作品列表页，第一版，不做关注系统） ---------------- */
function authorPage(g, lang) {
  var L = T[lang];
  var paths = {};
  LANGS.forEach(function (l) { paths[l] = authorPath(l, g.slug); });
  var works = g.works.slice().sort(function (a, b) { return (b.stars || 0) - (a.stars || 0); });
  var title = g.name + " · " + L.authorTitle + " · " + L.siteName;
  var desc = g.name + " · " + works.length + (lang === "zh" ? " 个作品：" : " works: ") +
    works.map(function (x) { return x.name; }).join(lang === "zh" ? "、" : ", ");
  var jsonld = [{
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": title,
    "url": abs(paths[lang]),
    "inLanguage": L.htmlLang,
    "description": desc
  }, {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": L.backToAll, "item": abs(homePath(lang)) },
      { "@type": "ListItem", "position": 2, "name": g.name, "item": abs(paths[lang]) }
    ]
  }];
  var cards = works.map(function (x) { return card(x, lang); }).join("\n");
  return [
    head(lang, { title: title, desc: desc, paths: paths, jsonld: jsonld, ogType: "website" }),
    "",
    header(lang, false),
    '<main class="wrap">',
    '  <nav class="crumbs"><a href="' + homePath(lang) + '">' + esc(L.backToAll) + "</a><span>/</span><strong>" + esc(g.name) + "</strong></nav>",
    '  <div class="creator-head">',
    '    <img class="icon icon-lg" src="https://github.com/' + esc(g.name) + '.png?size=160" alt="" data-initial="' + esc(g.name.charAt(0)) + '" onerror="iconFail(this)">',
    "    <div>",
    "      <h1>" + esc(g.name) + "</h1>",
    "      <p>" + works.length + esc(L.creatorWorks) + "</p>",
    "    </div>",
    "  </div>",
    '  <div class="grid">',
    cards,
    "  </div>",
    "</main>",
    "",
    footer(lang),
    '<script src="/app.js?v=' + ASSET_V + '"></script>',
    "</div>",
    "</body>",
    "</html>"
  ].join("\n");
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
  var hp = t.homepage || t.work_url || "";
  if (hp) {
    var shot = "https://s0.wp.com/mshots/v1/" + encodeURIComponent(hp) + "?w=1200";
    return '<figure class="repo-card-wrap"><img class="repo-card" src="' + esc(shot) +
      '" alt="' + esc(alt) + '" width="1200" height="675" loading="lazy" referrerpolicy="no-referrer"></figure>';
  }
  if (!t.repo) return "";
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

  // 分类页左侧栏：只做导航 + 11 主分类链接，不搬首页的 JS 筛选
  //（不放 scene-btn、#chips、#usage-chips、#sort、#form-filter、#price-filter，
  // 避免 app.js 在分类页误绑，也避免冒烟的首页侧栏 5 分区计数受影响）。
  // 顺序与首页侧栏一致：i18n categories 的键顺序；数量为当期全量计数。
  var catCounts = {};
  items.forEach(function (x) { catCounts[x.category] = (catCounts[x.category] || 0) + 1; });
  var catNav = Object.keys(T[lang].categories).map(function (k) {
    var active = k === key ? " active" : "";
    var current = k === key ? ' aria-current="page"' : "";
    return '<a class="chip' + active + '" href="' + catPath(lang, k) + '"' + current + ">" +
      esc(catLabel(lang, k)) + ' <span class="chip-n">' + (catCounts[k] || 0) + "</span></a>";
  }).join("");
  var catSidebar = [
    '  <aside class="sidebar" id="sidebar">',
    '    <div class="sidebar-head">',
    '      <span>' + esc(L.sideNav) + "</span>",
    '      <button class="sidebar-close" id="sidebar-close" aria-label="close">✕</button>',
    "    </div>",
    '    <nav class="side-block">',
    '      <h3 class="side-title">' + esc(L.sideNav) + "</h3>",
    '      <a class="nav-item" href="' + homePath(lang) + '">' + ICON.home + esc(L.navHome) + "</a>",
    '      <a class="nav-item" href="' + onlineIndexPath(lang) + '">' + ICON.bolt + esc(L.navOnline) + "</a>",
    '      <a class="nav-item active" href="' + categoriesPath(lang) + '">' + ICON.grid + esc(L.navCategories) + "</a>",
    '      <a class="nav-item" href="' + contentPath(lang, "about") + '">' + ICON.info + esc(L.navAbout) + "</a>",
    '      <a class="nav-item" href="' + contentPath(lang, "disclaimer") + '">' + ICON.shield + esc(L.navDisclaimer) + "</a>",
    '      <a class="nav-item" href="' + contentPath(lang, "submit") + '">' + ICON.plus + esc(L.navSubmit) + "</a>",
    '      <a class="nav-item" href="https://globalfacthub.com" target="_blank" rel="noopener">' + ICON.external + esc(L.navGlobalFactHub) + "</a>",
    "    </nav>",
    '    <div class="side-block">',
    '      <h3 class="side-title">' + esc(L.sideCategory) + "</h3>",
    '      <div class="chips chips-catnav">',
    '        <a class="chip" href="' + homePath(lang) + '">' + esc(L.backToAll) + ' <span class="chip-n">' + items.length + "</span></a>",
    catNav,
    "      </div>",
    "    </div>",
    "  </aside>",
    '  <div class="sidebar-backdrop" id="sidebar-backdrop"></div>'
  ].join("\n");

  return [
    head(lang, { title: title, desc: desc, paths: paths, jsonld: jsonld, ogType: "website" }),
    "",
    header(lang, false, true),
    "",
    '<div class="layout" id="layout">',
    catSidebar,
    '  <main class="content">',
    '  <nav class="crumbs">',
    '    <a href="' + homePath(lang) + '">' + esc(L.backToAll) + "</a>",
    '    <span>/</span><a href="' + categoriesPath(lang) + '">' + esc(L.categoriesHeading) + "</a>",
    '    <span>/</span><strong>' + esc(label) + "</strong>",
    "  </nav>",
    '  <h1 class="hero-title">' + esc(label) + "</h1>",
    '  <p class="hero-sub">' + esc(L.catPageSub.replace("{n}", String(list.length))) + "</p>",
    '<section class="sponsor-block" id="sponsor-cat" data-slot="category" data-category="' + esc(key) + '" hidden>',
    '  <div class="grid" id="sponsor-cat-grid"></div>',
    "</section>",
    '<script src="/sponsors.js?v=' + ASSET_V + '" defer></script>',
    '  <div class="grid">',
    cards,
    "  </div>",
    '  <p class="back-link"><a href="' + homePath(lang) + '">← ' + esc(L.backToAll) + "</a></p>",
    "</main>",
    "</div>",
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
  ["about", "disclaimer", "partner", "submit"].forEach(function (key) {
    LANGS.forEach(function (l) {
      urls.push({ loc: abs(contentPath(l, key)), paths: { zh: contentPath("zh", key), en: contentPath("en", key) }, pri: "0.5", freq: "monthly", mod: codeMod });
    });
  });
  var catKeys = {};
  items.forEach(function (t) { catKeys[t.category] = true; });
  multiAuthors().forEach(function (g) {
    var am = newestDate(g.works);
    LANGS.forEach(function (l) {
      urls.push({ loc: abs(authorPath(l, g.slug)), paths: { zh: authorPath("zh", g.slug), en: authorPath("en", g.slug) }, pri: "0.6", freq: "weekly", mod: am });
    });
  });
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
      '    <xhtml:link rel="alternate" hreflang="x-default" href="' + esc(abs(u.paths[DEFAULT_LANG])) + '"/>',
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

/* ---------------- 商务合作页（PRD 模块一） ---------------- */
function partnerPage(lang) {
  var L = T[lang];
  var paths = {};
  LANGS.forEach(function (l) { paths[l] = contentPath(l, "partner"); });
  var jsonld = [{
    "@context": "https://schema.org", "@type": "WebPage",
    "name": L.partnerTitle, "url": abs(paths[lang]), "inLanguage": L.htmlLang, "description": L.partnerDesc
  }, {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": L.backToAll, "item": abs(homePath(lang)) },
      { "@type": "ListItem", "position": 2, "name": L.partnerH1, "item": abs(paths[lang]) }
    ]
  }];
  var ways = (L.ways || []).map(function (w) {
    return '    <div class="way"><h3>' + esc(w[0]) + "</h3><p>" + esc(w[1]) + "</p></div>";
  }).join("\n");
  var rows = (PRICING.items || []).map(function (it) {
    return "      <tr><td>" + esc(lang === "zh" ? it.zh : it.en) + "</td><td class=\"price\" data-price-key=\"" + esc(it.key) + "\">$" + it.price + "</td></tr>";
  }).join("\n");
  var action = (PRICING.partner && PRICING.partner.form_action) || "";
  var mail = (PRICING.partner && PRICING.partner.contact_email) || "";
  // 类型下拉框必须带后端白名单里的 value，否则提交后全被归成 other
  var typeCodes = ["affiliate", "featured", "paid_review", "newsletter", "other"];
  var types = (L.partnerTypes || []).map(function (x, i) {
    return '<option value="' + (typeCodes[i] || "other") + '">' + esc(x) + "</option>";
  }).join("");
  // 首屏邮箱直达：不用滚到底部表单也能联系
  var contact = mail
    ? '  <p class="partner-contact">' + esc(L.partnerContact || "") + ' <a data-mailto href="mailto:' + esc(mail) + '">' + esc(mail) + "</a></p>"
    : "";
  // 表单后端尚未接入：action 为空时不假装能提交，改为提示 + 邮件兜底
  var form = action
    ? '    <form id="partner-form" class="partner-form" method="POST" action="' + esc(action) + '">' +
      '<input type="text" name="_hp" class="hp" tabindex="-1" autocomplete="off">' +
      '<input type="hidden" name="_ts" id="partner-ts" value="">' +
      '<label>' + esc(L.partnerName) + '<input name="name" required maxlength="120"></label>' +
      '<label>' + esc(L.partnerCompany) + '<input name="company" maxlength="160"></label>' +
      '<label>' + esc(L.partnerEmail) + '<input type="email" name="email" required maxlength="200"></label>' +
      '<label>' + esc(L.partnerType) + '<select name="type">' + types + "</select></label>" +
      '<label>' + esc(L.partnerMessage) + '<textarea name="message" rows="4" maxlength="4000"></textarea></label>' +
      '<button class="btn-primary btn-lg" type="submit">' + esc(L.partnerSubmit) + "</button></form>" +
      '    <p id="partner-msg" class="form-msg" aria-live="polite"></p>'
    : '    <p class="partner-note">' + esc(L.partnerNoBackend) +
      (mail ? ' <a href="mailto:' + esc(mail) + '">' + esc(mail) + "</a>" : "") + "</p>";
  // 内联提交脚本：fetch 提交不跳 JSON 页，成功记一次 GA4 generate_lead
  var partnerJs = [
    "(function(){",
    "var form=document.getElementById('partner-form');",
    "var msg=document.getElementById('partner-msg');",
    "function lead(m){try{if(typeof gtag==='function'){gtag('event','generate_lead',{method:m});}}catch(e){}}",
    "var links=document.querySelectorAll('[data-mailto]');",
    "for(var i=0;i<links.length;i++){links[i].addEventListener('click',function(){lead('email');});}",
    "if(!form||!msg)return;",
    "var ts=document.getElementById('partner-ts');",
    "if(ts){ts.value=Math.floor(Date.now()/1000);}",
    "var SENDING='" + esc(L.submitSending || "") + "',ERR='" + esc(L.partnerErr || "") + "',OK='" + esc(L.partnerSent || "") + "';",
    "form.addEventListener('submit',function(ev){",
    "ev.preventDefault();",
    "msg.textContent=SENDING;msg.className='form-msg';",
    "fetch(form.action,{method:'POST',body:new FormData(form),credentials:'same-origin'})",
    ".then(function(r){return r.json().then(function(d){return{ok:r.ok&&d&&d.ok,d:d};});})",
    ".then(function(res){",
    "if(res.ok){msg.textContent=OK;msg.className='form-msg ok';form.reset();if(ts){ts.value=Math.floor(Date.now()/1000);}lead('form');}",
    "else{msg.textContent=(res.d&&res.d.error)||ERR;msg.className='form-msg err';}",
    "})",
    ".catch(function(){msg.textContent=ERR;msg.className='form-msg err';});",
    "});",
    "})();"
  ].join("\n");

  return [
    head(lang, { title: L.partnerTitle + " · " + L.siteName, desc: L.partnerDesc, paths: paths, jsonld: jsonld, ogType: "website" }),
    "",
    header(lang, false),
    '<main class="wrap partner-page">',
    '  <nav class="crumbs"><a href="' + homePath(lang) + '">' + esc(L.backToAll) + "</a><span>/</span><strong>" + esc(L.partnerH1) + "</strong></nav>",
    '  <h1 class="partner-h1">' + esc(L.partnerH1) + "</h1>",
    '  <p class="partner-intro">' + esc(L.partnerIntro) + "</p>",
    contact,
    '  <h2 class="partner-h2">' + esc(L.partnerWays) + "</h2>",
    '  <div class="ways">',
    ways,
    "  </div>",
    '  <h2 class="partner-h2">' + esc(L.partnerPricing) + "</h2>",
    '  <table class="price-table"><thead><tr><th>' + esc(L.partnerPriceCol) + "</th><th>" + esc(L.partnerPriceVal) + "</th></tr></thead>",
    "    <tbody>",
    rows,
    "    </tbody></table>",
    '  <h2 class="partner-h2">' + esc(L.partnerForm) + "</h2>",
    '  <p class="partner-hint">' + esc(L.partnerFormHint) + "</p>",
    form,
    "</main>",
    "",
    footer(lang),
    "<script>" + partnerJs + "</script>",
    '<script src="/app.js?v=' + ASSET_V + '"></script>',
    "</div>",
    "</body>",
    "</html>"
  ].join("\n");
}

/* ---------------- 收录提交页（PRD 模块四） ---------------- */
function submitPage(lang) {
  var L = T[lang];
  var paths = {};
  LANGS.forEach(function (l) { paths[l] = contentPath(l, "submit"); });
  var jsonld = [{
    "@context": "https://schema.org", "@type": "WebPage",
    "name": L.submitTitle, "url": abs(paths[lang]), "inLanguage": L.htmlLang, "description": L.submitDesc
  }, {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": L.backToAll, "item": abs(homePath(lang)) },
      { "@type": "ListItem", "position": 2, "name": L.submitH1, "item": abs(paths[lang]) }
    ]
  }];
  // 价格从配置读（PRD §7，不 hardcode）
  var priceOf = function (key) {
    var hit = (PRICING.items || []).filter(function (x) { return x.key === key; })[0];
    return hit ? hit.price : 0;
  };
  var fastPrice = priceOf("fast_review"), featPrice = priceOf("spotlight");
  var cfg = PRICING.submit || {};
  var formAction = cfg.form_action || "/api/submit.php";
  var statusAction = cfg.status_action || "/api/submit-status.php";
  var payHint = lang === "zh" ? (cfg.payment_hint_zh || "") : (cfg.payment_hint_en || "");
  var payGo = L.submitPayGo || "";
  var tiers = [
    { key: "free", pkey: "", name: L.submitTierFree, desc: L.submitTierFreeDesc, price: 0 },
    { key: "fast", pkey: "fast_review", name: L.submitTierFast, desc: L.submitTierFastDesc, price: fastPrice },
    { key: "featured", pkey: "spotlight", name: L.submitTierFeatured, desc: L.submitTierFeaturedDesc, price: featPrice }
  ];
  var tierCards = tiers.map(function (t) {
    var head = t.price ? esc(t.name) + ' · <span data-price-key="' + t.pkey + '">$' + t.price + "</span>" : esc(t.name);
    return '    <div class="way"><h3>' + head + "</h3><p>" + esc(t.desc) + "</p></div>";
  }).join("\n");
  var tierOpts = tiers.map(function (t, i) {
    var label = t.price ? esc(t.name) + ' · <span data-price-key="' + t.pkey + '">$' + t.price + "</span>" : esc(t.name);
    return '      <label class="tier-opt"><input type="radio" name="tier" value="' + t.key + '"' +
      (i === 0 ? " checked" : "") + "><span><strong>" + label + "</strong><span>" + esc(t.desc) + "</span></span></label>";
  }).join("\n");
  // 内联提交脚本：AJAX 提交，成功后展示查询码与（付费档的）付款指引
  var js = [
    "(function(){",
    "var form=document.getElementById('submit-form');if(!form)return;",
    "var msg=document.getElementById('submit-msg');",
    "var done=document.getElementById('submit-done');",
    "var SENDING='" + esc(L.submitSending) + "',ERR='" + esc(L.submitErr) + "',",
    "OK_TITLE='" + esc(L.submitOkTitle) + "',CODE_LABEL='" + esc(L.submitCodeLabel) + "',",
    "OK_FREE='" + esc(L.submitOkFree) + "',OK_PAID='" + esc(L.submitOkPaid) + "',",
    "PAY_TITLE='" + esc(L.submitPayTitle) + "',",
    "PAY_HINT='" + esc(payHint).replace(/\n/g, "\\n") + "',",
    "PAY_GO='" + esc(payGo) + "',",
    "PAY_URL={fast:'" + esc(cfg.pay_url_fast || "") + "',featured:'" + esc(cfg.pay_url_featured || "") + "'},",
    "PRICE={fast:" + fastPrice + ",featured:" + featPrice + "},",
    // 运行时定价覆盖：app.js 拉取 /pricing.json 后写入 window.__PRICING__，此处优先读实时值
    "function px(t){var w=window.__PRICING__||{};return (w[t]!=null?w[t]:PRICE[t]);}",
    "form.addEventListener('submit',function(ev){",
    "ev.preventDefault();",
    "var shot=(form.querySelector('[name=screenshot_url]')||{}).value||'';",
    "var vid=(form.querySelector('[name=video_url]')||{}).value||'';",
    "if(!shot.trim()&&!vid.trim()){msg.textContent=ERR;msg.className='form-msg err';return;}",
    "msg.textContent=SENDING;msg.className='form-msg';",
    "fetch(form.action,{method:'POST',body:new FormData(form),credentials:'same-origin'})",
    ".then(function(r){return r.json().then(function(d){return{ok:r.ok&&d&&d.ok,d:d};});})",
    ".then(function(res){",
    "var d=res.d||{};",
    "if(res.ok&&d.ok){",
    "form.style.display='none';msg.textContent='';",
    "var html='<h3>'+OK_TITLE+'</h3><p>'+CODE_LABEL+'：<code class=\"query-code\">'+d.query_code+'</code></p>';",
    "if(d.tier==='free'){html+='<p>'+OK_FREE+'</p>';}",
    "else{html+='<p>'+OK_PAID+'</p>';",
    "var pu=PAY_URL[d.tier]||'';",
    "if(pu){html+='<p><a class=\"btn-primary\" style=\"display:inline-block;text-decoration:none\" target=\"_blank\" rel=\"noopener\" href=\"'+pu+'\">'+PAY_GO+' · $'+px(d.tier)+'</a></p>';}",
    "if(PAY_HINT){html+='<h4>'+PAY_TITLE+'</h4><p>'+PAY_HINT.replace('{price}','$'+px(d.tier))",
    ".replace('{code}',d.query_code)+'</p>';}}",
    "done.innerHTML=html;done.hidden=false;done.scrollIntoView();",
    "}else{msg.textContent=(d&&d.error)||ERR;msg.className='form-msg err';}",
    "})",
    ".catch(function(){msg.textContent=ERR;msg.className='form-msg err';});",
    "});",
    "})();"
  ].join("\n");

  return [
    head(lang, { title: L.submitTitle + " · " + L.siteName, desc: L.submitDesc, paths: paths, jsonld: jsonld, ogType: "website" }),
    "",
    header(lang, false),
    '<main class="wrap submit-page">',
    '  <nav class="crumbs"><a href="' + homePath(lang) + '">' + esc(L.backToAll) + "</a><span>/</span><strong>" + esc(L.submitH1) + "</strong></nav>",
    '  <h1 class="partner-h1">' + esc(L.submitH1) + "</h1>",
    '  <p class="partner-intro">' + esc(L.submitIntro) + "</p>",
    '  <div class="ways">',
    tierCards,
    "  </div>",
    '  <h2 class="partner-h2">' + esc(L.submitH1) + "</h2>",
    '  <form id="submit-form" class="partner-form" method="POST" action="' + esc(formAction) + '">',
    '    <input type="text" name="_hp" class="hp" tabindex="-1" autocomplete="off">',
    '    <label>' + esc(L.submitNameLabel) + '<input name="tool_name" required maxlength="120" placeholder="' + esc(lang === "zh" ? "例如：我的图片压缩工具" : "e.g. My Image Compressor") + '"></label>',
    '    <label>' + esc(L.submitOnelineLabel) + '<input name="oneliner" required maxlength="200" placeholder="' + esc(lang === "zh" ? "一句话说清它解决什么问题" : "One sentence: what problem does it solve?") + '"></label>',
    '    <label>' + esc(L.submitWorkLabel) + '<input name="work_url" required type="url" maxlength="500" placeholder="' + esc(L.submitWorkPh) + '"></label>',
    '    <label>' + esc(L.submitRepoLabel) + '<input name="repo_url" maxlength="300" placeholder="' + esc(L.submitRepoPh) + '"></label>',
    '    <label>' + esc(L.submitEmailLabel) + '<input type="email" name="email" required></label>',
    '    <label>' + esc(L.submitAuthorLabel) + '<input name="author_name" required maxlength="120"></label>',
    '    <label>' + esc(L.submitAuthorUrlLabel) + '<input name="author_url" type="url" maxlength="500"></label>',
    '    <label>' + esc(L.submitCategoryLabel) + '<select name="primary_category" required>' + Object.keys(T[lang].categories || {}).map(function (k) { return '<option value="' + esc(k) + '">' + esc(catLabel(lang, k)) + '</option>'; }).join("") + '</select></label>',
    '    <label>' + esc(L.submitTagsLabel) + '<input name="tags" required maxlength="300" placeholder="' + esc(lang === "zh" ? "例如：图片, 压缩, 免费" : "e.g. image, compress, free") + '"></label>',
    '    <label>' + esc(L.submitScreenshotLabel) + '<input name="screenshot_url" type="url" maxlength="500"></label>',
    '    <label>' + esc(L.submitVideoLabel) + '<input name="video_url" type="url" maxlength="500"></label>',
    '    <p class="partner-hint">' + esc(L.submitScreenshotHint) + '</p>',
    '    <label>' + esc(L.submitPriceLabel) + '<select name="price_model" required><option value="free">' + esc(L.priceFree) + '</option><option value="freemium">' + esc(L.priceFreemium) + '</option><option value="paid">' + esc(L.pricePaid) + '</option><option value="opensource">' + esc(L.priceOpenSource) + '</option></select></label>',
    '    <label>' + esc(L.submitFormLabel) + '<select name="form" required><option value="web">' + esc(L.formWeb) + '</option><option value="mobile">' + esc(L.formMobile) + '</option><option value="desktop">' + esc(L.formDesktop) + '</option><option value="extension">' + esc(L.formExtension) + '</option><option value="plugin">' + esc(L.formPlugin) + '</option><option value="api">' + esc(L.formApi) + '</option><option value="template">' + esc(L.formTemplate) + '</option></select></label>',
    '    <label>' + esc(L.submitHighlightsLabel) + '<textarea name="highlights" maxlength="1000" rows="3"></textarea></label>',
    '    <label>' + esc(L.submitPriceDetailLabel) + '<input name="price_detail" maxlength="300"></label>',
    '    <fieldset class="tier-field"><legend>' + esc(L.submitTierLabel) + "</legend>",
    tierOpts,
    "    </fieldset>",
    '    <button class="btn-primary btn-lg" type="submit">' + esc(L.submitButton) + "</button>",
    "  </form>",
    '  <p id="submit-msg" class="form-msg" aria-live="polite"></p>',
    '  <div id="submit-done" class="submit-done" hidden></div>',
    '  <h2 class="partner-h2">' + esc(L.submitStatusTitle) + "</h2>",
    '  <form class="partner-form inline-form" method="GET" action="' + esc(statusAction) + '">',
    '    <input type="hidden" name="lang" value="' + lang + '">',
    '    <label class="sr-only">' + esc(L.submitStatusTitle) + '<input name="code" required minlength="12" maxlength="12" placeholder="' + esc(L.submitStatusPh) + '" style="text-transform:uppercase"></label>',
    '    <button class="btn-primary" type="submit">' + esc(L.submitStatusButton) + "</button>",
    "  </form>",
    '  <p class="partner-hint">' + esc(L.submitFreeAlt) + "</p>",
    "</main>",
    "",
    footer(lang),
    "<script>" + js + "</script>",
    '<script src="/app.js?v=' + ASSET_V + '"></script>',
    "</div>",
    "</body>",
    "</html>"
  ].join("\n");
}

/* ---------------- /go/[tool_id] 跳转器（PRD 模块二） ---------------- */
// 纯静态实现：一个页面处理全部 /go/ 路径（.htaccess 重写进来），
// 跳转表由构建期生成在 /go/affiliates.js，浏览器缓存一次即可。
function affiliatesMap() {
  var o = {};
  items.forEach(function (t) { var u = affiliateOf(t); if (u) o[t.id] = u; });
  return o;
}

/* ---------------- 写盘 ---------------- */
await rm(join(ROOT, "tool"), { recursive: true, force: true });
await rm(join(ROOT, "category"), { recursive: true, force: true });
await rm(join(ROOT, "categories"), { recursive: true, force: true });
await rm(join(ROOT, "compare"), { recursive: true, force: true });
await rm(join(ROOT, "online"), { recursive: true, force: true });
await rm(join(ROOT, "go"), { recursive: true, force: true });
await rm(join(ROOT, "about"), { recursive: true, force: true });
await rm(join(ROOT, "disclaimer"), { recursive: true, force: true });
await rm(join(ROOT, "author"), { recursive: true, force: true });
// 各语言的子目录都要清理：默认语言构建在根路径，
// 它的子目录如果存在一定是旧构建的残留（如从中文默认切换过来时的 /en/）
for (var rmi = 0; rmi < LANGS.length; rmi++) {
  await rm(join(ROOT, LANGS[rmi]), { recursive: true, force: true });
}

var written = 0;
var authorList = multiAuthors();
var allCatKeys = {};
items.forEach(function (t) { allCatKeys[t.category] = true; });
var catKeyList = Object.keys(allCatKeys).sort();
var pairList = comparePairs();

for (var li = 0; li < LANGS.length; li++) {
  var lang = LANGS[li];
  var homeDir = lang === DEFAULT_LANG ? ROOT : join(ROOT, lang);
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
  // P5 创作者主页（>=2 个作品的作者）
  for (var ai2 = 0; ai2 < authorList.length; ai2++) {
    var g = authorList[ai2];
    var adir = join(ROOT, authorPath(lang, g.slug).replace(/^[/]/, ""));
    await mkdir(adir, { recursive: true });
    await writeFile(join(adir, "index.html"), authorPage(g, lang), "utf8");
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
  // 商务合作页（PRD 模块一）自带定价表，不走 pages.json
  var partnerDir = join(ROOT, contentPath(lang, "partner").replace(/^[/]/, ""));
  await mkdir(partnerDir, { recursive: true });
  await writeFile(join(partnerDir, "index.html"), partnerPage(lang), "utf8");
  written++;
  // 收录提交页（PRD 模块四）
  var submitDir = join(ROOT, contentPath(lang, "submit").replace(/^[/]/, ""));
  await mkdir(submitDir, { recursive: true });
  await writeFile(join(submitDir, "index.html"), submitPage(lang), "utf8");
  written++;
}
// /go/ 跳转器（一个页面处理全部 /go/<tool_id>，靠 .htaccess 重写进来）
await mkdir(join(ROOT, "go"), { recursive: true });
// /go/<tool_id> 由 api/go.php 处理（.htaccess 重写），这里只放构建期的联盟跳转表，
// 供 PHP 在数据库里没有该工具时兜底。
await writeFile(join(ROOT, "go", "affiliates.json"), JSON.stringify(affiliatesMap()), "utf8");
// 定价运行时读取（PRD §7 实时生效）：发布 pricing.json 到站根，前端 app.js 运行时 fetch 覆盖价格；
// 改价只需更新站根 pricing.json，无需重建。构建期仍 bake 一份，保证 SEO 与无 JS 兜底。
await writeFile(join(ROOT, "pricing.json"), JSON.stringify(PRICING), "utf8");
await writeFile(join(ROOT, "sitemap.xml"), sitemap(), "utf8");
await writeFile(join(ROOT, "robots.txt"), robots(), "utf8");

// 404.html 是手写页，只替换其中的资源引用，让版本号跟着一起更新
// 注意：404 文案不得含硬编码总数（如“156 个”），否则下次同步总数变化时又会过时
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
  " + 内容页 " + 2 * LANGS.length + " + 创作者页 " + authorList.length * LANGS.length + "）");
console.log("  sitemap.xml 已重新生成");
console.log("  域名: " + DOMAIN);
