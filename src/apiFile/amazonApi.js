const AMAZON_API_BASE_URL =
    import.meta.env.VITE_AMAZON_API_URL ||
    "/seller-api";

function amazonUrl(path, organization) {
    if (!["rayom", "shelfesteem", "linso"].includes(organization)) {
        throw new Error("Select a company before loading Amazon data.");
    }
    return `${AMAZON_API_BASE_URL}/api/amazon/${path}?organization=${organization}`;
}

export const fetchUniwareInventory = async ({products, organization, signal}) => {
    const response = await fetch(amazonUrl('uniware-inventory', organization), {
        method: 'POST', signal, headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({products: products.map(({asin, sellerSku, sku, sellerSkus}) => ({asin, sellerSku, sku, sellerSkus}))}),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Uniware inventory unavailable.');
    return result;
};

export const fetchAmazonProducts = async ({
    page = 1,
    limit = 10,
    sortBy = "drr_1d_minus2",
    sortOrder = "desc",
    search = "",
    signal,
    organization,
} = {}) => {
    const url = amazonUrl("products", organization);

    const response = await fetch(url, {
        method: "POST",
        signal,
    organization,
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            page,
            limit,
            sortBy,
            sortOrder,
            search,
        }),
    });

    const result = await response.json();

    if (!response.ok || !result?.success) {
        throw new Error(
            result?.error ||
            result?.message ||
            `Amazon API failed (${response.status})`
        );
    }

    return result;
};


export const fetchBrandSalesSummary = async ({
    page = 1,
    limit = 100,
    sortBy = "drr_7d",
    sortOrder = "desc",
    signal,
    organization,
} = {}) => {

    const url =
        amazonUrl("brand-sales-summary", organization);

    const response = await fetch(url, {
        method: "POST",
        signal,
    organization,
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            page,
            limit,
            sortBy,
            sortOrder,
        }),
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            result?.error ||
            result?.message ||
            `Brand Sales API failed (${response.status})`
        );
    }

    return result;
};

export const fetchAmazonPerformance = async ({ signal, organization } = {}) => {
    const url = amazonUrl("performance", organization);

    const response = await fetch(url, {
        method: "GET",
        signal,
    organization,
        headers: {
            Accept: "application/json",
        },
    });

    const result = await response.json();

    if (!response.ok || !result?.success) {
        throw new Error(
            result?.error ||
            result?.message ||
            `Amazon Performance API failed (${response.status})`
        );
    }

    return result;
};

export const fetchAmazonFulfillmentOrders = async ({
    days = 7,
    max_orders = 100,
    include_items = true,
    fulfillment_channel = null,
    order_status = [],
    easy_ship_status = [],
    date = null,
    tab = null,
    signal,
    organization,
} = {}) => {
    const url =
        amazonUrl("fulfillment-orders", organization);

    const payload = {
        days,
        max_orders,
        include_items,
        fulfillment_channel,
        order_status,
        easy_ship_status,
        date,
        tab,
    };

    console.log(
        "Amazon Fulfillment API payload:",
        payload
    );

    const response = await fetch(url, {
        method: "POST",
        signal,
    organization,
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || !result?.success) {
        const error = new Error(
            result?.error ||
            result?.message ||
            `Amazon Fulfillment API failed (${response.status})`
        );
        error.status = response.status;
        error.code = result?.code;
        error.retryAfter = Number(response.headers.get('Retry-After') || result?.retryAfter || 60);
        throw error;
    }

    return result;
};


export async function fetchReorderPlans(organization, signal) {
    const response = await fetch(amazonUrl('reorder-planning', organization), {signal});
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load reorder plans.');
    return result;
}
export async function saveReorderPlan(organization, row) {
    const response = await fetch(amazonUrl('reorder-planning/' + encodeURIComponent(row.ean), organization), {
        method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(row),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save reorder plan.');
    return result;
}

export async function fetchVendorReorder(organization,asins,signal){
    const response=await fetch(amazonUrl('reorder-planning/live',organization),{
        method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({asins}),
    });
    const result=await response.json();
    if(!response.ok||!result.success)throw new Error(result.message||'Vendor Central planning unavailable.');
    return result;
}
