import { useEffect, useRef, useState } from 'react';
import { Button, PageHeading, Search, Select, Toggle, Modal, DataTable } from '../components/UI';
import './InfluencerCampaigns.css';
const objectives = [['OUTCOME_AWARENESS', 'Awareness'], ['OUTCOME_ENGAGEMENT', 'Engagement'], ['OUTCOME_TRAFFIC', 'Traffic'], ['OUTCOME_SALES', 'Sales'], ['OUTCOME_LEADS', 'Leads'], ['OUTCOME_APP_PROMOTION', 'App Promotion']];
async function write(path, payload, requestId) {
 const response = await fetch(`/meta-api/campaigns${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(requestId ? { 'Idempotency-Key': requestId } : {}) }, body: JSON.stringify(payload) });
 const result = await response.json();
 if (!response.ok) { const error = new Error(result.error || 'Meta request failed.'); error.uncertain = result.uncertain; throw error; }
 return result;
}
function CreateForm({ organization, company, onClose, onCreated }) {
 const [form, setForm] = useState({ organization, brand: organization, name: '', description: '', start_date: '', end_date: '', refresh_frequency: '24', financial_arrangement: 'Paid', objective: '', status: 'PAUSED', special_ad_categories: [] });
 const [tags, setTags] = useState([]), [tagInput, setTagInput] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
 const requestId = useRef(crypto.randomUUID());
 const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
 const commitTags = () => { const incoming = tagInput.split(/[,\s]+/).map(tag => tag.replace(/^#/, '').trim()).filter(Boolean); const next = [...new Set([...tags, ...incoming])]; setTags(next); setTagInput(''); return next; };
 async function submit(event) {
  event.preventDefault(); if (busy) return;
  const hashtags = commitTags();
  if (!hashtags.length) { setError('Add at least one hashtag.'); return; }
  if (form.end_date < form.start_date) { setError('End date must be on or after start date.'); return; }
  setBusy(true); setError('');
  try { const result = await write('', { ...form, hashtags }, requestId.current); onCreated({ ...result, objective: form.objective, effective_status: form.status, created_time: new Date().toISOString() }); onClose(); }
  catch (failure) { setError(failure.message); if (!failure.uncertain) requestId.current = crypto.randomUUID(); }
  finally { setBusy(false); }
 }
 return <div className="ic-create"><Modal title="Create Campaign" onClose={() => { if (!busy) onClose(); }}>
  <form onSubmit={submit} className="ic-form"><fieldset disabled={busy}>
   <label>Hashtags<div className="ic-tags">{tags.map(tag => <span key={tag}>#{tag}<button type="button" aria-label={`Remove ${tag}`} onClick={() => setTags(tags.filter(value => value !== tag))}>×</button></span>)}<input aria-label="Hashtags" placeholder="Type and press Enter or comma" value={tagInput} onChange={event => setTagInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); commitTags(); } }} onBlur={commitTags} /></div></label><p className="ic-help">Add at least one hashtag for campaign tracking.</p>
   <div className="ic-form-grid"><label>Campaign dates <em>*</em><div className="ic-date-range"><input aria-label="Campaign start date" type="date" required value={form.start_date} onChange={e => change('start_date', e.target.value)} /><span>–</span><input aria-label="Campaign end date" type="date" required min={form.start_date} value={form.end_date} onChange={e => change('end_date', e.target.value)} /></div></label><label>Brand <em>*</em><select required value={form.brand} onChange={e => change('brand', e.target.value)}><option value={organization}>{company}</option></select></label></div>
   <label>Campaign Name <em>*</em><input required maxLength={200} value={form.name} onChange={e => change('name', e.target.value)} /></label>
   <label>Description<textarea maxLength={5000} rows={4} value={form.description} onChange={e => change('description', e.target.value)} /></label>
   <div className="ic-form-grid"><label>Refresh Frequency<select value={form.refresh_frequency} onChange={e => change('refresh_frequency', e.target.value)}>{['24','12','6'].map(value => <option key={value} value={value}>Every {value} hours</option>)}</select></label><label>Financial Arrangement<select value={form.financial_arrangement} onChange={e => change('financial_arrangement', e.target.value)}>{['Paid','Barter','Unpaid'].map(value => <option key={value}>{value}</option>)}</select></label></div>
   <div className="ic-form-grid"><label>Meta Objective <em>*</em><select required value={form.objective} onChange={e => change('objective', e.target.value)}><option value="">Select objective</option>{objectives.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Meta Campaign Status<select value={form.status} onChange={e => change('status', e.target.value)}><option value="PAUSED">Paused</option><option value="ACTIVE">Active</option></select></label></div>
   <label>Special Ad Category<select value={form.special_ad_categories[0] || ''} onChange={e => change('special_ad_categories', e.target.value ? [e.target.value] : [])}><option value="">None</option>{['HOUSING','EMPLOYMENT','CREDIT','ISSUES_ELECTIONS_POLITICS'].map(value => <option key={value}>{value}</option>)}</select></label>
   <p className="ic-help">Creates a {form.status === 'ACTIVE' ? 'active' : 'paused'} campaign in {company}’s Meta Ads Manager. Add ad sets and ads in Meta to run it. Campaign dates, hashtags and arrangement are saved here for tracking; dates do not schedule ads. Refresh frequency is a saved preference; automatic post detection is not enabled.</p>
   {error && <p className="ic-error" role="alert">{error}</p>}
   <div className="ic-form-actions"><Button type="button" onClick={onClose}>Cancel</Button><Button primary type="submit">{busy ? 'Creating…' : `Create ${form.status === 'ACTIVE' ? 'Active' : 'Paused'} Campaign`}</Button></div>
  </fieldset></form>
 </Modal></div>;
}
export default function InfluencerCampaigns({ state, scope, company, organization, onRefresh, onMore, onCreated, onStatusChanged }) {
 const [query, setQuery] = useState(''), [filters, setFilters] = useState({}), [drafts, setDrafts] = useState(false), [archived, setArchived] = useState(false), [modal, setModal] = useState(false), [page, setPage] = useState(1), [limit, setLimit] = useState(10), [error, setError] = useState(''), [changing, setChanging] = useState('');
 useEffect(() => { setPage(1); }, [query, filters, drafts, archived, limit]);
 const rows = (state.scope === scope ? state.rows : []).filter(row => {
  const status = row.status || row.effective_status;
  return (archived || !['ARCHIVED','DELETED'].includes(status)) && (drafts || status !== 'DRAFT') && `${row.name} ${company} ${(row.tracking?.hashtags || []).join(' ')}`.toLowerCase().includes(query.toLowerCase()) && (!filters.Status || status === filters.Status) && (!filters.Brand || filters.Brand === company) && (!filters.Arrangement || row.tracking?.financial_arrangement === filters.Arrangement);
 });
 const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / limit)));
 const visible = rows.slice((currentPage - 1) * limit, currentPage * limit);
 async function changeStatus(row) {
  const target = row.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'; setChanging(row.id); setError('');
  try { await write(`/${row.id}/status`, { organization, status: target }); onStatusChanged(row.id, target); }
  catch (failure) { setError(failure.message); }
  finally { setChanging(''); }
 }
 const columns = [{key:'name',label:'Campaign'}, ...['Influencers','Posts','Views','Likes','Comments','Shares','VTF Ratio','ERV Ratio','Intent Ratio','Virality Ratio','Last Refresh'].map(label => ({key:label,label})), {key:'created_time',label:'Creation Date'}, {key:'actions',label:'Actions'}];
 return <div className="influencer-campaigns"><PageHeading title="Influencer Campaigns" subtitle="Track and manage your influencer marketing campaigns" action={<Button primary icon="Plus" onClick={() => setModal(true)}>Create Campaign</Button>} />
  <section className="card ic-filters"><div className="ic-filter-row"><Search placeholder="Search campaigns, brands, hashtags..." value={query} onChange={e => setQuery(e.target.value)} /><Select label="Status" options={['ACTIVE','PAUSED','ARCHIVED','DELETED']} value={filters.Status || ''} onChange={e => setFilters({...filters, Status:e.target.value})} /><Select label="Brand" options={[company]} value={filters.Brand || ''} onChange={e => setFilters({...filters, Brand:e.target.value})} /><Select label="Financial Arrangement" options={['Paid','Barter','Unpaid']} value={filters.Arrangement || ''} onChange={e => setFilters({...filters, Arrangement:e.target.value})} /></div><div className="ic-toggles"><Toggle label="Show Drafts" checked={drafts} onChange={e => setDrafts(e.target.checked)} /><Toggle label="Show Archived" checked={archived} onChange={e => setArchived(e.target.checked)} /><button className="ic-refresh" onClick={onRefresh}>Refresh</button></div></section>
  <section className="card ic-table">{(error || state.error) && <p className="ic-error" role="alert">{error || state.error}</p>}{(state.loading || state.scope !== scope) && <p className="ic-loading">Loading campaigns…</p>}<DataTable columns={columns} rows={visible} renderCell={(row,key) => {
   if (key === 'name') return <div className="ic-campaign-cell"><strong>{row.name}</strong><span className={`ic-row-status ${(row.status || '').toLowerCase()}`}>● {(row.status || row.effective_status || '').toLowerCase().replaceAll('_',' ')}</span><small>{(row.tracking?.hashtags || []).map(tag => `#${tag.replace(/^#/, '')}`).join(' ')}</small><small>{row.tracking?.start_date ? `${new Date(row.tracking.start_date).toLocaleDateString('en-GB')} – ${new Date(row.tracking.end_date).toLocaleDateString('en-GB')}` : objectives.find(([value]) => value === row.objective)?.[1] || row.objective}</small></div>;
   if (key === 'created_time') return row.created_time ? new Date(row.created_time).toLocaleDateString('en-GB') : '—';
   if (key === 'actions') return ['ACTIVE','PAUSED'].includes(row.status) ? <Button disabled={Boolean(changing)} onClick={() => changeStatus(row)}>{changing === row.id ? 'Updating…' : row.status === 'ACTIVE' ? 'Pause' : 'Resume'}</Button> : '—';
   return <span title="Influencer metrics are not available from this campaign">—</span>;
  }} /><div className="ic-pagination"><span>Rows per page:</span><select aria-label="Rows per page" value={limit} onChange={e => setLimit(Number(e.target.value))}>{[10,25,50].map(value => <option key={value}>{value}</option>)}</select><span>{rows.length ? (currentPage - 1) * limit + 1 : 0}–{Math.min(currentPage * limit, rows.length)} of {rows.length}{state.after ? '+' : ''}</span><button aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button><button aria-label="Next page" disabled={currentPage * limit >= rows.length} onClick={() => setPage(currentPage + 1)}>›</button>{state.after && <Button disabled={state.loading} onClick={onMore}>Load more</Button>}</div></section>
  {modal && <CreateForm organization={organization} company={company} onClose={() => setModal(false)} onCreated={onCreated} />}
 </div>;
}
