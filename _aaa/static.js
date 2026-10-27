/*
 * ต้นแบบ AAA (static) - ตอบแทนเซิร์ฟเวอร์ของ mrta-portal ในเบราว์เซอร์
 *  - GET /qa/fetch?...      → คำตอบที่เก็บไว้ใน /_data/qa/ (คีย์ = พารามิเตอร์เรียงตามชื่อ ตรงกับ build.py)
 *  - POST /cookie/...       → บันทึกคุกกี้สำเร็จ (ไม่มีเซิร์ฟเวอร์จริง)
 *  - GET /my/notification/  → ว่าง (ผู้เยี่ยมชมไม่มีกระดิ่ง)
 * โหลดก่อนสคริปต์ของหน้า (build.py ใส่ไว้ต้น <head>)
 */
(function () {
    'use strict';

    var index = null;
    function loadIndex() {
        if (!index) index = window.__origFetch('/_data/qa/index.json').then(function (r) { return r.json(); }).catch(function () { return {}; });
        return index;
    }

    function keyOf(search) {
        var pairs = [];
        new URLSearchParams(search).forEach(function (v, k) { pairs.push([k, v]); });
        pairs.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0); });
        // ตรงกับ urllib.parse.urlencode ของ build.py (เว้นวรรค = +)
        return pairs.map(function (p) { return encodeURIComponent(p[0]) + '=' + encodeURIComponent(p[1]).replace(/%20/g, '+'); }).join('&');
    }

    var NOT_IN_DEMO = '<div class="aaa-demo-note" role="status"><p>ผลแบบนี้ไม่มีในต้นแบบ (เว็บ static ไม่ได้เชื่อมฐานข้อมูล) ลองเลือกหมวดหรือแท็บอื่น</p></div>';

    function json(obj, status) {
        return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
    }

    /** คืน Promise<Response> ถ้าเป็นคำขอที่ต้องตอบแทน ไม่งั้น null */
    function answer(method, rawUrl) {
        var url = new URL(rawUrl, location.href);
        if (url.origin !== location.origin) return null;
        if (url.pathname === '/qa/fetch') {
            return loadIndex().then(function (idx) {
                var file = idx[keyOf(url.search)];
                return file ? window.__origFetch('/_data/qa/' + file) : json({ status: 'success', html: NOT_IN_DEMO });
            });
        }
        if (/^\/cookie\//.test(url.pathname)) return Promise.resolve(json({ status: 200, success: true, message: 'ok' }));
        if (/^\/my\/notification\//.test(url.pathname)) return Promise.resolve(json({ status: 200, count: 0, items: [] }));
        return null;
    }

    window.__origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || String(input);
        var method = (init && init.method) || (input && input.method) || 'GET';
        return answer(method.toUpperCase(), url) || window.__origFetch(input, init);
    };

    // jQuery $.ajax ใช้ XMLHttpRequest - ตอบด้วยค่าเดียวกันกับ fetch
    var XHR = window.XMLHttpRequest;
    var open = XHR.prototype.open, send = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
        this.__aaa = { method: String(method).toUpperCase(), url: url };
        return open.apply(this, arguments);
    };
    XHR.prototype.send = function () {
        var xhr = this, info = xhr.__aaa, p = info && answer(info.method, info.url);
        if (!p) return send.apply(this, arguments);
        p.then(function (res) { return res.text().then(function (text) { return [res.status, text]; }); }).then(function (r) {
            var props = { readyState: 4, status: r[0], statusText: 'OK', responseText: r[1], response: r[1], responseURL: String(info.url) };
            Object.keys(props).forEach(function (k) { Object.defineProperty(xhr, k, { configurable: true, value: props[k] }); });
            xhr.getAllResponseHeaders = function () { return 'content-type: application/json\r\n'; };
            xhr.getResponseHeader = function (h) { return /content-type/i.test(h) ? 'application/json' : null; };
            // dispatchEvent เรียก onload / onreadystatechange ที่ตั้งเป็น property ให้ด้วย
            ['readystatechange', 'load', 'loadend'].forEach(function (t) { xhr.dispatchEvent(new Event(t)); });
        });
    };
})();
