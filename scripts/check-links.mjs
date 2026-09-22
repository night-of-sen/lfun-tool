#!/usr/bin/env node
// 死链检测：检查每个工具的官网与 GitHub 仓库是否可达
// 用法: node scripts/check-links.mjs [并发数]
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONC = Number(process.argv[2] || 8);
const UA = "Mozilla/5.0 (compatible; lfun-tools-linkcheck/1.0; +https://tools.lfun.cloud)";

const data = JSON.parse(await readFile(join(ROOT, "data", "tools.json"), "utf8"));
const items = data.items;

function classify(status, error) {
  if (error) return "error";
  if (status >= 200 && status < 400) return "ok";
  if (status === 404 || status === 410) return "dead";
  if (status === 403 || status === 429 || status === 401) return "blocked";
  return "error";
}

async function attempt(url, method) {
  const res = await fetch(url, {
    method,
    redirect: "follow",
    signal: AbortSignal.timeout(18000),
    headers: { "User-Agent": UA, Accept: "text/html,*/*" }
  });
  try { if (res.body) await res.body.cancel(); } catch (e) {}
  return res.status;
}

async function probe(url) {
  if (!url) return { url, status: 0, verdict: "skip" };
  try {
    let status = await attempt(url, "HEAD");
    // 有些站点不支持 HEAD 或直接拒绝，改用 GET 复核
    if (status >= 400) {
      try { status = await attempt(url, "GET"); } catch (e) {}
    }
    return { url, status, verdict: classify(status, null) };
  } catch (e) {
    try {
      const status = await attempt(url, "GET");
      return { url, status, verdict: classify(status, null) };
    } catch (e2) {
      return { url, status: 0, verdict: "error", error: String(e2.message || e2).slice(0, 90) };
    }
  }
}

const targets = [];
for (const t of items) {
  targets.push({ id: t.id, name: t.name, kind: "repo", url: "https://github.com/" + t.repo });
  if (t.homepage) targets.push({ id: t.id, name: t.name, kind: "home", url: t.homepage });
}

console.log("待检测链接: " + targets.length + " 条（并发 " + CONC + "）");
const results = [];
let done = 0;
for (let i = 0; i < targets.length; i += CONC) {
  const batch = targets.slice(i, i + CONC);
  const out = await Promise.all(batch.map(async (t) => {
    const r = await probe(t.url);
    return { ...t, ...r };
  }));
  results.push(...out);
  done += batch.length;
  if (done % 40 === 0 || done === targets.length) process.stdout.write("  进度 " + done + "/" + targets.length + "\n");
}

const byVerdict = {};
for (const r of results) byVerdict[r.verdict] = (byVerdict[r.verdict] || 0) + 1;

await writeFile(join(ROOT, "data", "link-report.json"), JSON.stringify({
  checkedAt: new Date().toISOString(),
  total: results.length,
  summary: byVerdict,
  problems: results.filter((r) => r.verdict === "dead" || r.verdict === "error"),
}, null, 2), "utf8");

console.log("");
console.log("结果: " + JSON.stringify(byVerdict));
const bad = results.filter((r) => r.verdict === "dead" || r.verdict === "error");
if (bad.length) {
  console.log("");
  console.log("有问题的链接 (" + bad.length + "):");
  for (const b of bad) console.log("  [" + b.verdict + "] " + b.status + "  " + b.id + "  " + b.kind + "  " + b.url);
} else {
  console.log("没有发现死链。");
}
