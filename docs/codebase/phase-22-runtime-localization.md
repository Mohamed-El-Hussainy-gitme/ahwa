# Phase 22 - runtime localization into apps/web

## Goal

Remove the remaining active dependency on the deleted `apps/api` runtime slice after phases 7 and 8 proved that the web shell already owned the canonical ops workspaces.

## What changed

- Runtime login moved to local web server routes backed directly by `ops` functions.
- Device activation and device gate resolution moved to local signed cookies plus `ops.cafes` lookup.
- Owner shift and staff administration moved to `apps/web/src/app/api/owner/*` backed directly by `ops` tables/functions.
- Authz state now reads current shift/assignments directly from `ops`.
- The old web-to-api bridge under `apps/web/src/lib/api/*` was removed.
- The legacy `apps/api` workspace was deleted from the active tree.

## Database additions

`0008_runtime_local_auth_and_staff_codes.sql` adds:

- `ops.staff_members.employee_code`
- `ops_create_staff_member_v2`
- `ops_set_staff_member_pin`
- `ops_set_staff_member_active`
- `ops_verify_owner_login`
- `ops_verify_staff_pin_login`

## Outcome

The active runtime path is now:

- browser -> `apps/web` route handlers -> `ops` / `platform`

There is no remaining live dependency on the removed legacy runtime backend package.
