# 出海推广与 SEO 渠道清单

> 面向：把产品/网站推到海外，需要外链、新闻曝光、RSS 分发和 SEO 工具。
> 星数为 GitHub API 实时抓取。

---

## 0. 先讲一个现实判断

**外链发布和新闻发布，基本上没有开源方案。** 这不是我没找到，是这两件事的性质决定的：

| 需求 | 本质 | 开源能帮什么 |
|---|---|---|
| 外链 | 争取别人主动给你链接 = 关系 + 内容质量 | 只能帮你**找目标、分析对手、自动化触达**，链接本身得谈来 |
| 新闻发布 | 付费接入媒体分发网络 = 买卖 | 开源做不了媒体网络，只能帮你**整理名单、投递记者请求** |

所以下面的清单分两类：**开源工具**（能自己跑）和**商业服务**（要花钱，但没有替代）。

---

## 1. 海外外链发布

### 1.1 目录/发布站提交清单 ⭐ 最高性价比

这两个仓库是最有价值的发现，直接给你带优先级和 SEO 指标的名单：

| 项目 | ★ | 内容 |
|---|---|---|
| **alvinunreal/awesome-submitlist** | 158★ | **339 个渠道**：120 目录 + 13 发布站 + 37 newsletter + 25 社区 + 44 subreddit + 27 marketplace + **73 citations**。每条标注 Domain Rating、月流量、免费/付费、**dofollow 还是 nofollow** |
| **mezmer90/saas-directories** | 未抓取 | 约 **920 个目录**，带提交优先级、DR、链接类型、定价，并分了三阶段推进计划（Phase 1 约 30 个 → Phase 2 约 120 个 → Phase 3 约 770 个） |
| theshubh77/awesome-saas-directories | — | 同类清单，偏 SaaS |
| **s87343472/backlink-pilot** | 360★ | 自动化外链提交工具包，面向独立开发者 |
| flaqai/backlink_skills | 729★ | 免费站点提交清单（AI agent skill 形式） |

**读这些清单的关键**：看 `Dofollow` 还是 `Nofollow`。多数目录只给 nofollow，有流量价值但没有 SEO 权重。真正值钱的是那批 dofollow 且 DR 高的。

### 1.2 找目标与分析

| 项目 | ★ | 用途 |
|---|---|---|
| every-app/open-seo | 20058★ | Semrush / Ahrefs 的开源替代，关键词 + 竞品分析 |
| eliasdabbas/advertools | 1462★ | 营销数据分析工具集 |
| karust/openserp | 1411★ | 自托管 SERP API，可批量查排名 |
| crawlseo/crawlseo | 600★ | SEO 监控：GSC + 站点爬虫 + Core Web Vitals |
| JustinBeckwith/linkinator | 1264★ | 死链检查（**断链建设**用得上） |

**断链建设**是少数可自动化的外链手段：找到目标站上的死链 → 你有同类内容 → 联系他们换成你的链接。linkinator 用来批量找死链。

### 1.3 邮件触达（外联）

| 项目 | ★ | 用途 |
|---|---|---|
| growchief/growchief | 3475★ | 社媒自动化外联 |
| eracle/OpenOutreach | 3067★ | 开源 B2B 线索生成 AI agent |
| builderz-labs/marketing-dashboard | 469★ | 本地优先的营销操作台 |

**商业工具**（这块开源确实弱）：Hunter.io（找邮箱）、Snov.io、Instantly、lemlist、Pitchbox、Respona、BuzzStream。

### 1.4 客座投稿 / 记者请求

- **Qwoted** — 记者发布需求，你回应，被采用可获媒体引用和外链
- **Featured** — 同上，偏商业媒体
- **Help a B2B Writer** — 免费，B2B 记者需求
- **SourceBottle** — 免费，覆盖面广
- **Muck Rack** — 记者数据库（付费，贵）

---

## 2. RSS 群发 / 自动分发

### 2.1 开源（可自托管）

| 项目 | ★ | 用途 |
|---|---|---|
| brightbeanxyz/brightbean-studio | 2361★ | 自托管社媒管理：排期、发布、跨平台 |
| gitroomhq/postiz | — | 开源社媒排期工具，支持 RSS 接入（主流选择） |
| trypostit/trypost | 640★ | 开源社媒排期 |
| getopenpost/openpost | 603★ | 内容创作 + 排期 + 追踪 |
| Anil-matcha/Free-AI-Social-Media-Scheduler | 518★ | 可自托管的免费排期替代 |
| RSSHub | 46.3k★ | 把任意网站变成 RSS（在你的清单里已有） |
| n8n | 205.6k★ | RSS 触发器 + 任意动作，最灵活 |
| Huginn | 50.0k★ | 自建 agent 监控 RSS 并动作 |

**推荐组合**：`RSSHub 生成订阅源 → n8n 监听 RSS → 分发到各平台`。这套完全自托管，零月费。

### 2.2 商业（更省事）

dlvr.it（有免费额度）、Publer、Metricool、SocialBu、Zapier、Make、IFTTT。
Buffer 已基本放弃 RSS 功能，不用考虑。

---

## 3. SEO 工具

### 3.1 开源

| 项目 | ★ | 用途 |
|---|---|---|
| every-app/open-seo | 20058★ | 关键词研究 + 竞品分析 |
| crawlseo/crawlseo | 600★ | 站内 SEO 监控面板 |
| StanGirard/seo-audits-toolkit | 813★ | SEO + 安全审计，Lighthouse 批量跑 |
| NikolaiT/GoogleScraper | 2886★ | 多搜索引擎抓取 |
| goenning/google-indexing-script | 7707★ | 让 Google 快速收录（48 小时内） |
| aigclink/geolook | 724★ | GEO（面向 AI 搜索的优化） |
| searchsolved/search-solved-public-seo | 412★ | SEO Python 脚本集 |

### 3.2 免费官方工具（必须有，且最权威）

| 工具 | 用途 |
|---|---|
| **Google Search Console** | 索引状态、关键词、外链、Core Web Vitals。**最该先配的** |
| Bing Webmaster Tools | 必应收录（还有 IndexNow 快速提交） |
| Ahrefs Webmaster Tools | 免费版：自己站的外链和关键词 |
| PageSpeed Insights | 性能与 Core Web Vitals |

### 3.3 商业

Ahrefs / Semrush / Moz / SE Ranking（外链和关键词数据库，没有免费替代）；
Screaming Frog（桌面版免费可爬 500 URL）；Sitebulb（技术审计，付费）。

### 3.4 值得读的清单

bmpi-dev/awesome-seo (2796★)、serpapi/awesome-seo-tools (1100★)、sneg55/curatedseotools (471★)

---

## 4. 新闻渠道发布

### 4.1 付费分发服务

| 服务 | 说明 |
|---|---|
| **EIN Presswire** | 性价比最高的付费选项，有行业定向 |
| **PRLog** | **有免费档**，分发网络有限但能拿到基础曝光 |
| **OpenPR** | **免费**，德国背景，欧美可见度尚可 |
| **PR.com** | 有免费档，也有付费升级 |
| **PR Newswire / Business Wire** | 行业标准，**很贵**（单条数百到数千美元），适合融资、重大发布 |
| **Newswire.com / Issuewire** | 中间价位 |
| **PRWeb（Cision）** | 中档，SEO 附加服务要加钱 |

**提醒**：新闻稿分发的链接**大多是 nofollow**，对 SEO 的直接作用很小。它的价值是**品牌曝光 + 被记者看到后主动引用**。别指望靠买新闻稿冲排名。

### 4.2 直接渠道（免费且往往更有效）

| 渠道 | 说明 |
|---|---|
| **Hacker News** | 技术产品冷启动最强，但要真心做技术内容，硬推会被踩 |
| **Product Hunt** | launch 日集中曝光，需要提前 2-4 周准备 |
| **Indie Hackers** | 独立开发者社区，适合分享过程和数据 |
| Reddit | 找对 subreddit（awesome-submitlist 里有 44 个带 promotion 规则说明） |
| 行业 Newsletter | awesome-submitlist 收录了 37 个，带读者数和打开率 |

### 4.3 记者触达

Muck Rack（数据库，贵）、Qwoted、Featured、Prowly、Prezly。

---

## 5. 建议的推进顺序

**阶段 1（这周，零成本）**
1. Google Search Console + Bing Webmaster 提交 sitemap（你的站已有 518 条）
2. 用 open-seo 或 Ahrefs 免费版做一轮关键词和竞品分析
3. 从 awesome-submitlist 里挑 Phase 1 约 30 个目录提交

**阶段 2（接下来 2-4 周）**
4. 批量提交 Phase 2 约 120 个目录（可以写脚本半自动化）
5. 准备 3-5 篇客座投稿内容
6. 搭 RSS 自动分发（RSSHub + n8n 自托管，或 dlvr.it）
7. 注册 Qwoted / Featured，开始回应记者请求

**阶段 3（持续）**
8. 长尾目录（约 770 个）批量打
9. 断链建设：linkinator 找目标站死链 + 邮件触达
10. 有预算再考虑付费 PR

---

## 6. 几个容易踩的坑

1. **别买外链**。PBN、批量垃圾外链现在基本等于自杀，Google 的 SpamBrain 抓得很准。
2. **目录提交的 SEO 价值在持续下降**。多数是 nofollow，主要价值是初始曝光和品牌词覆盖，别当成核心策略。
3. **新闻稿 ≠ SEO**。nofollow 居多，把它当品牌动作而不是排名手段。
4. **内容质量仍然是唯一可规模化的外链来源**。工具能帮你找到 900 个目录，但让别的站长主动链接你，只能靠内容。
5. **RSS 群发要注意平台规则**。多数社媒会限流纯 RSS 搬运，建议加人工改写再发。

---

## 7. 数据说明

- 星数来自 GitHub API 实时抓取；未抓到的标注为「—」或「未抓取」。
- 商业服务的价格未逐项核实（变化快），上表只做定位描述，定价请以官网为准。
- `awesome-submitlist` 和 `saas-directories` 两个清单是这次最有价值的发现，
  建议直接打开看原件，它们带 DR、流量、nofollow 标注，比任何二手总结都准。
