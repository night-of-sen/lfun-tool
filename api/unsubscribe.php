<?php
// GET /api/unsubscribe.php?token= —— 一键退订，即时生效（PRD 模块六）
declare(strict_types=1);
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/util.php';

$token = preg_replace('/[^a-f0-9]/i', '', (string) ($_GET['token'] ?? ''));
$ok = false;
if (strlen($token) === 32) {
  try {
    $st = db()->prepare('UPDATE subscribers SET status = ?, unsubscribed_at = CURRENT_TIMESTAMP WHERE unsub_token = ?');
    $st->execute(['unsubscribed', $token]);
    $ok = $st->rowCount() > 0;
  } catch (Throwable $e) {}
}
header('Content-Type: text/html; charset=utf-8');
echo '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>已退订</title>' .
  '<body style="font-family:system-ui;max-width:520px;margin:80px auto;line-height:1.8">' .
  ($ok ? '<h2>已退订</h2><p>不会再收到周报。想回来随时可以重新订阅。</p>' : '<h2>链接无效</h2><p>可能已经退订过了。</p>') .
  '<p><a href="/">← 回到工具集</a></p></body></html>';
