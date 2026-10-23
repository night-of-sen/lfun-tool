<?php
// POST/GET /api/vote.php —— 工具点赞（P6 最小可用版）
// 同一浏览器重复点赞不重复计：浏览器在 localStorage 存一个随机 vote token，
// 服务端只存 token 的哈希（不存 token 原文、不存原始 IP），与提交“只存国家不存原始 IP”
// 的隐私口径一致。token 缺失时退回 IP 哈希（共享 IP 下会互相挡，属已知取舍）。
// 第一版点赞是单向的（无取消点赞），避免计数来回跳；异常 spikes 只在后台标出人工复核，
// 不自动删数（见 admin 概览“点赞异常”与 P2–P6 报告）。
// 本机无 PHP，未在本地 PHP 实测，仅人工复查 + 逻辑自查。
declare(strict_types=1);
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/util.php';

function vote_count(string $tool_id): int {
  try {
    $st = db()->prepare('SELECT COUNT(*) FROM tool_votes WHERE tool_id = ?');
    $st->execute([$tool_id]);
    return (int) $st->fetchColumn();
  } catch (Throwable $e) { return 0; }
}

function valid_tool_id(string $id): bool {
  return $id !== '' && strlen($id) <= 80 && (bool) preg_match('/^[a-z0-9._-]+$/i', $id);
}

// GET：只读计数（前端刷新已点赞工具的显示用）
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
  $tool_id = preg_replace('/[^a-z0-9._-]/i', '', (string) ($_GET['tool_id'] ?? ''));
  if (!valid_tool_id($tool_id)) { fail('tool_id 不正确', 400); }
  ensure_tool_vote_tables();
  json_out(['ok' => true, 'tool_id' => $tool_id, 'count' => vote_count($tool_id)]);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { fail('只接受 POST 或 GET', 405); }
rate_limit('vote', 30, 3600);

$tool_id = post_str('tool_id', 80);
if (!valid_tool_id($tool_id)) { fail('tool_id 不正确', 400); }
$token = post_str('voter_token', 64);
if ($token !== '' && !preg_match('/^[a-z0-9]+$/i', $token)) { $token = ''; }
if ($token !== '') {
  $voter_hash = substr(hash('sha256', (string) cfg('db_pass') . '|lfun-vote|' . $token), 0, 32);
} else {
  $voter_hash = client_ip_hash();
}

ensure_tool_vote_tables();
try {
  $chk = db()->prepare('SELECT COUNT(*) FROM tool_votes WHERE tool_id = ? AND voter_hash = ?');
  $chk->execute([$tool_id, $voter_hash]);
  if ((int) $chk->fetchColumn() > 0) {
    json_out(['ok' => true, 'tool_id' => $tool_id, 'count' => vote_count($tool_id), 'voted' => true, 'already' => true]);
  }
  $st = db()->prepare('INSERT INTO tool_votes (tool_id, voter_hash) VALUES (?,?)');
  $st->execute([$tool_id, $voter_hash]);
} catch (Throwable $e) { fail('保存失败，请稍后重试', 500); }

json_out(['ok' => true, 'tool_id' => $tool_id, 'count' => vote_count($tool_id), 'voted' => true, 'already' => false]);
