import test from 'node:test';
import assert from 'node:assert/strict';
import {dynamicReorderPlan,planningSettingsPayload} from './dynamicReorder.js';
const product={asin:'B0HFVXMLC5',itemTitle:'GUST',brand:'LINSO',uniwareEans:['8906218300012'],uniwareInventory:830,fbaAvailable:0};
const imported={ean:'8906218300012',vcStock:166,vcSales45:83,vcOpenPo:66,incoming:64,fbfStock:61,
 override:999,leadTimeDays:60,safetyBufferDays:15,safetyStock:20,demandDays:30,sources:{incoming:'Imported workbook snapshot'}};
test('API observations replace imported values; unsupported and missing sources stay null',()=>{
 const row=dynamicReorderPlan(product,[imported],{asin:product.asin,vcStock:40,vcSales45:180,vcOpenPo:0,vcInTransit:3});
 assert.equal(row.vcStock,40);assert.equal(row.vcSales45,180);assert.equal(row.vcOpenPo,0);
 assert.equal(row.ownStock,830);assert.equal(row.fbaStock,0);
 for(const key of ['incoming','override','fbfStock','fbaSales45'])assert.equal(row[key],null);
 assert.equal(dynamicReorderPlan(product,[imported],null).vcStock,null);
});
test('ASIN/EAN mismatch prevents using vendor data and saved settings from another variant',()=>{
 const row=dynamicReorderPlan(product,[imported],{asin:product.asin,ean:'8906218300005',vcStock:40});
 assert.equal(row.vcStock,null);assert.equal(row.ean,null);assert.ok(row.matchError);
});
test('manual settings persist but API stock can never enter settings payload',()=>{
 const row=dynamicReorderPlan(product,[{...imported,incoming:25,override:0,sources:{incoming:'Manual input',override:'Manual input'}}],{vcStock:40});
 assert.equal(row.incoming,25);assert.equal(row.override,0);
 const payload=planningSettingsPayload(row);
 assert.equal(payload.override,0);assert.ok(!('vcStock' in payload));assert.ok(!('ownStock' in payload));
});

test('vendor name is supplied only by Uniware, never by workbook or vendor account',()=>{
 const row=dynamicReorderPlan({...product,uniwareVendorName:'BALAJI INCORPORATION'},[{...imported,vendorName:'STATIC'}],{vendorName:'VC account'});
 assert.equal(row.vendorName,'BALAJI INCORPORATION');
 assert.equal(dynamicReorderPlan(product,[{...imported,vendorName:'STATIC'}],{vendorName:'VC account'}).vendorName,null);
});
test('new demand basis is always 45 days despite a legacy 30-day setting',()=>{
 assert.equal(dynamicReorderPlan(product,[{...imported,demandDays:30}],{}).demandDays,45);
});

test('FBA uses Seller Central metrics only and unintegrated FBF stays empty',()=>{
 const saved={...imported,fbfRecallInTransit:999,sources:{fbfRecallInTransit:'Manual input'}};
 const row=dynamicReorderPlan(product,[saved],{vcSales45:139,vcStock:4,vcInTransit:6,fbaSales45:17,fbaStock:11,fbaInTransit:3});
 assert.equal(row.fbaSales45,17);assert.equal(row.fbaStock,11);assert.equal(row.fbaInTransit,3);
 assert.equal(row.vcSales45,139);assert.equal(row.vcStock,4);
 for(const key of ['fbfSales45','fbfStock','fbfInTransit','fbfRecallInTransit','fbfOpenPo'])assert.equal(row[key],null);
 assert.equal(row.fbaOpenPo,null);
});
