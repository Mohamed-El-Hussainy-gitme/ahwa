# Fix bundle: PDF export stability + report sales reconciliation

## PDF export
- Replaced the single giant-canvas export path with a primary `jsPDF.html(...)` rendering path.
- Kept a lighter paginated canvas fallback only when the HTML renderer is unavailable or fails.
- Preserved the same print pages and button locations.

## Report reconciliation
- Added sales reconciliation fields to report totals:
  - `itemNetSales`
  - `recognizedSales`
  - `salesReconciliationGap`
- Reports now show `إجمالي البيع` using reconciled totals so it does not understate revenue when historical payment totals exceed legacy item-derived totals.
- Historical snapshots continue to work even if the new fields are missing, because the API computes them on read.
- Shift snapshot normalization in the shift page now also applies the same reconciliation rule.
