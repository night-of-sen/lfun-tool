<?php
// GET /go/<tool_id> → 302 跳转并记录点击（PRD 模块二）
// 目标解析顺序：数据库（后台可改，即时生效）→ 构建期生成的静态表 → 官网
// 跳转必须快：日志写入失败不能影响跳转（PRD §10：P95 < 300ms）
declare(strict_types=1);
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/util.php';

$id = isset($_GET['id']) ? preg_replace('/[^a-z0-9._-]/i', '', (string) $_GET['id']) : '';
$target = '';
$type = 'affiliate';

if ($id !== '') {
  try {
    $st = db()->prepare('SELECT url, enabled FROM affiliates WHERE tool_id = ? LIMIT 1');
    $st->execute([$id]);
    $row = $st->fetch();
    if ($row && (int) $row['enabled'] === 1 && $row['url'] !== '') { $target = (string) $row['url']; }
  } catch (Throwable $e) { /* 表还没建或库挂了，退回静态表 */ }
}
if ($target === '') {
  $jsonFile = __DIR__ . '/../go/affiliates.json';
  if (is_file($jsonFile)) {
    $map = json_decode((string) file_get_contents($jsonFile), true);
    if (is_array($map) && isset($map[$id]) && is_string($map[$id])) { $target = $map[$id]; }
  }
}
if ($target === '') {
  // 没有任何联盟配置：回到首页，不要跳去不明地址
  header('Location: /', true, 302);
  exit;
}

// 记录点击（尽力而为）
try {
  if ($id !== '') {
    $st = db()->prepare('INSERT INTO clicks (tool_id, target_type, target_url, referer, user_agent, ip_hash) VALUES (?,?,?,?,?,?)');
    $st->execute([
      $id, $type,
      mb_substr($target, 0, 500),
      mb_substr((string) ($_SERVER['HTTP_REFERER'] ?? ''), 0, 500),
      mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300),
      client_ip_hash(),
    ]);
  }
} catch (Throwable $e) { /* 忽略：跳转优先 */ }

header('X-Robots-Tag: noindex, nofollow', true);
header('Cache-Control: no-store');
header('Location: ' . $target, true, 302);
exit;
