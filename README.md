# منصة بطاقات تهنئة — الحزمة الأولى

مشروع React + Vite جاهز للربط مع Supabase والنشر على Render.

## ما تم في هذه الحزمة

- الصفحة العامة بدون حساب.
- رسالة عدم وجود مناسبة.
- تسجيل دخول الإدارة بواسطة Supabase Auth.
- أدوار: Super Admin / Admin / Viewer.
- هيكل صفحات لوحة الإدارة.
- قاعدة البيانات والجداول وسياسات RLS.
- مساحة تخزين للقوالب والخطوط.
- Edge Function لإنشاء مستخدمي الإدارة بأمان.
- تجهيز دعم خطوط GE Thameen للعربية وAller للإنجليزية مع مجلد واضح لإضافة ملفات الخطوط.
- ملف Render Blueprint.

## التشغيل محليًا

```bash
npm install
cp .env.example .env
npm run dev
```

ثم ضع داخل `.env`:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## إعداد Supabase

1. أنشئ مشروع Supabase جديدًا.
2. افتح SQL Editor.
3. نفّذ الملف `supabase/schema.sql` كاملًا مرة واحدة.
4. من Authentication > Users أنشئ أول مستخدم يدويًا.
5. بعد إنشاء المستخدم نفّذ هذا الأمر في SQL Editor مع استبدال البريد:

```sql
update public.profiles
set role = 'super_admin', full_name = 'System Admin'
where id = (select id from auth.users where email = 'YOUR-EMAIL@example.com');
```

## Edge Function

الوظيفة موجودة في:

```text
supabase/functions/admin-create-user/index.ts
```

لنشرها باستخدام Supabase CLI:

```bash
supabase functions deploy admin-create-user
```

## النشر على Render

- ارفع الملفات إلى GitHub.
- أنشئ Static Site جديدًا في Render أو استخدم `render.yaml`.
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`
- أضف متغيري البيئة الموجودين في `.env.example`.

## الحزمة القادمة

- إدارة المناسبات كاملة.
- رفع القالب المربع والمستطيل.
- تفعيل وتعطيل المناسبة.
- التحقق من تاريخ البداية والنهاية.

## إضافة ملفات الخطوط

ضع ملفات الخطوط المرفوعة داخل `public/fonts` بعد إعادة تسميتها وفق الملف `public/fonts/README.txt`.
