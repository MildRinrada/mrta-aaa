# -*- coding: utf-8 -*-
"""
แก้ markup ตามเกณฑ์ AAA ด้วย aaa-transform.js ใน Chromium (DOMParser - สคริปต์ของหน้าไม่ทำงาน) แล้วเขียนทับไฟล์
ใช้: python transform.py <ไฟล์ .html หรือ .json ของ qa/fetch ...>   (build.py เรียกให้)
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

JS = (Path(__file__).resolve().parent / 'aaa-transform.js').read_text(encoding='utf-8')

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    page.set_content('<!doctype html><html><body></body></html>')
    for f in map(Path, sys.argv[1:]):
        if f.suffix == '.json':
            data = json.loads(f.read_text(encoding='utf-8'))
            data['html'] = page.evaluate(JS, {'html': data.get('html', ''), 'fragment': True})
            f.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        else:
            f.write_text(page.evaluate(JS, {'html': f.read_text(encoding='utf-8'), 'fragment': False}), encoding='utf-8')
    b.close()
print(f'transform: {len(sys.argv) - 1} files')
