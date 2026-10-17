import { useMemo, useState, useEffect } from 'react';
import { shipmentFields } from '../components/TransitShipmentModal';
import { fetchInventoryData, BASIC_COLUMNS, COLUMN_LABELS, exportInventory } from '../api/inventoryApi';
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FileDown, FileSpreadsheet } from "lucide-react";
import B2BShipment from "../components/B2BShipment";

const columns = [['ean', 'EAN'], ['id', 'SKU code'], ['name', 'Item name'], ['shelf', 'Shelf'], ['attributes', 'Shelf attributes'], ['batch', 'Batch'], ['batchStatus', 'Batch status'], ['type', 'Inventory type'], ['inHouse', 'Total stock'], ['available', 'Available (ATP)'], ['reserved', 'Blocked'], ['notFound', 'Not found'], ['size', 'Size'], ['color', 'Colour'], ['brand', 'Brand'], ['updated', 'Updated'], ['status', 'Status'], ['excess', 'Excess inventory'], ['variance', 'Net variance']];
const eans = ['8906206610079', '8906206610093', '8906206610055', '8906206610062', '8906206610031'];



function InHouseTable({ products }) {
  return <div className="table-scroll"><table className="inventory-grid detailed-grid"><thead><tr>{columns.map(([, label]) => <th key={label}>{label}<span className="filter-mark">⌄</span></th>)}</tr></thead><tbody>{products.map((product, index) => { const row = { ...product, ean: product.ean || eans[index % eans.length], shelf: product.shelf || `A-A11-0${index + 1}-02`, attributes: 'Inventory allocation: true · Inventory sync: true · SKU mixing: true · Shelf on hold: false', batch: product.batch || `B-202609${index + 1}`, batchStatus: 'Active', type: product.inventoryType || (product.inHouse <= product.reorder ? 'Bad' : 'Good'), available: Math.max(0, product.inHouse - product.reserved), notFound: 0, size: product.size || '50 ml', color: product.color || 'Pearl', brand: product.brand || 'Unfooled', updated: '29 Aug 2026, 11:00', status: product.status || 'Active', excess: Math.max(0, product.inHouse - product.reorder * 2), variance: 0 }; return <tr key={product.id}>{columns.map(([key]) => <td key={key} className={key === 'attributes' ? 'attributes' : ''}>{key === 'id' ? <button className="sku-link">{row[key]}</button> : key === 'type' || key === 'status' ? <span className={`status ${row[key] === 'Good' || row[key] === 'Active' ? 'good' : 'low'}`}>{row[key]}</span> : key === 'name' ? <><strong>{row[key]}</strong><small>{row.category}</small></> : row[key]}</td>)}</tr>; })}</tbody></table></div>;
}

function TransitTable({ shipments, onEdit, onDelete }) {
  // Fields where only date should be displayed
  const dateOnlyFields = new Set([
    'PO Date',
    'Invoice Date',
    'Dispatched Date',
    'Pickup Date',
  ]);

  // Fields where date + time should be displayed
  const dateTimeFields = new Set([
    'Appointment Date',
    'Delivered Date',
  ]);

  // Format date only
  const formatDate = (value) => {
    if (!value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // Format date + time
  const formatDateTime = (value) => {
    if (!value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="table-scroll">
      <table className="inventory-grid detailed-grid shipment-grid">
        <thead>
          <tr>
            {shipmentFields.map((field) => (
              <th key={field}>{field}</th>
            ))}
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {shipments.map((shipment, index) => (
            <tr
              key={`${shipment['Invoice Number'] || 'shipment'}-${index}`}
            >
              {shipmentFields.map((field) => (
                <td key={field}>

                  {/* Status */}
                  {field === 'Status' ? (
                    <span
                      className={`status ${shipment[field] === 'Delivered'
                        ? 'good'
                        : shipment[field] === 'Delayed'
                          ? 'low'
                          : 'transit'
                        }`}
                    >
                      {shipment[field] || 'In transit'}
                    </span>

                    /* POD Link */
                  ) : field === 'POD Link' && shipment[field] ? (
                    <a
                      href={shipment[field]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pod-link"
                    >
                      {shipment[field]}
                    </a>
                  ) : dateOnlyFields.has(field) ? (
                    formatDate(shipment[field])
                  ) : dateTimeFields.has(field) ? (
                    formatDateTime(shipment[field])
                  ) : (
                    shipment[field] || '—'
                  )}

                </td>
              ))}

              {/* Actions */}
              <td>
                <div className="row-actions">
                  <button
                    onClick={() => onEdit(shipment, index)}
                  >
                    Update
                  </button>

                  <button
                    className="delete"
                    onClick={() => {
                      onDelete(shipment._id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApiInventoryTable({ data, loading, error }) {
  if (loading) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "#999" }}>
        Loading inventory data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "20px", color: "#d94942" }}>
        Error loading data: {error}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "#999" }}>
        No inventory data found
      </div>
    );
  }

  const formatQuantity = (value) => {
    if (value === null || value === undefined || value === "") {
      return "0";
    }

    const number = Number(value);

    return Number.isNaN(number)
      ? String(value)
      : String(number);
  };

  const cleanDisplayValue = (value) => {
    if (
      value === null ||
      value === undefined ||
      String(value).trim() === ""
    ) {
      return "—";
    }

    return String(value)
      .trim()
      .replace(/m�\/h/gi, "m³/h")
      .replace(/m\\ufffd\/h/gi, "m³/h");
  };

  const formatDate = (value) => {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return cleanDisplayValue(value);
    }

    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };


  const groupedRows = useMemo(() => {
    const map = new Map();

    data.forEach((row) => {
      const ean = String(row.Ean ?? "").trim();

      const key =
        ean ||
        String(row.productCode ?? "").trim() ||
        `row-${map.size}`;

      if (!map.has(key)) {
        map.set(key, {
          ...row,

          ean,

          shelves: [],
          totalQuantity: Number(row.totalQuantity ?? 0) || 0,
          totalAvailable: Number(row.eanTotalQuantity ?? 0) || 0,
        });
      }

      const item = map.get(key);

      /*
       * SHELVES
       */
      const backendShelves = Array.isArray(row.eanShelves)
        ? row.eanShelves
        : [];

      if (backendShelves.length > 0) {
        backendShelves.forEach((shelfItem) => {
          const shelfName = String(
            shelfItem.shelf ?? ""
          ).trim();

          if (!shelfName) return;

          const quantity =
            Number(shelfItem.quantity ?? 0) || 0;

          const existingIndex = item.shelves.findIndex(
            (shelf) => shelf.shelf === shelfName
          );

          if (existingIndex >= 0) {
            item.shelves[existingIndex] = {
              shelf: shelfName,
              quantity,
            };
          } else {
            item.shelves.push({
              shelf: shelfName,
              quantity,
            });
          }
        });
      } else if (row.shelf) {
        const shelfName = String(row.shelf).trim();

        if (shelfName) {
          item.shelves.push({
            shelf: shelfName,
            quantity: Number(row.quantity ?? 0) || 0,
          });
        }
      }

      /*
       * IMPORTANT:
       *
       * Same EAN ki next API row aaye to
       * EAN-level values update karenge.
       */

      if (
        row.totalQuantity !== null &&
        row.totalQuantity !== undefined
      ) {
        item.totalQuantity =
          Number(row.totalQuantity) || 0;
      }

      if (
        row.eanTotalQuantity !== null &&
        row.eanTotalQuantity !== undefined
      ) {
        item.totalAvailable =
          Number(row.eanTotalQuantity) || 0;
      }
    });

    return Array.from(map.values());
  }, [data]);




  return (
    <div className="table-scroll">
      <table className="inventory-grid detailed-grid grouped-inventory-grid">

        <thead>
          <tr>

            {/* EAN */}
            <th>
              EAN
              <span className="filter-mark">⌄</span>
            </th>

            {/* SKU */}
            <th>
              SKU CODE
              <span className="filter-mark">⌄</span>
            </th>

            {/* ITEM NAME */}
            <th>
              ITEM NAME
              <span className="filter-mark">⌄</span>
            </th>

            {/* IMAGE */}
            <th>
              IMAGE
            </th>

            {/* SHELVES */}
            <th>
              SHELVES
              <span className="filter-mark">⌄</span>
            </th>

            {/* SHELF ATTRIBUTES */}
            <th>
              SHELF ATTRIBUTES
              <span className="filter-mark">⌄</span>
            </th>

            {/* BATCH */}
            <th>
              BATCH
              <span className="filter-mark">⌄</span>
            </th>

            {/* BATCH STATUS */}
            <th>
              BATCH STATUS
              <span className="filter-mark">⌄</span>
            </th>

            {/* INVENTORY TYPE */}
            <th>
              INVENTORY TYPE
              <span className="filter-mark">⌄</span>
            </th>


            {/* TOTAL QUANTITY */}
            <th>
              TOTAL QUANTITY
              <span className="filter-mark">⌄</span>
            </th>


            {/* BLOCKED */}
            <th>
              BLOCKED
              <span className="filter-mark">⌄</span>
            </th>


            {/* TOTAL AVAILABLE */}
            <th>
              TOTAL AVAILABLE (ATP)
            </th>

            {/* QUANTITY */}
            {/* <th>
              Available(ATP)
              <span className="filter-mark">⌄</span>
            </th> */}


            {/* NOT FOUND */}
            <th>
              NOT FOUND
              <span className="filter-mark">⌄</span>
            </th>

            {/* PENDENCY */}
            <th>
              PENDENCY ON CHANNELS
              <span className="filter-mark">⌄</span>
            </th>

            {/* SIZE */}
            <th>
              SIZE
              <span className="filter-mark">⌄</span>
            </th>

            {/* COLOR */}
            <th>
              COLOR
              <span className="filter-mark">⌄</span>
            </th>

            {/* BRAND */}
            <th>
              BRAND
              <span className="filter-mark">⌄</span>
            </th>

            {/* UPDATED */}
            <th>
              UPDATED
              <span className="filter-mark">⌄</span>
            </th>

            {/* STATUS */}
            <th>
              STATUS
              <span className="filter-mark">⌄</span>
            </th>

            {/* EXCESS */}
            <th>
              EXCESS INVENTORY
              <span className="filter-mark">⌄</span>
            </th>

            {/* VARIANCE */}
            <th>
              NET VARIANCE
              <span className="filter-mark">⌄</span>
            </th>

          </tr>
        </thead>

        <tbody>
          {groupedRows.map((row, index) => {

            const inventoryType =
              String(row.inventoryType || "").trim();

            const status =
              String(row.status || "").trim();

            return (
              <tr
                key={`${row.ean ||
                  row.productCode ||
                  "inventory"
                  }-${index}`}
              >

                {/* ================= EAN ================= */}
                <td className="grouped-ean-cell">
                  <strong>
                    {cleanDisplayValue(row.ean)}
                  </strong>
                </td>

                {/* ================= SKU ================= */}
                <td>
                  <button
                    type="button"
                    className="sku-link"
                  >
                    {cleanDisplayValue(
                      row.productCode
                    )}
                  </button>
                </td>

                {/* ================= ITEM NAME ================= */}
                <td className="grouped-item-cell">
                  <strong>
                    {cleanDisplayValue(
                      row.itemType
                    )}
                  </strong>
                </td>

                {/* ================= IMAGE ================= */}
                <td>
                  {row.imageUrl ? (
                    <img
                      src={row.imageUrl}
                      alt={row.itemType || "Product"}
                      style={{
                        width: "55px",
                        height: "55px",
                        objectFit: "contain",
                        borderRadius: "4px",
                      }}
                    />
                  ) : (
                    "—"
                  )}
                </td>

                {/* ================= SHELVES ================= */}
                <td className="grouped-shelves-cell">
                  <div className="inventory-shelves-list">

                    {row.shelves.length > 0 ? (
                      row.shelves.map(
                        (item, shelfIndex) => (
                          <span
                            key={`${item.shelf}-${shelfIndex}`}
                            className="inventory-shelf-chip"
                          >
                            {cleanDisplayValue(
                              item.shelf
                            )}{" "}
                            (
                            {formatQuantity(
                              item.quantity
                            )}
                            )
                          </span>
                        )
                      )
                    ) : (
                      "—"
                    )}

                  </div>
                </td>

                {/* ================= SHELF ATTRIBUTES ================= */}
                <td className="attributes">
                  {cleanDisplayValue(
                    row.shelfAttribute
                  )}
                </td>

                {/* ================= BATCH ================= */}
                <td>
                  {cleanDisplayValue(
                    row.batchCode
                  )}
                </td>

                {/* ================= BATCH STATUS ================= */}
                <td>
                  {cleanDisplayValue(
                    row.batchStatus
                  )}
                </td>

                {/* ================= INVENTORY TYPE ================= */}
                <td>
                  <span
                    className={`status ${inventoryType.toLowerCase() ===
                      "good"
                      ? "good"
                      : "low"
                      }`}
                  >
                    {inventoryType || "—"}
                  </span>
                </td>

                {/* ================= TOTAL QUANTITY ================= */}
                <td>
                  <strong>
                    {formatQuantity(
                      row.totalQuantity
                    )}
                  </strong>
                </td>


                {/* ================= BLOCKED ================= */}
                <td>
                  {formatQuantity(
                    row.quantityBlocked
                  )}
                </td>

                {/* ================= TOTAL AVAILABLE ================= */}
                <td className="grouped-atp-cell">
                  <div className="inventory-atp-block">
                    <span className="inventory-atp-label">
                      Available / ATP
                    </span>

                    <strong>
                      {formatQuantity(
                        row.totalAvailable
                      )}
                    </strong>
                  </div>
                </td>

                {/* ================= QUANTITY ================= */}
                {/* <td>
                  {formatQuantity(
                    row.quantity
                  )}
                </td> */}


                {/* ================= NOT FOUND ================= */}
                <td>
                  {formatQuantity(
                    row.quantityNotFound
                  )}
                </td>

                {/* ================= PENDENCY ================= */}
                <td>
                  {formatQuantity(
                    row.pendencyOnChannels
                  )}
                </td>

                {/* ================= SIZE ================= */}
                <td>
                  {cleanDisplayValue(
                    row.size
                  )}
                </td>

                {/* ================= COLOR ================= */}
                <td>
                  {cleanDisplayValue(
                    row.color
                  )}
                </td>

                {/* ================= BRAND ================= */}
                <td>
                  {cleanDisplayValue(
                    row.brand
                  )}
                </td>

                {/* ================= UPDATED ================= */}
                <td>
                  {formatDate(
                    row.updated
                  )}
                </td>

                {/* ================= STATUS ================= */}
                <td>
                  <span
                    className={`status ${status.toLowerCase() ===
                      "active"
                      ? "good"
                      : "low"
                      }`}
                  >
                    {status || "—"}
                  </span>
                </td>

                {/* ================= EXCESS ================= */}
                <td>
                  {formatQuantity(
                    row.excessInventory
                  )}
                </td>

                {/* ================= VARIANCE ================= */}
                <td>
                  {formatQuantity(
                    row.netVariance
                  )}
                </td>

              </tr>
            );
          })}
        </tbody>

      </table>
    </div>
  );
}

export default function InventoryPage({ products,
  limit,
  shipments = [],
  search,
  setSearch,

  // B2B Shipment
  b2bShipments = [],

  setModal,
  defaultTab = "inHouse",

  // Normal Shipment
  onOpenShipment,
  onDeleteShipment,

  // B2B Shipment handlers
  onDeleteB2BShipment,
  useApi = true,
  pagination,
  onPageChange,
  inTransitTab,
  dateField,
  setDateField,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  onLimitChange,
}) {
  const [type, setType] = useState('All');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [apiData, setApiData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [companies, setCompanies] = useState([]);
  // Do not assume a company here.  The authenticated Uniware session may have
  // been changed outside React (for example by Selenium) before this page is
  // opened.
  const [selectedCompany, setSelectedCompany] = useState('');
  const [companyRefreshKey, setCompanyRefreshKey] = useState(0);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyError, setCompanyError] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  const handleInventoryExport = async (format) => {
    try {
      setLoading(true);
      setExportOpen(false);

      const inventoryType = type === "Good"  ? "Good" : type === "Bad"  ? "Bad" : "All";

      await exportInventory(
        format,
        inventoryType
      );

    } catch (error) {
      console.error(
        "Inventory export error:",
        error
      );

      alert(
        error.message ||
        "Inventory export failed"
      );

    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!useApi) return;

    fetch('/uniware-api/companies')
      .then((response) => response.json())
      .then((json) => {
        if (json.successful) {
          setCompanies(json.companies || []);
          setSelectedCompany(json.currentCompany || json.companies?.[0]?.id || '');
        }
      })
      .catch((err) => {
        console.error('Failed to load Uniware companies:', err);
      });
  }, [useApi]);

  const handleCompanyChange = async (companyId) => {
    // Always send the selection to the backend.  A company can be changed by
    // Selenium while the UI still has the old value, and choosing the current
    // company is also a useful explicit refresh.
    if (!companyId || companyLoading) return;

    setCompanyLoading(true);
    setCompanyError(null);
    setLoading(true);
    setApiData([]);
    setPage(1);

    try {
      const response = await fetch('/uniware-api/company/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId })
      });

      const json = await response.json();

      if (!response.ok || !json.successful) {
        throw new Error(json.message || 'Unable to switch Uniware company.');
      }

      setSelectedCompany(json.company?.id || companyId);
      // Let the normal inventory query run after every successful switch.  It
      // applies the active tab's filters, EAN grouping, sorting and pagination,
      // unlike the raw records returned by /api/company/select.
      setCompanyRefreshKey((key) => key + 1);
    } catch (err) {
      console.error('Company switch failed:', err);
      setCompanyError(err.message || 'Company switch failed.');
    } finally {
      setCompanyLoading(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!useApi || defaultTab !== 'inHouse') return;

    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const inventoryFilters = {
          Good: ['GOOD_INVENTORY'],
          Bad: ['BAD_INVENTORY'],
          All: ['GOOD_INVENTORY', 'BAD_INVENTORY']
        };

        const filters = [{
          id: 'inventoryTypeFilter',
          selectedValues: inventoryFilters[type] || inventoryFilters.All
        }];
        const data = await fetchInventoryData(
          BASIC_COLUMNS,
          filters,
          [{ column: 'updated', descending: true }],
          (page - 1) * pageSize,
          pageSize
        );

        // A previous company's query may complete after the user has already
        // switched.  Never let that stale response overwrite the new data.
        if (cancelled) return;

        if (data.error) {
          setError(data.error);
        }

        setApiData(data.data || []);
        setTotalCount(data.totalResults || 0);
      } catch (err) {
        if (cancelled) return;
        console.error('InventoryPage: Failed to fetch inventory:', err);
        setError(err.message || 'Failed to load inventory data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [page, type, useApi, defaultTab, selectedCompany, companyRefreshKey]);

  const visible = useMemo(() => products.filter((product) => product.inHouse > 0 && (type === 'All' || (product.inventoryType || (product.inHouse <= product.reorder ? 'Bad' : 'Good')) === type)), [products, type]);
  const paged = visible.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));

  const handleExcelDownload = () => {
    if (!shipments || shipments.length === 0) {
      alert("No shipment data available");
      return;
    }

    const excelData = shipments.map((shipment) => {
      const row = {};
      shipmentFields.forEach((field) => {
        row[field] = shipment[field] ?? "";
      });

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);

    const columnWidths = shipmentFields.map((field) => ({
      wch: Math.max(field.length + 2, 18),
    }));

    worksheet["!cols"] = columnWidths;

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "In Transit Shipments"
    );

    XLSX.writeFile(
      workbook,
      `in-transit-shipments-${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  const handlePdfDownload = () => {
    try {
      if (!shipments || shipments.length === 0) {
        alert("No shipment data available");
        return;
      }

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("In Transit Shipments", 10, 12);

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Generated: ${new Date().toLocaleString("en-IN")}`,
        10,
        18
      );

      const headers = shipmentFields;

      const dateOnlyFields = [
        "PO Date",
        "Invoice Date",
        "Dispatched Date",
        "Pickup Date",
      ];

      const dateTimeFields = [
        "Appointment Date",
        "Delivered Date",
      ];

      const formatPdfDate = (value) => {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
          return String(value);
        }

        return date.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      };

      const formatPdfDateTime = (value) => {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
          return String(value);
        }

        return date.toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
      };

      const rows = shipments.map((shipment) => {
        return shipmentFields.map((field) => {
          const value = shipment[field];

          if (
            value === null ||
            value === undefined ||
            value === ""
          ) {
            return "—";
          }

          if (dateOnlyFields.includes(field)) {
            return formatPdfDate(value);
          }

          if (dateTimeFields.includes(field)) {
            return formatPdfDateTime(value);
          }

          return String(value);
        });
      });

      autoTable(doc, {
        head: [headers],
        body: rows,

        startY: 24,

        theme: "grid",

        styles: {
          fontSize: 5,
          cellPadding: 1.5,
          overflow: "linebreak",
          valign: "middle",
        },

        headStyles: {
          fontSize: 5.5,
          fontStyle: "bold",
        },

        margin: {
          top: 24,
          left: 5,
          right: 5,
          bottom: 10,
        },

        tableWidth: "auto",

        didDrawPage: () => {
          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();

          doc.setFontSize(7);

          doc.text(
            `Page ${doc.getNumberOfPages()}`,
            pageWidth - 20,
            pageHeight - 5
          );
        },
      });

      const fileName = `in-transit-shipments-${new Date()
        .toISOString()
        .split("T")[0]}.pdf`;

      doc.save(fileName);

      console.log("PDF downloaded successfully:", fileName);
    } catch (error) {
      console.error("PDF download error:", error);
      alert(`PDF download failed: ${error.message}`);
    }
  };


  return (
    <div className="content">
      <section className="inventory-page-header">
        <div className="inventory-title">Inventory</div>

        {useApi && defaultTab === "inHouse" && companies.length > 0 && (
          <div className="inventory-company-selector">
            <label htmlFor="inventory-company">Company</label>
            <select
              id="inventory-company"
              value={selectedCompany}
              disabled={companyLoading}
              onChange={(e) => handleCompanyChange(e.target.value)}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* In-house inventory type tabs */}
        {defaultTab === "inHouse" && (
          <div className="inventory-type-tabs">
            {["Good", "Bad", "All"].map((tab) => (
              <button
                key={tab}
                className={type === tab ? "active" : ""}
                onClick={() => {
                  setType(tab);
                  setPage(1);
                }}
              >
                {tab === "All" ? "All" : `${tab} inventory`}
              </button>
            ))}
          </div>
        )}

        {companyError && (
          <div style={{ color: '#d94942', fontSize: '13px', marginLeft: '10px' }}>
            {companyError}
          </div>
        )}

        <div className="inventory-header-actions">

          {/* ================= IN-HOUSE ================= */}
          {defaultTab === "inHouse" ? (
            <>
              <button
                className="primary"
                onClick={() => setModal("addInventory")}
              >
                Add inventory
              </button>

              <button
                className="scan-button"
                onClick={() => setModal("scan")}
              >
                Scan inventory
              </button>

              <div className="inventory-export-dropdown">
                <button
                  type="button"
                  className="inventory-export-btn"
                  onClick={() => setExportOpen((prev) => !prev)}
                >
                  <FileDown size={18} />
                  <span>Export</span>
                  <span className="export-arrow">
                    {exportOpen ? "▴" : "▾"}
                  </span>
                </button>

                {exportOpen && (
                  <div className="inventory-export-menu">
                    <button
                      type="button"
                      onClick={() => handleInventoryExport("excel")}
                    >
                      <FileSpreadsheet size={17} />
                      <span>Export Excel</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleInventoryExport("pdf")}
                    >
                      <FileDown size={17} />
                      <span>Export PDF</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : inTransitTab === "b2bShipment" ? (

            null

          ) : (

            <button
              className="primary"
              onClick={() => onOpenShipment(null, null)}
            >
              Add shipment
            </button>
          )}


          {defaultTab === "inTransit" &&
            inTransitTab === "mergeInvoice" && (
              <div className="date-filter">
                <select
                  value={dateField}
                  onChange={(e) => {
                    setDateField(e.target.value);
                    setFromDate("");
                    setToDate("");
                  }}
                >
                  <option value="">Select Date</option>
                  <option value="poDate">PO Date</option>
                  <option value="invoiceDate">Invoice Date</option>
                  <option value="dispatchedDate">
                    Dispatched Date
                  </option>
                  <option value="pickupDate">Pickup Date</option>
                  <option value="appointmentDate">
                    Appointment Date
                  </option>
                  <option value="deliveredDate">
                    Delivered Date
                  </option>
                </select>

                <input
                  type="date"
                  value={fromDate}
                  disabled={!dateField}
                  onChange={(e) => setFromDate(e.target.value)}
                  title="From Date"
                />

                <span>to</span>

                <input
                  type="date"
                  value={toDate}
                  disabled={!dateField}
                  onChange={(e) => setToDate(e.target.value)}
                  title="To Date"
                />

                {(dateField || fromDate || toDate) && (
                  <button
                    type="button"
                    className="clear-date"
                    onClick={() => {
                      setDateField("");
                      setFromDate("");
                      setToDate("");
                    }}
                    title="Clear Date Filter"
                  >
                    ×
                  </button>
                )}
              </div>
            )}

          {defaultTab === "inTransit" &&
            inTransitTab === "mergeInvoice" && (
              <>
                {/* Print */}
                <button
                  type="button"
                  title="Print"
                  onClick={() => window.print()}
                >
                  ▣
                </button>

                {/* Refresh */}
                <button
                  type="button"
                  title="Refresh"
                  onClick={() => {
                    setType("All");
                    setPage(1);
                  }}
                >
                  ↻
                </button>

                {/* Excel / PDF Export */}
                <div className="export-actions">
                  <button
                    type="button"
                    className="export-btn excel-btn"
                    onClick={handleExcelDownload}
                    title="Export Excel"
                  >
                    <FileSpreadsheet size={20} />
                  </button>

                  <button
                    type="button"
                    className="export-btn pdf-btn"
                    onClick={handlePdfDownload}
                    title="Export PDF"
                  >
                    <FileDown size={20} />
                  </button>
                </div>
              </>
            )}
        </div>
      </section>

      <div className="page-actions">
        <div className="search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={defaultTab === 'inHouse' ? 'Search by EAN, SKU code, item, or shelf' : 'Search shipment details'}
          />
        </div>
      </div>

      <section className="panel table-panel">
        {defaultTab === 'inHouse' ? (
          useApi ? (
            <>
              <ApiInventoryTable data={apiData} columns={BASIC_COLUMNS} loading={loading} error={error} />
              {!loading && !error && apiData.length > 0 && (
                <div className="grid-pagination">
                  <span>
                    Displaying {totalCount ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, totalCount)} of {totalCount}
                  </span>
                  <div>
                    <button disabled={page === 1} onClick={() => setPage(1)}>«</button>
                    <button disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>
                    <b>{page} / {Math.max(1, Math.ceil(totalCount / pageSize))}</b>
                    <button disabled={page >= Math.ceil(totalCount / pageSize)} onClick={() => setPage(page + 1)}>›</button>
                    <button disabled={page >= Math.ceil(totalCount / pageSize)} onClick={() => setPage(Math.ceil(totalCount / pageSize))}>»</button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <InHouseTable products={paged} />
              <div className="grid-pagination">
                <span>
                  Displaying {visible.length ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, visible.length)} of {visible.length}
                </span>
                <div>
                  <button disabled={page === 1} onClick={() => setPage(1)}>«</button>
                  <button disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>
                  <b>{page} / {totalPages}</b>
                  <button disabled={page === totalPages} onClick={() => setPage(page + 1)}>›</button>
                  <button disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</button>
                </div>
              </div>
            </>
          )
        ) : inTransitTab === "b2bShipment" ? (
          <div className="table-scroll b2b-table-full">
            <B2BShipment
              shipments={b2bShipments}
              onDelete={onDeleteB2BShipment}
            />
          </div>
        ) : (
          <>
            <TransitTable
              shipments={shipments}
              onEdit={onOpenShipment}
              onDelete={onDeleteShipment}
            />

            <div className="pagination">
              <button
                disabled={!pagination?.hasPreviousPage}
                onClick={() => onPageChange(pagination.page - 1)}
              >
                Previous
              </button>

              <span>
                Page {pagination?.page || 1} of {pagination?.totalPages || 1}
              </span>

              <button
                disabled={!pagination?.hasNextPage}
                onClick={() => onPageChange(pagination.page + 1)}
              >
                Next
              </button>

              <div className="page-size">
                <span>Rows:</span>

                <select
                  className="page-limit-select"
                  value={limit}
                  onChange={(e) => {
                    const newLimit = Number(e.target.value);
                    onLimitChange(newLimit);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
