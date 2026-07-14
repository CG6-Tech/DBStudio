import { useState } from "react";
import {
  Boxes, ChevronDown, ChevronRight, CircleAlert, FileCode2, FolderOpen, GitBranch,
  Layers3, ListChecks, Lock, Move, Palette, Plus, Search, Settings2, Shapes, Table2, Trash2,
  Type, X,
} from "lucide-react";
import type { Operation } from "../domain/operations";
import {
  addArea, addColumn, addNote, addRelationship, addTable, deleteArea, deleteColumn,
  deleteNote, deleteRelationship, deleteTable, palette, updateArea, updateColumn, updateNote, updateTable,
} from "../domain/schemaActions";
import type { SchemaDocument } from "../domain/types";
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
  const setSelection = useUiStore((state) => state.setSelection);
  const [query, setQuery] = useState("");
  const [visualTab, setVisualTab] = useState<"areas" | "notes">("areas");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(document.tables.map((table) => table.id)));
  const replace = (label: string, next: SchemaDocument) => onReplace(label, next);

  const toggle = (tableId: string) => setExpanded((current) => {
    const next = new Set(current);
    next.has(tableId) ? next.delete(tableId) : next.add(tableId);
    return next;
  });

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
            <p className="panel-help">Open a PostgreSQL file. Folder workspaces are handled by the native workspace service.</p>
          </Panel>
        )}
        {active === "tables" && (
          <Panel title="Tables" icon={<Table2 size={17} />} action={<button className="panel-action" onClick={() => replace("Add table", addTable(document))}><Plus size={14} /> Add</button>}>
            <SearchBox value={query} onChange={setQuery} />
            <div className="object-list">
              {document.tables.filter((table) => `${table.name} ${table.columns.map((column) => column.name).join(" ")}`.toLowerCase().includes(query.toLowerCase())).map((table) => (
                <section className="table-editor" key={table.id} style={{ "--object-color": table.color } as React.CSSProperties}>
                  <header onClick={() => { toggle(table.id); setSelection({ kind: "table", tableId: table.id }); }}>
                    {expanded.has(table.id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <span className="drag-dots">⠿</span>
                    <input value={table.name} onClick={(event) => event.stopPropagation()} onChange={(event) => replace("Rename table", updateTable(document, table.id, { name: event.target.value }))} />
                    <input className="color-input" aria-label={`${table.name} color`} type="color" value={table.color} onClick={(event) => event.stopPropagation()} onChange={(event) => replace("Change table color", updateTable(document, table.id, { color: event.target.value }))} />
                    <button className="icon-button danger" title="Delete table" onClick={(event) => { event.stopPropagation(); replace("Delete table", deleteTable(document, table.id)); }}><Trash2 size={14} /></button>
                  </header>
                  {expanded.has(table.id) && (
                    <div className="table-editor-body">
                      <div className="subheading"><span>Fields</span><small>{table.columns.length}</small></div>
                      {table.columns.map((column) => (
                        <div className="field-editor" key={column.id} onClick={() => setSelection({ kind: "column", tableId: table.id, columnId: column.id })}>
                          <span className="drag-dots">⠿</span>
                          <input aria-label="Field name" value={column.name} onChange={(event) => replace("Rename field", updateColumn(document, table.id, column.id, { name: event.target.value }))} />
                          <input aria-label="Data type" className="field-type" value={column.dataType} onChange={(event) => replace("Change field type", updateColumn(document, table.id, column.id, { dataType: event.target.value }))} />
                          <button className={column.nullable ? "field-flag" : "field-flag active"} title="Toggle nullable" onClick={() => replace("Toggle nullability", updateColumn(document, table.id, column.id, { nullable: !column.nullable }))}>N</button>
                          <button className={column.primaryKey ? "field-flag key active" : "field-flag key"} title="Toggle primary key" onClick={() => replace("Toggle primary key", updateColumn(document, table.id, column.id, { primaryKey: !column.primaryKey, nullable: column.primaryKey }))}>K</button>
                          <button className="icon-button danger" title="Delete field" onClick={() => replace("Delete field", deleteColumn(document, table.id, column.id))}><X size={13} /></button>
                        </div>
                      ))}
                      <button className="add-row" onClick={() => replace("Add field", addColumn(document, table.id))}><Plus size={15} /> Add field</button>
                      <div className="advanced-row"><span><Boxes size={14} /> Indexes</span><ChevronRight size={14} /></div>
                      <div className="advanced-row"><span><ListChecks size={14} /> Check constraints</span><ChevronRight size={14} /></div>
                    </div>
                  )}
                </section>
              ))}
            </div>
          </Panel>
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
                    <input className="color-input" aria-label={`${area.name} color`} type="color" value={area.color} onChange={(event) => replace("Change area color", updateArea(document, area.id, { color: event.target.value }))} />
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
                    <input className="color-input" aria-label="Note color" type="color" value={note.color} onChange={(event) => replace("Change note color", updateNote(document, note.id, { color: event.target.value }))} />
                    <button className="icon-button danger" title="Delete note" onClick={() => replace("Delete note", deleteNote(document, note.id))}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              {document.notes.length === 0 && <Empty icon={<FileCode2 size={22} />} title="No notes yet" text="Add a note to explain a domain, decision, or migration." />}
            </div>}
            <div className="palette-row">{palette.map((color) => <span key={color} style={{ background: color }} />)}</div>
          </Panel>
        )}
        {active === "types" && (
          <Panel title="Custom types" icon={<Type size={17} />} action={<button className="panel-action"><Plus size={14} /> Enum</button>}>
            <Empty icon={<Type size={22} />} title="No custom types" text="PostgreSQL enums and reusable types will appear here." />
          </Panel>
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

function RelationshipsPanel({ document, replace }: { document: SchemaDocument; replace: (label: string, next: SchemaDocument) => void }) {
  const firstTable = document.tables[0];
  const secondTable = document.tables[1];
  const [sourceTableId, setSourceTableId] = useState(firstTable?.id ?? "");
  const [targetTableId, setTargetTableId] = useState(secondTable?.id ?? firstTable?.id ?? "");
  const sourceTable = document.tables.find((table) => table.id === sourceTableId);
  const targetTable = document.tables.find((table) => table.id === targetTableId);
  const [sourceColumnId, setSourceColumnId] = useState(sourceTable?.columns[0]?.id ?? "");
  const [targetColumnId, setTargetColumnId] = useState(targetTable?.columns[0]?.id ?? "");
  return (
    <Panel title="Relationships" icon={<GitBranch size={17} />}>
      <div className="relationship-form">
        <label>From<select value={sourceTableId} onChange={(event) => { setSourceTableId(event.target.value); setSourceColumnId(document.tables.find((table) => table.id === event.target.value)?.columns[0]?.id ?? ""); }}>{document.tables.map((table) => <option value={table.id} key={table.id}>{table.name}</option>)}</select></label>
        <label>Field<select value={sourceColumnId} onChange={(event) => setSourceColumnId(event.target.value)}>{sourceTable?.columns.map((column) => <option value={column.id} key={column.id}>{column.name}</option>)}</select></label>
        <label>To<select value={targetTableId} onChange={(event) => { setTargetTableId(event.target.value); setTargetColumnId(document.tables.find((table) => table.id === event.target.value)?.columns[0]?.id ?? ""); }}>{document.tables.map((table) => <option value={table.id} key={table.id}>{table.name}</option>)}</select></label>
        <label>Field<select value={targetColumnId} onChange={(event) => setTargetColumnId(event.target.value)}>{targetTable?.columns.map((column) => <option value={column.id} key={column.id}>{column.name}</option>)}</select></label>
        <button className="primary-wide" disabled={!sourceColumnId || !targetColumnId} onClick={() => replace("Add relationship", addRelationship(document, sourceTableId, sourceColumnId, targetTableId, targetColumnId))}><Plus size={15} /> Add relationship</button>
      </div>
      <div className="relationship-list">{document.relationships.map((relationship) => {
        const source = document.tables.find((table) => table.id === relationship.sourceTableId);
        const target = document.tables.find((table) => table.id === relationship.targetTableId);
        return <div className="relationship-row" key={relationship.id}><GitBranch size={14} /><span>{source?.name} → {target?.name}</span><button className="icon-button danger" onClick={() => replace("Delete relationship", deleteRelationship(document, relationship.id))}><Trash2 size={13} /></button></div>;
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
function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="panel-empty">{icon}<strong>{title}</strong><p>{text}</p></div>;
}
