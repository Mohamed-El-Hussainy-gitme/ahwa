# Phase C / Batch 3

Implemented on top of `ahwa_phase2_bundle_recovery_message_catalog.zip`.

## Implemented

### Export + PDF-first
- Added print-friendly pages for:
  - reports
  - deferred customers ledger list
  - single deferred customer ledger
  - menu
- Added direct links from operational pages to the print views.
- Print views are intended for browser print / save as PDF flow.

### Owner onboarding guidance
- Added owner-only onboarding guide route:
  - `GET /api/owner/onboarding/guide`
- Added owner dashboard guidance card with progress-based checklist.
- Checklist covers:
  - menu
  - staff
  - shift open
  - role assignments
