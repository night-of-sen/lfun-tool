#!/usr/bin/env node
// P1 分类迁移：把旧分类映射为 11 个新主分类，写入 source 与 data。
// 用法: node scripts/migrate-categories.mjs [--check]
//  --check 只校验不写盘。默认写盘，并生成 scripts/usage-pending.json（usage 为空的 id 清单，P2 补形态用，不编造形态）。
// 幂等：如果某项的 category 已经是新主分类，则不再二次映射；旧分类到新分类的映射以 scripts/category-map.json 为准。
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAP = JSON.parse(await readFile(resolve(ROOT, "scripts/category-map.json"), "utf8"));
const oldToNew = {};
for (const [nw, v] of Object.entries(MAP.primary)) for (const old of v.old) oldToNew[old] = nw;
const checkOnly = process.argv.includes("--check");

async function load(p) { return JSON.parse(await readFile(p, "utf8")); }
function transform(items, label) {
  const counts = {}; const unmapped = []; const pending = [];
  for (const it of items) {
    const old = it.category;
    const nw = oldToNew[old] || (MAP.primary[old] ? old : null);
    if (!nw) { unmapped.push(it.id + ":" + old); continue; }
    it.category = nw;
    counts[nw] = (counts[nw] || 0) + 1;
    if (!it.usage || it.usage.length === 0) pending.push(it.id);
  }
  console.log(label, "total", items.length, "unmapped", unmapped.length, unmapped.slice(0, 10));
  console.log(label, "counts", counts, "sum", Object.values(counts).reduce((a, b) => a + b, 0));
  console.log(label, "usage-empty", pending.length);
  return { counts, pending };
}

const srcPath = resolve(ROOT, "scripts/tools.source.json");
const dataPath = resolve(ROOT, "data/tools.json");
const src = await load(srcPath);
const data = await load(dataPath);
const r1 = transform(src.items, "source");
const r2 = transform(data.items, "data");
if (r1.pending.length || r2.pending.length) {
  const pendingIds = [...new Set([...r1.pending, ...r2.pending])].sort();
  console.log("usage-pending total (union)", pendingIds.length);
  if (!checkOnly) await writeFile(resolve(ROOT, "scripts/usage-pending.json"), JSON.stringify({ note: "P1：usage 为空、形态待 P2 补填的工具 id 清单，不编造形态。", count: pendingIds.length, ids: pendingIds }, null, 2) + "\n", "utf8");
}
if (checkOnly) { console.log("check only, no files written"); process.exit(0); }
await writeFile(srcPath, JSON.stringify(src, null, 2) + "\n", "utf8");
await writeFile(dataPath, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log("written:", srcPath, dataPath);
