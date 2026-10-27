# mrta-portal-aaa (ต้นแบบ AAA)

เว็บ static ต้นแบบหน้าตาของหน้าแรก mrta-portal ตามเกณฑ์ WCAG 2.2 ระดับ AAA (มอก. 2565-2555)
มีหน้าเดียว: `/` - ลิงก์ไปหน้าหรือระบบอื่นเปิดได้หน้า 404 "ไม่อยู่ในต้นแบบ"

**เว็บนี้เป็นไฟล์ static ล้วน ไม่ใช้ฐานข้อมูล** - deploy ขึ้น Vercel ได้เลย โฟลเดอร์ `_build` ไม่ขึ้น (`.vercelignore`)

## แก้หน้าตา

- `_aaa/aaa.css` ชั้น AAA (สี 7:1, กรอบโฟกัส, ขนาดเป้าหมาย 44px, พื้นทึบใต้ตัวหนังสือ) - แก้แล้วเห็นผลทันที
- `index.html` แก้ตรงได้เลย

## ตรวจ

```
python -I _build/serve.py 8802
python -I _build/check_aaa.py http://localhost:8802 / [--modes]
```

`check_aaa.py` ใช้ HTML_CodeSniffer มาตรฐาน WCAG2AAA (ผลแบ่ง Error / Warning / Notice แบบเดียวกับ webcheck.aaa.in.th) และ axe-core
`--modes` ตรวจซ้ำทุกโหมดสีของแผงการเข้าถึงและตัวอักษรใหญ่
Notice เป็นรายการที่ให้คนตรวจเอง (มีทุกเว็บ เช่น 2.4.4 นับลิงก์ละ 1 รายการ) ไม่ใช่ข้อบกพร่อง

## ดึงเนื้อหาใหม่จาก portal (ทำเฉพาะเมื่อเนื้อหาในระบบจริงเปลี่ยน)

ขั้นนี้ขั้นเดียวที่ต้องเปิด MySQL เพราะต้องอ่านหน้าจริงจาก mrta-portal - ผลดิบมีข้อมูลจริง เก็บไว้นอกโฟลเดอร์นี้เสมอ

```
php _build/capture.php "C:\XAMPP 8.5\mrta-portal" <raw dir> "/,/cookie-consent/script?id=<id>"
php ..\mrta-back-office\_build\pii_dict.php "C:\XAMPP 8.5\mrta-portal" <raw dir>\pii.json
python -I _build/build.py <raw dir> "C:\XAMPP 8.5\mrta-portal-aaa"
```

- `build.py` แทนข้อมูลส่วนบุคคลด้วยข้อมูลสมมติ, เปลี่ยน URL, ก๊อปไฟล์ static แล้วใส่ชั้น AAA (ไม่ใช้ฐานข้อมูล)
- `transform.py` + `aaa-transform.js` แก้ markup ใน Chromium: ไม่เปิดหน้าต่างใหม่, `<abbr>` ของ "รฟม.", กลุ่มลิงก์เป็น `<ul>`,
  รูปตกแต่งเป็นภาพพื้นหลัง CSS, ย้าย stylesheet เข้า `<head>`, แถบคุกกี้ท้ายหน้า, ลิงก์กลับขึ้นด้านบน, ป้ายต้นแบบ
