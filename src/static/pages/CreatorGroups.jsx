import { useEffect, useState } from 'react';
import { PageHeading, Button, Icon, Modal, EmptyState } from '../components/UI';
import './CreatorGroups.css';

export default function CreatorGroups({ organization }) {
 const [groups,setGroups]=useState([]);
 const [loading,setLoading]=useState(true);
 const [selected,setSelected]=useState(null);
 const [modal,setModal]=useState(null);
 const [query,setQuery]=useState('');
 const [ascending,setAscending]=useState(true);
 const [name,setName]=useState('');
 const [platform,setPlatform]=useState('Instagram');
 const [description,setDescription]=useState('');
 const [error,setError]=useState('');
 const [summary,setSummary]=useState(true);
 const [metric,setMetric]=useState('Median');
 const key=`linso.creatorGroups.${organization}`;
 useEffect(()=>{
  setLoading(true);setSelected(null);setModal(null);setError('');setGroups([]);
  let stored=[];
  try {const value=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(value))stored=value;}catch{}
  const timer=setTimeout(()=>{setGroups(stored);setLoading(false);},600);
  return ()=>clearTimeout(timer);
 },[key]);
 const openCreate=()=>{setName('');setDescription('');setPlatform('Instagram');setError('');setModal('create');};
 const create=e=>{
  e.preventDefault();const trimmed=name.trim();
  if(!trimmed){setError('Enter a list name.');return;}
  if(groups.some(g=>g.name.toLowerCase()===trimmed.toLowerCase())){setError('A list with this name already exists.');return;}
  const group={id:crypto.randomUUID(),name:trimmed,platform,description:description.trim(),createdAt:new Date().toISOString(),creators:[]};
  const next=[...groups,group];
  try{localStorage.setItem(key,JSON.stringify(next));}catch{setError('Unable to save the list. Please check browser storage and try again.');return;}
  setGroups(next);setSelected(group.id);setModal(null);
 };
 const current=groups.find(g=>g.id===selected);
 const matches=groups.filter(g=>g.name.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>ascending?a.name.localeCompare(b.name):b.name.localeCompare(a.name));
 return <div className="creator-groups-page">
  <PageHeading title="Creator Groups" subtitle="Organize and manage your creator groups"/>
  <div className="card groups-toolbar"><button className="groups-select" disabled={loading} onClick={()=>{setQuery('');setModal('select');}}>{current?.name||'Select Group'}<Icon name="ChevronDown"/></button>{groups.length>0&&!loading&&<Button primary icon="Plus" onClick={openCreate}>Create a list</Button>}</div>
  <section className="card groups-summary" aria-busy={loading}>
   <div className="groups-summary-heading"><div><h3>Expected Metrics Summary</h3><p>Aggregated metrics calculated across matching creators in group</p></div><div className="groups-summary-actions"><div className="groups-segments">{['Median','Average'].map(v=><button key={v} className={metric===v?'chosen':''} onClick={()=>setMetric(v)}>{v}</button>)}</div><button className="icon-button" aria-label={summary?'Collapse metrics':'Expand metrics'} onClick={()=>setSummary(!summary)}><Icon name="ChevronDown" style={{transform:summary?'rotate(180deg)':'none'}}/></button></div></div>
   {summary&&<div className="groups-metrics">{['Total Reach','Engagement','Ratios'].map(label=><div className="groups-metric" key={label}><span>{label}</span>{loading?<div className="groups-skeleton"/>:<div className="groups-metric-empty"><strong>—</strong><small>{current?'No creator metrics yet':'Select a group to view metrics'}</small></div>}</div>)}</div>}
  </section>
  <section className="card groups-content" aria-busy={loading}>
   {loading?<div role="status" aria-label="Loading creator groups" className="groups-loading">{[1,2,3].map(i=><div key={i} className="groups-skeleton groups-skeleton-row"/>)}</div>:groups.length===0?<EmptyState icon="List" title="No creator lists yet" description="Create your first list to start organizing creators." action={<Button primary onClick={openCreate}>Create a list</Button>}/>:<><div className="groups-list-heading"><h3>Your creator groups</h3><span>{groups.length} {groups.length===1?'list':'lists'}</span></div><div className="table-scroll"><table className="groups-table"><thead><tr><th>Group name</th><th>Platform</th><th>Creators</th><th>Created</th><th/></tr></thead><tbody>{groups.map(g=><tr key={g.id} className={selected===g.id?'selected':''}><td><strong>{g.name}</strong>{g.description&&<small>{g.description}</small>}</td><td>{g.platform}</td><td>{g.creators.length}</td><td>{new Date(g.createdAt).toLocaleDateString()}</td><td><Button onClick={()=>setSelected(g.id)}>View group</Button></td></tr>)}</tbody></table></div>{current&&<div className="groups-selected-detail"><h3>{current.name}</h3><p>No creators in this group yet.</p></div>}</>}
  </section>
  {modal==='select'&&<Modal title="Select group" onClose={()=>setModal(null)} footer={<button className="groups-create-link" onClick={openCreate}><Icon name="Plus"/> Create a list</button>}><div className="groups-search"><Icon name="Search"/><input aria-label="Search groups" placeholder="Search groups…" value={query} onChange={e=>setQuery(e.target.value)}/><button className="icon-button" aria-label="Reverse group sort order" onClick={()=>setAscending(!ascending)}>↕</button></div><p className="groups-count">{matches.length} lists</p><div className="groups-picker-list">{matches.map(g=><button key={g.id} onClick={()=>{setSelected(g.id);setModal(null);}} className={selected===g.id?'selected':''}>{g.name}<small>{g.platform}</small></button>)}{matches.length===0&&<p>No groups found</p>}</div></Modal>}
  {modal==='create'&&<Modal title="Create a list" onClose={()=>setModal(null)}><form className="groups-form" onSubmit={create}><label>List name<input autoFocus required maxLength={100} placeholder="Enter list name" value={name} onChange={e=>setName(e.target.value)}/></label><label>Platform<select value={platform} onChange={e=>setPlatform(e.target.value)}><option>Instagram</option><option>YouTube</option></select></label><label>Description (optional)<textarea rows={3} maxLength={1000} placeholder="Describe your creator group" value={description} onChange={e=>setDescription(e.target.value)}/></label>{error&&<p role="alert" className="groups-form-error">{error}</p>}<div className="groups-form-actions"><Button type="button" onClick={()=>setModal(null)}>Cancel</Button><Button primary type="submit">Create list</Button></div></form></Modal>}
 </div>;
}
