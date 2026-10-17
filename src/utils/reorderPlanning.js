export const INPUT_GROUPS = [
  ['Details', [['vendorName','Vendor name','text'],['leadTimeDays','Vendor lead time (days)'],['ownStock','Own warehouse stock']]],
  ['Vendor Central', [['vcSales45','VC sales (last 45 days)'],['vcStock','VC warehouse stock'],['vcInTransit','VC in-transit quantity'],['vcOpenPo','VC open PO quantity']]],
  ['Amazon FBA', [['fbaSales45','FBA sales (last 45 days)'],['fbaStock','FBA warehouse stock'],['fbaInTransit','FBA in-transit quantity'],['fbaOpenPo','FBA open PO quantity']]],
  ['Flipkart FBF', [['fbfSales45','FBF sales (last 45 days)'],['fbfStock','FBF warehouse stock'],['fbfInTransit','FBF in-transit quantity'],['fbfOpenPo','FBF open PO quantity']]],
  ['Order settings', [['safetyBufferDays','Extra safety buffer (days)'],['safetyStock','Safety stock (units)'],['incoming','Incoming quantity from vendor'],['demandDays','Demand divisor (days)'],['override','Manual override quantity'],['recall','Recall notes','text']]],
];
export const OUTPUTS = [
  ['vcDispatch','VC suggested dispatch'],['fbaDispatch','FBA suggested dispatch'],['fbfDispatch','FBF suggested dispatch'],
  ['totalSales','Total sales (45 days)'],['networkStock','Total network stock'],['stockCover','Stock cover (days)'],
  ['totalOpenPo','Total portal open PO'],['totalDispatch','Total suggested dispatch'],['ownAfterDispatch','Own stock after dispatch'],
  ['targetCover','Target cover (days)'],['leadDemand','Lead-time demand'],['recommended','Recommended order'],['finalOrder','Final order quantity'],
];
export const numeric = value => typeof value === 'number' && Number.isFinite(value);
const calc = (values, fn) => values.every(numeric) ? fn(...values) : null;
export const FORMULA_KEYS = new Set(['vcCover','vcRecall','vcDispatch','fbaCover','fbaRecall','fbaDispatch','fbfCover','fbfRecall','fbfDispatch',
  'totalSales','networkStock','stockCover','totalOpenPo','totalDispatch','ownAfterDispatch','targetCover','leadDemand','recommended','finalOrder']);
export function calculatePlan(row) {
  const result={};
  for(const channel of ['vc','fba','fbf']) {
    const sales=row[channel+'Sales45'],stock=row[channel+'Stock'],transit=row[channel+'InTransit'];
    result[channel+'Cover']=calc([stock,transit,sales],(a,b,s)=>s>0?(a+b)/(s/45):null);
    result[channel+'Recall']=calc([stock,transit,sales],(a,b,s)=>Math.max(0,a+b-s/45*60));
    result[channel+'Dispatch']=calc([sales,stock,transit],(s,a,b)=>Math.max(0,s-a-b));
  }
  // Aggregate only reported values. No numeric sources means unavailable, not zero.
  const availableSum=values=>values.some(numeric)?values.filter(numeric).reduce((a,b)=>a+b,0):null;
  const salesInputs=[row.vcSales45,row.fbaSales45,row.fbfSales45];
  const stockInputs=[row.ownStock,...['vc','fba','fbf'].flatMap(channel=>
    [row[channel+'Stock'],row[channel+'InTransit'],row[channel+'RecallInTransit']])];
  result.totalSales=availableSum(salesInputs);
  result.networkStock=availableSum(stockInputs);
  result.stockCover=calc([result.networkStock,result.totalSales],(stock,sales)=>sales>0?stock/(sales/45):null);
  result.totalOpenPo=availableSum([row.vcOpenPo,row.fbaOpenPo,row.fbfOpenPo]);
  result.totalDispatch=availableSum([result.vcDispatch,result.fbaDispatch,result.fbfDispatch]);
  result.ownAfterDispatch=calc([row.ownStock,result.totalDispatch],(a,b)=>Math.max(0,a-b));
  result.targetCover=availableSum([row.leadTimeDays,row.safetyBufferDays]);
  result.leadDemand=calc([result.totalSales,row.leadTimeDays],(s,days)=>s/45*days);
  // Exclude unavailable terms; do not invent observations or block known data.
  const demand=calc([result.totalSales,result.targetCover],(sales,target)=>sales/45*target);
  result.recommended=[result.totalSales,result.networkStock].some(numeric)
    ?Math.max(0,(numeric(demand)?demand:0)+(numeric(row.safetyStock)?row.safetyStock:0)
      -(numeric(result.networkStock)?result.networkStock:0)-(numeric(row.incoming)?row.incoming:0)):null;
  result.finalOrder=numeric(row.override)&&row.override!==0?row.override:result.recommended;
  return result;
}

export function mergeLiveStock(plan, products) {
  const matches = products.filter(product => product.uniwareEans?.includes(plan.ean));
  if (!matches.length) return {row:plan, matched:false};
  // Multiple seller listings for one ASIN repeat the same Uniware/VC quantities.
  const byAsin = new Map(matches.map(row=>[row.asin,row]));
  const rows = [...byAsin.values()];
  const updated = {...plan,sources:{...plan.sources}};
  const own = new Set(rows.map(row=>row.uniwareInventory).filter(numeric));
  if (own.size===1) {updated.ownStock=[...own][0];updated.sources.ownStock='Live Uniware: matched EAN';}
  // Do not combine different ASIN variants under a shared EAN automatically.
  if (rows.length===1) {
    const product=rows[0];
    if (numeric(product.vendorInventory)) {updated.vcStock=product.vendorInventory;updated.sources.vcStock=`VC stock as of ${product.vendorInventoryDate || 'reported date unavailable'}`;}
    if (numeric(product.fbaAvailable)) {updated.fbaStock=product.fbaAvailable;updated.sources.fbaStock='Live Amazon FBA';}
  }
  return {row:updated,matched:true};
}
