# المرحلة التالية — دعم فني + إعادة ضبط السوبر أدمن

## المنفذ
- إضافة inbox دعم فني داخل المنصة
- دعم إرسال الرسائل من صفحة الدخول ومن داخل النظام
- تحديث لوحة السوبر أدمن لتضم قسم `الدعم الفني`
- تحسين ملخص النظرة العامة ليشمل رسائل الدعم الجديدة
- إضافة سجل دعم مختصر داخل صفحة تفاصيل القهوة

## المسارات الجديدة
- `POST /api/support/messages/create`
- `GET /api/platform/support/messages`
- `POST /api/platform/support/messages/update-status`
- `POST /api/platform/support/messages/reply`
- `/support`

## قاعدة البيانات
- `platform.support_messages`
- `platform.support_message_replies`
- migration: `0026_platform_support_inbox_and_dashboard_refactor.sql`

## ملاحظات
- رسالة الدعم من صفحة الدخول تشترط الاسم + الهاتف + اسم القهوة أو slug
- الرسالة من داخل النظام تحاول تعبئة البيانات الحالية تلقائيًا
- المتابعة تكون عبر الهاتف كما هو موضح في واجهة الدعم
