# Beacon product performance

## Advertising

Open **Advertising** for Product Intelligence and Campaign Spotlight. Both
use the same server-side cookie configuration below. The initial date range
is September 8–14, 2026, matching the supplied requests. Apply dates refreshes
both reports and resets pagination. Product search is debounced; each table
has independent server-side sorting, tabs, and pagination. Campaign tabs sort
by ROAS ascending, ROAS descending, or sales descending.

The backend exposes `/api/beacon/advertising/sku-performance` and
`/api/beacon/advertising/campaign-performance` through the existing Vite proxy.
The SKU report is scoped to `amazon_sc`; the campaign report uses level=campaign.
Both live endpoints returned HTTP 200 during integration verification.
Product fields include product_title, ad_spend, ad_sales, organic_sales_pct;
campaign monetary fields are spend_inr and sales_inr. Missing values display
as a dash, and amounts use INR. Campaign drill-down is not included because
only the campaign-level request was supplied.

Open **Product performance** in the sidebar. The default request uses page=1,
limit=10, sortBy=drr_1d_minus2, sortOrder=desc. Table headers change server-side
sorting; controls change page size, direction, and page.

## Authentication

Set `BEACON_COOKIE` in the environment of the Python API service, or put the
raw cookie header from your Beacon request in `backend/beacon-cookie.local.txt`
(one line, without `-b` or surrounding quotes). The local file is gitignored
and read on each request, so replacing an expired session needs no restart.
Include `guardian_auth` and the Beacon organization/brand filter cookies to
preserve the account scope from your request. Do not use Markdown escaping.
The existing root `.env` is not automatically loaded by this Python service.

Run `npm run dev` with Python and the project's backend dependencies installed.
The React request uses `/uniware-api/beacon/product-performance`, routed by
Vite to `/api/beacon/product-performance` on the existing Python service.
Production hosting must route `/uniware-api` to that service as well.

Credentials are used only by the backend for the fixed Beacon endpoint.
Session expiry, upstream errors, loading, empty results, and retry are handled.
Columns are derived from returned product fields. The adapter supports a data
array or products/items/rows/results and common pagination metadata. If Beacon
uses a different envelope, adapt `src/api/beaconApi.js` using a sample response.
