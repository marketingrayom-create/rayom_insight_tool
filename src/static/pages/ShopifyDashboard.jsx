import { useEffect, useState } from 'react';
import { fetchShopifyData } from '../../apiFile/shopifyApi';
import { Button, DataTable, PageHeading, Icon } from '../components/UI';
import { ChartCard } from './Dashboard';
import { ShopifyFilters, ShopifyPagination } from '../components/ShopifyTableControls';
import '../../pages/ProductPerformancePage.css';

function SalesChart({ rows, field, title, currency }) {
  const weekly = rows.slice(-7);
  return <ChartCard chart={{ title, subtitle: 'Shopify · last 7 UTC calendar dates',
    values: weekly.map(row => row[field]), dates: weekly.map(row => row.date),
    max: Math.max(1, ...weekly.map(row => row[field])), axis: field === 'revenue' ? 'Revenue' : 'Units', right: '', currency }} />;
}

export default function ShopifyDashboard({ organization, onCompany, initialResource = 'dashboard' }) {
  const [resource, setResource] = useState(initialResource);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cursors, setCursors] = useState([null]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [productPage, setProductPage] = useState(1);
  const [productLimit, setProductLimit] = useState(5);
  const [brandFilter, setBrandFilter] = useState({ search: '', metric: 'Revenue', days: 1 });
  const [productFilter, setProductFilter] = useState({ search: '', metric: 'Revenue', days: 1 });
  const [brandPage, setBrandPage] = useState(1);
  const [brandLimit, setBrandLimit] = useState(5);
  const [listingPage, setListingPage] = useState(1);
  const [listingLimit, setListingLimit] = useState(5);
  const [dailyPage, setDailyPage] = useState(1);
  const [dailyLimit, setDailyLimit] = useState(5);
  const after = null;
  const apiSearch = resource === 'dashboard' ? '' : search;
  const filterPayload = JSON.stringify({ brand: brandFilter, product: productFilter });
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const timer = setTimeout(() => fetchShopifyData(resource, { organization, signal: controller.signal, after, search: apiSearch, refresh: refresh > 0, allRows: true,
      ...(resource === 'dashboard' ? { filters: JSON.parse(filterPayload) } : {}) })
      .then(result => { if (!controller.signal.aborted) { setData(result); onCompany(result.company); } })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); }), 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [organization, resource, after, apiSearch, refresh, onCompany, filterPayload]);
  const money = value => value ? `${value.amount} ${value.currencyCode}` : '—';
  const currency = data?.shop?.currencyCode || 'INR';
  const formatMoney = value => value == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(value);
  const matches = row => [row.title, row.vendor, row.brand, row.sku].some(value => String(value || '').toLowerCase().includes(search.toLowerCase()));
  const salesColumns = [['DRR - 1D', 'drr1d'], ['DRR - 7D', 'drr7d'], ['DRR - 30D', 'drr30d'], ['Revenue 7D', 'revenue7d'], ['Revenue 30D', 'revenue30d'], ['Revenue 90D', 'revenue90d']];
  const productColumns = [['Product', 'title'], ['Vendor', 'vendor'], ['Status', 'status'], ['Inventory', 'totalInventory'], ['Category', 'categoryName'], ['Channels', 'channels'], ['Product type', 'productType'], ['Min price', 'minPrice'], ['Max price', 'maxPrice']];
  const cell = (row, key) => {
    if (key.startsWith('revenue')) return formatMoney(row[key]);
    if (key === 'weekChange') return row[key] == null ? '—' : `${row[key]}%`;
    if (key === 'categoryName') return row.category?.name || '—';
    if (key === 'channels') return row.resourcePublicationsCount?.count ?? '—';
    if (key === 'minPrice') return money(row.priceRangeV2?.minVariantPrice);
    if (key === 'maxPrice') return money(row.priceRangeV2?.maxVariantPrice);
    if (key === 'total') return money(row.totalPriceSet?.shopMoney);
    if (key === 'createdAt') return new Date(row.createdAt).toLocaleString();
    if (key === 'title') {
      const image = row.featuredImage || row.image;
      return <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {image?.url && <img src={image.url} alt={image.altText || ''} loading="lazy" width="38" height="42" style={{ objectFit: 'contain' }} />}
        <span>{row.title}</span>
      </div>;
    }
    return row[key] ?? '—';
  };
  const table = (columns, rows) => <DataTable columns={columns.map(([label, key]) => ({ label, key }))} rows={rows} renderCell={cell} />;
  const selectedColumn = filter => filter.metric === 'Inventory' ? ['Inventory', 'totalInventory'] : [`${filter.metric} ${filter.days}D`, `${filter.metric.toLowerCase()}${filter.days}d`];
  const productMetricColumns = [...productColumns.slice(1), selectedColumn(productFilter), ['Days of inventory', 'daysOfInventory']];
  const brands = (data?.brands || []).filter(row => String(row.brand || '').toLowerCase().includes(brandFilter.search.toLowerCase()));
  const activeBrandPage = Math.min(brandPage, Math.max(1, Math.ceil(brands.length / brandLimit)));
  const listings = [...(data?.data || [])].sort((a, b) => resource === 'inventory'
    ? Number(Boolean(b.sku && b.sku !== 'No SKU')) - Number(Boolean(a.sku && a.sku !== 'No SKU'))
    : resource === 'products' ? Number(b.totalInventory || 0) - Number(a.totalInventory || 0) : 0);
  const activeListingPage = Math.min(listingPage, Math.max(1, Math.ceil(listings.length / listingLimit)));
  const rankedProducts = (data?.products || []).filter(matches)
    .filter(row => [row.title, row.vendor, row.id].some(value => String(value || '').toLowerCase().includes(productFilter.search.toLowerCase())))
    .sort((a, b) => Number(b.totalInventory ?? 0) - Number(a.totalInventory ?? 0) || String(a.title).localeCompare(String(b.title)));
  const pageCount = Math.max(1, Math.ceil(rankedProducts.length / productLimit));
  const currentPage = Math.min(productPage, pageCount);
  const visibleProducts = rankedProducts.slice((currentPage - 1) * productLimit, currentPage * productLimit);
  const columns = resource === 'products'
    ? productColumns
    : resource === 'inventory' ? [['Product', 'title'], ['Variant', 'variant'], ['SKU', 'sku'], ['Location', 'location'], ['Unavailable', 'unavailable'], ['Committed', 'committed'], ['Available', 'available'], ['On hand', 'on_hand'], ['Incoming', 'incoming']]
    : [['Order', 'name'], ['Created', 'createdAt'], ['Payment', 'displayFinancialStatus'], ['Fulfilment', 'displayFulfillmentStatus'], ['Total', 'total']];
  return <>
    <section className="card" style={{ padding: '12px 21px', marginBottom: 20 }}>
    <PageHeading title={`${data?.company || 'Store'} · Shopify`} subtitle="Sales summary, product details and inventory from your store" />
    </section>
    {resource !== 'dashboard' && <section className="card summary-card">
    <form className="toolbar" onSubmit={event => { event.preventDefault(); setSearch(draft); setCursors([null]); setListingPage(1); }}>
      <input aria-label="Search Shopify" placeholder="Search Shopify…" value={draft} onChange={event => setDraft(event.target.value)} />
      <Button>Search</Button>
    </form>
    </section>}
    {loading && data && <p role="status">Updating Shopify filters…</p>}
    {loading && !data ? <p role="status">Loading Shopify data…</p> : error ? <p role="alert">{error}</p> : <>
      {resource === 'dashboard' ? <>
        {(data?.notices || []).map(notice => <p role="status" key={notice}>{notice}</p>)}
        <section className="card metrics">
          {[
            ['Total sales · 7D', formatMoney(data?.overview?.revenue7d), 'IndianRupee', 'green'],
            ['Units sold · 7D', data?.overview?.units7d, 'ShoppingCart', 'orange'],
            ['Products', data?.overview?.products, 'Box', 'cyan'],
            ['Total inventory', data?.overview?.inventory, 'Package', 'green'],
          ].map(([label, value, icon, color]) => <div className="metric" key={label}><span className={`metric-icon ${color}`}><Icon name={icon} size={17} /></span><div><strong>{value}</strong><small>{label}</small></div></div>)}
        </section>
        <div className="chart-grid">
          <SalesChart rows={data?.daily || []} field="revenue" title="Revenue Statistics" currency={currency} />
          <SalesChart rows={data?.daily || []} field="units" title="Unit Statistics" />
        </div>
        <section className="card summary-card">
        <h2>Brand Sales Summary</h2>
        <p>Sales performance across Shopify brands (last 7 days)</p>
        <ShopifyFilters label="brands" {...brandFilter} onChange={change => { setBrandFilter(value => ({ ...value, ...change })); setBrandPage(1); }} />
        {table([['Brand', 'brand'], ['Comparable sales week on week', 'weekChange'], selectedColumn(brandFilter)], brands.slice((activeBrandPage - 1) * brandLimit, activeBrandPage * brandLimit))}
        <ShopifyPagination label="Brands" total={brands.length} page={activeBrandPage} limit={brandLimit} onPage={setBrandPage} onLimit={value => { setBrandLimit(value); setBrandPage(1); }} />
        </section>
        <section className="card summary-card">
          <div className="content product-performance-page"><section className="product-performance-card">
            <div className="product-performance-header"><h1>Product Details</h1><button className="icon-refresh-button" aria-label="Refresh Shopify products" onClick={() => setRefresh(value => value + 1)}>↻</button></div>
            <ShopifyFilters label="products" {...productFilter} onChange={change => { setProductFilter(value => ({ ...value, ...change })); setProductPage(1); }} />
            <div className="product-table-wrapper"><div className="product-table-scroll"><table className="product-performance-table">
              <thead><tr><th className="product-column">PRODUCT</th>{productMetricColumns.map(([label, key]) => <th key={key}>{label.toUpperCase()}{key === 'totalInventory' ? ' ↓' : ''}</th>)}</tr></thead>
              <tbody>{visibleProducts.map(row => <tr key={row.id}>
                <td className="product-column"><div className="product-identity">
                  <div className="product-image-wrapper">{row.featuredImage?.url ? <img className="product-image" src={row.featuredImage.url} alt="" loading="lazy" /> : <div className="product-image-placeholder">P</div>}</div>
                  <div className="product-info"><div className="product-brand">{row.vendor}</div><div className="product-asin">{row.id.split('/').at(-1)}</div><div className="product-title" title={row.title}>{row.title}</div><div className="product-fulfillment">Shopify</div></div>
                </div></td>
                {productMetricColumns.map(([, key]) => <td key={key}>{cell(row, key)}</td>)}
              </tr>)}</tbody>
            </table>{!visibleProducts.length && <p className="product-empty">No products found.</p>}</div></div>
            <ShopifyPagination label="Products" total={rankedProducts.length} page={currentPage} limit={productLimit} onPage={setProductPage} onLimit={value => { setProductLimit(value); setProductPage(1); }} />
          </section></div>
        </section>
        <section className="card summary-card">
        <h2>Listing Health Snapshot</h2>
        <p>Total listings: {data?.overview?.products}</p>
        {Object.entries(data?.listingHealth || {}).map(([state, count]) => <div className="health-row" key={state}><span className={`metric-icon ${state === 'ACTIVE' ? 'green' : 'gray'}`}><Icon name={state === 'ACTIVE' ? 'CircleCheck' : 'Box'} size={15} /></span>{state}<b>{count}</b></div>)}
        </section>
        <section className="card summary-card"><h2>Sales calculation and daily data</h2>
        {table([['Date', 'date'], ['Revenue', 'revenue'], ['Units', 'units']], (data?.daily || []).slice((dailyPage - 1) * dailyLimit, dailyPage * dailyLimit))}
        <p>{data?.revenueDefinition}</p>
        <ShopifyPagination label="Daily sales" total={data?.daily?.length || 0} page={dailyPage} limit={dailyLimit} onPage={setDailyPage} onLimit={value => { setDailyLimit(value); setDailyPage(1); }} />
        </section>
      </> : <section className="card summary-card">{table(columns, listings.slice((activeListingPage - 1) * listingLimit, activeListingPage * listingLimit))}</section>}
      {resource !== 'dashboard' && <ShopifyPagination label={resource} total={listings.length} page={activeListingPage} limit={listingLimit} onPage={setListingPage} onLimit={value => { setListingLimit(value); setListingPage(1); }} />}
    </>}
  </>;
}
