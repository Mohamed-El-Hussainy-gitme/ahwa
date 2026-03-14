# Phase 5 - Shift Core

## Scope completed

This phase introduces owner-controlled shift administration into `apps/api`.

Implemented backend responsibilities:
- open a shift for a branch
- replace the active role assignments of a shift
- enforce one supervisor in the assignment payload
- read the current open shift with resolved assignments
- read recent shift history for a branch
- close a shift after validating that no active table sessions remain

## Route summary

### Shift management
- `POST /shifts/open`
- `POST /shifts/assignments/replace`
- `GET /shifts/current`
- `POST /shifts/history`
- `POST /shifts/close`

## Business rules enforced in this phase

- only owner / partner accounts can open or close shifts
- only owner / partner accounts can replace shift assignments
- only one open or closing shift can exist per branch
- exactly one supervisor must exist in every assignment replacement request
- only active employee accounts can be assigned to shift roles
- a shift cannot close while active table sessions still exist

## Deliberate limitations left for later phases

- no owner dashboard screen yet in `apps/web`
- no station-specific runtime UI binding yet
- no shift-summary projection job yet
- no fine-grained audit event writes from these APIs yet
- no bulk staff-management API yet

## Next phase dependency

Phase 6 can now build on top of the open shift and assignments to implement:

- staff management
- menu management
- tables management
- owner operational setup flows
