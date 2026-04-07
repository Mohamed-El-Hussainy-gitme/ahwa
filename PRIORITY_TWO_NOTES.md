Priority 2 changes
- Split Ready page off the heavy waiter workspace onto /api/ops/delivery/ready-list.
- Added short-lived server-side caches for menu catalog, active catalog, billing settings, and deferred summaries.
- Rewrote nav-summary to avoid building the full dashboard workspace just to paint the chrome counts.
