
export const INVENTORY_COLUMNS = [
  'Ean', 'productCode', 'itemType', 'shelf', 'shelfAttribute',
  'batchCode', 'batchStatus', 'inventoryType', 'totalQuantity',
  'quantity', 'quantityBlocked', 'quantityNotFound', 'size', 'color',
  'brand', 'updated', 'status', 'excessInventory', 'netVariance',
  'shelfEnabledForInventoryAllocation', 'shelfEnabledForInventorySync',
  'shelfEnabledForSkuMixing', 'shelfEnabledHold', 'imageUrl',
  'pendencyOnChannels', 'totalInventory', 'itemTypeInventoryId'
];

export const BASIC_COLUMNS = INVENTORY_COLUMNS;

export const COLUMN_LABELS = {
  Ean: 'EAN', productCode: 'SKU code', itemType: 'Item name', shelf: 'Shelf',
  shelfAttribute: 'Shelf attributes', batchCode: 'Batch', batchStatus: 'Batch status',
  inventoryType: 'Inventory type', totalQuantity: 'Total stock', quantity: 'Available (ATP)',
  quantityBlocked: 'Blocked', quantityNotFound: 'Not found', size: 'Size', color: 'Colour',
  brand: 'Brand', updated: 'Updated', status: 'Status', excessInventory: 'Excess inventory',
  netVariance: 'Net variance', shelfEnabledForInventoryAllocation: 'Allocation enabled',
  shelfEnabledForInventorySync: 'Sync enabled', shelfEnabledForSkuMixing: 'SKU mixing',
  shelfEnabledHold: 'Shelf hold', imageUrl: 'Image', pendencyOnChannels: 'Pendency on channels',
  totalInventory: 'Total inventory', itemTypeInventoryId: 'Inventory ID'
};

const INVENTORY_API_BASE_URL = '/uniware-api/inventory';
const INVENTORY_SEARCH_URL = `${INVENTORY_API_BASE_URL}/search`;
const INVENTORY_STATUS_URL = `${INVENTORY_API_BASE_URL}/status`;
const INVENTORY_EXPORT_URL = `${INVENTORY_API_BASE_URL}/export`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function fetchInventoryData(
  columns = INVENTORY_COLUMNS,
  filters = [{ id: 'inventoryTypeFilter', selectedValues: ['GOOD_INVENTORY', 'VIRTUAL_INVENTORY'] }],
  sortColumns = [{ column: 'updated', descending: true }],
  start = 0,
  pageSize = 25
) {
  try {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const statusResponse = await fetch(INVENTORY_STATUS_URL);
      const status = await statusResponse.json();

      if (status.status === 'success') break;
      if (status.status === 'error') {
        throw new Error(status.message || 'Uniware inventory sync failed.');
      }
      await sleep(1000);
    }

    const payload = {
      columns,
      disableLabelMany: false,
      fetchResultCount: true,
      filters,
      name: 'DATATABLE SEARCH INVENTORY',
      noOfResults: pageSize,
      groupByEan: true,
      sortColumns,
      start
    };
    const response = await fetch(INVENTORY_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload)
    });

    const json = await response.json();

    if (!response.ok || !json.successful) {
      throw new Error(json.message || `Inventory API failed with status ${response.status}`);
    }

    return {
      data: Array.isArray(json.data) ? json.data : [],
      totalResults: Number(json.resultCount ?? json.count ?? 0),
      error: null,
      nextPage: Boolean(json.nextPage),
      filters: json.filters,
    };
  } catch (err) {
    console.error('fetchInventoryData: request failed', err);
    return {
      data: [], totalResults: 0, error: err.message || 'Failed to load inventory data'
    };
  }
}

export const exportInventory = async (format, type = "All") => {
  try {
    const url = `${INVENTORY_EXPORT_URL}?format=${format}&type=${type}`;

    console.log("Inventory export URL:", url);

    const response = await fetch(url, {
      method: "GET",
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) {
      let message = `Inventory export failed (${response.status})`;
      if (contentType.includes("application/json")) {
        const errorData = await response.json();
        message =
          errorData.message ||
          errorData.error ||
          message;
      } else {
        const text = await response.text();
        console.error("Backend export error:", text);
        message = text || message;
      }
      throw new Error(message);
    }

    if (
      contentType.includes("text/html") ||
      contentType.includes("application/json")
    ) {
      const text = await response.text();
      console.error(
        "Invalid export response:",
        text
      );

      throw new Error(
        "Backend returned an invalid export response."
      );
    }

    const blob = await response.blob();

    if (!blob.size) {
      throw new Error("Export file is empty.");
    }

    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    const date = new Date()?.toISOString()?.slice(0, 10);
    link.download = format === "excel" ? `inventory_export_${date}.xlsx` : `inventory_export_${date}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);

  } catch (error) {
    console.error(
      "exportInventory:",
      error
    );

    throw error;
  }
};
