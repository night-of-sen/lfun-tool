<?php
// GET /api/slots.php?slot=homepage|category&lang=zh|en&category=<key>
// 返回当前生效的赞助卡片 HTML（PRD 模块三）。
// 静态站构建期读不到数据库，所以由前端运行时注入；没有生效赞助时返回空，前端保持隐藏不留空位。
declare(strict_types=1);
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/util.php';

$slot = (string) ($_GET['slot'] ?? '');
if (!in_array($slot, ['homepage', 'category'], true)) { fail('slot 不合法'); }
$lang = (($_GET['lang'] ?? 'zh') === 'en') ? 'en' : 'zh';
$cat = preg_replace('/[^a-z0-9_-]/i', '', (string) ($_GET['category'] ?? ''));
$limit = $slot === 'homepage' ? 3 : 1;   // PRD：首页最多 3 个，每分类最多 1 个
$today = date('Y-m-d');

try {
  // 到期自动下架，无需人工干预（PRD 3.4）
  db()->prepare('UPDATE sponsorships SET status = ? WHERE status = ? AND end_date < ?')
      ->execute(['expired', 'active', $today]);

  $st = db()->prepare('SELECT tool_id FROM sponsorships WHERE slot = ? AND status = ? AND start_date <= ? AND end_date >= ? ORDER BY id ASC');
  $st->execute([$slot, 'active', $today, $today]);
  $ids = array_map(fn($r) => (string) $r['tool_id'], $st->fetchAll());
} catch (Throwable $e) {
  json_out(['ok' => true, 'html' => '', 'count' => 0]);   // 库挂了不影响页面
}

if (!$ids) { json_out(['ok' => true, 'html' => '', 'count' => 0]); }

// 工具数据来自构建产物，不需要数据库
$items = [];
$dataFile = __DIR__ . '/../data/tools.json';
if (is_file($dataFile)) {
  $decoded = json_decode((string) file_get_contents($dataFile), true);
  if (is_array($decoded) && isset($decoded['items']) && is_array($decoded['items'])) {
    foreach ($decoded['items'] as $t) { $items[(string) $t['id']] = $t; }
  }
}

// 该工具有没有联盟链接（决定外链是否走 /go/）
$aff = [];
try {
  $as = db()->query('SELECT tool_id FROM affiliates WHERE enabled = 1 AND url <> \'\'');
  foreach ($as->fetchAll() as $r) { $aff[(string) $r['tool_id']] = true; }
} catch (Throwable $e) {}

$badge = $lang === 'zh' ? '赞助' : 'Sponsored';
$html = '';
foreach ($ids as $id) {
  $t = $items[$id] ?? null;
  if (!$t) { continue; }
  if ($slot === 'category' && $cat !== '' && (string) ($t['category'] ?? '') !== $cat) { continue; }
  $name = (string) ($t['name'] ?? $id);
  $repo = (string) ($t['repo'] ?? '');
  $desc = $lang === 'zh' ? (string) ($t['desc'] ?? '') : (string) ($t['descEn'] ?? $t['desc'] ?? '');
  $out = (string) ($t['cloud'] ?? '') ?: ((string) ($t['homepage'] ?? '') ?: ('https://github.com/' . $repo));
  $href = isset($aff[$id]) ? '/go/' . rawurlencode($id) . '/' : $out;
  $rel = isset($aff[$id]) ? 'sponsored nofollow noopener' : 'sponsored nofollow noopener';
  $owner = explode('/', $repo)[0];
  $initial = mb_substr($name, 0, 1);

  $html .= '<article class="card sponsor-card">'
    . '<div class="card-head">'
    . '<img class="icon" src="https://github.com/' . h($owner) . '.png?size=96" alt="" loading="lazy" data-initial="' . h($initial) . '" onerror="iconFail(this)">'
    . '<div class="card-titles">'
    . '<h3 class="card-name"><a href="/tool/' . h($id) . '/">' . h($name) . '</a> <span class="sponsor-badge">' . h($badge) . '</span></h3>'
    . '<div class="card-repo">' . h($repo) . '</div>'
    . '</div></div>'
    . '<p class="card-desc">' . h($desc) . '</p>'
    . '<div class="card-foot"><span class="stat">★ <span class="star-n">' . h(number_format((int) ($t['stars'] ?? 0))) . '</span></span>'
    . '<span class="actions"><a class="btn-primary" href="' . h($href) . '" target="_blank" rel="' . $rel . '">'
    . h($lang === 'zh' ? '访问官网' : 'Visit site') . '</a></span></div>'
    . '</article>';
  if ($slot === 'category') { break; }
}
json_out(['ok' => true, 'html' => $html, 'count' => $html === '' ? 0 : substr_count($html, '<article')]);
