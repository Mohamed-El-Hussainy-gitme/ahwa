# PWA session stability fixes

Patched files:
- apps/web/src/app/api/ops/events/route.ts
- apps/web/src/app/api/authz/state/route.ts
- apps/web/src/app/api/runtime/me/route.ts
- apps/web/src/lib/ops/realtime.ts

Changes:
1. Removed forced cookie clearing from background/auth bootstrap endpoints.
2. Kept auth/session invalid responses as 401/409 without deleting cookies.
3. Realtime client now pauses while the document is hidden.
4. Realtime client now uses stronger reconnect backoff and fully resets the EventSource on errors.
