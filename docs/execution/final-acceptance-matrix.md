# Final acceptance matrix

هذا هو الـ UAT matrix النهائي المطلوب قبل اعتبار النسخة production-locked.

## 1) Core service flow
1. waiter يفتح أو يستأنف session بالـ label.
2. waiter يرسل order يحتوي مشروبات و/أو شيشة.
3. barista يعلن ready للمشروبات.
4. shisha يعلن ready لطلبات الشيشة.
5. waiter أو shisha يسلّم item للعميل.
6. supervisor أو owner يحاسب الكميات المسلمة فقط.

## 2) Multi-shisha
1. تعيين أكثر من shisha داخل نفس الوردية.
2. كل shisha ينفذ orders مستقلة.
3. التقارير وsnapshot تفصل أداء كل واحد.

## 3) Complaints / item issues
1. إنشاء شكوى عامة بدون order item.
2. remake لصنف مع reason.
3. cancel undelivered لصنف مع reason.
4. waive delivered لصنف مع reason.
5. التأكد أن الشكوى العامة لا تختلط بسبب الصنف.

## 4) Deferred / billing
1. split billing على الكميات داخل session واحدة.
2. deferred entry باسم العميل فقط.
3. repay على الآجل.
4. owner/supervisor only على كل deferred actions.

## 5) Shift close / historical reports
1. close shift.
2. build snapshot.
3. التأكد أن closed history يقرأ من snapshot.
4. التأكد أن open shift يبقى live.
5. التأكد أن day/week/month/year متسقة.

## 6) Authorization matrix
1. waiter لا يستطيع billing/deferred routes.
2. barista لا يستطيع billing/deferred/menu owner actions.
3. shisha لا يستطيع owner-only routes.
4. owner يستطيع التنفيذ داخل القهوة بدون تعيين داخل الوردية.
5. supervisor مسؤول عن billing/deferred/reports/dashboard.

## 7) Platform privacy
1. super admin يرى cafes / owners / subscriptions / money follow / database usage.
2. super admin لا يرى per-cafe operational sales internals.
3. support grant route غير موجود.
4. tenant access stays scoped to `app.current_cafe_id()` فقط.
