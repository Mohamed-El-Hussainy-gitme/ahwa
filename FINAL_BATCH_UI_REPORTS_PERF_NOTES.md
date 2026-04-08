# Final batch: addon button, reports, and performance tuning

Implemented on top of `ahwa-final-closed.zip`.

## 1) Addon button placement
- Moved the `إضافات` button into the product card header in internal orders.
- Kept the selected-addon hint as a lightweight line below controls.
- Applied the same header-level placement in the public QR ordering view for consistency.

## 2) Reports: addons now visible in analytics
- Added addon analytics rows to report types and workspace payloads.
- Reports now expose:
  - `currentAddons`
  - `periods.*.addons`
- Added addon aggregation in reporting from `order_item_addons` joined to `order_items` shift-level delivery quantities.
- Reports UI now shows:
  - `أعلى الإضافات` in overview
  - `كل الإضافات` in the products tab
- Printable reports now include an `أعلى الإضافات` table.

## 3) Performance tuning
- Increased menu/catalog read-cache TTLs for static-ish menu/addon data.
- Increased waiter catalog stale time on orders page to reduce unnecessary re-fetching.
- Memoized filtered products in internal orders.
- Memoized `productsWithAddons` to avoid repeating link scans during render.

## Important implementation note
- Addon analytics are derived from `order_item_addons` + delivered order item quantities.
- Product sales remain product-centric.
- Addon sales are now reported in a dedicated addon view rather than pretending addons are regular products.

## Validation status in sandbox
- I could not complete full `typecheck/build` in the sandbox because the extracted package did not materialize required type packages (`node`, `react`, `react-dom`) after install in this environment.
- The code changes were applied directly and reviewed file-by-file.
