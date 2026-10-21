import {numeric} from './reorderPlanning.js';
export const SETTING_KEYS=['leadTimeDays','safetyBufferDays','safetyStock','incoming','override','vcRecallInTransit','fbaRecallInTransit','fbfRecallInTransit'];
export function dynamicReorderPlan(product,savedRows,live){
 const eans=[...new Set((product.uniwareEans||[]).filter(value=>/^(?:\d{8}|\d{13})$/.test(value)))];
 const conflict=!!(live?.ean&&eans.length&&!eans.includes(live.ean));
 const ean=conflict?null:live?.ean||(eans.length===1?eans[0]:null);
 const saved=ean?savedRows.find(row=>row.ean===ean):null;
 const manual=key=>saved?.sources?.[key]==='Manual input';
 const settings={leadTimeDays:60,
  safetyBufferDays:saved?.safetyBufferDays??15,safetyStock:saved?.safetyStock??20,demandDays:45,
  incoming:manual('incoming')?saved.incoming:null,override:manual('override')?saved.override:null};
 const row={ean,asin:product.asin,productName:product.itemTitle||live?.productName||product.asin,
  brand:product.brand||live?.brand||'',vendorName:product.uniwareVendorName||null,revision:saved?.revision??0,...settings,
  ownStock:numeric(product.uniwareInventory)?product.uniwareInventory:null,
  vcSales45:conflict?null:live?.vcSales45??null,vcStock:conflict?null:live?.vcStock??null,
  vcInTransit:conflict?null:live?.vcInTransit??null,vcOpenPo:conflict?null:live?.vcOpenPo??null,
  fbaStock:numeric(live?.fbaStock)?live.fbaStock:numeric(product.fbaAvailable)?product.fbaAvailable:null,
  fbaSales45:live?.fbaSales45??null,fbaInTransit:live?.fbaInTransit??(numeric(product.fbaInbound)?product.fbaInbound:null),fbaOpenPo:null,fbfSales45:null,fbfStock:null,fbfInTransit:null,fbfOpenPo:null,
  vcRecallInTransit:manual('vcRecallInTransit')?saved.vcRecallInTransit:live?.vcRecallInTransit??null,
  fbaRecallInTransit:manual('fbaRecallInTransit')?saved.fbaRecallInTransit:null,
  fbfRecallInTransit:null,
  sources:{},matchError:conflict?'Vendor ASIN/EAN does not match the catalogue EAN.':null};
 for(const key of SETTING_KEYS)row.sources[key]=manual(key)?'Manual input':'Planning setting';
 row.sources.leadTimeDays='Fixed vendor lead time: 60 days';
 row.sources.fbaSales45=live?.fbaSource||'Seller Central FBA orders pending';
 row.sources.fbaInTransit='Seller Central FBA inbound working + shipped + receiving units';
 row.sources.fbaOpenPo='Seller Central FBA has no Vendor Central purchase orders; unavailable';
 row.sources.vendorName=product.uniwareVendorMessage||'Uniware vendor catalogue: matched EAN/SKU';
 row.sources.ownStock='Uniware API: ASIN catalogue EAN match';row.sources.fbaStock='Amazon Seller FBA inventory API';
 for(const key of ['vcStock'])row.sources[key]=`Vendor Central ${live?.inventoryDate||'report pending'}; ASIN ${product.asin}`;
 row.sources.vcOpenPo=`${live?.openPoSource||'Confirmed Manage PO items'}; refreshed ${live?.openPoAsOf||'pending'}; ASIN ${product.asin}`;
 row.sources.vcSales45=`Vendor Central ordered units: ${live?.salesStart||'pending'} to ${live?.salesEnd||'pending'}; ASIN ${product.asin}`;
 row.sources.vcInTransit=live?.vcTransitSource||`Vendor Central Data Kiosk ${live?.transitDate||'pending / unavailable'}; ASIN ${product.asin}`;
 return row;
}
export function planningSettingsPayload(row){
 return {ean:row.ean,productName:row.productName,brand:row.brand,revision:row.revision,
  ...Object.fromEntries(SETTING_KEYS.map(key=>[key,row[key]??null])),
  sources:Object.fromEntries(SETTING_KEYS.map(key=>[key,row.sources?.[key]||'Planning setting']))};
}
