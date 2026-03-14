# Phase 10 — Reporting & Audit

## Implemented runtime reporting endpoints

- `POST /reports/shifts/summary`
- `POST /reports/shifts/current`
- `POST /reports/employees/shift`
- `POST /reports/products/daily`
- `POST /reports/deferred/balances`

## Implemented audit + platform support endpoints

- `POST /audit/domain-events/list`
- `POST /audit/logs/list`
- `POST /platform/support/access-log/create`
- `POST /platform/support/access-log/list`
- `POST /platform/reports/tenant-overview`

## Reporting behavior

The reporting module refreshes read models on demand before returning:

- `report.shift_summaries`
- `report.employee_shift_summaries`
- `report.product_daily_summaries`
- `report.deferred_account_balances`

This keeps reports usable even if a background job runner has not been added yet.

## Audit behavior

Phase 10 also adds domain-event and audit-log writes for the main runtime mutations already implemented in prior phases:

- shift open / assignment replace / close
- table session open / state change / close
- bill account create / update / close
- order create / order item add / submit / cancel / remake
- fulfillment advance / deliver
- payment create / allocate
- deferred account create / deferred payment post

## Platform patch

A new migration was added:

- `database/migrations/013_phase_10_platform_sessions.sql`

If the database already exists on Supabase, apply:

- `database/sql-editor/004_apply_phase_10_patch.sql`

This patch creates `platform.super_admin_sessions` so platform support/reporting endpoints can use authenticated super-admin sessions.
