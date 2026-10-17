export function matchesFulfillmentStatus(order, selected) {
  const value = String(order.orderStatus || '').toLowerCase();
  const easy = String(order.easyShipShipmentStatus || '').toLowerCase().replaceAll('_', '');
  const pickup = value === 'shipped' && easy === 'pendingpickup';
  switch (selected) {
    case 'Ready to Ship': return pickup || ['unshipped', 'partiallyshipped'].includes(value);
    case 'Shipped': return value === 'shipped' && !pickup;
    case 'Cancelled': return ['canceled', 'cancelled'].includes(value);
    case 'Open': return ['pending', 'pendingavailability', 'unshipped', 'partiallyshipped'].includes(value);
    case 'Failed': return value === 'unfulfillable';
    case 'Delivered': return value === 'delivered';
    case 'Unverified': return false;
    default: return true;
  }
}
