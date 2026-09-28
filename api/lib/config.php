<?php
// 配置载入：优先 config.local.php（不提交），其次环境变量。
// 生产环境请复制 config.local.example.php 为 config.local.php 并填好凭据。
declare(strict_types=1);

function cfg(?string $key = null) {
  static $conf = null;
  if ($conf === null) {
    $conf = [
      'db_dsn'   => getenv('LFUN_DB_DSN') ?: '',
      'db_user'  => getenv('LFUN_DB_USER') ?: '',
      'db_pass'  => getenv('LFUN_DB_PASS') ?: '',
      'site_url' => getenv('LFUN_SITE_URL') ?: 'https://tools.lfun.cloud',
      'admin_user' => getenv('LFUN_ADMIN_USER') ?: 'admin',
      // password_hash() 生成的串；明文密码不落盘
      'admin_pass_hash' => getenv('LFUN_ADMIN_PASS_HASH') ?: '',
      'mail_from' => getenv('LFUN_MAIL_FROM') ?: 'noreply@tools.lfun.cloud',
      'notify_to' => getenv('LFUN_NOTIFY_TO') ?: '',
      // mail() | resend
      'mail_driver' => getenv('LFUN_MAIL_DRIVER') ?: 'mail',
      'resend_key'  => getenv('LFUN_RESEND_KEY') ?: '',
      'selftest_token' => getenv('LFUN_SELFTEST_TOKEN') ?: '',
      'debug' => false,
    ];
    $local = __DIR__ . '/../../config.local.php';
    if (is_file($local)) {
      $extra = require $local;
      if (is_array($extra)) { $conf = array_merge($conf, $extra); }
    }
  }
  if ($key === null) { return $conf; }
  return $conf[$key] ?? null;
}
