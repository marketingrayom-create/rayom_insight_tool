import { useEffect, useState } from "react";
import { Sidebar, Topbar } from "./components/Layout";
import { Icon, Modal, Button } from "./components/UI";
import AmazonVendor from "./pages/AmazonVendor";
import Dashboard from "./pages/Dashboard";
import AdvertisingDashboard from "./pages/AdvertisingDashboard";
import FlipkartDashboard from "./pages/FlipkartDashboard";
import ShopifyDashboard from "./pages/ShopifyDashboard";
import ShopifyOrders from "./pages/ShopifyOrders";
import CreatorSearch from "./pages/CreatorSearch";
import CreatorGroups from "./pages/CreatorGroups";
import { marketplaces } from "./data/mockData";
import {
  Orders,
  Campaigns,
  Creators,
  Inventory,
  SearchTrends,
  Reports,
  ComingSoon,
} from "./pages/WorkspacePages";
const pages = [
  "Amazon Vendor",
  "Home",
  "Advertising",
  "Fulfilment Orders",
  "Campaigns",
  "All Campaign Posts",
  "Search Creators",
  "Creator Groups",
  "Search Trends",
  "Reviews",
  "Share of Voice",
  "Social Efficacy Report",
  "Social Efficacy Mindshare",
  "Inventory",
  "Raw Data",
  "Data Sanctity",
  "API Connections",
];
function currentPage() {
  const slug = decodeURIComponent(location.hash.slice(1));
  return pages.includes(slug) ? slug : "Home";
}
function savedMarketplace() {
  try {
    const saved = localStorage.getItem("linso.marketplace");
    return marketplaces.some(([name]) => name === saved) ? saved : "Amazon";
  } catch {
    return "Amazon";
  }
}
export default function App() {
  const [market, setMarket] = useState(savedMarketplace);
  const [organization, setOrganization] = useState(() => {
    try { return ['rayom','linso'].includes(localStorage.getItem('linso.organization')) ? localStorage.getItem('linso.organization') : 'shelfesteem'; } catch { return 'shelfesteem'; }
  });
  const availableMarkets = organization === 'linso' ? ['Amazon'] : organization === 'rayom' ? ['Amazon', 'Flipkart', 'Shopify'] : ['Amazon', 'Shopify', 'Myntra', 'D2C'];
  useEffect(() => {
    try { localStorage.setItem('linso.organization', organization); } catch {}
    if (!availableMarkets.includes(market)) setMarket(availableMarkets[0]);
  }, [organization, market]);
  const [page, setPage] = useState(currentPage);
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 800);
  useEffect(() => {
    try {
      localStorage.setItem("linso.marketplace", market);
    } catch {
      // Continue normally if browser storage is unavailable.
    }
  }, [market]);
  const [shopifyCompany, setShopifyCompany] = useState("Shopify Store");
  useEffect(() => {
    if (market === "Shopify" && page === "Advertising") {
      setPage("Home");
      location.hash = "Home";
    }
  }, [market, page]);
  const [period, setPeriod] = useState("7D");
  const [theme, setTheme] = useState("light");
  const [notice, setNotice] = useState("");
  const [chat, setChat] = useState(false);
  const [custom, setCustom] = useState(false);
  useEffect(() => {
    const cb = () => setPage(currentPage());
    addEventListener("hashchange", cb);
    return () => removeEventListener("hashchange", cb);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  const navigate = (name) => {
    setPage(name);
    location.hash = encodeURIComponent(name);
    window.scrollTo(0, 0);
    if (window.innerWidth < 800) setCollapsed(true);
  };
  let content;
  switch (page) {
    case "Amazon Vendor":
      content = <AmazonVendor organization={organization} />;
      break;
    case "Advertising":
      content = <AdvertisingDashboard organization={organization} market={market} period={period} />;
      break;
    case "Home":
      content = (
        market === "Shopify" ? <ShopifyDashboard organization={organization} onCompany={setShopifyCompany} /> : market === "Flipkart" ? <FlipkartDashboard /> : <Dashboard
          organization={organization}
          advertising={page === "Advertising"}
          market={market}
          period={period}
        />
      );
      break;
    case "Fulfilment Orders":
      content = market === "Shopify" ? <ShopifyOrders organization={organization} onCompany={setShopifyCompany} /> : <Orders organization={organization} />;
      break;
    case "Campaigns":
      content = <Campaigns key={organization} organization={organization} />;
      break;
    case "All Campaign Posts":
      content = <Campaigns key={`${organization}-posts`} posts organization={organization} />;
      break;
    case "Search Creators":
    case "Creator Groups":
      content = (
        page === "Search Creators" ? <CreatorSearch organization={organization} /> : <CreatorGroups organization={organization} />
      );
      break;
    case "Inventory":
      content = market === "Shopify" ? <ShopifyDashboard organization={organization} key="shopify-inventory" onCompany={setShopifyCompany} initialResource="inventory" /> : <Inventory />;
      break;
    case "Search Trends":
      content = <SearchTrends />;
      break;
    case "Social Efficacy Report":
    case "Social Efficacy Mindshare":
      content = <Reports mindshare={page === "Social Efficacy Mindshare"} />;
      break;
    default:
      content = <ComingSoon title={page} />;
  }
  return (
    <div
      className={`beacon-app theme-${theme} ${collapsed ? "nav-collapsed" : ""}`}
    >
      <Sidebar
        organization={organization}
        onOrganization={(company) => {
          try { localStorage.setItem('linso.organization', company); } catch {}
          setOrganization(company);
        }}
        availableMarkets={availableMarkets}
        setMarket={setMarket}
        shopifyCompany={shopifyCompany}
        market={market}
        page={page}
        onNavigate={navigate}
        collapsed={collapsed}
        onCollapse={() => setCollapsed(!collapsed)}
        theme={theme}
        setTheme={setTheme}
        notify={setNotice}
      />
      <main className="main-content">
        <Topbar
          page={page}
          availableMarkets={availableMarkets}
          onMenu={() => setCollapsed(!collapsed)}
          market={market}
          setMarket={setMarket}
          period={period}
          setPeriod={(p) => {
            if (p === "Custom") setCustom(true);
            else setPeriod(p);
          }}
        />
        <div className="page-content" key={`${page}-${organization}-${market}`}>
          {content}
        </div>
      </main>
      {notice && (
        <div className="toast" role="status">
          <Icon name="CircleCheck" />
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <Icon name="X" size={15} />
          </button>
        </div>
      )}
      <button
        className="chat-button"
        aria-label="Open support"
        onClick={() => setChat(!chat)}
      >
        <Icon name={chat ? "X" : "MessagesSquare"} size={22} />
      </button>
      {chat && (
        <section className="chat-panel card">
          <h2>LINSO Support</h2>
          <p>Welcome! This is a static frontend preview.</p>
          <p>
            Explore the dashboard, campaigns, creators and inventory using the
            sidebar.
          </p>
          <Button onClick={() => setChat(false)}>Got it</Button>
        </section>
      )}
      {custom && (
        <Modal title="Custom date range" onClose={() => setCustom(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (e.target.from.value > e.target.to.value) {
                setNotice("End date must be after the start date.");
                return;
              }
              setPeriod("Custom");
              setCustom(false);
              setNotice(
                "Custom date range selected. Charts show static sample data.",
              );
            }}
          >
            <label className="field">
              From
              <input
                name="from"
                type="date"
                required
                defaultValue="2026-09-01"
              />
            </label>
            <label className="field">
              To
              <input name="to" type="date" required defaultValue="2026-09-16" />
            </label>
            <Button primary>Apply</Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
