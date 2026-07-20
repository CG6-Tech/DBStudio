import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { ChevronDown, ChevronRight, Search, Settings2 } from "lucide-react";

export function Panel({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return <div className="panel-content"><header className="panel-header"><div>{icon}<strong>{title}</strong></div>{action}</header>{children}</div>;
}

export function PanelAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button className="panel-action" onClick={onClick}>{children}</button>;
}

export function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="panel-empty">{icon}<strong>{title}</strong><p>{text}</p></div>;
}

export function ListCard({ className = "", color, children }: { className?: string; color?: string; children: React.ReactNode }) {
  return <div className={`list-card${className ? ` ${className}` : ""}`} style={color ? { "--object-color": color } as React.CSSProperties : undefined}>{children}</div>;
}

export function CollapsibleRow({ icon, label, count, expanded, className = "", onToggle }: { icon: React.ReactNode; label: string; count?: number; expanded?: boolean; className?: string; onToggle: () => void }) {
  return <button className={`advanced-row${className ? ` ${className}` : ""}`} aria-expanded={Boolean(expanded)} onClick={onToggle}>
    <span>{icon} {label} {count !== undefined && <small>{count}</small>}</span>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
  </button>;
}

export function FieldChip({ active, variant, title, onClick, children }: { active?: boolean; variant?: "key" | "foreign"; title: string; onClick: (event: React.MouseEvent<HTMLButtonElement>) => void; children: React.ReactNode }) {
  const variantClass = variant ? ` ${variant}` : "";
  return <button className={`field-flag${variantClass}${active ? " active" : ""}`} aria-pressed={Boolean(active)} title={title} onClick={onClick}>{children}</button>;
}

export function IconButton({ label, title, danger, className = "", expanded, hasPopup, disabled, onClick, children }: { label: string; title?: string; danger?: boolean; className?: string; expanded?: boolean; hasPopup?: boolean | "menu"; disabled?: boolean; onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void; children: React.ReactNode }) {
  const classes = ["icon-button", danger ? "danger" : "", className].filter(Boolean).join(" ");
  return <button className={classes} aria-label={label} title={title} aria-haspopup={hasPopup} aria-expanded={expanded} disabled={disabled} onClick={onClick}>{children}</button>;
}

export function BottomActionBar({ colorControl, children }: { colorControl?: React.ReactNode; children: React.ReactNode }) {
  return <div className="table-bottom-actions">{colorControl}<div className="table-bottom-buttons">{children}</div></div>;
}

export function FilterSearchBox<T extends string>({ value, onChange, filter, onFilterChange, labels, placeholder = "Search" }: { value: string; onChange: (value: string) => void; filter: T; onFilterChange: (filter: T) => void; labels: Record<T, string>; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.document.addEventListener("pointerdown", dismiss);
    return () => window.document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  const choose = (next: T) => {
    onFilterChange(next);
    setOpen(false);
  };

  return <div className={`search-box table-search-box${open ? " open" : ""}${filter !== "all" ? " filtered" : ""}`} ref={rootRef}>
    <Search size={15} />
    <input placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    <button type="button" className="search-filter-button" aria-label={`Filter: ${labels[filter]}`} aria-haspopup="menu" aria-expanded={open} title={labels[filter]} onClick={() => setOpen((current) => !current)}><Settings2 size={14} /></button>
    {open && <div className="table-filter-menu" role="menu">
      {(Object.keys(labels) as T[]).map((key) => <button key={key} role="menuitemradio" aria-checked={filter === key} className={filter === key ? "active" : ""} onClick={() => choose(key)}>{labels[key]}</button>)}
    </div>}
  </div>;
}
