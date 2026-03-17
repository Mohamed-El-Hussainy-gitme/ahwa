# Explicit Super-Admin Support Access — Phase 6

Phase 6 implements the canonical support model decided for ahwa:

- super admin is **not** always inside tenant operational data
- support access must be **explicit**, **time-scoped**, and **audited**
- support access belongs to the **control plane**, not to legacy tenant grants

## What is now canonical

### 1. `control.support_access_requests`
Explicit support-session requests bound to:
- one `super_admin_user_id`
- one `cafe_id`
- one `database_key`
- one time window (`expires_at`)
- one declared `scope`

### 2. `control.support_access_audit_events`
Every lifecycle transition is written to audit metadata:
- `requested`
- `activated`
- `closed`
- `expired`

### 3. Signed support-session cookie
After activation, the browser receives a signed platform-support cookie carrying:
- request id
- super admin id
- cafe id
- database key
- scope
- expires at

This is separate from runtime owner/staff session cookies.

### 4. Support access is additive, not implicit
Phase 6 does **not** reopen the old always-off `platform.support_access_grants` model.
The legacy grants remain non-canonical.

## Scope model

Allowed support scopes are:
- `diagnostic`
- `read_only`
- `guided_write`

The support scope is recorded, explicit, and time-bounded.

## Current code-level boundary

Phase 6 adds:
- control-plane RPC-backed support access APIs
- signed platform-support session handling
- server helpers that can later route support traffic into the correct operational database

It does **not** yet convert every support/debug route into full operational support execution.
That remains a later rollout step.

## Why this is safe

- no owner/staff runtime auth contract was changed
- no billing/reporting/archive contract was changed
- no cafe data becomes visible by default
- support access now requires an explicit request + activation + close flow
