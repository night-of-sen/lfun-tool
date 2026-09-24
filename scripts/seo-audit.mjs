#!/usr/bin/env node
// SEO 自检：接入 Google Search Console 后最容易被报问题的几项
// 用法: node scripts/seo-audit.mjs [域名]
// 全部为构建产物检查，不联网，适合放进 CI
import { readFile, readdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOMAIN = (process.argv[2] || process.env.SITE_DOMAIN || "https://tools.lfun.cloud").replace(/[/]+$/, "");

let pass = 0, fail = 0;
const failures = [];
function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) pass++; else { fail++; failures.push(name + ": " + actual + "（期望 " + expected + "）"); }
  console.log((ok ? "  ok   " : "  FAIL ") + name + "  ->  " + actual);
}

/* ---------- 收集所有 HTML（含 404.html） ---------- */
const htmlFiles = [];
const allFiles = new Set();
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name === ".git" || e.name === "node_modules") continue;
      await walk(join(dir, e.name));
    } else {
      allFiles.add(join(dir, e.name).slice(ROOT.length).replace(/\\/g, "/"));
      if (e.name.endsWith(".html")) htmlFiles.push(join(dir, e.name));
    }
  }
}
await walk(ROOT);

const pages = [];
for (const f of htmlFiles) {
  const rel = f.slice(ROOT.length).replace(/\\/g, "/");
  const url = rel.endsWith("/index.html") ? rel.slice(0, -"index.html".length) : rel;
  pages.push({ file: f, rel, url, html: await readFile(f, "utf8") });
}
const indexPages = pages.filter((p) => p.rel.endsWith("/index.html"));
console.log("扫描页面 " + pages.length + "（其中可索引的目录页 " + indexPages.length + "）\n");

console.log("[1] canonical / title / description / hreflang");
const noCanon = [], badCanon = [], noTitle = [], noDesc = [], badHl = [];
const titles = new Map(), descs = new Map();
for (const p of indexPages) {
  const expect = DOMAIN + p.url;
  const c = /<link rel="canonical" href="([^"]+)"/.exec(p.html);
  if (!c) noCanon.push(p.url);
  else if (c[1] !== expect) badCanon.push(p.url + " -> " + c[1]);
  const t = /<title>([^<]*)<\/title>/.exec(p.html);
  if (!t || !t[1].trim()) noTitle.push(p.url);
  else titles.set(t[1], (titles.get(t[1]) || 0) + 1);
  const d = /<meta name="description" content="([^"]*)"/.exec(p.html);
  if (!d || !d[1].trim()) noDesc.push(p.url);
  else descs.set(d[1], (descs.get(d[1]) || 0) + 1);
  if ((p.html.match(/hreflang="(zh-CN|en|x-default)"/g) || []).length < 3) badHl.push(p.url);
}
check("缺 canonical", noCanon.length, 0);
check("canonical 与页面地址不一致", badCanon.length, 0);
check("缺 title", noTitle.length, 0);
check("缺 description", noDesc.length, 0);
check("hreflang 不完整", badHl.length, 0);
check("标题重复", [...titles.values()].filter((n) => n > 1).length, 0);
check("描述重复", [...descs.values()].filter((n) => n > 1).length, 0);

console.log("\n[2] 内链完整性（指向不存在页面的链接会被 GSC 记为 404）");
const exists = new Set(indexPages.map((p) => p.url));
const assetExists = allFiles;
const broken = new Map();
for (const p of pages) {
  for (const raw of p.html.match(/href="(\/[^"#]*)"/g) || []) {
    const target = raw.slice(6, -1).replace(/[?#].*$/, "");
    if (target.startsWith("/scripts") || target.startsWith("/.git")) continue;
    if (target.includes(".") && !target.endsWith("/")) {
      if (!assetExists.has(target)) { broken.set(target, (broken.get(target) || 0) + 1); }
      continue;
    }
    if (!exists.has(target)) broken.set(target, (broken.get(target) || 0) + 1);
  }
}
if (broken.size) for (const [t, n] of broken) console.log("      → " + t + "（" + n + " 处）");
check("死内链", broken.size, 0);

console.log("\n[3] sitemap");
const sm = await readFile(join(ROOT, "sitemap.xml"), "utf8");
const locs = (sm.match(/<loc>([^<]+)<\/loc>/g) || []).map((x) => x.replace(/<\/?loc>/g, ""));
const smPaths = locs.map((u) => u.replace(DOMAIN, ""));
check("sitemap URL 数 == 可索引页面数", locs.length, indexPages.length);
check("sitemap 含不存在的页面", smPaths.filter((p) => !exists.has(p)).length, 0);
check("sitemap 缺少 xhtml:link", /xhtml:link/.test(sm), true);
const lastmods = (sm.match(/<lastmod>([^<]+)<\/lastmod>/g) || []).map((x) => x.replace(/<\/?lastmod>/g, ""));
const uniqMod = new Set(lastmods);
console.log("      lastmod 取值数 " + uniqMod.size + " / " + lastmods.length);
check("lastmod 全站同一个日期（Google 会忽略）", uniqMod.size > 1, true);

console.log("\n[4] robots 与可索引性");
const rb = await readFile(join(ROOT, "robots.txt"), "utf8");
check("robots 声明 sitemap", /Sitemap:\s*\S+sitemap\.xml/.test(rb), true);
check("robots 误封全站", /Disallow:\s*\/\s*$/m.test(rb), false);
const nf = pages.find((p) => p.rel === "/404.html");
check("404 页有 noindex", nf ? /<meta name="robots"[^>]*noindex/i.test(nf.html) : false, true);
const ht = await readFile(join(ROOT, ".htaccess"), "utf8");
check(".htaccess 有 www 收敛", /HTTP_HOST.*www\\./i.test(ht), true);
check(".htaccess 有 index.html 去重", /index\\.html/.test(ht), true);

console.log("\n结果: " + pass + " 通过 / " + fail + " 失败");
if (fail) { console.log("\n失败项:"); for (const f of failures) console.log("  - " + f); process.exit(1); }
