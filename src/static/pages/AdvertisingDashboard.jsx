import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/UI";
import "./AdvertisingDashboard.css";

const markets = ["Amazon", "Flipkart", "Myntra", "Blinkit", "Zepto", "Meesho", "D2C", "Nykaa", "Swiggy", "Blinkit B2B"];
const colors = { Amazon: "#252525", Flipkart: "#1455ac", D2C: "#318b42" };
const money = value => value == null ? "—" : `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const number = value => value == null ? "—" : Number(value).toLocaleString("en-IN");
const percent = value => value == null ? "—" : `${Number(value).toFixed(2)}%`;
const ratio = (a, b) => b ? a / b : null;
function MetricStrip({ totals, details = false }) {
  const entries = [["Ad spend", money(totals?.cost), "IndianRupee", "orange"], ["Ad Impressions", number(totals?.impressions), "Eye", "cyan"],
    ["Clicks", number(totals?.clicks), "MousePointerClick", "gray"], ["Attributed sales", money(totals?.sales7d), "ShoppingCart", "green"],
    details ? ["Orders", number(totals?.purchases7d), "Box", "amber"] : ["ACOS", percent(totals?.acos), "ChartNoAxesCombined", "pink"],
    details ? ["ACOS", percent(totals?.acos), "ChartNoAxesCombined", "pink"] : ["tACOS", percent(totals?.tacos), "Coins", "amber"]];
  return <div className="ads-metrics">{entries.map(([label, value, icon, color]) => <div className="ads-metric" key={label}>
    <span className={`ads-icon ${color}`}><Icon name={icon} size={18} /></span><div><strong>{value}</strong><small>{label}</small></div></div>)}</div>;
}
function Tabs({ items, value, onChange, label }) {
  return <div className="ads-tabs" role="tablist" aria-label={label}>{items.map(item => <button key={item} role="tab" aria-selected={value === item} className={value === item ? "active" : ""} onClick={() => onChange(item)}>{item}</button>)}</div>;
}
function TrendChart({ title, dates, series, kind = "number", combined = false }) {
  const [hover, setHover] = useState(null);
  const valid = series.some(row => row.value != null);
  const max = Math.max(kind === "percent" ? 10 : 1, ...series.flatMap(row => [Number(row.value) || 0, Number(row.sales) || 0]));
  const x = index => 64 + index * 496 / Math.max(dates.length - 1, 1);
  const y = value => 240 - (Number(value) || 0) / max * 200;
  const label = value => kind === "percent" ? `${value.toFixed(0)}%` : kind === "money" ? `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return <div className={`ads-chart ${combined ? "combined" : ""}`}><h4>{title}</h4>
    <svg viewBox="0 0 620 290" role="img" aria-label={`${title}${valid ? " daily trend" : " — data unavailable"}`}>
      {Array.from({ length: 11 }, (_, index) => <g key={index}><line x1="58" y1={40 + index * 20} x2="566" y2={40 + index * 20} stroke="var(--ads-grid)" /><text x="50" y={44 + index * 20} textAnchor="end">{label(max * (10 - index) / 10)}</text></g>)}
      {dates.map((date, index) => (dates.length <= 8 || index % Math.ceil(dates.length / 7) === 0) && <text key={date} x={x(index)} y="260" textAnchor="middle">{date.slice(5)}</text>)}
      {valid && <><polyline fill="none" stroke={combined ? "#ff5b12" : "#1554ae"} strokeWidth="2" points={series.filter(row => row.value != null).map(row => `${x(row.index)},${y(row.value)}`).join(" ")} />
        {series.map(row => row.value != null && <circle key={row.index} cx={x(row.index)} cy={y(row.value)} r="3" fill={combined ? "#ff5b12" : "#1554ae"} onMouseEnter={() => setHover(row)} onMouseLeave={() => setHover(null)} />)}</>}
      {combined && series.map(row => row.sales != null && <rect key={row.index} x={x(row.index) - 9} y={y(row.sales)} width="18" height={240 - y(row.sales)} fill="#20c773" opacity=".55" />)}
      {!valid && <text className="ads-chart-empty" x="310" y="145" textAnchor="middle">Advertising data not connected</text>}
      {hover && <text x="310" y="22" textAnchor="middle">{dates[hover.index]} · {label(hover.value)}</text>}
      <text transform="translate(13 145) rotate(-90)" textAnchor="middle">{title}</text>
    </svg></div>;
}
function EmptyTable({ columns, message, rows = [], search = "", tab = "" }) {
  const [size, setSize] = useState(10);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [search, tab, size, rows.length]);
  const visible = rows.slice(page * size, (page + 1) * size);
  return <><div className="ads-table-scroll"><table className="ads-table"><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead>
    <tbody>{visible.length ? visible.map((row, index) => <tr key={index}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>) : <tr><td colSpan={columns.length} className="ads-empty">{message}</td></tr>}</tbody></table></div>
    <div className="ads-pagination"><label>Rows per page: <select value={size} onChange={e => setSize(Number(e.target.value))}>{[10, 25, 50].map(value => <option key={value}>{value}</option>)}</select></label>
      <span>{rows.length ? `${page * size + 1}–${Math.min((page + 1) * size, rows.length)} of ${rows.length}` : "0–0 of 0"}</span>
      <button aria-label="Previous page" disabled={!page} onClick={() => setPage(page - 1)}><Icon name="ChevronLeft" size={16}/></button>
      <button aria-label="Next page" disabled={(page + 1) * size >= rows.length} onClick={() => setPage(page + 1)}><Icon name="ChevronRight" size={16}/></button></div></>;
}

export default function AdvertisingDashboard({ organization, market, period }) {
  const [detailMarket, setDetailMarket] = useState(market);
  const [alertTab, setAlertTab] = useState("OOS Drain");
  const [productTab, setProductTab] = useState("Worst Performing");
  const [campaignTab, setCampaignTab] = useState("Worst Performing");
  const [search, setSearch] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(true);
  useEffect(() => setDetailMarket(market), [market, organization]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState([]);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    setData(null); setError(""); setMissing([]);
    if (market !== "Amazon") return () => controller.abort();
    const load = async () => {
      setLoading(true);
      try {
        const base = import.meta.env.VITE_AMAZON_API_URL || "/seller-api";
        const params = new URLSearchParams({ organization, period });
        const response = await fetch(`${base}/api/advertising/amazon?${params}`, { signal: controller.signal });
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (result.success && !result.pending && result.organization !== organization) {
          throw new Error("Advertising response belongs to a different company. Please retry.");
        }
        if (!response.ok || !result.success) {
          setMissing(result.missing || []);
          throw new Error(result.error || "Unable to load advertising data.");
        }
        setData(result);
        if (result.pending) timer = setTimeout(load, 15000);
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [organization, market, period, retry]);
  const totals = data?.totals;
  const dates = useMemo(() => {
    if (data?.startDate && data?.endDate) {
      const values = []; const date = new Date(`${data.startDate}T00:00:00Z`);
      while (date.toISOString().slice(0, 10) <= data.endDate) { values.push(date.toISOString().slice(0, 10)); date.setUTCDate(date.getUTCDate() + 1); }
      return values;
    }
    const end = new Date(); end.setDate(end.getDate() - 1);
    return Array.from({ length: period === "30D" ? 30 : 7 }, (_, index) => { const date = new Date(end); date.setDate(end.getDate() - (period === "30D" ? 29 : 6) + index); return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); });
  }, [data, period]);
  const daily = useMemo(() => {
    const grouped = {};
    for (const row of data?.campaigns || []) {
      const entry = grouped[row.date] ||= { cost: 0, sales7d: 0, impressions: 0, clicks: 0 };
      for (const key of Object.keys(entry)) entry[key] += Number(row[key] || 0);
    }
    return grouped;
  }, [data]);
  const series = key => dates.map((date, index) => ({ index, value: daily[date]?.[key] ?? null }));
  const detailTotals = detailMarket === market ? totals : null;
  const campaigns = useMemo(() => {
    if (detailMarket !== "Amazon" || market !== "Amazon") return [];
    const grouped = {};
    for (const row of data?.campaigns || []) {
      const entry = grouped[row.campaignId] ||= { name: row.campaignName || row.campaignId, cost: 0, sales7d: 0, impressions: 0, clicks: 0 };
      for (const key of ["cost", "sales7d", "impressions", "clicks"]) entry[key] += Number(row[key] || 0);
    }
    const values = Object.values(grouped);
    values.sort((a, b) => campaignTab === "Most Revenue" ? b.sales7d - a.sales7d : campaignTab === "Best Performing" ? (ratio(b.sales7d, b.cost) ?? -1) - (ratio(a.sales7d, a.cost) ?? -1) : (ratio(a.sales7d, a.cost) ?? -1) - (ratio(b.sales7d, b.cost) ?? -1));
    return values.map(row => [row.name, "—", number(row.impressions), number(row.clicks), money(row.cost), money(row.sales7d), ratio(row.sales7d, row.cost) == null ? "—" : `${(row.sales7d / row.cost).toFixed(2)}x`, percent(ratio(row.cost * 100, row.sales7d))]);
  }, [data, detailMarket, market, campaignTab]);
  return <div className="advertising-page">
    <section className="card ads-intro"><h2>Advertising Overview · {organization === "rayom" ? "Rayom" : "Shelfesteem"}</h2><p>Cross-marketplace ads summary and performance details</p></section>
    <div className="ads-status" role="status">{loading ? `${organization === "rayom" ? "Rayom" : "Shelfesteem"}: Loading advertising data…` : data?.pending ? data.message : error ? `${organization === "rayom" ? "Rayom" : "Shelfesteem"} · ${market}: ${missing.length ? "Advertising account not connected" : error}` : market !== "Amazon" ? `${market} advertising account not connected` : data?.coverage ? `${data.coverage} · ${data.startDate} to ${data.endDate}` : "Advertising data unavailable"}
      <button onClick={() => setRetry(value => value + 1)}>Refresh</button></div>
    <section className="card ads-overview"><MetricStrip totals={totals}/><h3>Marketplace trends</h3>
      <div className="ads-legend">{[...new Set([market, "Amazon", "D2C", "Flipkart"])].map(name => <span key={name}><i style={{ background: colors[name] || "#a463b8" }}/>{name}</span>)}</div>
      <div className="ads-chart-grid"><TrendChart title="Ad Impressions" dates={dates} series={series("impressions")}/><TrendChart title="Ad Spend (₹)" dates={dates} series={series("cost")} kind="money"/>
        <TrendChart title="ACOS (%)" dates={dates} kind="percent" series={dates.map((date, index) => ({ index, value: ratio((daily[date]?.cost || 0) * 100, daily[date]?.sales7d) }))}/><TrendChart title="TACOS (%)" dates={dates} kind="percent" series={dates.map((_, index) => ({ index, value: null }))}/></div>
    </section>
    <section className="card ads-matrix"><h2>Marketplace Daily Spend Matrix</h2><p>Ad spend by marketplace for the selected period</p>
      <div className="ads-table-scroll"><table className="ads-table"><thead><tr><th>Marketplace</th>{dates.map(date => <th key={date}>{new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).replace(" ", "-")}</th>)}</tr></thead>
      <tbody>{[...markets, "Total"].map(name => <tr key={name}><td>{name}</td>{dates.map(date => <td key={date}>{(name === market || name === "Total") && daily[date] ? money(daily[date].cost) : "—"}</td>)}</tr>)}</tbody></table></div>
    </section>
    <section className="card ads-details"><h2>Marketplace Details</h2><Tabs items={markets.filter(name => !["Nykaa", "Blinkit B2B"].includes(name))} value={detailMarket} onChange={setDetailMarket} label="Marketplace details"/>
      <MetricStrip totals={detailTotals} details/><div className="ads-detail-trend"><h3>Marketplace trend</h3><p>Attributed sales (bars), spend (line)</p>
      <div className="ads-series-legend"><span><i style={{background: "#20c773"}}/>Attributed sales</span><span><i style={{background: "#ff5b12"}}/>Spend</span></div>
      <TrendChart title="Attributed sales / Spend (₹)" dates={dates} kind="money" combined series={dates.map((date, index) => ({ index, value: detailMarket === market ? daily[date]?.cost ?? null : null, sales: detailMarket === market ? daily[date]?.sales7d ?? null : null }))}/></div>
    </section>
    <section className="card ads-actionables"><button className="ads-section-toggle" aria-expanded={alertsOpen} onClick={() => setAlertsOpen(!alertsOpen)}><h2>Actionables</h2><Icon name="ChevronDown" size={17}/></button>
      {alertsOpen && <><Tabs items={["OOS Drain", "Budget Exhausted", "Payment Failure"]} value={alertTab} onChange={setAlertTab} label="Actionable category"/><p className="ads-empty">Alert data is not connected for this category.</p><div className="ads-pagination"><span>0–0 of 0</span><button disabled aria-label="Previous alerts"><Icon name="ChevronLeft" size={16}/></button><button disabled aria-label="Next alerts"><Icon name="ChevronRight" size={16}/></button></div></>}
    </section>
    <section className="card ads-products"><div className="ads-section-heading"><h2>Product Intelligence</h2><label className="ads-search"><input aria-label="Search product" placeholder="Search product…" value={search} onChange={e => setSearch(e.target.value)}/><Icon name="Search" size={16}/></label></div>
      <Tabs items={["Worst Performing", "Best Performing", "Most Revenue", "OOS But Spending"]} value={productTab} onChange={setProductTab} label="Product intelligence ranking"/>
      <EmptyTable columns={["PRODUCT", "SPEND", "AD SALES", "TOTAL SALES", "ORGANIC SALES", "ORGANIC %", "ROAS", "ACOS", "TACOS", "IMPR.", "CLICKS", "CTR", "CVR"]} message={search ? `No product results for “${search}”` : "Product advertising data is not connected"} search={search} tab={productTab}/>
    </section>
    <section className="card ads-campaigns"><h2>Campaign Spotlight</h2><Tabs items={["Worst Performing", "Best Performing", "Most Revenue"]} value={campaignTab} onChange={setCampaignTab} label="Campaign ranking"/>
      <EmptyTable columns={["CAMPAIGN", "STATUS", "IMPR.", "CLICKS", "SPEND", "SALES", "ROAS", "ACOS"]} rows={campaigns} tab={campaignTab} message="No campaign data available"/>
    </section>
  </div>;
}
