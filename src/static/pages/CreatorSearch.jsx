import { createContext, useContext, useEffect, useState } from 'react';
import { PageHeading, Button, Icon } from '../components/UI';
import './CreatorSearch.css';
const empty = { minFollowers: '', maxFollowers: '', country: '', gender: '', query: '', audienceCountry: '', audienceGender: '', verified: false, sponsored: false };
const bands = [['Nano', 0, 10000, '0 – 10K'], ['Micro', 10001, 100000, '10K – 100K'], ['Macro', 100001, 500000, '100K – 500K'], ['Mega', 500001, '', '500K+']];
const countries = [['IN','India'],['US','United States'],['GB','United Kingdom'],['AE','United Arab Emirates'],['CA','Canada'],['AU','Australia']];
const FilterContext = createContext(null);
const options = {
 'Creator language':['Hindi','English','Punjabi','Marathi','Bengali','Tamil','Telugu','Gujarati'],
 'Audience language':['Hindi','English','Punjabi','Marathi','Bengali','Tamil','Telugu','Gujarati'],
 'Last posted':['Last 7 days','Last 30 days','Last 90 days'],
 'Categories':['Beauty','Fashion','Lifestyle','Fitness','Travel','Food','Technology','Parenting','Entertainment'],
 'Interests':['Skincare','Makeup','Fashion','Fitness','Travel','Food','Technology','Gaming'],
 'Audience interests':['Skincare','Makeup','Fashion','Fitness','Travel','Food','Technology','Gaming'],
 'Creator age buckets':['13–18','18–25','25–35','35–45','45–65','65+'],
 'Audience age buckets':['18–24','25–34','35–44','45–64','65+'],
 'Audience Data Basis':['Followers','Engagers'],
};
function FilterSelect({label, value, values, multiple=false, onChange}) {
 const [open,setOpen]=useState(false);
 const [search,setSearch]=useState('');
 const picked = multiple ? value || [] : value ? [value] : [];
 return <div className="filter-picker">
  <button className="filter-picker-trigger" aria-label={label} aria-expanded={open} onClick={()=>setOpen(!open)}>{picked.length && !multiple ? picked[0] : label}<Icon name={['Categories','Interests','Last posted'].includes(label)?'ChevronDown':'Search'} size={17}/></button>
  {open && <div className="filter-picker-menu"><input aria-label={`Search ${label}`} placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/>{!multiple && <button onClick={()=>{onChange(undefined);setOpen(false);}}>Any</button>}{values.filter(v=>v.toLowerCase().includes(search.toLowerCase())).map(v=><button key={v} className={picked.includes(v)?'chosen':''} onClick={()=>{onChange(multiple?(picked.includes(v)?picked.filter(x=>x!==v):[...picked,v]):v);if(!multiple)setOpen(false);}}>{v}{picked.includes(v)?' ✓':''}</button>)}</div>}
  {multiple && picked.length>0 && <div className="filter-value-chips">{picked.map(v=><button key={v} onClick={()=>onChange(picked.filter(x=>x!==v))}>{v} ×</button>)}</div>}
 </div>;
}
function Unavailable({ label, type = 'text' }) {
 const {extra, update} = useContext(FilterContext);
 const value = extra[label];
 const multi = ['Creator age buckets','Audience age buckets','Categories','Interests','Audience interests'].includes(label);
 let control;
 if (label === 'Has Audience Data') control = <input type="checkbox" role="switch" aria-label={label} checked={!!value} onChange={e=>update(label,e.target.checked || undefined)}/>;
 else if (type === 'range') {
  const range = value || {min:0,max:label==='Reels Plays'?1000000:100};
  const max = label==='Reels Plays'?1000000:100;
  const unit = label==='Reels Plays'?'':'%';
    const growth = label==='Follower growth';
  const credibility = label==='Audience Credibility';
  control = <><div className="range-caption">{value ? `${growth || credibility ? '≥ ' : ''}${range.min}${unit}${growth || credibility?'':` – ${range.max}${unit}`}` : growth?'≥ 0%':'Any'}</div><div className={growth?'growth-controls':''}><div className="dual-range"><div className="range-track"/><input aria-label={`${label} min`} type="range" min="0" max={max} step={label==='Reels Plays'?1000:0.1} value={range.min} onChange={e=>update(label,{...range,min:Number(e.target.value),max:Math.max(range.max,Number(e.target.value))})}/>{!growth && !credibility && <input aria-label={`${label} max`} type="range" min="0" max={max} step={label==='Reels Plays'?1000:0.1} value={range.max} onChange={e=>update(label,{...range,max:Number(e.target.value),min:Math.min(range.min,Number(e.target.value))})}/>}</div>{growth && <label className="growth-period"><span>Period</span><select aria-label="Follower growth period" value={extra['Growth period'] || '1 month'} onChange={e=>update('Growth period',e.target.value)}>{['1 month','3 months','6 months'].map(v=><option key={v}>{v}</option>)}</select></label>}</div></>;

 } else if (label.includes('age buckets') || label==='Audience Data Basis') control = <div className="creator-segments age-buckets">{[...(multi?[]:['Any']),...options[label]].map(v=><button key={v} className={(multi?(value || []).includes(v):(value || 'Any')===v)?'chosen':''} onClick={()=>update(label,multi?((value || []).includes(v)?value.filter(x=>x!==v):[...(value || []),v]):v==='Any'?undefined:v)}>{v}</button>)}</div>;
 else if (options[label]) control = <FilterSelect label={label} value={value} values={options[label]} multiple={multi} onChange={v=>update(label,v)}/>;
 else control = <input aria-label={label} placeholder={label} value={value || ''} onChange={e=>update(label,e.target.value || undefined)}/>;
 return <div className="creator-field"><span>{label}</span>{control}</div>;
}
export default function CreatorSearch({ organization }) {
 const storageKey = `linso.creatorFilters.${organization}`;
 const [filters, setFilters] = useState(() => {try {return {...empty,...JSON.parse(localStorage.getItem(storageKey) || '{}').filters};} catch {return empty;}});
 const [extra, setExtra] = useState(() => {try {return JSON.parse(localStorage.getItem(storageKey) || '{}').extra || {};} catch {return {};}});
 const update = (label,value) => {setExtra(e=>({...e,[label]:value}));setCursor(null);};
 const activeExtra = Object.entries(extra).filter(([,v])=>v!==undefined && v!==false && v!=='' && (!Array.isArray(v) || v.length));
 useEffect(()=>{try {localStorage.setItem(storageKey,JSON.stringify({filters,extra}));}catch{}},[storageKey,filters,extra]);
 const [segment, setSegment] = useState(() => bands.find(([,min,max])=>filters.minFollowers===min && filters.maxFollowers===max)?.[0] || (filters.minFollowers!=='' || filters.maxFollowers!=='' ? 'Other' : ''));
 const [platform, setPlatform] = useState('Instagram');
 const [rows, setRows] = useState([]);
 const [error, setError] = useState('');
 const [loading, setLoading] = useState(false);
 const [after, setAfter] = useState(null);
 const [cursor, setCursor] = useState(null);
 const [selected, setSelected] = useState([]);
 const [retry, setRetry] = useState(0);
 const payload = JSON.stringify(filters);
 const change = (key, value) => { setFilters(f => ({...f,[key]:value})); setCursor(null); setSelected([]); };
 useEffect(() => {
  const controller = new AbortController();
  setRows([]); setAfter(null); setError(''); setLoading(true);
  const deadline = setTimeout(() => {
   controller.abort();
   setRows([]); setAfter(null); setError('Creator search timed out. Please retry.'); setLoading(false);
  }, 20000);
  const timer = setTimeout(async () => {
   try {
    const response = await fetch('/meta-api/creators/search', { method:'POST', headers:{'Content-Type':'application/json'}, signal:controller.signal,
     body:JSON.stringify({organization,platform,filters:JSON.parse(payload),after:cursor}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to search creators.');
    if (!controller.signal.aborted) { setRows(result.rows || []); setAfter(result.after); }
   } catch(e) { if (!controller.signal.aborted) setError(e.message); }
   finally { if (!controller.signal.aborted) { clearTimeout(deadline); setLoading(false); } }
  }, 450);
  return () => {clearTimeout(timer);clearTimeout(deadline);controller.abort();};
 },[organization,platform,payload,cursor,retry]);
 const country = (key,label) => <div className="creator-field"><FilterSelect label={label} value={countries.find(([code])=>code===filters[key])?.[1]} values={countries.map(([,name])=>name)} onChange={name=>change(key,countries.find(([,n])=>n===name)?.[0] || '')}/>{filters[key] && <div className="filter-value-chips"><button onClick={()=>change(key,'')}>{countries.find(([c])=>c===filters[key])?.[1]} ×</button></div>}</div>;
 const gender = (key,label,any=true) => <div className="creator-field"><span>{label}</span><div className="creator-segments">{[...(any ? [['','Any']] : [['','Any']]),['male','Male'],['female','Female']].map(([value,name])=><button key={value} className={filters[key]===value?'chosen':''} onClick={()=>change(key,value)}>{name}</button>)}</div></div>;
 const clear = () => {setFilters(empty);setExtra({});setSegment('');setCursor(null);setSelected([]);};
 const chips = Object.entries(filters).filter(([,v])=>v!=='' && v!==false).map(([key,value])=>({key,label: `${({minFollowers:'Min followers',maxFollowers:'Max followers',country:'Creator location',audienceCountry:'Audience location',gender:'Creator gender',audienceGender:'Audience gender',query:'Bio / Name',verified:'Verified profiles',sponsored:'Sponsored posts'})[key]}: ${value===true?'Yes':countries.find(([c])=>c===value)?.[1] || value}`}));
 return <FilterContext.Provider value={{extra,update}}><>
  <PageHeading title="Search creators" subtitle="Search and evaluate creators with filters tailored to your brief" />
  <div className="creator-search-layout">
   <aside className="card creator-search-filters">
    <div className="creator-segments platform-tabs">{['Instagram','YouTube','TikTok'].map(p=><button key={p} className={platform===p?'chosen':''} onClick={()=>{setPlatform(p);setCursor(null);}}>{p}</button>)}</div>
    <section className="creator-filter-section"><h3><Icon name="TrendingUp" size={16}/> Creator Performance</h3>
     <p>Followers</p><div className="follower-bands">{bands.map(([name,min,max,range])=><button key={name} className={segment===name?'chosen':''} onClick={()=>{setSegment(name);setFilters(f=>({...f,minFollowers:min,maxFollowers:max}));setCursor(null);}}><b>{name}</b><small>{range}</small></button>)}</div>
     <button className="custom-followers" onClick={()=>setSegment('Other')}>Other (custom)</button>
     {segment==='Other' && <div className="creator-number-range">{['minFollowers','maxFollowers'].map(key=><input key={key} type="number" min="0" aria-label={key} placeholder={key==='minFollowers'?'Minimum':'Maximum'} value={filters[key]} onChange={e=>change(key,e.target.value===''?'':Number(e.target.value))}/>)}</div>}
     <Unavailable label="Follower growth" type="range"><div className="creator-number-range"><input type="range" disabled defaultValue="0"/><select disabled><option>1 month</option><option>3 months</option><option>6 months</option></select></div></Unavailable>
     <Unavailable label="Engagement rate" type="range"/>
     <Unavailable label="Reels Plays" type="range"/>
     <Unavailable label="Last posted"><select disabled><option>Anytime</option></select></Unavailable>
    </section>
    <section className="creator-filter-section"><h3><Icon name="Users" size={16}/> Creator Persona</h3>
     {country('country','Creator locations')}
     <Unavailable label="Creator language"/>
     <label className="creator-field"><span>Bio/Name</span><input value={filters.query} placeholder="Bio/Name" onChange={e=>change('query',e.target.value)}/></label>
     {gender('gender','Creator gender')}
     <Unavailable label="Creator age buckets"><div className="creator-segments age-buckets">{['13–18','18–25','25–35','35–45','45–65','65+'].map(a=><button disabled key={a}>{a}</button>)}</div></Unavailable>
     <Unavailable label="Categories"><select disabled><option>Categories</option></select></Unavailable>
     <Unavailable label="Interests"><select disabled><option>Interests</option></select></Unavailable>
     <label className="creator-check"><input type="checkbox" role="switch" checked={filters.sponsored} onChange={e=>change('sponsored',e.target.checked)}/>Has sponsored posts</label>
     <label className="creator-check"><input type="checkbox" role="switch" checked={filters.verified} onChange={e=>change('verified',e.target.checked)}/>Verified profiles only</label>
     <h4>Content filters</h4>{['Keyword / Brand','Mentions','Hashtags'].map(label=><Unavailable key={label} label={label}/>)}
     <h4>Similarity search</h4><Unavailable label="Audience similarity"/>
    </section>
    <section className="creator-filter-section"><h3><Icon name="Users" size={16}/> Target Audience</h3>
     {country('audienceCountry','Audience locations')}
     {['Audience language','Brand affinity','Audience interests'].map(label=><Unavailable key={label} label={label}/>)}
     {gender('audienceGender','Audience gender')}
     <Unavailable label="Audience age buckets"><div className="creator-segments age-buckets">{['18–24','25–34','35–44','45–64','65+'].map(a=><button disabled key={a}>{a}</button>)}</div></Unavailable>
     <Unavailable label="Audience Credibility" type="range"/>
    </section>
    <Unavailable label="Has Audience Data"><input disabled type="checkbox"/></Unavailable>
    <Unavailable label="Audience Data Basis"><div className="creator-segments">{['Any','Followers','Engagers'].map(v=><button disabled key={v}>{v}</button>)}</div></Unavailable>
   </aside>
   <section className="card creator-search-results">
    <div className="creator-active-filters"><b>Active filters</b>{activeExtra.map(([label,value])=><button key={label} onClick={()=>update(label,undefined)}>{label}: {Array.isArray(value)?value.join(", "):typeof value==="object"?`${value.min} – ${value.max}`:value===true?"Yes":value} ×</button>)}{chips.map(chip=><button key={chip.key} onClick={()=>{change(chip.key,typeof filters[chip.key]==='boolean'?false:'');if(chip.key.includes('Followers'))setSegment('Other');}}>{chip.label} ×</button>)}<button onClick={clear}>Clear all</button><Button onClick={()=>setRetry(r=>r+1)}>Refresh</Button></div>
    <div className="creator-source">Meta Creator Marketplace · {organization==='linso'?'Rayom Linso':organization==='rayom'?'Rayom Business Case':'Shelfesteem'}<br/>Search checks the selected company’s Meta account access.</div>
    {activeExtra.length > 0 && <div className="creator-source" role="status">Saved filters not applied by this Meta integration: {activeExtra.map(([label])=>label).join(', ')}. Search uses the supported filters above; remove saved filters with × or Clear all.</div>}
    {error && <div role="alert" className="creator-search-error">{error}</div>}
    <div className="table-scroll"><table className="creator-search-table"><thead><tr><th></th><th>Creator</th><th>Followers</th><th>Engagement</th><th>Avg. likes</th><th>Actions</th></tr></thead><tbody>
     {rows.map(row=><tr key={row.id}><td><input type="checkbox" aria-label={`Select ${row.username}`} checked={selected.includes(row.id)} onChange={()=>setSelected(s=>s.includes(row.id)?s.filter(id=>id!==row.id):[...s,row.id])}/></td><td><div className="profile">{row.profile_picture_url && <img src={row.profile_picture_url} alt="" width="42" height="42"/>}<div><strong>{row.username || row.id}{row.is_account_verified && ' ✓'}</strong><small>{row.biography || '—'}</small><small>{countries.find(([c])=>c===row.country)?.[1] || row.country || '—'}</small></div></div></td><td>{row.followers_count ?? '—'}</td><td>{row.engagement_rate ?? '—'}</td><td>{row.average_likes ?? '—'}</td><td>{row.username && <a href={`https://www.instagram.com/${encodeURIComponent(row.username)}/`} target="_blank" rel="noreferrer">View profile</a>}</td></tr>)}
    </tbody></table></div>
    {loading ? <div className="creator-status creator-loading" role="status" aria-live="polite"><span className="creator-spinner" aria-hidden="true"/><span>Loading creators…</span></div> : !rows.length && !error ? <p className="creator-status" role="status">No results found</p> : null}
    <div className="creator-pagination"><span>{rows.length} creators on this page · {selected.length} selected</span>{cursor && <Button onClick={()=>setCursor(null)}>First page</Button>}<Button disabled={!after || loading} onClick={()=>{setCursor(after);setSelected([]);}}>Next page</Button></div>
   </section>
  </div>
 </></FilterContext.Provider>;
}
