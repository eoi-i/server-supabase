# server-supabase — ملاحظات التشغيل

## كيفية التشغيل (محلياً)
1. عدل `config.js` وأضف قيمة حقيقية لـ `databaseUrl` (رابط قاعدة بيانات Supabase PostgreSQL).
2. شغّل المشروع: `npm start` (المنفذ 8080، يbind على `0.0.0.0`).

## كيفية التشغيل على Fly.io (via Secrets)
لا تضع الأسرار في `config.js` — أضفها كسيكرتات في لوحة Fly.io → Secrets:
- `DATABASE_URL` أو `secret_database` — رابط قاعدة بيانات Supabase PostgreSQL

بعد إضافة السيكرتات، اضغط **Deploy Secrets** ثم `fly deploy`. السيرفر يقرأ من `process.env` تلقائياً عبر `config.js`.

## نطاق ki-i.top
لربط النطاق `ki-i.top` بالتطبيق على Fly.io، نفذ من terminal خاصتك:
```bash
fly domains add ki-i.top
fly certs add ki-i.top
```
أو أضف النطاق من لوحة Fly.io → Domains. بعد ذلك تأكد من إعداد سجلات DNS (CNAME أو A) حسب ما تطلبه Fly.io.

## ما تغير في هذا التحديث
- **إزالة تسجيل الدخول تمامًا**: المشروع أصبح عامًا (Public) دون الحاجة لكلمة مرور أو جلسة. حُذف middleware `auth` من جميع المسارات، ومسارات `/login` و `/logout`، وصفحة تسجيل الدخول، وزر تسجيل الخروج من الواجهة.
- **بدون حد أقصى لحجم الملف**: حُذف `maxFileSizeMb` من `config.js`، وحُذف `fileSize` من `multer` في `server.js` (الرفع الآن غير محدود بالحجم، يقتصر فقط على عدد الملفات: 100 ملف).
- **سجلات التشخيص محذوفة**: حُذف `console.log` التشخيصي ومتغيرات `dbReady`/`dbError` ونقطة `/health` المفصلة، أصبح `/health` يعيد `{"status":"ok"}` فقط.
- **واجهة حديثة واحترافية**: إعادة تصميم `public/index.html` و `public/assets/app.js` بالكامل بتصميم عصري (RTL، ألوان متدرجة، بطاقات، إحصائيات، Drag & Drop، أيقونات حسب نوع الملف، إشعارات toast).
- **التخزين**: لا يزال داخل PostgreSQL فقط كبيانات ثنائية (`bytea`) — لا حاجة لمفاتيح Supabase Storage.
- كل ملف يحصل على رابط مباشر من형式 `https://server-supabase.fly.dev/files/:id` (أو عبر النطاق ki-i.top بعد ربطه).

## مسارات API (جميعها عامة بدون مصادقة)
- `GET /api/status` — حالة الاتصال بقاعدة البيانات
- `POST /api/upload` — رفع الملفات (غير محدود الحجم، حتى 100 ملف)
- `GET /api/files` — قائمة الملفات مع الروابط المباشرة
- `GET /files/:id` — فتح الملف مباشرة
- `DELETE /api/files/:id` — حذف الملف
- `GET /health` — فحص صحة السيرفر