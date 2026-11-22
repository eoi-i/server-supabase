# server-supabase — ملاحظات التشغيل

## كيفية التشغيل (محلياً)
1. عدل `config.js` وأضف قيماً حقيقية (لا تترك النصوص الاستبدالية):
   - `adminPassword` (16 حرفاً على الأقل)
   - `databaseUrl` (رابط قاعدة بيانات Supabase PostgreSQL — موجود أصلاً)
2. شغّل المشروع: `npm start` (المنفذ 8080، يbind على `0.0.0.0` حتى يصله مرور Fly.io).

## كيفية التشغيل على Fly.io (via Secrets)
لا تضع الأسرار في `config.js` — أضفها كسيكرتات في لوحة Fly.io → Secrets:
- `ADMIN_PASSWORD` أو `supervisor_Password` — كلمة مرور الإدارة (16 حرفاً+)
- `DATABASE_URL` أو `secret_database` — رابط قاعدة بيانات Supabase PostgreSQL

بعد إضافة السيكرتات، اضغط **Deploy Secrets** ثم `fly deploy`. السيرفر يقرأ من `process.env` تلقائياً عبر `config.js`.

## ما تغير
- التخزين أصبح داخل PostgreSQL فقط كبيانات ثنائية (`bytea`) — لا حاجة لمفاتيح Supabase Storage.
- كل ملف يُرفع إلى جدول `public.nahid_file_store` ويحصل على رابط مباشر من형式 `https://server-supabase.fly.dev/files/:id`.
- `/api/upload` يرفع ويخزن الملف في القاعدة؛ `/api/files` يعرض القائمة مع الروابط؛ `/files/:id` يخدم الملف مباشرة؛ `/api/files/:id` يحذف الملف من القاعدة.
- الواجهة الأمامية (`public/assets/app.js`) تنسخ الرابط المباشر (`f.url`) عند الضغط على "نسخ الرابط" وفتحه عند الضغط على اسم الملف.

## ملاحظة
المشروع يعمل الآن برابط قاعدة البيانات فقط (`DATABASE_URL` / `secret_database`) + كلمة مرور الإدارة. لا حاجة لـ `SUPABASE_URL` أو `SUPABASE_SERVICE_ROLE_KEY`.