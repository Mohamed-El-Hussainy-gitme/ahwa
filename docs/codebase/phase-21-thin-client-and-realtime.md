# Phase 21 — thin client + ops realtime

## الهدف
- إبقاء `apps/web` كواجهة خفيفة فوق clients/hooks موحدة
- منع منطق fetch المكرر داخل الصفحات
- إضافة قناة realtime موحدة لتحديث workspaces فور نجاح الأوامر التشغيلية

## ما تم
- إضافة `src/lib/http/client.ts` كطبقة HTTP موحدة للأخطاء
- إضافة `src/lib/ops/hooks.ts` لقراءة workspaces وتنفيذ commands من مكان واحد
- إضافة `src/lib/ops/realtime.ts` + `src/app/api/ops/events/route.ts` لقناة SSE
- إضافة `src/lib/ops/events.ts` كـ in-process event bus داخل web runtime
- تحويل الصفحات التشغيلية الرئيسية لاستخدام hooks بدلاً من fetch/useEffect المكرر
- بث events من routes التشغيلية بعد كل mutation ناجحة

## المبدأ التشغيلي
1. الواجهة ترسل command صغير
2. route ينفذ mutation
3. route يبث ops realtime event
4. الصفحة الحالية وباقي الصفحات المفتوحة تعيد تحميل snapshot المناسب فورًا

## النتيجة
- زمن تفاعل أقل
- state drift أقل
- صفحة الويب لا تعيد كتابة منطق الشبكة في كل شاشة
- foundation واضح للانتقال لاحقًا إلى backend event bus خارجي إذا احتجنا scaling متعدد الـ instances
