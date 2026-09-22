#!/usr/bin/env node
// 零依赖静态服务器，用于本地预览（模拟 Apache 的 DirectoryIndex 与 404 行为）
// 用法: node scripts/serve.mjs [端口] [目录]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 目录默认为仓库根目录（即部署产物所在目录）
const PORT = Number(process.argv[2] || 5188);
const ROOT = process.argv[3]
  ? resolve(process.argv[3])
  : resolve(dirname(fileURLToPath(import.meta.url)), "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json"
};

// 解析请求路径 -> 实际文件，支持 /tool/x/ 这种目录索引
async function resolveFile(pathname) {
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const list = safe.endsWith("/")
    ? [safe + "index.html"]
    : [safe, safe + "/index.html", safe + ".html"];
  for (const candidate of list) {
    const file = join(ROOT, candidate);
    if (!file.startsWith(ROOT)) continue;
    try {
      const st = await stat(file);
      if (st.isFile()) return file;
    } catch (e) { /* 继续尝试下一个候选 */ }
  }
  return null;
}

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = await resolveFile(pathname);
    if (!file) {
      let body = "404 not found";
      let type = "text/plain; charset=utf-8";
      try {
        body = await readFile(join(ROOT, "404.html"), "utf8");
        type = "text/html; charset=utf-8";
      } catch (e) {}
      res.writeHead(404, { "Content-Type": type }).end(body);
      return;
    }
    const buf = await readFile(file);
    res.writeHead(200, {
      "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(buf);
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("500 server error");
  }
}).listen(PORT, "127.0.0.1", () => console.log("预览地址: http://127.0.0.1:" + PORT));
