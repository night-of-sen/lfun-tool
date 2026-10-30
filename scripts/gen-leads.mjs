// scripts/gen-leads.mjs — 一句话介绍生成器（中英各一句）
//
// 给每个工具生成一句“给谁用、解决什么问题”的介绍，供详情页首段与 meta 描述使用。
// 行为（与 fetch-news.mjs 同款哲学：绝不阻塞每日 workflow）：
// - 只给 scripts/tool-leads.json 里缺失或未通过门禁的工具生成（断点续跑）；--force 强制全部重生成。
// - 没有 DEEPSEEK_API_KEY 时直接跳过；任何失败只记入失败清单，脚本永远 exit 0。
// - 门禁未通过的 lead 不写入；失败的工具下次运行自动重试。
// - 用法：node scripts/gen-leads.mjs [--force] [--limit N] [--dry]
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS_PATH = join(ROOT, "data", "tools.json");
const DESC_ZH_PATH = join(ROOT, "data", "desc-zh.json");
const LEADS_PATH = join(ROOT, "scripts", "tool-leads.json");

const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash";
const CONCURRENCY = 5;
const TIMEOUT_MS = 60000;
const RETRIES = 3;

// 最高级词：lead 里出现但源描述里没有，一律判编造（源描述里本来有的不算）。
const BANNED = ["best", "fastest", "most powerful", "leading", "#1", "ultimate",
  "最强", "最好", "第一", "最快", "业界领先", "最优秀"];

const args = process.argv.slice(2);
const force = args.includes("--force");
const dry = args.includes("--dry");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

function checkText(t, enSrc, zhSrc) {
  return (t.name || "") + " " + (enSrc || "") + " " + (zhSrc || "");
}

// 门禁：返回失败原因字符串，通过返回 null。轻微问题（缺句末标点）先自动补，不判失败。
function qaFail(lead, lang, check) {
  if (!lead || !lead.trim()) return "empty";
  var s = lead.trim();
  if (lang === "en") {
    if (s.split(/\s+/).length > 50) return "too long";
  } else if (s.length > 80) {
    return "too long";
  }
  var flat = check.replace(/[,.]/g, "");
  var digits = s.match(/\d+/g) || [];
  for (const d of digits) {
    if (!flat.includes(d)) return "invented number " + d;
  }
  var low = s.toLowerCase();
  var checkLow = check.toLowerCase();
  for (const w of BANNED) {
    if (low.includes(w.toLowerCase()) && !checkLow.includes(w.toLowerCase())) {
      return "superlative " + w;
    }
  }
  return null;
}

function normalize(lead, lang) {
  var s = (lead || "").trim();
  if (!s) return s;
  if (!/[.!?。！？]$/.test(s)) s += (lang === "zh" ? "。" : ".");
  return s;
}

async function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function callOnce(t, enSrc, zhSrc, key) {
  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
  try {
    var res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + key,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "你是开源工具介绍编辑。只根据给定的工具描述写内容，绝不编造描述里没有的功能、数字、对比或排名；不使用 best/最强/第一等最高级；英文一句不超过 25 词，中文一句不超过 40 字；只输出 JSON，不要任何解释。",
          },
          {
            role: "user",
            content: "工具名：" + t.name + "\n分类：" + (t.category || "") +
              "\n英文描述：" + enSrc + "\n中文描述：" + zhSrc +
              "\n输出 JSON：{\"en\": \"一句话英文介绍：给谁用、解决什么问题\", \"zh\": \"一句话中文介绍：给谁用、解决什么问题\"}",
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });
    if (!res.ok) throw new Error("DeepSeek HTTP " + res.status);
    var data = await res.json();
    var text = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : "";
    text = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    var parsed = JSON.parse(text);
    if (!parsed || typeof parsed.en !== "string" || typeof parsed.zh !== "string") {
      throw new Error("bad JSON shape");
    }
    var en = normalize(parsed.en, "en");
    var zh = normalize(parsed.zh, "zh");
    var check = checkText(t, enSrc, zhSrc);
    var fe = qaFail(en, "en", check);
    var fz = qaFail(zh, "zh", check);
    if (fe) throw new Error("EN gate: " + fe);
    if (fz) throw new Error("ZH gate: " + fz);
    return { en: en, zh: zh };
  } finally {
    clearTimeout(timer);
  }
}

async function genWithRetry(t, enSrc, zhSrc, key) {
  var last = null;
  for (var i = 0; i <= RETRIES; i++) {
    try {
      return await callOnce(t, enSrc, zhSrc, key);
    } catch (e) {
      last = e;
      if (i < RETRIES) await sleep(1000 * Math.pow(2, i));
    }
  }
  throw last;
}

const toolsDoc = JSON.parse(await readFile(TOOLS_PATH, "utf8"));
const tools = toolsDoc.items || [];
let descZh = {};
try { descZh = JSON.parse(await readFile(DESC_ZH_PATH, "utf8")); } catch (e) {}
let leadsDoc = { generatedAt: "", items: {} };
try {
  var d = JSON.parse(await readFile(LEADS_PATH, "utf8"));
  leadsDoc.items = d.items || d || {};
  leadsDoc.generatedAt = d.generatedAt || "";
} catch (e) {}

const key = process.env.DEEPSEEK_API_KEY || "";
const todo = [];
for (const t of tools) {
  var enSrc = t.descEn || t.desc || "";
  var zhSrc = t.desc || descZh[t.id] || t.descEn || "";
  if (!enSrc && !zhSrc) continue;
  var cur = leadsDoc.items[t.id];
  if (!force && cur && cur.en && cur.zh) {
    var check = checkText(t, enSrc, zhSrc);
    if (!qaFail(cur.en, "en", check) && !qaFail(cur.zh, "zh", check)) continue;
  }
  todo.push({ t: t, enSrc: enSrc, zhSrc: zhSrc });
  if (todo.length >= limit) break;
}

console.log("一句话介绍：共 " + tools.length + " 工具，待生成 " + todo.length + " 个");
if (dry) {
  todo.slice(0, 3).forEach(function (x) { console.log("  dry: " + x.t.id); });
  process.exit(0);
}
if (!key) {
  console.log("跳过：一句话介绍生成需要 DEEPSEEK_API_KEY（未设置）");
  process.exit(0);
}

async function save() {
  leadsDoc.generatedAt = new Date().toISOString();
  await writeFile(LEADS_PATH, JSON.stringify(leadsDoc, null, 2) + "\n", "utf8");
}

let done = 0;
let okCount = 0;
const failed = [];
let idx = 0;
async function worker() {
  while (idx < todo.length) {
    var item = todo[idx++];
    try {
      var lead = await genWithRetry(item.t, item.enSrc, item.zhSrc, key);
      leadsDoc.items[item.t.id] = lead;
      okCount++;
      if (okCount % 25 === 0) await save();
    } catch (e) {
      failed.push(item.t.id + ": " + (e.message || e));
    }
    done++;
    if (done % 100 === 0) console.log("  进度 " + done + "/" + todo.length);
  }
}
await Promise.all(Array.from(
  { length: Math.min(CONCURRENCY, Math.max(todo.length, 1)) },
  function () { return worker(); },
));
await save();
console.log("完成：生成 " + okCount + " 个，失败 " + failed.length + " 个");
failed.forEach(function (f) { console.log("  失败：" + f); });
process.exit(0);
