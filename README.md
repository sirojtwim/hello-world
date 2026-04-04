# Face ID asosidagi talaba yo'qlama web ilovasi (MVP)

Ushbu loyiha brauzerda ishlaydigan Face ID attendance prototipi bo'lib, vazifalar alohida bo'limlarga ajratilgan:

1. **Skaner** (kamera, live detection, adaptive zoom)
2. **Talabalar & Namuna** (talaba yaratish, sample yuklash/olish)
3. **Raspisaniya** (dars jadvali)
4. **Hisobot** (attendance + unknown)
5. **Sozlamalar** (detector/zoom holati)

## Test rejimi

Ilovada yuqoridan **Test rejimi** yoqilganda real kamerasiz ham mock frame asosida skaner sikli ishlaydi.
Shuningdek **Diagnostika** tugmasi asosiy funksiyalarni tekshiradi:

- storage yuklanishi,
- cosine similarity ishlashi,
- vaqt oynasi tekshiruvi,
- detector mavjudligi.

## Noutbuk va telefon moslashuvlari

Quyidagi xatoliklar uchun yechimlar qo'shildi:

- Kamera tanlash + **kamera turi** (old/orqa) tanlash.
- **Sifat profillari**: HD / Full HD / SD (kameraga mos bo'lmasa SD ga fallback).
- Kamera device ishlamasa avtomatik fallback constraints bilan qayta urinish.
- Telefonlarda muhim ogohlantirish: kamera uchun **HTTPS yoki localhost** talab qilinadi.
- Kamera band bo'lsa (Zoom/Meet) xatolik matni bilan yechim ko'rsatiladi.
- Ekran aylanganda (`orientationchange`) overlay o'lchami qayta sinxronlanadi.
- Fon rejimiga o'tganda scanning xavfsiz to'xtatiladi.

## Ishga tushirish

```bash
python3 -m http.server 8080
```

So'ng brauzerda oching:

```text
http://localhost:8080
```

## GitHub ga push/sync muammosi bo'lsa

Generated arxiv fayllar (`.zip`, `.tar.gz`, `extracted/`) repoga kiritilmaydi — ular `.gitignore`da bloklangan.
Bu yondashuv GitHub'ga push paytida katta/binary fayl muammolarini kamaytiradi.

Lokal arxiv kerak bo'lsa quyidagicha yarating:

```bash
zip -r release/faceid-attendance-mvp.zip index.html styles.css app.js README.md images
tar -czf release/faceid-attendance-mvp.tar.gz index.html styles.css app.js README.md images
sha256sum release/faceid-attendance-mvp.zip release/faceid-attendance-mvp.tar.gz > release/CHECKSUMS.txt
```

## Production uchun tavsiya

- Backend: FastAPI + PostgreSQL + Redis
- Model: RetinaFace/YOLO-face + ArcFace (InsightFace)
- Liveness detection (anti-spoof)
- RBAC, audit log, encryption
- PTZ/ONVIF integratsiyasi (real optical zoom)
