import {
  Circle,
  IndianRupee,
  Eye,
  MousePointerClick,
  ShoppingCart,
  ChartNoAxesCombined,
  Coins,
  X,
  Inbox,
  Search as SearchIcon,
  FileOutput,
  Sun,
  MoonStar,
  Monitor,
  LogOut,
  CircleArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  House,
  Megaphone,
  Truck,
  List,
  PanelsTopLeft,
  Users,
  Store,
  ClipboardList,
  ChartNetwork,
  Package,
  Database,
  ShieldCheck,
  Cable,
  Star,
  ChartNoAxesColumn,
  Menu,
  CircleCheck,
  Box,
  FileSpreadsheet,
  Filter,
  UserPlus,
  Heart,
  Percent,
  BadgeCheck,
  Download,
  TrendingUp,
  MessagesSquare,
  Plus,
} from "lucide-react";
const Icons = {
  Circle,
  IndianRupee,
  Eye,
  MousePointerClick,
  ShoppingCart,
  ChartNoAxesCombined,
  Coins,
  X,
  Inbox,
  Search: SearchIcon,
  FileOutput,
  Sun,
  MoonStar,
  Monitor,
  LogOut,
  CircleArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  House,
  Megaphone,
  Truck,
  List,
  PanelsTopLeft,
  Users,
  Store,
  ClipboardList,
  ChartNetwork,
  Package,
  Database,
  ShieldCheck,
  Cable,
  Star,
  ChartNoAxesColumn,
  Menu,
  CircleCheck,
  Box,
  FileSpreadsheet,
  Filter,
  UserPlus,
  Heart,
  Percent,
  BadgeCheck,
  Download,
  TrendingUp,
  MessagesSquare,
  Plus,
};
import { useEffect, useRef } from "react";
export function Icon({ name, size = 17, ...props }) {
  const Component = Icons[name] || Icons.Circle;
  return <Component size={size} strokeWidth={1.7} {...props} />;
}
export function Button({ children, primary = false, icon, ...props }) {
  return (
    <button className={`button ${primary ? "primary" : ""}`} {...props}>
      {icon && <Icon name={icon} size={15} />} {children}
    </button>
  );
}
export function Select({ label, options = [], value, onChange }) {
  return (
    <select aria-label={label} value={value} onChange={onChange}>
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
export function PageHeading({ title, subtitle, action }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function EmptyState({ title, description, action, icon = "Inbox" }) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={29} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Tabs({ items, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item}
          role="tab"
          aria-selected={item === value}
          className={item === value ? "selected" : ""}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
export function Toggle({ label, ...props }) {
  return (
    <label className="toggle-label">
      {label}
      <input type="checkbox" {...props} />
      <span className="toggle" />
    </label>
  );
}
export function Search({ value, onChange, placeholder = "Search..." }) {
  return (
    <label className="search-field">
      <Icon name="Search" size={15} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
    </label>
  );
}
export function Modal({ title, children, onClose, footer }) {
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <Icon name="X" />
        </button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-footer">{footer}</div>}
    </dialog>
  );
}
export function DataTable({ columns, rows, renderCell }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i}>
              {columns.map((c) => (
                <td key={c.key}>{renderCell?.(r, c.key) ?? r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <EmptyState
          title="No results found"
          description="Try a different search or clear your filters."
        />
      )}
    </div>
  );
}
export function exportCsv(filename, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys, ...rows.map((r) => keys.map((k) => r[k]))]
    .map((r) =>
      r.map((v) => '"' + String(v ?? "").replaceAll('"', '""') + '"').join(","),
    )
    .join("\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
