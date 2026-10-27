/*
 * แก้ markup ให้ตรงเกณฑ์ WCAG 2.2 ระดับ AAA - transform.py เรียกตอน build (ทำงานบน DOMParser: สคริปต์ของหน้าไม่ทำงาน)
 * รับ { html, fragment } คืน html ที่แก้แล้ว (fragment = html ย่อยจาก qa/fetch)
 */
(input) => {
    const { html, fragment } = input;
    const doc = new DOMParser().parseFromString(
        fragment ? '<!doctype html><html lang="th"><head></head><body>' + html + '</body></html>' : html, 'text/html');
    const body = doc.body;
    const ABBR = { 'รฟม.': 'การรถไฟฟ้าขนส่งมวลชนแห่งประเทศไทย' };
    const hidden = (el) => !!el.closest('[aria-hidden="true"]');   // บล็อกที่ซ่อนจากผู้ใช้ (ไม่แตะ)
    const sr = (text) => { const s = doc.createElement('span'); s.className = 'visually-hidden'; s.textContent = text; return s; };

    // 3.2.5 เปลี่ยนบริบทเมื่อผู้ใช้ร้องขอเท่านั้น: ไม่เปิดหน้าต่างใหม่เอง - ลิงก์ภายนอกบอกไว้ในชื่อลิงก์
    body.querySelectorAll('a[target]').forEach((a) => {
        if (hidden(a)) return;
        a.removeAttribute('target');
        if (!/^https?:\/\//i.test(a.getAttribute('href') || '')) return;
        if (a.hasAttribute('aria-label')) a.setAttribute('aria-label', a.getAttribute('aria-label') + ' (เว็บไซต์ภายนอก)');
        else a.appendChild(sr(' (เว็บไซต์ภายนอก)'));
    });

    // 3.1.4 คำย่อ: บอกคำเต็มด้วย <abbr title>
    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach((t) => {
        const p = t.parentElement;
        if (!p || p.closest('script, style, textarea, abbr, title, option, [aria-hidden="true"]')) return;
        Object.entries(ABBR).forEach(([abbr, full]) => {
            if (!t.parentNode || !t.nodeValue.includes(abbr)) return;
            // มีคำเต็มอยู่ติดกันแล้ว เช่น "การรถไฟฟ้า...แห่งประเทศไทย (รฟม.)" - ผ่านเกณฑ์อยู่แล้ว ไม่ต้องแตะ
            if (t.nodeValue.replace(/\s+/g, '').includes(full + '(' + abbr + ')')) return;
            const parts = t.nodeValue.split(abbr);
            // ห่อด้วย <span> เดียว: ข้อความที่อยู่ตรงใน flex/grid (เช่น ที่อยู่ใน footer) จะไม่แตกเป็นหลายชิ้น
            const frag = doc.createElement('span');
            parts.forEach((part, i) => {
                if (part) frag.appendChild(doc.createTextNode(part));
                if (i < parts.length - 1) {
                    const a = doc.createElement('abbr');
                    a.title = full;
                    a.textContent = abbr;
                    frag.appendChild(a);
                }
            });
            t.parentNode.replaceChild(frag, t);
        });
    });

    // 1.3.1 กลุ่มลิงก์นำทาง (ภาษา / ลิงก์ท้ายหน้า / รายการการ์ด / แท็บกรอง) เป็นรายการ <ul><li> (H48)
    const toList = (el) => {
        if (el.closest('ul, ol') || hidden(el)) return;
        const ul = doc.createElement('ul');
        Array.from(el.attributes).forEach((a) => ul.setAttribute(a.name, a.value));
        if (ul.getAttribute('role') === 'group') ul.removeAttribute('role');   // รายการบอกการจัดกลุ่มเองแล้ว
        ul.classList.add('aaa-ul');
        Array.from(el.childNodes).forEach((n) => {
            if (n.nodeType === 3 && !n.nodeValue.trim()) return;
            const li = doc.createElement('li');
            if (n.nodeType === 1 && (n.getAttribute('aria-hidden') === 'true' || /(^|\s)(sep|mf-copy-sep)(\s|$)/.test(n.className))) li.setAttribute('aria-hidden', 'true');
            li.appendChild(n);
            ul.appendChild(li);
        });
        el.replaceWith(ul);
    };

    // ข้อความยาวที่มีลิงก์แทรก (แถบคุกกี้) ไม่ใช่เมนู - ห่อลิงก์ด้วย <span> ให้เป็นประโยคเดียวกัน
    body.querySelectorAll('.cookie-container > div').forEach((d) => {
        d.querySelectorAll(':scope > a').forEach((a) => { const s = doc.createElement('span'); a.replaceWith(s); s.appendChild(a); });
    });

    if (fragment) {
        body.querySelectorAll('.qa-status-tabs').forEach(toList);
        return body.innerHTML;
    }

    const head = doc.head;
    const aaaCss = head.querySelector('link[href="/_aaa/aaa.css"]');

    // stylesheet ที่อยู่ใน <body> → <head> (ก่อน aaa.css ซึ่งต้องอยู่ท้ายสุด)
    body.querySelectorAll('link[rel="stylesheet"]').forEach((l) => head.insertBefore(l, aaaCss));

    // แถบเมนูบน/ส่วนท้ายเป็นพื้นน้ำเงินทึบ (เดิมวางบนท้องฟ้า/ก้อนเมฆ) → โลโก้สีขาว
    body.querySelectorAll('.nav-logo img, .mf-logo img').forEach((img) => {
        img.setAttribute('src', img.getAttribute('src').replace(/logo-footer\.svg/, 'logo-white.svg'));
    });

    // ลิงก์ข้ามไปเนื้อหาหลักต้องมีปลายทาง
    const main = body.querySelector('main');
    if (main && !doc.getElementById('main-content')) main.id = 'main-content';
    if (main && !main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');

    // ปุ่มลอยกลับด้านบน (position: fixed บังเนื้อหาที่โฟกัส - 2.4.12) → ลิงก์ในแถบล่างของ footer
    body.querySelectorAll('#btn_back_to_top').forEach((b) => b.remove());
    body.id = body.id || 'page-top';
    const bottom = body.querySelector('.mf-bottom-links');
    if (bottom) {
        const sep = bottom.querySelector('.mf-copy-sep, .sep');
        if (sep) bottom.appendChild(sep.cloneNode(true));
        const top = doc.createElement('a');
        top.href = '#page-top';
        top.className = 'aaa-to-top';
        top.textContent = 'กลับขึ้นด้านบน';
        bottom.appendChild(top);
    }

    body.querySelectorAll('.nav-lang, .mf-bottom-links, .nav-drawer-secondary, .ph-hl-list, .ph-news-list, .qa-status-tabs').forEach(toList);

    // แถบคุกกี้ไว้ท้ายสุดของหน้า (aaa.css ทำเป็น sticky ที่ขอบล่าง แทน fixed)
    body.querySelectorAll('.cookie-nav').forEach((c) => body.appendChild(c));

    // ป้ายต้นแบบ (อยู่ในเนื้อหาปกติ ไม่ลอย) ต่อจากลิงก์ข้ามไปเนื้อหาหลัก
    const note = doc.createElement('div');
    note.className = 'aaa-proto';
    note.setAttribute('role', 'note');
    note.innerHTML = '<span class="aaa-proto-badge">AAA</span><span>ต้นแบบหน้าเว็บตามเกณฑ์ WCAG 2.2 ระดับ AAA (มอก. 2565-2555) - เว็บ static สำหรับนำเสนอ ลิงก์ไปหน้าอื่นยังไม่เปิดใช้งาน</span>';
    const skip = body.querySelector('.a11y-skip');
    body.insertBefore(note, skip ? skip.nextSibling : body.firstChild);

    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}
