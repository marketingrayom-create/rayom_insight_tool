import { useMemo, useRef, useState } from "react";
import "./PODetails.css";

const emptyValue = "—";

const readValue = (record, keys) => {
    for (const key of keys) {
        const value = key.split(".").reduce((current, part) => current?.[part], record);
        if (value !== undefined && value !== null && value !== "") return value;
    }
    return emptyValue;
};

const displayValue = (value) => {
    if (value === null || value === undefined || value === "") return emptyValue;
    if (typeof value === "object") return value.name || value.code || emptyValue;
    return String(value).replace(/^po_app_(condition_|freight_|payment_method_)/, "").replaceAll("_", " ");
};

const formatDate = (value) => {
    if (!value || value === emptyValue) return emptyValue;
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? displayValue(value)
        : date.toLocaleDateString("en-IN");
};

const money = (value) => {
    if (value === emptyValue || value === undefined || value === null || value === "") return emptyValue;
    if (typeof value === "number") return `${value.toFixed(2)} INR`;
    return String(value).includes("INR") ? String(value) : `${value} INR`;
};

const getItems = (po) => {
    const candidates = [
        po?.items,
        po?.poItems,
        po?.purchaseOrderItems,
        po?.payload?.items,
        po?.data?.items,
    ];

    const items = candidates.find(Array.isArray);
    if (items) return items;

    // Manage POs list responses normally contain one row per PO.
    // In that case, expose the row as a single detail item rather than inventing data.
    return [];
};

export default function PODetails({ po, onBack }) {
    const itemRows = useMemo(() => getItems(po), [po]);
    const itemsTable = useRef(null);
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState("");

    if (!po) {
        return (
            <section className="po-details-page">
                <div className="po-details-empty">
                    <h2>PO Details</h2>
                    <p>No purchase order was selected.</p>
                    <button className="po-back-btn" onClick={onBack}>← Back to Manage POs</button>
                </div>
            </section>
        );
    }

    const poNumber = displayValue(readValue(po, [
        "poNumber", "purchaseOrderNumber", "orderId", "poId", "externalId", "po"
    ]));

    const status = displayValue(readValue(po, [
        "vendorFacingStatus", "status", "poStatus", "purchaseOrderStatus"
    ]));

    const vendor = displayValue(readValue(po, [
        "vendorCode", "vendor", "vendorId", "vendor.vendorCode"
    ]));

    const shipTo = displayValue(readValue(po, [
        "shipToLocation", "shipLocation", "shipTo", "fcName", "fulfillmentCenterName"
    ]));

    const orderDate = formatDate(readValue(po, [
        "orderDateUTC", "orderDate", "createdDate", "_orderDate"
    ]));

    const shipWindow = (() => {
        const start = readValue(po, ["handOffStart", "handoffWindowStart", "windowStart"]);
        const end = readValue(po, ["handOffEnd", "handoffWindowEnd", "windowEnd"]);
        if (start !== emptyValue || end !== emptyValue) {
            return `${formatDate(start)} - ${formatDate(end)}`;
        }
        return displayValue(readValue(po, ["shipWindow", "shippingWindow"]));
    })();

    const requestedQty = displayValue(readValue(po, [
        "requestedQuantity", "totalRequestedQuantity", "requestedQty", "submitted.quantity"
    ]));

    const acceptedQty = displayValue(readValue(po, [
        "acceptedQuantity", "totalAcceptedQuantity", "acceptedQty", "accepted.quantity"
    ]));

    const cancelledQty = displayValue(readValue(po, [
        "cancelledQuantity", "cancelledQty", "cancelled.quantity"
    ]));

    const receivedQty = displayValue(readValue(po, [
        "receivedQuantity", "receivedQty", "received.quantity"
    ]));

    const totalCost = money(readValue(po, [
        "totalCost", "totalAcceptedCost", "acceptedCost", "accepted.totalCost"
    ]));

    const freightTerms = displayValue(readValue(po, ["freightTerms", "freightTerm"]));
    const paymentMethod = displayValue(readValue(po, ["paymentMethod", "paymentTermsMethod"]));
    const paymentTerms = displayValue(readValue(po, ["paymentTerms", "terms"]));
    const purchasingEntity = displayValue(readValue(po, ["purchasingEntity", "buyerName", "customerName"]));
    const gstin = displayValue(readValue(po, ["indiaGstNumber", "gstin", "GSTIN", "gstNumber"]));
    const shippingAddress = po.shippingAddress;
    const deliveryAddress = shippingAddress
        ? [shippingAddress.addressName, shippingAddress.addressLine1, shippingAddress.addressLine2,
            shippingAddress.city, shippingAddress.stateOrRegion, shippingAddress.zipCode,
            shippingAddress.districtOrCountry].filter(Boolean).join(", ")
        : displayValue(readValue(po, [
        "deliveryAddress", "shipToAddress", "destinationAddress", "address"
    ]));

    const exportExcel = async () => {
        if (exporting || !itemsTable.current) return;
        setExporting(true);
        setExportError("");
        try {
            const XLSX = await import("xlsx");
            const workbook = XLSX.utils.book_new();
            const summary = [
                ["PO Number", poNumber], ["Status", status], ["Vendor", vendor],
                ["Ship to location", shipTo], ["Ordered on", orderDate],
                ["Ship window", shipWindow], ["Freight terms", freightTerms],
                ["Payment method", paymentMethod], ["Payment terms", paymentTerms],
                ["Purchasing entity", purchasingEntity], ["GSTIN", gstin],
                ["Delivery address", deliveryAddress], [],
                ["Status", "Items", "Quantity", "Total cost (INR)"],
                ...["submitted", "accepted", "cancelled", "received"].map(key => [
                    key, po[key]?.items ?? "", po[key]?.quantity ?? "", po[key]?.totalCost ?? "",
                ]),
            ];
            const summarySheet = XLSX.utils.aoa_to_sheet(summary);
            summarySheet["!cols"] = [{ wch: 24 }, { wch: 65 }, { wch: 18 }, { wch: 22 }];
            XLSX.utils.book_append_sheet(workbook, summarySheet, "PO Summary");

            // Export the displayed columns, preserving identifiers as text.
            const rows = Array.from(itemsTable.current.rows, row =>
                Array.from(row.cells, (cell, index) => {
                    const text = cell.textContent.trim();
                    if (row.parentElement.tagName === "TBODY" && index >= 8) {
                        const numeric = text.replace(/\s*INR\s*$/, "").replaceAll(",", "");
                        if (numeric !== "" && Number.isFinite(Number(numeric))) return Number(numeric);
                    }
                    return text;
                }));
            const sheet = XLSX.utils.aoa_to_sheet(rows);
            sheet["!cols"] = rows[0].map((_, index) => ({ wch: index === 5 ? 70 : 22 }));
            sheet["!autofilter"] = { ref: sheet["!ref"] };
            XLSX.utils.book_append_sheet(workbook, sheet, "PO Items");
            const filename = poNumber.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
            XLSX.writeFile(workbook, `PO_${filename}.xlsx`);
        } catch {
            setExportError("Excel download failed. Please try again.");
        } finally {
            setExporting(false);
        }
    };

    return (
        <section className="po-details-page">
            <div className="po-details-breadcrumb">
                <span>Purchase Orders</span>
                <span>›</span>
                <span>PO Dashboard</span>
                <span>›</span>
                <span>Manage POs</span>
                <span>›</span>
                <strong>PO Details</strong>
            </div>

            <div className="po-details-header">
                <button className="po-back-btn" onClick={onBack}>
                    ← Return to Manage POs
                </button>
            </div>

            <h1 className="po-details-title">PO: {poNumber}</h1>

            <div className="po-summary-grid">
                <div className="po-info-card">
                    <div className="po-info-row">
                        <span>Status</span>
                        <strong className={String(status).toLowerCase().includes("cancel") ? "po-status-cancelled" : "po-status"}>
                            {status}
                        </strong>
                    </div>
                    <div className="po-info-row">
                        <span>Vendor</span>
                        <strong>{vendor}</strong>
                    </div>
                    <div className="po-info-row">
                        <span>Ship to location</span>
                        <strong>{shipTo}</strong>
                    </div>
                    <div className="po-info-row">
                        <span>Ordered On</span>
                        <strong>{orderDate}</strong>
                    </div>
                    <div className="po-info-row">
                        <span>Ship window</span>
                        <strong>{shipWindow}</strong>
                    </div>
                    <div className="po-info-row">
                        <span>Freight terms</span>
                        <strong>{freightTerms}</strong>
                    </div>
                    <div className="po-info-row">
                        <span>Payment Method</span>
                        <strong>{paymentMethod}</strong>
                    </div>
                    <div className="po-info-row">
                        <span>Payment terms</span>
                        <strong>{paymentTerms}</strong>
                    </div>
                    <div className="po-info-row">
                        <span>Purchasing entity</span>
                        <strong>{purchasingEntity}</strong>
                    </div>
                    <div className="po-info-row">
                        <span>GSTIN</span>
                        <strong>{gstin}</strong>
                    </div>
                </div>

                <div className="po-summary-right">
                    <div className="po-quantity-card">
                        <div className="po-quantity-row po-quantity-head">
                            <span></span>
                            <span>Items</span>
                            <span>Quantity Submitted</span>
                            <span>Total cost</span>
                        </div>
                        {["submitted", "accepted", "cancelled", "received"].map(key => (
                            <div className="po-quantity-row" key={key}>
                                <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                                <span>{displayValue(po[key]?.items)}</span>
                                <span>{displayValue(po[key]?.quantity)}</span>
                                <span>{money(po[key]?.totalCost)}</span>
                            </div>
                        ))}
                    </div>

                    <div className="po-delivery-card">
                        <h3>Delivery Address: {shipTo}</h3>
                        <div className="po-address">
                            {deliveryAddress !== emptyValue
                                ? deliveryAddress
                                : <>
                                    <strong>{purchasingEntity}</strong>
                                    <span>{shipTo}</span>
                                    <span>India</span>
                                </>
                            }
                        </div>
                        {/* <button className="shipping-label-btn">Print shipping label ▾</button> */}
                    </div>
                </div>
            </div>

            {String(status).toLowerCase().includes("closed") && <div className="po-closed-note">
                This PO is closed. To make changes to the items below, select the items you want to update, then click Update selected items to continue.
            </div>}

            <div className="po-items-section">
                <h2>PO items ({itemRows.length})</h2>

                <div className="po-filter-bar">
                    <button>Filter Rows</button>
                    <span>Click on the column headers to sort by that column</span>
                </div>

                <div className="po-items-scroll">
                    <table className="po-items-table" ref={itemsTable}>
                        <thead>
                            <tr>
                                <th>ASIN</th>
                                <th>Cancellation status</th>
                                <th>Cancellation date</th>
                                <th>External Id</th>
                                <th>Model Number</th>
                                <th>Title</th>
                                <th>Window Type</th>
                                <th>Expected date</th>
                                <th>Quantity Requested</th>
                                <th>Accepted quantity</th>
                                <th>Quantity received</th>
                                <th>Quantity Outstanding</th>
                                <th>Unit Cost</th>
                                <th>Total cost</th>
                            </tr>
                        </thead>
                        <tbody>
                            {itemRows.map((item, index) => {
                                const asin = displayValue(readValue(item, ["asin", "ASIN", "productAsin"]));
                                const itemStatus = displayValue(readValue(item, [
                                    "cancelReason", "cancellationStatus", "status", "itemStatus"
                                ]));
                                const cancellationDate = formatDate(readValue(item, [
                                    "cancelledOn", "cancellationDate", "cancelledDate"
                                ]));
                                const externalId = displayValue(readValue(item, [
                                    "externalId", "externalID", "asin", "sku"
                                ]));
                                const modelNumber = displayValue(readValue(item, [
                                    "vendorSku", "modelNumber", "model", "modelNo"
                                ]));
                                const title = displayValue(readValue(item, [
                                    "title", "productTitle", "itemTitle"
                                ]));
                                const windowType = displayValue(readValue(item, [
                                    "handOffType", "windowType", "deliveryWindowType"
                                ]));
                                const expectedDate = formatDate(readValue(item, [
                                    "edd", "expectedDate", "expectedDeliveryDate", "deliveryDate"
                                ]));
                                const quantityRequested = displayValue(readValue(item, [
                                    "qtySubmitted", "requestedQuantity", "quantityRequested", "quantity", "submitted.quantity"
                                ]));
                                const itemAccepted = displayValue(readValue(item, [
                                    "qtyAccepted", "acceptedQuantity", "quantityAccepted", "accepted.quantity"
                                ]));
                                const itemReceived = displayValue(readValue(item, [
                                    "qtyReceived", "receivedQuantity", "quantityReceived", "received.quantity"
                                ]));
                                const outstanding = displayValue(readValue(item, [
                                    "qtyOutstanding", "quantityOutstanding", "outstandingQuantity", "remainingQuantity"
                                ]));
                                const unitCost = money(readValue(item, [
                                    "unitCost", "costPerUnit", "price"
                                ]));
                                const itemTotal = money(readValue(item, [
                                    "totalCost", "lineTotal", "total"
                                ]));

                                return (
                                    <tr key={`${asin}-${index}`}>
                                        <td className="asin-cell">{asin}</td>
                                        <td className={String(itemStatus).toLowerCase().includes("cancel") ? "cancelled-cell" : ""}>
                                            {itemStatus}
                                        </td>
                                        <td>{cancellationDate}</td>
                                        <td>{externalId}</td>
                                        <td>{modelNumber}</td>
                                        <td>{title}</td>
                                        <td>{windowType}</td>
                                        <td>{expectedDate}</td>
                                        <td>{quantityRequested}</td>
                                        <td>{itemAccepted}</td>
                                        <td>{itemReceived}</td>
                                        <td>{outstanding}</td>
                                        <td>{unitCost}</td>
                                        <td>{itemTotal}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="po-details-actions">
                    <button className="secondary-action" onClick={exportExcel} disabled={exporting}>
                        {exporting ? "Exporting…" : "Export data for your records"}
                    </button>
                    {/* <button className="secondary-action">View packing slip</button> */}
                    {/* <button className="secondary-action">Format all items for export</button> */}
                </div>
                {exportError && <p role="alert">{exportError}</p>}
            </div>
        </section>
    );
}
