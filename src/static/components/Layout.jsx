import { useState } from "react";
import { Icon, Modal, Button } from "./UI";
import { marketplaces } from "../data/mockData";
const sections = [
  [
    "BUSINESS",
    [
      ["Home", "House"],
      ["Advertising", "Megaphone"],
      ["Fulfilment Orders", "Truck"],
      ["Amazon Vendor", "Store"],
    ],
  ],
  [
    "SOCIAL",
    [
      ["Campaigns", "List"],
      ["All Campaign Posts", "PanelsTopLeft", "beta"],
      ["Search Creators", "Search", "beta"],
      ["Creator Groups", "Users", "beta"],
    ],
  ],
  [
    "ANALYTICS",
    [
      ["Marketplace", "Store"],
      ["Social Efficacy Report", "ClipboardList"],
      ["Social Efficacy Mindshare", "ChartNetwork"],
    ],
  ],
  [
    "FINANCE",
    [
      ["Inventory", "Package"],
      ["Raw Data", "Database"],
    ],
  ],
  [
    "ADMINISTRATION",
    [
      ["Data Sanctity", "ShieldCheck"],
      ["API Connections", "Cable"],
    ],
  ],
];
export function Sidebar({
  organization,
  onOrganization,
  availableMarkets,
  setMarket,
  shopifyCompany,
  market,
  page,
  onNavigate,
  collapsed,
  onCollapse,
  theme,
  setTheme,
  notify,
}) {
  const [expanded, setExpanded] = useState(false);
  const [accounts, setAccounts] = useState(false);
  const [draftOrganization, setDraftOrganization] = useState(organization);
  const [draft, setDraft] = useState(availableMarkets);
  const organizations = [['shelfesteem', 'Shelfesteem Brand Labs Pvt. Ltd.'], ['rayom', 'Rayom Business Case - Energizer'], ['linso', 'Rayom Business Case - Linso']];
  const organizationName = organizations.find(([id]) => id === organization)[1];
  const draftMarkets = draftOrganization === 'linso' ? ['Amazon'] : draftOrganization === 'rayom' ? ['Amazon', 'Flipkart', 'Shopify'] : ['Amazon', 'Shopify', 'Myntra', 'D2C'];
  return (
    <>
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="brand">
          <div className="brand-logo">B</div>
          <div>
            <b>LINSO</b>
            <small>by Kuber</small>
          </div>
          <button
            className="icon-button collapse-control"
            aria-label="Collapse navigation"
            onClick={onCollapse}
          >
            <Icon name="CircleArrowLeft" size={16} />
          </button>
        </div>
        <div className="workspace-select">
          <button
            onClick={() => {
              setDraft(availableMarkets);
              setDraftOrganization(organization);
              setAccounts(true);
            }}
          >
            {organizationName}<b>1</b>
          </button>
          <button
            onClick={() => {
              setDraft(availableMarkets);
              setDraftOrganization(organization);
              setAccounts(true);
            }}
          >
            All Brands<b>1</b>
          </button>
        </div>
        <nav aria-label="Main navigation">
          {sections.map(([title, items]) => (
            <div className="nav-group" key={title}>
              <p>{title}</p>
              {items.filter(([label]) => !(market === "Shopify" && label === "Advertising") && !(label === "Amazon Vendor" && !["rayom","linso"].includes(organization))).map(([label, icon, badge]) => (
                <div key={label}>
                  <button
                    className={`nav-item ${page === label ? "active" : ""}`}
                    onClick={() =>
                      label === "Marketplace"
                        ? setExpanded(!expanded)
                        : onNavigate(label)
                    }
                  >
                    <Icon name={icon} />
                    <span>{label}</span>
                    {badge && <small className="beta">{badge}</small>}
                    {label === "Marketplace" && (
                      <Icon
                        name={expanded ? "ChevronDown" : "ChevronRight"}
                        size={15}
                      />
                    )}
                  </button>
                  {label === "Marketplace" && expanded && (
                    <div className="subnav">
                      {[
                        ["Search Trends", "Search"],
                        ["Reviews", "Star"],
                        ["Share of Voice", "ChartNoAxesColumn"],
                      ].map(([name, subIcon]) => (
                        <button
                          key={name}
                          className={`nav-item ${page === name ? "active" : ""}`}
                          onClick={() => onNavigate(name)}
                        >
                          <Icon name={subIcon} size={13} />
                          <span>{name}</span>
                          {name !== "Search Trends" && (
                            <small className="soon">soon</small>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>
        <footer className="sidebar-footer">
          <button
            className="recent"
            onClick={() =>
              notify(
                "No recent exports. Export a creator list or inventory to download sample data.",
              )
            }
          >
            <Icon name="FileOutput" size={14} />
            Recent Exports
          </button>
          <div className="theme-switch">
            {[
              ["light", "Sun"],
              ["dark", "MoonStar"],
              ["system", "Monitor"],
            ].map(([t, icon]) => (
              <button
                key={t}
                aria-label={`${t} theme`}
                aria-pressed={theme === t}
                className={theme === t ? "selected" : ""}
                onClick={() => setTheme(t)}
              >
                <Icon name={icon} size={14} />
              </button>
            ))}
          </div>
          <div className="user-row">
            <span>Rahul Saingathia</span>
            <button
              className="icon-button"
              aria-label="Profile information"
              onClick={() => notify("Static preview · Rahul Saingathia")}
            >
              <Icon name="LogOut" size={17} />
            </button>
          </div>
          <small className="copyright">
            © 2026, Made with <span>♥</span> by NuroSys
          </small>
        </footer>
      </aside>
      {accounts && (
        <Modal
          title="Select Organizations and Marketplace Accounts"
          onClose={() => setAccounts(false)}
          footer={
            <Button
              primary
              disabled={!draft.length}
              onClick={() => {
                onOrganization(draftOrganization);
                const nextMarket = draft.includes(market) ? market : draft[0];
                if (nextMarket) setMarket(nextMarket);
                setAccounts(false);
              }}
            >
              Save
            </Button>
          }
        >
          <div className="account-columns">
            <div>
              <h4>Organizations</h4>
              {organizations.map(([id, name]) => (
                <label key={id}>
                  <input type="radio" name="organization" checked={draftOrganization === id}
                    onChange={() => {
                      setDraftOrganization(id);
                      setDraft(id === 'linso' ? ['Amazon'] : id === 'rayom' ? ['Amazon', 'Flipkart', 'Shopify'] : ['Amazon', 'Shopify', 'Myntra', 'D2C']);
                    }} /> {name}
                </label>
              ))}
            </div>
            <div>
              <h4>Marketplace Accounts</h4>
              {draftMarkets.map((m) => (
                <label key={m}>
                  <input
                    type="checkbox"
                    checked={draft.includes(m)}
                    onChange={() =>
                      setDraft(
                        draft.includes(m)
                          ? draft.filter((x) => x !== m)
                          : [...draft, m],
                      )
                    }
                  />
                  <span>
                    {m}
                    <small>{draftOrganization === "rayom" ? "Rayom" : m === "Shopify" ? "Unfooled" : "Shelfesteem"} · {m} account</small>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Topbar({ availableMarkets, page, onMenu, market, setMarket, period, setPeriod }) {
  const dashboard = ["Home", "Advertising"].includes(page);
  return (
    <header className="topbar">
      <button
        className="icon-button"
        onClick={onMenu}
        aria-label="Toggle sidebar"
      >
        <Icon name="Menu" />
      </button>
      {dashboard && (
        <div className="marketplaces">
          {marketplaces.filter(([name]) => availableMarkets.includes(name)).map(([name, color]) => (
            <button
              key={name}
              aria-pressed={market === name}
              className={market === name ? "chosen" : ""}
              onClick={() => setMarket(name)}
            >
              <i style={{ background: color }} />
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="topbar-right">
        {dashboard && (
          <div className="periods">
            {["7D", "30D", "MTD", "Custom"].map((p) => (
              <button
                key={p}
                className={period === p ? "selected" : ""}
                onClick={() => setPeriod(p)}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <div className="credit">
          <span>🪙</span>
          <b>50,000</b>
        </div>
      </div>
    </header>
  );
}
