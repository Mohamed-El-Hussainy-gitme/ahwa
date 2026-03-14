# Runtime E2E smoke runbook

## Preconditions
- Apply database migrations through `0008_runtime_local_auth_and_staff_codes.sql`
- Create `apps/web/.env.local`
- Start the app locally:

```bash
npm install
npm run build:shared
npm run dev:web
```

## Required env for the smoke script
The script reads these values from the shell environment:

```bash
export AHWA_E2E_BASE_URL=http://127.0.0.1:3000
export AHWA_E2E_INSTALL_TOKEN=replace-with-bootstrap-token
export AHWA_E2E_PAIRING_CODE=replace-with-device-pairing-code
```

Optional overrides:

```bash
export AHWA_E2E_PLATFORM_EMAIL=phase10.superadmin@example.com
export AHWA_E2E_PLATFORM_PASSWORD=Phase10Pass!123
export AHWA_E2E_OWNER_PHONE=201000000010
export AHWA_E2E_OWNER_PASSWORD=Phase10Owner!123
```

## Run the regression guard first
```bash
npm run verify:phase10
npm run check:legacy:web
```

## Run the end-to-end smoke
```bash
npm run smoke:phase10
```

## What success looks like
The smoke should print:
- created `cafeSlug`
- `cafeId`
- `shiftId`
- `serviceSessionId`
- `debtorName`
- `Phase 10 end-to-end smoke passed.`

## Failure interpretation
- `bootstrap failed` usually means `AHWA_INSTALL_TOKEN` mismatches or a required platform env is missing.
- `owner login` failures usually mean the platform create-cafe step failed or the DB migrations are incomplete.
- `staff login` failures usually mean shift assignments were not persisted or `0008` is missing.
- `Timed out waiting for SSE event` usually means the command committed but realtime propagation did not reach `/api/ops/events`.
- `INVALID_QUANTITY` during billing/delivery usually means the preceding ready/deliver command did not complete as expected.

## Cleanup expectation
This smoke is intentionally persistent. Run it only against local/dev or a disposable preview project.
