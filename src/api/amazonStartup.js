let startup;

export function ensureAmazonStarted() {
    if (startup) return startup;
    startup = (async () => {
        // A running Amazon service does not need the Uniware launcher.
        try {
            const response = await fetch("/amazon-api/build", { signal: AbortSignal.timeout(3000) });
            const result = await response.json();
            if (response.ok && result.success && result.service === "amazon-vendor-automation") return;
        } catch { /* Start the service below. */ }
        try {
            const response = await fetch("/amazon-control/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: AbortSignal.timeout(55000),
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.message || "Amazon startup failed.");
        } catch (error) {
            if (error.name === "TimeoutError") {
                throw new Error("Amazon startup timed out. Check that the Uniware backend is running on port 5015, then retry.");
            }
            throw error;
        }
    })().finally(() => { startup = undefined; });
    return startup;
}
