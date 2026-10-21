import {inventoryTransitForProduct} from '../utils/inventoryTransit.js';
import React,{useEffect,useState} from 'react';
import {fetchReorderPlans,saveReorderPlan,fetchVendorReorder,fetchInventoryTransit} from '../apiFile/amazonApi';
import {calculatePlan,FORMULA_KEYS} from '../utils/reorderPlanning';
import './ReorderTable.css';
import {dynamicReorderPlan,planningSettingsPayload} from '../utils/dynamicReorder';

const WORKBOOK_COLUMNS=[["ean", "EAN"], ["brand", "Brand"], ["vendorName", "Vendor Name"], ["leadTimeDays", "Vendor Lead Time (Days)"], ["ownStock", "Own Warehouse Stock"], ["vcSales45", "VC Sales (Last 45 Days)"], ["vcStock", "VC Warehouse Stock"], ["vcInTransit", "VC Intransit Qty"], ["vcCover", "VC Stock Cover (Days)"], ["vcRecall", "VC Suggested Recall Qty (Above 60 Days)"], ["vcRecallInTransit", "VC Recall Intransit Qty"], ["vcOpenPo", "VC Open PO Qty"], ["vcDispatch", "VC Suggested PO Dispatch Qty"], ["fbaSales45", "FBA Sales (Last 45 Days)"], ["fbaStock", "FBA Warehouse Stock"], ["fbaInTransit", "FBA Intransit Qty"], ["fbaCover", "FBA Stock Cover (Days)"], ["fbaRecall", "FBA Suggested Recall Qty (Above 60 Days)"], ["fbaRecallInTransit", "FBA Recall Intransit Qty"], ["fbaOpenPo", "FBA Open PO Qty"], ["fbaDispatch", "FBA Suggested PO Dispatch Qty"], ["fbfSales45", "FBF Sales (Last 45 Days)"], ["fbfStock", "FBF Warehouse Stock"], ["fbfInTransit", "FBF Intransit Qty"], ["fbfCover", "FBF Stock Cover (Days)"], ["fbfRecall", "FBF Suggested Recall Qty (Above 60 Days)"], ["fbfRecallInTransit", "FBF Recall Intransit Qty"], ["fbfOpenPo", "FBF Open PO Qty"], ["fbfDispatch", "FBF Suggested PO Dispatch Qty"], ["totalSales", "Total Sales (Last 45 Days)"], ["networkStock", "Total Network Stock"], ["stockCover", "Current Stock Cover (Days)"], ["totalOpenPo", "Total Portal Open PO Qty"], ["totalDispatch", "Total Portal Suggested PO Dispatch Qty"], ["ownAfterDispatch", "Own Stock After Suggested PO Dispatch Qty"], ["safetyBufferDays", "Extra Safety Buffer (Days)"], ["targetCover", "Target Cover (Days)"], ["safetyStock", "Safety Stock (Units)"], ["incoming", "Incoming Qty From Vendor"], ["leadDemand", "Lead-Time Demand (60 Days)"], ["recommended", "Recommended Order Qty"], ["override", "Manual Override Qty"], ["finalOrder", "Final Order Qty"]];
export const PLANNING_COLUMNS=WORKBOOK_COLUMNS.filter(([key])=>!key.startsWith('fbf'));
const editable=new Set(['safetyBufferDays','safetyStock','incoming','override','vcRecallInTransit','fbaRecallInTransit','fbfRecallInTransit']);
const textKeys=new Set(['ean','brand','vendorName','recall']);
const display=value=>typeof value==='number'?value.toLocaleString('en-IN',{maximumFractionDigits:2}):value??'—';

export function useReorderTable(organization,products=[]){
 const [state,setState]=useState({organization,rows:[],dirty:{},saving:{},message:''});
 useEffect(()=>{
  const controller=new AbortController();
  setState({organization,rows:[],dirty:{},saving:{},message:'Loading planning columns…'});
  fetchReorderPlans(organization,controller.signal).then(result=>{
   if(!controller.signal.aborted)setState({organization,rows:result.rows,dirty:{},saving:{},message:''});
  }).catch(error=>{if(!controller.signal.aborted)setState(current=>({...current,message:error.message}));});
  return()=>controller.abort();
 },[organization]);
 const [live,setLive]=useState({organization,inventory:{},message:''});
 const asinsKey=JSON.stringify([...new Set(products.map(row=>row.asin).filter(Boolean))].sort());
 const identifiersKey=JSON.stringify(products.map(row=>[row.asin,row.uniwareEans,row.sellerSku,row.sku,row.sellerSkus]));
 useEffect(()=>{
  const controller=new AbortController();let timer;
  setLive({organization,inventory:{},message:'Loading ASIN-specific Vendor Central reports…'});
  const asins=JSON.parse(asinsKey);
  if(!asins.length)return()=>controller.abort();
  const load=async()=>{
   try{
    const [vendorResult,transitResult]=await Promise.allSettled([fetchVendorReorder(organization,asins,controller.signal),['rayom','linso'].includes(organization)?fetchInventoryTransit(organization,controller.signal):Promise.resolve(null)]);
    const result=vendorResult.status==='fulfilled'?vendorResult.value:{inventory:{},pending:true,message:vendorResult.reason.message};
    if(['rayom','linso'].includes(organization)){
     const report=transitResult.status==='fulfilled'?transitResult.value:null;
     result.inventory={...result.inventory};
     for(const product of products)result.inventory[product.asin]={...result.inventory[product.asin],...inventoryTransitForProduct(product,report)};
     const missing=report?.shipments?.some(row=>row.quantityMatchesItems!==true);
     const message=transitResult.status==='rejected'?transitResult.reason.message:missing?'VC Intransit: Inventory Master has shipments but matching Merge product lines are missing or do not reconcile. Product quantities remain unavailable.':'';
     result.message=[result.message,message].filter(Boolean).join(' ');
    }
    if(controller.signal.aborted)return;
    setLive({organization,inventory:result.inventory,message:result.message|| (result.pending?'Vendor Central reports are preparing; incomplete fields stay blank.':'')});
    timer=setTimeout(load,result.pending?15000:60000);
   }catch(error){if(!controller.signal.aborted){setLive({organization,inventory:{},message:error.message});timer=setTimeout(load,60000);}}
  };
  load();return()=>{controller.abort();clearTimeout(timer);};
 },[organization,asinsKey,identifiersKey]);
 const change=(ean,key,value,base)=>setState(current=>({...current,message:'',dirty:{...current.dirty,[ean]:true},
  rows:(current.rows.some(row=>row.ean===ean)?current.rows:[...current.rows,planningSettingsPayload(base)]).map(row=>row.ean===ean?{...row,[key]:value,sources:{...row.sources,[key]:'Manual input'}}:row)}));
 const save=async(ean,base)=>{
  const row=planningSettingsPayload(base);
  setState(current=>({...current,saving:{...current.saving,[ean]:true},message:''}));
  try{
   const result=await saveReorderPlan(organization,row);
   setState(current=>current.organization!==organization?current:{...current,rows:current.rows.map(item=>item.ean===ean?result.row:item),
    dirty:{...current.dirty,[ean]:false},saving:{...current.saving,[ean]:false},message:`Settings saved for EAN ${ean}.`});
  }catch(error){setState(current=>current.organization!==organization?current:{...current,saving:{...current.saving,[ean]:false},message:error.message});}
 };
 return {state:state.organization===organization?state:{rows:[],dirty:{},saving:{},message:'Loading planning columns…'},change,save,live:live.organization===organization?live:{inventory:{},message:'Loading Vendor Central reports…'}};
}

export function ReorderHeaders(){return <>{PLANNING_COLUMNS.map(([key,label])=><th key={key} className={`planning-column-header ${FORMULA_KEYS.has(key)?'planning-formula-header':''}`} title={FORMULA_KEYS.has(key)?'Calculated from live inputs using the recall workbook formula':undefined}>{label}</th>)}</>;}

export function ReorderCells({product,planning}){
 const plan=dynamicReorderPlan(product,planning.state.rows,planning.live.inventory[product.asin]);
 const values={...plan,...calculatePlan(plan)};
 return <>{PLANNING_COLUMNS.map(([key,label])=><td key={key} className={`planning-column ${key==='finalOrder'?'planning-final':''}`}
  title={plan.matchError||plan.sources?.[key]||'Calculated from available reported data and planning settings; missing sources are excluded from totals'}>
  {plan&&editable.has(key)?<input type="number" step="any" min={key==='override'?undefined:key==='demandDays'?1:0}
    aria-label={`${label} for ${plan.ean}`} value={plan[key]??''} disabled={!plan.ean||planning.state.saving[plan.ean]}
    placeholder={key==='override'?'Auto':key==='incoming'?'Not entered':'—'} onChange={event=>planning.change(plan.ean,key,event.target.value===''?null:Number(event.target.value),plan)}/>
    :textKeys.has(key)?values[key]||'—':display(values[key])}
 </td>)}</>;
}

export function ReorderSaveButton({planning}){
 const dirty=planning.state.rows.filter(row=>planning.state.dirty[row.ean]);
 const saving=Object.values(planning.state.saving).some(Boolean);
 return <button type="button" disabled={!dirty.length||saving} onClick={async()=>{
  for(const row of dirty)await planning.save(row.ean,row);
 }}>{saving?'Saving…':'Save changes'}</button>;
}
