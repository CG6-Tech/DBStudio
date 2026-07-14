import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Boxes, Check, ChevronDown, ChevronRight, CircleAlert, FileCode2, FolderOpen, GitBranch, GripVertical,
  KeyRound, Layers3, ListChecks, Lock, MoreHorizontal, Move, Palette, Pencil, Plus, Search, Settings2, Shapes, Table2, Trash2,
  Type,
} from "lucide-react";
import type { Operation } from "../domain/operations";
import { dialectSettings, formatFieldType, parseFieldType } from "../dialects";
import {
  addArea, addCheckConstraint, addColumn, addCompositeField, addCustomType, addIndex, addNote, addRelationship, addTable, deleteArea, deleteCheckConstraint, deleteColumn,
  deleteCompositeField, deleteCustomType, deleteIndex, deleteNote, deleteRelationship, deleteTable, palette, postgresIndexMethods, updateArea, updateCheckConstraint, updateColumn, updateColumnType, updateCompositeField, updateCustomType, updateIndex, updateNote, updateTable,
} from "../domain/schemaActions";
import { customTypeUsageLabels, schemaIndexFor } from "../domain/schemaIndex";
import type { CustomType, FieldTypeSpec, SchemaDocument } from "../domain/types";
import {
  buildTableSearchRecords, calculateVirtualTableRange, filterTableSearchRecords, navigateVirtualTable,
  scrollOffsetToReveal, virtualTableOffset, type VirtualTableMetrics,
} from "../domain/virtualTableList";
import { useUiStore } from "../state/uiStore";

interface Props {
  document: SchemaDocument;
  operations: Operation[];
  fileName: string;
  onReplace: (label: string, next: SchemaDocument) => void;
  onOpen: () => void;
}

const nav = [
  ["open", FolderOpen, "Open"],
  ["tables", Table2, "Tables"],
  ["relationships", GitBranch, "Refs"],
  ["visuals", Shapes, "Visuals"],
  ["types", Type, "Types"],
  ["validation", CircleAlert, "Validate"],
  ["changes", ListChecks, "Changes"],
] as const;

export function WorkspaceSidebar({ document, operations, fileName, onReplace, onOpen }: Props) {
  const active = useUiStore((state) => state.activePanel);
  const setActive = useUiStore((state) => state.setActivePanel);
  const selection = useUiStore((state) => state.selection);
  const [visualTab, setVisualTab] = useState<"areas" | "notes">("areas");
  const replace = (label: string, next: SchemaDocument) => onReplace(label, next);

  useEffect(() => {
    if (selection?.kind === "table" || selection?.kind === "column") setActive("tables");
  }, [selection, setActive]);

  return (
    <div className="workspace-sidebar">
      <nav className="rail" aria-label="Workspace sections">
        <div className="rail-logo"><Layers3 size={21} /></div>
        {nav.map(([id, Icon, label]) => (
          <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)} title={label}>
            <Icon size={18} /><span>{label}</span>
            {id === "validation" && document.diagnostics.length > 0 && <i>{document.diagnostics.length}</i>}
            {id === "changes" && operations.length > 0 && <i>{operations.length}</i>}
          </button>
        ))}
      </nav>
      <aside className="context-panel">
        {active === "open" && (
          <Panel title="Workspace" icon={<FolderOpen size={17} />} action={<button className="panel-action" onClick={onOpen}>Open</button>}>
            <div className="file-card"><FileCode2 size={17} /><div><strong>{fileName}</strong><span>{document.tables.length} tables · {document.relationships.length} refs</span></div></div>
            <p className="panel-help">Open a PostgreSQL or MySQL schema file. Folder workspaces are handled by the native workspace service.</p>
          </Panel>
        )}
        {active === "tables" && (
          <VirtualTablesPanel document={document} replace={replace} />
        )}
        {active === "relationships" && <RelationshipsPanel document={document} replace={replace} />}
        {active === "visuals" && (
          <Panel title="Visuals" icon={<Shapes size={17} />} action={<button className="panel-action" onClick={() => replace(visualTab === "areas" ? "Add area" : "Add note", visualTab === "areas" ? addArea(document) : addNote(document))}><Plus size={14} /> {visualTab === "areas" ? "Area" : "Note"}</button>}>
            <div className="segmented"><button className={visualTab === "areas" ? "active" : ""} onClick={() => setVisualTab("areas")}>Areas</button><button className={visualTab === "notes" ? "active" : ""} onClick={() => setVisualTab("notes")}>Notes</button></div>
            {visualTab === "areas" ? <div className="object-list area-list">
              {document.areas.map((area) => (
                <div className="area-card" key={area.id} style={{ "--object-color": area.color } as React.CSSProperties}>
                  <div className="area-row">
                    <span className="drag-dots">⠿</span>
                    <input value={area.name} onChange={(event) => replace("Rename area", updateArea(document, area.id, { name: event.target.value }))} />
                    <ColorSwatchPicker label={`${area.name} color`} value={area.color} onChange={(color) => replace("Change area color", updateArea(document, area.id, { color }))} />
                    <button className="icon-button danger" onClick={() => replace("Delete area", deleteArea(document, area.id))}><Trash2 size={14} /></button>
                  </div>
                  <div className="area-options">
                    <button className={area.locked ? "active" : ""} onClick={() => replace("Toggle area lock", updateArea(document, area.id, { locked: !area.locked }))}><Lock size={12} /> Lock</button>
                    <button className={area.moveContents ? "active" : ""} onClick={() => replace("Toggle moving area contents", updateArea(document, area.id, { moveContents: !area.moveContents }))}><Move size={12} /> Move tables</button>
                    <span>{Math.round(area.width)} × {Math.round(area.height)}</span>
                  </div>
                </div>
              ))}
              {document.areas.length === 0 && <Empty icon={<Palette size={22} />} title="No areas yet" text="Create an area, then drag tables inside to group them." />}
            </div> : <div className="object-list area-list">
              {document.notes.map((note) => (
                <div className="area-card note-card" key={note.id} style={{ "--object-color": note.color } as React.CSSProperties}>
                  <div className="area-row">
                    <span className="drag-dots">⠿</span>
                    <textarea aria-label="Note text" value={note.text} onChange={(event) => replace("Edit note", updateNote(document, note.id, { text: event.target.value }))} />
                    <ColorSwatchPicker label="Note color" value={note.color} onChange={(color) => replace("Change note color", updateNote(document, note.id, { color }))} />
                    <button className="icon-button danger" title="Delete note" onClick={() => replace("Delete note", deleteNote(document, note.id))}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              {document.notes.length === 0 && <Empty icon={<FileCode2 size={22} />} title="No notes yet" text="Add a note to explain a domain, decision, or migration." />}
            </div>}
          </Panel>
        )}
        {active === "types" && (
          <CustomTypesPanel document={document} replace={replace} />
        )}
        {active === "validation" && (
          <Panel title="Validation" icon={<CircleAlert size={17} />}>
            {document.diagnostics.length === 0 ? <Empty icon={<ListChecks size={22} />} title="Schema looks good" text="No parser or workspace diagnostics." /> : document.diagnostics.map((diagnostic, index) => <div className={`diagnostic ${diagnostic.level}`} key={index}><CircleAlert size={15} /><span>{diagnostic.message}</span></div>)}
          </Panel>
        )}
        {active === "changes" && (
          <Panel title="Changes" icon={<ListChecks size={17} />}>
            {operations.length === 0 ? <Empty icon={<ListChecks size={22} />} title="No pending changes" text="Schema and canvas operations will appear here." /> : [...operations].reverse().map((operation, index) => <div className="change-row" key={index}><span>{operation.kind === "replaceDocument" ? operation.label : operation.kind}</span><small>pending</small></div>)}
          </Panel>
        )}
      </aside>
    </div>
  );
}

const compactTableRowHeight = 54;
const tableListOverscan = compactTableRowHeight * 5;

function VirtualTablesPanel({ document, replace }: { document: SchemaDocument; replace: (label: string, next: SchemaDocument) => void }) {
  const selection = useUiStore((state) => state.selection);
  const setSelection = useUiStore((state) => state.setSelection);
  const focusRelationship = useUiStore((state) => state.focusRelationship);
  const selectedTableId = selection?.kind === "table" || selection?.kind === "column" ? selection.tableId : null;
  const [query, setQuery] = useState("");
  const [expandedTableId, setExpandedTableId] = useState<string | null>(selectedTableId);
  const [focusedTableId, setFocusedTableId] = useState<string | null>(selectedTableId);
  const [actionMenuTableId, setActionMenuTableId] = useState<string | null>(null);
  const [renamingTableId, setRenamingTableId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [expandedSection, setExpandedSection] = useState<"indexes" | "checks" | null>(null);
  const [expandedExtraHeight, setExpandedExtraHeight] = useState(240);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const scrollRef = useRef<HTMLDivElement>(null);
  const expandedBodyRef = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const cancelRenameRef = useRef(false);
  const measuredExpandedTableRef = useRef<string | null>(null);
  const searchCacheRef = useRef(new Map<string, { signature: string; record: ReturnType<typeof buildTableSearchRecords>[number] }>());
  const tableById = useMemo(() => new Map(document.tables.map((table) => [table.id, table])), [document.tables]);
  const searchRecords = useMemo(() => {
    const liveIds = new Set<string>();
    const records = document.tables.map((table) => {
      liveIds.add(table.id);
      const signature = `${table.name}\u0000${table.columns.map((column) => column.name).join("\u0000")}`;
      const cached = searchCacheRef.current.get(table.id);
      if (cached?.signature === signature) return cached.record;
      const record = buildTableSearchRecords([table])[0];
      searchCacheRef.current.set(table.id, { signature, record });
      return record;
    });
    searchCacheRef.current.forEach((_value, id) => { if (!liveIds.has(id)) searchCacheRef.current.delete(id); });
    return records;
  }, [document.tables]);
  const searchResult = useMemo(() => filterTableSearchRecords(searchRecords, query), [query, searchRecords]);
  const expandedIndex = expandedTableId ? searchResult.ids.indexOf(expandedTableId) : -1;
  const expandedTable = expandedTableId ? tableById.get(expandedTableId) : undefined;
  const estimatedExpandedHeight = expandedTable ? Math.max(150, 145 + expandedTable.columns.length * 37) : 0;
  const effectiveExpandedHeight = measuredExpandedTableRef.current === expandedTableId ? expandedExtraHeight : estimatedExpandedHeight;
  const metrics: VirtualTableMetrics = { count: searchResult.ids.length, rowHeight: compactTableRowHeight, expandedIndex, expandedExtraHeight: expandedIndex >= 0 ? effectiveExpandedHeight : 0 };
  const range = calculateVirtualTableRange(metrics, scrollTop, viewportHeight, tableListOverscan);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const updateHeight = () => setViewportHeight(Math.max(1, scroll.clientHeight));
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(scroll);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const body = expandedBodyRef.current;
    if (!body || expandedIndex < 0) return;
    const updateHeight = () => {
      measuredExpandedTableRef.current = expandedTableId;
      setExpandedExtraHeight(Math.max(1, body.getBoundingClientRect().height));
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(body);
    return () => observer.disconnect();
  }, [expandedIndex, expandedTableId]);

  useEffect(() => {
    if (!selectedTableId || !tableById.has(selectedTableId)) return;
    if (!searchResult.ids.includes(selectedTableId)) setQuery("");
    setExpandedTableId(selectedTableId);
    setFocusedTableId(selectedTableId);
  }, [selectedTableId]);

  useEffect(() => {
    if (expandedTableId && !searchResult.ids.includes(expandedTableId)) setExpandedTableId(null);
    if (focusedTableId && !searchResult.ids.includes(focusedTableId)) setFocusedTableId(searchResult.ids[0] ?? null);
  }, [expandedTableId, focusedTableId, searchResult.ids]);

  useEffect(() => {
    if (!actionMenuTableId) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!actionMenuRef.current?.contains(event.target as Node)) setActionMenuTableId(null);
    };
    window.document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [actionMenuTableId]);

  useLayoutEffect(() => {
    if (!focusedTableId) return;
    const index = searchResult.ids.indexOf(focusedTableId);
    const scroll = scrollRef.current;
    if (index < 0 || !scroll) return;
    const next = scrollOffsetToReveal(index, metrics, scroll.scrollTop, scroll.clientHeight);
    if (next !== scroll.scrollTop) {
      scroll.scrollTop = next;
      setScrollTop(next);
    }
  }, [expandedExtraHeight, expandedTableId, focusedTableId, searchResult.ids]);

  const activateTable = (tableId: string) => {
    setFocusedTableId(tableId);
    setExpandedTableId((current) => current === tableId ? null : tableId);
    setSelection({ kind: "table", tableId });
  };

  const openRelationship = (relationshipId: string, columnId: string) => {
    focusRelationship(relationshipId, columnId);
  };

  const removeTable = (tableId: string) => {
    const index = searchResult.ids.indexOf(tableId);
    const nextFocusedId = searchResult.ids[index + 1] ?? searchResult.ids[index - 1] ?? null;
    setExpandedTableId(null);
    setFocusedTableId(nextFocusedId);
    if (selectedTableId === tableId) setSelection(null);
    replace("Delete table", deleteTable(document, tableId));
  };

  const beginRename = (tableId: string) => {
    const table = tableById.get(tableId);
    if (!table) return;
    setActionMenuTableId(null);
    setExpandedTableId(tableId);
    cancelRenameRef.current = false;
    setRenamingTableId(tableId);
    setRenameValue(table.name);
  };

  const finishRename = (commit: boolean) => {
    const tableId = renamingTableId;
    setRenamingTableId(null);
    if (!commit || !tableId) return;
    const table = tableById.get(tableId);
    const name = renameValue.trim();
    if (table && name && name !== table.name) replace("Rename table", updateTable(document, tableId, { name }));
  };

  const handleActionMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setActionMenuTableId(null);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>("button, label")];
    const current = items.indexOf(window.document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown" ? (current + 1) % items.length : (current <= 0 ? items.length - 1 : current - 1);
    items[next]?.focus();
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const element = event.target as HTMLElement;
    if (element.closest("input, button, textarea, select")) return;
    if (event.key === "Escape") {
      if (expandedTableId) { event.preventDefault(); setExpandedTableId(null); }
      return;
    }
    if (event.key === "Enter") {
      if (focusedTableId) { event.preventDefault(); activateTable(focusedTableId); }
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const currentIndex = focusedTableId ? searchResult.ids.indexOf(focusedTableId) : -1;
    const nextIndex = navigateVirtualTable(currentIndex, searchResult.ids.length, event.key);
    setFocusedTableId(nextIndex >= 0 ? searchResult.ids[nextIndex] : null);
  };

  const visibleIds = searchResult.ids.slice(range.start, range.end);
  return (
    <Panel title="Tables" icon={<Table2 size={17} />} action={<button className="panel-action" onClick={() => replace("Add table", addTable(document))}><Plus size={14} /> Add</button>}>
      <SearchBox value={query} onChange={setQuery} />
      <div className="virtual-table-list" ref={scrollRef} role="listbox" aria-label="Schema tables" tabIndex={0} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} onKeyDown={handleListKeyDown}>
        <div className="virtual-table-spacer" style={{ height: range.totalHeight }}>
          <div className="virtual-table-window" style={{ transform: `translateY(${range.top}px)` }}>
            {visibleIds.map((tableId) => {
              const table = tableById.get(tableId);
              if (!table) return null;
              const expanded = expandedTableId === table.id;
              const focused = focusedTableId === table.id;
              return (
                <section className={`table-editor virtual-table-row${focused ? " focused" : ""}`} id={`sidebar-table-${table.id}`} role="option" aria-selected={selectedTableId === table.id} aria-expanded={expanded} key={table.id} style={{ "--object-color": table.color } as React.CSSProperties}>
                  <header onClick={() => activateTable(table.id)}>
                    {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <span className="table-color-dot" style={{ background: table.color }} />
                    <strong title={table.name}>{table.name}</strong>
                    {searchResult.fieldMatchIds.has(table.id) && <small className="field-match">field match</small>}
                    <small className="field-count">{table.columns.length} fields</small>
                    <div className="table-actions" ref={actionMenuTableId === table.id ? actionMenuRef : undefined}>
                      <button className="icon-button table-actions-trigger" aria-label={`${table.name} actions`} aria-haspopup="menu" aria-expanded={actionMenuTableId === table.id} onClick={(event) => { event.stopPropagation(); setActionMenuTableId((current) => current === table.id ? null : table.id); }}><MoreHorizontal size={15} /></button>
                      {actionMenuTableId === table.id && <div className="table-actions-menu" role="menu" onClick={(event) => event.stopPropagation()} onKeyDown={handleActionMenuKeyDown}>
                        <button role="menuitem" autoFocus onClick={() => beginRename(table.id)}><Pencil size={13} /> Rename table</button>
                        <div className="color-menu-item" role="menuitem"><Palette size={13} /><span>Change color</span><ColorSwatchPicker compact label={`${table.name} color`} value={table.color} onChange={(color) => { replace("Change table color", updateTable(document, table.id, { color })); setActionMenuTableId(null); }} /></div>
                        <button role="menuitem" className="danger" onClick={() => { setActionMenuTableId(null); removeTable(table.id); }}><Trash2 size={13} /> Delete table</button>
                      </div>}
                    </div>
                  </header>
                  {expanded && (
                    <div className="table-editor-body" ref={expandedBodyRef}>
                      {renamingTableId === table.id && <label className="table-name-editor">Table name<input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onBlur={() => { const commit = !cancelRenameRef.current; cancelRenameRef.current = false; finishRename(commit); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } else if (event.key === "Escape") { event.preventDefault(); cancelRenameRef.current = true; event.currentTarget.blur(); } }} /></label>}
                      <div className="subheading"><span>Fields</span><small>{table.columns.length}</small></div>
                      {table.columns.map((column) => (
                        <div className="field-editor" key={column.id} onClick={() => setSelection({ kind: "column", tableId: table.id, columnId: column.id })}>
                          <GripVertical className="field-grip" size={14} />
                          <input aria-label="Field name" value={column.name} onChange={(event) => replace("Rename field", updateColumn(document, table.id, column.id, { name: event.target.value }))} />
                          <TypePicker document={document} value={column.typeSpec} onChange={(typeSpec) => replace("Change field type", updateColumnType(document, table.id, column.id, typeSpec))} />
                          <button className={!column.nullable ? "field-flag active" : "field-flag"} aria-pressed={!column.nullable} title="Toggle NOT NULL" onClick={(event) => { event.stopPropagation(); replace("Toggle NOT NULL", updateColumn(document, table.id, column.id, { nullable: column.primaryKey ? false : !column.nullable })); }}>NN</button>
                          <button className={column.primaryKey ? "field-flag key active" : "field-flag key"} aria-pressed={column.primaryKey} title="Toggle primary key" onClick={(event) => { event.stopPropagation(); replace("Toggle primary key", updateColumn(document, table.id, column.id, { primaryKey: !column.primaryKey, nullable: column.primaryKey ? column.nullable : false })); }}><KeyRound size={10} /><span>PK</span></button>
                          {document.relationships.filter((relationship) => relationship.sourceColumnId === column.id || relationship.targetColumnId === column.id).slice(0, 1).map((relationship) => <button key={relationship.id} className="field-flag foreign active" title="Open foreign key relationship" onClick={(event) => { event.stopPropagation(); openRelationship(relationship.id, column.id); }}><GitBranch size={10} /><span>FK</span></button>)}
                          <button className="icon-button danger destructive-icon" title="Delete field" aria-label={`Delete ${column.name}`} onClick={(event) => { event.stopPropagation(); replace("Delete field", deleteColumn(document, table.id, column.id)); }}><Trash2 size={13} /></button>
                        </div>
                      ))}
                      <button className="add-row" onClick={() => replace("Add field", addColumn(document, table.id))}><Plus size={15} /> Add field</button>
                      <button className="advanced-row" aria-expanded={expandedSection === "indexes"} onClick={() => setExpandedSection((section) => section === "indexes" ? null : "indexes")}><span><Boxes size={14} /> Indexes <small>{table.indexes.length}</small></span>{expandedSection === "indexes" ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                      {expandedSection === "indexes" && <div className="advanced-editor-list">
                        {table.indexes.map((index) => <div className="index-editor" key={index.id}>
                          <div className="advanced-editor-main">
                            <input aria-label="Index name" placeholder="Index name" value={index.name ?? ""} onChange={(event) => replace("Rename index", updateIndex(document, table.id, index.id, { name: event.target.value }))} />
                            <button className={index.unique ? "field-flag active" : "field-flag"} aria-pressed={index.unique} title="Toggle unique index" onClick={() => replace("Toggle unique index", updateIndex(document, table.id, index.id, { unique: !index.unique }))}>UQ</button>
                            {document.dialect === "postgresql" && <select aria-label="Index method" value={index.method} onChange={(event) => replace("Change index method", updateIndex(document, table.id, index.id, { method: event.target.value as typeof index.method }))}>{postgresIndexMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select>}
                            <button className="icon-button danger destructive-icon" title="Delete index" onClick={() => replace("Delete index", deleteIndex(document, table.id, index.id))}><Trash2 size={13} /></button>
                          </div>
                          <div className="index-columns" aria-label="Index columns">{table.columns.map((column) => <label key={column.id}><input type="checkbox" checked={index.columnIds.includes(column.id)} onChange={(event) => { const columnIds = event.target.checked ? [...index.columnIds, column.id] : index.columnIds.filter((id) => id !== column.id); replace("Change index columns", updateIndex(document, table.id, index.id, { columnIds })); }} />{column.name}</label>)}</div>
                          {index.columnIds.length === 0 && <small className="inline-warning">Select at least one field.</small>}
                        </div>)}
                        <button className="add-row" onClick={() => replace("Add index", addIndex(document, table.id))}><Plus size={14} /> Add index</button>
                      </div>}
                      <button className="advanced-row" aria-expanded={expandedSection === "checks"} onClick={() => setExpandedSection((section) => section === "checks" ? null : "checks")}><span><ListChecks size={14} /> Check constraints <small>{table.checkConstraints.length}</small></span>{expandedSection === "checks" ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                      {expandedSection === "checks" && <div className="advanced-editor-list">
                        {table.checkConstraints.map((constraint) => <div className="check-editor" key={constraint.id}>
                          <div className="advanced-editor-main"><input aria-label="Constraint name" placeholder="Constraint name (optional)" value={constraint.name ?? ""} onChange={(event) => replace("Rename check constraint", updateCheckConstraint(document, table.id, constraint.id, { name: event.target.value }))} /><button className="icon-button danger destructive-icon" title="Delete check constraint" onClick={() => replace("Delete check constraint", deleteCheckConstraint(document, table.id, constraint.id))}><Trash2 size={13} /></button></div>
                          <textarea aria-label="Check expression" placeholder="price > 0" value={constraint.expression} onChange={(event) => replace("Edit check constraint", updateCheckConstraint(document, table.id, constraint.id, { expression: event.target.value }))} />
                          {!constraint.expression.trim() && <small className="inline-warning">Enter a SQL expression.</small>}
                        </div>)}
                        <button className="add-row" onClick={() => replace("Add check constraint", addCheckConstraint(document, table.id))}><Plus size={14} /> Add constraint</button>
                      </div>}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
        {searchResult.ids.length === 0 && <Empty icon={<Search size={22} />} title="No matching tables" text="Try a table or field name." />}
      </div>
    </Panel>
  );
}

type TypeOption = { key: string; label: string; type?: ReturnType<typeof dialectSettings>["dataTypes"][number]; customType?: CustomType };
type ActiveTypeDraft = { key: string; spec: FieldTypeSpec };

function TypePicker({ document, value, onChange }: { document: SchemaDocument; value: FieldTypeSpec; onChange: (value: FieldTypeSpec) => void }) {
  const settings = dialectSettings(document.dialect);
  const listId = `type-options-${useId().replaceAll(":", "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeDraftRef = useRef<ActiveTypeDraft | null>(null);
  const optionsByKeyRef = useRef(new Map<string, TypeOption>());
  const commitOptionRef = useRef<(option: TypeOption, focusTrigger?: boolean) => boolean>(() => false);
  const closeRef = useRef<(focusTrigger?: boolean) => void>(() => undefined);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeDraft, setActiveDraft] = useState<ActiveTypeDraft | null>(null);
  const [rowError, setRowError] = useState<{ key: string; message: string } | null>(null);
  const [placeAbove, setPlaceAbove] = useState(false);
  const [horizontalShift, setHorizontalShift] = useState(0);
  const [popoverWidth, setPopoverWidth] = useState(220);
  const options = useMemo<TypeOption[]>(() => [
    ...settings.dataTypes.map((type) => ({ key: `builtin:${type.id}`, label: type.label, type })),
    ...document.customTypes.map((type) => ({ key: `custom:${type.id}`, label: type.schema ? `${type.schema}.${type.name}` : type.name, customType: type })),
  ], [document.customTypes, settings]);
  const optionsByKey = useMemo(() => new Map(options.map((option) => [option.key, option])), [options]);
  optionsByKeyRef.current = optionsByKey;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => options.filter((option) => {
    if (!normalizedQuery) return true;
    const searchable = option.type
      ? [option.label, option.type.category, ...(option.type.aliases ?? [])]
      : [option.label, option.customType?.kind ?? "custom"];
    return searchable.some((item) => item.toLowerCase().includes(normalizedQuery));
  }), [normalizedQuery, options]);
  const selectedKey = value.kind === "builtin" ? `builtin:${value.typeId}` : value.kind === "custom" ? `custom:${value.customTypeId}` : "";
  const formattedValue = formatFieldType(value, document.dialect, document.customTypes);
  const close = (focusTrigger = true) => {
    setOpen(false);
    setQuery("");
    activeDraftRef.current = null;
    setActiveDraft(null);
    setRowError(null);
    if (focusTrigger) requestAnimationFrame(() => triggerRef.current?.focus());
  };
  closeRef.current = close;
  const optionSpec = (option: TypeOption): FieldTypeSpec => option.customType
    ? { kind: "custom", customTypeId: option.customType.id, typeId: option.customType.name, parameters: {}, arrayDimensions: 0, unsigned: false, raw: option.label }
    : { ...parseFieldType(option.type!.label, document.dialect, document.customTypes), parameters: { ...(option.type!.defaultParameters ?? {}), values: option.type!.defaultParameters?.values ? [...option.type!.defaultParameters.values] : undefined } };
  const cloneSpec = (spec: FieldTypeSpec): FieldTypeSpec => ({ ...spec, parameters: { ...spec.parameters, values: spec.parameters.values ? [...spec.parameters.values] : undefined } });
  const hasRowControls = (option: TypeOption) => Boolean(option.type?.parameter || option.type?.supportsUnsigned);
  const validationMessage = (option: TypeOption, spec: FieldTypeSpec): string | null => {
    const definition = option.type;
    if (definition?.parameter === "length" || definition?.parameter === "time-precision") {
      if (!/^\d+$/.test(spec.parameters.length ?? "")) return "Enter a non-negative integer.";
    }
    if (definition?.parameter === "precision-scale") {
      if (!/^\d+$/.test(spec.parameters.precision ?? "") || !/^\d+$/.test(spec.parameters.scale ?? "")) return "Enter numeric precision and scale.";
      if (Number(spec.parameters.scale) > Number(spec.parameters.precision)) return "Scale cannot exceed precision.";
    }
    if (definition?.parameter === "values") {
      const values = spec.parameters.values?.map((item) => item.trim()) ?? [];
      if (!values.length || values.some((item) => !item) || new Set(values).size !== values.length) return "Values must be non-empty and unique.";
    }
    return null;
  };
  const draftFor = (option: TypeOption): FieldTypeSpec => activeDraft?.key === option.key
    ? activeDraft.spec
    : option.key === selectedKey ? cloneSpec(value) : optionSpec(option);
  const beginEditing = (option: TypeOption) => {
    if (activeDraftRef.current?.key === option.key) return;
    const next = { key: option.key, spec: option.key === selectedKey ? cloneSpec(value) : optionSpec(option) };
    activeDraftRef.current = next;
    setActiveDraft(next);
  };
  const updateDraft = (key: string, update: (current: FieldTypeSpec) => FieldTypeSpec) => {
    const option = optionsByKey.get(key);
    if (!option) return;
    setActiveDraft((current) => {
      const base = current?.key === key ? current.spec : option.key === selectedKey ? cloneSpec(value) : optionSpec(option);
      const next = { key, spec: update(base) };
      activeDraftRef.current = next;
      return next;
    });
    setRowError((current) => current?.key === key ? null : current);
  };
  const commitOption = (option: TypeOption, focusTrigger = true) => {
    const next = activeDraftRef.current?.key === option.key ? activeDraftRef.current.spec : option.key === selectedKey ? cloneSpec(value) : optionSpec(option);
    const message = validationMessage(option, next);
    if (message) {
      setRowError({ key: option.key, message });
      beginEditing(option);
      return false;
    }
    onChange(next);
    close(focusTrigger);
    return true;
  };
  commitOptionRef.current = commitOption;
  const openPicker = () => {
    activeDraftRef.current = null;
    setActiveDraft(null);
    setRowError(null);
    setQuery("");
    setActiveIndex(Math.max(0, options.findIndex((option) => option.key === selectedKey)));
    setOpen(true);
  };

  useEffect(() => setActiveIndex((index) => Math.max(0, Math.min(index, filteredOptions.length - 1))), [filteredOptions.length]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      const editingOption = activeDraftRef.current ? optionsByKeyRef.current.get(activeDraftRef.current.key) : undefined;
      if (editingOption) commitOptionRef.current(editingOption, false);
      else closeRef.current(false);
    };
    window.document.addEventListener("pointerdown", dismiss);
    return () => window.document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const bounds = rootRef.current.getBoundingClientRect();
    const panelBounds = rootRef.current.closest(".context-panel")?.getBoundingClientRect() ?? { left: 8, right: window.innerWidth - 8 };
    const ownerBounds = (rootRef.current.closest(".table-editor") ?? rootRef.current.closest(".custom-type-card") ?? rootRef.current.closest(".context-panel"))?.getBoundingClientRect() ?? panelBounds;
    const viewportBounds = (rootRef.current.closest(".virtual-table-list") ?? rootRef.current.closest(".panel-content"))?.getBoundingClientRect() ?? { top: 8, bottom: window.innerHeight - 8 };
    const nextWidth = Math.min(220, Math.max(1, panelBounds.right - panelBounds.left - 16));
    const centeredLeft = ownerBounds.left + (ownerBounds.right - ownerBounds.left - nextWidth) / 2;
    const desiredLeft = Math.max(panelBounds.left + 8, Math.min(centeredLeft, panelBounds.right - nextWidth - 8));
    setPopoverWidth(nextWidth);
    setHorizontalShift(desiredLeft - bounds.left);
    setPlaceAbove(viewportBounds.bottom - bounds.bottom < 360 && bounds.top - viewportBounds.top > 200);
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (!filteredOptions.length) return;
    if (event.key === "Enter") { event.preventDefault(); commitOption(filteredOptions[activeIndex]); return; }
    const nextIndex = event.key === "ArrowDown" ? (activeIndex + 1) % filteredOptions.length
      : event.key === "ArrowUp" ? (activeIndex - 1 + filteredOptions.length) % filteredOptions.length
        : event.key === "Home" ? 0
          : event.key === "End" ? filteredOptions.length - 1
            : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    setActiveIndex(nextIndex);
    requestAnimationFrame(() => optionRefs.current[nextIndex]?.scrollIntoView({ block: "nearest" }));
  };
  const groupedOptions = useMemo(() => {
    const builtIns: Array<{ option: TypeOption; index: number }> = [];
    const customTypes: Array<{ option: TypeOption; index: number }> = [];
    filteredOptions.forEach((option, index) => (option.type ? builtIns : customTypes).push({ option, index }));
    return { builtIns, customTypes };
  }, [filteredOptions]);

  const renderOption = ({ option, index }: { option: TypeOption; index: number }) => {
    const draft = draftFor(option);
    const definition = option.type;
    const controls = hasRowControls(option);
    const commitOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") { event.preventDefault(); commitOption(option); } };
    return <div className={`type-option-row${controls ? " parameterized" : ""}${activeDraft?.key === option.key ? " editing" : ""}`} key={option.key}>
      <button ref={(element) => { optionRefs.current[index] = element; }} role="option" aria-selected={option.key === selectedKey} className={index === activeIndex ? "active" : ""} onMouseEnter={() => setActiveIndex(index)} onClick={() => commitOption(option)}><span><strong title={option.label}>{option.label}</strong><small>{definition?.category ?? option.customType?.kind}</small></span>{option.key === selectedKey && <Check size={13} />}</button>
      {controls && <div className={`type-row-controls${definition?.parameter === "values" ? " wide" : ""}`}>
        {(definition?.parameter === "length" || definition?.parameter === "time-precision") && <input aria-label={`${option.label} ${definition.parameter === "time-precision" ? "precision" : "length"}`} title={definition.parameter === "time-precision" ? "Precision" : "Length"} inputMode="numeric" value={draft.parameters.length ?? ""} onFocus={() => beginEditing(option)} onKeyDown={commitOnEnter} onChange={(event) => updateDraft(option.key, (current) => ({ ...current, parameters: { ...current.parameters, length: event.target.value.replace(/\D/g, "") } }))} />}
        {definition?.parameter === "precision-scale" && <><input aria-label={`${option.label} precision`} title="Precision" inputMode="numeric" value={draft.parameters.precision ?? ""} onFocus={() => beginEditing(option)} onKeyDown={commitOnEnter} onChange={(event) => updateDraft(option.key, (current) => ({ ...current, parameters: { ...current.parameters, precision: event.target.value.replace(/\D/g, "") } }))} /><input aria-label={`${option.label} scale`} title="Scale" inputMode="numeric" value={draft.parameters.scale ?? ""} onFocus={() => beginEditing(option)} onKeyDown={commitOnEnter} onChange={(event) => updateDraft(option.key, (current) => ({ ...current, parameters: { ...current.parameters, scale: event.target.value.replace(/\D/g, "") } }))} /></>}
        {definition?.parameter === "values" && <input className="values" aria-label={`${option.label} values`} title="Comma-separated values" value={(draft.parameters.values ?? []).join(", ")} onFocus={() => beginEditing(option)} onKeyDown={commitOnEnter} onChange={(event) => updateDraft(option.key, (current) => ({ ...current, parameters: { ...current.parameters, values: event.target.value.split(",").map((item) => item.trim()) } }))} />}
        {definition?.supportsUnsigned && <label className="type-row-check" title="Unsigned"><input type="checkbox" checked={draft.unsigned} onFocus={() => beginEditing(option)} onKeyDown={commitOnEnter} onChange={(event) => updateDraft(option.key, (current) => ({ ...current, unsigned: event.target.checked }))} />U</label>}
      </div>}
      {rowError?.key === option.key && <small className="type-row-error">{rowError.message}</small>}
    </div>;
  };

  return <div className={`field-type-picker${open ? " open" : ""}${placeAbove ? " above" : ""}${popoverWidth < 200 ? " narrow" : ""}`} ref={rootRef} style={{ "--type-popover-shift": `${horizontalShift}px`, "--type-popover-width": `${popoverWidth}px` } as React.CSSProperties}>
    <button ref={triggerRef} className={value.kind === "unresolved" ? "field-type-trigger unresolved" : "field-type-trigger"} role="combobox" aria-label={`Data type: ${formattedValue}`} aria-expanded={open} aria-controls={listId} onClick={(event) => { event.stopPropagation(); open ? close() : openPicker(); }} onKeyDown={(event) => { if (!open && ["Enter", " ", "ArrowDown"].includes(event.key)) { event.preventDefault(); openPicker(); } else if (event.key === "Escape" && open) { event.preventDefault(); close(); } }}><span>{formattedValue}</span><ChevronDown size={11} /></button>
    {open && <div className="type-combobox-popover" id={listId} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
      <label className="type-combobox-search"><Search size={14} /><input ref={searchRef} value={query} placeholder="Search types" aria-label="Search data types" onFocus={() => { activeDraftRef.current = null; setActiveDraft(null); }} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); activeDraftRef.current = null; setActiveDraft(null); setRowError(null); }} onKeyDown={handleListKeyDown} /></label>
      <div className="type-combobox-results" role="listbox" aria-label="Data types">
        {groupedOptions.builtIns.length > 0 && <section><header>Built-in types</header>{groupedOptions.builtIns.map(renderOption)}</section>}
        {groupedOptions.customTypes.length > 0 && <section><header>Custom types</header>{groupedOptions.customTypes.map(renderOption)}</section>}
        {filteredOptions.length === 0 && <p>No types match “{query}”.</p>}
      </div>
    </div>}
    {value.kind === "unresolved" && <small className="inline-warning">Add this type to Custom Types before reusing it.</small>}
  </div>;
}

function CustomTypesPanel({ document, replace }: { document: SchemaDocument; replace: (label: string, next: SchemaDocument) => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(document.customTypes[0]?.id ?? null);
  const schemaIndex = useMemo(() => schemaIndexFor(document), [document]);
  if (document.dialect === "mysql") {
    return <Panel title="Custom types" icon={<Type size={17} />}>
      <Empty icon={<Type size={22} />} title="MySQL uses field types" text="Reusable schema types are not supported by MySQL. Configure ENUM and SET values from a table field's type picker." />
    </Panel>;
  }
  const addActions = <div className="custom-type-add"><button onClick={() => replace("Add enum", addCustomType(document, "enum"))}><Plus size={12} /> Enum</button><button onClick={() => replace("Add domain", addCustomType(document, "domain"))}>Domain</button><button onClick={() => replace("Add composite", addCustomType(document, "composite"))}>Composite</button></div>;
  return <Panel title="Custom types" icon={<Type size={17} />} action={addActions}>
    <div className="custom-type-list">
      {document.customTypes.map((type) => {
        const expanded = expandedId === type.id;
        const usages = customTypeUsageLabels(document, type.id, schemaIndex);
        return <section className="custom-type-card" key={type.id}>
          <header onClick={() => setExpandedId(expanded ? null : type.id)}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span className={`custom-kind ${type.kind}`}>{type.kind.slice(0, 1).toUpperCase()}</span><strong>{type.name || "Untitled type"}</strong><small>{usages.length} uses</small><button className="icon-button danger destructive-icon" disabled={usages.length > 0} title={usages.length ? `Used by ${usages.join(", ")}` : "Delete custom type"} onClick={(event) => { event.stopPropagation(); replace("Delete custom type", deleteCustomType(document, type.id)); }}><Trash2 size={13} /></button></header>
          {expanded && <CustomTypeEditor document={document} type={type} replace={replace} />}
        </section>;
      })}
      {document.customTypes.length === 0 && <Empty icon={<Type size={22} />} title="No custom types" text="Add an enum, domain, or composite type. They will become available in every strict field type picker." />}
    </div>
  </Panel>;
}

function CustomTypeEditor({ document, type, replace }: { document: SchemaDocument; type: CustomType; replace: (label: string, next: SchemaDocument) => void }) {
  const update = (patch: Partial<CustomType>, label = "Edit custom type") => replace(label, updateCustomType(document, type.id, patch));
  return <div className="custom-type-editor">
    <label className="custom-name">Type name<input value={type.name} onChange={(event) => update({ name: event.target.value }, "Rename custom type")} /></label>
    {type.kind === "enum" && <div className="custom-values"><span>Ordered values</span>{type.values.map((value, index) => <div key={index}><GripVertical size={13} /><input value={value} onChange={(event) => update({ values: type.values.map((item, itemIndex) => itemIndex === index ? event.target.value : item) } as Partial<CustomType>, "Edit enum value")} /><button className="icon-button danger destructive-icon" title="Delete enum value" onClick={() => update({ values: type.values.filter((_item, itemIndex) => itemIndex !== index) } as Partial<CustomType>, "Delete enum value")}><Trash2 size={12} /></button></div>)}<button className="add-row" onClick={() => update({ values: [...type.values, `value_${type.values.length + 1}`] } as Partial<CustomType>, "Add enum value")}><Plus size={13} /> Add value</button></div>}
    {type.kind === "domain" && <div className="domain-editor"><span>Base type</span><TypePicker document={document} value={type.baseType} onChange={(baseType) => update({ baseType } as Partial<CustomType>, "Change domain base type")} /><label>Default expression<input value={type.defaultExpression ?? ""} placeholder="Optional SQL expression" onChange={(event) => update({ defaultExpression: event.target.value } as Partial<CustomType>)} /></label><label className="type-check"><input type="checkbox" checked={!type.nullable} onChange={(event) => update({ nullable: !event.target.checked } as Partial<CustomType>)} />Not null</label><label>Check expression<textarea value={type.checkExpression ?? ""} placeholder="VALUE &gt; 0" onChange={(event) => update({ checkExpression: event.target.value } as Partial<CustomType>)} /></label></div>}
    {type.kind === "composite" && <div className="composite-fields"><span>Fields</span>{type.fields.map((field) => <div className="composite-field" key={field.id}><input aria-label="Composite field name" value={field.name} onChange={(event) => replace("Rename composite field", updateCompositeField(document, type.id, field.id, { name: event.target.value }))} /><TypePicker document={document} value={field.type} onChange={(fieldType) => replace("Change composite field type", updateCompositeField(document, type.id, field.id, { type: fieldType }))} /><button className="icon-button danger destructive-icon" title="Delete composite field" onClick={() => replace("Delete composite field", deleteCompositeField(document, type.id, field.id))}><Trash2 size={12} /></button></div>)}<button className="add-row" onClick={() => replace("Add composite field", addCompositeField(document, type.id))}><Plus size={13} /> Add field</button></div>}
  </div>;
}

function RelationshipsPanel({ document, replace }: { document: SchemaDocument; replace: (label: string, next: SchemaDocument) => void }) {
  const relationshipFocus = useUiStore((state) => state.relationshipFocus);
  const schemaIndex = useMemo(() => schemaIndexFor(document), [document]);
  const firstTable = document.tables[0];
  const secondTable = document.tables[1];
  const [sourceTableId, setSourceTableId] = useState(firstTable?.id ?? "");
  const [targetTableId, setTargetTableId] = useState(secondTable?.id ?? firstTable?.id ?? "");
  const sourceTable = schemaIndex.tableById.get(sourceTableId);
  const targetTable = schemaIndex.tableById.get(targetTableId);
  const [sourceColumnId, setSourceColumnId] = useState(sourceTable?.columns[0]?.id ?? "");
  const [targetColumnId, setTargetColumnId] = useState(targetTable?.columns[0]?.id ?? "");
  useEffect(() => {
    if (!relationshipFocus) return;
    const relationship = document.relationships.find((item) => item.id === relationshipFocus.relationshipId);
    if (!relationship) return;
    setSourceTableId(relationship.sourceTableId);
    setSourceColumnId(relationship.sourceColumnId);
    setTargetTableId(relationship.targetTableId);
    setTargetColumnId(relationship.targetColumnId);
    requestAnimationFrame(() => window.document.getElementById(`relationship-${relationship.id}`)?.scrollIntoView({ block: "nearest" }));
  }, [document.relationships, relationshipFocus]);
  return (
    <Panel title="Relationships" icon={<GitBranch size={17} />}>
      <div className="relationship-form">
        <label>From<select value={sourceTableId} onChange={(event) => { setSourceTableId(event.target.value); setSourceColumnId(schemaIndex.tableById.get(event.target.value)?.columns[0]?.id ?? ""); }}>{document.tables.map((table) => <option value={table.id} key={table.id}>{table.name}</option>)}</select></label>
        <label>Field<select value={sourceColumnId} onChange={(event) => setSourceColumnId(event.target.value)}>{sourceTable?.columns.map((column) => <option value={column.id} key={column.id}>{column.name}</option>)}</select></label>
        <label>To<select value={targetTableId} onChange={(event) => { setTargetTableId(event.target.value); setTargetColumnId(schemaIndex.tableById.get(event.target.value)?.columns[0]?.id ?? ""); }}>{document.tables.map((table) => <option value={table.id} key={table.id}>{table.name}</option>)}</select></label>
        <label>Field<select value={targetColumnId} onChange={(event) => setTargetColumnId(event.target.value)}>{targetTable?.columns.map((column) => <option value={column.id} key={column.id}>{column.name}</option>)}</select></label>
        <button className="primary-wide" disabled={!sourceColumnId || !targetColumnId} onClick={() => replace("Add relationship", addRelationship(document, sourceTableId, sourceColumnId, targetTableId, targetColumnId))}><Plus size={15} /> Add relationship</button>
      </div>
      <div className="relationship-list">{document.relationships.map((relationship) => {
        const source = schemaIndex.tableById.get(relationship.sourceTableId);
        const target = schemaIndex.tableById.get(relationship.targetTableId);
        const sourceColumn = schemaIndex.columnById.get(relationship.sourceColumnId);
        const targetColumn = schemaIndex.columnById.get(relationship.targetColumnId);
        return <div id={`relationship-${relationship.id}`} className={`relationship-row${relationshipFocus?.relationshipId === relationship.id ? " active" : ""}`} key={relationship.id}><GitBranch size={14} /><span>{source?.name}.{sourceColumn?.name} → {target?.name}.{targetColumn?.name}</span><button className="icon-button danger destructive-icon" title="Delete relationship" onClick={() => replace("Delete relationship", deleteRelationship(document, relationship.id))}><Trash2 size={13} /></button></div>;
      })}</div>
    </Panel>
  );
}

function Panel({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return <div className="panel-content"><header className="panel-header"><div>{icon}<strong>{title}</strong></div>{action}</header>{children}</div>;
}
function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="search-box"><Search size={15} /><input placeholder="Filter tables and fields" value={value} onChange={(event) => onChange(event.target.value)} /><Settings2 size={14} /></label>;
}
const colorNames = new Map([
  ["#7ee0b5", "Mint"],
  ["#7fb1ff", "Blue"],
  ["#bc78f0", "Purple"],
  ["#ff6584", "Pink"],
  ["#f4c95d", "Yellow"],
  ["#52d5c8", "Teal"],
]);

function ColorSwatchPicker({ label, value, onChange, compact = false }: { label: string; value: string; onChange: (color: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [placeAbove, setPlaceAbove] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const swatchRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = palette.findIndex((color) => color.toLowerCase() === value.toLowerCase());

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const bounds = rootRef.current.getBoundingClientRect();
    setPlaceAbove(window.innerHeight - bounds.bottom < 72 && bounds.top > 72);
    const focusIndex = activeIndex >= 0 ? activeIndex : 0;
    requestAnimationFrame(() => swatchRefs.current[focusIndex]?.focus());
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.document.addEventListener("pointerdown", dismiss);
    return () => window.document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  const closeAndFocus = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const choose = (color: string) => {
    onChange(color);
    closeAndFocus();
  };
  const handleSwatchKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "Escape") { event.preventDefault(); closeAndFocus(); return; }
    const columns = 6;
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % columns;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + columns) % columns;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = columns - 1;
    else return;
    event.preventDefault();
    swatchRefs.current[next]?.focus();
  };

  return <div className={`color-swatch-picker${compact ? " compact" : ""}${placeAbove ? " above" : ""}`} ref={rootRef}>
    <button ref={triggerRef} className="color-swatch-trigger" aria-label={`${label}: ${colorNames.get(value.toLowerCase()) ?? value}`} aria-haspopup="listbox" aria-expanded={open} style={{ "--swatch-color": value } as React.CSSProperties} onClick={(event) => { event.stopPropagation(); setOpen((current) => !current); }} onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); closeAndFocus(); } }}><span /></button>
    {open && <div className="color-swatch-popover" role="listbox" aria-label={`Choose ${label}`} onClick={(event) => event.stopPropagation()}>
      {palette.map((color, index) => <button ref={(element) => { swatchRefs.current[index] = element; }} key={color} role="option" aria-selected={activeIndex === index} aria-label={colorNames.get(color) ?? color} title={colorNames.get(color)} style={{ "--swatch-color": color } as React.CSSProperties} onClick={() => choose(color)} onKeyDown={(event) => handleSwatchKeyDown(event, index)}>{activeIndex === index && <Check size={13} />}</button>)}
    </div>}
  </div>;
}
function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="panel-empty">{icon}<strong>{title}</strong><p>{text}</p></div>;
}
