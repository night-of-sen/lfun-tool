// 每日新闻抓取：聚合 AI 行业资讯（RSS/JSON）+ 本站工具动态，写入 data/news.json。
// 由每日同步 workflow 在 build-pages 之前运行（需用户手动加步骤，见 PR 说明）。
// 设计原则：任何一步失败都不阻塞构建——源挂了记 failures 继续跑，
// 没有 DEEPSEEK_API_KEY 就跳过 AI 摘要只发聚合，脚本永远 exit 0。
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BEIJING = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

const SOURCES = [
  { name: "OpenAI", url: "https://openai.com/news/rss.xml", filter: false },
  { name: "GitHub Blog", url: "https://github.blog/feed/", filter: true },
  // HN 的 RSS 在 CI 共享 IP 下持续返回 419（2026-10-26 起连挂 3 天），改用 HN 官方 Algolia 搜索接口取首页故事
  { name: "Hacker News", url: "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30", filter: true, type: "algolia" },
  { name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/", filter: true },
];

// AI 相关关键词（标题单词边界匹配，避免 ai 误中 said/mail 之类）
const AI_WORDS = ["ai", "llm", "gpt", "claude", "gemini", "copilot", "deepseek", "openai",
  "anthropic", "machine learning", "neural", "chatbot", "transformer", "diffusion",
  "llama", "mistral", "grok", "kimi", "qwen", "agent", "agents", "model", "models"];
const AI_RE = new RegExp("\\b(" + AI_WORDS.map(function (w) {
  return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}).join("|") + ")\\b", "i");

const PER_SOURCE = 5;
const TOTAL_CAP = 20;
const KEEP_DAYS = 30;

function decode(s) {
  return (s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
}

function pickTag(block, tags) {
  for (var i = 0; i < tags.length; i++) {
    var m = block.match(new RegExp("<" + tags[i] + "[^>]*>([\\s\\S]*?)</" + tags[i] + ">", "i"));
    if (m) return decode(m[1]);
  }
  return "";
}

function pickLink(block) {
  var m = block.match(/<link[^>]*href="([^"]+)"/i);
  if (m) return m[1].trim();
  return pickTag(block, ["link"]);
}

function parseFeed(xml, source) {
  var out = [];
  var blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    var title = pickTag(b, ["title"]);
    var link = pickLink(b);
    var dateRaw = pickTag(b, ["pubDate", "updated", "published", "dc:date"]);
    var d = dateRaw ? new Date(dateRaw) : null;
    if (!title || !link) continue;
    out.push({
      title: title,
      link: link,
      source: source.name,
      date: d && !isNaN(d) ? d.toISOString().slice(0, 10) : BEIJING,
      ts: d && !isNaN(d) ? d.getTime() : 0,
    });
  }
  return pickItems(out, source);
}

// 选条：AI 关键词过滤（filter 源）→ 按时间倒序 → 优先 72 小时内新鲜资讯，
// 某源 72 小时内无 AI 相关内容时，退而取其最新 2 条 AI 相关内容兜底（RSS 与 Algolia 共用）
function pickItems(out, source) {
  if (source.filter) out = out.filter(function (it) { return AI_RE.test(it.title); });
  out.sort(function (a, b) { return b.ts - a.ts; });
  var cutoff = Date.now() - 72 * 3600 * 1000;
  var fresh = out.filter(function (it) { return it.ts >= cutoff; });
  var picked = fresh.length ? fresh.slice(0, PER_SOURCE) : out.slice(0, 2);
  return picked.map(function (it) {
    return { title: it.title, link: it.link, source: it.source, date: it.date, ts: it.ts };
  });
}

function parseAlgolia(data, source) {
  var hits = (data && Array.isArray(data.hits)) ? data.hits : [];
  var out = [];
  for (var i = 0; i < hits.length; i++) {
    var h = hits[i];
    var title = (h.title || "").trim();
    // 无外链的帖子（如 Ask HN）回落到 HN 原帖链接；无标题或无链接的跳过
    var link = h.url || (h.objectID ? "https://news.ycombinator.com/item?id=" + h.objectID : "");
    var d = h.created_at ? new Date(h.created_at) : null;
    if (!title || !link) continue;
    out.push({
      title: title,
      link: link,
      source: source.name,
      date: d && !isNaN(d) ? d.toISOString().slice(0, 10) : BEIJING,
      ts: d && !isNaN(d) ? d.getTime() : 0,
    });
  }
  return pickItems(out, source);
}

async function fetchOne(source) {
  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, 15000);
  try {
    var res = await fetch(source.url, {
      signal: ctrl.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; tools.lfun.cloud news bot)" },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    if (source.type === "algolia") return parseAlgolia(await res.json(), source);
    return parseFeed(await res.text(), source);
  } finally {
    clearTimeout(timer);
  }
}

async function aiSummaries(items) {
  var key = process.env.DEEPSEEK_API_KEY || "";
  if (!key || items.length === 0) return null;
  try {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 60000);
    var res;
    try {
      res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + key,
        },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
          messages: [
            {
              role: "system",
              content: "你是中英双语科技新闻编辑。只根据给定的标题和链接写内容，绝不编造标题里没有的事实；翻译只翻译不发挥。输出 JSON：{\"summaries\":[{\"link\":\"原链接\",\"zhTitle\":\"中文翻译标题\",\"zh\":\"一句话中文摘要，不超过 40 字\",\"en\":\"One-line English summary, under 20 words\"}],\"rollupZh\":\"2-3 句中文今日要闻总览\",\"rollupEn\":\"2-3 sentence English daily highlights\"}。",
            },
            {
              role: "user",
              content: items.map(function (it) {
                return "- " + it.title + " | " + it.link + " | " + it.source;
              }).join("\n"),
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        }),
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error("DeepSeek HTTP " + res.status);
    var data = await res.json();
    var text = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : "";
    var parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.summaries)) return null;
    return parsed;
  } catch (e) {
    console.log("  AI 摘要跳过：" + (e.message || e));
    return null;
  }
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    return fallback;
  }
}

var newsItems = [];
var failures = [];
for (var s = 0; s < SOURCES.length; s++) {
  try {
    var got = await fetchOne(SOURCES[s]);
    console.log("  " + SOURCES[s].name + "：" + got.length + " 条");
    newsItems = newsItems.concat(got);
  } catch (e) {
    console.log("  " + SOURCES[s].name + " 抓取失败：" + (e.message || e));
    failures.push(SOURCES[s].name);
  }
}
// 去重（按链接）+ 按时间倒序 + 总量封顶
var seen = {};
newsItems = newsItems.filter(function (it) {
  if (seen[it.link]) return false;
  seen[it.link] = true;
  return true;
}).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }).slice(0, TOTAL_CAP)
  .map(function (it) {
    return { title: it.title, link: it.link, source: it.source, date: it.date };
  });

// 本站工具动态：对比昨日快照（快照由本脚本每天更新后随构建提交）
var sourceData = await readJson(join(ROOT, "scripts", "tools.source.json"), { items: [] });
var toolsData = await readJson(join(ROOT, "data", "tools.json"), { items: [] });
var toolsById = {};
(toolsData.items || []).forEach(function (t) { toolsById[t.id] = t; });
var snapshot = await readJson(join(ROOT, "data", "news-tools-snapshot.json"), null);
var toolsNew = [];
var toolsTrending = [];
var curStars = {};
(toolsData.items || []).forEach(function (t) { curStars[t.id] = t.stars || 0; });
if (snapshot && Array.isArray(snapshot.ids)) {
  var oldIds = {};
  snapshot.ids.forEach(function (id) { oldIds[id] = true; });
  (sourceData.items || []).forEach(function (it) {
    if (!oldIds[it.id]) {
      var t = toolsById[it.id];
      if (t) toolsNew.push({ id: t.id, name: t.name, repo: t.repo, stars: t.stars || 0 });
    }
  });
  var gains = [];
  Object.keys(curStars).forEach(function (id) {
    var gain = curStars[id] - ((snapshot.stars || {})[id] || 0);
    if (gain > 0 && toolsById[id]) {
      gains.push({ id: id, name: toolsById[id].name, repo: toolsById[id].repo,
        stars: curStars[id], gain: gain });
    }
  });
  gains.sort(function (a, b) { return b.gain - a.gain; });
  toolsTrending = gains.slice(0, 5);
} else {
  console.log("  首次运行：只建快照，本站动态从明日开始");
}
await writeFile(join(ROOT, "data", "news-tools-snapshot.json"),
  JSON.stringify({ date: BEIJING,
    ids: (sourceData.items || []).map(function (it) { return it.id; }),
    stars: curStars }, null, 2) + "\n", "utf8");

// AI 双语内容（无 key 或失败时自动跳过，只发聚合）
var ai = await aiSummaries(newsItems);
var sumByLink = {};
var rollupZh = null;
var rollupEn = null;
if (ai) {
  ai.summaries.forEach(function (sm) { if (sm.link) sumByLink[sm.link] = sm; });
  rollupZh = ai.rollupZh || null;
  rollupEn = ai.rollupEn || null;
}
newsItems = newsItems.map(function (it) {
  var o = { title: it.title, link: it.link, source: it.source, date: it.date };
  var sm = sumByLink[it.link];
  if (sm) {
    if (sm.zhTitle) o.zhTitle = sm.zhTitle;
    if (sm.zh) o.zh = sm.zh;
    if (sm.en) o.en = sm.en;
  }
  return o;
});

var news = await readJson(join(ROOT, "data", "news.json"), { days: [] });
var days = (news.days || []).filter(function (d) { return d.date !== BEIJING; });
days.unshift({
  date: BEIJING,
  items: newsItems,
  toolsNew: toolsNew,
  toolsTrending: toolsTrending,
  rollupZh: rollupZh,
  rollupEn: rollupEn,
  failures: failures,
});
days = days.slice(0, KEEP_DAYS);
await writeFile(join(ROOT, "data", "news.json"),
  JSON.stringify({ days: days }, null, 2) + "\n", "utf8");

console.log("新闻抓取完成：" + BEIJING + " 资讯 " + newsItems.length + " 条"
  + "，新收录 " + toolsNew.length + " 个，涨星 " + toolsTrending.length + " 个"
  + (failures.length ? "，失败源：" + failures.join("、") : "")
  + (ai ? "，AI 摘要已生成" : "，AI 摘要未生成"));
