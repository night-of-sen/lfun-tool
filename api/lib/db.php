<?php
// 数据库：PDO 单例 + 自动建表。
// 生产用 MySQL；本地开发没有 MySQL 时可用 SQLite 跑通全部逻辑（`sqlite:` DSN）。
declare(strict_types=1);
require_once __DIR__ . '/config.php';

function db(): PDO {
  static $pdo = null;
  if ($pdo instanceof PDO) { return $pdo; }
  $dsn = cfg('db_dsn');
  if ($dsn === '') {
    throw new RuntimeException('数据库未配置：请在 config.local.php 里设置 db_dsn');
  }
  $opts = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
  ];
  if (strpos($dsn, 'sqlite:') === 0) {
    $pdo = new PDO($dsn, null, null, $opts);
    $pdo->exec('PRAGMA journal_mode=WAL');
  } else {
    $pdo = new PDO($dsn, (string) cfg('db_user'), (string) cfg('db_pass'), $opts);
  }
  return $pdo;
}

function db_is_sqlite(): bool {
  return strpos((string) cfg('db_dsn'), 'sqlite:') === 0;
}

// 建表：幂等，可在 selftest 里一键初始化，省得手工导 SQL
function ensure_schema(): array {
  $pdo = db();
  $mysql = !db_is_sqlite();
  $id = $mysql ? 'INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  $ai = $mysql ? 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';
  $ts = $mysql ? 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' : "TEXT NOT NULL DEFAULT (datetime('now'))";
  $d = $mysql ? 'DATE' : 'TEXT';
  $created = [];
  $tables = [
    'partner_inquiries' =>
      "CREATE TABLE IF NOT EXISTS partner_inquiries (id $id, name VARCHAR(120) NOT NULL, company VARCHAR(160) NOT NULL DEFAULT '', " .
      "email VARCHAR(200) NOT NULL, type VARCHAR(24) NOT NULL DEFAULT 'other', message TEXT, status VARCHAR(16) NOT NULL DEFAULT 'new', " .
      "created_at $ts) $ai",
    'clicks' =>
      "CREATE TABLE IF NOT EXISTS clicks (id $id, tool_id VARCHAR(80) NOT NULL, target_type VARCHAR(16) NOT NULL DEFAULT 'affiliate', " .
      "target_url VARCHAR(500) NOT NULL DEFAULT '', referer VARCHAR(500) NOT NULL DEFAULT '', user_agent VARCHAR(300) NOT NULL DEFAULT '', " .
      "ip_hash CHAR(32) NOT NULL DEFAULT '', created_at $ts) $ai",
    'sponsorships' =>
      "CREATE TABLE IF NOT EXISTS sponsorships (id $id, tool_id VARCHAR(80) NOT NULL, slot VARCHAR(16) NOT NULL DEFAULT 'homepage', " .
      "start_date $d NOT NULL, end_date $d NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'scheduled', note VARCHAR(300) NOT NULL DEFAULT '', " .
      "created_at $ts) $ai",
    'submissions' =>
      "CREATE TABLE IF NOT EXISTS submissions (id $id, repo_url VARCHAR(300) NOT NULL, tier VARCHAR(16) NOT NULL DEFAULT 'free', " .
      "contact_email VARCHAR(200) NOT NULL DEFAULT '', status VARCHAR(20) NOT NULL DEFAULT 'pending', sla_deadline $d NULL, " .
      "query_code CHAR(12) NOT NULL DEFAULT '', created_at $ts) $ai",
    'affiliates' =>
      "CREATE TABLE IF NOT EXISTS affiliates (tool_id VARCHAR(80) NOT NULL PRIMARY KEY, url VARCHAR(500) NOT NULL DEFAULT '', " .
      "enabled TINYINT NOT NULL DEFAULT 1, note VARCHAR(200) NOT NULL DEFAULT '', updated_at $ts) $ai",
    'subscribers' =>
      "CREATE TABLE IF NOT EXISTS subscribers (id $id, email VARCHAR(200) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending', " .
      "confirm_token CHAR(32) NOT NULL DEFAULT '', unsub_token CHAR(32) NOT NULL DEFAULT '', confirmed_at $ts NULL, " .
      "unsubscribed_at $ts NULL, created_at $ts) $ai",
  ];
  foreach ($tables as $name => $sql) {
    try { $pdo->exec($sql); $created[] = $name; } catch (Throwable $e) { throw new RuntimeException("建表 $name 失败: " . $e->getMessage()); }
  }
  // 索引（重复创建会抛错，忽略即可）
  $idx = [
    'CREATE INDEX idx_clicks_tool ON clicks (tool_id)',
    'CREATE INDEX idx_clicks_created ON clicks (created_at)',
    'CREATE UNIQUE INDEX idx_subscribers_email ON subscribers (email)',
    'CREATE UNIQUE INDEX idx_submissions_code ON submissions (query_code)',
    'CREATE INDEX idx_sponsorships_slot ON sponsorships (slot, status)',
  ];
  foreach ($idx as $sql) { try { $pdo->exec($sql); } catch (Throwable $e) { /* 已存在 */ } }
  return $created;
}
