# server-supabase — ملاحظات التشغيل

## كيفية التشغيل
1. عدل `config.js` وأضف قيماً حقيقية (لا تترك النصوص الاستبدالية):
   - `adminPassword` (16 حرفاً على الأقل)
   - `databaseUrl` (قاعدة بيانات Supabase PostgreSQL — موجودة أصلاً)
   - `supabaseUrl` (رابط مشروع Supabase)
   - `supabaseServiceRoleKey\) (مفتاح دور الخدمة من Supabase → Settings → API)
   - `supabaseBucket` (اسم سلة التخزين، افتراضي: `files`)
2. في لوحة تحكم Supabase → Storage، أنشئ السلة واجعلها **Public** كي تعمل الروابط المباشرة.
3. شغّل المشروع: `npm start` (المنفذ 8080، يbind على `127.0.0.1`).

## ما تغير
- التخزين انتقل من `bytea` داخل PostgreSQL إلى **Supabase Storage**.
- كل ملف يُرفع إلى السلة ويُخزن مساره ورابطه المباشر (`url`) في جدول `public.nahid_file_store`.
- `/api/upload` يرفع ويجلب الرابط المباشر؛ `/api/files` يعرض القائمة مع الروابط؛ `/files/:id` يعيد توجيه إلى الرابط المباشر؛ `/api/files/:id` يحذف الملف من السلة ومن القاعدة.
- الواجهة الأمامية (`public/assets/app.js`) تنسخ الرابط المباشر (`f.url`) عند الضغط على "نسخ الرابط" وفتحه عند الضغط على اسم الملف.

## ملاحظة
بدون `supabaseUrl` و `supabaseServiceRoleKey` صحيحة، يغلق الخادم عند البدء (مقارنةً بالتحقق الحالي من `adminPassword`/`databaseUrl`). لا يمكن اختبار الرفع والحذف فعلياً بدون بيانات اعتماد Supabase حقيقية.
