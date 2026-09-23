/* 在线工具冒烟测试：用 DOM 桩真实执行 online.js，验证每个工具的逻辑 */
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APPS = JSON.parse(readFileSync(join(ROOT, "scripts", "apps.json"), "utf8"));
const SRC = readFileSync(join(ROOT, "online.js"), "utf8");

function makeEl(id, attrs) {
  const e = {
    id, value: "", _text: "", _html: "", _h: {}, attrs: Object.assign({}, attrs || {}),
    checked: false, style: {}, children: [],
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
    addEventListener(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); },
    dispatch(ev, arg) { (this._h[ev] || []).forEach((f) => f.call(this, arg || { preventDefault() {} })); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    querySelector() { return null; },
    select() {}, focus() {},
  };
  return e;
}

function pageHtmlFor(appId, lang) {
  const rel = (lang === "en" ? "en/online/" : "online/") + appId + "/index.html";
  return readFileSync(join(ROOT, rel), "utf8");
}

function runApp(appId, lang) {
  const html = pageHtmlFor(appId, lang);
  // 取出 <div class="app" data-app="..."> ... </div> 这一段里的 id 与控件
  const els = {};
  for (const m of html.matchAll(/ id="([^"]+)"/g)) els[m[1]] = makeEl(m[1]);

  const acts = [];
  for (const m of html.matchAll(/data-act="([^"]+)"/g)) {
    const e = makeEl("act:" + m[1], { "data-act": m[1] });
    acts.push(e);
  }
  const algBoxes = [];
  for (const m of html.matchAll(/data-alg="([^"]+)"/g)) {
    const e = makeEl("alg:" + m[1], { "data-alg": m[1] });
    e.checked = /data-alg="[^"]+"\s+checked/.test(html) ? true : html.includes('data-alg="' + m[1] + '" checked');
    algBoxes.push(e);
  }
  const copies = [];
  for (const m of html.matchAll(/data-copy="([^"]+)"/g)) {
    copies.push(makeEl("copy:" + m[1], { "data-copy": m[1] }));
  }

  const host = makeEl("host", { "data-app": appId });
  host.querySelectorAll = (sel) => {
    if (sel === "[data-act]") return acts;
    if (sel === "[data-alg]") return algBoxes;
    if (sel === "[data-copy]") return copies;
    return [];
  };

  globalThis.document = {
    getElementById: (id) => els[id] || (els[id] = makeEl(id)),
    querySelector: (sel) => (sel === "[data-app]" ? host : null),
    createElement: () => makeEl("new"),
    body: { appendChild() {}, removeChild() {} },
    documentElement: { _a: {}, setAttribute(k, v) { this._a[k] = v; }, getAttribute(k) { return this._a[k]; } },
    addEventListener() {},
  };
  globalThis.window = globalThis;
  globalThis.__LANG__ = lang;   // navigator 在 Node 24 是只读的，不覆盖；它没有 clipboard 会自动走降级分支
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = () => 0;   // 时间戳工具的定时器不真的跑

  new Function(SRC)();
  const out = { els, host, acts, algBoxes, copies, click: (name) => acts.filter((a) => a.getAttribute("data-act") === name)[0]?.dispatch("click") };
  out.restore = () => { globalThis.setInterval = realSetInterval; };
  return out;
}

let pass = 0, fail = 0;
const brief = (v) => { const s = String(v); return s.length > 90 ? s.slice(0, 90) + "…" : s; };
function check(name, actual, expected) {
  const ok = actual === expected;
  console.log((ok ? "  ok   " : "  FAIL ") + name.padEnd(40) + " -> " + brief(actual) + (ok ? "" : "   期望 " + brief(expected)));
  ok ? pass++ : fail++;
}

/* 1. JSON 格式化 */
{
  const t = runApp("json-format", "zh");
  t.els["jf-in"].value = '{"b":[2,3],"a":1}';
  t.els["jf-indent"].value = "2";   // 桩不会读 <select> 的默认选项，手动给
  t.click("format");
  check("JSON 格式化：键按原顺序、缩进 2", t.els["jf-out"].value, '{\n  "b": [\n    2,\n    3\n  ],\n  "a": 1\n}');
  t.click("minify");
  check("JSON 压缩", t.els["jf-out"].value, '{"b":[2,3],"a":1}');
  t.els["jf-indent"].value = "";
  t.click("format");
  check("缩进值非法时回退到 2 空格", t.els["jf-out"].value.includes("\n  \"b\""), true);
  t.els["jf-in"].value = "{bad}";
  t.click("validate");
  check("JSON 错误提示", t.els["jf-msg"].textContent.includes("JSON 解析失败"), true);
  t.restore();
}

/* 2. Base64（含中文） */
{
  const t = runApp("base64", "zh");
  t.els["b64-in"].value = "中文测试🚀";
  t.click("encode");
  const enc = t.els["b64-out"].value;
  check("Base64 编码中文", enc, "5Lit5paH5rWL6K+V8J+agA==");
  t.els["b64-in"].value = enc;
  t.click("decode");
  check("Base64 解码回中文", t.els["b64-out"].value, "中文测试🚀");
  t.restore();
}

/* 3. 哈希 */
{
  const t = runApp("hash", "zh");
  t.els["hs-in"].value = "abc";
  t.els["hs-in"].dispatch("input");
  await new Promise((r) => setTimeout(r, 300));
  const sha256 = /[0-9a-f]{64}/.exec(t.els["hs-out"].innerHTML)?.[0] || "";
  check("SHA-256('abc')", sha256, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  t.restore();
}

/* 4. 命名风格 */
{
  const t = runApp("case-convert", "zh");
  t.els["cc-in"].value = "hello world";
  t.els["cc-in"].dispatch("input");
  const h = t.els["cc-out"].innerHTML;
  check("camelCase", h.includes(">helloWorld<"), true);
  check("snake_case", h.includes(">hello_world<"), true);
  check("kebab-case", h.includes(">hello-world<"), true);
  check("CONSTANT_CASE", h.includes(">HELLO_WORLD<"), true);
  t.els["cc-in"].value = "HTTPServer_config-file";
  t.els["cc-in"].dispatch("input");
  check("切分 HTTPServer_config-file", t.els["cc-out"].innerHTML.includes(">http_server_config_file<"), true);
  t.restore();
}

/* 5. URL */
{
  const t = runApp("url-encode", "zh");
  t.els["ue-in"].value = "a b&c=d/中文";
  t.click("encode");
  check("encodeURIComponent", t.els["ue-out"].value, "a%20b%26c%3Dd%2F%E4%B8%AD%E6%96%87");
  t.els["ue-in"].value = t.els["ue-out"].value;
  t.click("decode");
  check("URL 解码", t.els["ue-out"].value, "a b&c=d/中文");
  t.restore();
}

/* 6. 颜色 */
{
  const t = runApp("color", "zh");
  t.els["cl-in"].value = "#2563eb";
  t.els["cl-in"].dispatch("input");
  const h = t.els["cl-out"].innerHTML;
  check("HEX -> RGB", h.includes("rgb(37, 99, 235)"), true);
  check("HEX -> HSL", h.includes("hsl(221, 83%, 53%)"), true);
  check("色阶 9 个", (t.els["cl-scale"].innerHTML.match(/class="swatch"/g) || []).length, 9);
  t.restore();
}

/* 7. 密码 */
{
  const t = runApp("password", "zh");
  t.els["pw-len"].value = "24";
  t.els["pw-count"].value = "3";
  ["pw-up", "pw-low", "pw-num", "pw-sym"].forEach((k) => { t.els[k].checked = true; });
  t.els["pw-amb"].checked = false;
  t.click("gen");
  const lines = (t.els["pw-out"].getAttribute("data-raw") || "").split("\n").filter(Boolean);
  check("生成 3 条", lines.length, 3);
  check("每条 24 位", lines.every((l) => l.length === 24), true);
  check("字符集覆盖四类", lines.some((l) => /[A-Z]/.test(l)) && lines.some((l) => /[a-z]/.test(l)) && lines.some((l) => /[0-9]/.test(l)) && lines.some((l) => /[^A-Za-z0-9]/.test(l)), true);
  t.restore();
}

/* 8. 文本对比 */
{
  const t = runApp("diff", "zh");
  t.els["df-a"].value = "a\nb\nc";
  t.els["df-b"].value = "a\nx\nc";
  t.click("diff");
  const h = t.els["df-out"].innerHTML;
  check("标出删除", h.includes("diff-line del"), true);
  check("标出新增", h.includes("diff-line add"), true);
  check("统计 +1 / -1", h.includes("+1 / -1"), true);
  t.restore();
}

/* 9. 时间戳 */
{
  const t = runApp("timestamp", "zh");
  t.els["ts-in"].value = "1758530000";
  t.click("toDate");
  check("时间戳转日期", t.els["ts-out"].value.includes("UTC:"), true);
  check("含秒值", t.els["ts-out"].value.includes("1758530000"), true);
  t.restore();
}

/* ---- 第二批工具 ---- */

/* 11. Markdown */
{
  const t = runApp("markdown", "zh");
  t.els["md-in"].value = "# 标题\n\n**粗体** 和 *斜体*\n\n- a\n- b\n\n1. 一\n2. 二";
  t.els["md-in"].dispatch("input");
  await new Promise((r) => setTimeout(r, 300));
  const h = t.els["md-out"].innerHTML;
  check("Markdown H1", h.includes("<h1>标题</h1>"), true);
  check("Markdown 粗体", h.includes("<strong>粗体</strong>"), true);
  check("Markdown 斜体", h.includes("<em>斜体</em>"), true);
  check("Markdown 无序列表", h.includes("<ul><li>a</li><li>b</li></ul>"), true);
  check("Markdown 有序列表", h.includes("<ol><li>一</li><li>二</li></ol>"), true);
  t.els["md-in"].value = "| A | B |\n|---|---|\n| 1 | 2 |";
  t.els["md-in"].dispatch("input");
  await new Promise((r) => setTimeout(r, 300));
  check("Markdown 表格", t.els["md-out"].innerHTML.includes("<th>A</th>"), true);
  t.els["md-in"].value = "```js\nconst a = 1;\n```";
  t.els["md-in"].dispatch("input");
  await new Promise((r) => setTimeout(r, 300));
  check("Markdown 代码块", t.els["md-out"].innerHTML.includes("<pre><code>const a = 1;"), true);
  t.restore();
}

/* 12. 正则 */
{
  const t = runApp("regex", "zh");
  t.els["re-pat"].value = "\\d+";
  t.els["re-flags"].value = "g";
  t.els["re-in"].value = "a1 b22 c333";
  t.els["re-in"].dispatch("input");
  check("正则匹配数 3", t.els["re-msg"].textContent.includes("3"), true);
  check("正则高亮", t.els["re-hl"].innerHTML.includes("<mark>333</mark>"), true);
  t.els["re-pat"].value = "(a+)";
  t.els["re-in"].dispatch("input");
  check("正则捕获组", t.els["re-out"].innerHTML.includes("$1="), true);
  t.els["re-pat"].value = "([";
  t.els["re-in"].dispatch("input");
  check("非法正则报错", t.els["re-msg"].textContent.length > 0, true);
  t.restore();
}

/* 13. 字数统计 */
{
  const t = runApp("word-count", "zh");
  t.els["wc-in"].value = "你好世界 hello world";
  t.els["wc-in"].dispatch("input");
  const h = t.els["wc-out"].innerHTML;
  check("中文字符数 = 4", h.includes('中文字符</span><code class="app-v">4</code>'), true);
  check("英文单词数 = 2", h.includes('英文单词</span><code class="app-v">2</code>'), true);
  check("总字符数 = 16", h.includes('总字符</span><code class="app-v">16</code>'), true);
  t.restore();
}

/* 14. 文本批处理 */
{
  const t = runApp("text-tools", "zh");
  t.els["tt-in"].value = "b\na\nb\n\nc";
  t.click("dedupe");
  check("去重后剩 4 行（含空行）", t.els["tt-out"].value.split("\n").length, 4);
  t.click("dropEmpty");
  check("去空行后剩 3 行", t.els["tt-out"].value.split("\n").length, 3);
  t.click("sort");
  check("升序排序", t.els["tt-out"].value, "a\nb\nc");
  t.click("sortDesc");
  check("降序排序", t.els["tt-out"].value, "c\nb\na");
  t.restore();
}

/* 15. JWT */
{
  const t = runApp("jwt", "zh");
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  t.els["jwt-in"].value = b64u({ alg: "HS256", typ: "JWT" }) + "." + b64u({ sub: "1234", exp: 9999999999 }) + ".sig";
  t.els["jwt-in"].dispatch("input");
  const h = t.els["jwt-out"].innerHTML;
  check("JWT 解析 Header", h.includes("HS256"), true);
  check("JWT 解析 Payload", h.includes("1234"), true);
  check("JWT 未过期提示", t.els["jwt-msg"].textContent.includes("有效"), true);
  t.els["jwt-in"].value = "not-a-jwt";
  t.els["jwt-in"].dispatch("input");
  check("非法 JWT 报错", t.els["jwt-msg"].textContent.length > 0, true);
  t.restore();
}

/* 16. 进制转换 */
{
  const t = runApp("number-base", "zh");
  t.els["nb-in"].value = "255";
  t.els["nb-from"].value = "10";
  t.els["nb-in"].dispatch("input");
  let h = t.els["nb-out"].innerHTML;
  check("255 → HEX", h.includes("0xFF"), true);
  check("255 → BIN", h.includes("0b11111111"), true);
  check("255 → OCT", h.includes("0o377"), true);
  t.els["nb-in"].value = "FF";
  t.els["nb-from"].value = "16";
  t.els["nb-in"].dispatch("input");
  h = t.els["nb-out"].innerHTML;
  check("0xFF → DEC 255", h.includes('DEC</span><code class="app-v">255</code>'), true);
  t.restore();
}

/* 17. 转义 */
{
  const t = runApp("escape", "zh");
  t.els["es-in"].value = '<a href="x">&!';
  t.click("htmlEnc");
  check("HTML 转义", t.els["es-out"].value, "&lt;a href=&quot;x&quot;&gt;&amp;!");
  t.els["es-in"].value = t.els["es-out"].value;
  t.click("htmlDec");
  check("HTML 反转义往返", t.els["es-out"].value, '<a href="x">&!');
  t.els["es-in"].value = "中文A";
  t.click("uniEnc");
  const uni = t.els["es-out"].value;
  check("Unicode 转义", uni.indexOf("4e2d") !== -1 && uni.indexOf("A") !== -1, true);
  t.els["es-in"].value = uni;
  t.click("uniDec");
  check("Unicode 反转义往返", t.els["es-out"].value, "中文A");
  t.els["es-in"].value = 'a"b';
  t.click("jsonStr");
  check("JSON 字符串转义", t.els["es-out"].value, 'a\\"b');
  t.restore();
}

/* 18. CSV ↔ JSON */
{
  const t = runApp("csv-json", "zh");
  t.els["cj-in"].value = 'name,age\n"张,三",30\n李四,25';
  t.click("csv2json");
  const j = JSON.parse(t.els["cj-out"].value);
  check("CSV 行数", j.length, 2);
  check("带逗号的引号字段", j[0].name, "张,三");
  check("字段类型保持字符串", j[1].age, "25");
  t.els["cj-in"].value = t.els["cj-out"].value;
  t.click("json2csv");
  const csv = t.els["cj-out"].value;
  check("JSON → CSV 表头", csv.split("\n")[0], "name,age");
  check("JSON → CSV 自动加引号", csv.includes('"张,三"'), true);
  t.restore();
}

/* 20. Cron */
{
  const t = runApp("cron", "zh");
  t.els["cr-in"].value = "0 9 * * 1-5";
  t.els["cr-in"].dispatch("input");
  const h = t.els["cr-out"].innerHTML;
  check("Cron 分钟字段", h.includes("分钟"), true);
  check("Cron 接下来执行时间", h.includes("接下来 5 次"), true);
  check("Cron 解析成功", t.els["cr-msg"].textContent.includes("成功"), true);
  t.els["cr-in"].value = "bad";
  t.els["cr-in"].dispatch("input");
  check("非法 Cron 报错", t.els["cr-msg"].textContent.length > 0, true);
  t.els["cr-in"].value = "*/5 * * * *";
  t.els["cr-in"].dispatch("input");
  check("Cron */5 解析", t.els["cr-out"].innerHTML.includes("每 5"), true);
  t.restore();
}

console.log("");
console.log("结果: " + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
