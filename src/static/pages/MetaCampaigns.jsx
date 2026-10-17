import { useEffect, useState } from 'react';
import InfluencerCampaigns from './InfluencerCampaigns';
import CampaignPosts from './CampaignPosts';
export default function MetaCampaigns({ posts = false, organization = 'shelfesteem' }) {
  const [state, setState] = useState({ rows: [], loading: true, error: '', after: null });
  const [cursor, setCursor] = useState('');
  const [refresh, setRefresh] = useState(0);
  const scope = `${organization}:${posts}:${refresh}`;
  useEffect(() => { setCursor(''); }, [scope]);
  useEffect(() => {
    const controller = new AbortController();
    setState(previous => ({ ...previous, rows: previous.scope === scope ? previous.rows : [], loading: true, error: '' }));
    const params = new URLSearchParams({ organization });
    if (cursor) params.set('after', cursor);
    fetch(`/meta-api/${posts ? 'posts' : 'campaigns'}?${params}`, { signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load Meta data.');
        if (controller.signal.aborted) return;
        setState(previous => ({ scope, rows: cursor && previous.scope === scope ? [...new Map([...previous.rows, ...payload.rows].map(row => [row.id, row])).values()] : payload.rows, after: payload.after, loading: false, error: '' }));
      }).catch(error => { if (!controller.signal.aborted) setState(previous => ({ ...previous, scope, loading: false, error: error.message })); });
    return () => controller.abort();
  }, [scope, cursor]);
  const company = organization === 'linso' ? 'Rayom Linso' : organization === 'rayom' ? 'Rayom' : 'Shelfesteem';
  if (posts) return <CampaignPosts key={organization} state={state} scope={scope} company={company} organization={organization} onRefresh={() => setRefresh(value => value + 1)} onMore={() => setCursor(state.after)} />;
  return <InfluencerCampaigns key={organization} state={state} scope={scope} company={company} organization={organization} onRefresh={() => setRefresh(value => value + 1)} onMore={() => setCursor(state.after)} onCreated={row => setState(previous => ({ ...previous, scope, rows: [row, ...previous.rows.filter(existing => existing.id !== row.id)], loading: false, error: '' }))} onStatusChanged={(id, status) => setState(previous => ({ ...previous, rows: previous.rows.map(row => row.id === id ? { ...row, status, effective_status: status } : row) }))} />;
}
