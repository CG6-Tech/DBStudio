import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, CircleAlert, FileCode2, Folder, Search } from "lucide-react";
import { flattenExplorer } from "../domain/explorerIndex";
import type { FileId, FolderId, SqlWorkspace } from "../domain/workspaceTypes";

const rowHeight = 34;
const overscan = 6;

export function FileExplorer({ workspace, onSelect }: { workspace: SqlWorkspace; onSelect: (fileId: FileId) => void }) {
  const [expanded, setExpanded] = useState<Set<FolderId>>(() => new Set(workspace.explorer.rootNodeIds.filter((id): id is FolderId => workspace.explorer.nodesById.get(id)?.kind === "folder")));
  const [query, setQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => flattenExplorer(workspace.explorer, expanded, query), [workspace.explorer, expanded, query]);
  const viewportHeight = viewportRef.current?.clientHeight ?? 420;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);
  const tableIds = useMemo(() => new Set(workspace.document.tables.map((table) => table.id)), [workspace.document.tables]);
  const tableCount = useMemo(() => {
    const counts = new Map<FileId, number>();
    workspace.entitySourceById.forEach((location, id) => {
      if (tableIds.has(id)) counts.set(location.fileId, (counts.get(location.fileId) ?? 0) + 1);
    });
    return counts;
  }, [tableIds, workspace.entitySourceById]);
  const toggle = (id: FolderId) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return <div className="file-explorer">
    <label className="file-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter files" /></label>
    <div className="file-tree" ref={viewportRef} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div style={{ height: rows.length * rowHeight, position: "relative" }}>
        {rows.slice(start, end).map(({ node, depth }, index) => {
          const top = (start + index) * rowHeight;
          if (node.kind === "folder") {
            const open = query.trim() !== "" || expanded.has(node.id);
            return <button key={node.id} className="file-tree-row folder" style={{ top, paddingLeft: 10 + depth * 16 }} onClick={() => toggle(node.id)}>
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<Folder size={15} /><span>{node.name}</span>
            </button>;
          }
          const file = workspace.filesById.get(node.id);
          const diagnostics = workspace.fragmentsByFileId.get(node.id)?.document.diagnostics.length ?? (file?.error ? 1 : 0);
          return <button key={node.id} className={`file-tree-row file ${workspace.selectedFileId === node.id ? "selected" : ""}`} style={{ top, paddingLeft: 26 + depth * 16 }} onClick={() => onSelect(node.id)} title={node.relativePath}>
            <FileCode2 size={15} /><span>{node.name}</span><small>{tableCount.get(node.id) ?? 0}</small>
            {workspace.dirtyFileIds.has(node.id) && <i className="file-dirty" title="Unsaved changes" />}
            {diagnostics > 0 && <em title={`${diagnostics} diagnostics`}><CircleAlert size={13} />{diagnostics}</em>}
          </button>;
        })}
      </div>
    </div>
  </div>;
}
