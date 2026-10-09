<?php
// POST /api/submit.php —— 收录提交（PRD 模块四）
// 三档：free 免费提交 / fast 快速审核($29) / featured 加精推荐($49)
// 免费直接进审核队列（pending）；付费先 paid_pending（等站长确认收款），
// 确认后站长在后台改为 pending；通过审核的一律由站长手动加入工具库。
declare(strict_types=1);
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/util.php';
require_once __DIR__ . '/lib/mail.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { fail('只接受 POST', 405); }
if (!honeypot_ok()) { fail('提交失败', 400); }
rate_limit('submit', 10, 3600);

$repo_url = trim(post_str('repo_url', 300));
$tier = post_str('tier', 16);
$email = post_str('email', 200);

if ($repo_url === '' || $email === '') { fail('请填写仓库地址与邮箱'); }
// 接受完整 URL（https://github.com/owner/repo）或 owner/repo 简写
if (!preg_match('#^(https?://github\.com/|github\.com/)?[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/?$#i', $repo_url)) {
  fail('仓库地址格式不正确（应为 GitHub 仓库链接或 owner/repo）');
}
if (!valid_email($email)) { fail('邮箱格式不正确'); }
$allowed = ['free', 'fast', 'featured'];
if (!in_array($tier, $allowed, true)) { $tier = 'free'; }

// 查询码：12 位大写字母数字，唯一
$query_code = '';
for ($i = 0; $i < 8; $i++) {
  $c = strtoupper(substr(bin2hex(random_bytes(6)), 0, 12));
  try {
    $chk = db()->prepare('SELECT id FROM submissions WHERE query_code = ?');
    $chk->execute([$c]);
    if (!$chk->fetch()) { $query_code = $c; break; }
  } catch (Throwable $e) { fail('保存失败，请稍后重试', 500); }
}
if ($query_code === '') { fail('保存失败，请稍后重试', 500); }

$paid = ($tier !== 'free');
$status = $paid ? 'paid_pending' : 'pending';
// 付费档 SLA：提交起 48 小时（从站长确认收款后开始计算，见后台）
$sla = $paid ? date('Y-m-d H:i:s', time() + 48 * 3600) : null;

try {
  $st = db()->prepare('INSERT INTO submissions (repo_url, tier, contact_email, status, sla_deadline, query_code) VALUES (?,?,?,?,?,?)');
  $st->execute([$repo_url, $tier, $email, $status, $sla, $query_code]);
} catch (Throwable $e) { fail('保存失败，请稍后重试', 500); }

$to = (string) cfg('notify_to');
if ($to !== '') {
  $tierLabel = ['free' => '免费提交', 'fast' => '快速审核($29)', 'featured' => '加精推荐($49)'][$tier] ?? $tier;
  $body = '<p><b>仓库</b>：' . h($repo_url) . '<br><b>档位</b>：' . h($tierLabel) .
    '<br><b>邮箱</b>：' . h($email) . '<br><b>查询码</b>：' . h($query_code) .
    ($sla ? '<br><b>SLA 截止</b>：' . h($sla) : '') . '</p>';
  send_mail($to, '[收录提交] ' . $tier . ' / ' . $repo_url, mail_template('新的收录提交', $body), $email);
}

json_out(['ok' => true, 'query_code' => $query_code, 'tier' => $tier, 'status' => $status]);
