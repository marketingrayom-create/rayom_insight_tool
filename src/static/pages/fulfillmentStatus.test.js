import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesFulfillmentStatus } from './fulfillmentStatus.js';

test('self ship shipped orders do not need an Easy Ship status', () => {
  assert.equal(matchesFulfillmentStatus({orderStatus:'Shipped'}, 'Shipped'), true);
});
test('unshipped orders and pending pickups appear in Ready to Ship', () => {
  for (const order of [{orderStatus:'Unshipped'}, {orderStatus:'PartiallyShipped'}, {orderStatus:'Shipped',easyShipShipmentStatus:'PendingPickUp'}]) {
    assert.equal(matchesFulfillmentStatus(order, 'Ready to Ship'), true);
    assert.equal(matchesFulfillmentStatus(order, 'Shipped'), false);
  }
  assert.equal(matchesFulfillmentStatus({orderStatus:'Pending'}, 'Ready to Ship'), false);
});
test('cancelled orders accept both Amazon spellings', () => {
  for (const orderStatus of ['Canceled','Cancelled']) assert.equal(matchesFulfillmentStatus({orderStatus}, 'Cancelled'), true);
  assert.equal(matchesFulfillmentStatus({orderStatus:'Shipped'}, 'Cancelled'), false);
});
