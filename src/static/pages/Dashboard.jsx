import { useEffect, useMemo, useState } from "react";
import { charts, metrics, buildDynamicCharts, buildDynamicMetrics } from "../data/mockData";
import { Icon, DataTable, Search, Toggle, Button } from "../components/UI";
import {
  fetchAmazonProducts,
  fetchBrandSalesSummary,
  fetchAmazonPerformance,
} from "../../apiFile/amazonApi";
import ProductPerformancePage from "../../pages/ProductPerformancePage";

function smoothPath(points) {
  return points.reduce((d, p, i) => {
    if (!p) return d;
    if (!i || !points[i - 1]) return `${d} M ${p[0]} ${p[1]}`;

    const prev = points[i - 1];
    const mid = (p[0] + prev[0]) / 2;

    return `${d} C ${mid} ${prev[1]}, ${mid} ${p[1]}, ${p[0]} ${p[1]}`;
  }, "");
}


const loaderStyles = `
  @keyframes dashboard-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes dashboard-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }
`;

function DashboardLoaderStyles() {
  return <style>{loaderStyles}</style>;
}

function formatChartValue(value, max) {
  const number = Number(value) || 0;

  if (max >= 1000000) {
    return `${(number / 1000000).toFixed(2)}M`;
  }

  if (max >= 1000) {
    return `${(number / 1000).toFixed(2)}k`;
  }

  if (Number.isInteger(number)) {
    return number.toString();
  }

  return number.toFixed(2);
}

function formatDateLabel(dateString) {
  if (!dateString) return "";

  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return `${date.getDate()}, ${date.toLocaleDateString("en-US", {
    weekday: "short",
  })}`;
}

function formatTooltipDate(dateString) {
  if (!dateString) return "";

  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}


function Loader({ size = 22 }) {
  return (
    <span
      className="dashboard-loader"
      style={{
        width: size,
        height: size,
        border: `${Math.max(2, Math.round(size / 9))}px solid #e5e7eb`,
        borderTopColor: "#f47f4d",
        borderRadius: "50%",
        display: "inline-block",
        animation: "dashboard-spin 0.8s linear infinite",
        flexShrink: 0,
      }}
      aria-label="Loading"
    />
  );
}

function SectionLoader({ height = 180 }) {
  return (
    <div
      className="dashboard-section-loader"
      style={{
        minHeight: height,
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Loader size={30} />
    </div>
  );
}

function MetricLoader() {
  return (
    <div
      className="metric"
      style={{
        minHeight: 52,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: "#f1f3f5",
          display: "inline-block",
          animation: "dashboard-pulse 1.2s ease-in-out infinite",
        }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            width: "65%",
            height: 14,
            borderRadius: 4,
            background: "#eef0f3",
            marginBottom: 7,
            animation: "dashboard-pulse 1.2s ease-in-out infinite",
          }}
        />
        <div
          style={{
            width: "45%",
            height: 10,
            borderRadius: 4,
            background: "#f2f3f5",
            animation: "dashboard-pulse 1.2s ease-in-out infinite",
          }}
        />
      </div>
    </div>
  );
}

function ChartLoader({ title = "Loading..." }) {
  return (
    <section className="card chart-card">
      <h2>{title}</h2>
      <p>Fetching Amazon data...</p>
      <SectionLoader height={250} />
    </section>
  );
}

function TableLoader() {
  return (
    <div
      style={{
        minHeight: 230,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Loader size={30} />
    </div>
  );
}

export function ChartCard({ chart, compact = false, factor = 1 }) {
  const [hover, setHover] = useState(null);

  // Dynamic Amazon charts use `values`.
  // Existing mock charts still use `bars` + `line`.
  const isDynamic = Array.isArray(chart.values);

  const rawValues = isDynamic
    ? chart.values.map((value) => value == null ? null : Number(value) || 0)
    : chart.line.map((value) => Number(value) || 0);

  const maxValue = Math.max(Number(chart.max) || 1, 1);

  const normalizedValues = isDynamic
    ? rawValues.map((value) => value == null ? null : (value / maxValue) * 100)
    : rawValues;

  const chartFactor = isDynamic ? 1 : factor;
  const points = normalizedValues.map((value, i) => value == null ? null : [
    65 + i * 69,
    270 - value * 2.35 * chartFactor,
  ]);

  const labels = chart.dates || [];

  return (
    <section className={`card chart-card ${compact ? "compact" : ""}`}>
      <h2>{chart.title}</h2>

      {chart.subtitle && <p>{chart.subtitle}</p>}

      <div className="chart-wrap">
        <svg
          viewBox="0 0 560 320"
          role="img"
          aria-label={`${chart.title}: daily data`}
        >
          <defs>
            <linearGradient
              id={`bar-${chart.title.replaceAll(/[^a-z]/gi, "")}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#f47f4d" stopOpacity=".82" />
              <stop offset="100%" stopColor="#f6a07d" stopOpacity=".58" />
            </linearGradient>
          </defs>

          {/* Grid */}
          {Array.from({ length: 11 }, (_, i) => {
            const tickValue = (maxValue * (10 - i)) / 10;

            return (
              <g key={i}>
                <line
                  x1="48"
                  x2="510"
                  y1={35 + i * 23.5}
                  y2={35 + i * 23.5}
                  stroke="var(--grid)"
                  // stroke="#171717"
                  strokeDasharray="6 7"
                />

                <text
                  x="43"
                  y={39 + i * 23.5}
                  textAnchor="end"
                >
                  {formatChartValue(tickValue, maxValue)}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {normalizedValues.map((value, i) => {
            const barHeight = Math.max(
              0,
              value * 2.35 * chartFactor
            );

            return (
              <g
                key={i}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <rect
                  x={53 + i * 69}
                  y={270 - barHeight}
                  width="25"
                  height={barHeight}
                  rx="1"
                  fill={`url(#bar-${chart.title.replaceAll(
                    /[^a-z]/gi,
                    ""
                  )})`}
                />

                {/* Hover area */}
                <rect
                  x={43 + i * 69}
                  y="30"
                  width="48"
                  height="248"
                  fill="transparent"
                />

                <text
                  x={65 + i * 69}
                  y="291"
                  textAnchor="middle"
                >
                  {labels[i]
                    ? formatDateLabel(labels[i])
                    : `${9 + i}, (${[
                      "Wed",
                      "Thu",
                      "Fri",
                      "Sat",
                      "Sun",
                      "Mon",
                      "Tue",
                    ][i]
                    })`}
                </text>
              </g>
            );
          })}

          {/* Line */}
          {points.length > 0 && (
            <path
              d={smoothPath(points)}
              fill="none"
              stroke="var(--chart-line)"
              strokeWidth="1.7"
            />
          )}

          <text
            transform="translate(12 166) rotate(-90)"
            textAnchor="middle"
          >
            {chart.axis}
          </text>

          <text
            transform="translate(544 166) rotate(90)"
            textAnchor="middle"
          >
            {chart.right}
          </text>

          {/* Tooltip */}
          {hover !== null && points[hover] && (
            <g pointerEvents="none">
              <rect
                x={Math.min(points[hover][0], 400)}
                y="38"
                width="132"
                height="55"
                rx="4"
                fill="var(--panel)"
                stroke="var(--border)"
              />

              <text
                x={Math.min(points[hover][0], 400) + 8}
                y="55"
              >
                {labels[hover]
                  ? formatTooltipDate(labels[hover])
                  : `${9 + hover} Sep, 2026`}
              </text>

              <text
                x={Math.min(points[hover][0], 400) + 8}
                y="76"
              >
                {isDynamic
                  ? chart.title === "Unit Statistics"
                    ? `Units: ${Number(
                      rawValues[hover] || 0
                    ).toLocaleString("en-IN")}`
                    : `Revenue: ${chart.currency ? chart.currency + ' ' : '₹'}${Number(
                      rawValues[hover] || 0
                    ).toLocaleString("en-IN")}`
                  : `Sample: ${Math.round(
                    ((chart.bars?.[hover] || 0) *
                      chart.max) /
                    100 *
                    factor
                  )}`}
              </text>
            </g>
          )}
        </svg>
      </div>
    </section>
  );
}

export default function Dashboard({
  organization,
  advertising,
  market,
  period,
}) {
  const [query, setQuery] = useState("");
  const [onlyInventory, setOnlyInventory] = useState(false);

  const factor = market
    ? 0.72
    : period === "30D"
      ? 0.9
      : 1;

  // ============================================
  // AMAZON PERFORMANCE
  // ============================================

  const [amazonPerformance, setAmazonPerformance] =
    useState(null);

  const [performanceLoading, setPerformanceLoading] =
    useState(false);

  const [performanceError, setPerformanceError] =
    useState("");

  useEffect(() => {
    const controller = new AbortController();
    let performanceTimer;

    const loadAmazonPerformance = async () => {
      try {
        setPerformanceLoading(true);
        setPerformanceError("");

        const result = await fetchAmazonPerformance({
          signal: controller.signal,
          organization,
        });

        if (!controller.signal.aborted) {
          setAmazonPerformance(result);
          if (result.complete === false) performanceTimer = setTimeout(loadAmazonPerformance, 10000);
        }
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }

        console.error(
          "Failed to fetch Amazon performance:",
          error
        );

        setPerformanceError(
          error?.message ||
          "Failed to load Amazon performance"
        );
      } finally {
        setPerformanceLoading(false);
      }
    };

    loadAmazonPerformance();

    return () => { controller.abort(); clearTimeout(performanceTimer); };
  }, [organization]);

  // ============================================
  // BRAND SALES SUMMARY
  // ============================================

  const [brandSummary, setBrandSummary] = useState([]);
  const [brandSalesRefreshing, setBrandSalesRefreshing] = useState(false);
  const [brandLoading, setBrandLoading] =
    useState(false);

  useEffect(() => {
    const controller = new AbortController();

    let timer;
    setBrandSalesRefreshing(false);
    setBrandSummary([]);
    const loadBrandSummary = async (background = false) => {
      try {
        if (!background) setBrandLoading(true);

        const result = await fetchBrandSalesSummary({
          signal: controller.signal,
          organization,
        });

        if (!controller.signal.aborted) {
          setBrandSummary(result?.data || []);
          const pending = Boolean(result?.metadata?.salesRefreshing);
          setBrandSalesRefreshing(pending);
          // Fetch the completed result once, without continuous polling.
          if (pending && !background) timer = setTimeout(() => loadBrandSummary(true), 75000);
        }
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }

        console.error(
          "Failed to fetch brand sales summary:",
          error
        );

        setBrandSummary([]);
          } finally {
        if (!controller.signal.aborted) setBrandLoading(false);
      }
    };

    loadBrandSummary();

    return () => { controller.abort(); clearTimeout(timer); };
  }, [organization]);

  // ============================================
  // DYNAMIC CHARTS
  // ============================================

  const dynamicCharts = useMemo(() => {
    if (!amazonPerformance?.success) {
      return [];
    }

    return buildDynamicCharts(amazonPerformance);
  }, [amazonPerformance]);

  // ============================================
  // DYNAMIC METRICS
  // ============================================

  const dynamicMetrics = useMemo(() => {
    if (!amazonPerformance?.success) {
      return metrics;
    }

    return buildDynamicMetrics(amazonPerformance);
  }, [amazonPerformance]);

  // ============================================
  // FINAL CHART LIST
  // ============================================

  const visibleCharts = advertising
    ? charts.slice(2)
    : dynamicCharts;

  return (
    <>
      <DashboardLoaderStyles />

      {/* Advertising intro */}
      {advertising && (
        <div className="card intro">
          <h2>Advertising Overview</h2>
          <p>
            Cross-marketplace ads summary and
            performance trends
          </p>
        </div>
      )}

      {/* ============================================
          METRICS
          ============================================ */}

      <section className="card metrics">
        {performanceLoading
          ? dynamicMetrics
            .filter(
              (m) =>
                !advertising ||
                m.label !== "Total sales"
            )
            .map((m) => (
              <MetricLoader key={m.label} />
            ))
          : dynamicMetrics
            .filter(
              (m) =>
                !advertising ||
                m.label !== "Total sales"
            )
            .map((m) => (
              <div
                className="metric"
                key={m.label}
              >
                <span
                  className={`metric-icon ${m.color}`}
                >
                  <Icon
                    name={m.icon}
                    size={17}
                  />
                </span>

                <div>
                  <strong>{m.value}</strong>
                  <small>{m.label}</small>
                </div>
              </div>
            ))}
      </section>

      {/* {market && (
        <div className="filter-note">
          {market} · Sample marketplace view
        </div>
      )} */}

      {/* ============================================
          CHARTS
          ============================================ */}

      {!advertising && performanceLoading && (
        <div className="chart-grid">
          <ChartLoader title="Revenue Statistics" />
          <ChartLoader title="Unit Statistics" />
        </div>
      )}

      {!advertising &&
        performanceError &&
        !performanceLoading && (
          <div
            className="card"
            style={{
              marginBottom: 16,
              color: "#b42318",
            }}
          >
            <p>
              Unable to load Amazon sales performance:{" "}
              {performanceError}
            </p>
          </div>
        )}

      {!advertising &&
        !performanceLoading &&
        !performanceError &&
        visibleCharts.length > 0 && (
          <div className="chart-grid">
            {visibleCharts.map((chart) => (
              <ChartCard
                key={chart.title}
                chart={chart}
                factor={factor}
              />
            ))}
          </div>
        )}

      {advertising && (
        <div className="chart-grid">
          {visibleCharts.map((chart) => (
            <ChartCard
              key={chart.title}
              chart={chart}
              factor={factor}
            />
          ))}
        </div>
      )}

      {/* ============================================
          BRAND + PRODUCT SECTIONS
          ============================================ */}

      {!advertising && (
        <>
          <section className="card summary-card">
            <h2>Brand Sales Summary</h2>
            {brandSalesRefreshing && <p role="status">Sales metrics are updating. One automatic refresh runs after 75 seconds; reload if values are still incomplete.</p>}

            <p>
              All products by brand. DRR = ordered units ÷ days; Revenue = ordered revenue.
            </p>

            <div className="toolbar">
              <Search
                placeholder="Search brands..."
                value={query}
                onChange={(e) =>
                  setQuery(e.target.value)
                }
              />

              <Toggle
                label="Show products with inventory only"
                checked={onlyInventory}
                onChange={(e) =>
                  setOnlyInventory(
                    e.target.checked
                  )
                }
              />

              <Button
                onClick={() => {
                  setQuery("");
                  setOnlyInventory(false);
                }}
              >
                Clear filters
              </Button>
            </div>

            {brandLoading ? (
              <TableLoader />
            ) : (
              <DataTable
                columns={['Brand', ...[1, 7, 15, 30].map(days => `DRR ${days}D`),
                  ...[1, 7, 15, 30].map(days => `Revenue ${days}D`)].map(label => ({label, key: label}))}
                rows={(() => {
                  const brands = brandSummary.filter(brand => String(brand.brand || '').toLowerCase().includes(query.toLowerCase()))
                    .filter(brand => !onlyInventory || Number(brand.totalInventory || 0) > 0);
                  return brands.map(brand => ({
                    Brand: brand.brand || '—',
                    ...Object.fromEntries([1, 7, 15, 30].map(days => [`DRR ${days}D`, brand[`drr${days}d`] == null ? '—' : Number(brand[`drr${days}d`]).toFixed(2)])),
                    ...Object.fromEntries([1, 7, 15, 30].map(days => [`Revenue ${days}D`, brand[`revenue${days}d`] == null ? '—' : `₹${Number(brand[`revenue${days}d`]).toLocaleString('en-IN', {maximumFractionDigits: 2})}`])),
                  }));
                })()}
              />
            )}
          </section>

          <section className="card summary-card">
            <ProductPerformancePage organization={organization} />
          </section>

          <section className="card summary-card">
            <h2>Listing Health Snapshot</h2>

            <p>Total listings: 36</p>

            {[
              ["Active", 21, "green"],
              ["Discontinued", 15, "gray"],
              ["Inactive", 0, "pink"],
              ["Out Of Stock", 0, "amber"],
              ["Suppressed", 0, "cyan"],
              ["Unknown", 0, "gray"],
              ["Total", 36, "pink"],
            ].map(
              ([name, count, color]) => (
                <div
                  className="health-row"
                  key={name}
                >
                  <span
                    className={`metric-icon ${color}`}
                  >
                    <Icon
                      name={
                        name === "Active"
                          ? "CircleCheck"
                          : "Box"
                      }
                      size={15}
                    />
                  </span>

                  {name}

                  <b>{count}</b>
                </div>
              )
            )}
          </section>
        </>
      )}
    </>
  );
}
