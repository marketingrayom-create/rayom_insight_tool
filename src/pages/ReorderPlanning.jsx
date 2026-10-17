import React, {useEffect, useState} from 'react';
import {fetchReorderPlans, saveReorderPlan} from '../apiFile/amazonApi';
import {calculatePlan, INPUT_GROUPS, OUTPUTS, mergeLiveStock} from '../utils/reorderPlanning';
import './ReorderPlanning.css';

const display = value => typeof value === 'number' && Number.isFinite(value)
  ? value.toLocaleString('en-IN',{maximumFractionDigits:2}) : '—';
const summaryColumns = [['totalSales','45-day sales'],['networkStock','Network stock'],['stockCover','Cover days'],
  ['totalOpenPo','Open PO'],['totalDispatch','Suggested dispatch'],['recommended','Recommended order'],['finalOrder','Final order']];

export default function ReorderPlanning({organization,products=[]}) {
  const [rows,setRows]=useState([]), [selected,setSelected]=useState('');
  const [dirty,setDirty]=useState({}), [loading,setLoading]=useState(true), [saving,setSaving]=useState(false);
  const [message,setMessage]=useState(''), [error,setError]=useState('');
  const [newEan,setNewEan]=useState(''), [newName,setNewName]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    fetchReorderPlans(organization,controller.signal).then(result=>{
      if(controller.signal.aborted)return;
      setRows(result.rows);setSelected(result.rows[0]?.ean||'');setLoading(false);
    }).catch(err=>{if(!controller.signal.aborted){setError(err.message);setLoading(false);}});
    return ()=>controller.abort();
  },[organization]);
  const current=rows.find(row=>row.ean===selected);
  const change=(key,value)=>{
    setRows(previous=>previous.map(row=>row.ean===selected?{...row,[key]:value,sources:{...row.sources,[key]:'Manual input'}}:row));
    setDirty(previous=>({...previous,[selected]:true}));setMessage('');
  };
  const save=async()=>{
    setSaving(true);setError('');setMessage('');
    try {
      const result=await saveReorderPlan(organization,current);
      setRows(previous=>previous.map(row=>row.ean===current.ean?result.row:row));
      setDirty(previous=>({...previous,[current.ean]:false}));setMessage('Product settings saved.');
    } catch(err) {setError(err.message);} finally {setSaving(false);}
  };
  const useLive=()=>{
    const {row,matched}=mergeLiveStock(current,products);
    if(!matched){setError('No exact EAN match in the currently loaded product page. Load its page in Product Performance first.');return;}
    setRows(previous=>previous.map(item=>item.ean===row.ean?row:item));
    setDirty(previous=>({...previous,[row.ean]:true}));setError('');
    setMessage('Available live stock copied. Sales, in-transit, open PO and unmatched stock remain unchanged. Save to keep these inputs.');
  };
  const add=event=>{
    event.preventDefault();
    if(!/^(?:\d{8}|\d{13})$/.test(newEan)||!newName.trim()){setError('Enter an 8 or 13 digit EAN and product name.');return;}
    if(rows.some(row=>row.ean===newEan)){setSelected(newEan);setError('This EAN already has a plan.');return;}
    const row={ean:newEan,productName:newName.trim(),brand:organization==='linso'?'LINSO':organization==='rayom'?'Energizer':'Shelfesteem',
      leadTimeDays:60,safetyBufferDays:15,safetyStock:20,demandDays:30,revision:0,sources:{}};
    setRows(previous=>[...previous,row]);setSelected(newEan);setDirty(previous=>({...previous,[newEan]:true}));
    setNewEan('');setNewName('');setError('');
  };
  const exportCsv=()=>{
    const columns=[['ean','EAN'],['productName','Product'],['brand','Brand'],...INPUT_GROUPS.flatMap(([,fields])=>fields),...OUTPUTS];
    const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
    const text=[columns.map(([,label])=>quote(label)).join(','),...rows.map(row=>{
      const values={...row,...calculatePlan(row)};
      return columns.map(([key])=>quote(typeof values[key]==='string'&&/^[=+@-]/.test(values[key])?"'"+values[key]:values[key])).join(',');
    })].join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=`${organization}-reorder-plan.csv`;anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  if(loading)return <p role="status">Loading reorder plans…</p>;
  return <section className="reorder-planning" aria-label="Stock and reorder planning">
    <div className="reorder-heading"><div><h2>Stock & reorder planning</h2><p>Editable plans saved by company and EAN. Imported workbook values are a snapshot, not live sales or stock.</p></div>
      <button type="button" onClick={exportCsv} disabled={!rows.length}>Export planning CSV</button></div>
    <p className="reorder-method">Workbook logic: stock cover uses sales ÷ 45. Demand and recommended order use sales ÷ 30 by default; edit the demand divisor per product if needed. Negative results are retained. A manual override of 0 means order zero.</p>
    {error&&<p role="alert" className="reorder-error">{error}</p>}{message&&<p role="status">{message}</p>}
    <div className="reorder-scroll"><table><thead><tr><th>Product / EAN</th>{summaryColumns.map(([key,label])=><th key={key}>{label}</th>)}<th>Settings</th></tr></thead>
      <tbody>{rows.map(row=>{const values=calculatePlan(row);return <tr key={row.ean} className={selected===row.ean?'selected':''}>
        <th scope="row"><span className="reorder-product" title={row.productName}>{row.productName}</span><small>{row.ean}{dirty[row.ean]?' · Unsaved':''}</small></th>
        {summaryColumns.map(([key])=><td key={key}>{display(values[key])}</td>)}
        <td><button type="button" disabled={saving} onClick={()=>{setSelected(row.ean);setMessage('');setError('');}}>Edit</button></td></tr>;})}</tbody></table></div>
    {!rows.length&&<p>No saved plans for this company. Add a product below.</p>}
    {current&&<div className="reorder-editor"><div className="reorder-editor-heading"><div><h3>{current.productName}</h3><small>EAN {current.ean} · {current.brand}{dirty[current.ean]?' · Unsaved changes':''}</small></div>
      <div><button type="button" disabled={saving} onClick={useLive}>Use visible live stock</button><button type="button" disabled={saving||!dirty[current.ean]} onClick={save}>{saving?'Saving…':'Save product settings'}</button></div></div>
      <div className="reorder-inputs">{INPUT_GROUPS.map(([title,fields])=><fieldset key={title} disabled={saving}><legend>{title}</legend>
        {fields.map(([key,label,type])=><label key={key}>{label}<input aria-label={label} type={type||'number'} step={type?'any':'any'}
          min={type||key==='override'?undefined:key==='demandDays'?1:0} value={current[key]??''} placeholder={key==='override'?'Use recommended':undefined}
          onChange={event=>change(key,type?event.target.value:event.target.value===''?null:Number(event.target.value))}/>
          {current.sources?.[key]&&<small>{current.sources[key]}</small>}</label>)}</fieldset>)}</div>
      <div className="reorder-calculations">{OUTPUTS.map(([key,label])=><div key={key}><span>{label}</span><strong>{display(calculatePlan(current)[key])}</strong></div>)}</div>
      <p className="reorder-method">A dash means a required input is missing, or stock cover cannot be calculated with zero sales. Enter confirmed zeros where a channel has no stock/sales. Live stock uses exact EAN matches from the currently loaded product page; it never estimates missing 45-day sales.</p>
    </div>}
    <form className="reorder-add" onSubmit={add}><h3>Add product</h3><label>EAN<input value={newEan} onChange={e=>setNewEan(e.target.value.trim())} inputMode="numeric" required/></label>
      <label>Product name<input value={newName} onChange={e=>setNewName(e.target.value)} required/></label><button type="submit" disabled={saving}>Add planning row</button></form>
  </section>;
}
