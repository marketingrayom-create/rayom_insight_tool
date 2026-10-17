import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculatePlan,mergeLiveStock} from './reorderPlanning.js';
const reference=JSON.parse(fs.readFileSync(new URL('../../backend/fixtures/reorder_reference.json',import.meta.url),'utf8'));

test('all 16 supplied workbook rows reproduce every cached formula',()=>{
  assert.equal(reference.length,16);
  for(const {input,expected} of reference){
    const actual=calculatePlan(input);
    for(const [key,value] of Object.entries(expected)){
      assert.ok(typeof actual[key]==='number',`${input.ean} ${key} unavailable`);
      assert.ok(Math.abs(actual[key]-value)<1e-7,`${input.ean} ${key}: ${actual[key]} != ${value}`);
    }
  }
});
test('zero and blank overrides use recommended; nonzero overrides win',()=>{
  const row=reference[0].input;
  assert.equal(calculatePlan({...row,override:0}).finalOrder,0);
  assert.equal(calculatePlan({...row,override:12}).finalOrder,12);
  assert.equal(calculatePlan({...row,override:null}).finalOrder,0);
});
test('missing channel data is not silently counted as zero',()=>{
  const row={...reference[0].input,fbfSales45:null,leadTimeDays:null};
  assert.ok(Number.isFinite(calculatePlan(row).recommended));
  assert.equal(calculatePlan(row).finalOrder,calculatePlan(row).recommended);
  assert.equal(calculatePlan({...row,override:0}).finalOrder,calculatePlan(row).recommended);
  assert.equal(calculatePlan({...reference[0].input,vcSales45:0,fbaSales45:0,fbfSales45:0}).stockCover,null);
});
test('recall fractions match and negative dispatch/order results clamp to zero',()=>{
  assert.equal(calculatePlan(reference[0].input).vcDispatch,0);
  assert.equal(calculatePlan(reference[0].input).recommended,0);
  assert.ok(Math.abs(calculatePlan(reference[0].input).vcRecall-97.33333333333333)<1e-8);
  assert.ok(reference.every(({input})=>calculatePlan(input).recommended>=0));
});
test('live stock requires EAN, never doubles repeated listings and leaves missing sources intact',()=>{
  const row=reference[0].input;
  const product={asin:'A',uniwareEans:[row.ean],uniwareInventory:830,vendorInventory:40,vendorInventoryDate:'2026-10-15',fbaAvailable:0};
  const result=mergeLiveStock(row,[product,{...product}]);
  assert.equal(result.row.ownStock,830);assert.equal(result.row.vcStock,40);assert.equal(result.row.fbaStock,0);
  assert.equal(result.row.vcSales45,row.vcSales45);assert.equal(result.row.vcInTransit,row.vcInTransit);
  assert.equal(mergeLiveStock(row,[{...product,uniwareEans:['other']}]).matched,false);
  assert.equal(mergeLiveStock(row,[{...product,vendorInventory:null}]).row.vcStock,row.vcStock);
});

test('totals add available sources without inventing missing values',()=>{
  const plan=calculatePlan({vcSales45:139,ownStock:691,vcStock:4,vcInTransit:6,vcOpenPo:0});
  assert.equal(plan.totalSales,139);
  assert.equal(plan.networkStock,701);
  assert.equal(plan.stockCover,701/(139/45));
  assert.equal(plan.totalOpenPo,0);
  assert.equal(plan.totalDispatch,129);
  assert.equal(plan.ownAfterDispatch,562);
  assert.equal(plan.recommended,0);
  const missing=calculatePlan({});
  for(const key of ['totalSales','networkStock','totalOpenPo','totalDispatch']) assert.equal(missing[key],null);
  assert.equal(calculatePlan({vcSales45:0}).totalSales,0);
  assert.equal(calculatePlan({vcSales45:12,fbaSales45:3,fbfSales45:null}).totalSales,15);
});

test('lead demand and recommendation use displayed totals and final falls back on zero',()=>{
  const row={vcSales45:90,ownStock:10,vcStock:5,leadTimeDays:60,safetyBufferDays:15,safetyStock:20,incoming:3};
  const result=calculatePlan(row);
  assert.equal(result.leadDemand,120);
  assert.equal(result.targetCover,75);
  assert.equal(result.recommended,152);
  for(const override of [null,undefined,0]) assert.equal(calculatePlan({...row,override}).finalOrder,152);
  assert.equal(calculatePlan({...row,override:25}).finalOrder,25);
  assert.equal(calculatePlan({...row,incoming:null}).recommended,155);
  assert.equal(calculatePlan({...row,incoming:undefined}).finalOrder,155);
  assert.equal(calculatePlan({...row,vcSales45:null}).recommended,2);
});

test('recommendation excludes missing terms and stays blank only without observed sales or stock',()=>{
 assert.equal(calculatePlan({ownStock:54,safetyStock:20}).recommended,0);
 assert.equal(calculatePlan({vcSales45:90,leadTimeDays:60}).recommended,120);
 assert.equal(calculatePlan({}).recommended,null);
});
