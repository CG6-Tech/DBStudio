import { Code2, FileDown, FileUp, FolderOpen, Maximize2, MessageSquareText, Redo2, RefreshCw, Save, Sparkles, Undo2 } from "lucide-react";
import type { SqlDialect } from "../domain/types";
import { BrandLogo } from "./BrandLogo";
import { BetaBadge } from "./BetaBadge";

interface ToolbarProps {
  title: string;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  desktop: boolean;
  dialect: SqlDialect;
  onExample: () => void;
  onOpen: () => void;
  onImportWorkspaceData: () => void;
  onExportWorkspaceData: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFit: () => void;
  onPreview: () => void;
  onSave: () => void;
  onFeedback: () => void;
  onCheckForUpdates: () => void;
  checkingForUpdates: boolean;
  onDialectChange: (dialect: SqlDialect) => void;
}

export function Toolbar(props: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="brand">
        <BrandLogo />
        <strong>DBStudio</strong>
        <BetaBadge />
      </div>
      <div className="document-title" title={props.title}>
        <span className={props.dirty ? "dirty-dot active" : "dirty-dot"} />
        <span>{props.title}</span>
      </div>
      <nav className="toolbar-actions" aria-label="Document actions">
        <label className="dialect-select" title="SQL dialect">
          <select aria-label="SQL dialect" value={props.dialect} onChange={(event) => props.onDialectChange(event.target.value as SqlDialect)}>
            <option value="postgresql">PostgreSQL</option>
            <option value="mysql">MySQL</option>
          </select>
        </label>
        <span className="separator" />
        <div className="toolbar-action-group">
          <button className="icon-button" aria-label="Load example" title="Load example" onClick={props.onExample}><Sparkles size={15} /></button>
          <button className="command-button open-command" onClick={props.onOpen} title={props.desktop ? "Open SQL workspace folder" : "Available in the desktop build"}><FolderOpen size={15} /><span className="command-label">Open Folder</span></button>
          <button className="icon-button" aria-label="Import workspace data" title="Import workspace data" onClick={props.onImportWorkspaceData}><FileUp size={15} /></button>
          <button className="icon-button" aria-label="Export workspace data" title="Export workspace data" onClick={props.onExportWorkspaceData}><FileDown size={15} /></button>
        </div>
        <span className="separator" />
        <div className="toolbar-action-group">
          <button className="icon-button" aria-label="Undo" title="Undo" disabled={!props.canUndo} onClick={props.onUndo}><Undo2 size={15} /></button>
          <button className="icon-button" aria-label="Redo" title="Redo" disabled={!props.canRedo} onClick={props.onRedo}><Redo2 size={15} /></button>
        </div>
        <span className="separator" />
        <div className="toolbar-action-group">
          <button className="icon-button" aria-label="Fit diagram" title="Fit diagram" onClick={props.onFit}><Maximize2 size={15} /></button>
          <button className="icon-button" aria-label="SQL preview" title="SQL preview" onClick={props.onPreview}><Code2 size={15} /></button>
        </div>
        <button className="icon-button" aria-label="Check for updates" title="Check for updates" disabled={props.checkingForUpdates} onClick={props.onCheckForUpdates}><RefreshCw className={props.checkingForUpdates ? "spinning" : undefined} size={15} /></button>
        <button className="command-button feedback-command" onClick={props.onFeedback} title="Send private feedback"><MessageSquareText size={15} /><span className="command-label">Feedback</span></button>
        <button className="primary command-button" disabled={!props.dirty} onClick={props.onSave}><Save size={15} /><span>Save</span></button>
      </nav>
    </header>
  );
}
