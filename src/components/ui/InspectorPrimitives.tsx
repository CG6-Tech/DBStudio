import type { ReactNode } from "react";
import { X } from "lucide-react";

export function InspectorShell({ className = "", onClose, children }: { className?: string; onClose: () => void; children: ReactNode }) {
  return <aside className={`logic-inspector ${className}`} onWheel={(event) => event.stopPropagation()} onTouchMove={(event) => event.stopPropagation()}>
    <button className="logic-inspector-close" aria-label="Close inspector" onClick={onClose}><X size={15} /></button>
    {children}
  </aside>;
}

export function InspectorTitle({ className = "", icon, eyebrow, title }: { className?: string; icon: ReactNode; eyebrow: string; title: string }) {
  return <header className={`logic-inspector-title ${className}`}>
    <i>{icon}</i>
    <div><span>{eyebrow}</span><h2>{title}</h2></div>
  </header>;
}

export function InspectorSection({ title, className = "", children }: { title?: string; className?: string; children: ReactNode }) {
  return <section className={`logic-inspector-section ${className}`}>
    {title && <h3>{title}</h3>}
    {children}
  </section>;
}

export function InspectorMeta({ children }: { children: ReactNode }) {
  return <div className="logic-inspector-meta">{children}</div>;
}

export function InspectorMetaRow({ label, value }: { label: string; value?: string | number }) {
  return <div className="logic-inspector-meta-row"><span>{label}</span><strong>{value || "None"}</strong></div>;
}

export function InspectorActions({ children }: { children: ReactNode }) {
  return <div className="logic-inspector-actions">{children}</div>;
}
