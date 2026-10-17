// mockData.js

export const marketplaces = [
  ["Amazon", "#252525"],
  ["Blinkit", "#efc631"],
  ["D2C", "#3c9249"],
  ["Flipkart", "#225ca9"],
  ["Shopify", "#721743"],
  // ["Myntra", "#cc2142"],
  // ["Nykaa", "#ed1987"],
  // ["Swiggy", "#f16a3c"],
  // ["Zepto", "#751299"],
];

// ======================================================
// DASHBOARD METRICS
// ======================================================

// Amazon "Total sales" is now dynamic.
// Other metrics are still mock until their APIs are connected.
export const metrics = [
  {
    label: "Total sales",
    value: "—",
    icon: "IndianRupee",
    color: "green",
  },
  {
    label: "Ad spend",
    value: "—",
    icon: "IndianRupee",
    color: "orange",
  },
  {
    label: "Ad Impressions",
    value: "—",
    icon: "Eye",
    color: "cyan",
  },
  {
    label: "Clicks",
    value: "—",
    icon: "MousePointerClick",
    color: "gray",
  },
  {
    label: "Attributed sales",
    value: "—",
    icon: "ShoppingCart",
    color: "green",
  },
  {
    label: "ACOS",
    value: "—",
    icon: "ChartNoAxesCombined",
    color: "pink",
  },
  {
    label: "tACOS",
    value: "—",
    icon: "Coins",
    color: "amber",
  },
];

// ======================================================
// NON-AMAZON / NOT-YET-CONNECTED CHARTS
// ======================================================

// Revenue Statistics and Unit Statistics have been
// removed from static mock data.
// They will come from Amazon SP-API dynamically.
//
// These remaining charts stay as mock data for now.
export const charts = [
  {
    title: "Ad Impressions",
    subtitle: "Total impressions 1,00,601",
    axis: "Marketplace Impressions",
    right: "Total Impressions",

    bars: [83, 20, 37, 100, 72, 31, 0],
    line: [57, 8, 13, 63, 46, 24, 0],

    max: 44000,
  },

  {
    title: "Ad Spend (₹)",
    subtitle: "Total ad spend ₹3.01K",
    axis: "Marketplace Ad Spend (₹)",
    right: "Total Ad Spend (₹)",

    bars: [34, 10, 12, 100, 43, 18, 0],
    line: [25, 4, 7, 62, 29, 13, 0],

    max: 2000,
  },

  {
    title: "ACOS (%)",
    subtitle: "Advertising cost of sales",
    axis: "ACOS (%)",
    right: "",

    bars: [0, 0, 0, 0, 0, 0, 0],
    line: [0, 0, 0, 0, 0, 0, 0],

    max: 100,
  },

  {
    title: "TACOS (%)",
    subtitle: "Total advertising cost of sales",
    axis: "TACOS (%)",
    right: "",

    bars: [37, 0, 78, 0, 0, 0, 0],
    line: [12, 0, 25, 0, 0, 0, 0],

    max: 400,
  },
];

// ======================================================
// AMAZON PERFORMANCE → CHART DATA
// ======================================================

export const buildDynamicCharts = (performance) => {
  if (!performance?.success) {
    return [];
  }

  const revenueData = Array.isArray(performance.revenueData)
    ? performance.revenueData
    : [];

  const unitsData = Array.isArray(performance.unitsData)
    ? performance.unitsData
    : [];

  const revenueValues = revenueData.map(
    (item) => item?.value == null ? null : Number(item.value) || 0
  );

  const unitValues = unitsData.map(
    (item) => item?.value == null ? null : Number(item.value) || 0
  );

  const revenueMaxValue = Math.max(
    ...revenueValues,
    1
  );

  const unitMaxValue = Math.max(
    ...unitValues,
    1
  );

  // ============================================
  // REVENUE CHART
  // ============================================

  const revenueChart = {
    title: "Revenue Statistics",

    subtitle: `Total revenue ₹${Number(
      performance.totalRevenue || 0
    ).toLocaleString("en-IN")} · 7D${performance.dateRange ? ` · ${performance.dateRange.startDate} to ${performance.dateRange.endDate}` : ''}${performance.complete === false ? ' · Partial data; missing dates are loading' : ''}`,

    axis: "Marketplace Revenue (₹)",

    right: "Total Revenue (₹)",

    // Actual values from API
    values: revenueValues,

    // Actual API dates
    dates: revenueData.map(
      (item) => item?.date
    ),

    // Used by ChartCard for scaling
    max: revenueMaxValue,

    marketplace:
      performance.revenueSeries?.[0]?.name ||
      "amazon_sc",
  };

  // ============================================
  // UNIT CHART
  // ============================================

  const unitChart = {
    title: "Unit Statistics",

    subtitle: `Total units ${Number(
      performance.totalUnits || 0
    ).toLocaleString("en-IN")} · 7D${performance.dateRange ? ` · ${performance.dateRange.startDate} to ${performance.dateRange.endDate}` : ''}${performance.complete === false ? ' · Partial data; missing dates are loading' : ''}`,

    axis: "Marketplace units",

    right: "Total Units",

    // Actual values from API
    values: unitValues,

    // Actual API dates
    dates: unitsData.map(
      (item) => item?.date
    ),

    max: unitMaxValue,

    marketplace: "amazon_sc",
  };

  // Revenue + Units are dynamic.
  // Other charts remain mock.
  return [
    revenueChart,
    unitChart,
    ...charts,
  ];
};

// ======================================================
// AMAZON PERFORMANCE → METRICS
// ======================================================

export const buildDynamicMetrics = (
  performance
) => {
  const totalRevenue = Number(
    performance?.totalRevenue || 0
  );

  return metrics.map((metric) => {
    if (metric.label === "Total sales") {
      return {
        ...metric,

        value: `₹${totalRevenue.toLocaleString(
          "en-IN"
        )}`,
      };
    }

    return metric;
  });
};

// ======================================================
// CREATORS
// ======================================================

export const creators = [
  [
    "Shivangi Joshi",
    "shivangijoshi18",
    "10.2M",
    "3.21%",
    "Lifestyle",
    "SJ",
  ],
  [
    "Ashnoor Kaur",
    "ashnoorkaur",
    "9.8M",
    "2.85%",
    "Beauty",
    "AK",
  ],
  [
    "Jannat Zubair",
    "jannatzubair29",
    "49.7M",
    "4.02%",
    "Lifestyle",
    "JZ",
  ],
  [
    "Roshni Walia",
    "roshniwaliaa",
    "3.7M",
    "3.17%",
    "Fashion",
    "RW",
  ],
  [
    "Anushka Sen",
    "anushkasen0408",
    "39.1M",
    "2.74%",
    "Fashion",
    "AS",
  ],
  [
    "Avneet Kaur",
    "avneetkaur_13",
    "32.5M",
    "3.63%",
    "Beauty",
    "AK",
  ],
  [
    "Reem Shaikh",
    "reem_sameer8",
    "5.6M",
    "4.10%",
    "Lifestyle",
    "RS",
  ],
  [
    "Siddharth Nigam",
    "thesiddharthnigam",
    "11.4M",
    "2.98%",
    "Fitness",
    "SN",
  ],
  [
    "Ritika Sharma",
    "ritika_sharma",
    "124K",
    "5.24%",
    "Beauty",
    "RS",
  ],
  [
    "Prachi Verma",
    "prachi.verma",
    "87.2K",
    "6.12%",
    "Beauty",
    "PV",
  ],
].map((r, id) => ({
  id: id + 1,
  name: r[0],
  handle: r[1],
  followers: r[2],
  engagement: r[3],
  category: r[4],
  initials: r[5],
}));

// ======================================================
// INVENTORY
// ======================================================

export const inventory = Array.from(
  { length: 24 },
  (_, i) => ({
    marketplace: [
      "Amazon",
      "Flipkart",
      "D2C",
    ][i % 3],

    product: `BEAUTY-${1001 + i}`,

    listing: `B0D${72010 + i}`,

    sku: `SLB-${201 + i}`,

    ean: `890610234${1000 + i}`,

    warehouse: 124 + i * 11,

    transit: (i % 3) * 20,

    po: 50 + i * 2,

    drr: 3 + (i % 7),

    doc: 24 + i,
  })
);
