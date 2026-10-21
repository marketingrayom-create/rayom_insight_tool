# Product Performance VC in-transit integration

Inventory backend export: GET /api/integrations/in-transit (Authorization: Bearer server-side API key).
Insight proxy: GET /seller-api/api/inventory/in-transit?organization=rayom&includeUnknown=false
Use organization=linso for LINSO.

Product Performance automatically loads this export in ReorderTable and supplies VC Intransit Qty from matched ASIN, or EAN when the invoice line has no ASIN. Energizer maps to CB; LINSO maps to MVR. Matching Merge lines must reconcile with each included Master shipment. Missing or inconsistent product breakdown leaves quantities unavailable and displays a status message. Empty complete reports return zero. The source is shipment records, not Amazon Data Kiosk.

Backend .env settings:
- INVENTORY_BACKEND_URL (Inventory_backend origin, with no /api suffix)
- INVENTORY_INTEGRATION_API_KEY (same as Inventory_backend; never a VITE variable)
- INVENTORY_RAYOM_COMPANY_ID / INVENTORY_RAYOM_PORTAL_ID
- INVENTORY_LINSO_COMPANY_ID / INVENTORY_LINSO_PORTAL_ID

Local values are configured. Restart both Inventory_backend and the Insight Python backend to load the routes and environment settings. For remote hosting, set INVENTORY_BACKEND_URL to the reachable inventory HTTPS origin and configure the matching secret on both servers.
