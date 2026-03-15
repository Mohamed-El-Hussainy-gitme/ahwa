# term mapping

هذا الملف هو مرجع التسمية المختصر الذي يمنع رجوع المصطلحات القديمة أو المربكة في الكود والـ UI والوثائق.

## runtime

| legacy term | canonical term | note |
| --- | --- | --- |
| table | service session label | لا يوجد كيان tables في التشغيل اليومي |
| table session | service session | session-label-first |
| bill account | delivered billable quantities | لا يوجد bill-account container مستقل |
| kitchen ticket | fulfillment event / station queue item | quantity-first |
| complaint on item | item issue | الشكوى العامة منفصلة عن سبب الإجراء على الصنف |
| remake complaint | remake item issue | السبب يسجل على الصنف نفسه |

## billing and deferred

| legacy term | canonical term | note |
| --- | --- | --- |
| deferred account | debtor name ledger | الدين محفوظ على اسم العميل داخل `deferred_ledger_entries` |
| settle invoice | settle delivered billable quantities | التحصيل مبني على الكميات المسلّمة |
| split people bill | split delivered quantities | التقسيم على المشاريب/الكميات وليس أسماء الأشخاص |

## staffing

| legacy term | canonical term | note |
| --- | --- | --- |
| deleted employee | left employee | لا نحذف الموظف حتى لا تضيع التقارير القديمة |
| disabled employee | inactive employee | موقوف مؤقتًا ويمكن إعادته |
| active employee | active employee | يظهر للتعيين والدخول فقط |

## platform

| old ui label | canonical label | note |
| --- | --- | --- |
| overview | النظرة العامة | شاشة الملخص الإداري للسوبر أدمن |
| cafes | القهاوي | شاشة الإدارة الجدولية الأساسية |
| money follow | المتابعة المالية | شاشة التحصيل والاشتراكات الخاصة بالمنصة |
| support grant | removed from canonical model | لم يعد جزءًا من نموذج الوصول الحالي |
