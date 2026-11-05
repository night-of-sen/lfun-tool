<?php
// GET /api/approved-tools.php —— 已通过收录的公开清单（供每日构建自动上架）
// 只返回收录展示用的公开字段，不含联系邮箱等隐私字段；构建脚本每天拉一次。
// GitHub 仓库走原有仓库拉取分支；无仓库的网页提交由 work_url 直接上架（见 sync-github.mjs）。
declare(strict_types=1);
require_once __DIR__ . '/lib/db.php';

header('Content-Type: application/json; charset=utf-8');
try {
  $st = db()->prepare("SELECT repo_url, tier, tool_name, work_url, oneliner, tags, screenshot_url, video_url, price_model, form FROM submissions WHERE status = 'approved' ORDER BY id ASC");
  $st->execute();
  $items = [];
  foreach ($st->fetchAll() as $r) {
    $tags = array_values(array_filter(array_map('trim', explode(',', (string) ($r['tags'] ?? '')))));
    $items[] = [
      'repo' => $r['repo_url'],
      'tier' => $r['tier'],
      'name' => $r['tool_name'],
      'work_url' => $r['work_url'],
      'oneliner' => $r['oneliner'],
      'tags' => $tags,
      'screenshot_url' => $r['screenshot_url'],
      'video_url' => $r['video_url'],
      'price_model' => $r['price_model'],
      'form' => $r['form'],
    ];
  }
  echo json_encode(['items' => $items], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['items' => []], JSON_UNESCAPED_UNICODE);
}
