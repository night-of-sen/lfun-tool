# 开源工具集 · GitHub 精选

精选 GitHub 开源项目，**把「怎么用」标注清楚**，不用再翻英文 README。
站点：**https://tools.lfun.cloud**

## 站点布局

同一个主域名下挂两个独立站点，使用**不同的 document root**，互不干扰：

| 地址 | 内容 | 部署方式 |
|---|---|---|
| `lfun.cloud` | 另一个独立站点（纯静态） | 手动上传到主域名根目录 |
| `tools.lfun.cloud` | **本仓库**（开源工具导航站） | Hostinger Git 部署 |

> ⚠️ 本仓库的 `canonical` / `hreflang` / `sitemap.xml` 全部指向 `tools.lfun.cloud`。
> 如果把工具站换到别的地址，必须用 `node scripts/build-pages.mjs https://新地址` 重新生成，
> 否则等于告诉搜索引擎"正式地址在别处"，页面可能被判成重复内容。

## 内容概览

另外站内还有 **20 个自己实现的在线工具**（`/online/`），浏览器里直接可用，数据不上传服务器。

收录 **570 个项目**，分两个场景：

| 场景 | 数量 | 说明 |
|---|---|---|
| 通用工具 | 461 | 日常开发、效率、娱乐 |
| 🌏 出海辅助 | 109 | 多语言、合规、支付、邮件、客服、**推广获客**等出海专有需求 |

每个项目再按「使用方式」标注：

| 使用方式 | 数量 | 含义 |
|---|---|---|
| 🌐 在线即用 | 79 | 有官方网页版，点开就用 |
| 🐳 可自托管 | 216 | Web 应用，自己部署 |
| 💻 桌面应用 | 120 | 下载客户端 |
| ⌨️ 命令行 | 110 | 装完在终端用 |
| 🧩 扩展插件 | 22 | 浏览器扩展，以及在 VS Code 等编辑器里用的扩展 |
| 📱 移动应用 | 10 | 安卓应用（F-Droid 系） |
| 📦 开发库 | 101 | 装进自己项目的库 / 框架 |
| 📚 清单资源 | 29 | 渠道清单、资料合集、学习路线，打开仓库直接看 |

> 数量按维度统计，会重复计入（一个项目可以有多种使用方式）。

## 站内在线工具

定位与收录项目完全不同——这些不是外链，是**本站自己实现的工具**，纯前端零依赖：

| 工具 | 地址 | 用到的浏览器能力 |
|---|---|---|
| 🧩 JSON 格式化 | `/online/json-format/` | JSON.parse + 错误位置定位 |
| 🔐 Base64 编解码 | `/online/base64/` | TextEncoder 处理 UTF-8（原生 btoa 遇到中文会炸） |
| 🔑 哈希计算 | `/online/hash/` | Web Crypto 的 `crypto.subtle.digest` |
| ⏱️ 时间戳转换 | `/online/timestamp/` | 自动识别 10 位/13 位 |
| 🖼️ 图片压缩 | `/online/image-compress/` | Canvas `toBlob`，可调质量和最大宽度 |
| 🎨 颜色转换 | `/online/color/` | HEX / RGB / HSL 互转 + 色阶 |
| 🔤 命名风格转换 | `/online/case-convert/` | 单词切分（认得 HTTPServer 这种连续大写） |
| 🔒 随机密码生成 | `/online/password/` | `crypto.getRandomValues` + 拒绝采样避免取模偏差 |
| 🔗 URL 编解码 | `/online/url-encode/` | 区分 encodeURI 与 encodeURIComponent |
| 📋 文本对比 | `/online/diff/` | 最长公共子序列逐行比对 |
| 📝 Markdown 预览 | `/online/markdown/` | 自写极简渲染器，代码全部转义，不执行原页面脚本 |
| 🔍 正则测试 | `/online/regex/` | `RegExp` + 高亮包裹，转义后再插入 DOM |
| 🔢 字数统计 | `/online/word-count/` | 中英混排分别计数，中文按字计 |
| 🧰 文本处理 | `/online/text-tools/` | 去重 / 去空行 / 排序 / 大小写，一次到位 |
| 🎫 JWT 解析 | `/online/jwt/` | 只解出 header / payload 并检查 exp，不做签名验证 |
| 💯 进制转换 | `/online/number-base/` | 二 / 八 / 十 / 十六进制互转，带 32 位有符号视图 |
| 🧬 转义转码 | `/online/escape/` | HTML 实体、Unicode 转义、JSON 字符串转义 |
| 📊 CSV ↔ JSON | `/online/csv-json/` | 自写 CSV 解析，认得引号内逗号和转义引号 |
| 🔄 图片格式转换 | `/online/image-convert/` | Canvas 重编码为 PNG / JPEG / WebP |
| ⏰ Cron 表达式 | `/online/cron/` | 自写字段解析，列出接下来几次执行时间 |

**核心卖点：数据不出浏览器。** 图片压缩用 Canvas 本地重编码，文本工具全在内存里处理，
没有任何上传请求。这一点比多数在线工具站更值得信任，也是页面上明确标注的。

**为什么值得做**：这些词的搜索量远高于开源项目名——「JSON 格式化」「图片压缩」「Base64 编码」
都是高频需求，而收录一个叫 Excalidraw 的项目，搜的人要少得多。20 个页面是一批新的自然流量入口。

## 页面结构（多语言）

采用 **子目录 + 默认语言放根路径** 的方案：

| 语言 | 首页 | 工具页 | 分类页 | 对比页 | 内容页 |
|---|---|---|---|---|---|
| 中文（默认） | `/` | `/tool/excalidraw/` | `/category/analytics/` | `/compare/excalidraw-vs-tldraw/` | `/about/` `/disclaimer/` |
| English | `/en/` | `/en/tool/excalidraw/` | `/en/category/analytics/` | `/en/compare/...` | `/en/about/` … |

分类总览页：`/categories/` 与 `/en/categories/`。全站共 **570 个页面**。

## 首页布局：左侧侧边栏

筛选条件放在**左侧可收缩侧边栏**里，不再是横向铺开的筛选条：

- 四个分区纵向排列：**场景 / 使用方式 / 分类 / 排序**
- 顶栏的 **☰ 按钮**可以收起侧边栏（桌面端），状态记在 localStorage
- 移动端（≤900px）自动变成**从左侧滑出的抽屉**，带遮罩，点遮罩或按 Esc 关闭
- 之所以改：分类涨到 50 个之后，横向筛选条要左右滑动才能看全，很难用

**为什么这样设计**

- Google 对 gTLD 的多语言站点推荐**子目录**方案：权重集中在同一域名，比子域名或独立域名更容易起量。
- 默认语言（中文）直接放根路径，避免 `/zh/` 和 `/` 产生重复内容。
- 每页都有双向 `hreflang`（`zh-CN` / `en`）+ `x-default` 指向中文版。
- **不做 IP / 浏览器语言的自动跳转**。Google 明确提示自动重定向会妨碍抓取、也可能让用户看不到另一种语言；改为顶部语言切换按钮。

**SEO 设计**

- 所有卡片和工具页都是**构建期生成的静态 HTML**，不依赖 JS 渲染，爬虫直接可读。
- 首页有 570 条指向工具页的内链，工具页有「同类工具」反向内链，形成内链网。
- 每页带 `canonical`、OG / Twitter 卡片、`theme-color`。
- 结构化数据：首页用 `WebSite` + `ItemList`，工具页用 `SoftwareApplication` + `BreadcrumbList`。
- **分类落地页**：`/category/analytics/` 这类页面面向「开源数据分析工具」这类关键词，
  从首页页脚、工具页面包屑、分类总览三处获得内链。
- **英文页标签走映射**：`i18n.json` 里的 `tagTranslations`（325 条，覆盖率 100%）；
  搜索索引同时包含原文和译文标签，中英文都能搜到。
- `sitemap.xml` 自动生成，含 `xhtml:link` 多语言标注，1512 个 URL 条目。

## 目录结构

**仓库根目录就是部署产物**——Hostinger 的 Git 部署只做 `git pull`、不跑构建，
所以能直接访问的文件必须在根目录。

    工具集合站/                    ← git 仓库根 = 网站根目录
    ├─ index.html                  ← 中文首页（生成）
    ├─ en/index.html               ← 英文首页（生成）
    ├─ tool/<id>/index.html        ← 570 个中文工具页（生成）
    ├─ category/<key>/index.html   ← 50 个中文分类页（生成）
    ├─ categories/index.html       ← 分类总览（生成）
    ├─ en/tool/<id>/index.html     ← 570 个英文工具页（生成）
    ├─ en/category/<key>/index.html← 50 个英文分类页（生成）
    ├─ en/categories/index.html    ← 英文分类总览（生成）
    ├─ compare/<a>-vs-<b>/index.html ← 111 组对比页（生成）
    ├─ online/                     ← 站内在线工具（生成）
    │   ├─ index.html              ← 工具索引
    │   └─ <app>/index.html        ← 20 个工具页
    ├─ about/ · disclaimer/        ← 静态内容页（生成）
    ├─ sitemap.xml                 ← 生成
    ├─ robots.txt                  ← 生成
    ├─ 404.html                    ← 手写
    ├─ app.js                      ← 前端：过滤静态 DOM（零依赖）
    ├─ online.js                   ← 站内在线工具的实现（零依赖）
    ├─ styles.css
    ├─ og.png                      ← 1200×630 分享卡片
    ├─ data/
    │   ├─ tools.json              ← 数据源（构建输入）
    │   └─ readmes.json            ← README 摘要缓存
    ├─ scripts/
    │   ├─ tools.source.json       ← 人工维护的源数据
    │   ├─ i18n.json               ← 中英文界面文案 + 325 条标签翻译
    │   ├─ pages.json              ← 「关于」「免责声明」正文（中英）
    │   ├─ aliases.json            ← 搜索别名（中文俗称、简称）
    │   ├─ sync-github.mjs         ← 增量同步星数等元数据
    │   ├─ fetch-readmes.mjs       ← 抓取并提取 README 首段摘要
    │   ├─ check-links.mjs         ← 死链检测
    │   ├─ apps.json               ← 站内工具的定义与界面
    │   ├─ audit-cloud.mjs         ← 审计哪些项目有官方云版
    │   ├─ build-pages.mjs         ← 页面生成器
    │   ├─ serve.mjs               ← 本地预览服务器
    │   ├─ smoke-test.mjs          ← 站点结构冒烟测试（34 项）
    │   └─ app-smoke.mjs           ← 在线工具逻辑测试（25 项）
    ├─ .github/workflows/sync-stars.yml
    ├─ 01-GitHub开源工具清单.md
    ├─ 02-出海辅助工具清单.md
    └─ README.md

> ⚠️ `index.html`、`en/`、`tool/`、`sitemap.xml`、`robots.txt` 都是**生成文件**，
> 不要手改——下次构建会被覆盖。要改内容请改 `scripts/` 或 `data/tools.json`。

## 本地预览

    cd 工具集合站
    node scripts/serve.mjs 5188
    # 打开 http://127.0.0.1:5188

> **不能直接双击 index.html 打开。** 页面用相对路径加载 `/styles.css`、`/app.js`，
> 且 `fetch` 在 `file://` 下会被拦截，必须通过 HTTP 访问。

## 部署（GitHub + Hostinger Git 部署）

仓库：`https://github.com/night-of-sen/lfun-tool`

**1. 在 Hostinger 建子域名**

hPanel → **Websites** → **Add Website** → **Subdomain**：

- 子域名填 `tools`，主域名选 `lfun.cloud`
- 记下它分配的 document root，例如 `domains/tools.lfun.cloud/public_html`
  （老版 Hostinger 可能是 `public_html/tools`）

**2. 用 Git 部署到那个目录**

hPanel → **Advanced** → **GIT** → Create a new repository：

| 字段 | 填什么 |
|---|---|
| Repository | `https://github.com/night-of-sen/lfun-tool.git` |
| Branch | `main` |
| Install path | 上一步那个 document root |

创建后点 **Deploy**。如果 hPanel 有自动部署开关，打开它，以后 `git push` 即上线。

**3. 给子域名装 SSL**

hPanel → **SSL** → 给 `tools.lfun.cloud` 装 Let's Encrypt → 开 Force HTTPS。

**4. 换域名时要同步改的地方**

`scripts/build-pages.mjs` 里的 `DOMAIN` 默认值，或直接传参
`node scripts/build-pages.mjs https://新域名`。重新生成后这些会一起更新：
`canonical`、`hreflang`、`og:url`、`sitemap.xml`、`robots.txt`，
以及 **`og.png` 图上印的域名文字**（那张图是脚本画的，要重跑生成命令）。

## 数据与页面更新流程

**全自动**：`.github/workflows/sync-stars.yml` 每周一自动跑
「同步星数 → 重建页面 → 跑测试 → 提交」，你什么都不用做。

**手动更新**：

    node scripts/sync-github.mjs     # 1. 拉取最新星数等元数据
    node scripts/build-pages.mjs     # 2. 重新生成 496 个页面
    node scripts/smoke-test.mjs      # 3. 验证
    # 4. git commit && git push

关于同步脚本：

    node scripts/sync-github.mjs            # 增量：只请求过期或缺失的条目
    node scripts/sync-github.mjs --fresh=1  # 只跳过 1 小时内同步过的
    node scripts/sync-github.mjs --force    # 强制全部重拉
    node scripts/sync-github.mjs --only=a,b # 只同步指定 id（新增条目省配额）

- 未认证时 GitHub API 限额为 **core 60 次/小时**，而项目有 570 个——
  一次全量重拉必然打满配额。所以默认是**增量**的，`syncedAt` 12 小时内的条目直接跳过。
- 请求失败的条目会沿用上次数据并保留上次的 `syncOk`，不会把已有数据误标成"缺失"。
- 本地想避免限流：`$env:GITHUB_TOKEN = "ghp_xxx"` 后再跑。

## 内容增强与巡检

    node scripts/fetch-readmes.mjs            # 抓取 README 摘要（增量）
    node scripts/fetch-readmes.mjs 6 --force  # 全部重抓
    node scripts/check-links.mjs 10           # 死链检测

- README 摘要走 `raw.githubusercontent.com`，**不消耗 GitHub API 配额**；
  该域名在部分网络（如中国大陆）会被完全阻断，脚本启动时会自动探测并改用 jsDelivr CDN。
- 摘要只接受**以项目名开头**的段落（"X is a …" 这种）。更宽松的规则会放进
  "Optional: set APIURL…" 这类配置说明，所以宁可少也要准。当前 380/570 有摘要。
- 工具页的视觉图：**有官网地址就用 WordPress mShots 截真实网页**，没有则回退到 GitHub
  自动生成的仓库卡片（1200×600，零维护）。
- **搜索别名**：`scripts/aliases.json` 给 499 个工具配了 822 条中文俗称和简称，
  让「在线白板」「网易云播放器」这类词也能搜到。
- **对比页**：每个分类取星数前 3 两两配对，但**必须共享至少一个标签或使用方式**才生成，
  避免出现跨用途的荒谬配对。
- 死链检测同时检查官网和 GitHub 仓库，结果分 ok / dead / blocked / error 四类；
  报告写到 `data/link-report.json`（临时产物，已加入 .gitignore）。

## 测试

    node scripts/smoke-test.mjs      # 站点结构与 SEO（34 项）
    node scripts/app-smoke.mjs       # 在线工具的逻辑（25 项）

33 项断言，覆盖：静态 HTML 的 SEO 要素（hreflang / canonical / JSON-LD / 内链数 /
按用途自动选按钮）、场景切换、三层筛选联动、搜索、空状态、排序、主题。

## 新增一个工具

编辑 `scripts/tools.source.json`，加一条后跑同步 + 重建：

    {
      "id": "unique-id",
      "name": "显示名称",
      "repo": "owner/repo",
      "homepage": null,
      "category": "dev",
      "usage": ["selfhost"],
      "platforms": [],
      "caution": "",
      "scene": "overseas",
      "desc": "一句中文说明，讲清楚能干什么",
      "tags": ["标签1", "标签2"],
      "seed": { "stars": 0, "language": "", "license": "" }
    }

| 字段 | 取值 |
|---|---|
| `scene` | 留空 = 通用工具 · `overseas` = 出海辅助 |
| `usage` | `online` `selfhost` `desktop` `cli` `extension` `lib`（可多个） |
| `platforms` | `windows` `macos` `linux` `android` `ios`（Web 服务留空数组） |
| `homepage` | `null` = 从 GitHub 自动读取；`""` = 确认没有；其他 = 写死 |
| `caution` | 留空或填 `隐私` / `版权` / `系统修改` / `许可`，显示橙色提醒角标 |
| `archived` | 可选。仓库已归档但仍有参考价值时填 `true`，显示「已归档」角标 |
| `tags` | **必须是数组**，不是逗号分隔的字符串 |
| `desc` | 中文描述；英文页优先用 GitHub 返回的 `descEn` |

### 分类取值

**出海辅助新增「推广获客」（`promo`）**：SEO 分析、外链提交、社媒分发、线索外联工具，见
`03-出海推广与SEO渠道.md`。

**通用工具（14 类）**

| key | 显示名 | key | 显示名 |
|---|---|---|---|
| `diagram` | 白板绘图 | `system` | 系统增强 |
| `image` | 图片图形 | `download` | 下载工具 |
| `doc` | 文档 PDF | `capture` | 截图录屏 |
| `dev` | 开发工具 | `media` | 音乐媒体 |
| `design` | 设计 | `writing` | 写作笔记 |
| `utility` | 效率工具 | `filesearch` | 搜索与文件 |
| `fun` | 有趣好玩 | `security` | 安全隐私 |

**出海辅助（13 类）**

| key | 显示名 | key | 显示名 |
|---|---|---|---|
| `analytics` | 数据分析 | `crm` | CRM 销售 |
| `experiment` | A/B 实验 | `auth` | 认证授权 |
| `i18n` | 多语言本地化 | `compliance` | 合规签署 |
| `payment` | 支付计费 | `sitesearch` | 站内搜索 |
| `commerce` | 电商建站 | `finance` | 财务发票 |
| `email` | 邮件触达 | `support` | 客服工单 |
| `notify` | 通知短信 | | |

## 使用门槛分级

导航站最大的问题是「点进去才发现要自己部署」。所以每个项目都会算出一个门槛等级，
在卡片和工具页上直接标出来：

| 等级 | 判定依据 | 数量 | 含义 |
|---|---|---|---|
| 🟢 `ready` | 有官网在线版 | **55** | 打开就能用，不用装也不用部署 |
| 🟡 `cloud` | 厂商提供官方云版 | **18** | 注册后即可使用，不用自己部署；免费额度或试用期以厂商为准 |
| 🔵 `onecmd` | 自托管 + README 里有可执行命令 | **6** | 需要服务器，但能复制粘贴一条命令跑起来 |
| 🟠 `setup` | 自托管但 README 里没有现成命令 | **17** | 需要服务器 + 配数据库/环境变量/域名，得看官方文档 |
| ⚪ `install` | 桌面应用 / 命令行 | **50** | 下载安装到本机，不需要服务器 |
| 📦 `library` | 开发库 | **10** | 不是独立应用，要写代码调用 |

**不需要自己运维的合计 123 个**（ready 55 + cloud 18 + install 50）。

判定逻辑在 `scripts/build-pages.mjs` 的 `deployTier()`，全部由数据推导，不是人工标注。

**关于 `onecmd` 只有 6 个**：不是提取器不行，而是那些项目的 README 里
**本来就没有可直接执行的部署命令**——它们把安装说明放在外部文档站。这一点值得知道：
这类项目对非运维用户来说，确实不友好。

**`cloud` 档是怎么来的**：用 `scripts/audit-cloud.mjs` 抓每个「纯自托管」项目的官网，
找 `cloud.` / `app.` 子域和 signup / pricing 类链接，再人工核实。
41 个里查出 18 个确实有官方托管版，5 个是误报（链接指向 GitHub 注册页、图片地址、
案例页、许可证试用页等）。

有命令的工具页会渲染一个带「复制」按钮的代码块，命令从 README 的代码围栏里抽取
（优先取 `docker run` 这类单行命令，其次取 `docker-compose.yml` 内容）。

## 设计说明

- **零依赖**：不用 npm install，不用框架，不用打包器。Node 只用来跑脚本。
- **静态优先**：内容全部构建期生成，前端 JS 只负责筛选/排序/收藏，不做数据渲染。
- **三层筛选**：场景 → 使用方式 → 分类，分类列表跟着前两层实时收窄，切换上层自动重置下层。
- **按钮按用途自动变化**：

  | 使用方式 | 主按钮 | 说明 |
  |---|---|---|
  | 在线即用 | 在线使用 → 官网 | 无官网时显示灰色"暂无在线版" |
  | 可自托管 | 部署 → 官网或 releases | |
  | 扩展插件 | 获取扩展 → 官网或 releases | |
  | 桌面 / 命令行 | 下载 → releases | 有官网时额外显示"官网" |
  | 开发库 | 文档 → 官网或仓库 | |

- **homepage 三态**：`null` 自动读、`""` 确认没有、其他写死。
- **不手写星数**：所有星数来自 GitHub API。

## 贡献

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。三种方式：

- **提 Issue**：用仓库里的表单推荐新工具或报告问题
- **提 PR**：改 `scripts/tools.source.json` 加一条，跑构建和测试，提交
- **跑巡检**：`node scripts/check-links.mjs 10`

每月 1 日 CI 会自动巡检死链，把结果汇总到一个标题为「死链巡检报告」的 Issue 里。

## 按键

| 按键 | 作用 |
|---|---|
| `/` | 聚焦搜索框 |
| `Esc` | 清空搜索并失焦 |
| 点 ☆ | 收藏（存 localStorage，不需要登录） |

## 已知取舍

- **搜索是子串匹配**：搜 "OCR" 会匹配到 EspoCRM（名字里含 ocr），属于预期行为。
- **首页 HTML 约 968 KB**：570 张卡片全在 HTML 里是为了 SEO。开 gzip 后约 145 KB。
- **出海收款和海外短信没有像样的开源替代**：Stripe / Paddle / Twilio 都是闭源的，
  Hyperswitch 只是编排层。详见 `02-出海辅助工具清单.md`。
- **自建邮件服务器慎用**：开源自建发信 IP 的信誉极难维护，生产环境建议用
  SendGrid / Postmark / Resend / SES。
- **站点里收录的工具 ≠ 能放在共享主机上**：Chatwoot、n8n、Immich 这类需要 VPS 跑 Docker。

## 后续

- 分类落地页（`/category/analytics/` 这类，可再吃一批长尾词）
- 工具页补充截图与 README 摘要
- 继续补：法律合规工具、GIS 与地图、无障碍、教育向项目
