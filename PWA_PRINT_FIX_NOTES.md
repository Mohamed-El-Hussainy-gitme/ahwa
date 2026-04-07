Changes applied:
- Removed target="_blank" from print/export links so print routes open inside the same PWA window.
- Updated files:
  - apps/web/src/app/(app)/billing/page.tsx
  - apps/web/src/app/(app)/customers/page.tsx
  - apps/web/src/app/(app)/customers/[id]/page.tsx
  - apps/web/src/app/(app)/menu/page.tsx
  - apps/web/src/app/(app)/reports/page.tsx

Expected effect:
- Receipt and print pages should no longer open in a separate browser context from the standalone PWA.
- This should stop the unexpected redirects to login on print pages in the installed PWA.
