<?php
// 公共工具：JSON 响应、IP 哈希、限流、蜜罐、管理员鉴权、CSRF
declare(strict_types=1);
require_once __DIR__ . '/config.php';

function json_out($data, int $code = 200): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  header('X-Content-Type-Options: nosniff');
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

function fail(string $msg, int $code = 400): void {
  json_out(['ok' => false, 'error' => $msg], $code);
}

function post_str(string $key, int $max = 300): string {
  $v = $_POST[$key] ?? '';
  if (!is_string($v)) { return ''; }
  $v = trim($v);
  $v = str_replace(["\r", "\0"], '', $v);
  return mb_substr($v, 0, $max);
}

function valid_email(string $e): bool {
  return (bool) filter_var($e, FILTER_VALIDATE_EMAIL) && strlen($e) <= 200;
}

// 隐私：IP 只存 hash，不存原文（PRD §10）
function client_ip_hash(): string {
  $ip = $_SERVER['REMOTE_ADDR'] ?? '';
  $salt = (string) cfg('db_pass') . '|lfun-ip';
  return substr(hash('sha256', $salt . $ip), 0, 32);
}

// 简易限流：同一 IP 在 $window 秒内最多 $limit 次
function rate_limit(string $bucket, int $limit, int $window = 3600): void {
  $dir = sys_get_temp_dir() . '/lfun-rate';
  if (!is_dir($dir)) { @mkdir($dir, 0700, true); }
  $file = $dir . '/' . $bucket . '-' . substr(client_ip_hash(), 0, 16) . '.json';
  $now = time();
  $hits = [];
  if (is_file($file)) {
    $raw = @file_get_contents($file);
    $decoded = json_decode((string) $raw, true);
    if (is_array($decoded)) { $hits = $decoded; }
  }
  $hits = array_values(array_filter($hits, fn($t) => is_int($t) && $t > $now - $window));
  if (count($hits) >= $limit) { fail('请求过于频繁，请稍后再试', 429); }
  $hits[] = $now;
  @file_put_contents($file, json_encode($hits), LOCK_EX);
}

// 蜜罐字段：正常用户看不到也不会填
function honeypot_ok(string $field = '_hp'): bool {
  return trim((string) ($_POST[$field] ?? '')) === '';
}

function require_admin(): void {
  if (session_status() !== PHP_SESSION_ACTIVE) { session_start(); }
  if (empty($_SESSION['lfun_admin'])) {
    header('Location: /admin/?need=1');
    exit;
  }
}

function admin_login(string $user, string $pass): bool {
  if (!hash_equals((string) cfg('admin_user'), $user)) { return false; }
  $hash = (string) cfg('admin_pass_hash');
  if ($hash === '') { return false; }
  return password_verify($pass, $hash);
}

function csrf_token(): string {
  if (session_status() !== PHP_SESSION_ACTIVE) { session_start(); }
  if (empty($_SESSION['csrf'])) { $_SESSION['csrf'] = bin2hex(random_bytes(16)); }
  return $_SESSION['csrf'];
}

function csrf_check(): void {
  if (session_status() !== PHP_SESSION_ACTIVE) { session_start(); }
  $sent = (string) ($_POST['csrf'] ?? '');
  if (empty($_SESSION['csrf']) || !hash_equals((string) $_SESSION['csrf'], $sent)) {
    fail('CSRF 校验失败，请刷新页面重试', 403);
  }
}

function h(?string $s): string { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }
