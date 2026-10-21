import React, { useEffect, useState } from 'react';
import './ProductPerformancePage.css';
import { useReorderTable, ReorderHeaders, ReorderCells, ReorderSaveButton } from './ReorderTable';
import { refreshedInventoryRows, applyUniwareStock } from '../utils/productInventory';
import { fetchAmazonProducts, fetchUniwareInventory } from '../apiFile/amazonApi';


const getField = (row, ...keys) => {
  if (!row) return null;

  for (const key of keys) {
    if (
      row[key] !== undefined &&
      row[key] !== null &&
      row[key] !== ''
    ) {
      return row[key];
    }
  }

  return null;
};

const getProductIdFromUrl = (productUrl) => {
  if (!productUrl) {
    return null;
  }

  try {
    const url = new URL(productUrl);
    const pid = url.searchParams.get('pid');

    if (pid) {
      return pid;
    }

    return null;
  } catch {
    return null;
  }
};

const numberValue = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
};

const formatNumber = (value, decimals = 0) => {
  const number = numberValue(value);

  if (number === null) {
    return '—';
  }

  return number.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const formatPrice = (value) => {
  const number = numberValue(value);

  if (number === null) {
    return '—';
  }

  return `₹${number.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

const formatPercent = (value) => {
  const number = numberValue(value);

  if (number === null) {
    return 'N/A';
  }

  return `${number.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
};



const COLUMNS = [
  {
    key: 'list_price',
    label: 'LIST PRICE',
    aliases: [
      'finalPrice',
      'listPrice',
      'price',
      'selling_price',
      'sellingPrice',
    ],
    type: 'price',
  },

  {
    key: 'inventory',
    label: 'INV (FBM)',
    aliases: [
      'fbmAvailable',
      'inv',
      'stock',
      'available_inventory',
      'availableInventory',
    ],
    type: 'number',
  },

  {
    key: 'fba inventory',
    label: 'INV (FBA)',
    aliases: [
      'fbaAvailable',
      'inv',
      'stock',
      'fba_available_inventory',
      'fbaavailableInventory',
    ],
    type: 'number',
  },

  {
    key: 'fba reserve inventory',
    label: 'Reserve INV (FBA)',
    aliases: [
      'fbaReserved',
      'inv',
      'stock',
      'fba_reserve_inventory',
      'fbareserveInventory',
    ],
    type: 'number',
  },

  {
    key: 'vendorInventory',
    label: 'Vc Inventory',
    aliases: ['vendorInventory'],
    type: 'number',
  },

  {
    key: 'combinedInventory',
    label: 'Total Inventory',
    aliases: ['combinedInventory'],
    type: 'number',
  },

  {
    key: 'conversion',
    label: 'CONV %',
    aliases: [
      'conversion',
      'conversion_pct',
      'conversionPct',
      'conversion_percent',
      'conversionPercentage',
      'conversion_percentage',
      'conv_pct',
      'conv',
    ],
    type: 'percent',
  },
];



const PERFORMANCE_METRICS = {
  drr: {
    label: 'DRR',
    fields: {
      1: {
        key: 'drr_1d',
        label: 'DRR 1D',
        aliases: ['drr_1d', 'drr1d'],
      },
      7: {
        key: 'drr_7d',
        label: 'DRR 7D',
        aliases: ['drr_7d', 'drr7d'],
      },
      15: {
        key: 'drr_15d',
        label: 'DRR 15D',
        aliases: ['drr_15d', 'drr15d'],
      },
      45: { key: 'drr_45d', label: 'DRR 45D', aliases: ['drr_45d', 'drr45d'] },
      30: {
        key: 'drr_30d',
        label: 'DRR 30D',
        aliases: ['drr_30d', 'drr30d'],
      },
    },
  },

  revenue: {
    label: 'Revenue',
    fields: {
      1: {
        key: 'revenue_1d',
        label: 'Revenue 1D',
        aliases: ['revenue_1d', 'revenue1d', 'ordersRevenue1d'],
      },
      7: {
        key: 'revenue_7d',
        label: 'Revenue 7D',
        aliases: ['revenue_7d', 'revenue7d', 'ordersRevenue7d'],
      },
      15: {
        key: 'revenue_15d',
        label: 'Revenue 15D',
        aliases: ['revenue_15d', 'revenue15d', 'ordersRevenue15d'],
      },
      45: { key: 'revenue_45d', label: 'Revenue 45D', aliases: ['revenue_45d', 'revenue45d', 'ordersRevenue45d'] },
      30: {
        key: 'revenue_30d',
        label: 'Revenue 30D',
        aliases: ['revenue_30d', 'revenue30d', 'ordersRevenue30d'],
      },
    },
  },
};



const formatCell = (row, column) => {
  const rawValue = getField(
    row,
    ...column.aliases
  );

  switch (column.type) {
    case 'price':
      return formatPrice(rawValue);

    case 'percent':
      return formatPercent(rawValue);

    case 'number':
    default:
      return formatNumber(rawValue, column.decimals ?? 0);
  }
};

/* =======================================================
   PRODUCT IDENTITY
======================================================= */

const ProductIdentity = ({ row }) => {
  const image = getField(
    row,
    'image',
    'image_url',
    'imageUrl',
    'product_image',
    'productImage',
    'thumbnail',
    'thumbnail_url',
    'thumbnailUrl'
  );

  const asin = getField(
    row,
    'asin',
    'ASIN',
    'sku',

  );

  const title = getField(
    row,
    'itemTitle',
    'item_title',
    'product_title',
    'productTitle',
    'product_name',
    'productName',
    'title',
    'name'
  );


  const fulfillment = getField(
    row,
    'fulfillment',
    'fulfillment_channel',
    'fulfillmentChannel',
    'channel',
    'marketplace'
  );

  /*
    Product URL
  */

  const productUrl = getField(
    row,
    'productUrl',
    'product_url',
    'productURL',
    'product_url'
  );

  /*
    Extract PID from URL
  */

  const productId = getProductIdFromUrl(
    productUrl
  );

  return (
    <div className="product-identity">

      {/* =============================================
          PRODUCT IMAGE
      ============================================= */}

      <div className="product-image-wrapper">

        {image ? (
          <img
            src={image}
            alt=""
            className="product-image"
            onError={(event) => {
              event.currentTarget.style.display =
                'none';
            }}
          />
        ) : (
          <div className="product-image-placeholder">
            P
          </div>
        )}

      </div>

      {/* =============================================
          PRODUCT INFORMATION
      ============================================= */}

      <div className="product-info">

        {/* Brand */}

        {/* {brand && (
          <div className="product-brand">
            {brand}
          </div>
        )} */}

        {/* ASIN / SKU */}

        {asin && (
          productUrl ? (
            <a
              href={productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="product-asin product-asin-link"
              title={`Open ${asin}`}
              onClick={(event) => event.stopPropagation()}
            >
              {asin}
              <span className="product-asin-link-icon">↗</span>
            </a>
          ) : (
            <div className="product-asin">
              {asin}
            </div>
          )
        )}

        {/* =========================================
            PRODUCT TITLE
        ========================================= */}

        {title && (
          <div className="product-title-hover">

            <div className="product-title">
              {title}
            </div>

            {/* =====================================
                HOVER DETAILS
            ===================================== */}

            <div className="product-title-details">

              {/* <div className="product-title-details-title">
                {title}
              </div> */}
              {/* 
              {brand && (
                <div className="product-detail-row">
                  <span>Brand</span>
                  <strong>{brand}</strong>
                </div>
              )} */}

              {/* {asin && (
                <div className="product-detail-row">
                  <span>ASIN / SKU</span>
                  <strong>{asin}</strong>
                </div>
              )} */}

              {/* {productId && (
                <div className="product-detail-row">
                  <span>Product ID</span>
                  <strong>{productId}</strong>
                </div>
              )} */}
              {/* 
              {fulfillment && (
                <div className="product-detail-row">
                  <span>Channel</span>
                  <strong>{fulfillment}</strong>
                </div>
              )} */}

              {/* {productUrl && (
                <a
                  href={productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="product-open-link"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  Open Product ↗
                </a>
              )} */}

            </div>

          </div>
        )}

        {/* =========================================
            PRODUCT URL PID
        ========================================= */}

        {productUrl && productId && (
          <a
            href={productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="product-url-id"
            title={`Open product ${productId}`}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {productId}

            <span className="external-link-icon">
              ↗
            </span>
          </a>
        )}

        {/* Fulfillment */}

        {fulfillment && (
          <div className="product-fulfillment">
            {fulfillment}
          </div>
        )}

      </div>
    </div>
  );
};

/* =======================================================
   MAIN PAGE
======================================================= */

export default function ProductPerformancePage({ organization }) {
  const [query, setQuery] = useState({
    page: 1,
    limit: 10,
    sortBy: 'drr_1d',
    sortOrder: 'desc',
    search: '',
  });

  const [searchInput, setSearchInput] =
    useState('');

  // The first dropdown chooses the sort metric; both share the period.
  const [metricType, setMetricType] =
    useState('drr');

  const [selectedPeriod, setSelectedPeriod] = useState('1');
  const drrPeriod = selectedPeriod;
  const revenuePeriod = selectedPeriod;
  const activeMetricPeriod = selectedPeriod;

  const vendorMetrics = ['rayom', 'linso'].includes(organization);
  const selectedDrrColumn = { ...PERFORMANCE_METRICS.drr.fields[drrPeriod], type: 'number', decimals: 2 };

  const selectedRevenueColumn = { ...PERFORMANCE_METRICS.revenue.fields[revenuePeriod], type: 'price' };

  // These are the only metric columns rendered in the table.
  // Default = DRR 1D + Revenue 1D.
  const visibleColumns = [
    COLUMNS[0],
    { key: 'uniwareInventory', label: 'Uniware Inventory', aliases: ['uniwareInventory'], type: 'number' },
    COLUMNS[2],
    COLUMNS[4],
    COLUMNS[5],
    ...(vendorMetrics ? [{ key: `vendorOrderedUnits${selectedPeriod}d`, label: `Sales ${selectedPeriod}D`, aliases: [`vendorOrderedUnits${selectedPeriod}d`], type: 'number' }] : []),
    selectedDrrColumn,
    selectedRevenueColumn,
    COLUMNS[6],
  ];

  const [data, setData] = useState({
    rows: [],
    total: null,
    hasNext: false,
  });

  const planning = useReorderTable(organization, data.rows);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');
  const [salesRefreshing, setSalesRefreshing] = useState(false);

  const [refresh, setRefresh] =
    useState(0);



  useEffect(() => {
    const timer = setTimeout(() => {

      setQuery((current) => ({
        ...current,
        page: 1,
        search: searchInput.trim(),
      }));

    }, 350);

    return () => {
      clearTimeout(timer);
    };
  }, [searchInput]);


  const loadAmazonProducts = async (signal, background = false) => {
    try {

      if (!background) setLoading(true);
      setError('');

      const result =
        await fetchAmazonProducts({
          organization,
          page: query.page,
          limit: query.limit,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
          search: query.search,
          signal,
        });

      if (signal?.aborted) {
        return;
      }

      const products =
        Array.isArray(result?.products)
          ? result.products
          : [];

      setData(current => ({
        organization,
        rows: refreshedInventoryRows(products, current, organization),
        uniwareScope: current.organization === organization ? current.uniwareScope : '',
        uniwareMessage: '',
        vendorSalesPeriods: result?.vendorSalesPeriods,
        total: result?.total ?? products.length,
        hasNext: Boolean(result?.hasNext),
      }));
      setSalesRefreshing(Boolean(result?.salesRefreshing || result?.inventoryRefreshing));
      fetchUniwareInventory({ products, organization, signal }).then((stock) => {
        if (signal?.aborted) return;
        setData(current => applyUniwareStock(current, stock, organization));
      }).catch(error => {
        if (signal?.aborted) return;
        setData(current => current.organization === organization ? { ...current, uniwareMessage: error.message } : current);
      });
      return Boolean(result?.salesRefreshing || result?.inventoryRefreshing);

    }
    catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }

      if (signal?.aborted) {
        return;
      }

      setError(
        error?.message ||
        'Unable to load Amazon products.'
      );
    }
    finally {

      if (!signal?.aborted) {
        setLoading(false);
      }

    }
  };

  useEffect(() => {
    const controller =
      new AbortController();

    let timer; let attempts = 0;
    setSalesRefreshing(false);
    const load = async (background = false) => {
      const pending = await loadAmazonProducts(controller.signal, background);
      if (pending && (['rayom', 'linso'].includes(organization) || ++attempts < 2) && !controller.signal.aborted) {
        timer = setTimeout(() => load(true), ['rayom', 'linso'].includes(organization) ? 10000 : 75000);
      }
    };
    load();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };

  }, [refresh, query.page, query.limit, query.sortBy, query.sortOrder, query.search, organization]);


  const changeSort = (column) => {

    setQuery((current) => {

      const sameColumn =
        current.sortBy === column;

      return {
        ...current,

        page: 1,

        sortBy: column,

        sortOrder:
          sameColumn &&
            current.sortOrder === 'desc'
            ? 'asc'
            : 'desc',
      };

    });
  };

  const clearFilters = () => {

    setSearchInput('');
    setMetricType('drr');
    setSelectedPeriod('1');

    setQuery({
      page: 1,
      limit: 10,
      sortBy: 'drr_1d',
      sortOrder: 'desc',
      search: '',
    });

  };
  const startItem =
    data.rows.length === 0
      ? 0
      : (query.page - 1) *
      query.limit +
      1;

  const endItem =
    data.rows.length === 0
      ? 0
      : startItem +
      data.rows.length -
      1;

  const totalPages =
    data.total !== null &&
      data.total !== undefined
      ? Math.ceil(
        data.total / query.limit
      )
      : null;

  const canGoNext =
    data.hasNext ||
    (
      totalPages !== null &&
      query.page < totalPages
    );


  return (
    <div className="content product-performance-page">

      <section className="product-performance-card">
        <div className="product-performance-header">

          <h1>
            Product Performance
          </h1>

          <button
            type="button"
            className="icon-refresh-button"
            onClick={() =>
              setRefresh((n) => n + 1)
            }
            disabled={loading}
            title="Refresh"
            aria-label="Refresh"
          >
            ↻
          </button>

        </div>

        {/* <ReorderSaveButton planning={planning} /> */}

        {salesRefreshing && <p role="status">Vendor sales or inventory reports are updating in the background. {vendorMetrics ? 'Checking every 10 seconds until the selected sales periods are complete.' : 'One automatic refresh runs after 75 seconds; use Refresh if sales are still incomplete.'}</p>}

        {planning.live.message && <p role="status" style={{ padding: '0 20px' }}>{planning.live.message}</p>}

        {/* SEARCH / FILTER TOOLBAR */}

        {vendorMetrics && data.vendorSalesPeriods && <p className="vendor-account-scope" style={{ padding: '0 20px' }}>
          Revenue = Amazon Vendor Ordered Revenue. DRR = Ordered Units ÷ selected days. {data.vendorSalesPeriods[drrPeriod] && <>DRR units/day {drrPeriod}D: {data.vendorSalesPeriods[drrPeriod].start} to {data.vendorSalesPeriods[drrPeriod].end}. </>}{data.vendorSalesPeriods[revenuePeriod] && <>Revenue {revenuePeriod}D: {data.vendorSalesPeriods[revenuePeriod].start} to {data.vendorSalesPeriods[revenuePeriod].end}. </>}{(!data.vendorSalesPeriods[drrPeriod]?.complete || !data.vendorSalesPeriods[revenuePeriod]?.complete) && 'Missing dates are loading; incomplete totals show —.'}</p>}
        {data.uniwareMessage && <p role="status" style={{ padding: '0 20px' }}>{data.uniwareMessage}</p>}
        {/* {data.uniwareScope && <p className="vendor-account-scope" style={{ padding: '0 20px' }}>Uniware Inventory: {data.uniwareScope}</p>} */}
        <div className="product-performance-toolbar">

          <div className="product-search">

            <input
              type="text"
              placeholder="Search products..."
              value={searchInput}
              onChange={(event) =>
                setSearchInput(
                  event.target.value
                )
              }
            />

            <span className="search-icon">
              ⌕
            </span>

          </div>

          <div
            className="product-metric-selectors"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <select
              value={metricType}
              disabled={loading}
              onChange={(event) => {
                const nextType = event.target.value;

                setMetricType(nextType);
                setQuery((current) => ({
                  ...current,
                  page: 1,
                  sortBy:
                    nextType === 'drr'
                      ? selectedDrrColumn.key
                      : selectedRevenueColumn.key,
                }));
              }}
              aria-label="Performance metric"
              title="Select performance metric"
              style={{
                height: '38px',
                padding: '0 32px 0 12px',
                border: '1px solid #d9dee7',
                borderRadius: '6px',
                background: '#fff',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              <option value="drr">DRR</option>
              <option value="revenue">Revenue</option>
            </select>

            <select
              value={activeMetricPeriod}
              disabled={loading}
              onChange={(event) => {
                const nextPeriod = event.target.value;

                setSelectedPeriod(nextPeriod);
                setQuery((current) => ({
                  ...current,
                  page: 1,
                  sortBy: `${metricType}_${nextPeriod}d`,
                }));
              }}
              aria-label={`${PERFORMANCE_METRICS[metricType].label} period`}
              title="Select performance period"
              style={{
                height: '38px',
                padding: '0 32px 0 12px',
                border: '1px solid #d9dee7',
                borderRadius: '6px',
                background: '#fff',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              <option value="1">1 Day</option>
              <option value="7">7 Days</option>
              <option value="15">15 Days</option>
              <option value="30">30 Days</option>
              {vendorMetrics && <option value="45">45 Days</option>}
            </select>
          </div>

          <button
            type="button"
            className="clear-filter-button"
            onClick={clearFilters}
          >
            <span>⟳</span>
            Clear Filters
          </button>

        </div>

        {/* =============================================
            TABLE
        ============================================= */}

        <div
          className="product-table-wrapper"
          aria-busy={loading}
        >

          {loading ? (

            <div
              className="product-loading"
              role="status"
            >
              Loading product performance...
            </div>

          ) : error ? (

            <div
              className="product-error"
              role="alert"
            >

              <p>{error}</p>

              <button
                type="button"
                onClick={() =>
                  setRefresh(
                    (n) => n + 1
                  )
                }
              >
                Retry
              </button>

            </div>

          ) : data.rows.length === 0 ? (

            <div className="product-empty">
              No product performance found.
            </div>

          ) : (

            <div className="product-table-scroll">

              <table className="product-performance-table">
                <thead>
                  <tr>
                    <th className="product-column">
                      PRODUCT
                    </th>
                    {visibleColumns.map(
                      (column) => {

                        const active =
                          query.sortBy ===
                          column.key;

                        return (
                          <th
                            key={column.key}
                            aria-sort={
                              active
                                ? query.sortOrder ===
                                  'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >

                            <button
                              type="button"
                              className="table-sort-button"
                              onClick={() =>
                                changeSort(
                                  column.key
                                )
                              }
                            >

                              <span>
                                {column.label}
                              </span>

                              {active && (
                                <span className="sort-arrow">
                                  {query.sortOrder ===
                                    'asc'
                                    ? '↑'
                                    : '↓'}
                                </span>
                              )}

                            </button>

                          </th>
                        );
                      }
                    )}

                    <ReorderHeaders />
                  </tr>

                </thead>

                <tbody>

                  {data.rows.map(
                    (row, index) => {

                      const rowId =
                        getField(
                          row,
                          'productId',
                          'sellerSku',
                          'sku',
                          'asin',
                          'product_id',
                          'productId',
                          'item_id',
                          'itemId'
                        ) || index;

                      return (
                        <tr key={rowId}>
                          <td className="product-column">

                            <ProductIdentity
                              row={row}
                            />

                          </td>
                          {visibleColumns.map(
                            (column) => {

                              const rawValue =
                                getField(
                                  row,
                                  ...column.aliases
                                );

                              const numericValue =
                                numberValue(
                                  rawValue
                                );

                              const isDrr =
                                column.key.startsWith(
                                  'drr_'
                                );

                              return (
                                <td
                                  title={column.key === 'vendorInventory' ? `VC inventory as of ${row.vendorInventoryDate || 'report pending'}` : column.key === 'uniwareInventory' ? `EAN: ${(row.uniwareEans || []).join(', ') || 'Not matched'}. Available stock across all warehouse shelves.` : undefined}
                                  key={
                                    column.key
                                  }
                                  className={
                                    isDrr &&
                                      numericValue !==
                                      null &&
                                      numericValue > 0
                                      ? 'metric-positive'
                                      : ''
                                  }
                                >

                                  {isDrr &&
                                    numericValue !==
                                    null &&
                                    numericValue >
                                    0 && (
                                      <span className="metric-arrow">
                                        ↑
                                      </span>
                                    )}

                                  <span>
                                    {formatCell(
                                      row,
                                      column
                                    )}
                                  </span>

                                </td>
                              );
                            }
                          )}

                          <ReorderCells product={row} planning={planning} />
                        </tr>
                      );
                    }
                  )}

                </tbody>

              </table>

            </div>
          )}

        </div>

        <div className="product-table-footer">

          <div className="items-per-page">

            <span>
              Items per page:
            </span>

            <select
              value={query.limit}
              disabled={loading}
              onChange={(event) => {

                setQuery(
                  (current) => ({
                    ...current,
                    page: 1,
                    limit: Number(
                      event.target.value
                    ),
                  })
                );

              }}
            >
              <option value={10}>
                10
              </option>

              <option value={25}>
                25
              </option>

              <option value={50}>
                50
              </option>

              <option value={100}>
                100
              </option>
            </select>

            <span className="dropdown-arrow">
              ▾
            </span>

          </div>

          <div className="pagination-info">

            {loading
              ? 'Loading...'
              : error
                ? 'Unavailable'
                : `${startItem}–${endItem}${data.total !== null &&
                  data.total !== undefined
                  ? ` of ${data.total}`
                  : ''
                }`}

          </div>

          <div className="pagination-buttons">

            <button
              type="button"
              aria-label="Previous page"
              disabled={
                loading ||
                query.page === 1
              }
              onClick={() =>
                setQuery(
                  (current) => ({
                    ...current,
                    page: Math.max(
                      1,
                      current.page - 1
                    ),
                  })
                )
              }
            >
              ‹
            </button>

            <button
              type="button"
              aria-label="Next page"
              disabled={
                loading ||
                !!error ||
                !canGoNext
              }
              onClick={() =>
                setQuery(
                  (current) => ({
                    ...current,
                    page:
                      current.page + 1,
                  })
                )
              }
            >
              ›
            </button>

          </div>

        </div>

      </section>

    </div>
  );
}
