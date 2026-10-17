import { prefetchRetailReports } from '../api/retailPrefetch';
import { useEffect, useMemo, useRef, useState } from "react";
import "./ManagePos.css";
import { ensureAmazonStarted } from "../api/amazonStartup";

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
    return String(value);
};

const formatDate = (value) => {
    if (!value || value === emptyValue) return emptyValue;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? displayValue(value) : date.toLocaleDateString("en-IN");
};

const getApiRows = (poData) => {
    const records = Array.isArray(poData)
        ? poData
        : poData?.payload || poData?.data?.payload || poData?.purchaseOrders || poData?.items || [];

    return records.map((record, index) => ({
        po: displayValue(readValue(record, ["poNumber", "purchaseOrderNumber", "orderId", "poId", "externalId"])),
        status: displayValue(readValue(record, ["vendorFacingStatus", "status", "poStatus", "purchaseOrderStatus"])),
        vendorCode: displayValue(readValue(record, ["vendor", "vendorCode", "vendorId", "vendor.vendorCode"])),
        poItems: displayValue(readValue(record, ["submitted.items", "numberOfItems", "poItemCount", "itemCount", "totalItems"])),
        orderDate: formatDate(readValue(record, ["orderDateUTC", "orderDate", "createdDate"])),
        requestedQty: displayValue(readValue(record, ["submitted.quantity", "requestedQuantity", "totalRequestedQuantity", "requestedQty"])),
        acceptedQty: displayValue(readValue(record, ["accepted.quantity", "acceptedQuantity", "totalAcceptedQuantity", "acceptedQty"])),
        asnQty: displayValue(readValue(record, ["asn.quantity", "asnQuantity", "asnQty"])),
        receivedQty: displayValue(readValue(record, ["received.quantity", "receivedQuantity", "receivedQty"])),
        remainingQty: displayValue(readValue(record, ["submitted.quantity", "remainingQuantity", "openQuantity", "remainingQty"])),
        totalAcceptedCost: displayValue(readValue(record, ["accepted.totalCost", "totalAcceptedCost", "acceptedCost", "totalCost"])),
        cancelledQty: displayValue(readValue(record, ["cancelled.quantity", "cancelledQuantity", "cancelledQty"])),
        shipTo: displayValue(readValue(record, ["shipLocation", "shipToLocation", "shipTo", "fcName", "fulfillmentCenterName"])),
        consolidationId: displayValue(readValue(record, ["consolidationId"])),
        freightTerms: displayValue(readValue(record, ["freightTerms", "freightTerm"])),
        windowStart: formatDate(readValue(record, ["handOffStart", "handoffWindowStart", "windowStart"])),
        cancellationDeadline: formatDate(readValue(record, ["cancellationDeadline", "cancellationDeadlineDate"])),
        _orderDate: readValue(record, ["orderDateUTC", "orderDate", "createdDate"]),
        _key: `${displayValue(readValue(record, ["poNumber", "purchaseOrderNumber", "orderId", "poId"]))}-${index}`,
    }));
};

const columns = [
    ["po", "PO"],
    ["vendorCode", "Vendor code"],
    ["poItems", "PO items"],
    ["orderDate", "Order date"],
    ["requestedQty", "Requested quantity"],
    ["acceptedQty", "Accepted quantity"],
    ["asnQty", "ASN quantity"],
    ["receivedQty", "Received quantity"],
    ["remainingQty", "Remaining quantity"],
    ["totalAcceptedCost", "Total accepted cost"],
    ["cancelledQty", "Cancelled quantity"],
    ["shipTo", "Ship to location"],
    ["consolidationId", "Consolidation ID"],
    ["freightTerms", "Freight terms"],
    ["windowStart", "Window start"],
    ["cancellationDeadline", "Cancellation deadline"],
];

const companyLabel = (company) => company?.label || company?.name || company?.accountName || company?.companyName || "Unnamed company";
const companyId = (company) => company?.globalAccountId || company?.id || company?.accountId || company?.globalAccount?.id || "";

const getCompanies = (data) => {
    const candidates = data?.globalAccounts || data?.accounts || data?.accountList || data?.data?.globalAccounts || [];
    return Array.isArray(candidates) ? candidates : [];
};

export default function ManagePos({ openRequest = 0, poData, loading: parentLoading = false, error: parentError = "" }) {
    const [activeTab, setActiveTab] = useState("Unconfirmed");
    const [poDataByTab, setPoDataByTab] = useState({});
    const [apiLoading, setApiLoading] = useState(false);
    const [apiError, setApiError] = useState("");
    const [vendorConfigurations, setVendorConfigurations] = useState(null);
    const [companies, setCompanies] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState("");
    const [view, setView] = useState("PO");
    const [search, setSearch] = useState("");
    const [shipTo, setShipTo] = useState("All");
    const [orderDateFrom, setOrderDateFrom] = useState("");
    const [orderDateTo, setOrderDateTo] = useState("");
    const [showFilters, setShowFilters] = useState(false);
    const bootstrapStarted = useRef(null);
    const bootstrapRunning = useRef(false);
    const [retryRequest, setRetryRequest] = useState(0);
    const [selectedCompanyId, setSelectedCompanyId] = useState("");

    const confirmedRows = useMemo(() => getApiRows(poDataByTab.Confirmed), [poDataByTab]);
    const unconfirmedRows = useMemo(() => getApiRows(poDataByTab.Unconfirmed), [poDataByTab]);
    const closedRows = useMemo(() => getApiRows(poDataByTab.Closed), [poDataByTab]);
    // IMPORTANT: All uses the actual response from the All API call.
    // Do not build All by concatenating cached tab responses because only
    // the selected tab may have been fetched so far.
    const allRows = useMemo(() => getApiRows(poDataByTab.All), [poDataByTab]);
    const rows = activeTab === "Confirmed"
        ? confirmedRows
        : activeTab === "Unconfirmed"
            ? unconfirmedRows
            : activeTab === "Closed"
                ? closedRows
                : allRows;

    const shipToOptions = useMemo(
        () => [...new Set(rows.map((row) => row.shipTo).filter((value) => value !== emptyValue))],
        [rows],
    );

    const tabRows = rows;

    const filteredRows = useMemo(() => {
        const q = search.trim().toLowerCase();
        const parseInputDate = (value) => {
            const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            return match ? new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00`) : null;
        };
        const from = parseInputDate(orderDateFrom);
        const to = parseInputDate(orderDateTo);

        return tabRows.filter((row) => {
            const orderDate = new Date(row._orderDate);
            const matchesSearch = !q || columns.some(([key]) =>
                String(row[key] ?? "").toLowerCase().includes(q)
            );
            const matchesShipTo = shipTo === "All" || row.shipTo === shipTo;
            const matchesFrom = !from || (!Number.isNaN(orderDate.getTime()) && orderDate >= from);
            const matchesTo = !to || (!Number.isNaN(orderDate.getTime()) && orderDate <= to);
            return matchesSearch && matchesShipTo && matchesFrom && matchesTo;
        });
    }, [orderDateFrom, orderDateTo, search, shipTo, tabRows]);

    const tabCount = (tab) => ({
        Confirmed: confirmedRows.length,
        Unconfirmed: unconfirmedRows.length,
        Closed: closedRows.length,
        All: allRows.length,
    }[tab]);

    const recentChanges = useMemo(() => {
        const data = poDataByTab[activeTab] || poDataByTab.Confirmed;
        const config = vendorConfigurations || data?.vendorConfigurations;
        if (Array.isArray(config)) return config;
        return config?.payload || config?.vendorConfigurationRequests || config?.recentModifications || [];
    }, [activeTab, poDataByTab, vendorConfigurations]);

    const getStatusPayload = (tab) => {
        switch (tab) {
            case "Unconfirmed":
                return ["UNCONFIRMED"];
            case "Confirmed":
                return ["CONFIRMED"];
            case "Closed":
                return ["CLOSED"];
            case "All":
                return ["UNCONFIRMED", "CONFIRMED", "CLOSED"];
            default:
                return ["CONFIRMED"];
        }
    };

    const fetchSearchPo = async (tab) => {
        const vendorFacingStatus = getStatusPayload(tab);

        setApiLoading(true);
        setApiError("");

        try {
            const response = await fetch("/amazon-api/search-po", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                body: JSON.stringify({ vendorFacingStatus }),
            });

            const result = await response.json();

            if (!response.ok || !result?.success) {
                throw new Error(result?.message || `Request failed with HTTP ${response.status}`);
            }

            console.log("[ManagePos] search-po response:", result);

            setPoDataByTab((previous) => ({
                ...previous,
                [tab]: result.data,
            }));
        } catch (err) {
            console.error("[ManagePos] search-po error:", err);
            setApiError(err?.message || "Unable to fetch purchase orders.");
        } finally {
            setApiLoading(false);
        }
    };

    const fetchVendorConfigurations = async () => {
        try {
            const response = await fetch("/amazon-api/vendor-configurations", {
                method: "POST",
                headers: { "Accept": "application/json" },
            });
            const result = await response.json();
            if (!response.ok || !result?.success) {
                throw new Error(result?.message || `Vendor configuration failed with HTTP ${response.status}`);
            }
            setVendorConfigurations(result.data);
        } catch (err) {
            // PO results are still usable when Recent Changes is unavailable.
            console.error("[ManagePos] vendor-configurations error:", err);
        }
    };
    const fetchCompanies = async () => {
        try {
            const response = await fetch("/amazon-api/global-accounts", {
                headers: { Accept: "application/json" },
            });

            const result = await response.json();

            if (!response.ok || !result?.success) {
                throw new Error(result?.message || "Unable to load companies.");
            }

            const accountList = getCompanies(result.data);

            setCompanies(accountList);

            const selected =
                result.data?.selectedGlobalAccount ||
                result.data?.selectedAccount ||
                accountList.find((account) => account?.selected);

            const selectedId = companyId(selected);

            setSelectedCompanyId(selectedId);
        } catch (err) {
            console.error("[ManagePos] global-accounts error:", err);
        }
    };

    const handleCompanyChange = async (event) => {
        const globalAccountId = event.target.value;

        const nextCompany = companies.find(
            (company) => companyId(company) === globalAccountId
        );

        if (!nextCompany || !globalAccountId || apiLoading) return;

        setApiLoading(true);
        setApiError("");

        console.log(
            "[ManagePos] Switching globalAccountId:",
            globalAccountId
        );

        try {
            const response = await fetch("/amazon-api/switch-company", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    globalAccountId,
                }),
            });

            const result = await response.json();

            console.log("[ManagePos] switch-company payload:", {
                globalAccountId,
            });

            console.log("[ManagePos] switch-company response:", result);

            if (!response.ok || !result?.success) {
                throw new Error(
                    result?.message || "Unable to switch company."
                );
            }

            setSelectedCompanyId(globalAccountId);
            setPoDataByTab({});

            await fetchSearchPo(activeTab);
            await fetchCompanies();
            void prefetchRetailReports();

        } catch (err) {
            console.error("[ManagePos] switch-company error:", err);
            setApiError(err?.message || "Unable to switch company.");
        } finally {
            setApiLoading(false);
        }
    };

    useEffect(() => {
        const requestKey = `${openRequest}:${retryRequest}`;
        if (bootstrapRunning.current || bootstrapStarted.current === requestKey) return;
        bootstrapStarted.current = requestKey;
        bootstrapRunning.current = true;

        const bootstrapManagePos = async () => {
            setApiLoading(true);
            setApiError("");

            try {
                await ensureAmazonStarted();

                console.log("[ManagePos] Opening Manage POs through the local proxy...");

                const response = await fetch("/amazon-api/manage-pos", {
                    method: "POST",
                    signal: AbortSignal.timeout(180000),
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({}),
                });

                const result = await response.json();

                if (!response.ok || !result?.success) {
                    throw new Error(result?.message || `Manage POS failed with HTTP ${response.status}`);
                }

                console.log("[ManagePos] Manage POS success:", result);
                await fetchSearchPo("Unconfirmed");
                await fetchCompanies();
                void prefetchRetailReports();
            } catch (err) {
                console.error("[ManagePos] Manage POS bootstrap error:", err);
                setApiError(err?.message || "Unable to open Manage POs.");
            } finally {
                bootstrapRunning.current = false;
                setApiLoading(false);
            }
        };

        bootstrapManagePos();
    }, [openRequest, retryRequest]);

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        if (!apiLoading) fetchSearchPo(tab);
    };

    const isLoading = parentLoading || apiLoading;
    const displayError = apiError || parentError;

    const handleSearch = () => {
        // Filtering is already reactive; keeping this button matches Amazon's UI.
    };

    return (
        <section className="manage-pos-page">
            <div className="manage-pos-topline">
                <div className="manage-pos-breadcrumb">
                    {/* <span>Purchase Orders</span>
                    <span>›</span>
                    <span>PO Dashboard</span>
                    <span>›</span> */}
                    <strong>Manage POs</strong>
                </div>

                <div className="manage-pos-actions">
                    <label className="manage-company-select">
                        <span>Company</span>
                        <select
                            value={selectedCompanyId}
                            onChange={handleCompanyChange}
                            disabled={apiLoading || !companies.length}
                        >
                            <option value="">
                                {companies.length ? "Select company" : "Loading companies…"}
                            </option>

                            {companies.map((company, index) => {
                                const label = companyLabel(company);
                                const id = companyId(company);

                                return (
                                    <option
                                        key={`${id || label}-${index}`}
                                        value={id}
                                        disabled={!id}
                                    >
                                        {label}
                                    </option>
                                );
                            })}
                        </select>
                    </label>
                </div>
            </div>

            {/* <div className="manage-pos-title-row">
                <div>
                    <h2>Manage POs</h2>
                    <div className="manage-pos-links">
                        <button>View Training</button>
                        <span>|</span>
                        <button>View data table tips</button>
                        <span>|</span>
                        <button>Join Our Vendor Research Panel</button>
                        <span>|</span>
                        <button>Give us feedback</button>
                    </div>
                </div>

                <div className="manage-pos-recent">
                    <span className="info-dot">i</span>
                    <div>
                        <small>Recent Changes</small>
                        <strong>{recentChanges.length ? `${recentChanges.length} changes` : "None"}</strong>
                    </div>
                </div>
            </div> */}

            <div className="manage-pos-description">
                {apiError && <button disabled={apiLoading} onClick={() => setRetryRequest(value => value + 1)}>Retry</button>}
                <span>
                    {isLoading
                        ? "Loading purchase orders from Amazon Vendor Central..."
                        : displayError || "View and take actions on your purchase orders (POs)."}
                </span>
            </div>

            <div className="manage-pos-toolbar">
                <div className="manage-pos-toolbar-left">
                    <div className="view-switch">
                        <span className="toolbar-label">View by</span>
                        <button
                            className={view === "PO" ? "active" : ""}
                            onClick={() => setView("PO")}
                        >
                            PO
                        </button>
                        {/* <button
                            className={view === "PO items" ? "active" : ""}
                            onClick={() => setView("PO items")}
                        >
                            PO items
                        </button> */}
                    </div>

                    <div className="manage-search">
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by PO, ASIN, or external ID"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleSearch();
                            }}
                        />
                        <button onClick={handleSearch}>Search</button>
                    </div>
                </div>
                {/* 
                <div className="manage-pos-toolbar-right">
                    <label>
                        <span>Order date start</span>
                        <input
                            type="text"
                            placeholder="DD/MM/YYYY"
                            value={orderDateFrom}
                            onChange={(event) => setOrderDateFrom(event.target.value)}
                        />
                    </label>

                    <label>
                        <span>Order date end</span>
                        <input
                            type="text"
                            placeholder="DD/MM/YYYY"
                            value={orderDateTo}
                            onChange={(event) => setOrderDateTo(event.target.value)}
                        />
                    </label>

                    <label>
                        <span>Ship-to location</span>
                        <select value={shipTo} onChange={(e) => setShipTo(e.target.value)}>
                            <option>All</option>
                            {shipToOptions.map((location) => (
                                <option key={location}>{location}</option>
                            ))}
                        </select>
                    </label>

                    <button
                        className="sort-filter-btn"
                        onClick={() => setShowFilters((v) => !v)}
                    >
                        ⚙ Sort &amp; filter
                    </button>
                </div> */}
            </div>

            {showFilters && (
                <div className="manage-filter-panel">
                    <strong>Sort &amp; filter</strong>
                    <span>Additional filters can be configured here.</span>
                </div>
            )}

            <div className="manage-pos-tabs">
                {[
                    "Unconfirmed",
                    "Confirmed",
                    "Closed",
                    "All",
                ].map((label) => (
                    <button
                        key={label}
                        className={activeTab === label ? "active" : ""}
                        onClick={() => handleTabChange(label)}
                    >
                        {label} ({tabCount(label)})
                    </button>
                ))}
            </div>

            <div className="manage-results">
                <div className="manage-faq">
                    <button>FAQ</button>
                    <span>{isLoading ? "Loading…" : `${filteredRows.length} Results`}</span>
                </div>
                {/* 
                <div className="manage-table-actions">
                    <button>⚙ Customize columns</button>
                    <button>Customize export</button>
                    <button className="dark-action">Export PO to Excel ▾</button>
                    <button className="dark-action">Upload PO confirmation</button>
                    <span className="help-small">?</span>
                </div> */}

                <div className="manage-table-scroll">
                    <table>
                        <thead>
                            <tr>
                                <th className="check-col">
                                    <input type="checkbox" aria-label="Select all" />
                                </th>
                                {columns.map(([key, label]) => (
                                    <th key={key}>
                                        <span>{label}</span>
                                        <b>↕</b>
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={columns.length + 1} className="empty-row">
                                        Loading live Amazon PO data…
                                    </td>
                                </tr>
                            ) : filteredRows.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length + 1} className="empty-row">
                                        No purchase orders found.
                                    </td>
                                </tr>
                            ) : (
                                filteredRows.map((row) => (
                                    <tr key={row._key}>
                                        <td className="check-col">
                                            <input type="checkbox" aria-label={`Select ${row.po}`} />
                                        </td>
                                        {columns.map(([key]) => (
                                            <td key={key}>
                                                {key === "po" ? (
                                                    <a
                                                        className="po-link"
                                                        href={`?poId=${encodeURIComponent(row.po)}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        {row[key]}
                                                    </a>) : (
                                                    row[key]
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="manage-table-footer">
                    <span>
                        Results 1 to {filteredRows.length} of {filteredRows.length}
                    </span>

                    <div className="pagination">
                        <button disabled>‹</button>
                        <button disabled>‹‹</button>
                        <span>Page 1 of 1</span>
                        <button disabled>›</button>
                        <button disabled>››</button>
                        <label>
                            Go to page
                            <input value="1" readOnly />
                        </label>
                        <label>
                            Results per page
                            <select defaultValue="10">
                                <option>10</option>
                                <option>25</option>
                                <option>50</option>
                            </select>
                        </label>
                    </div>
                </div>
            </div>
        </section>
    );
}
