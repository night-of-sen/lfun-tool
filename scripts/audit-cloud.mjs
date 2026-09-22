#!/usr/bin/env node
// 审计：找出「纯自托管」项目里哪些其实提供了官方云版 / 托管版
// 做法：抓官网首页，找 cloud / app / try 类子域、以及 signup / pricing 类链接与文案
// 用法: node scripts/audit-cloud.mjs [并发数]
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONC = Number(process.argv[2] || 5) || 5;
const UA = "Mozilla/5.0 (compatible; lfun-tools-audit/1.0; +https://tools.lfun.cloud)";

const items = JSON.parse(await readFile(join(ROOT, "data", "tools.json"), "utf8")).items;
const has = (t, u) => (t.usage || []).indexOf(u) !== -1;
const targets = items.filter((t) => has(t, "selfhost") && !has(t, "online") && t.homepage);

console.log("待审计: " + targets.length + " 个（并发 " + CONC + "）");

const CLOUD_HOST = /^(cloud|app|try|start|console|dashboard|my|admin|portal|accounts?|signup|login)\./i;
const CLOUD_URL = /(cloud|hosted|signup|sign-up|register|pricing|start-free|get-started|trial)/i;
const CLOUD_TEXT = /(cloud|hosted|saas|sign ?up|start (for )?free|free trial|pricing|managed)/i;

function links(html) {
  const out = [];
  const re = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const url = m[1].trim();
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!url || url.startsWith("#") || url.startsWith("javascript:")) continue;
    out.push({ url, text: text.slice(0, 60) });
  }
  return out;
}

async function audit(t) {
  try {
    const res = await fetch(t.homepage, {
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html" }
    });
    const html = await res.text();
    const host = new URL(t.homepage).hostname;
    const found = [];
    const seen = new Set();
    for (const l of links(html)) {
      let abs;
      try { abs = new URL(l.url, t.homepage).href; } catch (e) { continue; }
      if (seen.has(abs)) continue;
      let h;
      try { h = new URL(abs).hostname; } catch (e) { continue; }
      const sameSite = h === host || h.endsWith("." + host.replace(/^www\./, ""));
      const isCloudHost = CLOUD_HOST.test(h);
      const looksCloud = CLOUD_URL.test(abs) || CLOUD_URL.test(l.text);
      if ((isCloudHost || (looksCloud && sameSite)) && !/\/(docs|blog|github|twitter|discord)/i.test(abs)) {
        seen.add(abs);
        found.push({ url: abs, text: l.text, host: h });
      }
      if (found.length >= 6) break;
    }
    const textHit = CLOUD_TEXT.test(html.replace(/<[^>]+>/g, " "));
    return { id: t.id, name: t.name, ok: true, status: res.status, textHit, found };
  } catch (e) {
    return { id: t.id, name: t.name, ok: false, error: String(e.message || e).slice(0, 70), found: [] };
  }
}

const results = [];
for (let i = 0; i < targets.length; i += CONC) {
  const batch = targets.slice(i, i + CONC);
  results.push(...await Promise.all(batch.map(audit)));
  if ((i + CONC) % 20 < CONC) process.stdout.write("  进度 " + Math.min(i + CONC, targets.length) + "/" + targets.length + "\n");
  if (i + CONC < targets.length) await new Promise((r) => setTimeout(r, 500));
}

await writeFile(join(ROOT, "data", "cloud-audit.json"), JSON.stringify(results, null, 2), "utf8");

const withCloud = results.filter((r) => r.ok && r.found.length);
console.log("");
console.log("抓到云版线索的: " + withCloud.length + " / " + targets.length);
console.log("");
for (const r of withCloud) {
  console.log("### " + r.name + "  (" + r.id + ")");
  for (const f of r.found.slice(0, 4)) console.log("    " + f.url + "   [" + f.text + "]");
}
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log("");
  console.log("抓取失败: " + failed.map((r) => r.name + "(" + r.error + ")").join(", "));
}
console.log("");
console.log("报告 -> data/cloud-audit.json");
