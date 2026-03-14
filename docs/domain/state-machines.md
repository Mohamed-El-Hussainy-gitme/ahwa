# State machines (canonical runtime)

هذا الملف يطابق النظام الحديث فقط. أي وصف قديم لـ `table session` أو `bill account` لم يعد مرجعية تشغيلية.

## Shift

### States
- `open`
- `closed`

### Allowed transitions
- `open -> closed`

### Notes
- لا توجد مرحلة `draft` أو `closing` في الـ schema الحالية.
- إغلاق الوردية يجب أن ينتهي بإنشاء `shift_snapshot` canonical.

---

## Shift role assignment

### Role rules
- `supervisor`: active singleton per shift
- `barista`: active singleton per shift
- `waiter`: multiple active assignments allowed
- `shisha`: multiple active assignments allowed

### Notes
- المالك لا يحتاج تعيينًا داخل الوردية حتى يعمل داخل القهوة.
- assignment نفسه ليس state machine معقدة؛ التفعيل/التعطيل يتم عبر `is_active`.

---

## Service session

### States
- `open`
- `closed`

### Allowed transitions
- `open -> closed`

### Notes
- الجلسة تُفتح أو تُستأنف بالـ `session_label`.
- لا يوجد `table session` ككيان مستقل.

---

## Order

### States
- `draft`
- `submitted`
- `completed`
- `cancelled`

### Allowed transitions
- `draft -> submitted`
- `submitted -> completed`
- `submitted -> cancelled`
- `draft -> cancelled`

### Notes
- تفاصيل التنفيذ الفعلية للصنف لا تُستنتج من `orders.status` وحده، بل من كميات وحركات `order_items` و `fulfillment_events`.

---

## Order item

لا يوجد عمود `status` canonical في `ops.order_items`. المرجعية الفعلية هنا **quantity-driven** وليست enum-driven.

### Canonical progress dimensions
- submitted quantity
- ready quantity
- delivered quantity
- paid quantity
- deferred quantity
- remade quantity
- cancelled quantity

### Effective runtime progression
- submitted quantity increases first
- then ready quantity increases
- then delivered quantity increases
- then paid/deferred quantities settle delivered quantity
- remake creates additional tracked preparation work without erasing history
- cancel applies to undelivered quantity only
- waive applies to delivered quantity without collecting payment

---

## Complaint

### States
- `open`
- `resolved`
- `dismissed`

### Allowed transitions
- `open -> resolved`
- `open -> dismissed`

### Notes
- هذا المسار خاص بـ `ops.complaints` فقط.
- الشكوى العامة ليست هي المرجعية الوحيدة لعمليات remake/waive/cancel على الصنف.

---

## Order item issue

### States
- `logged`
- `applied`
- `dismissed`

### Allowed transitions
- `logged -> applied`
- `logged -> dismissed`

### Notes
- هذا المسار يخص `ops.order_item_issues`.
- `action_kind` الحالية: `note`, `remake`, `cancel_undelivered`, `waive_delivered`.
- هذا هو المسار canonical لأسباب الإجراء المرتبط بالصنف.

---

## Payment / deferred settlement

لا توجد state machine مستقلة باسم `bill account` في النظام الحديث.

### Canonical settlement outcomes
- delivered quantity can move to paid quantity
- delivered quantity can move to deferred quantity
- deferred quantity can later be repaid through `deferred_ledger_entries`

### Notes
- الحساب مبني على كميات الأصناف المسلمة وليس على أسماء الأشخاص.
- الاسم البشري الإلزامي الوحيد هنا هو اسم المدين في الآجل.
