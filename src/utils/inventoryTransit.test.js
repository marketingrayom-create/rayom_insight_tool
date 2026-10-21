import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryTransitForProduct} from './inventoryTransit.js';
const report=items=>({success:true,asOf:'2026-10-21',shipments:[{quantityMatchesItems:true,items}]});
test('maps ASIN/EAN only; excludes SKU-only matches and another ASIN',()=>{
 const row=inventoryTransitForProduct({asin:'A',uniwareEans:['123'],sellerSku:'sku'},report([{asin:'A',units:4},{ean:'123',units:2},{sku:'sku',units:3},{asin:'B',ean:'123',units:100}]));
 assert.equal(row.vcInTransit,6);
});
test('missing invoice breakdown remains unavailable instead of assigning shipment totals',()=>{
 assert.equal(inventoryTransitForProduct({asin:'A'},{success:true,shipments:[{units:796,items:[],quantityMatchesItems:null}]}).vcInTransit,null);
 assert.equal(inventoryTransitForProduct({asin:'A'},null).vcInTransit,null);
});
test('complete empty report and unmatched products return known zero',()=>{
 assert.equal(inventoryTransitForProduct({asin:'A'},{success:true,shipments:[]}).vcInTransit,0);
 assert.equal(inventoryTransitForProduct({asin:'A'},report([{asin:'B',units:5}])).vcInTransit,0);
});
