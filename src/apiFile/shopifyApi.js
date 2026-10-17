export async function fetchShopifyData(resource, { signal, ...filters } = {}) {
  const response = await fetch(`/shopify-api/${resource}`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filters),
  });
  let result;
  try { result = await response.json(); }
  catch { throw new Error('Shopify backend unavailable. Restart the backend and Vite.'); }
  if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load Shopify data');
  return result;
}
