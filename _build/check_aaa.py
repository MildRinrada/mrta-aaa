# -*- coding: utf-8 -*-
"""
ตรวจหน้าเว็บตามเกณฑ์ WCAG 2.2 ระดับ AAA ด้วย 2 เครื่องมือ (เปิดหน้าใน Chromium จริงผ่าน Playwright)
  - HTML_CodeSniffer มาตรฐาน WCAG2AAA: แบ่งผลเป็น Error / Warning / Notice แบบเดียวกับรายงาน webcheck.aaa.in.th
  - axe-core แท็ก wcag2a..wcag22aa + wcag2aaa
ใช้: python check_aaa.py <base url> [path ...] [--modes] [--json out.json]
     --modes = ตรวจซ้ำทุกโหมดสีของแผงการเข้าถึง (ปกติ / คอนทราสต์สูง / ขาวดำ / เหลืองดำ) และตัวอักษรใหญ่
สคริปต์ของเครื่องมือดาวน์โหลดครั้งแรกไว้ที่ _build/vendor (เวอร์ชันตรึงไว้ ไม่ deploy)
"""
import json
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')
VENDOR = Path(__file__).resolve().parent / 'vendor'
LIBS = {
    'HTMLCS.js': 'https://cdn.jsdelivr.net/npm/html_codesniffer@2.5.1/build/HTMLCS.js',
    'axe.min.js': 'https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js',
}
MODES = [('normal', 'md'), ('high', 'md'), ('bw', 'md'), ('yb', 'md'), ('normal', 'lg')]


def libs():
    VENDOR.mkdir(exist_ok=True)
    out = {}
    for name, url in LIBS.items():
        f = VENDOR / name
        if not f.is_file():
            urllib.request.urlretrieve(url, f)
        out[name] = f.read_text(encoding='utf-8')
    return out


RUN_HTMLCS = """() => new Promise(done => {
    HTMLCS.process('WCAG2AAA', document, () => {
        const msgs = HTMLCS.getMessages().map(m => ({
            type: m.type, code: m.code, msg: m.msg,
            el: m.element && m.element.outerHTML ? m.element.outerHTML.slice(0, 160) : String(m.element && m.element.nodeName),
        }));
        done(msgs);
    });
})"""

RUN_AXE = """() => axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'wcag2aaa'] },
    resultTypes: ['violations'],
}).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length,
    nodes: v.nodes.slice(0, 3).map(x => x.html.slice(0, 160) + ' | ' + (x.failureSummary || '').split('\\n').slice(1, 2).join(' ')) })))"""


def check(page, url, lib, mode=None):
    page.goto(url, wait_until='load')
    if mode:
        page.evaluate("""([c, f]) => { const api = window.mrtaA11y; const s = Object.assign(api.load(), { contrast: c, font: f }); api.apply(s); }""", list(mode))
    page.wait_for_timeout(900)
    page.add_script_tag(content=lib['HTMLCS.js'])
    page.add_script_tag(content=lib['axe.min.js'])
    return page.evaluate(RUN_HTMLCS), page.evaluate(RUN_AXE)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    base, paths = args[0].rstrip('/'), args[1:] or ['/', '/about-us', '/qa']
    out_json = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
    if out_json in paths:
        paths.remove(out_json)
    modes = MODES if '--modes' in sys.argv else [None]
    lib = libs()
    report, total = {}, {'error': 0, 'warning': 0, 'notice': 0, 'axe': 0}
    with sync_playwright() as p:
        b = p.chromium.launch()
        for path in paths:
            for mode in modes:
                ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='th-TH')
                page = ctx.new_page()
                hc, ax = check(page, base + path, lib, mode)
                ctx.close()
                label = path + ('' if not mode else f' [{mode[0]}/{mode[1]}]')
                cnt = {t: sum(1 for m in hc if m['type'] == n) for t, n in (('error', 1), ('warning', 2), ('notice', 3))}
                for k in cnt:
                    total[k] += cnt[k]
                total['axe'] += len(ax)
                report[label] = {'counts': cnt, 'htmlcs': hc, 'axe': ax}
                print(f"{label}: Errors {cnt['error']}  Warnings {cnt['warning']}  Notices {cnt['notice']}  | axe violations {len(ax)}")
                groups = {}
                for m in hc:
                    if m['type'] in (1, 2):
                        groups.setdefault((m['type'], m['code']), []).append(m)
                for (t, code), ms in sorted(groups.items()):
                    print(f"   {'E' if t == 1 else 'W'} x{len(ms)} {code.replace('WCAG2AAA.', '')}")
                    print(f"        {ms[0]['msg'][:150]}")
                    print(f"        {ms[0]['el'][:150]}")
                for v in ax:
                    print(f"   axe {v['id']} ({v['impact']}) x{v['n']}: {v['help']}")
                    for n in v['nodes'][:2]:
                        print(f"        {n[:220]}")
        b.close()
    print(f"\nTOTAL Errors {total['error']}  Warnings {total['warning']}  Notices {total['notice']}  axe {total['axe']}")
    if out_json:
        Path(out_json).write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
