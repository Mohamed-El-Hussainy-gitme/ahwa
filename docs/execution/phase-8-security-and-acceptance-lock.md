# Phase 8 - security and acceptance lock

## Goal

إغلاق آخر فجوات 1:1 على مستوى الكود المرجعي نفسه:
- إزالة support grant من السطح التشغيلي والإداري الحالي
- قفل tenant access على `app.current_cafe_id()` فقط
- تثبيت route-by-route authz audit
- إضافة acceptance matrix واضحة قبل الإقفال الإنتاجي

## Implemented

### 1) Remove support grants from the canonical access model
- Added `database/migrations/0022_remove_support_grants_and_lock_final_access.sql`
- `app.has_platform_support_access(...)` now returns `false`
- `app.can_access_cafe(...)` now depends on `app.current_cafe_id()` only
- `public.platform_grant_support_access(...)` is dropped
- `platform.support_access_grants` is left as a legacy archive only

### 2) Remove platform support-grant API surface
- Removed `apps/web/src/app/api/platform/support/grant/route.ts`
- The current platform surface no longer exposes any support-grant mutation path

### 3) Lock route-by-route authorization coverage
- Added `scripts/check-ops-authz-coverage.mjs`
- Added `docs/execution/final-authz-route-matrix.md`
- The audit script fails if any expected ops/owner route is missing from the matrix or loses its required guard markers

### 4) Lock final 1:1 release checklist
- Added `scripts/check-final-1to1-lock.mjs`
- Added `docs/execution/final-acceptance-matrix.md`
- Updated `scripts/check-release-readiness.mjs` so release verification also runs the final authz and 1:1 lock checks

## Result

على مستوى الكود والـ migrations والمرجعية الحالية، المشروع أصبح locked بدرجة عالية جدًا تجاه المنطق المطلوب.
المتبقي قبل أي نشر إنتاجي هو تنفيذ الـ migrations على البيئة الحقيقية، ثم build/typecheck/UAT على البنية الفعلية.
