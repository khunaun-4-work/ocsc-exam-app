# 🏛️ ระบบคลังข้อสอบ ก.พ. ภาค ก. ส่วนตัว (Personal OCSC Exam Bank & Mock Exam)

เว็บแอปพลิเคชันสำหรับบริหารจัดการคลังข้อสอบ ก.พ. ภาค ก. ส่วนตัว พร้อมระบบจำลองการสอบจับเวลาเสมือนจริง และเฉลยละเอียดทีละขั้นตอน **พัฒนาด้วยภาษา Rust ประสิทธิภาพสูง ความปลอดภัยระดับหน่วยความจำ (Memory Safety)**

---

## 🛠️ Tech Stack
- **Backend:** Rust (Edition 2021), Axum 0.8, Tokio Async Runtime, Tower-HTTP (ServeDir, CORS)
- **Database:** SQLite (ผ่าน `rusqlite` พร้อม Connection Pooling จาก `r2d2` และ `r2d2_sqlite`)
- **Security:** รหัสผ่านเข้ารหัสแบบ PBKDF2-HMAC-SHA256 (100,000 iterations), Token-based Session Authentication
- **Frontend:** HTML5, CSS3 Liquid Glass Effect, Vanilla JavaScript (Modern Responsive Design, Thai Typography: Prompt / Sarabun)
- **Data:** ชุดข้อสอบปี 2565 - 2569 ครอบคลุมทั้ง Grammar, Vocabulary, ความสามารถในการคิดวิเคราะห์ (คณิตศาสตร์/อนุกรม), กฎหมาย และภาษาไทย รวมกว่า 436 ข้อ พร้อมเฉลยละเอียดและแผนผังลูกศรวิธีคิด
- **Deployment:** รองรับการ Deploy บน Render.com (ผ่าน Docker หรือ Native Rust) ด้วยระบบ Auto-seed ฐานข้อมูล SQLite จาก `seed_data.json` อัตโนมัติ

---

## 📂 โครงสร้างโฟลเดอร์ของโปรเจกต์ (Project Directory Structure)

```text
ระบบจัดการข้อสอบ/
├── src/
│   ├── main.rs             # Axum Web Server, REST API Routing, Auth, Mock Exam & Scoring Handlers
│   ├── db.rs               # SQLite Connection Pool, PBKDF2 Hashing, Database CRUD Functions
│   └── models.rs           # Rust Structs & Serde Serialization/Deserialization
├── frontend/
│   ├── index.html          # หน้าเว็บหลัก (Single Page Application รวมทุกส่วน)
│   ├── css/
│   │   └── style.css       # ดีไซน์ UI ทันสมัย รองรับทั้ง Desktop, Tablet และมือถือ พร้อม Dark/Light Mode
│   └── js/
│       └── app.js          # JavaScript จัดการ State, เรียก API, ระบบจับเวลา และตรวจคำตอบ
├── exams.db                # ฐานข้อมูล SQLite (สร้างและใส่ข้อมูลให้อัตโนมัติเมื่อรัน)
├── seed_data.json          # ชุดข้อสอบ ก.พ. ภาค ก. เริ่มต้นพร้อมเฉลยละเอียด (ปี 2565 - 2569)
├── Cargo.toml              # รายการแพ็กเกจและ Dependencies ของภาษา Rust
└── README.md               # คู่มือการติดตั้งและใช้งานโปรเจกต์
```

---

## 🚀 วิธีการคอมไพล์และรันโปรเจกต์ (Quickstart)

### 1. คอมไพล์และรันแอปพลิเคชันด้วย Cargo
สามารถสั่งรันผ่าน Cargo ได้โดยตรง:
```bash
cargo run
```

หรือคอมไพล์เป็น Binary ตัวเต็มแบบ Release:
```bash
cargo build --release
```

### 2. เปิดใช้งานผ่านเว็บเบราว์เซอร์
- **หน้าเว็บแอปพลิเคชัน:** [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **บัญชีผู้ใช้เริ่มต้น:**
  - **Admin:** Username: `admin` | Password: `0000` *(สิทธิ์เต็ม: ดู, ซ้อมทำ, เพิ่ม/แก้ไข/ลบข้อสอบ)*
  - **User:** Username: `student01`

---

## 💡 ฟีเจอร์หลัก (Core Features)

1. **คลังข้อสอบและโหมดฝึกฝน (Browse & Practice):**
   - แสดงข้อสอบทั้งหมดในรูปแบบการ์ด
   - ตัวกรองตาม **"ปีของข้อสอบ"** (เช่น ปี 2565, 2566, 2567, 2568, 2569), **"หมวดหมู่วิชา"** และช่องค้นหาคำสำคัญ
   - ปุ่ม **"💡 ดูเฉลยและวิธีคิด"** กดเพื่อ Toggle ซ่อน/แสดงวิธีคิดและคำอธิบายอย่างละเอียดทีละขั้นตอน พร้อมไฮไลต์ตัวเลือกที่ถูกต้อง

2. **ระบบจำลองการสอบจริงและนาฬิกาจับเวลา (Mock Exam & Timer):**
   - เลือกลักษณะชุดข้อสอบ: เลือกปี, หมวดหมู่วิชา, จำนวนข้อสอบ (5, 10, 20, 50 ข้อ) และเวลาที่กำหนด (นาที)
   - นาฬิกาจับเวลานับถอยหลังดิจิทัล (MM:SS) พร้อม Progress bar แจ้งเตือนเมื่อเวลาใกล้หมด
   - Navigator ปุ่มตัวเลขข้อสอบ (บอกสถานะข้อที่ตอบแล้ว / ยังไม่ตอบ)
   - ส่งข้อสอบอัตโนมัติเมื่อหมดเวลา หรือกดส่งได้ทันทีเมื่อทำเสร็จ

3. **หน้าสรุปผลและวิเคราะห์คะแนน (Performance Dashboard):**
   - คำนวณคะแนนรวมและเปอร์เซ็นต์
   - ประเมินสถานะ **ผ่าน / ไม่ผ่านเกณฑ์ ก.พ.** ตามเกณฑ์จริง:
     - ความสามารถในการคิดวิเคราะห์: $\ge 60\%$
     - ภาษาไทย: $\ge 60\%$
     - ภาษาอังกฤษ: $\ge 50\%$
     - ความรู้และลักษณะการเป็นข้าราชการที่ดี (กฎหมาย): $\ge 60\%$
   - สรุปคะแนนแยกย่อยตามหมวดหมู่วิชา
   - ทบทวนข้อสอบทีละข้อ แสดงข้อที่ผู้สอบเลือกเทียบกับคำตอบที่ถูกต้องและคำอธิบาย

4. **การจัดการข้อสอบ (Admin CRUD):**
   - ฟอร์ม **"เพิ่มข้อสอบใหม่"** (ระบุปี, วิชา, แท็ก, โจทย์, ตัวเลือกทั้ง 4 ข้อ, เลือกเฉลย และคำอธิบาย)
   - ปุ่ม **"แก้ไขข้อสอบ" (Edit)** ดึงข้อมูลเดิมมาปรับแก้แล้วบันทึกทันที
   - ปุ่ม **"ลบข้อสอบ" (Delete)** พร้อมหน้าต่างยืนยันความปลอดภัย

---

## 🌐 การ Deploy ขึ้น Render.com (Cloud Deployment)

1. สร้าง New Web Service บน Render Dashboard และเชื่อมต่อกับ GitHub Repository ของคุณ
2. เลือกการตั้งค่าอย่างใดอย่างหนึ่ง:
   - **แบบ Docker (แนะนำ - ง่ายและเสถียรที่สุด):**
     - Environment: `Docker`
     - Render จะตรวจพบ `Dockerfile` อัตโนมัติและคอมไพล์ใน Container ทันที
   - **แบบ Native Rust:**
     - Environment: `Rust`
     - Build Command: `cargo build --release`
     - Start Command: `./target/release/ocsc_exam_system`
3. เมื่อระบบเริ่มต้นครั้งแรก `seed_data.json` จะทำการสร้างตารางและบรรจุข้อสอบทั้ง 436 ข้อเข้าสู่ `exams.db` ให้อัตโนมัติทันที พร้อมเปิดใช้งานออนไลน์ได้ 24 ชั่วโมง
