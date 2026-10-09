<?php
// 后台管理（PRD：赞助排期、合作咨询、联盟链接、提交队列、点击统计）
// 单文件 + ?p= 分区，零依赖，样式内联。
declare(strict_types=1);
require_once __DIR__ . '/../api/lib/db.php';
require_once __DIR__ . '/../api/lib/util.php';
require_once __DIR__ . '/../api/lib/mail.php';

if (session_status() !== PHP_SESSION_ACTIVE) { session_start(); }

$err = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && isset($_POST['do_login'])) {
  if (admin_login((string) ($_POST['user'] ?? ''), (string) ($_POST['pass'] ?? ''))) {
    $_SESSION['lfun_admin'] = true;
    header('Location: /admin/');
    exit;
  }
  $err = '账号或密码不正确' . ((string) cfg('admin_pass_hash') === '' ? '（尚未设置 admin_pass_hash）' : '');
}
if (isset($_GET['logout'])) { $_SESSION = []; session_destroy(); header('Location: /admin/'); exit; }

$authed = !empty($_SESSION['lfun_admin']);
if (!$authed) {
  header('Content-Type: text/html; charset=utf-8');
  echo '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
  echo '<meta name="robots" content="noindex,nofollow"><title>后台登录</title>';
  echo '<body style="font-family:system-ui;background:#141414;color:#e8e8e8;max-width:360px;margin:100px auto">';
  echo '<h1 style="font-size:20px">后台登录</h1>';
  if ($err !== '') { echo '<p style="color:#f88">' . h($err) . '</p>'; }
  echo '<form method="post" style="display:flex;flex-direction:column;gap:10px">';
  echo '<input name="user" placeholder="用户名" autocomplete="username" style="padding:10px;border-radius:8px;border:1px solid #333;background:#1b1b1b;color:#e8e8e8">';
  echo '<input name="pass" type="password" placeholder="密码" autocomplete="current-password" style="padding:10px;border-radius:8px;border:1px solid #333;background:#1b1b1b;color:#e8e8e8">';
  echo '<button name="do_login" value="1" style="padding:10px;border-radius:8px;border:0;background:#e8e8e8;color:#0b0b0b;font-weight:600">登录</button>';
  echo '</form></body></html>';
  exit;
}

$p = preg_replace('/[^a-z]/', '', (string) ($_GET['p'] ?? 'dash')) ?: 'dash';
$msg = '';

// ---- 表单动作 ----
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
  csrf_check();
  $do = (string) ($_POST['action'] ?? '');
  try {
    if ($do === 'sponsor_save') {
      $slot = in_array($_POST['slot'] ?? '', ['homepage', 'category'], true) ? $_POST['slot'] : 'homepage';
      $status = in_array($_POST['status'] ?? '', ['scheduled', 'active', 'expired', 'cancelled'], true) ? $_POST['status'] : 'scheduled';
      $toolId = preg_replace('/[^a-z0-9._-]/i', '', (string) ($_POST['tool_id'] ?? ''));
      $s = preg_replace('/[^0-9\-]/', '', (string) ($_POST['start_date'] ?? ''));
      $e = preg_replace('/[^0-9\-]/', '', (string) ($_POST['end_date'] ?? ''));
      if ($toolId === '' || $s === '' || $e === '') { throw new RuntimeException('工具 id 与起止日期必填'); }
      if ($e < $s) { throw new RuntimeException('结束日期不能早于开始日期'); }
      // 同一版位同一时段只允许一个生效赞助（PRD 3.4）
      $clash = db()->prepare('SELECT COUNT(*) FROM sponsorships WHERE slot = ? AND status IN (?,?) AND NOT (end_date < ? OR start_date > ?)');
      $clash->execute([$slot, 'scheduled', 'active', $s, $e]);
      $clashN = (int) $clash->fetchColumn();
      $id = (int) ($_POST['id'] ?? 0);
      if ($id > 0) { $clashN = max(0, $clashN - 1); }
      if ($clashN > 0) { throw new RuntimeException('该版位在所选时段已有排期，请先调整'); }
      if ($id > 0) {
        $st = db()->prepare('UPDATE sponsorships SET tool_id=?, slot=?, start_date=?, end_date=?, status=?, note=? WHERE id=?');
        $st->execute([$toolId, $slot, $s, $e, $status, post_str('note', 300), $id]);
      } else {
        $st = db()->prepare('INSERT INTO sponsorships (tool_id, slot, start_date, end_date, status, note) VALUES (?,?,?,?,?,?)');
        $st->execute([$toolId, $slot, $s, $e, $status, post_str('note', 300)]);
      }
      $msg = '赞助排期已保存';
    } elseif ($do === 'sponsor_delete') {
      db()->prepare('DELETE FROM sponsorships WHERE id = ?')->execute([(int) ($_POST['id'] ?? 0)]);
      $msg = '已删除';
    } elseif ($do === 'affiliate_save') {
      $toolId = preg_replace('/[^a-z0-9._-]/i', '', (string) ($_POST['tool_id'] ?? ''));
      $url = post_str('url', 500);
      $enabled = isset($_POST['enabled']) ? 1 : 0;
      if ($toolId === '') { throw new RuntimeException('工具 id 必填'); }
      $st = db()->prepare('SELECT tool_id FROM affiliates WHERE tool_id = ? LIMIT 1');
      $st->execute([$toolId]);
      if ($st->fetch()) {
        db()->prepare('UPDATE affiliates SET url=?, enabled=?, note=?, updated_at=CURRENT_TIMESTAMP WHERE tool_id=?')
          ->execute([$url, $enabled, post_str('note', 200), $toolId]);
      } else {
        db()->prepare('INSERT INTO affiliates (tool_id, url, enabled, note) VALUES (?,?,?,?)')
          ->execute([$toolId, $url, $enabled, post_str('note', 200)]);
      }
      $msg = '联盟链接已保存（即时生效，无需重新部署）';
    } elseif ($do === 'affiliate_delete') {
      db()->prepare('DELETE FROM affiliates WHERE tool_id = ?')->execute([(string) ($_POST['tool_id'] ?? '')]);
      $msg = '已删除';
    } elseif ($do === 'inquiry_status') {
      $st = db()->prepare('UPDATE partner_inquiries SET status = ? WHERE id = ?');
      $st->execute([in_array($_POST['status'] ?? '', ['new', 'contacted', 'closed'], true) ? $_POST['status'] : 'new', (int) ($_POST['id'] ?? 0)]);
      $msg = '已更新';
    } elseif ($do === 'submission_status') {
      $st = db()->prepare('UPDATE submissions SET status = ? WHERE id = ?');
      $st->execute([in_array($_POST['status'] ?? '', ['pending', 'paid_pending', 'approved', 'rejected'], true) ? $_POST['status'] : 'pending', (int) ($_POST['id'] ?? 0)]);
      $msg = '已更新';
    }
  } catch (Throwable $ex) { $msg = '操作失败：' . $ex->getMessage(); }
}

function rows(string $sql, array $args = []): array {
  try { $st = db()->prepare($sql); $st->execute($args); return $st->fetchAll(); }
  catch (Throwable $e) { return []; }
}
$sponsors = rows('SELECT * FROM sponsorships ORDER BY start_date DESC LIMIT 200');
$inquiries = rows('SELECT * FROM partner_inquiries ORDER BY id DESC LIMIT 200');
$affiliates = rows('SELECT * FROM affiliates ORDER BY updated_at DESC LIMIT 500');
$subs = rows("SELECT * FROM submissions ORDER BY (tier = 'free') ASC, (status = 'paid_pending') DESC, id DESC LIMIT 200");
$subscribers = rows("SELECT COUNT(*) AS n FROM subscribers WHERE status = 'active'");
$clickRows = rows('SELECT tool_id, COUNT(*) AS n FROM clicks GROUP BY tool_id ORDER BY n DESC LIMIT 20');
$clickTotal = rows('SELECT COUNT(*) AS n FROM clicks');
$today = date('Y-m-d');
$activeSponsors = rows('SELECT * FROM sponsorships WHERE status = ? AND start_date <= ? AND end_date >= ?', ['active', $today, $today]);
$csrf = csrf_token();
$nav = ['dash' => '概览', 'sponsors' => '赞助排期', 'affiliates' => '联盟链接', 'inquiries' => '合作咨询', 'subs' => '提交队列', 'news' => '订阅者'];
header('Content-Type: text/html; charset=utf-8');
?><!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>后台 · 开源工具集</title>
<style>
:root{--bg:#141414;--panel:#1b1b1b;--line:rgba(255,255,255,.1);--text:#e8e8e8;--muted:#7a7a7a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
header{display:flex;gap:16px;align-items:center;padding:12px 18px;border-bottom:1px solid var(--line)}
header b{font-size:15px}nav{display:flex;gap:4px;flex-wrap:wrap}nav a{padding:6px 11px;border-radius:9px;text-decoration:none;color:var(--muted)}
nav a:hover{background:rgba(255,255,255,.06);color:var(--text)}nav a.on{background:rgba(255,255,255,.1);color:var(--text);font-weight:600}
main{padding:20px;max-width:1100px}table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-size:11.5px;text-transform:uppercase;letter-spacing:.4px}
input,select,textarea,button{font:inherit;background:#1f1f1f;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:7px 9px}
button{background:#e8e8e8;color:#0b0b0b;border:0;font-weight:600;cursor:pointer}
button.ghost{background:transparent;color:var(--text);border:1px solid var(--line);font-weight:400}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:18px}
.msg{padding:10px 14px;background:#242424;border-radius:9px;margin-bottom:14px}
.kpi{display:flex;gap:22px;flex-wrap:wrap}.kpi div b{font-size:22px;display:block}
.muted{color:var(--muted)}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
form.inline{display:contents}
</style></head><body>
<header><b>开源工具集后台</b>
<nav><?php foreach ($nav as $k => $label): ?><a class="<?= $p === $k ? 'on' : '' ?>" href="?p=<?= h($k) ?>"><?= h($label) ?></a><?php endforeach; ?></nav>
<span style="margin-left:auto"><a class="muted" href="?logout=1">退出</a></span></header>
<main>
<?php if ($msg !== ''): ?><div class="msg"><?= h($msg) ?></div><?php endif; ?>

<?php if ($p === 'dash'): ?>
<div class="card"><div class="kpi">
<div><span class="muted">总点击</span><b><?= (int) ($clickTotal[0]['n'] ?? 0) ?></b></div>
<div><span class="muted">生效赞助</span><b><?= count($activeSponsors) ?></b></div>
<div><span class="muted">活跃订阅</span><b><?= (int) ($subscribers[0]['n'] ?? 0) ?></b></div>
<div><span class="muted">合作咨询</span><b><?= count($inquiries) ?></b></div>
</div></div>
<div class="card"><h3>点击 Top 20</h3><table><tr><th>工具</th><th>点击</th></tr>
<?php foreach ($clickRows as $r): ?><tr><td><?= h($r['tool_id']) ?></td><td><?= (int) $r['n'] ?></td></tr><?php endforeach; ?>
<?php if (!$clickRows): ?><tr><td colspan="2" class="muted">暂无数据</td></tr><?php endif; ?></table></div>

<?php elseif ($p === 'sponsors'): ?>
<div class="card"><h3>新建 / 编辑赞助排期</h3>
<form method="post" class="row">
<input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="action" value="sponsor_save">
<input type="hidden" name="id" value="0">
<input name="tool_id" placeholder="tool id，如 excalidraw" required>
<select name="slot"><option value="homepage">首页推荐</option><option value="category">分类页顶部</option></select>
<input name="start_date" type="date" required><input name="end_date" type="date" required>
<select name="status"><option value="scheduled">已排期</option><option value="active">生效中</option></select>
<input name="note" placeholder="备注（不展示）">
<button>保存</button>
</form></div>
<div class="card"><h3>全部排期（<?= count($sponsors) ?>）</h3><table>
<tr><th>id</th><th>工具</th><th>版位</th><th>起</th><th>止</th><th>状态</th><th></th></tr>
<?php foreach ($sponsors as $r): ?><tr>
<td><?= (int) $r['id'] ?></td><td><?= h($r['tool_id']) ?></td><td><?= h($r['slot']) ?></td>
<td><?= h($r['start_date']) ?></td><td><?= h($r['end_date']) ?></td><td><?= h($r['status']) ?></td>
<td><form method="post" style="display:inline"><input type="hidden" name="csrf" value="<?= h($csrf) ?>">
<input type="hidden" name="action" value="sponsor_delete"><input type="hidden" name="id" value="<?= (int) $r['id'] ?>">
<button class="ghost">删除</button></form></td></tr><?php endforeach; ?>
<?php if (!$sponsors): ?><tr><td colspan="7" class="muted">还没有排期</td></tr><?php endif; ?></table></div>

<?php elseif ($p === 'affiliates'): ?>
<div class="card"><h3>联盟链接（改完即时生效，无需重新部署）</h3>
<form method="post" class="row">
<input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="action" value="affiliate_save">
<input name="tool_id" placeholder="tool id" required>
<input name="url" placeholder="https://…?ref=xxx" style="min-width:320px">
<label class="muted"><input type="checkbox" name="enabled" value="1" checked> 启用</label>
<input name="note" placeholder="备注">
<button>保存</button></form></div>
<div class="card"><table><tr><th>工具</th><th>链接</th><th>启用</th><th>更新</th><th></th></tr>
<?php foreach ($affiliates as $r): ?><tr>
<td><?= h($r['tool_id']) ?></td><td style="word-break:break-all"><?= h($r['url']) ?></td>
<td><?= (int) $r['enabled'] === 1 ? '是' : '否' ?></td><td class="muted"><?= h($r['updated_at']) ?></td>
<td><form method="post" style="display:inline"><input type="hidden" name="csrf" value="<?= h($csrf) ?>">
<input type="hidden" name="action" value="affiliate_delete"><input type="hidden" name="tool_id" value="<?= h($r['tool_id']) ?>">
<button class="ghost">删除</button></form></td></tr><?php endforeach; ?>
<?php if (!$affiliates): ?><tr><td colspan="5" class="muted">还没配置联盟链接。点「概览」看点击数据，或直接在这里添加。</td></tr><?php endif; ?></table></div>

<?php elseif ($p === 'inquiries'): ?>
<div class="card"><h3>合作咨询（<?= count($inquiries) ?>）</h3><table>
<tr><th>id</th><th>姓名</th><th>公司</th><th>邮箱</th><th>类型</th><th>留言</th><th>状态</th><th></th></tr>
<?php foreach ($inquiries as $r): ?><tr>
<td><?= (int) $r['id'] ?></td><td><?= h($r['name']) ?></td><td><?= h($r['company']) ?></td>
<td><?= h($r['email']) ?></td><td><?= h($r['type']) ?></td>
<td class="muted" style="max-width:340px"><?= h(mb_substr((string) $r['message'], 0, 200)) ?></td>
<td><?= h($r['status']) ?></td>
<td><form method="post"><input type="hidden" name="csrf" value="<?= h($csrf) ?>">
<input type="hidden" name="action" value="inquiry_status"><input type="hidden" name="id" value="<?= (int) $r['id'] ?>">
<select name="status"><option value="new">new</option><option value="contacted">contacted</option><option value="closed">closed</option></select>
<button class="ghost">更新</button></form></td></tr><?php endforeach; ?>
<?php if (!$inquiries): ?><tr><td colspan="8" class="muted">暂无咨询</td></tr><?php endif; ?></table></div>

<?php elseif ($p === 'subs'): ?>
<div class="card"><h3>收录提交队列（<?= count($subs) ?>）</h3>
<p class="muted">付费队列置顶并显示 SLA；未付款的付费提交不会进入工具库。</p><table>
<tr><th>id</th><th>仓库</th><th>档位</th><th>联系</th><th>SLA</th><th>状态</th><th>查询码</th><th></th></tr>
<?php foreach ($subs as $r): ?><?php $slaOver = !empty($r['sla_deadline']) && $r['sla_deadline'] < date('Y-m-d H:i:s') && in_array($r['status'], ['pending', 'paid_pending'], true); ?><tr>
<td><?= (int) $r['id'] ?></td><td style="word-break:break-all"><?= h($r['repo_url']) ?></td><td><?= h($r['tier']) ?></td>
<td><?= h($r['contact_email']) ?></td><td<?= $slaOver ? ' style="color:#f66;font-weight:bold" title="SLA 已超时"' : ' class="muted"' ?>><?= h((string) $r['sla_deadline']) ?></td>
<td><?= h($r['status']) ?></td><td class="muted"><?= h($r['query_code']) ?></td>
<td><form method="post"><input type="hidden" name="csrf" value="<?= h($csrf) ?>">
<input type="hidden" name="action" value="submission_status"><input type="hidden" name="id" value="<?= (int) $r['id'] ?>">
<select name="status"><option value="pending">pending</option><option value="paid_pending">paid_pending</option><option value="approved">approved</option><option value="rejected">rejected</option></select>
<button class="ghost">更新</button></form></td></tr><?php endforeach; ?>
<?php if (!$subs): ?><tr><td colspan="8" class="muted">暂无提交</td></tr><?php endif; ?></table></div>

<?php else: ?>
<div class="card"><h3>订阅者</h3>
<p>活跃订阅：<b><?= (int) ($subscribers[0]['n'] ?? 0) ?></b></p>
<p class="muted">模块六的订阅入口与周报发送尚未接入；表结构已就绪。</p></div>
<?php endif; ?>
</main></body></html>
