# server-supabase — ملاحظات التشغيل

## كيفية التشغيل (محلياً)
1. عدل `config.js` وأضف قيماً حقيقية (لا تترك النصوص الاستبدالية):
   - `adminPassword` (16 حرفاً على الأقل)
   - `databaseUrl` (رابط قاعدة بيانات Supabase PostgreSQL — موجود أصلاً)
2. شغّل المشروع: `npm start` (المنفذ 8080، يbind على `0.0.0.0`).

## كيفية التشغيل على Fly.io (via Secrets)
لا تضع الأسرار في `config.js` — أضفها كسيكرتات في لوحة Fly.io → Secrets:
- `ADMIN_PASSWORD` أو `supervisor_Password` — كلمة مرور الإدارة (16 حرفاً+)
- `DATABASE_URL` أو `secret_database` — رابط قاعدة بيانات Supabase PostgreSQL

بعد إضافة السيكرتات، اضغط **Deploy Secrets** ثم `fly deploy`. السيرفر يقرأ من `process.env` تلقائياً عبر `config.js`.

## ما تغير في هذا التحديث
- **بدون حد أقصى لحجم الملف**: حُذف `maxFileSizeMb` من `config.js`، وحُذف `fileSize` من `multer` في `server.js` (الرفع الآن غير محدود بالحجم، يقتصر فقط على عدد الملفات: 100 ملف).
- **سجلات التشخيص محذوفة**: حُذف `console.log` التشخيصي ومتغيرات `dbReady`/`dbError` ونقطة `/health` المفصلة، أصبح `/health` يعيد `{"status":"ok"}` فقط.
- **واجهة حديثة واحترافية**: إعادة تصميم `public/index.html` و `public/assets/app.js` بالكامل بتصميم عصري (RTL، ألوان متدرجة، بطاقات، إحصائيات، Drag & Drop، أيقونات حسب نوع الملف، إشعارات toast).
- **صفحة تسجيل دخول جديدة**: تصميم احترافي مدمج في `server.js` مع خلفية متدرجة وتأثيرات.
- **التخزين**: لا يزال داخل PostgreSQL فقط كبيانات ثنائية (`bytea`) — لا حاجة لمفاتيح Supabase Storage.
- كل ملف يحصل على رابط مباشر من형式 `https://server-supabase.fly.dev/files/:id`.

## مسارات API
- `GET /api/status` — حالة الاتصال بقاعدة البيانات
- `POST /api/upload` — رفع الملفات (غير محدود الحجم، حتى 100 ملف)
- `GET /api/files` — قائمة الملفات مع الروابط المباشرة
- `GET /files/:id` — فتح الملف مباشرة
- `DELETE /api/files/:id` — حذف الملف
- `GET /health` — فحص صحة السيرفر
