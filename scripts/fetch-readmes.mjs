#!/usr/bin/env node
// 抓取各仓库 README 并提取首段摘要，缓存到 data/readmes.json
// 走 raw.githubusercontent.com，不消耗 GitHub API 配额
// 用法: node scripts/fetch-readmes.mjs [并发数] [--force]
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONC = Number(process.argv[2] || 6) || 6;
const FORCE = process.argv.includes("--force");
// --docker: 只补抓「自托管但还没抽到 docker 命令」的条目
const DOCKER_RETRY = process.argv.includes("--docker");
const UA = "Mozilla/5.0 (compatible; lfun-tools/1.0; +https://tools.lfun.cloud)";

const data = JSON.parse(await readFile(join(ROOT, "data", "tools.json"), "utf8"));
const items = data.items;
const CACHE = join(ROOT, "data", "readmes.json");

let cache = {};
try { cache = JSON.parse(await readFile(CACHE, "utf8")); } catch (e) {}

/* ---------- 文本清洗 ---------- */
function stripCommentsAndCode(md) {
  return md
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ");
}

function cleanText(s) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function proseRatio(t) {
  let good = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) ||
        c === 32 || c === 46 || c === 44 || c === 39 || c === 45 ||
        (c >= 0x3000 && c <= 0x9fff)) good++;
  }
  return t.length ? good / t.length : 0;
}

const NOISE = /shields\.io|badge|badgen|travis|circleci|actions\/workflows|\[!\[|^\s*<\s*(p|div|h[1-6]|picture|source|a)\b/i;

// 指引性 / 流程性开头，不是项目介绍
const BAD_START = /^(optional|note|warning|tip|important|usage|install|installation|quick ?start|getting started|requirements|prerequisites|features|contributing|license|credits|changelog|roadmap|support|faq|how to|we (highly )?recommend|you (can|should|need)|click|see |check |read |run |download|now |next |then |also |this (project|repo|repository) (is|contains)|to (install|run|use|get)|please )/i;

function looksLikeProse(t) {
  const words = t.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < 12) return false;
  const uniq = new Set(words).size / words.length;
  if (uniq < 0.45) return false;
  const counts = {};
  let maxRepeat = 0;
  for (const w of words) {
    counts[w] = (counts[w] || 0) + 1;
    if (counts[w] > maxRepeat) maxRepeat = counts[w];
  }
  if (maxRepeat > 4) return false;
  if (!/[.?!]/.test(t) && words.length < 25) return false;
  return true;
}

// 项目介绍几乎一定会提到项目名，用这个信号过滤掉配置说明和文档指引
function nameTokens(tool) {
  const raw = [tool.name, (tool.repo || "").split("/").pop()].join(" ");
  return Array.from(new Set(
    raw.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3)
  ));
}

// 项目介绍通常以项目名开头（"X is a ..."），这是最强的判据
function startsWithProject(text, tool) {
  const low = text.toLowerCase().replace(/^[^a-z0-9]+/, "");
  const names = [tool.name, (tool.repo || "").split("/").pop()]
    .filter(Boolean).map(function (s) { return String(s).toLowerCase(); });
  if (names.some(function (n) { return n && low.indexOf(n) === 0; })) return true;
  return nameTokens(tool).some(function (w) { return w.length >= 2 && low.indexOf(w) === 0; });
}

// 从 README 的代码块里找第一条可直接执行的 docker 部署命令
function extractDocker(md) {
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let m;
  let compose = "";
  while ((m = re.exec(md))) {
    const code = m[2].trim();
    if (code.length > 1600 || code.split("\n").length > 42) continue;

    // 1) 短的单行命令最优：docker run ... / docker compose up -d
    const isCmd = /^\s*(?:sudo\s+)?docker\s+(?:run|compose)\b/im.test(code) || /^\s*docker-compose\b/im.test(code);
    if (isCmd && code.length <= 900 && code.split("\n").length <= 22) return code;

    // 2) 退而求其次：docker-compose.yml 内容（services: 开头）
    if (!compose) {
      if (/^\s*services:/m.test(code)) compose = code;
      else if (isCmd) compose = code;
    }
  }
  return compose;
}

function pickSummary(md, tool) {
  const blocks = stripCommentsAndCode(md).split(/\n\s*\n/);
  for (const block of blocks) {
    const raw = block.trim();
    if (!raw) continue;
    if (/^#{1,6}\s/.test(raw)) continue;
    if (/^\s*[|>]/.test(raw)) continue;
    if (/^\s*[-*+]\s/.test(raw)) continue;
    if (/^\s*\d+[.)]\s/.test(raw)) continue;
    if (/<\s*(table|tr|td|th|ul|ol|li)\b/i.test(raw)) continue;
    if ((raw.match(/\|/g) || []).length > 3) continue;
    if (NOISE.test(raw)) continue;
    const text = cleanText(raw);
    if (text.length < 80) continue;
    if (proseRatio(text) < 0.85) continue;
    if (BAD_START.test(text)) continue;
    if (!startsWithProject(text, tool)) continue;
    if (!looksLikeProse(text)) continue;
    return text.length > 300 ? text.slice(0, 300).replace(/[\s,;:.]+$/, "") + "…" : text;
  }
  return "";
}

/* ---------- 抓取 ---------- */
const NAMES = ["README.md", "readme.md", "Readme.md", "README.rst", "README.markdown"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchReadme(repo) {
  for (const name of NAMES) {
    const url = "https://raw.githubusercontent.com/" + repo + "/HEAD/" + name;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "User-Agent": UA } });
        if (res.ok) return { text: await res.text(), file: name };
        if (res.status === 404) break;             // 文件名不对，直接换下一个候选
        await sleep(2500 * (attempt + 1));         // 429 / 5xx：退避重试
      } catch (e) {
        await sleep(1500 * (attempt + 1));
      }
    }
  }
  return null;
}

// 只重试「抓取失败」或「从未抓过」的条目；解析不出摘要的不再重复抓（判据已稳定）
const todo = items.filter((t) => {
  if (FORCE) return true;
  const c = cache[t.id];
  if (!c) return true;
  if (c.missing === true) return true;
  if (DOCKER_RETRY && !c.docker && (t.usage || []).indexOf("selfhost") !== -1) return true;
  return false;
});
console.log("仓库总数 " + items.length + " | 本次需抓取 " + todo.length + "（并发 " + CONC + "）");

let ok = 0, empty = 0, fail = 0, withDocker = 0;
for (let i = 0; i < todo.length; i += CONC) {
  const batch = todo.slice(i, i + CONC);
  const out = await Promise.all(batch.map(async (tool) => {
    const r = await fetchReadme(tool.repo);
    if (!r) return { id: tool.id, ok: false };
    return { id: tool.id, ok: true, summary: pickSummary(r.text, tool), docker: extractDocker(r.text), file: r.file, len: r.text.length };
  }));
  for (const r of out) {
    if (!r.ok) {
      fail++;
      // 抓取失败绝不能覆盖已有结果——raw CDN 会限流，覆盖等于丢数据
      if (!cache[r.id]) {
        cache[r.id] = { summary: "", docker: "", source: "", fetchedAt: new Date().toISOString(), missing: true };
      } else {
        cache[r.id].missing = true;
      }
      continue;
    }
    if (!r.summary) empty++;
    else ok++;
    if (r.docker) withDocker++;
    cache[r.id] = { summary: r.summary, docker: r.docker, source: r.file, rawLength: r.len, fetchedAt: new Date().toISOString() };
  }
  if ((i + CONC) % 48 < CONC) process.stdout.write("  进度 " + Math.min(i + CONC, todo.length) + "/" + todo.length + "\n");
  if (i + CONC < todo.length) await sleep(400);
}

await writeFile(CACHE, JSON.stringify(cache, null, 2), "utf8");
const withSummary = Object.values(cache).filter((v) => v.summary).length;
console.log("");
console.log("本次: 成功 " + ok + " / 摘不出正文 " + empty + " / 无 README " + fail);
console.log("缓存中带摘要的条目: " + withSummary + " / " + items.length);
console.log("本次抽到 docker 命令: " + withDocker);
console.log("已写入 -> " + CACHE);
