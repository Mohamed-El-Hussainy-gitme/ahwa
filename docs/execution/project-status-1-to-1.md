# Project status report - 1:1 alignment

هذا التقرير مبني على حالة المشروع بعد تنفيذ المراحل 0 إلى 8 الموجودة في الكود الحالي.

## Executive summary

على مستوى **الكود + المايجريشنز + المرجعية المكتوبة**، المشروع الآن **مقفول بدرجة عالية جدًا وقريب جدًا من 1:1 النهائي** مع منطق التشغيل المطلوب:

- multi-tenant SaaS على قاعدة بيانات واحدة
- لا يعتمد `tables` ككيان runtime
- الورديات هي إطار التشغيل
- الجلسات تعمل بالـ label
- المحاسبة quantity-first
- الآجل بالاسم فقط
- الشكاوى العامة منفصلة عن أسباب الإجراء على الصنف
- الوردية المغلقة لها snapshot canonical
- السوبر أدمن إداري ويحترم الخصوصية
- `support grant` لم يعد جزءًا من نموذج الوصول canonical
- يوجد route-by-route authz audit ثابت داخل المشروع
- يوجد manual UAT matrix نهائي قبل الإقفال الإنتاجي

هذا يعني أن **الفجوات الوظيفية/المعمارية الرئيسية التي كانت تمنع 1:1 داخل المصدر نفسه تم إغلاقها**. المتبقي الآن ليس إعادة تصميم أو features ناقصة، بل **تنفيذ تحقق نهائي على بيئتك الحقيقية**.

---

## الحالة الحالية حسب المحاور

### 1) SaaS / tenant model
**الحالة:** مطابق

- `ops.cafes` هو حد الـ tenant
- السجلات التشغيلية الأساسية مربوطة بـ `cafe_id`
- المرجعية الحديثة لا تستخدم كيان tables

### 2) sessions بدل tables
**الحالة:** مطابق

- `service_session` هو الكيان runtime الصحيح
- `session_label` هو العلامة التشغيلية
- لا حاجة لإضافة `tables`

### 3) shifts
**الحالة:** مطابق

- وردية morning/evening
- فتح/قفل وردية
- single-row semantics الحديثة موجودة
- snapshot عند الإغلاق canonical للورديات المغلقة

### 4) staffing and roles
**الحالة:** مطابق

- owner يعمل بدون تعيين داخل الوردية
- supervisor singleton
- waiter متعدد
- shisha متعدد
- barista singleton وفق القرار الحالي

### 5) menu management
**الحالة:** مطابق

- الأقسام والأصناف قابلة للإدارة من owner
- لا يوجد ما يفرض menu جامدة غير قابلة للتعديل

### 6) billing and deferred
**الحالة:** مطابق

- المحاسبة مبنية على الكميات المسلمة
- split billing على المشاريب/الكميات وليس أسماء الأشخاص
- الآجل بالاسم فقط
- billing وdeferred محميان Server-side

### 7) complaints / remake / cancel / waive
**الحالة:** مطابق

- `ops.complaints` للشكاوى العامة
- `ops.order_item_issues` لأسباب الصنف والإجراءات التصحيحية
- remake / cancel / waive مرتبطة بالصنف نفسه
- الأسباب تدخل في snapshot والتقارير

### 8) reports
**الحالة:** مطابق

- open shift = live
- closed shift = snapshot
- today/week/month/year مبنية على closed snapshots مع دمج current open shift عند الحاجة

### 9) owner login flow
**الحالة:** مطابق

- ربط slug مع owner login مباشر
- لا حاجة حاليًا إلى cafe password مستقل

### 10) super admin privacy
**الحالة:** مطابق

- السوبر أدمن يرى السطح الإداري فقط
- لا يرى تفاصيل التشغيل الحساسة لكل قهوة

### 11) support grant
**الحالة:** محسوم ومزال من النموذج الحالي

- route `platform/support/grant` محذوف
- `0022_remove_support_grants_and_lock_final_access.sql` يعطل `app.has_platform_support_access(...)`
- `app.can_access_cafe(...)` أصبح مربوطًا بـ `app.current_cafe_id()` فقط
- جدول `platform.support_access_grants` بقي كأرشيف legacy فقط وليس كميزة فعالة

### 12) docs canon
**الحالة:** مطابق

- docs الحديثة متوافقة مع النظام الحديث
- تمت إضافة مراجع نهائية للصلاحيات والـ acceptance

### 13) authorization audit
**الحالة:** مطابق

- يوجد `scripts/check-ops-authz-coverage.mjs`
- يوجد `docs/execution/final-authz-route-matrix.md`
- أي route تشغيلية أو owner route تخرج من المصفوفة أو تفقد guardها الآن يمكن كشفها آليًا

---

## ما الذي ينقص المشروع ليكون 1:1 كاملًا؟

على مستوى **الكود المرجعي** لا توجد الآن فجوة منطقية كبيرة متبقية مثل السابق.
المتبقي فعليًا هو **تأكيد التنفيذ على البيئة الحقيقية** فقط:

### 1) Apply migrations on the target database
- شغّل المايجريشنز حتى `0022_remove_support_grants_and_lock_final_access.sql`
- تأكد أن البيئة الفعلية لا تحمل drift خارج هذا التسلسل

### 2) Run build/typecheck on the real workspace
- شغّل typecheck/build داخل بيئتك المحلية أو CI الفعلي
- هذه الخطوة لازمة لأن الحكم النهائي الإنتاجي لا يثبت من القراءة الساكنة وحدها

### 3) Execute manual UAT against the real stack
- نفّذ `docs/execution/final-acceptance-matrix.md`
- اختبر على Supabase + Vercel + sessions + devices الفعلية
- خصوصًا multi-shisha / complaints / snapshots / billing / deferred / platform privacy

إذا نجحت هذه الثلاثة، فالنظام يصبح **1:1 production-locked** عمليًا بالنسبة للمنطق الذي حددته.

---

## ملاحظات تنظيمية غير وظيفية

### 1) `0015_session_label`
يوجد migration باسم `0015_session_label` بدون امتداد `.sql`.
هذا لا يغيّر المنطق الحالي، لكنه نقطة تنظيمية تستحق الانتباه إذا كانت أدوات النشر عندك تعتمد امتدادًا صارمًا.

### 2) Historical docs
بعض docs الأمنية/المرحلية القديمة قد تذكر support access كتاريخ سابق. هذا مقبول كأرشيف، لكن المرجع الحالي هو:
- `database/migrations/0022_remove_support_grants_and_lock_final_access.sql`
- `docs/domain/canonical-runtime-reference.md`
- `docs/execution/phase-8-security-and-acceptance-lock.md`

---

## الحكم النهائي الحالي

### هل المشروع الآن 1:1 على مستوى المصدر المرجعي؟
**نعم، بدرجة عالية جدًا.**

### هل أستطيع الجزم أنه production-complete بدون تشغيله على بيئتك؟
**لا.**
الشيء المتبقي الآن هو تحقق deploy/build/UAT على البيئة الحقيقية، وليس وجود فجوات منطقية كبيرة في المصدر.

### الخلاصة التنفيذية
المشروع الآن في حالة:

**source-level 1:1 locked**

والمتبقي فقط:
1. apply migrations
2. build/typecheck in real workspace
3. manual UAT
