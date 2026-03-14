# Phase A-4 — Deferred lightweight upgrade

## Scope
Improve the deferred ledger without turning it into a heavy CRM system.

## What changed
- Add lightweight debtor status model in the workspace layer:
  - `active`
  - `late`
  - `settled`
- Add lightweight aging buckets:
  - `today`
  - `three_days`
  - `week`
  - `older`
  - `settled`
- Expand deferred customer summaries with:
  - current balance
  - total debt
  - total repayments
  - last entry time
  - last debt time
  - last repayment time
  - entry count
  - status
  - aging bucket
- Expand debtor detail workspace with the same summary metadata.
- Allow repayment notes to be submitted from the UI and stored through the repayment RPC.
- Refactor `/customers` to support:
  - search
  - status filters
  - simple aging visibility
  - clearer per-debtor cards
- Refactor `/customers/[id]` to support:
  - summary cards
  - clearer movement history
  - filter by movement type
  - notes on both debt and repayment actions

## Out of scope
- aliases / merge identities
- phone numbers
- CRM profile attributes
- due dates
- collections workflow

## Result
The deferred area stays simple and operational, but becomes faster to read and easier to work with during real cafe use.
