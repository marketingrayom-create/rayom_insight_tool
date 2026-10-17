import { matchesFulfillmentStatus } from './fulfillmentStatus';
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  PageHeading,
  EmptyState,
  Select,
  Search,
  Tabs,
  Toggle,
  Modal,
  DataTable,
  Icon,
  exportCsv,
} from "../components/UI";
import { creators, inventory } from "../data/mockData";
import { fetchAmazonFulfillmentOrders } from "../../apiFile/amazonApi";
import OrderDateFilter from "../components/OrderDateFilter";
export function Orders({ organization }) {
  const [type, setType] = useState(organization === 'linso' ? 'Self Ship Orders' : 'Marketplace Orders');
  const [days, setDays] = useState(organization === 'linso' ? 60 : 7);
  const [status, setStatus] = useState("All Orders");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({});
  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [itemsRefreshing, setItemsRefreshing] = useState(false);
  const [itemsError, setItemsError] = useState('');
  const [rateNotice, setRateNotice] = useState('');
  const [ordersRefreshing, setOrdersRefreshing] = useState(false);

  const loadOrders = async (signal, background = false) => {
  try {
    if (!background) setLoading(true);
    setError("");

const result = await fetchAmazonFulfillmentOrders({
  organization,
  days,
  max_orders: 500,
  include_items: true,
  fulfillment_channel:
    type === "Marketplace Orders"
      ? "AFN"
      : "MFN",
  order_status: [],
  easy_ship_status: [],
  date: filters.date || null,
  tab: type,
  signal,
});
    if (!signal?.aborted) {
      setOrders(result?.orders || []);
      setItemsRefreshing(Boolean(result?.itemsRefreshing));
      setOrdersRefreshing(Boolean(result?.ordersRefreshing));
      setItemsError(result?.ordersError || result?.itemsError || '');
      setRateNotice('');
    }
    return result?.ordersRefreshing || result?.itemsRefreshing ? Math.max(5, Number(result?.retryAfter) || 5) * 1000 : 0;
  } catch (err) {
    if (signal?.aborted || err?.name === "AbortError") {
      return;
    }
    if (err.status === 429 || err.code === 'QuotaExceeded') {
      const seconds = Math.max(60, Number(err.retryAfter) || 60);
      setRateNotice(`Amazon request limit reached. Retrying automatically in ${seconds} seconds. Loaded orders are still available.`);
      return seconds * 1000;
    }

    setError(
      err?.message || "Unable to load fulfillment orders."
    );

    setOrders([]);
  } finally {
    if (!signal?.aborted) {
      setLoading(false);
    }
  }
};


  useEffect(() => {
    const controller = new AbortController();
    let timer;
    const load = async (background = false) => {
      const retryDelay = await loadOrders(controller.signal, background);
      if (retryDelay && !controller.signal.aborted) timer = setTimeout(() => load(true), retryDelay);
    };
    timer = setTimeout(() => load(), 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [type, filters.date, days, organization]);

  const reset = () => {
    setFilters({});
    setQuery("");
    setStatus("All Orders");
    setPage(1);
  };

  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return orders
      .filter((order) => {
        const fulfillment = String(
          order.fulfillmentChannel || ""
        ).toUpperCase();
        const matchesType =
          type === "Marketplace Orders"
            ? fulfillment === "AFN"
            : fulfillment === "MFN";

        const matchesStatus =
          matchesFulfillmentStatus(order, status);

        const matchesSearch =
          !search ||
          [
            order.orderId,
            order.salesChannel,
            order.fulfillmentChannel,
            order.subtab,
            order.program,
            ...(order.items || []).flatMap(
              (item) => [
                item.sellerSku,
                item.asin,
                item.title,
              ]
            ),
          ]
            .join(" ")
            .toLowerCase()
            .includes(search);

        const matchesDate =
          !filters.date ||
          String(order.purchaseDate || "").slice(
            0,
            10
          ) === filters.date;

        const matchesChannel =
          !filters.Channel ||
          filters.Channel === "Amazon";

        const matchesFulfillment =
          !filters["Fulfilment Mode"] ||
          (filters["Fulfilment Mode"] ===
          "Marketplace"
            ? fulfillment === "AFN"
            : fulfillment === "MFN");

        return (
          matchesType &&
          matchesStatus &&
          matchesSearch &&
          matchesDate &&
          matchesChannel &&
          matchesFulfillment
        );
      })
      .flatMap((order) => {
        const items = order.items?.length
          ? order.items
          : [
              {
                asin: "",
                sellerSku: "",
                title: "",
                quantityOrdered:
                  order.totalUnits || (Number(order.numberOfItemsShipped || 0) + Number(order.numberOfItemsUnshipped || 0)),
                quantityShipped:
                  order.numberOfItemsShipped || 0,
                quantityUnshipped:
                  order.numberOfItemsUnshipped || 0,
              },
            ];

        return items.map((item, index) => ({
          id: `${order.orderId}-${
            item.orderItemId || index
          }`,

          orderId: order.orderId || "-",

          purchaseDate:
            order.purchaseDate || "-",

          /**
           * Display our application status instead
           * of raw Amazon status.
           */
          status:
            status === "Ready to Ship"
              ? "Ready to Ship"
              : status === "Shipped"
                ? "Shipped"
                : order.orderStatus || "-",

          fulfillmentChannel:
            order.fulfillmentChannel || "-",

          channel: "Amazon",

          asin: item.asin || "-",

          sku: item.sellerSku || "-",

          product: item.title || (itemsRefreshing ? 'Loading product details…' : '-'),

          quantity:
            item.quantityOrdered ?? 0,

          shipped:
            item.quantityShipped ?? 0,

          unshipped:
            item.quantityUnshipped ?? 0,

          amount:
            order.orderTotal?.Amount ?? "-",

          currency:
            order.orderTotal?.CurrencyCode ||
            "INR",

          shipDate:
            order.latestShipDate ||
            order.earliestShipDate ||
            "-",

          deliveryDate:
            order.latestDeliveryDate ||
            order.earliestDeliveryDate ||
            "-",

          isPrime: Boolean(order.isPrime),
          amazonSubtab:
            order.subtab ||
            order.subTab ||
            order.amazonSubtab ||
            "",

          program:
            order.program ||
            order.fulfillmentProgram ||
            "",
        }));
      });
  }, [
    orders,
    query,
    status,
    filters,
    type,
    itemsRefreshing,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(rows.length / pageSize)
  );

  const paginatedRows = useMemo(() => {
    const start =
      (page - 1) * pageSize;

    return rows.slice(
      start,
      start + pageSize
    );
  }, [rows, page]);

  useEffect(() => {
    setPage(1);
  }, [
    type,
    status,
    query,
    filters.date,
    filters.Channel,
    filters["Fulfilment Mode"],
  ]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const formatDate = (value) => {
    if (!value || value === "-") {
      return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  };

  const columns = [
    { key: "orderId", label: "ORDER ID" },
    { key: "purchaseDate", label: "DATE" },
    { key: "sku", label: "SELLER SKU" },
    { key: "asin", label: "ASIN" },
    { key: "product", label: "PRODUCT" },
    { key: "quantity", label: "QTY" },
    { key: "shipped", label: "SHIPPED" },
    { key: "unshipped", label: "UNSHIPPED" },
    {
      key: "fulfillmentChannel",
      label: "FULFILMENT",
    },
    { key: "status", label: "STATUS" },
    { key: "amount", label: "AMOUNT" },
    { key: "deliveryDate", label: "DELIVERY" },
  ];

  return (
    <>
      <PageHeading
        title="Fulfilment Orders"
        subtitle="Track and manage your self-ship and marketplace fulfilment shipments."
      />

      <section className="card">
        <Tabs
          items={[
            "Self Ship Orders",
            "Marketplace Orders",
          ]}
          value={type}
          onChange={setType}
        />

        <div className="toolbar">
          <Search
            placeholder="Order code, SKU or ASIN"
            value={query}
            onChange={(e) =>
              setQuery(e.target.value)
            }
          />

          <OrderDateFilter value={filters.date || ""}
            onApply={(date) => setFilters((current) => ({ ...current, date }))} />
          <label className="field">Order period<select aria-label="Order period" value={days} disabled={Boolean(filters.date)} onChange={e => { setDays(Number(e.target.value)); setPage(1); }}>{[7,30,60,90].map(value => <option key={value} value={value}>Last {value} days</option>)}</select></label>

          {[
            "Channel",
            "Fulfilment Mode",
          ].map((label) => (
            <Select
              key={label}
              label={label}
              options={
                label === "Channel"
                  ? ["Amazon"]
                  : [
                      "Marketplace",
                      "Self Ship",
                    ]
              }
              value={
                filters[label] || ""
              }
              onChange={(e) =>
                setFilters({
                  ...filters,
                  [label]:
                    e.target.value,
                })
              }
            />
          ))}

          <Button onClick={reset}>
            Clear Filters
          </Button>
        </div>
      </section>

      <section className="card">
        <Tabs
          items={[
            "All Orders",
            "Ready to Ship",
            "Shipped",
            "Cancelled",
          ]}
          value={status}
          onChange={setStatus}
        />
        {!loading && itemsRefreshing && <p role="status">Orders are ready. Product details are loading in the background.</p>}
        {!loading && ordersRefreshing && <p role="status">Loading Amazon orders page by page. Available orders are shown below; remaining pages will appear automatically.</p>}
        {!loading && itemsError && <p role="alert">{itemsError}</p>}
        {!loading && rateNotice && <p role="status">{rateNotice}</p>}

        {loading ? (
          <div
            style={{
              minHeight: 260,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            role="status"
          >
            Loading Amazon fulfillment orders...
          </div>
        ) : error ? (
          <EmptyState
            title="Unable to load orders"
            description={error}
            action={
              <Button
                primary
                onClick={() =>
                  loadOrders()
                }
              >
                Retry
              </Button>
            }
          />
        ) : rows.length > 0 ? (
          <>
            <DataTable
              columns={columns}
              rows={paginatedRows}
              renderCell={(row, key) => {
                if (
                  key === "purchaseDate"
                ) {
                  return formatDate(
                    row.purchaseDate
                  );
                }

                if (
                  key === "deliveryDate"
                ) {
                  return formatDate(
                    row.deliveryDate
                  );
                }

                if (key === "amount") {
                  return row.amount === "-"
                    ? "-"
                    : `${row.currency} ${row.amount}`;
                }

                if (
                  key ===
                  "fulfillmentChannel"
                ) {
                  return row.fulfillmentChannel ===
                    "AFN"
                    ? "FBA"
                    : row.fulfillmentChannel ===
                        "MFN"
                      ? "Self Ship"
                      : row.fulfillmentChannel;
                }

                return row[key];
              }}
            />

            <div className="pagination">
              <span>
                {rows.length
                  ? `${
                      (page - 1) *
                        pageSize +
                      1
                    }–${Math.min(
                      page * pageSize,
                      rows.length
                    )}`
                  : "0"}{" "}
                of {rows.length}
              </span>

              <button
                type="button"
                aria-label="Previous page"
                disabled={page === 1}
                onClick={() =>
                  setPage(
                    (current) =>
                      Math.max(
                        1,
                        current - 1
                      )
                  )
                }
              >
                <Icon name="ChevronLeft" />
              </button>

              <span className="muted">
                Page {page} of{" "}
                {totalPages}
              </span>

              <button
                type="button"
                aria-label="Next page"
                disabled={
                  page >= totalPages
                }
                onClick={() =>
                  setPage(
                    (current) =>
                      Math.min(
                        totalPages,
                        current + 1
                      )
                  )
                }
              >
                <Icon name="ChevronRight" />
              </button>
            </div>
          </>
        ) : rateNotice || ordersRefreshing ? (
          <EmptyState title="Waiting for Amazon" description="Order data is temporarily rate limited. This page will retry automatically after the cooldown." />
        ) : (
          <EmptyState
            title="No orders found"
            description={`We couldn't find any ${
              status === "All Orders"
                ? ""
                : status.toLowerCase() +
                  " "
            }orders matching the selected filters. Try adjusting your filters.`}
            action={
              <Button
                primary
                onClick={reset}
              >
                Clear Filters
              </Button>
            }
          />
        )}
      </section>
    </>
  );
}

export { default as Campaigns } from './MetaCampaigns';
const creatorColumns = [
  { key: "select", label: "" },
  { key: "name", label: "Instagram Profiles" },
  { key: "followers", label: "Followers" },
  { key: "engagement", label: "Engagement" },
  { key: "category", label: "Category" },
  { key: "action", label: "Actions" },
];
export function Creators({ groups = false, notify }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState([]);
  const [group, setGroup] = useState("nano unfolded beauty");
  const [modal, setModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [median, setMedian] = useState("Median");
  const [platform, setPlatform] = useState("Instagram");
  const filtered = creators.filter(
    (c) =>
      (c.name + " " + c.handle).toLowerCase().includes(query.toLowerCase()) &&
      (!category || c.category === category),
  );
  const toggle = (id) =>
    setSelected(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  return (
    <>
      <PageHeading
        title={groups ? "Creator Groups" : "Search creators"}
        subtitle={
          groups
            ? "Organize and manage your creator groups"
            : "Search and discover creators who truly resonate with your brand"
        }
      />
      {groups ? (
        <>
          <div className="card toolbar">
            <select
              aria-label="Select creator group"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option>nano unfolded beauty</option>
              {group !== "nano unfolded beauty" && <option>{group}</option>}
            </select>
            <Button
              icon="FileSpreadsheet"
              onClick={() =>
                exportCsv(
                  "creator-group.csv",
                  filtered.filter(
                    (c) => !selected.length || selected.includes(c.id),
                  ),
                )
              }
            >
              Export
            </Button>
            <Button
              icon="Filter"
              onClick={() => setCategory(category ? "" : "Beauty")}
            >
              Filter {category && "· Beauty"}
            </Button>
            <span className="spacer" />
            <Button
              icon="UserPlus"
              onClick={() => {
                setSelected(creators.map((c) => c.id));
                notify("All sample creators selected.");
              }}
            >
              Bulk add
            </Button>
            <Button primary icon="UserPlus" onClick={() => setModal(true)}>
              Add Creators
            </Button>
          </div>
          <section className="card group-summary">
            <div className="summary-heading">
              <div>
                <h2>Expected Metrics Summary</h2>
                <p>
                  Aggregated metrics calculated across matching creators in list
                </p>
              </div>
              <Tabs
                items={["Median", "Average"]}
                value={median}
                onChange={setMedian}
              />
            </div>
            <div className="summary-grid">
              {[
                [
                  "Total Reach",
                  [
                    ["Total Followers", "367K"],
                    [
                      "Avg Followers/Creator",
                      median === "Median" ? "7.34K" : "8.92K",
                    ],
                    ["Posts Evaluated", "177"],
                    ["Posts/Day", "12"],
                  ],
                ],
                [
                  "Engagement",
                  [
                    ["Likes", "22.28K"],
                    ["Shares", "2.35K"],
                    ["Comments", "1.25K"],
                    ["Views", "1.05M"],
                  ],
                ],
                [
                  "Ratios",
                  [
                    ["VTF Ratio", "2.85%"],
                    ["ERF Ratio", "7.05%"],
                    ["ERV Ratio", "2.48%"],
                  ],
                ],
              ].map(([title, items], i) => (
                <div className="summary-box" key={title}>
                  <h3>{title}</h3>
                  <div>
                    {items.map(([label, value]) => (
                      <div className="summary-metric" key={label}>
                        <span
                          className={`metric-icon ${["orange", "green", "amber"][i]}`}
                        >
                          <Icon
                            name={
                              i === 0 ? "Users" : i === 1 ? "Heart" : "Percent"
                            }
                          />
                        </span>
                        <span>
                          {label}
                          <strong>{value}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <Tabs
          items={["Instagram", "YouTube"]}
          value={platform}
          onChange={setPlatform}
        />
      )}
      <div className={groups ? "" : "creator-layout"}>
        {!groups && (
          <aside className="card creator-filters">
            <h3>Creator Preferences</h3>
            <p>Followers</p>
            <div className="filter-chips">
              {["Nano", "Micro", "Macro", "Mega"].map((n) => (
                <button
                  key={n}
                  onClick={() => notify(`${n} segment selected for preview.`)}
                >
                  {n}
                </button>
              ))}
            </div>
            <p>Engagement rate</p>
            <input
              type="range"
              aria-label="Minimum engagement rate"
              min="0"
              max="10"
              defaultValue="0"
              onChange={(e) =>
                notify(`Minimum engagement: ${e.target.value}% (preview)`)
              }
            />
            <p>Basic Filters</p>
            <Select
              label="Category"
              options={["Beauty", "Fashion", "Lifestyle", "Fitness"]}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <Select label="Location" options={["India", "Mumbai", "Delhi"]} />
            <h3>Creator Persona</h3>
            <Select label="Creator language" options={["Hindi", "English"]} />
            <Select label="Gender" options={["Women", "Men"]} />
            <p>Creator age brackets</p>
            <div className="filter-chips">
              {["18–24", "25–34", "35–44", "45+"].map((x) => (
                <button
                  key={x}
                  onClick={() => notify(`Age ${x} selected for preview.`)}
                >
                  {x}
                </button>
              ))}
            </div>
            <Button
              onClick={() => {
                setCategory("");
                setQuery("");
              }}
            >
              Clear all
            </Button>
          </aside>
        )}
        <section className="card creator-results">
          <div className="toolbar">
            <Search
              placeholder="Search creators..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="muted">
              {filtered.length} creators{" "}
              {selected.length > 0 && `· ${selected.length} selected`}
            </span>
          </div>
          <DataTable
            columns={creatorColumns.map((c) =>
              c.key === "name" ? { ...c, label: `${platform} Profiles` } : c,
            )}
            rows={filtered}
            renderCell={(r, key) =>
              key === "select" ? (
                <input
                  type="checkbox"
                  aria-label={`Select ${r.name}`}
                  checked={selected.includes(r.id)}
                  onChange={() => toggle(r.id)}
                />
              ) : key === "name" ? (
                <div className="profile">
                  <span className={`profile-avatar avatar-${r.id % 4}`}>
                    {r.initials}
                  </span>
                  <div>
                    <strong>
                      {r.name}
                      <Icon name="BadgeCheck" size={12} />
                    </strong>
                    <small>@{r.handle}</small>
                  </div>
                </div>
              ) : key === "action" ? (
                <button
                  className="icon-button"
                  aria-label={`Add ${r.name} to group`}
                  onClick={() => {
                    toggle(r.id);
                    notify(
                      `${r.name} ${selected.includes(r.id) ? "removed from" : "added to"} selection.`,
                    );
                  }}
                >
                  <Icon name="UserPlus" size={16} />
                </button>
              ) : undefined
            }
          />
        </section>
      </div>
      {modal && (
        <Modal title="Create a creator group" onClose={() => setModal(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setGroup(groupName);
              setModal(false);
              notify("Creator group created for this preview session.");
            }}
          >
            <label className="field">
              Group name
              <input
                required
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </label>
            <p>
              {selected.length || creators.length} sample creators will be
              included.
            </p>
            <Button primary type="submit">
              Create group
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Inventory() {
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState("");
  const [page, setPage] = useState(1);
  const rows = inventory.filter(
    (r) =>
      (!market || r.marketplace === market) &&
      Object.values(r).join(" ").toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        title="Inventory Master"
        subtitle="Comprehensive inventory management across marketplaces"
      />
      <section className="card">
        <div className="toolbar">
          <Search
            value={query}
            placeholder="Search inventory..."
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          <Select
            label="All Marketplaces"
            options={["Amazon", "Flipkart", "D2C"]}
            value={market}
            onChange={(e) => {
              setMarket(e.target.value);
              setPage(1);
            }}
          />
          <Button
            onClick={() => {
              setQuery("");
              setMarket("");
              setPage(1);
            }}
          >
            Clear filters
          </Button>
          <span className="spacer" />
          <Button
            icon="Download"
            onClick={() => exportCsv("inventory.csv", rows)}
          >
            Export
          </Button>
        </div>
        <DataTable
          columns={[
            "marketplace",
            "product",
            "listing",
            "sku",
            "ean",
            "warehouse",
            "transit",
            "po",
            "drr",
            "doc",
          ].map((key, i) => ({
            key,
            label: [
              "MARKETPLACE",
              "PRODUCT ID",
              "LISTING ID",
              "SELLER SKU",
              "EAN",
              "WAREHOUSE",
              "IN-TRANSIT",
              "PO QTY",
              "DRR (7D)",
              "DOC (7D)",
            ][i],
          }))}
          rows={rows.slice((page - 1) * 12, page * 12)}
        />
        <div className="pagination">
          <span>
            {rows.length
              ? `${(page - 1) * 12 + 1}–${Math.min(page * 12, rows.length)}`
              : "0"}{" "}
            of {rows.length}
          </span>
          <button
            aria-label="Previous page"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            <Icon name="ChevronLeft" />
          </button>
          <button
            aria-label="Next page"
            disabled={page * 12 >= rows.length}
            onClick={() => setPage(page + 1)}
          >
            <Icon name="ChevronRight" />
          </button>
        </div>
      </section>
    </>
  );
}
export function SearchTrends() {
  const [tab, setTab] = useState("Amazon");
  const [keywords, setKeywords] = useState("");
  const [ran, setRan] = useState(false);
  return (
    <>
      <PageHeading
        title="Search Trend Research"
        subtitle="Analyze weekly search volume trends for keywords and brands"
      />
      <form
        className="card trends-form"
        onSubmit={(e) => {
          e.preventDefault();
          setRan(true);
        }}
      >
        <div className="form-grid">
          <label className="field">
            Search Keywords
            <input
              placeholder="Eg. sunscreen"
              required
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </label>
          <label className="field">
            Exclude Keywords
            <input placeholder="Eg. kids sunscreen" />
          </label>
          <label className="field">
            Search Brand (Optional)
            <input placeholder="Enter brand" />
          </label>
          <label className="field">
            Comparison Keywords
            <input placeholder="Separate keywords with commas" />
          </label>
          <label className="field">
            Date Range
            <input type="date" defaultValue="2026-09-16" />
          </label>
          <Toggle label="Branded Only" />
        </div>
        <div className="form-actions">
          <Button
            type="reset"
            onClick={() => {
              setKeywords("");
              setRan(false);
            }}
          >
            Reset
          </Button>
          <Button primary type="submit">
            Analyze
          </Button>
        </div>
      </form>
      <Tabs
        items={["Amazon", "Myntra", "Flipkart", "Blinkit"]}
        value={tab}
        onChange={setTab}
      />
      <section className="card">
        <EmptyState
          icon="TrendingUp"
          title={
            ran
              ? `No sample results for “${keywords}”`
              : "No results for this marketplace"
          }
          description="Select a marketplace and enter keywords to explore search trends. Live research will be available when a data source is connected."
        />
      </section>
    </>
  );
}
export function Reports({ mindshare = false }) {
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [rows, setRows] = useState([]);
  return (
    <>
      <PageHeading
        title={
          mindshare ? "Social Efficacy Mindshare" : "Social Efficacy Report"
        }
        subtitle="Track social performance for a single brand or entity"
        action={
          <Button primary icon="Plus" onClick={() => setModal(true)}>
            Create Report
          </Button>
        }
      />
      <div className="card toolbar">
        <Search
          placeholder="Search reports..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select label="Status" options={["Draft", "Completed"]} />
        <Select label="Brand" options={["MARS", "UNFOLDED"]} />
        <Toggle label="Show Drafts" />
        <Toggle label="Show Archived" />
      </div>
      <section className="card">
        <DataTable
          columns={[
            "Campaign",
            "Influencers",
            "Posts",
            "Views",
            "Likes",
            "Comments",
            "Shares",
            "VTF Ratio",
            "Creation Date",
          ].map((key) => ({ key, label: key }))}
          rows={rows.filter((r) =>
            r.Campaign.toLowerCase().includes(query.toLowerCase()),
          )}
        />
      </section>
      {modal && (
        <Modal title="Create Report" onClose={() => setModal(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setRows([
                ...rows,
                {
                  Campaign: e.target.title.value,
                  Influencers: 0,
                  Posts: 0,
                  Views: 0,
                  Likes: 0,
                  Comments: 0,
                  Shares: 0,
                  "VTF Ratio": "0%",
                  "Creation Date": "16 Sep 2026",
                },
              ]);
              setModal(false);
            }}
          >
            <label className="field">
              Report name
              <input name="title" required />
            </label>
            <p className="muted">Creates a local sample report.</p>
            <Button primary>Create Report</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function ComingSoon({ title }) {
  return (
    <>
      <PageHeading title={title} />
      <section className="card coming-soon">
        <div className="coming-art">
          <Icon name="ChartNoAxesCombined" size={100} />
          <span>LINSO</span>
        </div>
        <span className="soon">Coming soon</span>
        <h2>Coming soon</h2>
        <p>
          We are building this experience. Check back soon to unlock new
          insights.
        </p>
      </section>
    </>
  );
}
