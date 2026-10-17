import { queueRetailAction, requestRetailReport } from '../api/retailReportRequest';
import { inventoryColumns, reportMatrix, reportTotal } from '../api/retailTable';
import { normalizeReport } from '../api/retailReportMapper';
import { getPrefetchedReport, clearRetailReports, subscribeRetailReports } from '../api/retailPrefetch';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { ensureAmazonStarted } from '../api/amazonStartup';
import './RetailsPurchase.css';
import { buildTimeSelection, periodOptions, lookbackOptions, timeframes } from '../api/retailTimeframe';

const companyId = company => String(company?.globalAccountId || company?.id || company?.accountId || company?.globalAccount?.id || '');
const companyLabel = company => company?.label || company?.businessName || company?.name || company?.accountName || company?.companyName || 'Unnamed company';
const salesColumns = [['asin', 'ASIN'], ['productTitle', 'Product Title'], ['brand', 'Brand'], ['ORDERED_REVENUE', 'Ordered Revenue'], ['ORDERED_UNITS', 'Ordered Units'], ['SHIPPED_REVENUE', 'Shipped Revenue'], ['SHIPPED_COGS', 'Shipped COGS'], ['SHIPPED_UNITS', 'Shipped Units'], ['CUSTOMER_RETURNS', 'Customer Returns']];
const initialDay = () => { const d = new Date(); d.setDate(d.getDate() - 2); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export default function RetailsPurchase() {
    const [report, setReport] = useState('sales');
    const [day, setDay] = useState(initialDay), [distributor, setDistributor] = useState('manufacturing');
    const [timeframe, setTimeframe] = useState('Daily'), [endDay, setEndDay] = useState(initialDay), [lookback, setLookback] = useState('week');
    const [rows, setRows] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [loaded, setLoaded] = useState(null), [company, setCompany] = useState('Current Vendor Central account');
    const [filters, setFilters] = useState(true), [notice, setNotice] = useState(true), [search, setSearch] = useState(''), [brand, setBrand] = useState(''), [hidden, setHidden] = useState([]), [customize, setCustomize] = useState(false), [sort, setSort] = useState({ key: report === 'sales' ? 'ORDERED_REVENUE' : 'asin', dir: report === 'sales' ? -1 : 1 }), [more, setMore] = useState(false);
    const columns = useMemo(() => report === 'sales' ? salesColumns : inventoryColumns(rows), [report, rows]);
    const visible = columns.filter(([key]) => !hidden.includes(key));
    const filtered = useMemo(() => rows.filter(row => (!brand || row.brand === brand) && (!search.trim() || search.split(/[\s,;]+/).filter(Boolean).some(term => String(row.asin ?? '').toLowerCase().includes(term.toLowerCase()) || String(row.productTitle ?? '').toLowerCase().includes(term.toLowerCase())))).sort((a, b) => { const x = a[sort.key], y = b[sort.key]; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true })) * sort.dir; }), [rows, brand, search, sort]);
    const totals = reportTotal(filtered, visible);
    const activeRequest = useRef(null);
    const userRequested = useRef(false);
    const [selectedCompanyId, setSelectedCompanyId] = useState("");
    const [apiLoading, setApiLoading] = useState(false);
    const [apiError, setApiError] = useState("");
    const [companies, setCompanies] = useState([]);
    useEffect(() => { void fetchCompanies(); }, []);


    useEffect(() => {
        let lastCached;
        const receive = () => {
            if (activeRequest.current || userRequested.current) return;
            const cached = getPrefetchedReport(report);
            if (!cached || cached === lastCached) return;
            lastCached = cached;
            if (cached.pending) { setError('Fetching this report after login…'); return; }
            if (cached.error) { setError(cached.error); return; }
            try {
                const page = normalizeReport(cached.result.data);
                setRows(page.slice(0, 100)); setMore(page.length > 100);
                setLoaded({ day: cached.day, distributor: 'manufacturing', selection: { timeframe: 'daily', startDate: cached.day, endDate: cached.day } });
                setDay(cached.day); setEndDay(cached.day); setTimeframe('Daily'); setDistributor('manufacturing');
                setCompany(cached.result.company?.businessName || 'Current Vendor Central account');
                setError('');
            } catch (error) { setError(error.message); }
        };
        receive();
        return subscribeRetailReports(receive);
    }, []);
    useEffect(() => () => activeRequest.current?.abort(), []);
    async function load(append = false, requestedReport = report) {
        userRequested.current = true;
        activeRequest.current?.abort();
        const controller = new AbortController();
        activeRequest.current = controller;
        const timeout = setTimeout(() => controller.abort(new DOMException('Report timed out', 'TimeoutError')), 180000);
        setBusy(true); setError('');
        try {
            const selection = append ? loaded.selection : buildTimeSelection(timeframe, day, endDay, lookback);
            await ensureAmazonStarted();
            if (controller.signal.aborted) throw controller.signal.reason;
            const result = await requestRetailReport({ report: requestedReport, ...selection, date: append ? loaded.day : day, distributor: append ? loaded.distributor : distributor, offset: append ? rows.length : 0 }, controller.signal);
            if (activeRequest.current !== controller || controller.signal.aborted) return;
            const page = normalizeReport(result.data);
            setMore(page.length > 100); setRows(previous => append ? [...previous, ...page.slice(0, 100)] : page.slice(0, 100));
            setLoaded({ selection, day: append ? loaded.day : day, distributor: append ? loaded.distributor : distributor });
            setCompany(result.company?.businessName || 'Current Vendor Central account');
        } catch (e) {
            if (activeRequest.current === controller && e.name !== 'AbortError') {
                setError(e.name === 'TimeoutError' ? 'The report request timed out. Check your Vendor Central login and click Apply to retry.' : e.message);
            }
        } finally {
            clearTimeout(timeout);
            if (activeRequest.current === controller) { activeRequest.current = null; setBusy(false); }
        }
    }
    const format = (key, value) => value == null ? "" : typeof value === 'number' && /REVENUE|COGS|COST|VALUE/i.test(key) ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value) : String(value);
    function download(type) {
        if (!loaded || busy || !visible.length) return;
        const sheet = XLSX.utils.aoa_to_sheet(reportMatrix(filtered, visible));
        const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, report === 'inventory' ? 'Inventory' : 'Sales'); XLSX.writeFile(book, `${report}-${loaded.selection.startDate}-${loaded.selection.endDate}.${type}`, { bookType: type });
    }
    const switchReport = next => {
        if (next === report || apiLoading) return;
        setReport(next);
        setRows([]); setLoaded(null); setMore(false);
        setHidden([]);
        setSort({ key: next === 'inventory' ? 'NET_RECEIVED' : 'ORDERED_REVENUE', dir: -1 });
        load(false, next);
    };
    const getCompanies = (data) => {
        const candidates = data?.globalAccounts || data?.accounts || data?.accountList || data?.data?.globalAccounts || [];
        return Array.isArray(candidates) ? candidates : [];
    };
    const fetchCompanies = async () => {
        try {
            const response = await fetch("/amazon-api/global-accounts", {
                headers: { Accept: "application/json" },
            });

            const result = await response.json();

            if (!response.ok || !result?.success) {
                throw new Error(result?.message || "Unable to load companies.");
            }

            const accountList = getCompanies(result.data);

            setCompanies(accountList);

            const selected =
                result.data?.selectedGlobalAccount ||
                result.data?.selectedAccount ||
                accountList.find((account) => account?.selected);

            const selectedId = companyId(selected);

            setSelectedCompanyId(selectedId);
        } catch (err) {
            setApiError(err.message || 'Unable to load companies.');
        } finally {
            setApiLoading(false);
        }
    };

    const handleCompanyChange = async (event) => {
        const globalAccountId = event.target.value;
        if (!globalAccountId || globalAccountId === selectedCompanyId || apiLoading) return;
        userRequested.current = true;
        activeRequest.current?.abort(); activeRequest.current = null;
        setBusy(false); setApiLoading(true); setApiError(''); setError('');
        setRows([]); setLoaded(null); setMore(false);
        clearRetailReports();
        try {
            const result = await queueRetailAction(async () => {
                const response = await fetch('/amazon-api/switch-company', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({ globalAccountId })
                });
                const result = await response.json();
                if (!response.ok || !result.success || result.ready !== true) {
                    throw new Error(result.message || 'Company switch is not ready. Please retry.');
                }
                return result;
            });
            setSelectedCompanyId(globalAccountId);
            setCompany(result.company?.businessName || companyLabel(companies.find(c => companyId(c) === globalAccountId)));
            await load();
        } catch (err) {
            setApiError(err.message || 'Unable to switch company.');
        } finally { setApiLoading(false); }
    };

    return (
        <section className="retail-report">
            <nav className="retail-tabs" aria-label="Retail analytics">
                <strong>Retail Analytics</strong>

                {["sales", "inventory"].map((tab) => (
                    <button
                        key={tab}
                        className={report === tab ? "active" : ""}
                        onClick={() => switchReport(tab)}
                    >
                        {tab === "sales" ? "Sales" : "Inventory"}
                    </button>
                ))}
            </nav>

            {notice && (
                <aside className="retail-notice">
                    <span />

                    <div>
                        <strong>Sales and inventory reporting</strong>
                        <p>
                            View your Amazon retail performance by ASIN using the
                            selected Vendor Central account.
                        </p>

                        <strong>Tips: Regional vendor view</strong>
                        <p>
                            A single account may show partial data when inventory
                            moves across regions. Select the correct company in
                            Vendor Central before loading a report.
                        </p>
                    </div>

                    <button
                        aria-label="Dismiss information"
                        onClick={() => setNotice(false)}
                    >
                        ×
                    </button>
                </aside>
            )}

            <header className="retail-heading">
                <div>
                    <h2>{report === "sales" ? "Sales" : "Inventory"}</h2>

                    <p>
                        {report === "sales"
                            ? "Quickly identify opportunities by determining what is contributing to sales performance."
                            : "Review inventory availability and stock performance by ASIN."}
                    </p>
                </div>

                <div className="manage-pos-actions">
                    <label className="manage-company-select">
                        <select
                            value={selectedCompanyId}
                            onChange={handleCompanyChange}
                            disabled={apiLoading || !companies.length}
                        >
                            <option value="">
                                {companies.length
                                    ? "Select company"
                                    : "Loading companies…"}
                            </option>

                            {companies.map((company, index) => {
                                const label = companyLabel(company);
                                const id = companyId(company);

                                return (
                                    <option
                                        key={`${id || label}-${index}`}
                                        value={id}
                                        disabled={!id}
                                    >
                                        {label}
                                    </option>
                                );
                            })}
                        </select>
                    </label>
                </div>
            </header>

            <div className="retail-toolbar">
                <label>
                    Timeframe
                    <select
                        value={timeframe}
                        onChange={(e) => {
                            const next = e.target.value;

                            setTimeframe(next);

                            const options = periodOptions(
                                next,
                                initialDay()
                            );

                            setDay(
                                options[0]?.value || initialDay()
                            );

                            setLookback(
                                next === "Trailing"
                                    ? "4-weeks"
                                    : "week"
                            );

                            setError("");
                        }}
                    >
                        {timeframes.map((value) => (
                            <option key={value}>{value}</option>
                        ))}
                    </select>
                </label>

                {["Weekly", "Monthly", "Quarterly", "Yearly"].includes(
                    timeframe
                ) ? (
                    <label>
                        {
                            {
                                Weekly: "Week",
                                Monthly: "Month",
                                Quarterly: "Quarter",
                                Yearly: "Year",
                            }[timeframe]
                        }

                        <select
                            value={day}
                            onChange={(e) => setDay(e.target.value)}
                        >
                            {periodOptions(
                                timeframe,
                                initialDay()
                            ).map((option) => (
                                <option
                                    key={option.value}
                                    value={option.value}
                                >
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : lookbackOptions[timeframe] ? (
                    <label>
                        Lookback

                        <select
                            value={lookback}
                            onChange={(e) => setLookback(e.target.value)}
                        >
                            {lookbackOptions[timeframe].map(
                                ([value, label]) => (
                                    <option
                                        key={value}
                                        value={value}
                                    >
                                        {label}
                                    </option>
                                )
                            )}
                        </select>
                    </label>
                ) : (
                    <label>
                        {timeframe === "Custom" ? "Start date" : "Day"}

                        <input
                            type="date"
                            value={day}
                            onChange={(e) => setDay(e.target.value)}
                        />
                    </label>
                )}

                {timeframe === "Custom" && (
                    <label>
                        End date

                        <input
                            type="date"
                            value={endDay}
                            min={day}
                            onChange={(e) => setEndDay(e.target.value)}
                        />
                    </label>
                )}

                <label>
                    View By

                    <select disabled>
                        <option>ASIN</option>
                    </select>
                </label>
{/* 
                <label>
                    Distributor View

                    <select
                        value={distributor}
                        onChange={(e) =>
                            setDistributor(e.target.value)
                        }
                    >
                        <option value="manufacturing">
                            Manufacturing
                        </option>
                        <option value="sourcing">Sourcing</option>
                    </select>
                </label>

                <label>
                    Programme View

                    <select disabled>
                        <option>Retail</option>
                    </select>
                </label> */}

                <button
                    className="retail-apply"
                    onClick={() => load()}
                    disabled={!day || apiLoading}
                >
                    Apply
                </button>

                <div className="retail-download">
                    <strong>Download</strong>

                    <div>
                        <button
                            disabled={
                                !loaded ||
                                busy ||
                                apiLoading ||
                                !visible.length
                            }
                            onClick={() => download("csv")}
                        >
                            CSV
                        </button>

                        <button
                            disabled={
                                !loaded ||
                                busy ||
                                apiLoading ||
                                !visible.length
                            }
                            onClick={() => download("xlsx")}
                        >
                            Excel
                        </button>
                    </div>
                </div>
            </div>

            <button
                className="retail-link"
                onClick={() => setFilters(!filters)}
            >
                {filters ? "Hide" : "Show"} Additional Filters
            </button>

            {filters && (
                <div className="retail-filters">
                    <label className="retail-search">
                        Search

                        <input
                            placeholder="Search ASINs or product titles"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </label>

                    {/* <label>
                        Brand

                        <select
                            value={brand}
                            onChange={(e) => setBrand(e.target.value)}
                        >
                            <option value="">All brands</option>

                            {[
                                ...new Set(
                                    rows
                                        .map((r) => r.brand)
                                        .filter(Boolean)
                                ),
                            ].map((b) => (
                                <option key={b}>{b}</option>
                            ))}
                        </select>
                    </label> */}
                </div>
            )}

            {busy && (
                <p
                    role="status"
                    style={{ padding: "0 16px" }}
                >
                    Loading report… You can change filters and press
                    Apply again to replace this request.
                </p>
            )}

            {apiError && (
                <p className="retail-error" role="alert">
                    {apiError}
                </p>
            )}

            {apiLoading && (
                <p role="status">
                    Loading company data…
                </p>
            )}

            {error && (
                <p className="retail-error" role="alert">
                    {error}
                </p>
            )}

            <div className="retail-table-meta">
                <span>
                    {loaded
                        ? `Viewing dates: ${loaded.selection.startDate} – ${loaded.selection.endDate} · Displaying ${filtered.length} of ${rows.length} loaded rows${more ? " · More rows available" : ""}`
                        : "Choose a day and apply to load your report."}
                </span>

                <button
                    className="retail-link"
                    onClick={() => setCustomize(!customize)}
                >
                    Customise Columns ({visible.length})
                </button>
            </div>

            {customize && (
                <div className="retail-columns">
                    {columns.map(([key, label]) => (
                        <label key={key}>
                            <input
                                type="checkbox"
                                checked={!hidden.includes(key)}
                                onChange={() =>
                                    setHidden((old) =>
                                        old.includes(key)
                                            ? old.filter(
                                                (k) => k !== key
                                            )
                                            : [...old, key]
                                    )
                                }
                            />

                            {label}
                        </label>
                    ))}
                </div>
            )}

            <div
                className="retail-table-wrap"
                aria-busy={busy}
            >
                <table>
                    <thead>
                        <tr>
                            {visible.map(([key, label]) => (
                                <th key={key}>
                                    <button
                                        onClick={() =>
                                            setSort({
                                                key,
                                                dir:
                                                    sort.key === key
                                                        ? -sort.dir
                                                        : 1,
                                            })
                                        }
                                    >
                                        {label}

                                        <span>
                                            {sort.key === key
                                                ? sort.dir === 1
                                                    ? "\u2191"
                                                    : "\u2193"
                                                : "\u2195"}
                                        </span>
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {loaded && filtered.length > 0 && (
                            <tr className="retail-total">
                                {visible.map(([key], i) => (
                                    <td key={key}>
                                        {format(key, totals[i])}
                                    </td>
                                ))}
                            </tr>
                        )}

                        {filtered.map((row, i) => (
                            <tr key={`${row.asin}-${i}`}>
                                {visible.map(([key]) => (
                                    <td
                                        key={key}
                                        title={format(key, row[key])}
                                    >
                                        {format(key, row[key])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>

                {!filtered.length && (
                    <div className="retail-empty">
                        {busy
                            ? "Loading your Vendor Central report…"
                            : loaded
                                ? "No matching data for this report."
                                : "Your report will appear here. Click Apply to get started."}
                    </div>
                )}
            </div>

            {more && (
                <button
                    className="retail-more"
                    disabled={busy || apiLoading}
                    onClick={() => load(true)}
                >
                    Load next 100 rows
                </button>
            )}
        </section>
    );

}


