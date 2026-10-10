<?php
// POST /api/subscribe.php —— Newsletter 订阅，双重确认（PRD 模块六）
declare(strict_types=1);
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/util.php';
require_once __DIR__ . '/lib/mail.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { fail('只接受 POST', 405); }
if (!honeypot_ok()) { fail('提交失败', 400); }
rate_limit('subscribe', 5, 3600);

$email = strtolower(post_str('email', 200));
if (!valid_email($email)) { fail('邮箱格式不正确'); }
$token = bin2hex(random_bytes(16));
$unsub = bin2hex(random_bytes(16));

try {
  $st = db()->prepare('SELECT id, status FROM subscribers WHERE email = ? LIMIT 1');
  $st->execute([$email]);
  $row = $st->fetch();
  if ($row) {
    if ($row['status'] === 'active') { json_out(['ok' => true, 'already' => true]); }
    $up = db()->prepare('UPDATE subscribers SET status = ?, confirm_token = ?, unsub_token = ? WHERE id = ?');
    $up->execute(['pending', $token, $unsub, $row['id']]);
  } else {
    $in = db()->prepare('INSERT INTO subscribers (email, status, confirm_token, unsub_token) VALUES (?,?,?,?)');
    $in->execute([$email, 'pending', $token, $unsub]);
  }
} catch (Throwable $e) { fail('保存失败，请稍后再试', 500); }

$url = rtrim((string) cfg('site_url'), '/') . '/api/confirm.php?token=' . $token;
$unsubUrl = rtrim((string) cfg('site_url'), '/') . '/api/unsubscribe.php?token=' . $unsub;
send_mail($email, '确认订阅 / Confirm your subscription',
  mail_template('还差一步', '<p>点下面的按钮确认订阅。若不是你本人操作，忽略本邮件即可。</p><p style="color:#888;font-size:12px;margin-top:16px">不想再收到邮件？可随时<a href="' . h($unsubUrl) . '">退订</a>。</p>', '确认订阅', $url));
json_out(['ok' => true]);
