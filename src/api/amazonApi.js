export const getAmazonPOData = async (filters = {}) => {
    const payload = {
        getTotalNumOfResults: true,
        pageSize: 1000,
        sortOrder: "DESC",
        vcpoHeaderSortField: "OrderDateUTC",

        vcpoHeaderSearchCriteria: {
            cancellationDeadlineFrom: null,
            cancellationDeadlineTo: null,
            consolidationIdList: [],
            fcIds: filters.fcIds || [],
            handoffWindowStartFrom: null,
            handoffWindowStartTo: null,
            handoffWindowEndFrom: null,
            handoffWindowEndTo: null,

            orderDateFrom: filters.orderDateFrom || null,
            orderDateTo: filters.orderDateTo || null,

            orderIds: filters.orderIds || [],
            vendorList: filters.vendorList || [],

            vendorFacingStatus: ["CONFIRMED"],
        },

        vcpoItemSearchCriteria: {
            externalIdList: [],
            fnskuList: [],
            vendorSkuList: [],
            merchantSkuList: [],
            itemOpen: null,
        },

        fetchCancellationData: false,
        fetchCompleteItemData: false,
        fetchPriorityData: false,
        needsAttentionReasons: [],
    };

    console.log("Amazon PO API Payload:", payload);

    // The browser calls Vite, not the Flask service directly.  Vite proxies
    // this request to :5001, so the browser never has a cross-origin request.
    const response = await fetch(
        "/amazon-api/manage-pos",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        }
    );

    const result = await response.json();

    console.log("Amazon PO API Response:", result);

    if (!response.ok || !result.success) {
        throw new Error(result.message || "PO API failed");
    }

    return result;
};
