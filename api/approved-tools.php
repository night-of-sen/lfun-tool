<?php
// GET /api/approved-tools.php —— 已通过收录的公开清单（供每日构建自动上架）
// 只返回仓库与档位，不含联系邮箱等隐私字段；构建脚本每天拉一次。
declare(strict_types=1);
require_once __DIR__ . '/lib/db.php';

header('Content-Type: application/json; charset=utf-8');
try {
  $st = db()->prepare("SELECT repo_url, tier FROM submissions WHERE status = 'approved' ORDER BY id ASC");
  $st->execute();
  $items = [];
  foreach ($st->fetchAll() as $r) {
    $items[] = ['repo' => $r['repo_url'], 'tier' => $r['tier']];
  }
  echo json_encode(['items' => $items], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['items' => []], JSON_UNESCAPED_UNICODE);
}
