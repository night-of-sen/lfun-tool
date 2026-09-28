<?php
// 邮件发送：默认用 PHP mail()；也可切到 Resend HTTP API。
// PRD 模块六只要求「能发即可」，v1 不引入依赖。
declare(strict_types=1);
require_once __DIR__ . '/config.php';

function send_mail(string $to, string $subject, string $htmlBody, string $replyTo = ''): bool {
  if (!valid_email($to)) { return false; }
  $from = (string) cfg('mail_from');
  if (cfg('mail_driver') === 'resend' && cfg('resend_key')) {
    return resend_mail($to, $subject, $htmlBody, $replyTo);
  }
  $headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'From: ' . $from,
  ];
  if ($replyTo !== '' && valid_email($replyTo)) { $headers[] = 'Reply-To: ' . $replyTo; }
  $subjectEnc = '=?UTF-8?B?' . base64_encode($subject) . '?=';
  return @mail($to, $subjectEnc, $htmlBody, implode("\r\n", $headers));
}

function resend_mail(string $to, string $subject, string $htmlBody, string $replyTo): bool {
  $payload = json_encode([
    'from' => (string) cfg('mail_from'),
    'to' => [$to],
    'subject' => $subject,
    'html' => $htmlBody,
  ], JSON_UNESCAPED_UNICODE);
  $ch = curl_init('https://api.resend.com/emails');
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_HTTPHEADER => [
      'Authorization: Bearer ' . cfg('resend_key'),
      'Content-Type: application/json',
    ],
    CURLOPT_POSTFIELDS => $payload,
  ]);
  $res = curl_exec($ch);
  $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  return $code >= 200 && $code < 300;
}

function mail_template(string $title, string $body, string $ctaLabel = '', string $ctaUrl = ''): string {
  $btn = $ctaUrl !== ''
    ? '<p style="margin:24px 0"><a href="' . h($ctaUrl) . '" style="background:#121212;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">' . h($ctaLabel) . '</a></p>'
    : '';
  return '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;line-height:1.7">' .
    '<h2 style="font-size:18px">' . h($title) . '</h2><div>' . $body . '</div>' . $btn .
    '<p style="color:#888;font-size:12px;margin-top:28px">' . h((string) cfg('site_url')) . '</p></div>';
}
