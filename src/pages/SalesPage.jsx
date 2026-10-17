import { useMemo, useState } from 'react';
import StatusTabs from '../components/StatusTabs';

const currency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
const stage = (order) => order.stage || (order.status === 'Shipped' ? 'inTransit' : order.status === 'Delivered' ? 'current' : 'inHouse');

export default function SalesPage({ orders, setModal }) {
  const [activeTab, setActiveTab] = useState('inHouse');
  const tabs = [{ id: 'inHouse', label: 'In-house', count: orders.filter((o) => stage(o) === 'inHouse').length }, { id: 'inTransit', label: 'In transit', count: orders.filter((o) => stage(o) === 'inTransit').length }, { id: 'current', label: 'Current', count: orders.filter((o) => stage(o) === 'current').length }];
  const visible = useMemo(() => orders.filter((order) => stage(order) === activeTab), [orders, activeTab]);
  const label = activeTab === 'inHouse' ? 'In-house' : activeTab === 'inTransit' ? 'In transit' : 'Current';
  return <div className="content"><div className="page-actions"><p className="lead">Track each sale from warehouse to customer.</p><button className="primary" onClick={() => setModal('sale')}>+ New sales order</button></div><section className="panel table-panel"><div className="panel-head"><div><h3>Sales orders</h3><p>Filter orders by delivery stage</p></div></div><StatusTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} /><table><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>{visible.map((o) => <tr key={o.id}><td><strong>{o.id}</strong></td><td>{o.customer}</td><td>{o.date}</td><td>{o.items}</td><td>{currency(o.total)}</td><td><span className={`status ${activeTab === 'current' ? 'good' : activeTab === 'inTransit' ? 'transit' : 'neutral'}`}>{label}</span></td></tr>)}</tbody></table>{visible.length === 0 && <p className="empty-state">No sales orders in this category.</p>}</section></div>;
}
