export async function fetchFlipkartProducts({ signal, ...filters } = {}) {
  const response = await fetch('/flipkart-api/products', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filters),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || 'Unable to load Flipkart data');
  }
  return result;
}
