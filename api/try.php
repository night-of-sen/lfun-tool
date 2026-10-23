<?php
// POST /api/try.php —— 作品链接试用点击统计（P6）
// 复用 clicks 表（与 /go/ 联盟点击同一张表，target_type='work' 区分），
// 目标链接取自 data/tools.json（homepage 或 work_url），不在请求里接受任意 URL，
// 避免把本接口变成开放跳转/开放记录。跳转本身不走这里：前端仍是正常外链打开，
// 本接口只用 sendBeacon 记一笔，记失败不阻塞跳转。
// 本机无 PHP，未在本地 PHP 实测，仅人工复查 + 逻辑自查。
declare(strict_types=1);
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/util.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { fail('只接受 POST', 405); }
rate_limit('try', 100, 3600);

$tool_id = post_str('tool_id', 80);
if ($tool_id === '' || !preg_match('/^[a-z0-9._-]+$/i', $tool_id)) { fail('tool_id 不正确', 400); }

$target = '';
$jsonFile = __DIR__ . '/../data/tools.json';
if (is_file($jsonFile)) {
  $data = json_decode((string) file_get_contents($jsonFile), true);
  if (is_array($data) && isset($data['items']) && is_array($data['items'])) {
    foreach ($data['items'] as $it) {
      if (($it['id'] ?? '') === $tool_id) {
        $target = (string) ($it['homepage'] ?? $it['work_url'] ?? '');
        break;
      }
    }
  }
}
if ($target === '') { fail('未知工具', 400); }

try {
  $st = db()->prepare('INSERT INTO clicks (tool_id, target_type, target_url, referer, user_agent, ip_hash) VALUES (?,?,?,?,?,?)');
  $st->execute([
    $tool_id, 'work',
    mb_substr($target, 0, 500),
    mb_substr((string) ($_SERVER['HTTP_REFERER'] ?? ''), 0, 500),
    mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300),
    client_ip_hash(),
  ]);
} catch (Throwable $e) { fail('保存失败，请稍后重试', 500); }

json_out(['ok' => true, 'tool_id' => $tool_id]);
