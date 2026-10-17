export default function StatusTabs({ tabs, activeTab, onChange }) {
  return <div className="status-tabs" role="tablist">
    {tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => onChange(tab.id)}>
      {tab.label}<span>{tab.count}</span>
    </button>)}
  </div>;
}
