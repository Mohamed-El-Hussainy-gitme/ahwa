# Platform visual polish

This phase refines the super admin UI to match the requested dashboard direction:
- sidebar-first control plane layout
- calmer top header with quick search and summary stats
- table-first cafes view
- cleaner overview focused on attention queue, recent activity, and support count

No domain logic or database behavior was changed in this phase.
The support inbox, money follow flows, cafe creation flow, and cafe detail actions remain the same.

Updated files:
- apps/web/src/app/platform/PlatformDashboardClient.tsx
- apps/web/src/app/platform/PlatformPortfolioOverview.tsx
