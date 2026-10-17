let reportQueue = Promise.resolve();
export function queueRetailAction(action) {
    const task = reportQueue.then(action);
    reportQueue = task.catch(() => { });
    return task;
}
export function requestRetailReport(payload, signal) {
    return queueRetailAction(async () => {
        signal?.throwIfAborted();
        const buildResponse = await fetch('/amazon-api/build', { signal: AbortSignal.timeout(3000) });
        const build = await buildResponse.json();
        if (!buildResponse.ok || build.buildId !== 'RETAIL-REPORT-2026-09-09-V7') {
            throw new Error('The Amazon backend is outdated. Restart backend/amazon_vendor_automation.py to load V7, then sign in and press Apply.');
        }
        signal?.throwIfAborted();
        // A UI cancellation cannot stop Flask's browser action. Let that action
        // finish before dispatching the next request, and discard its result.
        const response = await fetch('/amazon-api/retail-report', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(90000), body: JSON.stringify(payload)
        });
        let result;
        try { result = await response.json(); }
        catch { result = { message: `Report service returned HTTP ${response.status} without JSON.` }; }
        signal?.throwIfAborted();
        if (!response.ok || !result.success) throw new Error(result.message || 'Report request failed.');
        return result;
    });
}
