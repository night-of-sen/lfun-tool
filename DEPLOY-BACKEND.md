# 后端部署步骤（PHP + MySQL）

前台是静态站，Git 部署即可；**后端需要一次性手工配置**，因为凭据不能进仓库。
全程大约 10 分钟。按顺序做，每步都有「怎么确认成功」。

---

## 步骤 0 · 推送待提交的改动

仓库里还有 2 个文件没推（`.htaccess` 的部署修复 + 测试断言）：

```
C:\Users\52978\Documents\DSH\工具集合站\push-to-github.cmd
```

**怎么确认**：`git status` 干净，且 `https://tools.lfun.cloud/admin/` 不再是 403（会跳转到登录页）。

---

## 步骤 1 · 创建 MySQL 数据库

hPanel → **Websites → tools.lfun.cloud → Databases → Management** → 「Create a New MySQL Database And Database User」。

| 字段 | 填什么 | 说明 |
|---|---|---|
| MySQL database name | 后缀填 `tools` | 完整名会变成 `u951437233_tools` |
| MySQL username | 后缀填 `tools` | **不要填邮箱**，MySQL 用户名不允许 `@` 和 `.`，且后缀最多 14 字符 |
| Password | 自己设 | 必须 ≥8 位，含大小写字母和数字 |

点 **Create**。

**三个注意点**

1. **不要复用已有的 `u951437233_duM6M`**（234 MB）——那是占卜站的库，混建表会乱。
2. **不需要 Assign 到网站**。PHP 靠凭据连库，不靠面板绑定，「Website」列空着没关系。
3. 把**库名、用户名、密码**记下来（下一步要用），但**不要发到聊天里**。

---

## 步骤 2 · 在站点根目录建 config.local.php

hPanel → **Files → File Manager** → 进入站点根目录（**与 `index.html` 同级**，Hostinger 上通常是 `public_html`）→ 右键 **New File** → 命名 `config.local.php` → 编辑内容：

```php
<?php
return [
  // 把 tools 换成你步骤 1 里用的后缀
  'db_dsn'  => 'mysql:host=localhost;dbname=u951437233_tools;charset=utf8mb4',
  'db_user' => 'u951437233_tools',
  'db_pass' => '步骤1设的密码',

  'site_url' => 'https://tools.lfun.cloud',

  'admin_user' => 'admin',
  'admin_pass_hash' => '',   // 下一步生成后填进来

  'mail_driver' => 'mail',
  'mail_from'   => 'noreply@tools.lfun.cloud',
  'notify_to'   => '你的收件邮箱',

  'selftest_token' => '换成你自己的随机字符串',
];
```

**怎么确认**：文件保存后，在浏览器打开 `https://tools.lfun.cloud/config.local.php` 应当显示 **404**（已被 `.htaccess` 拦截）。看到内容就说明拦截失效，先别继续。

---

## 步骤 3 · 生成后台密码散列

两种方式任选：

**方式 A（有 SSH 的话最简单）**

```bash
php -r "echo password_hash('你要设的后台密码', PASSWORD_DEFAULT);"
```

**方式 B（用文件管理器）**

1. 站点根目录新建临时文件 `hash.php`，内容：
   ```php
   <?php echo password_hash('你要设的后台密码', PASSWORD_DEFAULT);
   ```
2. 浏览器打开 `https://tools.lfun.cloud/hash.php`，复制输出（形如 `$2y$10$...`）
3. **立刻删除 `hash.php`**（重要：不删等于把密码散列公开，别人可以离线爆破）

把复制到的散列填进 `config.local.php` 的 `admin_pass_hash`。

---

## 步骤 4 · 跑自检（会自动建表）

浏览器打开：

```
https://tools.lfun.cloud/api/selftest.php?token=你在config里设的token
```

首次访问会自动创建 6 张表，不用手工导 SQL。期望看到：

```json
{
  "ok": true,
  "php": "8.x",
  "checks": { "php>=8.0": true, "ext:pdo": true, "ext:pdo_mysql": true, ... },
  "db_configured": true,
  "schema_ok": true,
  "tables_ensured": ["partner_inquiries","clicks","sponsorships","submissions","affiliates","subscribers"],
  "row_counts": { ... }
}
```

想顺便试邮件通道，加 `&mail=1`（会给 `notify_to` 发一封测试信）。

**怎么确认**：`"ok": true` 且 `"schema_ok": true`。

---

## 步骤 5 · 登录后台

`https://tools.lfun.cloud/admin/` → 用 `admin_user` 和步骤 3 设的密码登录。

后台能改的东西：

| 分区 | 作用 |
|---|---|
| 概览 | 点击总数、生效赞助、活跃订阅、合作咨询、点击 Top 20 |
| 赞助排期 | 录入首页/分类页赞助位，到期自动下架，时段冲突会提示 |
| 联盟链接 | ✏️ **改完即时生效，不需要重新部署**；有联盟链接的工具，卡片主按钮会自动走 `/go/` 并带 `rel="sponsored nofollow"` |
| 合作咨询 | `/partner` 表单提交的线索 |
| 提交队列 | 付费收录队列（模块四的 `/submit` 页还没做，表已就绪） |
| 订阅者 | Newsletter 订阅数（模块六的入口还没做） |

---

## 步骤 6 · 让 AI 远程验证

把 `selftest_token` 告诉我，我拉一次自检接口，逐项确认 PHP 版本、扩展、数据库连通、建表结果、邮件通道。

> token 只用于这个只读自检接口，验证完你可以随时改掉它。

---

## 常见问题

**`selftest` 返回 `db_error`**
- 库名/用户名/密码写错 → 逐字核对步骤 1 生成的那三个值
- 忘了加 `charset=utf8mb4` → 中文会乱码
- host 不是 `localhost` → 极少数情况 Hostinger 会给别的 host，以面板显示为准

**`config.local.php` 打开显示 404 但自检说「数据库未配置」**
- 文件放错位置了。它必须与 `index.html` **同级**，不是放在 `api/` 里

**`/admin/` 仍然 403**
- 步骤 0 没推成功。确认 `.htaccess` 里有 `DirectoryIndex index.html index.php`

**赞助位不显示**
- 只有 `status=active` 且当天在起止区间内的排期才展示；首页最多 3 个、每个分类最多 1 个
- 先确认后台「概览」里能看到记录，再到首页刷新看

**邮件没收到**
- PHP `mail()` 在共享主机上能发但容易进垃圾箱；先查垃圾邮件
- 长期建议换 Resend：填 `mail_driver => 'resend'` 和 `resend_key` 即可，代码已支持

---

## 安全清单（部署后自查）

- [ ] `https://tools.lfun.cloud/config.local.php` → 404
- [ ] `https://tools.lfun.cloud/api/lib/db.php` → 404
- [ ] `https://tools.lfun.cloud/config.local.example.php` → 404
- [ ] `hash.php` 已删除
- [ ] `/api/selftest.php` 不带 token → `{"ok":false,"error":"forbidden"}`
- [ ] `admin_pass_hash` 已设置（自检里 `checks.admin_hash_set` 为 true）
