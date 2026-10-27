# mrta-portal-aaa (ต้นแบบ AAA)

เว็บ static ต้นแบบหน้าตาของหน้าบ้าน mrta-portal ตามเกณฑ์ WCAG 2.2 ระดับ AAA (มอก. 2565-2555)
มี 3 หน้า: `/` หน้าแรก, `/about-us` เกี่ยวกับเรา, `/qa` ถาม-ตอบ - ลิงก์ไปหน้าหรือระบบอื่นเปิดได้หน้า 404 "ไม่อยู่ในต้นแบบ"

โฟลเดอร์ `_build` ไม่ขึ้น Vercel (`.vercelignore`) และผลดิบจาก capture ที่มีข้อมูลจริงเก็บไว้นอกโฟลเดอร์นี้เสมอ

## สร้างใหม่

ต้องเปิด MySQL (ฐาน `belib_mrta`) ก่อน และใช้ php ของ Herd

```
php _build/capture.php "C:\XAMPP 8.5\mrta-portal" <raw dir> "/,/about-us,/qa,/cookie-consent/script?id=<id>"
php ..\mrta-back-office\_build\pii_dict.php "C:\XAMPP 8.5\mrta-portal" <raw dir>\pii.json
python -I _build/build.py <raw dir> "C:\XAMPP 8.5\mrta-portal-aaa"
```

- `capture.php` เรนเดอร์หน้าแบบผู้เยี่ยมชมในโปรเซส (rollback ทุก request) และเก็บคำตอบ `qa/fetch` ที่หน้าถาม-ตอบเปิดได้
- `build.py` แทนข้อมูลส่วนบุคคลด้วยข้อมูลสมมติ, เปลี่ยน URL, ก๊อปไฟล์ static แล้วใส่ชั้น AAA
- `transform.py` + `aaa-transform.js` แก้ markup ใน Chromium (DOMParser): ไม่เปิดหน้าต่างใหม่, `<abbr>` ของ "รฟม.", กลุ่มลิงก์เป็น `<ul>`,
  รูปตกแต่งเป็นภาพพื้นหลัง CSS, ย้าย stylesheet เข้า `<head>`, แถบคุกกี้ท้ายหน้า, ลิงก์กลับขึ้นด้านบน, ป้ายต้นแบบ
- `_aaa/aaa.css` (เขียนมือ) สี 7:1, กรอบโฟกัส, ขนาดเป้าหมาย 44px, พื้นทึบใต้ตัวหนังสือ - แก้ไฟล์นี้แล้วเห็นผลทันทีไม่ต้อง build
- `_aaa/static.js` (เขียนมือ) ตอบแทนเซิร์ฟเวอร์ในเบราว์เซอร์: `qa/fetch`, บันทึกคุกกี้

## ตรวจ

```
python -I _build/serve.py 8802
python -I _build/check_aaa.py http://localhost:8802 / /about-us /qa [--modes]
```

`check_aaa.py` ใช้ HTML_CodeSniffer มาตรฐาน WCAG2AAA (ผลแบ่ง Error / Warning / Notice แบบเดียวกับ webcheck.aaa.in.th) และ axe-core
`--modes` ตรวจซ้ำทุกโหมดสีของแผงการเข้าถึงและตัวอักษรใหญ่
Notice เป็นรายการที่ให้คนตรวจเอง (มีทุกเว็บ เช่น 2.4.4 นับลิงก์ละ 1 รายการ) ไม่ใช่ข้อบกพร่อง
