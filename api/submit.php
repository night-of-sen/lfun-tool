<?php
// POST /api/submit.php —— 创作者投稿（P2 升级，PRD 模块四）
// 三档不变：free 免费提交 / fast 快速审核($29) / featured 加精推荐($49)
// 免费直接进审核队列（pending）；付费先 paid_pending（等站长确认收款），
// 确认后站长在后台改为 pending；通过审核后：GitHub 投稿走已通过自动上架，
// 非 GitHub 投稿由站长手动加入工具库（见 P2 报告，自动上架仅支持 repo 投稿）。
// P2 改动：GitHub 选填，作品链接必填；新增工具名、一句话、主分类、标签、
// 截图/视频、价格、形态、作者等字段。截图只填链接，不做服务器上传。
// 本机无 PHP，未在本地 PHP 实测，仅人工复查 + 逻辑自查，上线前须在测试库先跑 migration。
declare(strict_types=1);
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/util.php';
require_once __DIR__ . '/lib/mail.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { fail('只接受 POST', 405); }
if (!honeypot_ok()) { fail('提交失败', 400); }
rate_limit('submit', 10, 3600);

function valid_http_url(string $u): bool {
  if ($u === '' || strlen($u) > 500) { return false; }
  if (!filter_var($u, FILTER_VALIDATE_URL)) { return false; }
  $scheme = strtolower((string) parse_url($u, PHP_URL_SCHEME));
  return $scheme === 'http' || $scheme === 'https';
}

$tool_name = post_str('tool_name', 120);
$oneliner = post_str('oneliner', 200);
$work_url = trim(post_str('work_url', 500));
$repo_url = trim(post_str('repo_url', 300));
$tier = post_str('tier', 16);
$email = post_str('email', 200);
$author_name = post_str('author_name', 120);
$author_url = trim(post_str('author_url', 500));
$primary_category = post_str('primary_category', 40);
$tags_raw = post_str('tags', 300);
$screenshot_url = trim(post_str('screenshot_url', 500));
$video_url = trim(post_str('video_url', 500));
$price_model = post_str('price_model', 20);
$form = post_str('form', 20);
$highlights = post_str('highlights', 1000);
$price_detail = post_str('price_detail', 300);

// 必填校验（新投稿；老投稿记录不受影响，仍按旧字段展示）
if ($tool_name === '' || $oneliner === '' || $email === '' || $author_name === '') {
  fail('请填写工具名、一句话介绍、联系邮箱与作者名');
}
if (!valid_http_url($work_url)) { fail('作品链接不正确，应为 http/https 链接（官网 / Demo / 商店页）'); }
if ($repo_url !== '' && !preg_match('#^(https?://github\.com/|github\.com/)?[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/?$#i', $repo_url)) {
  fail('GitHub 仓库地址格式不正确（应为 GitHub 仓库链接或 owner/repo，选填）');
}
if (!valid_email($email)) { fail('邮箱格式不正确'); }
if ($author_url !== '' && !valid_http_url($author_url)) { fail('作者主页链接不正确，应为 http/https 链接'); }
$allowed_categories = ['ai-agents', 'dev-tools', 'infra-security', 'marketing-growth', 'fun-games', 'productivity', 'design-creativity', 'writing-knowledge', 'video-media', 'business-support', 'mobile-iot'];
if (!in_array($primary_category, $allowed_categories, true)) { fail('主分类不正确，请从 11 个主分类中选择'); }
// 标签：中文逗号、英文逗号、顿号都按分隔符算，1 至 3 个
$tags_parts = array_values(array_filter(array_map('trim', preg_split('/[,，、]+/u', $tags_raw) ?: []), fn($x) => $x !== ''));
if (count($tags_parts) < 1 || count($tags_parts) > 3) { fail('标签请填 1 至 3 个，用逗号分隔'); }
$tags = implode(', ', $tags_parts);
if ($screenshot_url === '' && $video_url === '') { fail('截图或演示视频至少填一个链接'); }
if ($screenshot_url !== '' && !valid_http_url($screenshot_url)) { fail('截图链接不正确，应为 http/https 链接'); }
if ($video_url !== '' && !valid_http_url($video_url)) { fail('演示视频链接不正确，应为 http/https 链接'); }
if (!in_array($price_model, ['free', 'freemium', 'paid', 'opensource'], true)) { fail('价格模式不正确'); }
if (!in_array($form, ['web', 'mobile', 'desktop', 'extension', 'plugin', 'api', 'template'], true)) { fail('形态不正确'); }
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

// 提交时间由 created_at 默认值记录；IP 国家提交时解析一次、只存国家不存原始 IP（PRD §10）
ensure_submission_geo_columns();
ensure_submission_showcase_columns();
$submitCountry = ip_country(client_ip());

try {
  $st = db()->prepare('INSERT INTO submissions (repo_url, tier, contact_email, status, sla_deadline, query_code, submitter_country, tool_name, oneliner, work_url, author_name, author_url, primary_category, tags, screenshot_url, video_url, price_model, form, highlights, price_detail) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  $st->execute([$repo_url, $tier, $email, $status, $sla, $query_code, $submitCountry, $tool_name, $oneliner, $work_url, $author_name, $author_url, $primary_category, $tags, $screenshot_url, $video_url, $price_model, $form, $highlights, $price_detail]);
} catch (Throwable $e) { fail('保存失败，请稍后重试', 500); }

$to = (string) cfg('notify_to');
if ($to !== '') {
  $tierLabel = ['free' => '免费提交', 'fast' => '快速审核($29)', 'featured' => '加精推荐($49)'][$tier] ?? $tier;
  $display = $tool_name !== '' ? $tool_name : $work_url;
  $body = '<p><b>工具</b>：' . h($tool_name) . '<br><b>一句话</b>：' . h($oneliner) .
    '<br><b>作品链接</b>：' . h($work_url) .
    ($repo_url !== '' ? '<br><b>仓库</b>：' . h($repo_url) : '<br><b>仓库</b>：无（非 GitHub 投稿）') .
    '<br><b>主分类</b>：' . h($primary_category) . '<br><b>形态</b>：' . h($form) . '<br><b>价格</b>：' . h($price_model) .
    '<br><b>作者</b>：' . h($author_name) . '<br><b>档位</b>：' . h($tierLabel) .
    '<br><b>邮箱</b>：' . h($email) . '<br><b>查询码</b>：' . h($query_code) .
    ($submitCountry !== '' ? '<br><b>IP 国家</b>：' . h($submitCountry) : '') .
    ($sla ? '<br><b>SLA 截止</b>：' . h($sla) : '') . '</p>';
  send_mail($to, '[收录提交] ' . $tier . ' / ' . $display, mail_template('新的收录提交', $body), $email);
}

json_out(['ok' => true, 'query_code' => $query_code, 'tier' => $tier, 'status' => $status]);
