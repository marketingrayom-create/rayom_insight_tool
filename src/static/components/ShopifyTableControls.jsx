export function ShopifyFilters({ label, search, metric, days, onChange }) {
  return <div className="product-performance-toolbar">
    <div className="product-search"><input aria-label={`Search ${label}`} placeholder={`Search ${label}...`} value={search} onChange={event => onChange({ search: event.target.value })} /><span className="search-icon">⌕</span></div>
    <div className="product-metric-selectors" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <select aria-label={`${label} metric`} value={metric} onChange={event => onChange({ metric: event.target.value })}>{['Revenue', 'DRR', 'Units', 'Inventory'].map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label={`${label} duration`} value={days} disabled={metric === 'Inventory'} onChange={event => onChange({ days: Number(event.target.value) })}>{[1, 7, 30, 90].map(value => <option value={value} key={value}>{value} {value === 1 ? 'Day' : 'Days'}</option>)}</select>
    </div>
    <button type="button" className="clear-filter-button" onClick={() => onChange({ search: '', metric: 'Revenue', days: 1 })}>↻ Clear Filters</button>
  </div>;
}

export function ShopifyPagination({ total, page, limit, onPage, onLimit, label }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return <div className="product-table-footer">
    <div className="items-per-page"><span>Items per page:</span><select aria-label={`${label} rows per page`} value={limit} onChange={event => onLimit(Number(event.target.value))}>{[5, 10, 20, 50, 100].map(value => <option key={value}>{value}</option>)}</select></div>
    <div className="pagination-info">{total ? (page - 1) * limit + 1 : 0}–{Math.min(page * limit, total)} of {total} · Page {page} of {pages}</div>
    <div className="pagination-buttons"><button type="button" aria-label={`${label} previous page`} disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button><button type="button" aria-label={`${label} next page`} disabled={page >= pages} onClick={() => onPage(page + 1)}>›</button></div>
  </div>;
}
