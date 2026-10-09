<?php
// GET /api/submit-status.php?code=XXXXXXXXXXXX[&lang=zh|en] —— 按查询码查收录提交状态（PRD 模块四）
// 渲染一个极简结果页（复用全站 styles.css），不暴露除状态之外的任何数据。
declare(strict_types=1);
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/util.php';

$code = strtoupper(trim((string) ($_GET['code'] ?? '')));
$lang = (($_GET['lang'] ?? '') === 'zh') ? 'zh' : 'en';

$row = null;
if (preg_match('/^[A-Z0-9]{12}$/', $code)) {
  try {
    $st = db()->prepare('SELECT repo_url, tier, contact_email, status, sla_deadline, created_at FROM submissions WHERE query_code = ?');
    $st->execute([$code]);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    if ($r) $row = $r;
  } catch (Throwable $e) { $row = null; }
}

$zh = $lang === 'zh';
$L = $zh ? [
  'title' => '提交状态查询', 'notfound' => '没有找到这个查询码，请检查是否输入正确。',
  'repo' => '仓库', 'tier' => '档位', 'status' => '状态', 'sla' => 'SLA 截止', 'created' => '提交时间',
  'back' => '← 返回提交页', 'code' => '查询码',
  'tier_free' => '免费提交', 'tier_fast' => '快速审核 ($29)', 'tier_featured' => '加精推荐 ($49)',
  'st_pending' => '审核中', 'st_paid_pending' => '等待付款确认', 'st_approved' => '已通过', 'st_rejected' => '未通过',
  'sla_note' => '付费档自站长确认收款起 48 小时内审核。',
] : [
  'title' => 'Submission status', 'notfound' => 'No submission found for this code. Please check and try again.',
  'repo' => 'Repository', 'tier' => 'Tier', 'status' => 'Status', 'sla' => 'SLA deadline', 'created' => 'Submitted at',
  'back' => '← Back to submit page', 'code' => 'Query code',
  'tier_free' => 'Free', 'tier_fast' => 'Fast review ($29)', 'tier_featured' => 'Featured ($49)',
  'st_pending' => 'Under review', 'st_paid_pending' => 'Awaiting payment confirmation', 'st_approved' => 'Approved', 'st_rejected' => 'Not approved',
  'sla_note' => 'Paid tiers are reviewed within 48h after payment is confirmed.',
];
$home = $zh ? '/zh/' : '/';
$submitPath = $zh ? '/zh/submit/' : '/submit/';

header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html>
<html lang="<?= $zh ? 'zh-CN' : 'en' ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title><?= h($L['title']) ?> · tools.lfun.cloud</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<div class="app-frame">
<main class="wrap" style="max-width:640px;padding:48px 16px;">
  <p class="crumbs"><a href="<?= h($home) ?>">tools.lfun.cloud</a><span>/</span><strong><?= h($L['title']) ?></strong></p>
  <h1><?= h($L['title']) ?></h1>
  <?php if ($row === null): ?>
    <p><?= h($L['notfound']) ?></p>
  <?php else: ?>
    <table class="price-table"><tbody>
      <tr><td><?= h($L['code']) ?></td><td><code><?= h($code) ?></code></td></tr>
      <tr><td><?= h($L['repo']) ?></td><td style="word-break:break-all"><?= h($row['repo_url']) ?></td></tr>
      <tr><td><?= h($L['tier']) ?></td><td><?= h($L['tier_' . $row['tier']] ?? $row['tier']) ?></td></tr>
      <tr><td><?= h($L['status']) ?></td><td><strong><?= h($L['st_' . $row['status']] ?? $row['status']) ?></strong></td></tr>
      <?php if (!empty($row['sla_deadline'])): ?>
      <tr><td><?= h($L['sla']) ?></td><td><?= h($row['sla_deadline']) ?><br><span class="muted"><?= h($L['sla_note']) ?></span></td></tr>
      <?php endif; ?>
      <tr><td><?= h($L['created']) ?></td><td class="muted"><?= h((string) $row['created_at']) ?></td></tr>
    </tbody></table>
  <?php endif; ?>
  <p><a href="<?= h($submitPath) ?>"><?= h($L['back']) ?></a></p>
</main>
</div>
</body>
</html>
