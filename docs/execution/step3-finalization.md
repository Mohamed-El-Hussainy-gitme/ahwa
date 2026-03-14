# Step 3 finalization

This step hardened shift lifecycle UX and preserved the owner-facing close snapshot flow.

## Current canonical snapshot path

The owner proxy route remains:

- `apps/web/src/app/api/owner/shift/close-snapshot/route.ts`

It now builds the snapshot from the canonical ops function:

- `public.ops_build_shift_snapshot(cafe_id, shift_id)`

rather than the removed legacy reporting module in `apps/api`.
