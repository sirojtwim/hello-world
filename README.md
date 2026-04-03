# Face ID asosidagi talaba yo'qlama web ilovasi (MVP)

Ushbu loyiha brauzerda ishlaydigan, kameradan foydalanib talabalarni yo'qlamaga oluvchi boshlang'ich prototipdir.

## Mavjud funksiyalar

- Qurilmadagi bir nechta kamerani aniqlash va tanlash.
- Kamera oqimini ochish va real-time skanerlash.
- Face detection (`FaceDetector` bo'lsa ishlatiladi, bo'lmasa fallback rejim).
- Adaptive zoom (bbox maydoniga qarab avtomatik zoom in/out).
- Talabalarni qo'shish/o'chirish.
- Talabaga kamera yoki fayldan face sample biriktirish.
- Jadval (raspisaniya) yaratish va o'chirish.
- Scan vaqt oralig'ini belgilash.
- Tanilgan yuzlar uchun attendance yozuvi.
- Bazada yo'q yuzlar uchun bir necha nusxa (`Unknown`) saqlash.
- Ma'lumotlarni `localStorage` orqali saqlash.

## Ishga tushirish

Statik fayllar bo'lgani uchun oddiy HTTP server yetarli:

```bash
python3 -m http.server 8080
```

So'ng brauzerda oching:

```text
http://localhost:8080
```

## Eslatma (production uchun)

Bu MVP prototip bo'lib, haqiqiy Face ID model o'rniga soddalashtirilgan embedding ishlatilgan.
Production uchun quyidagilar tavsiya etiladi:

- Backend: FastAPI + PostgreSQL + Redis
- Model: RetinaFace/YOLO-Face + ArcFace (InsightFace)
- Liveness detection (anti-spoof)
- Shifrlash, audit log va role-based access
- PTZ kamera uchun ONVIF integratsiyasi
