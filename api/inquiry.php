<?php
// POST /api/inquiry.php —— 商务合作表单（PRD 模块一）
// 防垃圾（全部无感、不加验证码、不挡正常提交）：
// ① 蜜罐 + 同 IP 每小时 5 次限流（已有）；② 填表最短 3 秒（JS 在打开页时写 _ts，
//    机器人瞬间提交会被拦；无 JS 的普通 POST 没有 _ts 则放行）；③ 姓名字段禁链接；
// ④ 留言链接超过 3 条拒收；⑤ Origin 存在且不是本站时拒收；⑥ 同邮箱同内容 1 小时内
//    重复提交拒收。被拦时一律返回通用失败，不告诉对方是哪条规则命中。
declare(strict_types=1);
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/util.php';
require_once __DIR__ . '/lib/mail.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { fail('只接受 POST', 405); }
if (!honeypot_ok()) { fail('提交失败', 400); }
rate_limit('inquiry', 5, 3600);

$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origin !== '') {
  $host = strtolower((string) (parse_url($origin, PHP_URL_HOST) ?? ''));
  if ($host !== 'tools.lfun.cloud') { fail('提交失败', 403); }
}
$tsRaw = (string) ($_POST['_ts'] ?? '');
if ($tsRaw !== '' && is_numeric($tsRaw)) {
  $ts = (int) $tsRaw;
  if ($ts > time() + 60 || time() - $ts < 3) { fail('提交失败', 400); }
}

$name = post_str('name', 120);
$company = post_str('company', 160);
$email = post_str('email', 200);
$type = post_str('type', 24);
$message = post_str('message', 4000);
if ($name === '' || $email === '') { fail('请填写姓名与邮箱'); }
if (!valid_email($email)) { fail('邮箱格式不正确'); }
if (preg_match('#https?://|www\.#i', $name . ' ' . $company)) { fail('提交失败', 400); }
if (preg_match_all('#https?://|www\.#i', $message) > 3) { fail('链接过多，请只保留必要的链接'); }
$allowed = ['affiliate', 'featured', 'paid_review', 'listing', 'newsletter', 'other'];
if (!in_array($type, $allowed, true)) { $type = 'other'; }

try {
  if ($message !== '') {
    $dup = db()->prepare("SELECT COUNT(*) FROM partner_inquiries WHERE email = ? AND message = ? AND created_at > ?");
    $dup->execute([$email, $message, date('Y-m-d H:i:s', time() - 3600)]);
    if ((int) $dup->fetchColumn() > 0) { fail('相同内容已收到，请勿重复提交'); }
  }
  $st = db()->prepare('INSERT INTO partner_inquiries (name, company, email, type, message) VALUES (?,?,?,?,?)');
  $st->execute([$name, $company, $email, $type, $message]);
} catch (Throwable $e) {
  // fail() 会 exit，若上面已 fail 则不会走到这里；这里只处理真正的保存失败
  if (!headers_sent()) { fail('保存失败，请改用邮件联系', 500); }
  exit;
}

$to = (string) cfg('notify_to');
if ($to !== '') {
  $body = '<p><b>姓名</b>：' . h($name) . '<br><b>公司</b>：' . h($company) . '<br><b>邮箱</b>：' . h($email) .
    '<br><b>类型</b>：' . h($type) . '</p><p><b>留言</b>：</p><p>' . nl2br(h($message)) . '</p>';
  send_mail($to, '[商务合作] ' . $name . ' / ' . $type, mail_template('新的商务合作咨询', $body), $email);
}
json_out(['ok' => true]);
