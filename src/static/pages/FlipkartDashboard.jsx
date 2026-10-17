import { useEffect, useState } from 'react';
import { fetchFlipkartProducts } from '../../apiFile/flipkartApi';
import { Button, DataTable, PageHeading } from '../components/UI';

export default function FlipkartDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [batch, setBatch] = useState(0);
  const [state, setState] = useState('ACTIVE');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    fetchFlipkartProducts({ signal: controller.signal, batchNo: batch, internalState: state })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [batch, state, refresh]);
  return <section className="card summary-card">
    <PageHeading title="Rayom · Flipkart" subtitle="Live seller product listings" />
    <div className="toolbar">
      <select aria-label="Listing status" value={state} onChange={event => { setState(event.target.value); setBatch(0); }}>
        {['ACTIVE', 'INACTIVE', 'READY_FOR_ACTIVATION', 'ARCHIVED', 'INACTIVATED_BY_FLIPKART'].map(value => <option key={value}>{value}</option>)}
      </select>
      <Button onClick={() => setRefresh(value => value + 1)} disabled={loading}>Refresh</Button>
    </div>
    {loading ? <p role="status">Loading Rayom Flipkart data…</p> : error ? <p role="alert">{error}</p> : <>
      <p>{data?.total ?? 0} listings · Page {batch + 1}</p>
      <DataTable columns={[
        ['Company', 'company'], ['SKU', 'sku'], ['Product', 'title'],
        ['Product ID', 'productId'], ['Status', 'status'], ['Selling price', 'price'], ['MRP', 'mrp'],
      ].map(([label, key]) => ({ label, key }))} rows={data?.data || []}
        renderCell={(row, key) => ['price', 'mrp'].includes(key) ? (row[key] == null ? '—' : `₹${row[key]}`) : row[key] ?? '—'} />
      <div className="toolbar">
        <Button disabled={batch === 0} onClick={() => setBatch(value => value - 1)}>Previous</Button>
        <Button disabled={(batch + 1) * 20 >= (data?.total || 0)} onClick={() => setBatch(value => value + 1)}>Next</Button>
      </div>
    </>}
  </section>;
}
