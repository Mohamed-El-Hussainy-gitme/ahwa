# Phase A — Queue age indicators

Base package: `ahwa_phase5_super_admin_control_plane.zip`

## Implemented
- Added global queue-health summary to `DashboardWorkspace` and `OpsNavSummary`.
- Added three runtime indicators:
  - `oldestPendingMinutes`
  - `oldestReadyMinutes`
  - `stalledSessionsCount`
- Kept thresholds lightweight and runtime-only.
- Surfaced the indicators in:
  - dashboard
  - orders
  - kitchen
  - shisha

## Notes
- No schema migration was added.
- `stalledSessionsCount` uses a 15-minute no-activity threshold based on current-shift runtime activity.
- `oldestReadyMinutes` is derived from the latest ready/partial-ready fulfillment signal for still-outstanding ready items.
- `oldestPendingMinutes` is derived from the oldest still-waiting queue item in the open shift.
