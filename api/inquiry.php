<?php
// POST /api/inquiry.php —— 商务合作表单（PRD 模块一）
declare(strict_types=1);
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/util.php';
require_once __DIR__ . '/lib/mail.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { fail('只接受 POST', 405); }
if (!honeypot_ok()) { fail('提交失败', 400); }
rate_limit('inquiry', 5, 3600);

$name = post_str('name', 120);
$company = post_str('company', 160);
$email = post_str('email', 200);
$type = post_str('type', 24);
$message = post_str('message', 4000);
if ($name === '' || $email === '') { fail('请填写姓名与邮箱'); }
if (!valid_email($email)) { fail('邮箱格式不正确'); }
$allowed = ['affiliate', 'featured', 'listing', 'newsletter', 'other'];
if (!in_array($type, $allowed, true)) { $type = 'other'; }

try {
  $st = db()->prepare('INSERT INTO partner_inquiries (name, company, email, type, message) VALUES (?,?,?,?,?)');
  $st->execute([$name, $company, $email, $type, $message]);
} catch (Throwable $e) {
  fail('保存失败，请改用邮件联系', 500);
}

$to = (string) cfg('notify_to');
if ($to !== '') {
  $body = '<p><b>姓名</b>：' . h($name) . '<br><b>公司</b>：' . h($company) . '<br><b>邮箱</b>：' . h($email) .
    '<br><b>类型</b>：' . h($type) . '</p><p><b>留言</b>：</p><p>' . nl2br(h($message)) . '</p>';
  send_mail($to, '[商务合作] ' . $name . ' / ' . $type, mail_template('新的商务合作咨询', $body), $email);
}
json_out(['ok' => true]);
