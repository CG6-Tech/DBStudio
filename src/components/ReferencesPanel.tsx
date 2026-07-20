import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeftRight, ChevronDown, ChevronRight, GitBranch, Network, Plus, Search, Trash2 } from "lucide-react";
import { allEndpointColumns, compatibleTargets, validateRelationshipEndpoints } from "../domain/relationshipCompatibility";
import { buildRelationshipGraph, shortestTablePath, stronglyConnectedTableGroups, traverseTables } from "../domain/relationshipGraph";
import { buildRelationshipIndex, relationshipRows, searchRelationships, type RelationshipFilter, type RelationshipGrouping } from "../domain/relationshipIndex";
import { cardinalityChangeIssue, relationshipCardinality, type RelationshipCardinality } from "../domain/relationshipCardinality";
import { addRelationship, deleteRelationship, updateRelationshipWithCardinality } from "../domain/schemaActions";
import type { SchemaDocument } from "../domain/types";
import type { SqlWorkspace } from "../domain/workspaceTypes";
import { useUiStore } from "../state/uiStore";

type Replace = (label: string, next: SchemaDocument) => void;
const rowHeight = 48;
const inlineDetailsHeight = 188;

export function ReferencesPanel({ document, workspace, replace }: { document: SchemaDocument; workspace?: SqlWorkspace | null; replace: Replace }) {
  const mode = useUiStore((state) => state.referencesMode);
  const setMode = useUiStore((state) => state.setReferencesMode);
  return <div className="references-panel">
    <header className="panel-header"><div><GitBranch size={17} /><strong>References</strong></div><span className="reference-total">{document.relationships.length}</span></header>
    <div className="reference-tabs" role="tablist">
      {(["browse", "create", "analyze"] as const).map((value) => <button key={value} className={mode === value ? "active" : ""} onClick={() => setMode(value)}>{value}</button>)}
    </div>
    {mode === "browse" && <BrowseMode document={document} workspace={workspace} replace={replace} />}
    {mode === "create" && <CreateMode document={document} replace={replace} />}
    {mode === "analyze" && <AnalyzeMode document={document} />}
  </div>;
}

function BrowseMode({ document, workspace, replace }: { document: SchemaDocument; workspace?: SqlWorkspace | null; replace: Replace }) {
  const [query, setQuery] = useState("");
  const [grouping, setGrouping] = useState<RelationshipGrouping>("source");
  const [filters, setFilters] = useState<Set<RelationshipFilter>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const selection = useUiStore((state) => state.selection);
  const setSelection = useUiStore((state) => state.setSelection);
  const setHovered = useUiStore((state) => state.setHoveredRelationshipId);
  const index = useMemo(() => buildRelationshipIndex(document, workspace ? { fileForEntity: (id) => {
    const fileId = workspace.entitySourceById.get(id)?.fileId;
    return fileId ? workspace.filesById.get(fileId)?.relativePath : undefined;
  } } : undefined), [document, workspace]);
  const ordinals = useMemo(() => searchRelationships(index, query, filters), [filters, index, query]);
  const rows = useMemo(() => relationshipRows(index, ordinals, grouping, collapsed), [collapsed, grouping, index, ordinals]);
  const height = viewportRef.current?.clientHeight ?? 460;
  const selectedId = selection?.kind === "relationship" ? selection.relationshipId : null;
  const selected = selectedId ? index.relationshipById.get(selectedId) : undefined;
  const selectedRowIndex = selectedId ? rows.findIndex((row) => row.kind === "relationship" && row.id === selectedId) : -1;
  const detailsTop = selectedRowIndex >= 0 ? (selectedRowIndex + 1) * rowHeight : -1;
  const contentHeight = rows.length * rowHeight + (selectedRowIndex >= 0 ? inlineDetailsHeight : 0);
  const baseScrollOffset = (offset: number) => selectedRowIndex >= 0 && offset > detailsTop ? Math.max(detailsTop, offset - inlineDetailsHeight) : offset;
  const visibleStart = Math.max(0, Math.floor(baseScrollOffset(scrollTop) / rowHeight) - 5);
  const visibleEnd = Math.min(rows.length, Math.ceil(baseScrollOffset(scrollTop + height) / rowHeight) + 5);

  const toggleFilter = (filter: RelationshipFilter) => setFilters((current) => {
    const next = new Set(current);
    if (next.has(filter)) next.delete(filter); else next.add(filter);
    return next;
  });

  return <div className="reference-mode browse-mode">
    <label className="reference-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tables, fields, or files" /></label>
    <div className="reference-controls">
      <select aria-label="Group relationships" value={grouping} onChange={(event) => setGrouping(event.target.value as RelationshipGrouping)}><option value="source">Source table</option><option value="target">Target table</option><option value="schema">Schema</option><option value="none">No groups</option></select>
      <span>{ordinals.length} results</span>
    </div>
    <div className="reference-filters">
      {(["crossFile", "invalid", "oneToOne", "manyToOne"] as const).map((filter) => <button key={filter} className={filters.has(filter) ? "active" : ""} onClick={() => toggleFilter(filter)}>{filter === "crossFile" ? "Cross-file" : filter === "oneToOne" ? "1:1" : filter === "manyToOne" ? "N:1" : "Invalid"}</button>)}
    </div>
    <div className="reference-virtual-list" ref={viewportRef} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div style={{ height: contentHeight, position: "relative" }}>
        {rows.slice(visibleStart, visibleEnd).map((row, offset) => {
          const rowIndex = visibleStart + offset;
          const top = rowIndex * rowHeight + (selectedRowIndex >= 0 && rowIndex > selectedRowIndex ? inlineDetailsHeight : 0);
          if (row.kind === "group") {
            const isCollapsed = collapsed.has(row.id);
            return <button key={row.id} className="reference-group" style={{ top }} onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })}>{isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}<strong>{row.label}</strong><span>{row.count}</span></button>;
          }
          const record = index.records[row.ordinal];
          return <button key={record.id} className={`reference-item ${selectedId === record.id ? "selected" : ""} ${record.valid ? "" : "invalid"}`} style={{ top }} onClick={() => setSelection({ kind: "relationship", relationshipId: record.id })} onMouseEnter={() => setHovered(record.id)} onMouseLeave={() => setHovered(null)}>
            <span className="reference-endpoints"><b title={`${record.sourceTable}.${record.sourceColumn}`}>{record.sourceTable}.{record.sourceColumn}</b><i>{record.cardinality === "1:1" ? "1 → 1" : "N → 1"}</i><b title={`${record.targetTable}.${record.targetColumn}`}>{record.targetTable}.{record.targetColumn}</b></span>
            <span className="reference-path">{record.sourceFile && record.targetFile ? (record.sourceFile === record.targetFile ? "Same file" : `${record.sourceFile} → ${record.targetFile}`) : (record.sourceSchema === record.targetSchema ? "Same schema" : `${record.sourceSchema || "default"} → ${record.targetSchema || "default"}`)}</span>
            {!record.valid && <AlertTriangle size={14} />}
          </button>;
        })}
        {selected && selectedRowIndex >= 0 && <div className="reference-inline-details" style={{ top: detailsTop }}><RelationshipDetails document={document} relationshipId={selected.id} replace={replace} /></div>}
      </div>
    </div>
  </div>;
}

function RelationshipDetails({ document, relationshipId, replace }: { document: SchemaDocument; relationshipId: string; replace: Replace }) {
  const relationship = document.relationships.find((item) => item.id === relationshipId)!;
  const endpoints = useMemo(() => allEndpointColumns(document), [document]);
  const [sourceColumnId, setSourceColumnId] = useState(relationship.sourceColumnId);
  const [targetColumnId, setTargetColumnId] = useState(relationship.targetColumnId);
  const savedCardinality = relationshipCardinality(document, relationship);
  const [cardinality, setCardinality] = useState<RelationshipCardinality>(savedCardinality);
  const requestFocus = useUiStore((state) => state.requestFocus);
  useEffect(() => { setSourceColumnId(relationship.sourceColumnId); setTargetColumnId(relationship.targetColumnId); setCardinality(savedCardinality); }, [relationship, savedCardinality]);
  const source = endpoints.find((item) => item.column.id === sourceColumnId);
  const target = endpoints.find((item) => item.column.id === targetColumnId);
  const validation = validateRelationshipEndpoints(document, sourceColumnId, targetColumnId, relationship.id);
  const cardinalityIssue = source ? cardinalityChangeIssue(document, source.tableId, sourceColumnId, cardinality) : "Choose a valid source field.";
  const valid = validation.valid && !cardinalityIssue;
  const changed = sourceColumnId !== relationship.sourceColumnId || targetColumnId !== relationship.targetColumnId || cardinality !== savedCardinality;
  const apply = () => source && target && replace("Edit relationship", updateRelationshipWithCardinality(document, relationship.id, { sourceTableId: source.tableId, sourceColumnId, targetTableId: target.tableId, targetColumnId }, cardinality));
  return <section className="relationship-details">
    <div><strong>Relationship details</strong><button className="icon-button danger destructive-icon" title="Delete relationship" onClick={() => replace("Delete relationship", deleteRelationship(document, relationship.id))}><Trash2 size={13} /></button></div>
    <div className="relationship-endpoint-grid"><EndpointPicker label="From" endpoints={endpoints} value={sourceColumnId} onChange={setSourceColumnId} /><EndpointPicker label="To" endpoints={endpoints} value={targetColumnId} onChange={setTargetColumnId} /></div>
    <div className="cardinality-row"><span>Cardinality</span><div className="cardinality-segmented" role="group" aria-label="Relationship cardinality"><button className={cardinality === "N:1" ? "active" : ""} onClick={() => setCardinality("N:1")}>N : 1</button><button className={cardinality === "1:1" ? "active" : ""} onClick={() => setCardinality("1:1")}>1 : 1</button></div></div>
    {(!validation.valid || cardinalityIssue) && <p className="relationship-error" title={cardinalityIssue ?? validation.message}><AlertTriangle size={13} /><span>{cardinalityIssue ?? validation.message}</span></p>}
    <div className="detail-actions"><button title="Show on canvas" onClick={requestFocus}>Canvas</button><button disabled={!validation.valid} onClick={() => { setSourceColumnId(targetColumnId); setTargetColumnId(sourceColumnId); }}><ArrowLeftRight size={13} /> Reverse</button><button className="primary" disabled={!changed || !valid} onClick={apply}>Apply</button></div>
  </section>;
}

function CreateMode({ document, replace }: { document: SchemaDocument; replace: Replace }) {
  const endpoints = useMemo(() => allEndpointColumns(document), [document]);
  const [sourceColumnId, setSourceColumnId] = useState(endpoints[0]?.column.id ?? "");
  const [query, setQuery] = useState("");
  const candidates = useMemo(() => compatibleTargets(document, sourceColumnId).filter((candidate) => candidate.label.toLocaleLowerCase("en").includes(query.toLocaleLowerCase("en"))), [document, query, sourceColumnId]);
  const source = endpoints.find((item) => item.column.id === sourceColumnId);
  return <div className="reference-mode create-mode">
    <EndpointPicker label="From" endpoints={endpoints} value={sourceColumnId} onChange={setSourceColumnId} />
    <label className="reference-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find compatible target" /></label>
    <div className="candidate-list">{candidates.map((candidate) => <button key={candidate.columnId} onClick={() => source && replace("Add relationship", addRelationship(document, source.tableId, sourceColumnId, candidate.tableId, candidate.columnId))}><span><strong>{candidate.label}</strong><small>{candidate.dataType}</small></span><em>{candidate.reason}</em><Plus size={14} /></button>)}</div>
    {candidates.length === 0 && <div className="reference-empty"><Network size={22} /><strong>No compatible fields</strong><p>Choose a different source field or add a matching primary or unique target.</p></div>}
  </div>;
}

function EndpointPicker({ label, endpoints, value, onChange }: {
  label: string;
  endpoints: ReturnType<typeof allEndpointColumns>;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLLabelElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", dismiss);
    return () => window.removeEventListener("pointerdown", dismiss);
  }, [open]);
  const selected = endpoints.find((item) => item.column.id === value);
  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en");
    return endpoints.filter((item) => !normalized || `${item.label} ${item.column.dataType}`.toLocaleLowerCase("en").includes(normalized)).slice(0, 40);
  }, [endpoints, query]);
  return <label className="endpoint-picker" ref={rootRef}>{label}<div><input value={open ? query : selected?.label ?? ""} placeholder="Search table or field" onFocus={() => { setOpen(true); setQuery(""); }} onChange={(event) => { setOpen(true); setQuery(event.target.value); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }} />
    {open && <div className="endpoint-options">{matches.map((item) => <button key={item.column.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(item.column.id); setOpen(false); setQuery(""); }}><span>{item.label}</span><small>{item.column.dataType}{item.column.primaryKey ? " · PK" : item.column.unique ? " · Unique" : ""}</small></button>)}{matches.length === 0 && <p>No matching fields</p>}</div>}
  </div></label>;
}

function AnalyzeMode({ document }: { document: SchemaDocument }) {
  const graph = useMemo(() => buildRelationshipGraph(document), [document]);
  const cycles = useMemo(() => stronglyConnectedTableGroups(graph), [graph]);
  const [tableId, setTableId] = useState(document.tables[0]?.id ?? "");
  const [targetId, setTargetId] = useState(document.tables[1]?.id ?? document.tables[0]?.id ?? "");
  const incoming = useMemo(() => traverseTables(graph, tableId, "in", 1), [graph, tableId]);
  const outgoing = useMemo(() => traverseTables(graph, tableId, "out", 1), [graph, tableId]);
  const path = useMemo(() => shortestTablePath(graph, tableId, targetId), [graph, tableId, targetId]);
  const names = new Map(document.tables.map((table) => [table.id, table.name]));
  return <div className="reference-mode analyze-mode">
    <label>Analyze table<select value={tableId} onChange={(event) => setTableId(event.target.value)}>{document.tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</select></label>
    <div className="analysis-stats"><div><strong>{incoming.length}</strong><span>Incoming</span></div><div><strong>{outgoing.length}</strong><span>Outgoing</span></div><div><strong>{cycles.filter((group) => group.includes(tableId)).length}</strong><span>Cycles</span></div></div>
    <AnalysisList title="Direct dependencies" ids={outgoing} names={names} />
    <AnalysisList title="Direct dependents" ids={incoming} names={names} />
    <section className="path-tool"><strong>Shortest relationship path</strong><select value={targetId} onChange={(event) => setTargetId(event.target.value)}>{document.tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</select><p>{path.length ? path.map((id) => names.get(id)).join(" → ") : "No path found"}</p></section>
    {cycles.length > 0 && <section className="cycle-list"><strong>Circular dependency groups</strong>{cycles.map((group, index) => <p key={index}>{group.map((id) => names.get(id)).join(" → ")}</p>)}</section>}
  </div>;
}

function AnalysisList({ title, ids, names }: { title: string; ids: string[]; names: Map<string, string> }) {
  const setSelection = useUiStore((state) => state.setSelection);
  const requestFocus = useUiStore((state) => state.requestFocus);
  return <section className="analysis-list"><strong>{title}</strong>{ids.length ? ids.map((id) => <button key={id} onClick={() => { setSelection({ kind: "table", tableId: id }); requestFocus(); }}>{names.get(id)}</button>) : <small>None</small>}</section>;
}
