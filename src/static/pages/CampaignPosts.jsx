import { useMemo, useState } from 'react';
import { Grid2X2, Rows2, ArrowDownWideNarrow, ExternalLink, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { PageHeading, EmptyState, DataTable, Toggle } from '../components/UI';
import './CampaignPosts.css';
const status = row => row.effective_status || row.status || 'UNKNOWN';
const platform = row => row.creative?.instagram_permalink_url ? 'Instagram' : row.creative?.effective_object_story_id ? 'Facebook' : 'Unknown';
const type = row => row.creative?.video_id ? 'Video' : row.creative?.image_url || row.creative?.thumbnail_url ? 'Image' : 'Unknown';
const linkFor = row => {
  const creative = row.creative || {}, story = creative.effective_object_story_id;
  const url = creative.instagram_permalink_url || (/^\d+_\d+$/.test(story || '') ? `https://www.facebook.com/${story.split('_')[0]}/posts/${story.split('_')[1]}` : '');
  return /^https:\/\/(www\.)?(instagram|facebook)\.com\//.test(url) ? url : '';
};
function Skeleton() { return <article className="cp-post cp-skeleton" aria-hidden="true"><div className="cp-author"><i /><div><b /><b /></div><i /></div><div className="cp-media" /><div className="cp-skeleton-lines"><b /><b /><b /><b /><b /></div></article>; }
function DateRange({ label, value, onChange, disabled = false }) {
 return <fieldset className="cp-date" disabled={disabled} title={disabled ? 'Publication dates are unavailable for these ads.' : undefined}><legend>{label}</legend><input type="date" aria-label={`${label} from`} value={value[0]} onChange={e => onChange([e.target.value, value[1]])} /><span>–</span><input type="date" aria-label={`${label} to`} value={value[1]} onChange={e => onChange([value[0], e.target.value])} /><button type="button" aria-label={`Clear ${label}`} onClick={() => onChange(['', ''])}>×</button></fieldset>;
}
export default function CampaignPosts({ state, scope, company, organization, onRefresh, onMore }) {
 const [filters, setFilters] = useState({ brand: '', status: '', platform: '', type: '', ad: '', language: '' });
 const [added, setAdded] = useState(['', '']), [posted, setPosted] = useState(['', '']);
 const [removed, setRemoved] = useState(false), [view, setView] = useState('grid'), [sort, setSort] = useState('created_time'), [descending, setDescending] = useState(true);
 const source = state.scope === scope ? state.rows : [];
 const hasPublication = source.some(row => row.post_date);
 const languages = [...new Set(source.map(row => row.language).filter(Boolean))];
 const rows = useMemo(() => source.filter(row => {
  const current = status(row);
  if (!removed && ['DELETED', 'ARCHIVED'].includes(current)) return false;
  if (filters.brand && filters.brand !== company) return false;
  if (filters.status && current !== filters.status) return false;
  if (filters.platform && platform(row) !== filters.platform) return false;
  if (filters.type && type(row) !== filters.type) return false;
  if (filters.ad && current !== filters.ad) return false;
  if (filters.language && row.language !== filters.language) return false;
  return [[added, row.created_time], [posted, row.post_date]].every(([range, date]) => (!range[0] || (date && date.slice(0, 10) >= range[0])) && (!range[1] || (date && date.slice(0, 10) <= range[1])));
 }).sort((a, b) => String(a[sort] || '').localeCompare(String(b[sort] || '')) * (descending ? -1 : 1)), [source, filters, company, removed, added, posted, sort, descending]);
 const select = (key, label, options, floating = false, disabled = false) => <label className={`cp-select ${floating ? 'cp-floating' : ''}`} title={disabled ? 'Language is unavailable for these ads.' : undefined}>{floating && <span>{label}</span>}<select aria-label={label} disabled={disabled} value={filters[key]} onChange={e => setFilters({ ...filters, [key]: e.target.value })}><option value="">{floating ? 'All' : label}</option>{options.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>;
 const loading = state.loading || state.scope !== scope;
 return <div className="campaign-posts-page">
  <PageHeading title="All Campaign Posts" subtitle="View posts across all your influencer campaigns" />
  <section className="card cp-filters" aria-label="Campaign post filters">
   <div className="cp-filter-top">{select('brand', 'Brand', [company])}{select('status', 'Status', ['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED', 'WITH_ISSUES'])}{select('platform', 'Platform', ['Facebook', 'Instagram'])}{select('type', 'Post Type', ['Image', 'Video'])}{select('ad', 'Ad Status', ['ACTIVE', 'PAUSED', 'WITH_ISSUES'], true)}</div>
   <div className="cp-filter-dates"><DateRange label="Post Date" value={posted} onChange={setPosted} disabled={!hasPublication} /><DateRange label="Post Added Date" value={added} onChange={setAdded} />{select('language', 'Language', languages, false, !languages.length)}</div>
   <div className="cp-filter-bottom"><label className="cp-select cp-floating"><span>Sort By</span><select aria-label="Sort By" value={sort} onChange={e => setSort(e.target.value)}><option value="created_time">Post Added Date</option><option value="name">Post Name</option></select></label><button className="cp-icon-button cp-sort" aria-label="Reverse sort order" onClick={() => setDescending(!descending)}><ArrowDownWideNarrow size={21} style={{ transform: descending ? undefined : 'rotate(180deg)' }} /></button><Toggle label="Show Removed" checked={removed} onChange={e => setRemoved(e.target.checked)} /><div className="cp-view"><button className="cp-icon-button" aria-label="Refresh posts" onClick={onRefresh}><RefreshCw size={18} /></button><button className={`cp-icon-button ${view === 'grid' ? 'active' : ''}`} aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Grid2X2 size={22} /></button><button className={`cp-icon-button ${view === 'list' ? 'active' : ''}`} aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}><Rows2 size={22} /></button></div></div>
  </section>
  <section className="card cp-results" aria-busy={loading}>
   {state.scope === scope && state.error && <div className="cp-error" role="alert"><p>{state.error}</p><button onClick={onRefresh}>Retry</button></div>}
   {loading && <div className="cp-grid" role="status" aria-label="Loading campaign posts"><Skeleton /><Skeleton /><Skeleton /></div>}
   {!loading && !state.error && !rows.length && <EmptyState title={source.length ? 'No posts match these filters' : 'No campaign ads found'} description={source.length ? `${company}: clear the filters to see available posts.` : `${company}: Meta returned no ads for this ad account. Campaigns appear here once they contain ads and post creatives. After adding ads in Meta Ads Manager, refresh this page.`} />}
   {!loading && rows.length > 0 && (view === 'grid' ? <div className="cp-grid">{rows.map(row => {
    const creative = row.creative || {}, image = creative.image_url || creative.thumbnail_url, url = linkFor(row);
    return <article className="cp-post" key={row.id}><header className="cp-author"><div className="cp-avatar">{company[0]}</div><div><strong title={row.name}>{row.name}</strong><small>{company} · {platform(row)}</small></div><span className="cp-status-dot" title={status(row)} /></header><div className="cp-media">{image ? <img src={image} alt={creative.title || row.name} loading="lazy" /> : <div className="cp-no-image"><ImageIcon size={38} /><span>No preview available</span></div>}</div><div className="cp-post-body"><div className="cp-post-title"><strong>{row.campaign?.name || 'Campaign'}</strong><span className="cp-status">{status(row).replaceAll('_', ' ')}</span></div><p>{creative.body || creative.title || 'No post caption available'}</p><dl><div><dt>Post type</dt><dd>{type(row)}</dd></div><div><dt>Added</dt><dd>{row.created_time ? new Date(row.created_time).toLocaleDateString('en-GB') : '—'}</dd></div></dl>{url && <a href={url} target="_blank" rel="noreferrer">View post <ExternalLink size={14} /></a>}</div></article>;
   })}</div> : <DataTable columns={[{ key: 'name', label: 'Post' }, { key: 'campaign', label: 'Campaign' }, { key: 'platform', label: 'Platform' }, { key: 'status', label: 'Ad Status' }, { key: 'link', label: 'Post Link' }]} rows={rows} renderCell={(row, key) => key === 'campaign' ? row.campaign?.name || '—' : key === 'platform' ? platform(row) : key === 'status' ? status(row) : key === 'link' ? linkFor(row) ? <a href={linkFor(row)} target="_blank" rel="noreferrer">View post</a> : '—' : row[key]} />)}
   {!loading && state.scope === scope && state.after && <div className="cp-load-more"><button className="button" onClick={onMore}>Load more posts</button></div>}
  </section>
 </div>;
}
