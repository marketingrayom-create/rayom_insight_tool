export function normalizeAdvertising(payload, offset, limit, kind) {
  if (payload?.success === false) throw new Error(payload.message || 'Beacon could not load advertising data.');
  const data = payload?.data ?? payload;
  const rows = Array.isArray(data) ? data : data?.[kind === 'sku' ? 'products' : 'campaigns'] ?? data?.items ?? data?.rows ?? data?.results;
  if (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) {
    throw new Error('Unexpected advertising response. A sample API JSON response is needed to map this report.');
  }
  const meta = payload?.pagination ?? data?.pagination ?? payload?.meta ?? data?.meta ?? {};
  const raw = meta.total ?? meta.totalCount ?? meta.totalRecords ?? payload?.total ?? payload?.totalCount ?? data?.total ?? data?.totalCount;
  const total = raw != null && Number.isFinite(Number(raw)) ? Number(raw) : null;
  return { rows, total, hasNext: meta.hasNextPage ?? meta.hasMore ?? (total == null ? rows.length === limit : offset + rows.length < total) };
}

export async function fetchAdvertising(kind, params, signal) {
  const response = await fetch(`/uniware-api/beacon/advertising/${kind === 'sku' ? 'sku' : 'campaign'}-performance?${new URLSearchParams(params)}`, { signal, headers: { Accept: 'application/json' } });
  let payload;
  try { payload = await response.json(); } catch { throw new Error('Advertising service unavailable. Check that the Python API service is running.'); }
  if (!response.ok) throw new Error(payload.message || `Advertising request failed (${response.status}).`);
  return normalizeAdvertising(payload, Number(params.offset), Number(params.limit), kind);
}

export const field = (row, ...keys) => keys.map((key) => row[key]).find((v) => v != null);
