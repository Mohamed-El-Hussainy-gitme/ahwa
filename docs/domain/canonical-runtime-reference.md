# Canonical runtime reference

هذا هو الملخص المرجعي الحديث للنظام كما يجب قراءته من الكود والداتابيز الحاليين.

## 1) حدود النظام

- النظام SaaS متعدد المقاهي، والمرجعية الحالية ما زالت تشغِّل كل المقاهي على قاعدة تشغيل واحدة فعليًا مع تمهيد control plane للتوسع لاحقًا
- `ops.cafes` هو حد الـ tenant داخل قاعدة التشغيل
- `control.cafe_database_bindings` هو سجل الربط المنصّي بين كل مقهى و`database_key` التشغيلي
- كل تشغيل يومي يجب أن يكون مربوطًا بـ `cafe_id`، وأي توسع لاحق إلى أكثر من قاعدة يجب أن يمر عبر control plane وليس عبر cross-db joins

## 2) نمط التشغيل اليومي

التشغيل canonical داخل القهوة هو:

`shift -> service_session -> order -> order_item -> fulfillment -> billing/deferred -> shift_snapshot`

ولا يوجد في المرجعية الحديثة:

- `table`
- `table_session`
- `bill_account`

## 3) الممثلون والأدوار

### داخل القهوة
- owner / partner / المعلم: نفس الصلاحيات داخل القهوة
- supervisor: مشرف الوردية ومسؤول المحاسبة والآجل والتنسيق
- waiter: فتح/استئناف الجلسات، إرسال الطلبات، التسليم
- barista: تجهيز المشروبات
- shisha: تجهيز/تسليم الشيشة، ويمكن تعدد الشيشة مان داخل نفس الوردية

### على مستوى المنصة
- super admin: إدارة المقاهي، الملاك، الاشتراكات، التفعيل، المتابعة الإدارية عالية المستوى فقط، عبر control plane، وبدون اطلاع افتراضي على بيانات tenant التشغيلية؛ وأي دخول دعم يجب أن يكون explicit support session مؤقتة ومراجعة ومربوطة بمقهى واحد

## 4) المنيو

- المنيو owner-managed بالكامل
- الأقسام قابلة للإضافة والتعديل والإيقاف والحذف المنطقي
- الأصناف قابلة للإضافة والتعديل والإيقاف والحذف المنطقي
- المنتج يحمل `station_code` لتوجيه التنفيذ

## 5) الجلسة والطلب

- أول طلب يفتح `service_session` أو يستأنفها بالـ label
- الطلب نفسه مجرد envelope
- `order_item` هو الوحدة التشغيلية الأساسية
- التنفيذ والمحاسبة يعتمدان على الكميات داخل `order_items`

## 6) المحاسبة

- المحاسبة مبنية على الكميات المسلمة
- يمكن الدفع على دفعات أو تقسيمه على مشاريب متعددة داخل نفس الجلسة
- لا يلزم إدخال أسماء الأشخاص
- الآجل فقط هو الذي يحتاج اسم المدين

## 7) الشكاوى والإجراءات التصحيحية

### General complaints
- تحفظ في `ops.complaints`
- تمثل شكوى عامة أو ملاحظة تشغيلية عامة

### Item-linked issues
- تحفظ في `ops.order_item_issues`
- تربط مباشرةً بالصنف المتأثر
- تمثل:
  - item note
  - remake reason
  - cancel reason
  - waive reason

هذا الفصل هو المرجعية الصحيحة الحالية.

## 8) التقارير

- الوردية المفتوحة: تقارير live
- الوردية المغلقة: تقارير canonical من `ops.shift_snapshots`
- اليوم: من `ops.shift_snapshots` عبر `ops.daily_snapshots`
- الأسبوع: من `ops.daily_snapshots`
- الشهر: من `ops.daily_snapshots`
- السنة: من `ops.monthly_summaries`
- الواجهة/report API لا يجب أن تثق في أي summary row بشكل أعمى؛ لو اختلفت summary عن الـ detail المبني من `ops.shift_snapshots` والوردية المفتوحة، فالـ detail هو المرجع النهائي للعرض

## 9) السوبر أدمن والخصوصية

السطح الإداري للسوبر أدمن يجب أن يبقى عند:

- حالة القهوة
- حالة الاشتراك
- الملاك
- آخر نشاط
- هل توجد وردية مفتوحة
- استخدام قاعدة البيانات ومؤشرات الصحة عالية المستوى

ولا يجب أن يصبح شاشة مراقبة تشغيلية مفصلة على مبيعات أو شكاوى تشغيلية أو تفاصيل ما باعته كل قهوة. كما أن support grant القديم لم يعد جزءًا من نموذج الوصول canonical، وتم استبداله بجلسات دعم صريحة ومؤقتة عبر control plane.

## 10) المرجع النهائي عند أي تعارض

عند أي تعارض بين docs والكود، المرجع النهائي هو:

1. آخر migration canonical
2. server routes في `apps/web/src/app/api`
3. docs المعمارية المحدثة الخاصة بـ control plane / reporting / archive
4. domain docs المحدثة في هذا المجلد

- Phase 2 adds server-side routing foundation: `TenantDatabaseResolver` and `OperationalDbClientFactory` choose the operational database by `database_key` before cafe-scoped operational RPCs execute.


## Control plane routing phases

- Phase 4: core cafe operational routes must read and mutate through `database_key` routing.
- Phase 5: platform admin routes must use the control-plane client boundary, not the operational admin client.
- Phase 6: super-admin support access must be explicit, time-scoped, and audited through control-plane support sessions.
