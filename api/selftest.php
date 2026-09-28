<?php
// GET /api/selftest.php?token=xxx —— 部署后自检（PRD §10 非功能项）
// 用途：线上确认 PHP 版本、扩展、数据库连通、建表、邮件配置是否就绪。
// 必须带 cfg('selftest_token')，否则 403。
declare(strict_types=1);
require_once __DIR__ . '/lib/config.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/util.php';

$expect = (string) cfg('selftest_token');
$got = (string) ($_GET['token'] ?? '');
if ($expect === '' || !hash_equals($expect, $got)) { fail('forbidden', 403); }

$out = ['ok' => true, 'php' => PHP_VERSION, 'checks' => []];
$out['checks']['php>=8.0'] = version_compare(PHP_VERSION, '8.0.0', '>=');
foreach (['pdo', 'mbstring', 'json', 'openssl'] as $ext) {
  $out['checks']['ext:' . $ext] = extension_loaded($ext);
}
$out['checks']['ext:pdo_mysql'] = extension_loaded('pdo_mysql');
$out['checks']['ext:pdo_sqlite'] = extension_loaded('pdo_sqlite');
$out['checks']['ext:curl'] = extension_loaded('curl');

$dsn = (string) cfg('db_dsn');
$out['db_configured'] = $dsn !== '';
$out['db_driver'] = $dsn === '' ? '' : strtok($dsn, ':');
$out['checks']['admin_hash_set'] = (string) cfg('admin_pass_hash') !== '';
$out['checks']['selftest_token_set'] = $expect !== '';
$out['mail_driver'] = (string) cfg('mail_driver');
$out['notify_to'] = (string) cfg('notify_to');

if ($dsn !== '') {
  try {
    $created = ensure_schema();
    $out['schema_ok'] = true;
    $out['tables_ensured'] = $created;
    $counts = [];
    foreach (['partner_inquiries', 'clicks', 'sponsorships', 'submissions', 'subscribers', 'affiliates'] as $t) {
      try { $counts[$t] = (int) db()->query('SELECT COUNT(*) FROM ' . $t)->fetchColumn(); }
      catch (Throwable $e) { $counts[$t] = null; }
    }
    $out['row_counts'] = $counts;
  } catch (Throwable $e) {
    $out['ok'] = false;
    $out['schema_ok'] = false;
    $out['db_error'] = $e->getMessage();
  }
} else {
  $out['ok'] = false;
  $out['schema_ok'] = false;
}

if (isset($_GET['mail'])) {
  require_once __DIR__ . '/lib/mail.php';
  $to = (string) cfg('notify_to');
  $out['mail_sent'] = $to !== '' ? send_mail($to, '[selftest] 邮件通道自检', mail_template('邮件自检', '<p>如果你收到这封邮件，说明发信通道可用。</p>')) : false;
}
json_out($out);
