<?php
// GET /api/stats.php —— 点击统计（需管理员登录，PRD §10）
declare(strict_types=1);
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/util.php';

if (session_status() !== PHP_SESSION_ACTIVE) { session_start(); }
if (empty($_SESSION['lfun_admin'])) { fail('需要鉴权', 401); }

$from = preg_replace('/[^0-9\-]/', '', (string) ($_GET['from'] ?? '')) ?: date('Y-m-d', time() - 29 * 86400);
$to = preg_replace('/[^0-9\-]/', '', (string) ($_GET['to'] ?? '')) ?: date('Y-m-d');
$tool = preg_replace('/[^a-z0-9._-]/i', '', (string) ($_GET['tool_id'] ?? ''));

try {
  $sql = 'SELECT tool_id, target_type, COUNT(*) AS clicks FROM clicks WHERE DATE(created_at) BETWEEN ? AND ?';
  $args = [$from, $to];
  if ($tool !== '') { $sql .= ' AND tool_id = ?'; $args[] = $tool; }
  $sql .= ' GROUP BY tool_id, target_type ORDER BY clicks DESC LIMIT 200';
  $st = db()->prepare($sql);
  $st->execute($args);
  $byTool = $st->fetchAll();

  $st2 = db()->prepare('SELECT DATE(created_at) AS day, COUNT(*) AS clicks FROM clicks WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY day ORDER BY day');
  $st2->execute([$from, $to]);
  $byDay = $st2->fetchAll();

  $total = array_sum(array_map(fn($r) => (int) $r['clicks'], $byTool));
  $aff = array_sum(array_map(fn($r) => $r['target_type'] === 'affiliate' ? (int) $r['clicks'] : 0, $byTool));
  json_out(['ok' => true, 'from' => $from, 'to' => $to, 'total' => $total,
    'affiliate' => $aff, 'official' => $total - $aff, 'by_tool' => $byTool, 'by_day' => $byDay]);
} catch (Throwable $e) {
  fail('查询失败: ' . $e->getMessage(), 500);
}
