import { AlertTriangle, CheckCircle2, Download, RefreshCw, X } from "lucide-react";
import type { UpdatePhase } from "../state/updateStore";
import type { AvailableUpdate } from "../platform/updater";

interface UpdateDialogProps {
  phase: UpdatePhase;
  update: AvailableUpdate | null;
  error: string | null;
  progress: number | null;
  downloaded: number;
  total: number | null;
  dirty: boolean;
  onClose: () => void;
  onInstall: () => void;
  onLater: () => void;
  onRetry: () => void;
  onSave: () => void;
  onExport: () => void;
  onExit: () => void;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

export function UpdateDialog(props: UpdateDialogProps) {
  const working = props.phase === "checking" || props.phase === "downloading" || props.phase === "installing";
  const mandatory = props.update?.mandatory === true;
  const title = mandatory ? "Required beta update" : props.update ? `DBStudio ${props.update.version} is available` : "DBStudio updates";
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !working && !mandatory) props.onClose(); }}>
    <section className="update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-title">
      <header><span>{mandatory ? <AlertTriangle size={18} /> : <Download size={18} />}</span><div><h2 id="update-title">{title}</h2><p>Signed updates are verified before installation.</p></div>{!working && !mandatory && <button className="icon-button" aria-label="Close" onClick={props.onClose}><X size={17} /></button>}</header>
      <div className="update-content">
        {props.phase === "checking" && <div className="update-message"><RefreshCw className="spinning" size={25}/><strong>Checking for updates…</strong></div>}
        {props.phase === "current" && <div className="update-message"><CheckCircle2 size={25}/><strong>You’re using the latest beta.</strong></div>}
        {props.phase === "unavailable" && <div className="update-message"><AlertTriangle size={25}/><strong>Updates are available in the desktop app.</strong></div>}
        {props.update && <>
          <div className="update-meta"><span>Installed {props.update.currentVersion}</span>{(props.total ?? props.update.size) != null && <span>{formatBytes((props.total ?? props.update.size)!)}</span>}</div>
          <p className="update-notes">{props.update.notes}</p>
          {mandatory && <p className="update-warning">This release is required to continue safely. Save or export any unsaved changes before installing.</p>}
          {props.dirty && <div className="update-unsaved"><strong>Unsaved changes detected</strong><p>Save the SQL workspace or export a complete SQL backup before updating.</p><div><button className="secondary-button" onClick={props.onExport}>Export SQL</button><button className="secondary-button" onClick={props.onSave}>Save changes</button></div></div>}
          {(props.phase === "downloading" || props.phase === "installing") && <div className="update-progress"><div><span style={{ width: `${props.progress ?? 8}%` }}/></div><p>{props.phase === "installing" ? "Installing and preparing to restart…" : props.progress == null ? `${formatBytes(props.downloaded)} downloaded` : `Downloading… ${props.progress}%`}</p></div>}
        </>}
        {props.phase === "failed" && <p className="update-error" role="alert">{props.error ?? "The update could not be completed. Your current installation was not changed."}</p>}
      </div>
      <footer>
        {props.phase === "available" && !mandatory && <button className="secondary-button" onClick={props.onLater}>Later</button>}
        {props.phase === "available" && mandatory && <button className="secondary-button" disabled={props.dirty} onClick={props.onExit}>Exit DBStudio</button>}
        {props.phase === "available" && <button className="primary-button" disabled={props.dirty} onClick={props.onInstall}>Install now</button>}
        {props.phase === "failed" && <><button className="secondary-button" onClick={props.onClose}>Close</button><button className="primary-button" onClick={props.onRetry}>Retry</button></>}
        {(props.phase === "current" || props.phase === "unavailable") && <button className="primary-button" onClick={props.onClose}>Done</button>}
      </footer>
    </section>
  </div>;
}
