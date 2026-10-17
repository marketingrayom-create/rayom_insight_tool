import { requestRetailReport } from './retailReportRequest';
let generation = 0;
const cache = new Map();
const listeners = new Set();
export const getPrefetchedReport = report => cache.get(report);
export function subscribeRetailReports(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function clearRetailReports() {
    generation++;
    cache.clear();
    listeners.forEach(fn => fn());
}
export async function prefetchRetailReports() {
    const current = ++generation;
    cache.clear(); listeners.forEach(fn => fn());
    const d = new Date(); d.setDate(d.getDate() - 2);
    const day = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    for (const report of ['sales', 'inventory']) {
        if (generation !== current) return;
        cache.set(report, {pending:true}); listeners.forEach(fn => fn());
        try {
            const result = await requestRetailReport({report,date:day,timeframe:'daily',startDate:day,endDate:day,distributor:'manufacturing',offset:0}, AbortSignal.timeout(180000));
            if (generation !== current) return;
            cache.set(report, {result,day});
        } catch (error) {
            if (generation !== current) return;
            cache.set(report, {error:error.name === 'TimeoutError' ? 'Report prefetch timed out. Press Apply to retry.' : error.message});
        }
        listeners.forEach(fn => fn());
    }
}
