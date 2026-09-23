#!/usr/bin/env node
// 从 GitHub API 同步星数 / 语言 / 许可证 / 活跃度 / 首页
//
// 用法:
//   node scripts/sync-github.mjs              增量同步（跳过 12 小时内已同步的条目）
//   node scripts/sync-github.mjs --fresh=1    只跳过 1 小时内已同步的
//   node scripts/sync-github.mjs --force      忽略新鲜度，全部重拉
//   node scripts/sync-github.mjs --only=a,b   只同步指定 id（用于新增条目，省配额）
//
// 环境变量 GITHUB_TOKEN 可选，用于提高限额（未认证: core 60 次/小时）
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "scripts/tools.source.json");
const OUT = resolve(ROOT, "data/tools.json");

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const freshArg = args.find((a) => a.startsWith("--fresh="));
const FRESH_HOURS = freshArg ? Number(freshArg.split("=")[1]) : 12;
const onlyArg = args.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",").filter(Boolean)) : null;

const token = process.env.GITHUB_TOKEN || "";
const headers = { "User-Agent": "gh-tools-collection", Accept: "application/vnd.github+json" };
if (token) headers.Authorization = "Bearer " + token;

const source = JSON.parse(await readFile(SRC, "utf8"));
const items = source.items;

// 上次同步结果
const prevMap = {};
try {
  const prev = JSON.parse(await readFile(OUT, "utf8"));
  for (const t of prev.items) prevMap[t.id] = t;
} catch (e) {}

// homepage 三态：null/undefined 从 GitHub 读，"" 表示确认没有，其他写死
function resolveHome(it, gh) {
  if (it.homepage === undefined || it.homepage === null) return gh || "";
  return it.homepage;
}

// 哪些条目还算新鲜，可以不消耗配额
function isFresh(p) {
  if (!p || !p.syncOk || !p.syncedAt) return false;
  const age = Date.now() - Date.parse(p.syncedAt);
  return age >= 0 && age < FRESH_HOURS * 3600 * 1000;
}

const skipped = [];
const fetchList = [];
for (const it of items) {
  if (ONLY && !ONLY.has(it.id)) { skipped.push(it.id); continue; }
  const p = prevMap[it.id];
  if (!FORCE && !ONLY && isFresh(p)) skipped.push(it.id);
  else fetchList.push(it);
}

console.log(
  "共 " + items.length + " 个条目 | 需请求 " + fetchList.length +
  " | 跳过(缓存新鲜 " + FRESH_HOURS + "h) " + skipped.length +
  (token ? " | 已带 token" : " | 未认证(限额 60/小时)")
);

const fetched = new Map();
async function fetchRepo(repo) {
  const r = await fetch("https://api.github.com/repos/" + repo, { headers });
  if (!r.ok) throw new Error(r.status + " " + (r.status === 403 ? "限流" : r.statusText));
  return r.json();
}

const CONCURRENCY = 4;
for (let i = 0; i < fetchList.length; i += CONCURRENCY) {
  const batch = fetchList.slice(i, i + CONCURRENCY);
  const data = await Promise.all(batch.map((it) => fetchRepo(it.repo).catch((e) => ({ __err: e.message }))));
  for (let j = 0; j < batch.length; j++) {
    fetched.set(batch[j].id, data[j]);
    const d = data[j];
    if (d.__err) console.log("  ✗ " + batch[j].repo + " -> " + d.__err);
    else console.log("  ✓ " + d.full_name + "  " + d.stargazers_count + "★");
  }
  if (i + CONCURRENCY < fetchList.length) await new Promise((r) => setTimeout(r, 900));
}

const now = new Date().toISOString();
let ok = 0, stale = 0, skippedN = 0;

const outItems = items.map((it) => {
  const p = prevMap[it.id] || {};
  const base = {
    id: it.id, name: it.name, repo: it.repo, category: it.category,
    desc: it.desc, tags: it.tags,
    usage: it.usage || ["online"],
    platforms: it.platforms || [],
    caution: it.caution || "",
    scene: it.scene || "",
    cloud: it.cloud || "",
  };
  const d = fetched.get(it.id);

  if (d && !d.__err) {
    ok++;
    return { ...base,
      homepage: resolveHome(it, d.homepage),
      stars: d.stargazers_count,
      language: d.language || it.seed.language,
      license: d.license && d.license.spdx_id && d.license.spdx_id !== "NOASSERTION" ? d.license.spdx_id : it.seed.license,
      archived: !!d.archived,
      pushedAt: (d.pushed_at || "").slice(0, 10),
      descEn: d.description || it.descEn || "",
      syncOk: true,
      syncedAt: now,
    };
  }

  if (d && d.__err) {
    stale++;
    // 本轮失败 -> 沿用上次结果，并保留上次的 syncOk（不要假装也是失败）
    return { ...base,
      homepage: resolveHome(it, p.homepage),
      stars: p.stars != null ? p.stars : it.seed.stars,
      language: p.language || it.seed.language,
      license: p.license || it.seed.license,
      archived: typeof it.archived === "boolean" ? it.archived : !!p.archived,
      pushedAt: p.pushedAt || it.pushedAt || "",
      descEn: p.descEn || it.descEn || "",
      syncOk: p.syncOk === true,
      syncedAt: p.syncedAt || "",
    };
  }

  // 跳过：沿用缓存，只覆盖源文件里可能改过的字段
  skippedN++;
  return { ...base,
    homepage: resolveHome(it, p.homepage),
    stars: p.stars != null ? p.stars : it.seed.stars,
    language: p.language || it.seed.language,
    license: p.license || it.seed.license,
    archived: typeof it.archived === "boolean" ? it.archived : !!p.archived,
    pushedAt: p.pushedAt || it.pushedAt || "",
    descEn: p.descEn || it.descEn || "",
    syncOk: p.syncOk === true,
    syncedAt: p.syncedAt || "",
  };
});

outItems.sort((a, b) => (b.stars || 0) - (a.stars || 0));
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({
  generatedAt: now,
  count: outItems.length,
  items: outItems,
}, null, 2), "utf8");

const missing = outItems.filter((t) => !t.syncOk).length;
console.log("");
console.log("结果: 新拉取 " + ok + " / 用缓存 " + skippedN + " / 失败沿用 " + stale);
console.log("仍缺完整数据的条目: " + missing);
if (missing > 0) console.log("提示: 等限额恢复后再跑一次即可补齐（脚本会自动只请求缺的那些）。");
console.log("已写入 -> " + OUT);
