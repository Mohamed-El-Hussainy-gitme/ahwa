# Ops admin resilience smoke runbook

This runbook covers only the admin-safe resilience layer introduced for:

- inventory
- notes & quality
- shift opening/closing checklist drafts

It must **not** be extended into live sessions, order creation, live billing, or direct sell flows.

## Preconditions

- Start the web app normally.
- Log in as owner or supervisor with access to inventory, complaints, and shift.
- Open DevTools and keep the Network tab available so offline/online can be toggled quickly.
- Confirm the global offline banner is visible when the browser goes offline.

## Smoke matrix

### 1) Inventory draft restore

1. Open `/inventory`.
2. Type into one item form and one movement form.
3. Refresh the page.
4. Confirm the entered form values return.

Expected:

- form values restore from local draft
- no hot-path route is affected

### 2) Inventory queued mutation

1. Open `/inventory`.
2. Turn the browser offline.
3. submit one non-critical admin mutation such as supplier create, movement save, or quick count.
4. Confirm the page shows a local queue message.
5. Turn the browser online.
6. Confirm the offline banner switches to sync/retry state and the queue drains.
7. Refresh the page and confirm the saved data appears.

Expected:

- mutation is queued locally while offline
- queue flushes automatically when online returns
- draft keys do not reappear after a successful replay

### 3) Complaints / quality draft restore

1. Open `/complaints`.
2. Enter general notes and one item-note action.
3. Refresh the page.
4. Confirm the note state returns.

Expected:

- local draft state restores correctly

### 4) Complaints queued action

1. Stay on `/complaints`.
2. Turn the browser offline.
3. create one general note or one item-level action.
4. Confirm the action is queued locally.
5. Return online.
6. Confirm queue replay succeeds and the page refreshes from workspace state.

Expected:

- queued actions replay without manual JSON recovery
- quality state becomes visible after replay

### 5) Shift checklist draft replay

1. Open `/shift` with an open shift.
2. Edit opening or closing checklist fields.
3. Turn the browser offline.
4. Press `save draft` for the checklist.
5. Confirm the queue message appears.
6. Return online.
7. Confirm the page reloads the latest checklist state automatically.
8. Refresh once more and confirm the offline draft does not resurrect.

Expected:

- queued checklist draft replays successfully
- page reload happens after queue sync
- stale checklist local draft is cleared after replay

## Release gate

Before release, run:

```bash
npm run verify:ops-admin-resilience
npm run verify:release
```

Then execute the matrix above once in a browser session.
