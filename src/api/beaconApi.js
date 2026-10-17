export function normalizeProductPerformance(payload, page, limit) {
  if (payload?.success === false) throw new Error(payload.message || 'Beacon could not load product performance.');
  const data = payload?.data ?? payload;
  const rows = Array.isArray(data) ? data : data?.products ?? data?.items ?? data?.rows ?? data?.results;
  if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('Unexpected Beacon response format. A sample JSON response is needed to map the product fields.');
  }
  const pagination = payload?.pagination ?? data?.pagination ?? payload?.meta ?? data?.meta ?? {};
  const rawTotal = pagination.total ?? pagination.totalItems ?? pagination.totalRecords ?? payload?.total ?? data?.total;
  const total = rawTotal != null && Number.isFinite(Number(rawTotal)) ? Number(rawTotal) : null;
  const totalPages = pagination.totalPages != null ? Number(pagination.totalPages) : total == null ? null : Math.ceil(total / limit);
  return { rows, total, hasNext: pagination.hasNextPage ?? (totalPages == null ? rows.length === limit : page < totalPages) };
}

export async function fetchProductPerformance({ page = 1, limit = 10, sortBy = 'drr_1d_minus2', sortOrder = 'desc', signal } = {}) {
  const query = new URLSearchParams({ page, limit, sortBy, sortOrder });
  const response = await fetch(`/uniware-api/beacon/product-performance?${query}`, { signal, headers: { Accept: 'application/json' } });
  let payload;
  try { payload = await response.json(); } catch { throw new Error('Product performance service is unavailable. Check that the Python API service is running.'); }
  if (!response.ok) throw new Error(payload.message || `Product performance request failed (${response.status}).`);
  return normalizeProductPerformance(payload, page, limit);
}
