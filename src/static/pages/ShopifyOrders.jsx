import { useEffect, useState } from 'react';
import { fetchShopifyData } from '../../apiFile/shopifyApi';
import { Tabs, Search, Select, Button, PageHeading, DataTable, EmptyState } from '../components/UI';
import { ShopifyPagination } from '../components/ShopifyTableControls';
import OrderDateFilter, { orderDateKey } from '../components/OrderDateFilter';

export default function ShopifyOrders({ organization, onCompany }) {
  const [type, setType] = useState('Orders');
  const [status, setStatus] = useState('All Orders');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [channel, setChannel] = useState('');
  const [payment, setPayment] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setLoading(true); setError(''); setPage(1);
    // StrictMode's first setup is cleaned up before this task starts.
    const timer = setTimeout(() => fetchShopifyData(type === 'Orders' ? 'orders' : 'abandoned-checkouts', { organization, signal: controller.signal, allRows: true })
      .then(result => { if (!controller.signal.aborted) { setData(result); onCompany(result.company); } })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); }), 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [organization, type, refresh, onCompany]);
  const reset = () => { setSearch(''); setDate(''); setChannel(''); setPayment(''); setStatus('All Orders'); setPage(1); };
  const rows = (data?.data || []).filter(row => {
    const matchStatus = type !== 'Orders' ? status === 'All Orders' || (status === 'Recovered' ? Boolean(row.completedAt) : !row.completedAt)
      : status === 'All Orders' || (status === 'Cancelled' ? Boolean(row.cancelledAt)
        : !row.cancelledAt && (status === 'Shipped' ? ['FULFILLED', 'PARTIALLY_FULFILLED'].includes(row.displayFulfillmentStatus) : ['UNFULFILLED', 'IN_PROGRESS', 'SCHEDULED'].includes(row.displayFulfillmentStatus)));
    return matchStatus && (!date || orderDateKey(row.createdAt) === date)
      && (!channel || row.sourceName === channel) && (!payment || row.displayFinancialStatus === payment)
      && [row.name, row.id, row.customer?.displayName].some(value => String(value || '').toLowerCase().includes(search.toLowerCase()));
  });
  const activePage = Math.min(page, Math.max(1, Math.ceil(rows.length / limit)));
  const columns = type === 'Orders'
    ? [['ORDER', 'name'], ['CREATED', 'createdAt'], ['CUSTOMER', 'customer'], ['CHANNEL', 'sourceName'], ['PAYMENT', 'displayFinancialStatus'], ['FULFILMENT', 'displayFulfillmentStatus'], ['ITEMS', 'currentSubtotalLineItemsQuantity'], ['AMOUNT', 'amount'], ['DELIVERY', 'delivery'], ['DELIVERY METHOD', 'method'], ['TAGS', 'tags']]
    : [['CHECKOUT', 'name'], ['CREATED', 'createdAt'], ['CUSTOMER', 'customer'], ['REGION', 'region'], ['RECOVERY STATUS', 'recovery'], ['TOTAL PRICE', 'amount']];
  return <>
    <PageHeading title="Fulfilment Orders" subtitle="Track Shopify orders and abandoned checkouts." />
    <section className="card"><Tabs items={['Orders', 'Abandoned Checkouts']} value={type} onChange={value => { setType(value); reset(); }} />
      <div className="toolbar">
        <Search placeholder="Order or checkout code, customer" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
        <OrderDateFilter value={date} onApply={value => { setDate(value); setPage(1); }} />
        {type === 'Orders' && <>
          {/* <Select
            label="Channel"
            options={[...new Set((data?.data || []).map(row => row.sourceName).filter(Boolean))]}
            value={channel}
            onChange={event => { setChannel(event.target.value); setPage(1); }} /> */}
          <Select label="Payment status" options={[...new Set((data?.data || []).map(row => row.displayFinancialStatus).filter(Boolean))]} value={payment} onChange={event => { setPayment(event.target.value); setPage(1); }} /></>}
        <Button onClick={reset}>Clear Filters</Button>
        {/* <Button
          disabled={loading}
          onClick={() => setRefresh(value => value + 1)}>Refresh</Button> */}
      </div>
    </section>
    <section className="card" style={{ marginTop: 16 }}>
      <Tabs items={type === 'Orders' ? ['All Orders', 'Ready to Ship', 'Shipped', 'Cancelled'] : ['All Orders', 'Not Recovered', 'Recovered']} value={status} onChange={value => { setStatus(value); setPage(1); }} />
      {loading ? <div role="status" style={{ minHeight: 260, display: 'grid', placeItems: 'center' }}>Loading Shopify {type.toLowerCase()}…</div> : error ? <EmptyState title="Unable to load orders" description={error} action={<Button primary onClick={() => setRefresh(value => value + 1)}>Retry</Button>} /> : <>
        <DataTable columns={columns.map(([label, key]) => ({ label, key }))} rows={rows.slice((activePage - 1) * limit, activePage * limit)} renderCell={(row, key) => {
          if (key === 'createdAt') return new Date(row.createdAt).toLocaleString('en-IN');
          if (key === 'customer') return row.customer?.displayName || '—';
          if (key === 'amount') { const amount = row.totalPriceSet?.shopMoney; return amount ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: amount.currencyCode }).format(amount.amount) : '—'; }
          if (key === 'delivery') return row.fulfillments?.map(value => value.displayStatus).filter(Boolean).join(', ') || '—';
          if (key === 'method') return row.shippingLine?.title || '—';
          if (key === 'tags') return row.tags?.join(', ') || '—';
          if (key === 'region') return row.shippingAddress?.country || '—';
          if (key === 'recovery') return row.completedAt ? 'Recovered' : 'Not recovered';
          return row[key] ?? '—';
        }} />
        <ShopifyPagination label={type} total={rows.length} page={activePage} limit={limit} onPage={setPage} onLimit={value => { setLimit(value); setPage(1); }} />
      </>}
    </section>
  </>;
}
