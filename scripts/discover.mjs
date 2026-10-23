#!/usr/bin/env node
// 自动发现 GitHub 高星新项目，追加到 scripts/tools.source.json
//
// 用法:
//   node scripts/discover.mjs                 正式执行（默认星数下限 8000）
//   node scripts/discover.mjs --dry           试运行：只打印候选，不写文件
//   node scripts/discover.mjs --min-stars=N   星数下限（默认 8000）
//   node scripts/discover.mjs --max-pages=N   每个查询最多翻页数（默认 3）
//   node scripts/discover.mjs --limit=N       单次最多新增条目数（默认 30）
//
// 环境变量 GITHUB_TOKEN 可选（workflow 里已配；无 token 时 search API 仅 10 次/分钟）
//
// 发现策略（零依赖，只用 GitHub Search API）：
//   A. 新贵：created:>2025-01-01 stars:>3000，按星数倒序 —— 抓快速走红的新项目
//   B. 遗珠：stars:>15000，按星数倒序 —— 抓库里漏掉的老牌高星
// 过滤：已收录 / fork / archived / disabled / 无描述 / 低于星数下限
//
// 新条目字段与现有 source.json 一致：
//   - 中文描述留空（构建时 descOf 回退英文）
//   - tags 取 GitHub topics 前 4（英文原样存，tagLabel 无映射时原样返回）
//   - category 按 topics 关键词映射，命中不了进 dev
//   - usage 留空（卡片兜底：Repo 按钮 + setup 档位）
//
// 接入 .github/workflows/sync-stars.yml：在 sync-github 之前跑，
// 新条目同轮被 enrich（星数/语言/首页）+ 重建页面 + 自动提交。

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "scripts/tools.source.json");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const opt = (k, d) => {
  const a = args.find((x) => x.startsWith("--" + k + "="));
  return a ? Number(a.split("=")[1]) : d;
};
const MIN_STARS = opt("min-stars", 8000);
const MAX_PAGES = opt("max-pages", 3);
const LIMIT = opt("limit", 30);

const token = process.env.GITHUB_TOKEN || "";
const headers = { "User-Agent": "lfun-tool-discover", Accept: "application/vnd.github+json" };
if (token) headers.Authorization = "Bearer " + token;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ghSearch(query, page) {
  const url =
    "https://api.github.com/search/repositories?q=" + encodeURIComponent(query) +
    "&sort=stars&order=desc&per_page=100&page=" + page;
  const res = await fetch(url, { headers });
  if (res.status === 403 || res.status === 429) {
    const wait = Number(res.headers.get("retry-after") || "60");
    console.log("  限流，等待 " + wait + "s 后重试…");
    await sleep(wait * 1000);
    return ghSearch(query, page);
  }
  if (!res.ok) throw new Error("GitHub API " + res.status + ": " + (await res.text()).slice(0, 200));
  return res.json();
}

// topics 关键词 -> 站内分类；按顺序命中，命中不了进 dev
const TOPIC_CAT = [
  [/^(ai|llm|gpt|machine-learning|deep-learning|neural|diffusion|transformer)/, "ai-agents"],
  [/^(agent|agents|mcp|autonomous)/, "ai-agents"],
  [/^(game|gaming|godot|bevy)/, "fun-games"],
  [/^(video|ffmpeg|streaming|webrtc)/, "video-media"],
  [/^(image|photo|screenshot|ocr)/, "design-creativity"],
  [/^(audio|music|podcast|tts)/, "video-media"],
  [/^(security|privacy|encryption|password|auth)/, "infra-security"],
  [/^(auth|oauth|login)/, "infra-security"],
  [/^(database|sql|postgres|mysql|vector-database|sqlite)/, "infra-security"],
  [/^(docker|kubernetes|devops|homelab|selfhosted|self-hosted)/, "infra-security"],
  [/^(editor|ide|neovim|vscode)/, "dev-tools"],
  [/^(browser|chrome-extension|firefox)/, "productivity"],
  [/^(mobile|ios|android|flutter|react-native)/, "mobile-iot"],
  [/^(finance|trading|crypto|bitcoin|blockchain)/, "business-support"],
  [/^(email|smtp)/, "marketing-growth"],
  [/^(chat|messaging|discord|slack)/, "marketing-growth"],
  [/^(design|ui|css|tailwind|figma|component)/, "design-creativity"],
  [/^(documentation|markdown|notes|note-taking|wiki)/, "writing-knowledge"],
  [/^(downloader|download)/, "productivity"],
  [/^(monitoring|observability|logging|metrics)/, "infra-security"],
  [/^(network|proxy|vpn|dns|wireguard)/, "infra-security"],
  [/^(tutorial|course|learn|awesome|roadmap)/, "writing-knowledge"],
  [/^(payment|stripe|billing)/, "business-support"],
  [/^(iot|raspberry-pi|arduino|home-assistant|esp32)/, "mobile-iot"],
  [/^(cli|terminal|shell|tui|command-line)/, "dev-tools"],
  [/^(diagram|whiteboard|mermaid|graph)/, "design-creativity"],
  [/^(form|survey)/, "productivity"],
  [/^(cms|blog|static-site)/, "writing-knowledge"],
];
function categoryFor(topics) {
  const ts = (topics || []).map((t) => String(t).toLowerCase());
  for (const [re, cat] of TOPIC_CAT) {
    if (ts.some((t) => re.test(t))) return cat;
  }
  return "dev-tools";
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "tool";
}
function prettify(repoName) {
  return String(repoName).split(/[-_]+/).map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}
function cleanDesc(s) {
  return String(s || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

const source = JSON.parse(await readFile(SRC, "utf8"));
const items = source.items;
const existingRepos = new Set(items.map((t) => (t.repo || "").toLowerCase()));
const existingIds = new Set(items.map((t) => t.id));

function uniqueId(base) {
  let id = base, n = 2;
  while (existingIds.has(id)) id = base + "-" + n++;
  return id;
}

const QUERIES = [
  "created:>2025-01-01 stars:>3000", // A. 新贵
  "stars:>15000",                     // B. 遗珠
];

const candidates = new Map(); // repo full_name -> gh repo object
for (const q of QUERIES) {
  console.log("查询: " + q);
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await ghSearch(q, page);
    const repos = data.items || [];
    console.log("  第 " + page + " 页: " + repos.length + " 条");
    for (const r of repos) candidates.set((r.full_name || "").toLowerCase(), r);
    if (repos.length < 100) break;
    await sleep(2500); // search API 节流：认证后 30 次/分钟
  }
}
console.log("去重后候选: " + candidates.size);

const added = [];
for (const r of candidates.values()) {
  if (added.length >= LIMIT) break;
  const full = (r.full_name || "").toLowerCase();
  if (!full || existingRepos.has(full)) continue;
  if (r.fork || r.archived || r.disabled) continue;
  const stars = r.stargazers_count || 0;
  if (stars < MIN_STARS) continue;
  const descEn = cleanDesc(r.description);
  if (!descEn) continue;

  const repoName = r.name || full.split("/")[1] || "tool";
  const id = uniqueId(slugify(repoName));
  const topics = (r.topics || []).slice(0, 4);
  const pushedAt = (r.pushed_at || "").slice(0, 10);

  const entry = {
    id,
    name: prettify(repoName),
    repo: r.full_name,
    homepage: r.homepage || "",
    category: categoryFor(topics),
    desc: "",
    tags: topics,
    seed: { stars, language: r.language || "" },
    usage: [],
    scene: "",
    cloud: "",
    descEn,
    pushedAt,
  };
  items.push(entry);
  existingRepos.add(full);
  existingIds.add(id);
  added.push({ id, repo: r.full_name, stars, category: entry.category });
}

console.log("\n新增 " + added.length + " 个项目" + (DRY ? "（试运行，未写入）" : "") + ":");
for (const a of added) console.log("  + " + a.id + "  " + a.repo + "  ★" + a.stars + "  [" + a.category + "]");

if (!DRY && added.length) {
  await writeFile(SRC, JSON.stringify(source, null, 2) + "\n", "utf8");
  console.log("已写入 " + SRC);
}
if (!DRY && !added.length) console.log("无新增，文件未改动。");
