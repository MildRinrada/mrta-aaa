/* =============================================================================
   Component: nav-search - ช่องค้นหา + autocomplete บน top nav
   ใช้ร่วมกันระหว่าง mrta-portal และ mrta-learnext (ไฟล์เนื้อหาเดียวกัน แก้ที่หนึ่งให้แก้อีกที่ด้วย)
   ไม่พึ่ง jQuery / bootstrap JS - สองระบบใช้ bootstrap คนละรุ่น

   แผง  : [data-nav-search] (ดู nav-search.blade.php) - อ่านค่าจาก data-*
          data-ac-url     URL autocomplete ตอบ JSON {items:[{title, subtitle, url, cover_url, badge_label, badge_class}]}
          data-search-url หน้าผลค้นหาเต็ม
          data-param      ชื่อ query string ของคำค้นในหน้าผลค้นหา (autocomplete ใช้ word เสมอ)
   ปุ่ม  : [data-nav-search-toggle="<id ของแผง>"] - กี่ปุ่มก็ได้ (แว่นขยาย desktop / มือถือ)
   ============================================================================= */
(function () {
    'use strict';

    var DELAY = 1300; // ยิงค้นหาจริงหลังหยุดพิมพ์ 1.3 วินาที (ระหว่างนั้นโชว์ "กำลังค้นหา...")

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function init(panel) {
        var input = panel.querySelector('[data-nav-search-input]');
        var drop = panel.querySelector('[data-nav-search-results]');
        var closeBtn = panel.querySelector('[data-nav-search-close]');
        var toggles = document.querySelectorAll('[data-nav-search-toggle="' + panel.id + '"]');
        var navbar = panel.closest('.navbar') || panel.parentElement;
        var d = panel.dataset;
        var timer = null;
        var requestNo = 0;

        function clearDrop() {
            drop.classList.remove('show');
            drop.innerHTML = '';
        }

        function open() {
            // จอเล็ก: ถ้าเมนู drawer เปิดค้างอยู่ ปิดก่อน
            var drawer = document.querySelector('.offcanvas.show [data-bs-dismiss="offcanvas"]');
            if (drawer) drawer.click();
            panel.classList.add('show');
            navbar.classList.add('nav-search-open');
            setTimeout(function () { input.focus(); }, 50);
        }

        function close() {
            clearTimeout(timer);
            requestNo++;
            panel.classList.remove('show');
            navbar.classList.remove('nav-search-open');
            clearDrop();
            input.value = '';
        }

        function goSearch() {
            var word = input.value.trim();
            if (word.length < 1) return;
            var url = d.searchUrl;
            window.location = url + (url.indexOf('?') === -1 ? '?' : '&') + (d.param || 'word') + '=' + encodeURIComponent(word);
        }

        function showMessage(className, text, icon) {
            drop.innerHTML = '';
            var box = el('div', className);
            if (icon) box.appendChild(el('i', icon));
            box.appendChild(document.createTextNode(' ' + text));
            drop.appendChild(box);
            drop.classList.add('show');
        }

        function render(items) {
            if (!items || !items.length) {
                showMessage('ac-empty', d.textEmpty);
                return;
            }
            drop.innerHTML = '';
            items.forEach(function (item) {
                var a = el('a', 'ac-item');
                a.href = item.url || '#';

                var cover = el('div', 'ac-cover');
                if (item.cover_url) {
                    var img = el('img');
                    img.alt = '';
                    img.src = item.cover_url;
                    img.onerror = function () {
                        cover.classList.add('ac-cover-news');
                        cover.innerHTML = '<i class="bi bi-newspaper"></i>';
                    };
                    cover.appendChild(img);
                } else {
                    cover.classList.add('ac-cover-news');
                    cover.appendChild(el('i', 'bi bi-newspaper'));
                }
                a.appendChild(cover);

                var text = el('div', 'ac-text');
                if (item.badge_label) text.appendChild(el('span', 'ac-badge ' + (item.badge_class || ''), item.badge_label));
                text.appendChild(el('div', 'ac-title', item.title || ''));
                if (item.subtitle) text.appendChild(el('div', 'ac-sub', item.subtitle));
                a.appendChild(text);

                drop.appendChild(a);
            });
            var footer = el('div', 'ac-footer', d.textAll + ' →');
            footer.addEventListener('click', goSearch);
            drop.appendChild(footer);
            drop.classList.add('show');
        }

        function fetchItems(word) {
            var mine = ++requestNo;
            var url = d.acUrl + (d.acUrl.indexOf('?') === -1 ? '?' : '&') + 'word=' + encodeURIComponent(word);
            fetch(url, { headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
                .then(function (res) { return res.ok ? res.json() : { items: [] }; })
                .then(function (data) { if (mine === requestNo) render((data && data.items) || []); })
                .catch(function () { if (mine === requestNo) render([]); });
        }

        function moveActive(dir) {
            var items = drop.querySelectorAll('.ac-item');
            if (!items.length) return;
            var idx = Array.prototype.findIndex.call(items, function (x) { return x.classList.contains('active'); });
            if (idx > -1) items[idx].classList.remove('active');
            idx = (idx + dir + items.length) % items.length;
            items[idx].classList.add('active');
        }

        toggles.forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                panel.classList.contains('show') ? close() : open();
            });
        });
        if (closeBtn) closeBtn.addEventListener('click', close);

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                var active = drop.querySelector('.ac-item.active');
                if (active) window.location = active.href; else goSearch();
            } else if (e.key === 'Escape') {
                close();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                moveActive(1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                moveActive(-1);
            }
        });

        input.addEventListener('input', function () {
            clearTimeout(timer);
            requestNo++;
            var word = input.value.trim();
            if (word.length < 2) { clearDrop(); return; }
            showMessage('ac-searching', d.textSearching, 'bi bi-hourglass-split');
            timer = setTimeout(function () { fetchItems(word); }, DELAY);
        });

        // คลิกนอกแผง -> ปิด
        document.addEventListener('click', function (e) {
            if (!panel.classList.contains('show')) return;
            if (e.target.closest('[data-nav-search], [data-nav-search-toggle]')) return;
            close();
        });
    }

    function boot() {
        document.querySelectorAll('[data-nav-search]').forEach(init);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
