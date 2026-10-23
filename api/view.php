<?php
// POST /api/view.php —— 工具详情页浏览统计（P6，第一版仅站长在后台看）
// 同一 IP + 同一工具 1 小时内只记一次（防刷新刷量）；只存 IP 哈希，不存原始 IP。
// 前端每个会话每个工具只发一次（sessionStorage 标记），服务端再做 1 小时去重，双层节流。
// 本机无 PHP，未在本地 PHP 实测，仅人工复查 + 逻辑自查。
declare(strict_types=1);
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/util.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { fail('只接受 POST', 405); }
rate_limit('view', 100, 3600);

$tool_id = post_str('tool_id', 80);
if ($tool_id === '' || !preg_match('/^[a-z0-9._-]+$/i', $tool_id)) { fail('tool_id 不正确', 400); }

ensure_tool_vote_tables();
$view_hash = client_ip_hash();
$since = date('Y-m-d H:i:s', time() - 3600);
try {
  $chk = db()->prepare('SELECT COUNT(*) FROM tool_views WHERE tool_id = ? AND view_hash = ? AND created_at > ?');
  $chk->execute([$tool_id, $view_hash, $since]);
  if ((int) $chk->fetchColumn() > 0) {
    json_out(['ok' => true, 'tool_id' => $tool_id, 'deduped' => true]);
  }
  $st = db()->prepare('INSERT INTO tool_views (tool_id, view_hash) VALUES (?,?)');
  $st->execute([$tool_id, $view_hash]);
} catch (Throwable $e) { fail('保存失败，请稍后重试', 500); }

json_out(['ok' => true, 'tool_id' => $tool_id, 'deduped' => false]);
