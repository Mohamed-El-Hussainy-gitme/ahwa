# State Machines (V2)

هذا الملف يحدد الانتقالات الرسمية لحالات التشغيل الأساسية.

## Shift

### States
- `draft`
- `open`
- `closing`
- `closed`
- `cancelled`

### Allowed Transitions
- `draft -> open`
- `draft -> cancelled`
- `open -> closing`
- `closing -> closed`

### Forbidden
- `closed -> open`
- `cancelled -> open`
- `open -> closed` مباشرة بدون مرحلة closing

---

## Table Session

### States
- `open`
- `locked`
- `settling`
- `closed`
- `cancelled`

### Allowed Transitions
- `open -> locked`
- `locked -> open`
- `open -> settling`
- `locked -> settling`
- `settling -> closed`
- `open -> cancelled`

### Notes
- `locked` تعني أن الجلسة مفتوحة ولكن لا تقبل تعديلات معينة مؤقتًا.
- `settling` تعني أن الحسابات دخلت مرحلة التحصيل والإغلاق.

---

## Bill Account

### States
- `open`
- `partially_paid`
- `settled`
- `closed`
- `void`

### Allowed Transitions
- `open -> partially_paid`
- `open -> settled`
- `partially_paid -> settled`
- `settled -> closed`
- `open -> void`

### Notes
- لا يصل الحساب إلى `closed` إلا بعد اكتمال التسوية.
- `void` حالة استثنائية يجب أن تظل نادرة وتُراجع.

---

## Order

### States
- `draft`
- `submitted`
- `partially_fulfilled`
- `fulfilled`
- `cancelled`

### Allowed Transitions
- `draft -> submitted`
- `submitted -> partially_fulfilled`
- `submitted -> fulfilled`
- `partially_fulfilled -> fulfilled`
- `draft -> cancelled`
- `submitted -> cancelled`

---

## Order Item

### States
- `draft`
- `submitted`
- `accepted`
- `in_preparation`
- `ready`
- `delivered`
- `remade`
- `cancelled`
- `voided`

### Allowed Transitions
- `draft -> submitted`
- `submitted -> accepted`
- `submitted -> cancelled`
- `accepted -> in_preparation`
- `accepted -> cancelled`
- `in_preparation -> ready`
- `in_preparation -> cancelled`
- `ready -> delivered`
- `ready -> cancelled`
- `delivered -> remade`
- `draft|submitted|accepted|in_preparation|ready -> voided` وفق policy خاصة

### Notes
- `remade` لا تعني محو التاريخ. يجب أن تقود إلى عنصر جديد أو دورة تنفيذ جديدة قابلة للتتبع.
- `voided` تختلف عن `cancelled` لأنها عادة قرار إداري/مالي أعلى أثرًا.

---

## Fulfillment Ticket

### States
- `queued`
- `accepted`
- `in_preparation`
- `ready`
- `handed_over`
- `cancelled`

### Allowed Transitions
- `queued -> accepted`
- `accepted -> in_preparation`
- `in_preparation -> ready`
- `ready -> handed_over`
- `queued|accepted|in_preparation|ready -> cancelled`

---

## Payment

### States
- `pending`
- `completed`
- `failed`
- `cancelled`
- `refunded`

### Allowed Transitions
- `pending -> completed`
- `pending -> failed`
- `pending -> cancelled`
- `completed -> refunded`

---

## Complaint

### States
- `open`
- `in_review`
- `resolved`
- `dismissed`

### Allowed Transitions
- `open -> in_review`
- `open -> resolved`
- `in_review -> resolved`
- `in_review -> dismissed`
