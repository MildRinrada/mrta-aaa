<?php
/**
 * เก็บหน้าบ้าน mrta-portal แบบผู้เยี่ยมชม (ไม่ล็อกอิน) เป็นไฟล์ดิบ สำหรับเว็บ static ต้นแบบ AAA (build.py แปลงต่อ)
 *
 * เรนเดอร์ในโปรเซส - ทุก request อยู่ในทรานแซกชันแล้ว rollback (log การเข้าชม / cache ไม่ค้างในฐานข้อมูล)
 * Mail / Queue / Notification ปลอม และ HTTP ออกไปข้างนอกตอบปลอมทั้งหมด
 *
 * ใช้: php capture.php <portal app dir> <out dir> <path,path,...>
 * ผลดิบมีข้อมูลจริง - เก็บไว้นอกโฟลเดอร์ที่ deploy เสมอ
 */

ini_set('memory_limit', '1024M');

[$_, $dir, $out, $paths] = $argv;
$paths = array_values(array_filter(explode(',', $paths)));
@mkdir($out . '/raw', 0775, true);

chdir($dir);
require $dir . '/vendor/autoload.php';
$app = require $dir . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;

config(['session.driver' => 'array']);
Mail::fake();
Queue::fake();
Notification::fake();
Http::fake(fn () => Http::response('', 200));

$base = rtrim(config('app.url'), '/');
$manifest = ['base' => $base, 'entries' => []];
const MAX_XHR = 150;

/**
 * กล่องใน /qa โหลดผ่าน qa/fetch (ไม่รีเฟรชหน้า) - เก็บคำตอบทุกแบบที่หน้าเปิดได้จากลิงก์ที่มี
 * ลิงก์ qa?category=..#qa-list → section=list / qa?faq=..#qa-faq + แท็บ data-category → section=faq / การ์ด data-id → section=thread
 */
function qaFetches(string $html, string $base): array
{
    $out = [];
    $html = str_replace('&amp;', '&', $html);
    preg_match_all('~' . preg_quote($base, '~') . '/qa\?([^"#\s]+)#qa-(list|faq)~', $html, $links, PREG_SET_ORDER);
    foreach ($links as $x) {
        parse_str($x[1], $q);
        if ($x[2] === 'faq' && isset($q['faq'])) {
            $out[] = ['section' => 'faq', 'faq' => $q['faq']];
        } else {
            $out[] = ['section' => 'list'] + array_intersect_key($q, array_flip(['q', 'category', 'status', 'sort', 'page']));
        }
    }
    if (preg_match_all('~js-qa-faq-tab[^>]*data-category="(\d*)"~', $html, $m)) {
        foreach ($m[1] as $c) $out[] = ['section' => 'faq', 'faq' => $c];
    }
    if (preg_match_all('~<article class="[^"]*\bjs-qa-post\b[^"]*" data-id="(\d+)"~', $html, $m)) {
        foreach ($m[1] as $id) $out[] = ['section' => 'thread', 'id' => $id];
    }
    return $out;
}

$seen = [];
$enqueue = function (array $params) use (&$paths, &$seen) {
    ksort($params);
    $key = 'xhr:/qa/fetch?' . http_build_query($params);
    if (isset($seen[$key]) || count($seen) >= MAX_XHR) return;
    $seen[$key] = true;
    $paths[] = $key;
};

for ($i = 0; $i < count($paths); $i++) {
    $path = $paths[$i];
    DB::beginTransaction();
    try {
        $xhr = str_starts_with($path, 'xhr:');
        $p = $xhr ? substr($path, 4) : $path;
        $server = ['HTTP_ACCEPT' => $xhr ? 'application/json, text/html' : 'text/html', 'HTTP_USER_AGENT' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0'];
        if ($xhr) $server['HTTP_X_REQUESTED_WITH'] = 'XMLHttpRequest';
        $req = Request::create($base . $p, 'GET', [], [], [], $server);
        $req->setLaravelSession($app['session']->driver('array'));
        $resp = $kernel->handle($req);
        $body = (string) $resp->getContent();
        $kernel->terminate($req, $resp);
    } finally {
        DB::rollBack();
    }
    $file = 'raw/' . sha1($path) . ($xhr ? '.data' : '.html');
    file_put_contents($out . '/' . $file, $body);
    $manifest['entries'][] = ['p' => $p, 'xhr' => $xhr, 's' => $resp->getStatusCode(), 'ct' => (string) $resp->headers->get('Content-Type'), 'f' => $file];
    echo str_pad($resp->getStatusCode(), 4), $path, ' ', strlen($body), "\n";

    if ($p === '/qa' || str_starts_with($p, '/qa/fetch')) {
        $html = $xhr ? (json_decode($body, true)['html'] ?? '') : $body;
        foreach (qaFetches($html, $base) as $params) $enqueue($params);
    }
}

file_put_contents($out . '/manifest.json', json_encode($manifest, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
