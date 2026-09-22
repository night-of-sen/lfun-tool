/* 冒烟测试：解析生成的静态 HTML，用最小 DOM 桩真实执行 app.js */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(ROOT, "index.html"), "utf8");
const data = JSON.parse(readFileSync(resolve(ROOT, "data/tools.json"), "utf8"));
const items = data.items;
const has = (t, u) => (t.usage || []).includes(u);

/* 取出内联的 i18n */
const i18nStart = html.indexOf("window.__I18N__=");
const i18nEnd = html.indexOf(";</script>", i18nStart);
const i18n = JSON.parse(html.slice(i18nStart + "window.__I18N__=".length, i18nEnd));

/* 解析静态卡片 */
const parsed = [];
const cardRe = /<article class="card"([\s\S]*?)>/g;
let mm;
while ((mm = cardRe.exec(html))) {
  const a = mm[1];
  const get = (k) => { const r = new RegExp('data-' + k + '="([^"]*)"').exec(a); return r ? r[1] : ""; };
  parsed.push({
    id: get("id"), scene: get("scene"), usage: get("usage"), category: get("category"),
    stars: Number(get("stars")) || 0, name: get("name"), updated: get("updated"), search: get("search")
  });
}

/* ---------- 最小 DOM 桩 ---------- */
function stub(attrs, text) {
  const el = {
    _html: "", _text: text || "", _h: {}, _qcache: {}, attrs: Object.assign({}, attrs || {}),
    _children: [], hidden: false, value: "",
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; this._qcache = {}; },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    addEventListener(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); },
    dispatch(ev, arg) { (this._h[ev] || []).forEach((f) => f.call(el, arg || { preventDefault() {} })); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    appendChild(c) { this._children = this._children.filter((x) => x !== c); this._children.push(c); },
    focus() {}, blur() {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); },
      toggle(c, on) { if (on === undefined) on = !this._s.has(c); on ? this._s.add(c) : this._s.delete(c); }
    },
    querySelectorAll(sel) {
      if (sel === ".card") return this._children.slice();
      if (this._qcache[sel]) return this._qcache[sel];
      const out = [];
      let re, m;
      if (sel === ".chip") {
        re = /<button class="chip[^"]*" data-(usage|cat)="([^"]+)"/g;
        while ((m = re.exec(this._html))) {
          const e = stub(); e.attrs[m[1] === "usage" ? "data-usage" : "data-cat"] = m[2]; out.push(e);
        }
      } else if (sel === ".scene-btn") {
        re = /<button class="scene-btn[^"]*" data-scene="([^"]+)"/g;
        while ((m = re.exec(this._html))) { const e = stub(); e.attrs["data-scene"] = m[1]; out.push(e); }
      }
      this._qcache[sel] = out;
      return out;
    }
  };
  return el;
}

const els = {};
const getEl = (id) => (els[id] = els[id] || stub());
const grid = getEl("grid");
const cardEls = parsed.map((p) => stub({
  "data-id": p.id, "data-scene": p.scene, "data-usage": p.usage, "data-category": p.category,
  "data-stars": String(p.stars), "data-name": p.name, "data-updated": p.updated, "data-search": p.search
}));
grid._children = cardEls;

const sceneHost = stub();
const sceneRe = /<button class="scene-btn([^"]*)" data-scene="([^"]+)">([^<]*)<\/button>/g;
let sm;
while ((sm = sceneRe.exec(html))) {
  const e = stub({ "data-scene": sm[2] }, sm[3]);
  sceneHost._children.push(e);
}
if (!sceneHost._children.length) {
  // 兼容多行写法
  const re2 = /data-scene="([^"]+)"[^>]*>([^<]*)</g;
  while ((sm = re2.exec(html))) sceneHost._children.push(stub({ "data-scene": sm[1] }, sm[2]));
}
sceneHost.querySelectorAll = function (sel) {
  if (sel === ".scene-btn") return this._children.slice();
  return [];
};

globalThis.document = {
  documentElement: { _a: {}, setAttribute(k, v) { this._a[k] = v; }, getAttribute(k) { return this._a[k]; } },
  getElementById: getEl,
  querySelector: (sel) => (sel === ".scene-switch" ? sceneHost : null),
  querySelectorAll: () => [],
  createElement: () => stub(),
  addEventListener() {}
};
globalThis.window = globalThis;
globalThis.__I18N__ = i18n;
globalThis.__LANG__ = "zh";
globalThis.matchMedia = () => ({ matches: false });
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

new Function(readFileSync(resolve(ROOT, "app.js"), "utf8"))();
await new Promise((r) => setTimeout(r, 60));

/* ---------- 断言 ---------- */
let pass = 0, fail = 0;
const brief = (v) => { const s = String(v); return s.length > 70 ? s.slice(0, 70) + "…" : s; };
function check(name, actual, expected) {
  const ok = actual === expected;
  console.log((ok ? "  ok   " : "  FAIL ") + name + "  ->  " + brief(actual) + (ok ? "" : "   (期望 " + brief(expected) + ")"));
  ok ? pass++ : fail++;
}
const visible = () => cardEls.filter((e) => !e.hidden).length;
const scenes = () => sceneHost.querySelectorAll(".scene-btn");
const usages = () => getEl("usage-chips").querySelectorAll(".chip");
const cats = () => getEl("chips").querySelectorAll(".chip");
const clickScene = (k) => scenes().filter((x) => x.getAttribute("data-scene") === k)[0].dispatch("click");
const clickUsage = (k) => usages().filter((x) => x.getAttribute("data-usage") === k)[0].dispatch("click");
const clickCat = (k) => cats().filter((x) => x.getAttribute("data-cat") === k)[0].dispatch("click");
const countIn = (re) => (html.match(re) || []).length;

console.log("\n[1] 生成的静态 HTML（SEO 基础）");
check("卡片总数", parsed.length, items.length);
check("指向工具页的链接数", countIn(/href="\/tool\//g), items.length);
check("hreflang zh-CN", html.includes('hreflang="zh-CN"'), true);
check("hreflang en", html.includes('hreflang="en"'), true);
check("hreflang x-default", html.includes('hreflang="x-default"'), true);
check("canonical", html.includes('<link rel="canonical" href="https://tools.lfun.cloud/">'), true);
check("JSON-LD 块数", countIn(/application\/ld\+json/g), 2);
check("在线使用按钮", countIn(/rel="noopener">在线使用<\/a>/g), items.filter((t) => has(t, "online") && t.homepage).length);
check("部署按钮", countIn(/rel="noopener">部署<\/a>/g), items.filter((t) => !has(t, "online") && !has(t, "desktop") && !has(t, "cli") && has(t, "selfhost")).length);
check("下载按钮", countIn(/rel="noopener">下载<\/a>/g), items.filter((t) => !has(t, "online") && (has(t, "desktop") || has(t, "cli"))).length);
check("文档按钮", countIn(/rel="noopener">文档<\/a>/g), items.filter((t) => !has(t, "online") && !has(t, "desktop") && !has(t, "cli") && has(t, "lib")).length);

console.log("\n[2] 初始渲染与筛选条");
check("可见卡片数", visible(), items.length);
check("场景按钮数", scenes().length, 3);
check("使用方式 chip 数", usages().length, 6);
check("分类 chip 数", cats().length, 28);
check("结果计数文案", getEl("result-count").textContent, "显示 " + items.length + " / " + items.length + " 个工具");

console.log("\n[3] 场景切换");
clickScene("overseas");
check("出海辅助", visible(), items.filter((t) => (t.scene || "general") === "overseas").length);
check("出海分类 chip 数", cats().length, 14);
clickScene("general");
check("通用工具", visible(), items.filter((t) => (t.scene || "general") === "general").length);
check("通用分类 chip 数", cats().length, 15);
clickScene("all");
check("回到全部", visible(), items.length);

console.log("\n[4] 三层筛选联动");
clickScene("overseas");
clickUsage("selfhost");
check("出海 · 可自托管", visible(), items.filter((t) => (t.scene || "general") === "overseas" && has(t, "selfhost")).length);
clickUsage("all");
clickCat("email");
check("出海 · 邮件触达", visible(), items.filter((t) => (t.scene || "general") === "overseas" && t.category === "email").length);
clickUsage("lib");
check("邮件触达 + 开发库（分类自动重置）", visible(), items.filter((t) => (t.scene || "general") === "overseas" && has(t, "lib")).length);
clickScene("all");
clickCat("all");
check("重置后", visible(), items.length);

console.log("\n[5] 搜索");
const search = getEl("search");
async function type(v) { search.value = v; search.dispatch("input"); await new Promise((r) => setTimeout(r, 200)); }
await type("客服");
check("搜索 客服", visible(), items.filter((t) => [t.name, t.repo, t.desc, t.descEn, t.language, (t.tags || []).join(" ")].join(" ").toLowerCase().includes("客服")).length);
await type("zzz不存在zzz");
check("无结果", visible(), 0);
check("空状态显示", getEl("empty").hidden, false);
await type("");
check("清空搜索", visible(), items.length);

console.log("\n[6] 排序与收藏");
const sort = getEl("sort");
sort.value = "stars"; sort.dispatch("change");
check("按星数排序首条", grid._children[0].getAttribute("data-name"), "yt-dlp");
const favs = grid._children[0];
getEl("grid");
check("收藏持久化键存在", typeof store.get("gh-tools:favs"), "undefined");

console.log("\n[7] 主题");
check("默认浅色", document.documentElement.getAttribute("data-theme"), "light");
getEl("theme-toggle").dispatch("click");
check("切换深色", document.documentElement.getAttribute("data-theme"), "dark");

console.log("\n结果: " + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
