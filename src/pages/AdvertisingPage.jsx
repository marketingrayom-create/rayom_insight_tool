import { useEffect, useState } from 'react';
import { fetchAdvertising, field } from '../api/advertisingApi';
import './AdvertisingPage.css';

const TABS = [
  ['worst_performing', 'Worst Performing', 'ad_spend', 'asc'],
  ['best_performing', 'Best Performing', 'roas', 'desc'],
  ['most_revenue', 'Most Revenue', 'roas', 'desc'],
  ['oos_spending', 'OOS But Spending', 'ad_spend', 'asc'],
];

const PRODUCT = [
  ['ad_spend', 'Spend', ['ad_spend', 'spend', 'adSpend'], 'money'],
  ['ad_sales', 'Ad sales', ['ad_sales', 'adSales', 'sales'], 'money'],
  ['total_sales', 'Total sales', ['total_sales', 'totalSales'], 'money'],

  [
    'organic_sales',
    'Organic sales',
    ['organic_sales', 'organicSales'],
    'money',
  ],

  [
    'organic_sales_pct',
    'Organic %',
    [
      'organic_sales_pct',
      'organic_percentage',
      'organicPercentage',
      'organic_percent',
      'organic_pct',
    ],
    'percent',
  ],

  ['roas', 'Roas', ['roas'], 'decimal'],

  [
    'total_impressions',
    'Impr.',
    ['total_impressions'],
    'number',
  ],

  [
    'total_clicks',
    'Clicks',
    ['total_clicks'],
    'number',
  ],

  [
    'avg_ctr',
    'CTR.',
    ['avg_ctr', 'ctr', 'ctr_pct'],
    'percent',
  ],
];

const CAMPAIGN = [
  [
    'status',
    'Status',
    ['status', 'campaign_status', 'campaignStatus'],
    'text',
  ],

  [
    'impressions',
    'Impr.',
    ['impressions'],
    'number',
  ],

  [
    'clicks',
    'Clicks',
    ['clicks'],
    'number',
  ],

  [
    'spend',
    'Spend',
    ['spend_inr', 'spend', 'cost'],
    'money',
  ],

  [
    'sales',
    'Sales',
    ['sales_inr', 'sales', 'roas'],
    'money',
  ],

  [
    'roas',
    'ROAS',
    ['roas'],
    'decimal',
  ],
];

function format(value, type) {
  if (value == null || value === '') {
    return '—';
  }

  if (type === 'text') {
    return String(value);
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  if (type === 'money') {
    return number.toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    });
  }

  return (
    number.toLocaleString('en-IN', {
      minimumFractionDigits: type === 'number' ? 0 : 2,
      maximumFractionDigits: 2,
    }) + (type === 'percent' ? '%' : '')
  );
}

const MARKETPLACES = [
  ['amazon_sc', 'Amazon'],
  ['flipkart', 'Flipkart'],
  ['myntra', 'Myntra'],
  ['blinkit', 'Blinkit'],
  ['zepto', 'Zepto'],
  ['meesho', 'Meesho'],
  ['d2c', 'D2C'],
  ['swiggy', 'Swiggy'],
];

const formatMoney = (number) =>
  Number(number || 0).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });

const formatCompact = (number) =>
  Number(number || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  });

function MarketplaceTrend({ dates, timePeriod }) {
  const [marketplace, setMarketplace] = useState('amazon_sc');
  console.log('MarketplaceTrend dates:=====', dates);
  // ============================================================
  // OLD API DATA
  // ONLY FOR GRAPH
  // ============================================================

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ============================================================
  // NEW API DATA
  // ONLY FOR MARKETPLACE DETAILS CARDS
  // ============================================================

  const [marketplaceDetails, setMarketplaceDetails] = useState([]);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [detailsError, setDetailsError] = useState('');

  const [trendRows, setTrendRows] = useState([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState('');

  // ============================================================
  // NEW API
  // /ad-spends-by-marketplace-daily
  // ============================================================

  useEffect(() => {
    const controller = new AbortController();

    setDetailsLoading(true);
    setDetailsError('');

    const selectedTimePeriod = String(
      timePeriod || '7D'
    ).toUpperCase();

    const params = new URLSearchParams({
      timePeriod: selectedTimePeriod,
    });

    if (selectedTimePeriod === 'CUSTOM') {
      params.set('startDate', dates.startDate);
      params.set('endDate', dates.endDate);
    }

    fetch(
      `/api/beacon/advertising/ad-spends-by-marketplace-daily?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        const payload = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            payload?.message ||
            `Request failed (${response.status})`
          );
        }

        return payload;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          const apiRows = Array.isArray(payload?.rows)
            ? payload.rows
            : [];

          setMarketplaceDetails(apiRows);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          console.error(
            'Marketplace Details API error:',
            err
          );

          setMarketplaceDetails([]);

          setDetailsError(
            err.message ||
            'Unable to load marketplace details.'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setDetailsLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    dates.startDate,
    dates.endDate,
    timePeriod,
  ]);

  // ============================================================
  // OLD API
  // /marketplace-daily-trend
  // ONLY FOR GRAPH
  // ============================================================

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError('');

    const params = new URLSearchParams({
      timePeriod: '7D',
      marketplace,
      startDate: dates.startDate,
      endDate: dates.endDate,
    });

    fetch(
      `/api/beacon/advertising/marketplace-daily-trend?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        const payload = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            payload?.message ||
            `Request failed (${response.status})`
          );
        }

        return payload;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setRows(
            Array.isArray(payload?.rows)
              ? payload.rows
              : []
          );
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setRows([]);
          setError(
            err.message ||
            'Unable to load marketplace trend.'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    marketplace,
    dates.startDate,
    dates.endDate,
  ]);


  useEffect(() => {
    const controller = new AbortController();

    setTrendLoading(true);
    setTrendError('');

    const selectedTimePeriod = String(
      timePeriod || '7D'
    ).toUpperCase();

    const params = new URLSearchParams({
      timePeriod: selectedTimePeriod,
    });

    if (selectedTimePeriod === 'CUSTOM') {
      params.set('startDate', dates.startDate);
      params.set('endDate', dates.endDate);
    }

    fetch(
      `/api/beacon/advertising/ad-efficiency-trend?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            payload?.message ||
            `Request failed (${response.status})`
          );
        }

        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;

        const apiRows = Array.isArray(payload?.rows)
          ? payload.rows
          : Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload)
              ? payload
              : [];

        setTrendRows(apiRows);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          console.error(
            'Ad Efficiency Trend API error:',
            err
          );

          setTrendRows([]);
          setTrendError(
            err.message ||
            'Unable to load marketplace trends.'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setTrendLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    dates.startDate,
    dates.endDate,
    timePeriod,
  ]);

  // ============================================================
  // GRAPH DATA
  // COMES ONLY FROM OLD API
  // ============================================================

  const points = rows.map((row) => ({
    date: row.date,

    spend: Number(
      row.ad_spend || 0
    ),

    sales: Number(
      row.ad_attributed_sales || 0
    ),

    roas: Number(
      row.roas ??
      row.derived_roas ??
      0
    ),
  }));

  const rowDate = (row) =>
    row?.date ||
    row?.day ||
    row?.report_date ||
    row?.reportDate ||
    row?.date_key ||
    row?.dateKey ||
    '';

  const rowMarketplace = (row) =>
    String(
      row?.marketplace ||
      row?.marketplace_name ||
      row?.marketplaceName ||
      row?.channel ||
      ''
    ).toLowerCase();

  const normalizeMarketplace = (value) => {
    const key = String(value || '').toLowerCase();

    if (
      key === 'amazon' ||
      key === 'amazon_sc' ||
      key === 'amazon sc'
    ) {
      return 'amazon_sc';
    }

    if (key === 'd2c') {
      return 'd2c';
    }

    return key;
  };

  const getDateLabel = (value) => {
    if (!value) return '';

    const parsed = new Date(
      `${String(value).slice(0, 10)}T00:00:00`
    );

    if (Number.isNaN(parsed.getTime())) {
      return String(value);
    }

    return parsed.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
    });
  };

  const compact = (value) =>
    Number(value || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 0,
    });

  const rupee = (value) =>
    `₹${Number(value || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 0,
    })}`;

  const percent = (value) =>
    `${Number(value || 0).toFixed(0)}%`;

  const numberValue = (row, keys) => {
    for (const key of keys) {
      const raw = row?.[key];

      if (
        raw !== undefined &&
        raw !== null &&
        raw !== ''
      ) {
        const parsed = Number(
          typeof raw === 'string'
            ? raw.replace(/,/g, '')
            : raw
        );

        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return 0;
  };


  const normalisedTrendRows = trendRows
    .map((row) => ({
      date: rowDate(row),
      marketplace: normalizeMarketplace(
        rowMarketplace(row)
      ),

      impressions: numberValue(row, [
        'ad_impressions',
        'adImpressions',
        'impressions',
        'marketplace_impressions',
        'marketplaceImpressions',
        'total_impressions',
        'totalImpressions',
      ]),

      spend: numberValue(row, [
        'ad_spend',
        'adSpend',
        'spend',
        'cost',
        'marketplace_ad_spend',
        'marketplaceAdSpend',
        'total_ad_spend',
        'totalAdSpend',
      ]),

      acos: numberValue(row, [
        'acos',
        'acos_pct',
        'acosPercent',
        'ad_acos',
        'adAcos',
        'marketplace_acos',
        'marketplaceAcos',
      ]),

      tacos: numberValue(row, [
        'tacos',
        'tacos_pct',
        'tacosPercent',
        'total_tacos',
        'totalTacos',
        'total_acos',
        'totalAcos',
      ]),
    }))
    .filter((row) => row.date);

  // ============================================================
  // FILTER CURRENT MARKETPLACE
  // ============================================================

  const selectedTrendRows =
    normalisedTrendRows.filter((row) => {
      if (!row.marketplace) return true;

      return (
        row.marketplace === marketplace
      );
    });

  // ============================================================
  // GROUP BY DATE
  // ============================================================

  const groupedTrend = new Map();

  selectedTrendRows.forEach((row) => {
    const key = String(row.date).slice(0, 10);

    if (!groupedTrend.has(key)) {
      groupedTrend.set(key, {
        date: key,
        impressions: 0,
        spend: 0,
        acosTotal: 0,
        tacosTotal: 0,
        percentageCount: 0,
      });
    }

    const current = groupedTrend.get(key);

    current.impressions += row.impressions;
    current.spend += row.spend;

    current.acosTotal += row.acos;
    current.tacosTotal += row.tacos;
    current.percentageCount += 1;
  });

  let graphPoints = Array.from(
    groupedTrend.values()
  )
    .map((row) => ({
      date: row.date,
      impressions: row.impressions,
      spend: row.spend,
      acos:
        row.percentageCount > 0
          ? row.acosTotal /
          row.percentageCount
          : 0,
      tacos:
        row.percentageCount > 0
          ? row.tacosTotal /
          row.percentageCount
          : 0,
    }))
    .sort(
      (a, b) =>
        new Date(a.date) -
        new Date(b.date)
    );

  // If the API does not return marketplace in each row,
  // keep all rows visible rather than showing a blank graph.
  if (!graphPoints.length) {
    const fallback = new Map();

    normalisedTrendRows.forEach((row) => {
      const key = String(row.date).slice(0, 10);

      if (!fallback.has(key)) {
        fallback.set(key, {
          date: key,
          impressions: 0,
          spend: 0,
          acos: 0,
          tacos: 0,
          count: 0,
        });
      }

      const current = fallback.get(key);

      current.impressions += row.impressions;
      current.spend += row.spend;
      current.acos += row.acos;
      current.tacos += row.tacos;
      current.count += 1;
    });

    graphPoints = Array.from(
      fallback.values()
    )
      .map((row) => ({
        date: row.date,
        impressions: row.impressions,
        spend: row.spend,
        acos:
          row.count > 0
            ? row.acos / row.count
            : 0,
        tacos:
          row.count > 0
            ? row.tacos / row.count
            : 0,
      }))
      .sort(
        (a, b) =>
          new Date(a.date) -
          new Date(b.date)
      );
  }
  // ============================================================
  // GRAPH TOTALS
  // ============================================================

  const graphSpendTotal =
    points.reduce(
      (sum, row) => sum + row.spend,
      0
    );

  const graphSalesTotal =
    points.reduce(
      (sum, row) => sum + row.sales,
      0
    );

  const graphRoas =
    graphSpendTotal > 0
      ? graphSalesTotal / graphSpendTotal
      : 0;

  // ============================================================
  // NEW API DATA
  // SELECT CURRENT MARKETPLACE
  // ============================================================

  const selectedMarketplaceRows =
    marketplaceDetails.filter(
      (row) =>
        String(row?.marketplace || '')
          .toLowerCase() ===
        String(marketplace || '')
          .toLowerCase()
    );

  // ============================================================
  // TOTAL AD SPEND
  // ============================================================

  const adSpend =
    selectedMarketplaceRows.reduce(
      (total, row) =>
        total +
        Number(row?.ad_spend || 0),
      0
    );

  // ============================================================
  // TOTAL IMPRESSIONS
  // ============================================================

  const impressions =
    selectedMarketplaceRows.reduce(
      (total, row) =>
        total +
        Number(
          row?.ad_impressions || 0
        ),
      0
    );

  // ============================================================
  // TOTAL CLICKS
  // ============================================================

  const clicks =
    selectedMarketplaceRows.reduce(
      (total, row) =>
        total +
        Number(row?.ad_clicks || 0),
      0
    );

  // ============================================================
  // TOTAL ATTRIBUTED SALES
  // ============================================================

  const attributedSales =
    selectedMarketplaceRows.reduce(
      (total, row) =>
        total +
        Number(
          row?.ad_attributed_sales || 0
        ),
      0
    );

  // ============================================================
  // TOTAL ORDERS
  // ============================================================

  const orders =
    selectedMarketplaceRows.reduce(
      (total, row) =>
        total +
        Number(row?.ad_orders || 0),
      0
    );

  // ============================================================
  // TOTAL UNITS
  // ============================================================

  const units =
    selectedMarketplaceRows.reduce(
      (total, row) =>
        total +
        Number(row?.ad_units || 0),
      0
    );

  // ============================================================
  // ACOS
  // TOTAL SPEND / TOTAL SALES * 100
  // ============================================================

  const cardAcos =
    attributedSales > 0
      ? (adSpend / attributedSales) * 100
      : 0;

  // ============================================================
  // GRAPH DIMENSIONS
  // ============================================================

  const width = 900;
  const height = 300;

  const left = 55;
  const right = 55;
  const top = 22;
  const bottom = 62;

  const chartWidth =
    width - left - right;

  const chartHeight =
    height - top - bottom;

  const maxMoney = Math.max(
    1,
    ...points.flatMap((row) => [
      row.spend,
      row.sales,
    ])
  );

  const maxRoas = Math.max(
    1,
    ...points.map(
      (row) => row.roas
    )
  );



  const yMoney = (amount) =>
    top +
    chartHeight -
    (amount / maxMoney) *
    chartHeight;

  const yRoas = (amount) =>
    top +
    chartHeight -
    (amount / maxRoas) *
    chartHeight;

  const pathFor = (key, yFn) =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'
          } ${x(index)} ${yFn(
            point[key]
          )}`
      )
      .join(' ');

  const dateLabel = (dateString) => {
    if (!dateString) return '';

    const date = new Date(
      `${dateString}T00:00:00`
    );

    return date.toLocaleDateString(
      'en-IN',
      {
        day: '2-digit',
        month: 'short',
      }
    );
  };



  const innerWidth =
    chartWidth - left - right;

  const innerHeight =
    chartHeight - top - bottom;

  const maxValue = (values, minimum = 1) =>
    Math.max(
      minimum,
      ...values.map((value) =>
        Number(value || 0)
      )
    );

  const maxImpressions = maxValue(
    graphPoints.map(
      (row) => row.impressions
    )
  );

  const maxSpend = maxValue(
    graphPoints.map(
      (row) => row.spend
    )
  );

  const maxAcos = maxValue(
    graphPoints.map(
      (row) => row.acos
    ),
    10
  );

  const maxTacos = maxValue(
    graphPoints.map(
      (row) => row.tacos
    ),
    75
  );


  const x = (index) =>
    graphPoints.length <= 1
      ? left + innerWidth / 2
      : left +
      (index /
        (graphPoints.length - 1)) *
      innerWidth;

  const y = (value, max) =>
    top +
    innerHeight -
    (Number(value || 0) / max) *
    innerHeight;

  const path = (key, max) =>
    graphPoints
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'} ${x(
            index
          )} ${y(point[key], max)}`
      )
      .join(' ');
  const Chart = ({
    title,
    metric,
    max,
    formatter,
    leftTitle,
    rightTitle,
  }) => (
    <div
      style={{
        minWidth: 0,
        width: '100%',
      }}
    >
      <div
        style={{
          color: '#111214',
          fontSize: '13px',
          marginBottom: '4px',
        }}
      >
        {title}
      </div>

      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        style={{
          width: '100%',
          height: '265px',
          display: 'block',
          overflow: 'visible',
        }}
        preserveAspectRatio="none"
      >
        {[0, 0.25, 0.5, 0.75, 1].map(
          (ratio) => {
            const lineY =
              top +
              innerHeight * ratio;

            const axisValue =
              max * (1 - ratio);

            return (
              <g key={ratio}>
                {/* GRID LINE */}
                <line
                  x1={left}
                  y1={lineY}
                  x2={
                    chartWidth - right
                  }
                  y2={lineY}
                  stroke="#e8eaed"
                  strokeWidth="1"
                />

                {/* LEFT AXIS NUMBER */}
                <text
                  x={left - 20}
                  y={lineY + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#667085"
                >
                  {formatter(axisValue)}
                </text>

                {/* RIGHT AXIS NUMBER */}
                <text
                  x={
                    chartWidth -
                    right +
                    10
                  }
                  y={lineY + 4}
                  textAnchor="start"
                  fontSize="10"
                  fill="#667085"
                >
                  {formatter(axisValue)}
                </text>
              </g>
            );
          }
        )}

        {/* LEFT VERTICAL TITLE */}
        <text
          x="3"
          y={
            top +
            innerHeight / 2
          }
          transform={`rotate(-90 3 ${top +
            innerHeight / 2
            })`}
          textAnchor="middle"
          fontSize="10"
          fill="#667085"
        >
          {leftTitle}
        </text>

        {/* RIGHT VERTICAL TITLE */}
        <text
          x={chartWidth - 3}
          y={
            top +
            innerHeight / 2
          }
          transform={`rotate(90 ${chartWidth - 3
            } ${top +
            innerHeight / 2
            })`}
          textAnchor="middle"
          fontSize="10"
          fill="#667085"
        >
          {rightTitle}
        </text>

        {/* BARS + DATE LABELS */}
        {graphPoints.map(
          (point, index) => {
            const barWidth =
              Math.max(
                12,
                Math.min(
                  28,
                  innerWidth /
                  Math.max(
                    graphPoints.length *
                    2,
                    1
                  )
                )
              );

            const barY = y(
              point[metric],
              max
            );

            const barHeight =
              top +
              innerHeight -
              barY;

            return (
              <g
                key={`${metric}-${point.date}-${index}`}
              >
                {/* BAR */}
                <rect
                  x={
                    x(index) -
                    barWidth / 2
                  }
                  y={barY}
                  width={barWidth}
                  height={Math.max(
                    0,
                    barHeight
                  )}
                  rx="2"
                  fill="#f8b79f"
                  opacity="0.75"
                />

                {/* DATE */}
                <text
                  x={x(index)}
                  y={chartHeight - 45}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="500"
                  fill="#667085"
                  transform={`rotate(-10 ${x(index)
                    } ${chartHeight - 15
                    })`}
                >
                  {getDateLabel(
                    point.date
                  )}
                </text>
              </g>
            );
          }
        )}

        {/* LINE */}
        <path
          d={path(metric, max)}
          fill="none"
          stroke="#222222"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* POINTS */}
        {graphPoints.map(
          (point, index) => (
            <circle
              key={`line-${metric}-${point.date}-${index}`}
              cx={x(index)}
              cy={y(
                point[metric],
                max
              )}
              r="2.5"
              fill="#222222"
            />
          )
        )}
      </svg>
    </div>
  );

  return (
    <section className="marketplace-details-card">

      {/* ======================================================
          TITLE
      ====================================================== */}

      <div
        className="marketplace-trend"
        style={{
          marginBottom: '24px',
        }}
      >
        <h3
          style={{
            margin: '0 0 7px',
          }}
        >
          Marketplace trends
        </h3>

        <div
          style={{
            display: 'flex',
            gap: '7px',
            marginBottom: '10px',
          }}
        >
          <button
            type="button"
            onClick={() =>
              setMarketplace(
                'amazon_sc'
              )
            }
            style={{
              border: '1px solid #d0d5dd',
              borderRadius: '14px',
              padding: '3px 9px',
              background:
                marketplace ===
                  'amazon_sc'
                  ? '#f5f5f5'
                  : '#fff',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#222',
                marginRight: '4px',
              }}
            />
            Amazon
          </button>

          <button
            type="button"
            onClick={() =>
              setMarketplace('d2c')
            }
            style={{
              border: '1px solid #d0d5dd',
              borderRadius: '14px',
              padding: '3px 9px',
              background:
                marketplace === 'd2c'
                  ? '#f5f5f5'
                  : '#fff',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#258c3d',
                marginRight: '4px',
              }}
            />
            D2C
          </button>
        </div>

        {trendLoading ? (
          <div className="marketplace-chart-state">
            Loading marketplace trends…
          </div>
        ) : trendError ? (
          <div className="marketplace-chart-state marketplace-chart-error">
            {trendError}
          </div>
        ) : !graphPoints.length ? (
          <div className="marketplace-chart-state">
            No marketplace trend found.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(2, minmax(0, 1fr))',
              gap: '24px 28px',
              width: '100%',
            }}
          >
            <Chart
              title="Ad Impressions"
              metric="impressions"
              max={maxImpressions}
              formatter={compact}
              leftTitle="Marketplace Impressions"
              rightTitle="Total Impressions"
            />

            <Chart
              title="Ad Spend (₹)"
              metric="spend"
              max={maxSpend}
              formatter={rupee}
              leftTitle="Marketplace Ad Spend (₹)"
              rightTitle="Total Ad Spend (₹)"
            />

            <Chart
              title="ACOS (%)"
              metric="acos"
              max={maxAcos}
              formatter={percent}
              leftTitle="Marketplace ACOS (%)"
              rightTitle="Total ACOS (%)"
            />

            <Chart
              title="TACOS (%)"
              metric="tacos"
              max={maxTacos}
              formatter={percent}
              leftTitle="Marketplace TACOS (%)"
              rightTitle="Total TACOS (%)"
            />
          </div>
        )}
      </div>


      <div className="marketplace-details-title">
        <h2>Marketplace Details</h2>
      </div>

      {/* ======================================================
          MARKETPLACE TABS
      ====================================================== */}

      <div
        className="marketplace-tabs"
        role="tablist"
      >
        {MARKETPLACES.map(
          ([id, name]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={
                marketplace === id
              }
              className={
                marketplace === id
                  ? 'active'
                  : ''
              }
              onClick={() =>
                setMarketplace(id)
              }
            >
              {name}
            </button>
          )
        )}
      </div>

      {/* ======================================================
          MARKETPLACE SUMMARY
          DATA FROM NEW API
      ====================================================== */}

      <div className="marketplace-summary">

        {/* AD SPEND */}

        <div className="marketplace-stat marketplace-stat-spend">
          <span className="marketplace-stat-icon">
            ₹
          </span>

          <div>
            <strong>
              {detailsLoading
                ? '—'
                : formatMoney(adSpend)}
            </strong>

            <small>
              Ad spend
            </small>
          </div>
        </div>

        {/* IMPRESSIONS */}

        <div className="marketplace-stat marketplace-stat-impressions">
          <span className="marketplace-stat-icon">
            ◉
          </span>

          <div>
            <strong>
              {detailsLoading
                ? '—'
                : formatCompact(
                  impressions
                )}
            </strong>

            <small>
              Ad Impressions
            </small>
          </div>
        </div>

        {/* CLICKS */}

        <div className="marketplace-stat marketplace-stat-clicks">
          <span className="marketplace-stat-icon">
            ✣
          </span>

          <div>
            <strong>
              {detailsLoading
                ? '—'
                : formatCompact(
                  clicks
                )}
            </strong>

            <small>
              Clicks
            </small>
          </div>
        </div>

        {/* ATTRIBUTED SALES */}

        <div className="marketplace-stat marketplace-stat-sales">
          <span className="marketplace-stat-icon">
            ▣
          </span>

          <div>
            <strong>
              {detailsLoading
                ? '—'
                : formatMoney(
                  attributedSales
                )}
            </strong>

            <small>
              Attributed sales
            </small>
          </div>
        </div>

        {/* ORDERS */}

        <div className="marketplace-stat marketplace-stat-orders">
          <span className="marketplace-stat-icon">
            □
          </span>

          <div>
            <strong>
              {detailsLoading
                ? '—'
                : formatCompact(
                  orders
                )}
            </strong>

            <small>
              Orders
            </small>
          </div>
        </div>

        {/* ACOS */}

        <div className="marketplace-stat marketplace-stat-acos">
          <span className="marketplace-stat-icon">
            ⌁
          </span>

          <div>
            <strong>
              {detailsLoading
                ? '—'
                : `${cardAcos.toFixed(
                  2
                )}%`}
            </strong>

            <small>
              ACOS
            </small>
          </div>
        </div>

      </div>

      {/* NEW API ERROR */}

      {detailsError && (
        <div className="marketplace-chart-state marketplace-chart-error">
          {detailsError}
        </div>
      )}

      {/* ======================================================
          GRAPH
          DATA ONLY FROM OLD API
      ====================================================== */}

      <div className="marketplace-trend">

        <h3>
          Marketplace trend
        </h3>

        <p>
          Attributed sales (bars),
          spend (line), ROAS
          (dashed, right axis)
        </p>

        <div className="marketplace-trend-meta">

          <div className="marketplace-legend">

            <span>
              <i className="legend-dot legend-sales" />
              Attributed sales
            </span>

            <span>
              <i className="legend-dot legend-spend" />
              Spend
            </span>

            <span>
              <i className="legend-dot legend-roas" />
              ROAS
            </span>

          </div>

          <span className="marketplace-roas-total">
            ROAS{' '}
            {graphRoas.toFixed(2)}
            x
          </span>

        </div>

        {/* GRAPH LOADING */}

        {loading ? (
          <div className="marketplace-chart-state">
            Loading marketplace trend…
          </div>
        ) : error ? (
          <div className="marketplace-chart-state marketplace-chart-error">
            {error}
          </div>
        ) : !points.length ? (
          <div className="marketplace-chart-state">
            No marketplace trend
            found.
          </div>
        ) : (
          <div className="marketplace-chart-scroll">

            <svg
              className="marketplace-chart"
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
            >

              {/* GRID */}

              {[0, 0.25, 0.5, 0.75, 1].map(
                (ratio) => {
                  const y =
                    top +
                    chartHeight *
                    ratio;

                  const moneyValue =
                    maxMoney *
                    (1 - ratio);

                  const roasValue =
                    maxRoas *
                    (1 - ratio);

                  return (
                    <g key={ratio}>

                      <line
                        x1={left}
                        y1={y}
                        x2={
                          width - right
                        }
                        y2={y}
                        className="marketplace-grid-line"
                      />

                      <text
                        x={width - right + 10}
                        y={y + 4}
                        textAnchor="end"
                        className="marketplace-axis-label"
                      >
                        ₹
                        {Math.round(
                          moneyValue
                        ).toLocaleString(
                          'en-IN'
                        )}
                      </text>

                      <text
                        x={
                          width -
                          right +
                          10
                        }
                        y={y + 4}
                        className="marketplace-axis-label"
                      >
                        {roasValue.toFixed(
                          2
                        )}
                        x
                      </text>

                    </g>
                  );
                }
              )}

              {/* SALES BARS */}

              {points.map(
                (point, index) => {
                  const barWidth =
                    Math.max(
                      18,
                      Math.min(
                        48,
                        chartWidth /
                        Math.max(
                          points.length *
                          2,
                          1
                        )
                      )
                    );

                  const barY =
                    yMoney(
                      point.sales
                    );

                  const barHeight =
                    top +
                    chartHeight -
                    barY;

                  return (
                    <g
                      key={`${point.date}-${index}`}
                    >

                      <rect
                        x={
                          x(index) -
                          barWidth / 2
                        }
                        y={barY}
                        width={
                          barWidth
                        }
                        height={Math.max(
                          0,
                          barHeight
                        )}
                        rx="3"
                        className="marketplace-sales-bar"
                      />

                      <text
                        x={x(index)}
                        y={
                          height - 5
                        }
                        textAnchor="middle"
                        className="marketplace-axis-label"
                      >
                        {dateLabel(
                          point.date
                        )}
                      </text>

                    </g>
                  );
                }
              )}

              {/* SPEND LINE */}

              <path
                d={pathFor(
                  'spend',
                  yMoney
                )}
                className="marketplace-spend-line"
              />

              {/* SPEND POINTS */}

              {points.map(
                (point, index) => (
                  <circle
                    key={`spend-${point.date}-${index}`}
                    cx={x(index)}
                    cy={yMoney(
                      point.spend
                    )}
                    r="4"
                    className="marketplace-spend-point"
                  />
                )
              )}

              {/* ROAS LINE */}

              <path
                d={pathFor(
                  'roas',
                  yRoas
                )}
                className="marketplace-roas-line"
              />

              {/* ROAS POINTS */}

              {points.map(
                (point, index) => (
                  <circle
                    key={`roas-${point.date}-${index}`}
                    cx={x(index)}
                    cy={yRoas(
                      point.roas
                    )}
                    r="3"
                    className="marketplace-roas-point"
                  />
                )
              )}

            </svg>

          </div>
        )}

      </div>
    </section>
  );
}

// ============================================================
// REPORT COMPONENT
// OLD fetchAdvertising API UNTOUCHED
// ============================================================

function Report({ kind, dates }) {
  const product = kind === 'sku';

  const [tab, setTab] = useState(
    'worst_performing'
  );

  const [query, setQuery] = useState({
    limit: 10,
    offset: 0,
    sortBy: product
      ? 'ad_spend'
      : 'roas',
    sortOrder: 'asc',
  });

  const [search, setSearch] =
    useState('');

  const [searchInput, setSearchInput] =
    useState('');

  const [result, setResult] =
    useState({
      rows: [],
      total: null,
      hasNext: false,
    });

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [refresh, setRefresh] =
    useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);

      setQuery((q) => ({
        ...q,
        offset: 0,
      }));
    }, 350);

    return () =>
      clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const controller =
      new AbortController();

    setLoading(true);
    setError('');

    const params = {
      ...dates,
      ...query,

      ...(product
        ? {
          tab,
          search,
          marketplace:
            'amazon_sc',
        }
        : {
          level: 'campaign',
        }),
    };

    // ========================================================
    // OLD REPORT API
    // DO NOT CHANGE
    // ========================================================

    fetchAdvertising(
      kind,
      params,
      controller.signal
    )
      .then((data) => {
        if (
          !controller.signal
            .aborted
        ) {
          setResult(data);
        }
      })
      .catch((err) => {
        if (
          !controller.signal
            .aborted
        ) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (
          !controller.signal
            .aborted
        ) {
          setLoading(false);
        }
      });

    return () =>
      controller.abort();
  }, [
    kind,
    dates,
    query,
    tab,
    search,
    refresh,
    product,
  ]);

  const columns = product
    ? PRODUCT
    : CAMPAIGN;

  const changeTab = ([
    id,
    ,
    ,
    sortOrder,
  ]) => {
    setTab(id);

    setQuery((q) => ({
      ...q,
      offset: 0,
      sortBy: product
        ? 'ad_spend'
        : 'roas',
      sortOrder,
    }));
  };

  return (
    <section
      className="performance-card"
      aria-busy={loading}
    >

      <div className="performance-card-heading">

        <h2>
          {product
            ? 'Product Intelligence'
            : 'Campaign Spotlight'}
        </h2>

        <div className="performance-tools">

          {product && (
            <input
              aria-label="Search product"
              placeholder="Search product…"
              value={
                searchInput
              }
              onChange={(e) =>
                setSearchInput(
                  e.target.value
                )
              }
            />
          )}

        </div>

      </div>

      <div
        className="performance-tabs"
        role="tablist"
        aria-label={
          product
            ? 'Product performance'
            : 'Campaign performance'
        }
      >

        {TABS.slice(
          0,
          product ? 4 : 3
        ).map((item) => (
          <button
            key={item[0]}
            role="tab"
            aria-selected={
              tab === item[0]
            }
            className={
              tab === item[0]
                ? 'selected'
                : ''
            }
            onClick={() =>
              changeTab(item)
            }
          >
            {tab === item[0] &&
              (query.sortOrder ===
                'asc'
                ? '↑ '
                : '↓ ')}

            {item[1]}
          </button>
        ))}

      </div>

      {loading ? (
        <p
          className="performance-message"
          role="status"
        >
          Loading{' '}
          {product
            ? 'products'
            : 'campaigns'}
          …
        </p>
      ) : error ? (
        <div
          className="performance-message"
          role="alert"
        >
          <p>{error}</p>
        </div>
      ) : (
        <div className="performance-table-scroll">

          <table className="performance-table">

            <thead>

              <tr>

                <th>
                  {product
                    ? 'Product'
                    : 'Campaign'}
                </th>

                {columns.map(
                  ([key, title]) => (
                    <th
                      key={key}
                      aria-sort={
                        query.sortBy ===
                          key
                          ? query.sortOrder ===
                            'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      <button
                        onClick={() =>
                          setQuery(
                            (q) => ({
                              ...q,
                              offset: 0,
                              sortBy: key,
                              sortOrder:
                                q.sortBy ===
                                  key &&
                                  q.sortOrder ===
                                  'asc'
                                  ? 'desc'
                                  : 'asc',
                            })
                          )
                        }
                      >
                        {query.sortBy ===
                          key &&
                          (query.sortOrder ===
                            'asc'
                            ? '↑ '
                            : '↓ ')}

                        {title}
                      </button>
                    </th>
                  )
                )}

              </tr>

            </thead>

            <tbody>

              {result.rows.map(
                (row, index) => (
                  <tr
                    key={
                      row.id ||
                      row.sku ||
                      row.asin ||
                      index
                    }
                  >

                    <td>

                      <div className="performance-identity">

                        <span
                          className="performance-avatar"
                          aria-hidden="true"
                        >
                          {product
                            ? '▦'
                            : 'ϟ'}
                        </span>

                        <div>

                          <strong>
                            {product
                              ? field(
                                row,
                                'asin',
                                'sku',
                                'product_id',
                                'productId'
                              ) ??
                              '—'
                              : field(
                                row,
                                'campaign_name',
                                'campaignName',
                                'name'
                              ) ??
                              '—'}
                          </strong>

                          <small>
                            {product
                              ? field(
                                row,
                                'product_title',
                                'product_name',
                                'productName',
                                'title',
                                'name'
                              )
                              : field(
                                row,
                                'campaign_id',
                                'campaignId',
                                'id'
                              )}
                          </small>

                        </div>

                      </div>

                    </td>

                    {columns.map(
                      ([
                        key,
                        ,
                        aliases,
                        type,
                      ]) => (
                        <td key={key}>
                          {format(
                            field(
                              row,
                              ...aliases
                            ),
                            type
                          )}
                        </td>
                      )
                    )}

                  </tr>
                )
              )}

            </tbody>

          </table>

          {!result.rows.length && (
            <p className="performance-message">
              No{' '}
              {product
                ? 'products'
                : 'campaigns'}{' '}
              found for these
              filters.
            </p>
          )}

        </div>
      )}

      <div className="performance-pagination">

        <label>
          Rows per page:{' '}

          <select
            value={query.limit}
            onChange={(e) =>
              setQuery((q) => ({
                ...q,
                limit: Number(
                  e.target.value
                ),
                offset: 0,
              }))
            }
          >
            {[10, 25, 50, 100].map(
              (n) => (
                <option
                  key={n}
                  value={n}
                >
                  {n}
                </option>
              )
            )}
          </select>
        </label>

        <span>
          {loading
            ? 'Loading…'
            : error
              ? 'Unavailable'
              : `${result.rows
                .length
                ? query.offset + 1
                : 0
              }–${query.offset +
              result.rows.length
              }${result.total ==
                null
                ? ''
                : ` of ${result.total}`
              }`}
        </span>

        <button
          aria-label="Previous page"
          disabled={
            loading ||
            query.offset === 0
          }
          onClick={() =>
            setQuery((q) => ({
              ...q,
              offset: Math.max(
                0,
                q.offset - q.limit
              ),
            }))
          }
        >
          ‹
        </button>

        <button
          aria-label="Next page"
          disabled={
            loading ||
            !!error ||
            !result.hasNext
          }
          onClick={() =>
            setQuery((q) => ({
              ...q,
              offset:
                q.offset + q.limit,
            }))
          }
        >
          ›
        </button>

      </div>

    </section>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function AdvertisingPage() {
  const [dates, setDates] =
    useState({
      startDate:
        '2026-09-08',
      endDate:
        '2026-09-14',
    });

  // NEW API TIME PERIOD
  const [
    trendTimePeriod,
    setTrendTimePeriod,
  ] = useState('7D');

  const [draft, setDraft] =
    useState(dates);

  const valid =
    draft.startDate &&
    draft.endDate &&
    draft.startDate <=
    draft.endDate;

  return (
    <div className="content advertising-page">

      {/* ======================================================
          FILTERS
      ====================================================== */}

      <form
        className="performance-filters"
        onSubmit={(e) => {
          e.preventDefault();

          if (valid) {
            setDates({
              ...draft,
            });

            // NEW API:
            // CUSTOM after Apply
            setTrendTimePeriod(
              'CUSTOM'
            );
          }
        }}
      >

        <div>

          <h2>
            Amazon Advertising
          </h2>

          <p>
            Amazon Seller Central ·
            Product and campaign
            performance
          </p>

        </div>

        <label>
          From

          <input
            type="date"
            required
            value={
              draft.startDate
            }
            max={
              draft.endDate
            }
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                startDate:
                  e.target.value,
              }))
            }
          />

        </label>

        <label>
          To

          <input
            type="date"
            required
            value={
              draft.endDate
            }
            min={
              draft.startDate
            }
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                endDate:
                  e.target.value,
              }))
            }
          />

        </label>

        <button
          type="submit"
          disabled={!valid}
        >
          Apply dates
        </button>

      </form>

      {/* ======================================================
          MARKETPLACE
          
          GRAPH:
          /marketplace-daily-trend
          
          CARDS:
          /ad-spends-by-marketplace-daily
      ====================================================== */}

      <MarketplaceTrend
        dates={dates}
        timePeriod={
          trendTimePeriod
        }
      />

      {/* ======================================================
          PRODUCT REPORT
          OLD fetchAdvertising API
      ====================================================== */}

      <Report
        key={`sku-${dates.startDate}-${dates.endDate}`}
        kind="sku"
        dates={dates}
      />

      {/* ======================================================
          CAMPAIGN REPORT
          OLD fetchAdvertising API
      ====================================================== */}

      <Report
        key={`campaign-${dates.startDate}-${dates.endDate}`}
        kind="campaign"
        dates={dates}
      />

    </div>
  );
}