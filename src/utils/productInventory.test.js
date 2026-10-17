import test from 'node:test';
import assert from 'node:assert/strict';
import {totalInventory, refreshedInventoryRows, applyUniwareStock} from './productInventory.js';

test('total adds Uniware, VC, FBA and FBM once; missing stock remains unknown', () => {
  assert.equal(totalInventory({uniwareInventory:830,vendorInventory:40,fbmAvailable:2,fbaAvailable:3}),875);
  assert.equal(totalInventory({uniwareInventory:0,vendorInventory:0}),0);
  assert.equal(totalInventory({vendorInventory:null}),null);
  assert.equal(totalInventory({uniwareInventory:NaN}),null);
});
test('background refresh retains stock for the same company and recalculates total', () => {
  const current = {organization:'linso',rows:[{asin:'A',uniwareInventory:830,uniwareEans:['ean']}]};
  const rows = refreshedInventoryRows([{asin:'A',vendorInventory:40}],current,'linso');
  assert.equal(rows[0].combinedInventory,870);
  assert.equal(rows[0].uniwareInventory,830);
  assert.equal(refreshedInventoryRows([{asin:'A',vendorInventory:40}],current,'rayom')[0].uniwareInventory,null);
});
test('delayed stock response updates matching rows after products refresh', () => {
  const stock = {inventory:{A:{quantity:830,eans:['ean']}},facility:'RAYOM',matchSource:'EAN'};
  const current = {organization:'linso',rows:[{asin:'A',vendorInventory:40},{asin:'B',vendorInventory:5}]};
  const result = applyUniwareStock(current,stock,'linso');
  assert.equal(result.rows[0].combinedInventory,870);
  assert.equal(result.rows[1],current.rows[1]);
  assert.equal(applyUniwareStock(current,stock,'rayom'),current);
});
test('fresh unknown Uniware quantity clears stale stock without losing VC', () => {
  const result = applyUniwareStock({organization:'linso',rows:[{asin:'A',vendorInventory:40,uniwareInventory:830}]},
    {inventory:{A:{quantity:null}},facility:'RAYOM',matchSource:'EAN'},'linso');
  assert.equal(result.rows[0].uniwareInventory,null);
  assert.equal(result.rows[0].combinedInventory,40);
});
