import { useEffect, useState } from "react";
import PODetails from "./PODetails";
import { ensureAmazonStarted } from "../api/amazonStartup";

export default function PODetailsPage() {
    const orderId = new URLSearchParams(window.location.search).get("poId")?.trim();
    const [po, setPo] = useState(null);
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    const onBack = () => {
        localStorage.setItem("stockflow-active-page", JSON.stringify("Orders"));
        localStorage.setItem("stockflow-orders-tab", JSON.stringify("managePos"));
        window.location.assign(window.location.pathname);
    };

    useEffect(() => {
        const controller = new AbortController();
        setPo(null);
        setError("");
        const post = async (url, body) => {
            const response = await fetch(url, {
                method: "POST", signal: controller.signal,
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(body),
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.message || "Unable to load PO details.");
            return result;
        };
        (async () => {
            if (!orderId) throw new Error("The link is missing a PO ID.");
            await ensureAmazonStarted();
            if (controller.signal.aborted) return;
            const result = await post("/amazon-api/po-details", { orderId, shippingProxyType: "LIVE" });
            const record = result.data?.payload?.find(entry => entry.poData?.poId === orderId || entry.poData?.id === orderId);
            if (!record) throw new Error("This PO was not found for the signed-in company.");
            if (!controller.signal.aborted) setPo({ ...record.poData, items: record.poItems || [] });
        })().catch(err => {
            if (!controller.signal.aborted) setError(err.message || "Unable to load PO details.");
        });
        return () => controller.abort();
    }, [orderId, attempt]);

    if (po) return <PODetails po={po} onBack={onBack} />;
    return <section className="po-details-page">
        <button className="po-back-btn" onClick={onBack}>← Back to Manage POs</button>
        <h1>PO: {orderId || "Missing ID"}</h1>
        {error ? <div role="alert"><p>{error}</p><button onClick={() => setAttempt(value => value + 1)}>Retry</button></div>
            : <p role="status">Loading live PO details…</p>}
    </section>;
}
