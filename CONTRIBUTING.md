# 贡献指南

感谢愿意帮忙。这个站的**数据源就是仓库里的一个 JSON 文件**，所以改起来没有门槛——你甚至不需要装任何东西。

## 三种参与方式

| 方式 | 适合 | 怎么做 |
|---|---|---|
| **提 Issue** | 只是想推荐一个工具，或报告链接失效 | 用 [Issue 表单](https://github.com/night-of-sen/lfun-tool/issues/new/choose) |
| **提 Pull Request** | 你愿意直接改数据 | 见下面的步骤 |
| **报告问题** | 描述有误、分类不对、页面显示异常 | 开 Issue 说明即可 |

## 收录标准

一个项目要进清单，需要同时满足：

1. **开源**，且有明确的许可证
2. **有实际可用的功能**——不是教程、不是纯文档、不是仅供学习的示例代码
3. **仍在维护**，或者有明确且稳定的用途
4. 你能用一句中文说清楚它是干什么的

已经在清单里的项目如果被归档或长期停更，我们会打上「已归档」标记，但不会直接删除。

## 用 PR 添加新工具

**第一步：改 `scripts/tools.source.json`**

在 `items` 数组里加一条：

```json
{
  "id": "excalidraw",
  "name": "Excalidraw",
  "repo": "excalidraw/excalidraw",
  "homepage": null,
  "category": "diagram",
  "usage": ["online"],
  "platforms": [],
  "caution": "",
  "scene": "",
  "desc": "手绘风格在线白板，画流程图、原型、架构图，可多人协作",
  "tags": ["白板", "流程图", "协作"],
  "seed": { "stars": 0, "language": "", "license": "" }
}
```

字段说明：

| 字段 | 取值 |
|---|---|
| `id` | 唯一标识，小写英文，会成为工具页地址 `/tool/<id>/` |
| `repo` | `owner/repo`，必须真实存在 |
| `homepage` | `null` = 从 GitHub 自动读取；`""` = 确认没有官网；其他 = 写死 |
| `category` | 见下方分类表 |
| `usage` | `online` `selfhost` `desktop` `cli` `extension` `lib`，可多选 |
| `platforms` | `windows` `macos` `linux` `android` `ios`；Web 服务留空数组 |
| `caution` | 留空，或填 `隐私` / `版权` / `系统修改` / `许可`（会显示橙色提醒角标） |
| `archived` | 可选。仓库已归档但仍有参考价值时填 `true`，页面会显示「已归档」角标 |
| `scene` | 留空 = 通用工具；`overseas` = 出海辅助 |
| `desc` | **一句中文**，说清楚能干什么。不要照抄 README |
| `tags` | 数组，不是逗号分隔的字符串 |
| `seed` | 星数等占位值，留 0 即可，同步脚本会自动填 |

**分类取值**

通用工具：`diagram` `image` `doc` `dev` `design` `utility` `fun` `system` `download` `capture` `media` `writing` `filesearch` `security` `watermark` `video` `social` `ai`

出海辅助：`analytics` `experiment` `i18n` `payment` `commerce` `email` `notify` `support` `crm` `auth` `compliance` `sitesearch` `finance` `promo`

**第二步：如果有中文俗称，同步加别名**

在 `scripts/aliases.json` 加一条，让人搜得到：

```json
{
  "excalidraw": ["在线白板", "手绘白板"]
}
```

**第三步：本地验证**

```bash
node scripts/sync-github.mjs      # 拉取星数等元数据（可选，需要网络）
node scripts/build-pages.mjs      # 重新生成页面
node scripts/smoke-test.mjs       # 跑测试，必须全绿
```

**第四步：提交**

```bash
git add -A
git commit -m "feat: 新增 <工具名>"
git push
```

## 不需要你做的事

- 不用手动填星数、许可证、更新时间——同步脚本会处理
- 不用自己跑 README 摘要抓取——CI 会处理
- 不用改 `index.html`、`tool/`、`category/` 这些生成文件——下次构建会覆盖

## 报告死链

每月 1 日会自动巡检一次，结果汇总到一个标题为「死链巡检报告」的 Issue。
你也可以随时手动跑：

```bash
node scripts/check-links.mjs 10
```

报告会写到 `data/link-report.json`。修复方式是改 `scripts/tools.source.json` 里对应条目的
`homepage` 字段，然后重跑构建。

## 行为准则

保持友善，就事论事。推荐项目时请说明**你和它的关系**——如果作者是你自己，直说就好，
我们不会因此拒绝，但会看得更仔细一些。
