# Amazon Vendor workspace

Select **Rayom Business Case** in the organization selector, then open **Amazon Vendor** in the sidebar. Seller dashboards continue to use their own existing account configuration.

The account picker supports Rayom, Master CJ, Etrade, MVR and optional CJ. Each uses its own refresh token and separate saved data. Purchase Orders, Invoices, Sales and Inventory have separate tabs. Choose dates and click Apply dates, then Sync from Amazon / Request report. For Sales and Inventory, click Check report status until Amazon finishes generating the report. Search and pagination use all saved rows for the selected account, tab and dates. Saved snapshots persist in `backend/amazon_vendor.sqlite3`.

## Backend environment

Common LWA app (same app for all accounts):

```dotenv
AMAZON_RAYOM_VENDOR_CLIENT_ID=
AMAZON_RAYOM_VENDOR_CLIENT_SECRET=
AMAZON_RAYOM_VENDOR_REFRESH_TOKEN=
AMAZON_RAYOM_VENDOR_MASTER_CJ_TOKEN=
AMAZON_RAYOM_VENDOR_ETRADE_REFRESH_TOKEN=
AMAZON_RAYOM_VENDOR_MVR_REFRESH_TOKEN=
AMAZON_RAYOM_VENDOR_CJ_REFRESH_TOKEN=
AMAZON_VENDOR_REGION=EU
AMAZON_VENDOR_MARKETPLACE_ID=A21TJRUUN4KGV
```

Use the **Login with Amazon client ID**, not the `amzn1.sp.solution...` application ID. When the supplied vendor ID is a solution ID, configuration falls back to the existing `AMAZON_RAYOM_SP_API_CLIENT_ID` / `AMAZON_RAYOM_SP_API_CLIENT_SECRET` pair. The explicit vendor LWA secret overrides that fallback. These LWA credentials must belong to the app that issued each vendor refresh token.

Legacy hyphenated MVR / CJ environment names are supported, but the underscore names above are preferable. Per-account LWA overrides are also supported as `AMAZON_RAYOM_VENDOR_<ACCOUNT>_CLIENT_ID` and `_CLIENT_SECRET` (MASTER_CJ for Master CJ). No credential values are returned to the browser.

India uses the EU SP-API endpoint. Orders requests are split into ranges of at most seven days and fetched using Amazon nextToken pagination. Invoices use the 2026-06-25 Invoices API; the app needs Finance and Accounting access. Sales / Inventory need the Vendor Retail Analytics report roles. Reports currently use DAY, SOURCING, RETAIL. Results depend on account permissions and Amazon report availability.

Restart both the Python backend and Vite after configuration. `npm run dev` runs both. Vite `/vendor-api` forwards to the Python API on port 5002. Existing deployment proxies must add the same route. This project currently follows its existing local API access model; no new login system is introduced.

Official references:
- https://developer-docs.amazon/sp-api/docs/connecting-to-the-selling-partner-api
- https://developer-docs.amazon/sp-api/reference/getpurchaseorders
- https://developer-docs.amazon/sp-api/lang-en_EN/reference/getinvoiceheaders-1
- https://developer-docs.amazon/sp-api/docs/report-type-values-analytics

## Account names and counts

These are separate Vendor accounts under the Rayom company. Shared LWA app credentials do not combine their refresh-token authorizations or saved data. The `/api/amazon-vendor` integration uses only the Vendor refresh-token variables; the existing Seller token is not requested here.

Optional names/group IDs can be set in backend `.env` as `AMAZON_RAYOM_VENDOR_<ACCOUNT>_NAME` / `_GROUP_ID` (account prefixes RAYOM, MASTER_CJ, ETRADE, MVR, CJ). Confirm the exact RJ / Rajasthan-CB token mapping before assigning those labels. A Vendor Central screenshot cannot identify which refresh token was issued for which group.

Default dates cover the last 30 days. Purchase orders created **or changed** in that range are deduplicated by PO number. The dashboard's Open PO Qty and On Hand Units are Inventory report metrics, not a count of PO records. No completed sync is displayed as counts unavailable. Failed sync messages are retained per account/tab/date range, and prior saved data is preserved.

Sales and Inventory default to Daily, two local calendar days ago. Timeframe presets fill dates; Apply requests the report and checks pending reports every 15 seconds. Weekly uses the previous complete Sunday–Saturday week; Monthly/Quarterly/Yearly use the previous complete calendar period. To date is month-to-date through two days ago; Trailing is 30 days through two days ago. Custom dates use DAY reports (maximum 90 days). Reporting period and Manufacturing/Sourcing view have separate saved snapshots.

Rajasthan - CB is a separate Vendor account (`cb`). Configure `AMAZON_RAYOM_VENDOR_CB_TOKEN` or `AMAZON_RAYOM_VENDOR_CB_REFRESH_TOKEN`. CB uses its own saved reports and Catalog cache.
