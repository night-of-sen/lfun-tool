<?php
// 复制为 config.local.php 并填入真实值。此文件不提交（见 .gitignore）。
// 也可以用环境变量（LFUN_DB_DSN 等）覆盖，见 api/lib/config.php。
return [
  // Hostinger 面板里创建 MySQL 数据库后会给出这四项
  'db_dsn'  => 'mysql:host=localhost;dbname=你的库名;charset=utf8mb4',
  'db_user' => '你的用户名',
  'db_pass' => '你的密码',

  'site_url' => 'https://tools.lfun.cloud',

  // 后台登录：用户名 + password_hash() 生成的密码散列
  // 生成方法（本地有 PHP 时）: php -r "echo password_hash('你的密码', PASSWORD_DEFAULT);"
  'admin_user' => 'admin',
  'admin_pass_hash' => '',

  // 邮件：mail() 或 resend
  'mail_driver' => 'mail',
  'mail_from'   => 'noreply@tools.lfun.cloud',
  'notify_to'   => '你的收件邮箱',
  'resend_key'  => '',

  // 自检接口的令牌：访问 /api/selftest.php?token=xxx 时用
  'selftest_token' => '',
];
