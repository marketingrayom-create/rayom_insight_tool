# Shopify store dashboard

Select Shopify in the Home marketplace buttons. The dashboard fetches only the configured Shopify store and uses its shop name as the company label. Inventory and Fulfilment Orders sidebar pages also use Shopify when selected.

Backend: `backend/shopify.py` and `backend/shopify_reporting.py`, registered in the existing Flask application on port 5002. Vite proxies `/shopify-api/*` to `/api/shopify/*`. Restart both services after changing configuration.

Required environment settings: `SHOPIFY_SHOP` (store subdomain or myshopify.com domain), `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`. Alternatively supply `SHOPIFY_ACCESS_TOKEN`. Client credentials requires an installed app and store within the same Shopify organization. `SHOPIFY_MARCHENT_ID` is not used for token authentication or company mapping. Optional `SHOPIFY_API_VERSION` defaults to 2026-07.

App scopes: `read_products`, `read_inventory`, `read_locations`, `read_orders`. For full 90-day revenue, Shopify must grant `read_all_orders`; otherwise Revenue 90D is unavailable. Update the installed app after changing scopes.

## Data and definitions

- Products: image, title, vendor, status, inventory, category, published channel count, product type, price range.
- Inventory: variant and SKU, location, available, committed, on hand, incoming, unavailable. Unavailable = on hand − available − committed. Missing quantities stay unavailable instead of being replaced with zero. Variants without a SKU remain visible.
- Brand Sales Summary: vendor grouping, week-on-week unit percentage, DRR 1D/7D/30D, merchandise revenue 7D/30D/90D.
- Product Details: product catalog fields plus units, DRR, revenue and days of inventory. Zero-sales products remain visible.
- Revenue and units charts: daily values for the last 30 UTC calendar dates, including today's partial date.
- Listing health: active, draft, archived, out of stock (out of stock overlaps status counts).

Sales windows are rolling UTC periods ending at the snapshot time. DRR = current units in the window / days. Weekly change compares the last seven days with the preceding seven days; absent prior sales shows a dash. Revenue is an estimate using Shopify's discounted unit price after discounts × current quantity, assigned to the original order creation date. Cancelled/test orders and gift cards are excluded. Shipping, taxes and arbitrary monetary adjustments are not included; this is not exact Shopify Analytics net sales. Days of inventory = available product inventory / DRR 30D, unavailable when there are no sales.

All products, orders, order line items and inventory location connections are paginated. Inventory UI pages show 25 variants with all their locations. Product list pages show 25 products. Dashboard summaries cover the full fetched catalog/order window and are cached for five minutes per store. Refresh bypasses the cache. API/permission errors are shown and do not become empty successful reports.

Native Shopify sell-through and ABC analysis are not reconstructed from screenshots; their historical inventory/analytics definitions are distinct from these order-derived figures. Amazon advertising metrics are not substituted into Shopify reports.

Verification: `python -m unittest backend/test_shopify.py backend/test_shopify_reporting.py` and `npm run build`.
