# V6 fixes

- normalized `WaiterLiveWorkspace.sessions` to `OpsSessionSummary[]` in `buildWaiterWorkspace`
- added computed `readyCount` and `billableCount` per session
- added `pollAlways` to `useOpsWorkspace` and enabled it on orders, ready, kitchen, shisha
- added Vercel cron for `/api/internal/qstash/ops/outbox-dispatch`
- wired `AHWA_OPS_OUTBOX_DISPATCH_POLICY` into scheduler behavior
- added QStash signature verification for `/api/internal/ops/outbox/dispatch` using `@upstash/qstash` Receiver
