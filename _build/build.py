# -*- coding: utf-8 -*-
"""
สร้างเว็บ static ต้นแบบ AAA ของหน้าแรก mrta-portal จากผล capture.php (ไม่ต้องใช้ฐานข้อมูล - อ่านไฟล์ดิบอย่างเดียว)

    python build.py <raw dir> <site dir> [--plain]

1) หน้าแรก → index.html (หน้าอื่นไม่อยู่ในต้นแบบ เปิดแล้วได้ 404.html)
2) แทนข้อมูลส่วนบุคคลด้วยข้อมูลสมมติ (ตารางจาก pii_dict.php ของ mrta-back-office) และล้างค่าลับ (CSRF)
3) http://portal.mrta.test/... → /... ก๊อปไฟล์ static ที่หน้าใช้จาก public ของ portal
   ลิงก์ไปหน้าอื่น / ระบบอื่น (news, belib, ...) เปิดแล้วได้หน้า 404 "ไม่อยู่ในต้นแบบนี้"
4) ชั้น AAA (เว้นเมื่อ --plain): _aaa/aaa.css และแก้ markup ด้วย _build/aaa-transform.js (DOMParser ใน Chromium)

ผลดิบจาก capture มีข้อมูลจริง - เก็บไว้นอกโฟลเดอร์ที่ deploy เสมอ
"""
import hashlib
import json
import posixpath
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, parse_qsl, urlencode

RAW, SITE = Path(sys.argv[1]), Path(sys.argv[2])
PLAIN = '--plain' in sys.argv
HERE = Path(__file__).resolve().parent
APP = Path(r'C:\XAMPP 8.5\mrta-portal')
PAGES = {'/': 'index.html'}
OTHER = 'auth|belib|booking|knowledge|learnext|news'
ASSET_EXT = 'css|js|mjs|png|jpe?g|gif|svg|webp|ico|avif|woff2?|ttf|eot|otf|json|map|mp4|webm|mp3'
MAX_ASSET = 8 * 1024 * 1024
STOP = {'admin', 'test', 'user', 'member', 'demo', 'tester', 'staff', 'guest', 'system', 'root', 'manager', 'editor', 'viewer'}
FILE_TLD = {'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js', 'json', 'map', 'woff', 'woff2', 'ttf', 'ico', 'php', 'html', 'txt', 'xml', 'pdf', 'min'}
ROLE_MAIL = {'info', 'contact', 'noreply', 'no-reply', 'support', 'webmaster', 'library', 'callcenter', 'saraban', 'pr', 'admin'}
COOKIE_JS = '/cookie-consent/script.js'


class Scrub:
    """แทนชื่อ/อีเมล/เบอร์ของผู้ใช้จริงด้วยข้อมูลสมมติ (ชุดเดียวกับเว็บทดลองหลังบ้าน)"""

    EMAIL = re.compile(r'(?<![A-Za-z0-9._%+\-])([A-Za-z0-9._%+\-]+)@([A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.([A-Za-z]{2,}))(?![A-Za-z0-9\-])')
    PHONE = re.compile(r'(?<![\d])(0[689]\d)([- ]?)(\d{3})([- ]?)(\d{4})(?![\d])')

    def __init__(self, d):
        self.allow = set(d.get('allow', []))
        self.allow_digits = {re.sub(r'\D', '', a) for a in self.allow if re.sub(r'\D', '', a)}
        self.map = {}
        for real, fake in list(d['pairs'].items()) + list(d['masked'].items()):
            r = real.strip()
            if len(r) < 3 or (r.isdigit() and len(r) < 6) or r.lower() in STOP:
                continue
            self.map.setdefault(r, fake)
            if not r.isascii():
                self.map.setdefault(json.dumps(r)[1:-1], json.dumps(fake)[1:-1])
        keys = sorted(self.map, key=len, reverse=True)
        plain = [k for k in keys if not k.isascii() or k.startswith('\\u')]
        words = [k for k in keys if k.isascii() and not k.startswith('\\u')]
        self.re_plain = re.compile('|'.join(map(re.escape, plain))) if plain else None
        self.re_words = re.compile(r'(?<![A-Za-z0-9_@.])(?:' + '|'.join(map(re.escape, words)) + r')(?![A-Za-z0-9_])') if words else None
        self.emails = {}

    def _email(self, m):
        full, local, tld = m.group(0), m.group(1), m.group(3).lower()
        if tld in FILE_TLD or full.endswith('example.com') or full in self.allow or local.lower() in ROLE_MAIL:
            return full
        return self.emails.setdefault(full, f'person{len(self.emails) + 1}@example.com')

    def _phone(self, m):
        digits = ''.join(m.group(1, 3, 5))
        if digits in self.allow_digits:
            return m.group(0)
        h = hashlib.md5(('p' + digits).encode()).hexdigest()
        fake = ''.join(str(int(c, 16) % 10) for c in h[:7])
        return f'{m.group(1)}{m.group(2)}{fake[:3]}{m.group(4)}{fake[3:]}'

    def text(self, s):
        if self.re_plain:
            s = self.re_plain.sub(lambda m: self.map[m.group(0)], s)
        if self.re_words:
            s = self.re_words.sub(lambda m: self.map[m.group(0)], s)
        s = self.EMAIL.sub(self._email, s)
        return self.PHONE.sub(self._phone, s)


# ---------------------------------------------------------------- URL / ค่าลับ
def rewrite(s):
    # ลิงก์หน้าแรก (ไม่มี / ต่อท้าย) → "/" ไม่งั้นได้ href="" ที่ไม่ใช่ลิงก์
    s = re.sub(r'(?:https?:)?(\\?/)\\?/portal\.mrta\.test(?::\d+)?(?=\\?["\'#?])', lambda m: m.group(1), s)
    s = re.sub(r'(?:https?:)?(\\?/)\\?/portal\.mrta\.test(?::\d+)?(?=[/\\]|$)', '', s)
    s = re.sub(r'(?:https?:)?(\\?/)\\?/(' + OTHER + r')\.mrta\.test(?::\d+)?', lambda m: m.group(1) + m.group(2), s)
    s = re.sub(r'/cookie-consent/script\?id=[0-9a-f]+', COOKIE_JS, s)
    return s


def scrub_secrets(s):
    s = re.sub(r'<script\b[^>]*id="browser-logger-active"[^>]*>.*?</script>', '', s, flags=re.S | re.I)
    s = re.sub(r'(<meta\s+name="csrf-token"\s+content=")[^"]*(")', r'\1demo-token\2', s, flags=re.I)
    s = re.sub(r'''((?:csrf[_-]?token|_token)["']?\s*[:,=]\s*["'])[A-Za-z0-9]{40}(["'])''', r'\1demo-token\2', s, flags=re.I)
    return re.sub(r'(<input\b[^>]*name="_token"[^>]*value=")[^"]*(")', r'\1demo-token\2', s, flags=re.I)


# ---------------------------------------------------------------- ไฟล์ static
copied, missing = {COOKIE_JS.lstrip('/')}, set()  # สคริปต์คุกกี้เขียนเองจากผล capture ไม่ได้ก๊อปจาก public
ASSET_RE = re.compile(r'''(?<![\w/:.])/((?!_aaa/|_data/)[^"'\s()<>\\?#,&]+?\.(?:%s))(?=[?#"'\s)<>\\,&]|$)''' % ASSET_EXT, re.I)
CSS_REF = re.compile(r'''url\(\s*["']?([^"')]+?)["']?\s*\)|@import\s+["']([^"']+)["']''', re.I)


def copy_asset(rel):
    rel = posixpath.normpath(unquote(rel).lstrip('/'))
    if rel.startswith('..') or rel in copied:
        return
    copied.add(rel)
    src = APP / 'public' / rel
    if not src.is_file() and rel.startswith('storage/'):
        src = APP / 'storage' / 'app' / 'public' / rel[8:]
    if not src.is_file():
        missing.add('/' + rel)
        return
    if src.stat().st_size > MAX_ASSET:
        missing.add(f'/{rel} (ใหญ่เกิน {src.stat().st_size // 1048576}MB)')
        return
    dst = SITE / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    if rel.lower().endswith('.css'):
        css = rewrite(src.read_text(encoding='utf-8', errors='replace'))
        for a, b in CSS_REF.findall(css):
            ref = (a or b).strip().split('?')[0].split('#')[0]
            if not ref or re.match(r'^(data:|https?:|//|about:|#)', ref, re.I):
                continue
            copy_asset(ref if ref.startswith('/') else posixpath.join(posixpath.dirname(rel), ref))
        dst.write_text(css, encoding='utf-8')
    else:
        shutil.copyfile(src, dst)


def collect_assets(text):
    for m in ASSET_RE.finditer(text.replace('\\/', '/')):
        copy_asset(m.group(1))


def qa_key(path):
    """คีย์ของคำตอบ qa/fetch = พารามิเตอร์เรียงตามชื่อ (static.js สร้างแบบเดียวกัน)"""
    q = path.split('?', 1)[1] if '?' in path else ''
    return urlencode(sorted((k, v) for k, v in parse_qsl(q, keep_blank_values=True)))


def main():
    man = json.loads((RAW / 'manifest.json').read_text(encoding='utf-8'))
    scrub = Scrub(json.loads((RAW / 'pii.json').read_text(encoding='utf-8')))

    # ล้างผลรอบก่อน (คงไฟล์ที่เขียนมือ: _build, _aaa, 404.html, vercel.json, .vercelignore)
    keep = {'_build', '_aaa', '404.html', 'vercel.json', '.vercelignore', '.git', 'README.md'}
    if SITE.exists():
        for p in SITE.iterdir():
            if p.name not in keep:
                shutil.rmtree(p) if p.is_dir() else p.unlink()
    SITE.mkdir(parents=True, exist_ok=True)

    pages, qa_index = {}, {}
    for e in man['entries']:
        body = (RAW / e['f']).read_text(encoding='utf-8')
        if e['p'].startswith('/cookie-consent/script'):
            js = scrub.text(rewrite(body))
            collect_assets(js)
            out = SITE / COOKIE_JS.lstrip('/')
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(js, encoding='utf-8')
        elif e['xhr'] and '/qa' in PAGES:
            data = json.loads(body)
            data['html'] = scrub.text(rewrite(data.get('html', '')))
            collect_assets(data['html'])
            name = hashlib.sha1(qa_key(e['p']).encode()).hexdigest()[:16] + '.json'
            qa_index[qa_key(e['p'])] = name
            out = SITE / '_data' / 'qa' / name
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        elif e['p'] in PAGES:
            html = scrub.text(rewrite(scrub_secrets(body)))
            collect_assets(html)
            pages[PAGES[e['p']]] = html

    if qa_index:
        (SITE / '_data' / 'qa').mkdir(parents=True, exist_ok=True)
        (SITE / '_data' / 'qa' / 'index.json').write_text(json.dumps(qa_index, ensure_ascii=False), encoding='utf-8')
    for name in ('favicon.ico', 'favicon.svg'):
        copy_asset(name)

    for name, html in pages.items():
        # สคริปต์ตอบแทนเซิร์ฟเวอร์ (qa/fetch, บันทึกคุกกี้) ต้องมาก่อนสคริปต์ของหน้า
        tags = '<meta name="robots" content="noindex, nofollow"><script src="/_aaa/static.js"></script>'
        html = re.sub(r'(<head\b[^>]*>)', lambda m: m.group(1) + tags, html, count=1, flags=re.I)
        if not PLAIN:
            # aaa.css ต้องอยู่ท้ายสุด (ทับสีของธีม) - transform ย้าย stylesheet ใน <body> มาไว้ก่อนไฟล์นี้
            html = re.sub(r'</head>', '<link rel="stylesheet" href="/_aaa/aaa.css"></head>', html, count=1, flags=re.I)
        (SITE / name).write_text(html, encoding='utf-8')

    if not PLAIN:
        targets = [str(SITE / n) for n in pages] + [str(p) for p in (SITE / '_data' / 'qa').glob('*.json') if p.name != 'index.json']  # ไม่มีโฟลเดอร์ = ว่าง
        subprocess.run([sys.executable, '-I', str(HERE / 'transform.py'), *targets], check=True)

    # ตรวจข้อมูลจริงหลงเหลือ
    d = json.loads((RAW / 'pii.json').read_text(encoding='utf-8'))
    fakes = set(d['pairs'].values()) | set(d['masked'].values())
    reals = [k for k in d['pairs'] if len(k.strip()) >= 3 and k.strip().lower() not in STOP and k not in fakes]
    left = set()
    for p in SITE.rglob('*'):
        if p.is_file() and p.suffix in ('.html', '.json', '.js') and '_build' not in p.parts and '.git' not in p.parts:
            t = p.read_text(encoding='utf-8', errors='ignore')
            left.update(r for r in reals if r in t)
    size = sum(p.stat().st_size for p in SITE.rglob('*') if p.is_file() and '_build' not in p.parts and '.git' not in p.parts)
    print(f'pages {len(pages)}, qa data {len(qa_index)}, assets {len(copied)}, missing {len(missing)}')
    for m in sorted(missing)[:20]:
        print('  missing', m)
    print(f'site size {size / 1048576:.1f} MB')
    print('LEFTOVER real values:', ', '.join(sorted(left)[:10]) if left else 'none')


if __name__ == '__main__':
    main()
