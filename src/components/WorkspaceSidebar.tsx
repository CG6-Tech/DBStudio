import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Boxes, Check, ChevronDown, ChevronRight, CircleAlert, Eye, EyeOff, FileCode2, FolderOpen, GitBranch, GripVertical,
  KeyRound, ListChecks, Lock, MessageCircle, MoreHorizontal, Move, Palette, Pencil, Plus, Search, Shapes, Table2, Trash2, Workflow,
  GitCompareArrows,
  Type,
} from "lucide-react";
import { operationLabel, type Operation } from "../domain/operations";
import { dialectSettings, formatFieldType, parseFieldType } from "../dialects";
import {
  addArea, addCheckConstraint, addColumn, addCompositeField, addCustomType, addIndex, addNote, addTable, deleteArea, deleteCheckConstraint, deleteColumn,
  deleteCompositeField, deleteCustomType, deleteIndex, deleteNote, deleteTable, palette, postgresIndexMethods, updateArea, updateCheckConstraint, updateColumn, updateColumnType, updateCompositeField, updateCustomType, updateIndex, updateNote, updateTable,
} from "../domain/schemaActions";
import { customTypeUsageLabels, schemaIndexFor } from "../domain/schemaIndex";
import type { CustomType, Diagnostic, FieldTypeSpec, SchemaDocument } from "../domain/types";
import { validationIssuesFor, type ValidationIssueRecord, type ValidationTarget } from "../domain/validationIndex";
import {
  buildTableSearchRecords, calculateVirtualTableRange, filterTableSearchRecords, navigateVirtualTable,
  scrollOffsetToReveal, virtualTableOffset, type VirtualTableMetrics,
} from "../domain/virtualTableList";
import { useUiStore } from "../state/uiStore";
import { FileExplorer } from "./FileExplorer";
import type { FileId, SqlWorkspace } from "../domain/workspaceTypes";
import { ReferencesPanel as ReferencesWorkspacePanel } from "./ReferencesPanel";
import { BottomActionBar, CollapsibleRow, Empty, FieldChip, FilterSearchBox, IconButton, ListCard, Panel, PanelAction } from "./ui/SidebarPrimitives";
import { MigrationPlannerPanel, type MigrationSource } from "./MigrationPlannerPanel";
import type { MigrationPlan, MigrationPlanDecisions } from "../domain/migrationPlanner";

interface Props {
  document: SchemaDocument;
  operations: Operation[];
  fileName: string;
  onReplace: (label: string, next: SchemaDocument) => void;
  onOpen: () => void;
  workspace?: SqlWorkspace | null;
  onSelectFile?: (fileId: FileId) => void;
  validationRevision?: number;
  migrationBaseline: SchemaDocument;
  onChooseMigrationSource: () => Promise<MigrationSource | null>;
  onChooseMigrationFile: () => Promise<MigrationSource | null>;
  onMigrationPlanChange?: (plan: MigrationPlan | null, decisions: MigrationPlanDecisions) => void;
}

const nav = [
  ["open", FolderOpen, "Open"],
  ["tables", Table2, "Tables"],
  ["relationships", GitBranch, "Refs"],
  ["visuals", Shapes, "Visuals"],
  ["types", Type, "Types"],
  ["logic", Workflow, "Logic"],
  ["migration", GitCompareArrows, "Migrate"],
  ["validation", CircleAlert, "Validate"],
  ["changes", ListChecks, "Changes"],
] as const;

export function WorkspaceSidebar({ document, operations, fileName, onReplace, onOpen, workspace, onSelectFile, validationRevision = 0, migrationBaseline, onChooseMigrationSource, onChooseMigrationFile, onMigrationPlanChange }: Props) {
  const active = useUiStore((state) => state.activePanel);
  const setActive = useUiStore((state) => state.setActivePanel);
  const visualTab = useUiStore((state) => state.visualsTab);
  const setVisualTab = useUiStore((state) => state.setVisualsTab);
  const validationIssues = useMemo(() => validationIssuesFor(document), [validationRevision]);
  const [migrationOpened, setMigrationOpened] = useState(active === "migration");
  useEffect(() => { if (active === "migration") setMigrationOpened(true); }, [active]);
  const replace = (label: string, next: SchemaDocument) => onReplace(label, next);

  return (
    <div className="workspace-sidebar">
      <nav className="rail" aria-label="Workspace sections">
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
          <Panel title="SQL files" icon={<FolderOpen size={17} />} action={<PanelAction onClick={onOpen}>Open Folder</PanelAction>}>
            {workspace && onSelectFile ? <FileExplorer workspace={{ ...workspace, document }} onSelect={onSelectFile} /> : <>
              <div className="file-card"><FileCode2 size={17} /><div><strong>{fileName}</strong><span>{document.tables.length} tables · {document.relationships.length} refs</span></div></div>
              <p className="panel-help">Open a root folder to load a multi-file PostgreSQL or MySQL workspace.</p>
            </>}
          </Panel>
        )}
        {active === "tables" && (
          <VirtualTablesPanel document={document} replace={replace} />
        )}
        {active === "relationships" && <ReferencesWorkspacePanel document={document} workspace={workspace} replace={replace} />}
        {active === "logic" && <LogicPanel document={document} />}
        {active === "visuals" && (
          <Panel title="Visuals" icon={<Shapes size={17} />} action={<PanelAction onClick={() => replace(visualTab === "areas" ? "Add area" : "Add note", visualTab === "areas" ? addArea(document) : addNote(document))}><Plus size={14} /> {visualTab === "areas" ? "Area" : "Note"}</PanelAction>}>
            <div className="segmented"><button className={visualTab === "areas" ? "active" : ""} onClick={() => setVisualTab("areas")}>Areas</button><button className={visualTab === "notes" ? "active" : ""} onClick={() => setVisualTab("notes")}>Notes</button></div>
            {visualTab === "areas" ? <div className="object-list area-list">
              {document.areas.map((area) => (
                <ListCard className="area-card" key={area.id} color={area.color}>
                  <div className="area-row">
                    <span className="drag-dots">⠿</span>
                    <input value={area.name} onChange={(event) => replace("Rename area", updateArea(document, area.id, { name: event.target.value }))} />
                    <ColorSwatchPicker label={`${area.name} color`} value={area.color} onChange={(color) => replace("Change area color", updateArea(document, area.id, { color }))} />
                    <IconButton label="Delete area" danger onClick={() => replace("Delete area", deleteArea(document, area.id))}><Trash2 size={14} /></IconButton>
                  </div>
                  <div className="area-options">
                    <button className={area.locked ? "active" : ""} onClick={() => replace("Toggle area lock", updateArea(document, area.id, { locked: !area.locked }))}><Lock size={12} /> Lock</button>
                    <button className={area.moveContents ? "active" : ""} onClick={() => replace("Toggle moving area contents", updateArea(document, area.id, { moveContents: !area.moveContents }))}><Move size={12} /> Move tables</button>
                    <span>{Math.round(area.width)} × {Math.round(area.height)}</span>
                  </div>
                </ListCard>
              ))}
              {document.areas.length === 0 && <Empty icon={<Palette size={22} />} title="No areas yet" text="Create an area, then drag tables inside to group them." />}
            </div> : <div className="object-list area-list">
              {document.tables.filter((table) => table.comment?.trim()).map((table) => (
                <ListCard className="area-card note-card table-comment-note" key={`table-comment:${table.id}`} color={table.commentColor ?? table.color}>
                  <small className="linked-note-label"><Table2 size={12} /> {table.schema ? `${table.schema}.` : ""}{table.name}</small>
                  <div className="area-row">
                    <span className="drag-dots">⠿</span>
                    <textarea aria-label={`${table.name} table comment`} value={table.comment ?? ""} onChange={(event) => replace("Edit table comment", updateTable(document, table.id, { comment: event.target.value }))} />
                    <ColorSwatchPicker label={`${table.name} comment color`} value={table.commentColor ?? table.color} onChange={(color) => replace("Change table comment color", updateTable(document, table.id, { commentColor: color }))} />
                    <IconButton label="Delete table comment" title="Delete table comment" danger onClick={() => replace("Delete table comment", updateTable(document, table.id, { comment: "" }))}><Trash2 size={14} /></IconButton>
                  </div>
                </ListCard>
              ))}
              {document.notes.map((note) => (
                <ListCard className="area-card note-card" key={note.id} color={note.color}>
                  <div className="area-row">
                    <span className="drag-dots">⠿</span>
                    <textarea aria-label="Note text" value={note.text} onChange={(event) => replace("Edit note", updateNote(document, note.id, { text: event.target.value }))} />
                    <ColorSwatchPicker label="Note color" value={note.color} onChange={(color) => replace("Change note color", updateNote(document, note.id, { color }))} />
                    <IconButton label="Delete note" title="Delete note" danger onClick={() => replace("Delete note", deleteNote(document, note.id))}><Trash2 size={14} /></IconButton>
                  </div>
                </ListCard>
              ))}
              {document.notes.length === 0 && !document.tables.some((table) => table.comment?.trim()) && <Empty icon={<FileCode2 size={22} />} title="No notes yet" text="Add a note or a table comment to explain the schema." />}
            </div>}
          </Panel>
        )}
        {active === "types" && (
          <CustomTypesPanel document={document} replace={replace} />
        )}
        {migrationOpened && <div className="persistent-sidebar-panel" hidden={active !== "migration"}><MigrationPlannerPanel current={document} baseline={migrationBaseline} onChooseSource={onChooseMigrationSource} onChooseFile={onChooseMigrationFile} onPlanChange={onMigrationPlanChange} /></div>}
        {active === "validation" && (
          <ValidationPanel issues={validationIssues} />
        )}
        {active === "changes" && (
          <Panel title="Changes" icon={<ListChecks size={17} />}>
            {operations.length === 0 ? <Empty icon={<ListChecks size={22} />} title="No pending changes" text="Schema and canvas operations will appear here." /> : [...operations].reverse().map((operation, index) => <div className="change-row" key={index}><span>{operationLabel(operation)}</span><small>pending</small></div>)}
          </Panel>
        )}
      </aside>
    </div>
  );
}

function LogicPanel({ document }: { document: SchemaDocument }) {
  const selectedId = useUiStore((state) => state.logicSelectionId);
  const setSelected = useUiStore((state) => state.setLogicSelection);
  const openFlow = useUiStore((state) => state.openRoutineFlow);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "triggers" | "routines">("all");
  const normalized = query.trim().toLocaleLowerCase("en");
  const triggers = document.triggers.filter((item) => kind !== "routines" && (!normalized || `${item.schema ?? ""}.${item.name} ${item.events.join(" ")} ${item.targetTable.name}`.toLocaleLowerCase("en").includes(normalized)));
  const routines = document.routines.filter((item) => kind !== "triggers" && (!normalized || `${item.schema ?? ""}.${item.name} ${item.kind} ${item.parameters.map((parameter) => parameter.dataType).join(" ")}`.toLocaleLowerCase("en").includes(normalized)));
  return <Panel title="Database logic" icon={<Workflow size={17} />}>
    <div className="search-box"><Search size={14} /><input aria-label="Search database logic" placeholder="Search triggers & routines" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    <div className="segmented logic-segments"><button className={kind === "all" ? "active" : ""} onClick={() => setKind("all")}>All</button><button className={kind === "triggers" ? "active" : ""} onClick={() => setKind("triggers")}>Triggers</button><button className={kind === "routines" ? "active" : ""} onClick={() => setKind("routines")}>Routines</button></div>
    {triggers.length > 0 && <div className="logic-list"><div className="logic-list-heading">Triggers · {triggers.length}</div>{triggers.map((trigger) => <button key={trigger.id} className={selectedId === trigger.id ? "active trigger" : "trigger"} onClick={() => setSelected(trigger.id)}><strong>{trigger.name}</strong><small>{trigger.timing?.toUpperCase()} {trigger.events.join(" / ").toUpperCase()} · {trigger.targetTable.name}</small></button>)}</div>}
    {routines.length > 0 && <div className="logic-list"><div className="logic-list-heading">Routines · {routines.length}</div>{routines.map((routine) => <div className="logic-list-item" key={routine.id}><button className={selectedId === routine.id ? "active routine" : "routine"} onClick={() => setSelected(routine.id)}><strong>{routine.name}</strong><small>{routine.kind.toUpperCase()} {routine.language ? `· ${routine.language}` : ""}</small></button><button className="logic-open-flow" onClick={() => openFlow(routine.id)} title={`Open ${routine.name} flow`}>Flow →</button></div>)}</div>}
    {triggers.length + routines.length === 0 && <Empty icon={<Workflow size={22} />} title="No database logic" text={query ? "No triggers or routines match this search." : `No supported ${document.dialect === "mysql" ? "MySQL" : "PostgreSQL"} triggers or routines were found.`} />}
  </Panel>;
}

function validationStatusLabel(level: Diagnostic["level"]): string {
  return level === "error" ? "Error" : "Warning";
}

const validationRowHeight = 61;
const validationExpandedHeight = 92;

function ValidationPanel({ issues }: { issues: ValidationIssueRecord[] }) {
  const setSelection = useUiStore((state) => state.setSelection);
  const setActive = useUiStore((state) => state.setActivePanel);
  const requestFocus = useUiStore((state) => state.requestFocus);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(500);
  const listRef = useRef<HTMLDivElement>(null);
  const expandedIndex = expandedIssue ? issues.findIndex((issue) => issue.id === expandedIssue) : -1;
  const metrics: VirtualTableMetrics = { count: issues.length, rowHeight: validationRowHeight, expandedIndex, expandedExtraHeight: validationExpandedHeight };
  const range = calculateVirtualTableRange(metrics, scrollTop, viewportHeight, validationRowHeight * 4);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => setViewportHeight(list.clientHeight || 500);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  const openIssue = (target: ValidationTarget) => {
    if (!target) return;
    if (target.kind === "types") {
      setActive("types");
      return;
    }
    setActive(target.panel ?? "tables");
    setSelection(target.selection);
    requestFocus();
  };

  return <Panel title="Validation" icon={<CircleAlert size={17} />}>
    {issues.length === 0 ? <Empty icon={<ListChecks size={22} />} title="Schema looks good" text="No parser or workspace diagnostics." /> : <div className="validation-list validation-list-virtual" ref={listRef} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div className="validation-list-spacer" style={{ height: range.totalHeight }}>
      {issues.slice(range.start, range.end).map((issue, visibleIndex) => {
        const index = range.start + visibleIndex;
        const expanded = expandedIssue === issue.id;
        return <article className={`validation-card ${issue.diagnostic.level}${expanded ? " expanded" : ""}`} key={issue.id} style={{ top: virtualTableOffset(index, metrics), height: validationRowHeight + (expanded ? validationExpandedHeight : 0) - 7 }}>
          <button className="validation-card-main" disabled={!issue.target} onClick={() => openIssue(issue.target)}>
            <CircleAlert size={14} />
            <span>
              <em><strong>{issue.title}</strong><b className={`validation-status ${issue.diagnostic.level}`}>{validationStatusLabel(issue.diagnostic.level)}</b></em>
              <small>{issue.targetName}</small>
            </span>
          </button>
          <button className="validation-expand" aria-expanded={expanded} aria-label={expanded ? "Hide issue details" : "Show issue details"} onClick={() => setExpandedIssue(expanded ? null : issue.id)}>
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {expanded && <div className="validation-details">
            <p>{issue.diagnostic.message}</p>
          </div>}
        </article>;
      })}
      </div>
    </div>}
  </Panel>;
}

const compactTableRowHeight = 54;
const tableListOverscan = compactTableRowHeight * 5;
type TableListFilter = "all" | "relationships" | "indexes" | "checks" | "empty";

function VirtualTablesPanel({ document, replace }: { document: SchemaDocument; replace: (label: string, next: SchemaDocument) => void }) {
  const selection = useUiStore((state) => state.selection);
  const setSelection = useUiStore((state) => state.setSelection);
  const focusRelationship = useUiStore((state) => state.focusRelationship);
  const tableEditorFocus = useUiStore((state) => state.tableEditorFocus);
  const selectedTableId = selection?.kind === "table" || selection?.kind === "column" ? selection.tableId : null;
  const [query, setQuery] = useState("");
  const [tableFilter, setTableFilter] = useState<TableListFilter>("all");
  const [expandedTableId, setExpandedTableId] = useState<string | null>(null);
  const [focusedTableId, setFocusedTableId] = useState<string | null>(selectedTableId);
  const [actionMenuTableId, setActionMenuTableId] = useState<string | null>(null);
  const [renamingTableId, setRenamingTableId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [expandedSection, setExpandedSection] = useState<"indexes" | "checks" | "comments" | null>(null);
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
  const searchResult = useMemo(() => {
    const result = filterTableSearchRecords(searchRecords, query);
    if (tableFilter === "all") return result;
    const ids = result.ids.filter((tableId) => {
      const table = tableById.get(tableId);
      if (!table) return false;
      if (tableFilter === "relationships") return document.relationships.some((relationship) => relationship.sourceTableId === tableId || relationship.targetTableId === tableId);
      if (tableFilter === "indexes") return table.indexes.length > 0;
      if (tableFilter === "checks") return table.checkConstraints.length > 0;
      return table.columns.length === 0;
    });
    return { ...result, ids };
  }, [document.relationships, query, searchRecords, tableById, tableFilter]);
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
    const tableId = tableEditorFocus?.tableId;
    if (!tableId || !tableById.has(tableId)) return;
    if (!searchResult.ids.includes(tableId)) setQuery("");
    setExpandedTableId(tableId);
    setFocusedTableId(tableId);
  }, [tableEditorFocus?.request]);

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
    <Panel title="Tables" icon={<Table2 size={17} />} action={<PanelAction onClick={() => replace("Add table", addTable(document))}><Plus size={14} /> Add</PanelAction>}>
      <FilterSearchBox value={query} onChange={setQuery} filter={tableFilter} onFilterChange={setTableFilter} labels={tableFilterLabels} placeholder="Filter tables and fields" />
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
                      <IconButton label={`${table.name} actions`} className="table-actions-trigger" hasPopup="menu" expanded={actionMenuTableId === table.id} onClick={(event) => { event.stopPropagation(); setActionMenuTableId((current) => current === table.id ? null : table.id); }}><MoreHorizontal size={15} /></IconButton>
                      {actionMenuTableId === table.id && <div className="table-actions-menu" role="menu" onClick={(event) => event.stopPropagation()} onKeyDown={handleActionMenuKeyDown}>
                        <button role="menuitem" autoFocus onClick={() => beginRename(table.id)}><Pencil size={13} /> Rename table</button>
                        <button role="menuitem" className="danger" onClick={() => { setActionMenuTableId(null); removeTable(table.id); }}><Trash2 size={13} /> Delete table</button>
                      </div>}
                    </div>
                  </header>
                  {expanded && (
                    <div className="table-editor-body" ref={expandedBodyRef}>
                      {renamingTableId === table.id && <label className="table-name-editor">Table name<input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onBlur={() => { const commit = !cancelRenameRef.current; cancelRenameRef.current = false; finishRename(commit); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } else if (event.key === "Escape") { event.preventDefault(); cancelRenameRef.current = true; event.currentTarget.blur(); } }} /></label>}
                      <div className="subheading"><span>Fields</span><small>{table.columns.length}</small></div>
                      {table.columns.map((column) => {
                        const relationship = document.relationships.find((item) => item.sourceColumnId === column.id || item.targetColumnId === column.id);
                        return (
                          <div className={`field-editor${relationship ? " has-fk" : ""}`} key={column.id} onClick={() => setSelection({ kind: "column", tableId: table.id, columnId: column.id })}>
                            <GripVertical className="field-grip" size={14} />
                            <input aria-label="Field name" value={column.name} onChange={(event) => replace("Rename field", updateColumn(document, table.id, column.id, { name: event.target.value }))} />
                            <TypePicker document={document} value={column.typeSpec} onChange={(typeSpec) => replace("Change field type", updateColumnType(document, table.id, column.id, typeSpec))} />
                            <FieldChip active={!column.nullable} title="Toggle NOT NULL" onClick={(event) => { event.stopPropagation(); replace("Toggle NOT NULL", updateColumn(document, table.id, column.id, { nullable: column.primaryKey ? false : !column.nullable })); }}>NN</FieldChip>
                            <FieldChip active={column.primaryKey} variant="key" title="Toggle primary key" onClick={(event) => { event.stopPropagation(); replace("Toggle primary key", updateColumn(document, table.id, column.id, { primaryKey: !column.primaryKey, nullable: column.primaryKey ? column.nullable : false })); }}><KeyRound size={10} /><span>PK</span></FieldChip>
                            {relationship && <FieldChip active variant="foreign" title="Open foreign key relationship" onClick={(event) => { event.stopPropagation(); openRelationship(relationship.id, column.id); }}><GitBranch size={10} /><span>FK</span></FieldChip>}
                            <IconButton label={`Delete ${column.name}`} title="Delete field" danger className="field-delete-button" onClick={(event) => { event.stopPropagation(); replace("Delete field", deleteColumn(document, table.id, column.id)); }}><Trash2 size={12} strokeWidth={2.1} /></IconButton>
                          </div>
                        );
                      })}
                      <CollapsibleRow icon={<Boxes size={14} />} label="Indexes" count={table.indexes.length} expanded={expandedSection === "indexes"} onToggle={() => setExpandedSection((section) => section === "indexes" ? null : "indexes")} />
                      {expandedSection === "indexes" && <div className="advanced-editor-list">
                        {table.indexes.map((index) => <div className="index-editor" key={index.id}>
                          <div className="advanced-editor-main">
                            <input aria-label="Index name" placeholder="Index name" value={index.name ?? ""} onChange={(event) => replace("Rename index", updateIndex(document, table.id, index.id, { name: event.target.value }))} />
                            <FieldChip active={index.unique} title="Toggle unique index" onClick={() => replace("Toggle unique index", updateIndex(document, table.id, index.id, { unique: !index.unique }))}>UQ</FieldChip>
                            {document.dialect === "postgresql" && <select aria-label="Index method" value={index.method} onChange={(event) => replace("Change index method", updateIndex(document, table.id, index.id, { method: event.target.value as typeof index.method }))}>{postgresIndexMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select>}
                            <IconButton label="Delete index" title="Delete index" danger className="destructive-icon" onClick={() => replace("Delete index", deleteIndex(document, table.id, index.id))}><Trash2 size={13} /></IconButton>
                          </div>
                          <div className="index-columns" aria-label="Index columns">{table.columns.map((column) => <label key={column.id}><input type="checkbox" checked={index.columnIds.includes(column.id)} onChange={(event) => { const columnIds = event.target.checked ? [...index.columnIds, column.id] : index.columnIds.filter((id) => id !== column.id); replace("Change index columns", updateIndex(document, table.id, index.id, { columnIds })); }} />{column.name}</label>)}</div>
                          {index.columnIds.length === 0 && <small className="inline-warning">Select at least one field.</small>}
                        </div>)}
                      </div>}
                      <CollapsibleRow icon={<ListChecks size={14} />} label="Check constraints" count={table.checkConstraints.length} expanded={expandedSection === "checks"} onToggle={() => setExpandedSection((section) => section === "checks" ? null : "checks")} />
                      {expandedSection === "checks" && <div className="advanced-editor-list">
                        {table.checkConstraints.map((constraint) => <div className="check-editor" key={constraint.id}>
                          <div className="advanced-editor-main"><input aria-label="Constraint name" placeholder="Constraint name (optional)" value={constraint.name ?? ""} onChange={(event) => replace("Rename check constraint", updateCheckConstraint(document, table.id, constraint.id, { name: event.target.value }))} /><IconButton label="Delete check constraint" title="Delete check constraint" danger className="destructive-icon" onClick={() => replace("Delete check constraint", deleteCheckConstraint(document, table.id, constraint.id))}><Trash2 size={13} /></IconButton></div>
                          <textarea aria-label="Check expression" placeholder="price > 0" value={constraint.expression} onChange={(event) => replace("Edit check constraint", updateCheckConstraint(document, table.id, constraint.id, { expression: event.target.value }))} />
                          {!constraint.expression.trim() && <small className="inline-warning">Enter a SQL expression.</small>}
                        </div>)}
                      </div>}
                      <CollapsibleRow icon={<MessageCircle size={14} />} label="Comments" count={table.comment?.trim() ? 1 : 0} expanded={expandedSection === "comments"} className="comments-row" onToggle={() => setExpandedSection((section) => section === "comments" ? null : "comments")} />
                      {expandedSection === "comments" && <div className="table-comment-editor">
                        <div>
                          <textarea aria-label={`${table.name} comment`} placeholder="Describe this table" value={table.comment ?? ""} onChange={(event) => replace("Edit table comment", updateTable(document, table.id, { comment: event.target.value }))} />
                          <IconButton label={table.commentVisible === false ? "Show comment on canvas" : "Hide comment on canvas"} title={table.commentVisible === false ? "Show on canvas" : "Hide from canvas"} disabled={!table.comment?.trim()} onClick={() => replace("Toggle table comment", updateTable(document, table.id, { commentVisible: table.commentVisible === false }))}>{table.commentVisible === false ? <EyeOff size={14} /> : <Eye size={14} />}</IconButton>
                        </div>
                        <small>COMMENT ON TABLE</small>
                      </div>}
                      <BottomActionBar colorControl={<div className="table-color-control"><span>Color</span><ColorSwatchPicker label={`${table.name} color`} value={table.color} onChange={(color) => replace("Change table color", updateTable(document, table.id, { color }))} /></div>}>
                          <button onClick={() => replace("Add field", addColumn(document, table.id))}><Plus size={14} /> Add Field</button>
                          <button onClick={() => replace("Add index", addIndex(document, table.id))}><Boxes size={14} /> Add Index</button>
                          <button onClick={() => replace("Add check constraint", addCheckConstraint(document, table.id))}><ListChecks size={14} /> Add Check</button>
                      </BottomActionBar>
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
        return <ListCard className="custom-type-card" key={type.id}>
          <header onClick={() => setExpandedId(expanded ? null : type.id)}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span className={`custom-kind ${type.kind}`}>{type.kind.slice(0, 1).toUpperCase()}</span><strong>{type.name || "Untitled type"}</strong><small>{usages.length} uses</small><IconButton label="Delete custom type" danger className="destructive-icon" disabled={usages.length > 0} title={usages.length ? `Used by ${usages.join(", ")}` : "Delete custom type"} onClick={(event) => { event.stopPropagation(); replace("Delete custom type", deleteCustomType(document, type.id)); }}><Trash2 size={13} /></IconButton></header>
          {expanded && <CustomTypeEditor document={document} type={type} replace={replace} />}
        </ListCard>;
      })}
      {document.customTypes.length === 0 && <Empty icon={<Type size={22} />} title="No custom types" text="Add an enum, domain, or composite type. They will become available in every strict field type picker." />}
    </div>
  </Panel>;
}

function CustomTypeEditor({ document, type, replace }: { document: SchemaDocument; type: CustomType; replace: (label: string, next: SchemaDocument) => void }) {
  const update = (patch: Partial<CustomType>, label = "Edit custom type") => replace(label, updateCustomType(document, type.id, patch));
  return <div className="custom-type-editor">
    <label className="custom-name">Type name<input value={type.name} onChange={(event) => update({ name: event.target.value }, "Rename custom type")} /></label>
    {type.kind === "enum" && <div className="custom-values"><span>Ordered values</span>{type.values.map((value, index) => <div key={index}><GripVertical size={13} /><input value={value} onChange={(event) => update({ values: type.values.map((item, itemIndex) => itemIndex === index ? event.target.value : item) } as Partial<CustomType>, "Edit enum value")} /><IconButton label="Delete enum value" danger className="destructive-icon" title="Delete enum value" onClick={() => update({ values: type.values.filter((_item, itemIndex) => itemIndex !== index) } as Partial<CustomType>, "Delete enum value")}><Trash2 size={12} /></IconButton></div>)}<button className="add-row" onClick={() => update({ values: [...type.values, `value_${type.values.length + 1}`] } as Partial<CustomType>, "Add enum value")}><Plus size={13} /> Add value</button></div>}
    {type.kind === "domain" && <div className="domain-editor"><span>Base type</span><TypePicker document={document} value={type.baseType} onChange={(baseType) => update({ baseType } as Partial<CustomType>, "Change domain base type")} /><label>Default expression<input value={type.defaultExpression ?? ""} placeholder="Optional SQL expression" onChange={(event) => update({ defaultExpression: event.target.value } as Partial<CustomType>)} /></label><label className="type-check"><input type="checkbox" checked={!type.nullable} onChange={(event) => update({ nullable: !event.target.checked } as Partial<CustomType>)} />Not null</label><label>Check expression<textarea value={type.checkExpression ?? ""} placeholder="VALUE &gt; 0" onChange={(event) => update({ checkExpression: event.target.value } as Partial<CustomType>)} /></label></div>}
    {type.kind === "composite" && <div className="composite-fields"><span>Fields</span>{type.fields.map((field) => <div className="composite-field" key={field.id}><input aria-label="Composite field name" value={field.name} onChange={(event) => replace("Rename composite field", updateCompositeField(document, type.id, field.id, { name: event.target.value }))} /><TypePicker document={document} value={field.type} onChange={(fieldType) => replace("Change composite field type", updateCompositeField(document, type.id, field.id, { type: fieldType }))} /><IconButton label="Delete composite field" danger className="destructive-icon" title="Delete composite field" onClick={() => replace("Delete composite field", deleteCompositeField(document, type.id, field.id))}><Trash2 size={12} /></IconButton></div>)}<button className="add-row" onClick={() => replace("Add composite field", addCompositeField(document, type.id))}><Plus size={13} /> Add field</button></div>}
  </div>;
}

const tableFilterLabels: Record<TableListFilter, string> = {
  all: "All tables",
  relationships: "With refs",
  indexes: "With indexes",
  checks: "With checks",
  empty: "No fields",
};
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
