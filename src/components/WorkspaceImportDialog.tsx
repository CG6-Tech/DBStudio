import { AlertTriangle, FileInput, X } from "lucide-react";
import type { WorkspaceMergeReport } from "../domain/workspaceData";

interface WorkspaceImportDialogProps {
  report: WorkspaceMergeReport;
  commentRemovals: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function WorkspaceImportDialog({ report, commentRemovals, onCancel, onConfirm }: WorkspaceImportDialogProps) {
  const skipped = report.skipped + report.ambiguous + report.invalid;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="workspace-import-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-import-title">
      <header>
        <span className="workspace-import-icon"><FileInput size={18} /></span>
        <div><h2 id="workspace-import-title">Import workspace data</h2><p>Review how this file matches the open workspace.</p></div>
        <button className="icon-button" title="Close" aria-label="Close" onClick={onCancel}><X size={17} /></button>
      </header>
      <div className="workspace-import-stats">
        <div><strong>{report.matched}</strong><span>Matched</span></div>
        <div><strong>{report.changed}</strong><span>Changed</span></div>
        <div><strong>{report.unchanged}</strong><span>Unchanged</span></div>
        <div className={skipped ? "warning" : ""}><strong>{skipped}</strong><span>Skipped</span></div>
      </div>
      {commentRemovals > 0 && <div className="workspace-import-warning"><AlertTriangle size={17} /><span>{commentRemovals} SQL table comment{commentRemovals === 1 ? "" : "s"} will be removed.</span></div>}
      {report.details.length > 0 && <details className="workspace-import-details"><summary>Skipped record details</summary><ul>{report.details.map((detail, index) => <li key={`${index}:${detail}`}>{detail}</li>)}</ul></details>}
      <footer><button className="secondary-button" onClick={onCancel}>Cancel</button><button className="primary-button" onClick={onConfirm}>Import</button></footer>
    </section>
  </div>;
}
