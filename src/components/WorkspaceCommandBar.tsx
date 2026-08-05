import { Code2, FileDown, FileUp, Maximize2, Redo2, Save, Undo2 } from "lucide-react";
import type { SqlDialect } from "../domain/types";

interface WorkspaceCommandBarProps {
  canUndo: boolean;
  canRedo: boolean;
  dialect: SqlDialect;
  title: string;
  dirty: boolean;
  onImportWorkspaceData: () => void;
  onExportWorkspaceData: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFit: () => void;
  onPreview: () => void;
  onSave: () => void;
  onDialectChange: (dialect: SqlDialect) => void;
}

export function WorkspaceCommandBar(props: WorkspaceCommandBarProps) {
  return <nav className="workspace-commandbar" aria-label="Workspace commands">
    <label className="commandbar-dialect" title="SQL dialect">
      <span>Dialect</span>
      <select aria-label="SQL dialect" value={props.dialect} onChange={(event) => props.onDialectChange(event.target.value as SqlDialect)}>
        <option value="postgresql">PostgreSQL</option>
        <option value="mysql">MySQL</option>
      </select>
    </label>
    <span className="commandbar-separator"/>
    <div className="commandbar-document" title={props.title}>
      <span className={props.dirty ? "dirty-dot active" : "dirty-dot"}/>
      <span>{props.title}</span>
      <small>{props.dirty ? "Unsaved" : "Saved"}</small>
    </div>
    <div className="commandbar-group" role="group" aria-label="Workspace data commands">
      <button className="icon-button" aria-label="Import workspace data" title="Import workspace data" onClick={props.onImportWorkspaceData}><FileUp size={14}/></button>
      <button className="icon-button" aria-label="Export workspace data" title="Export workspace data" onClick={props.onExportWorkspaceData}><FileDown size={14}/></button>
    </div>
    <span className="commandbar-separator"/>
    <div className="commandbar-group" role="group" aria-label="History commands">
      <button className="icon-button" aria-label="Undo" title="Undo" disabled={!props.canUndo} onClick={props.onUndo}><Undo2 size={14}/></button>
      <button className="icon-button" aria-label="Redo" title="Redo" disabled={!props.canRedo} onClick={props.onRedo}><Redo2 size={14}/></button>
    </div>
    <span className="commandbar-separator"/>
    <div className="commandbar-group" role="group" aria-label="View commands">
      <button className="icon-button" aria-label="Expand diagram" title="Expand diagram to fit" onClick={props.onFit}><Maximize2 size={14}/></button>
      <button className="icon-button" aria-label="Code preview" title="Code preview" onClick={props.onPreview}><Code2 size={14}/></button>
    </div>
    <span className="commandbar-separator"/>
    <button className="primary command-button commandbar-save" disabled={!props.dirty} onClick={props.onSave}><Save size={14}/><span>Save</span></button>
  </nav>;
}
