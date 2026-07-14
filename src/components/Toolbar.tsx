import type { SqlDialect } from "../domain/types";

interface ToolbarProps {
  title: string;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  desktop: boolean;
  dialect: SqlDialect;
  onExample: () => void;
  onOpen: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFit: () => void;
  onPreview: () => void;
  onSave: () => void;
  onDialectChange: (dialect: SqlDialect) => void;
}

function Icon({ children }: { children: string }) {
  return <span className="button-icon" aria-hidden="true">{children}</span>;
}

export function Toolbar(props: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark"><i /><i /><i /></span>
        <span>ViewDB</span>
        <span className="beta">SAMPLE</span>
      </div>
      <div className="document-title" title={props.title}>
        <span className={props.dirty ? "dirty-dot active" : "dirty-dot"} />
        {props.title}
      </div>
      <nav className="toolbar-actions" aria-label="Document actions">
        <label className="dialect-select" title="SQL dialect">
          <span>Dialect</span>
          <select value={props.dialect} onChange={(event) => props.onDialectChange(event.target.value as SqlDialect)}>
            <option value="postgresql">PostgreSQL</option>
            <option value="mysql">MySQL</option>
          </select>
        </label>
        <button onClick={props.onExample}><Icon>✦</Icon> Example</button>
        <button onClick={props.onOpen} title={props.desktop ? "Open SQL file" : "Available in the desktop build"}><Icon>⌁</Icon> Open</button>
        <span className="separator" />
        <button aria-label="Undo" disabled={!props.canUndo} onClick={props.onUndo}><Icon>↶</Icon></button>
        <button aria-label="Redo" disabled={!props.canRedo} onClick={props.onRedo}><Icon>↷</Icon></button>
        <button onClick={props.onFit}><Icon>⌗</Icon> Fit</button>
        <button onClick={props.onPreview}><Icon>≡</Icon> SQL</button>
        <button className="primary" disabled={!props.dirty} onClick={props.onSave}><Icon>↓</Icon> Save</button>
      </nav>
    </header>
  );
}
