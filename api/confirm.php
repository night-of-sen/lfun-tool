<?php
// GET /api/confirm.php?token= —— 双重确认激活（PRD 模块六）
declare(strict_types=1);
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/util.php';

$token = preg_replace('/[^a-f0-9]/i', '', (string) ($_GET['token'] ?? ''));
$ok = false;
if (strlen($token) === 32) {
  try {
    $st = db()->prepare('SELECT id FROM subscribers WHERE confirm_token = ? AND status = ? LIMIT 1');
    $st->execute([$token, 'pending']);
    $row = $st->fetch();
    if ($row) {
      $up = db()->prepare('UPDATE subscribers SET status = ?, confirmed_at = CURRENT_TIMESTAMP WHERE id = ?');
      $up->execute(['active', $row['id']]);
      $ok = true;
    }
  } catch (Throwable $e) { /* 落到下面统一的失败页 */ }
}
header('Content-Type: text/html; charset=utf-8');
echo '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>' .
  ($ok ? '订阅已确认' : '链接无效') . '</title><body style="font-family:system-ui;max-width:520px;margin:80px auto;line-height:1.8">' .
  ($ok ? '<h2>订阅已确认 ✅</h2><p>感谢订阅，周报会在每周一发到你的邮箱。</p>'
       : '<h2>链接无效或已使用</h2><p>可能是链接过期，或你已经确认过了。</p>') .
  '<p><a href="/">← 回到工具集</a></p></body></html>';
