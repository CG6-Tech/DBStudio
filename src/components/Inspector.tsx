import { useEffect, useState } from "react";
import type { Operation } from "../domain/operations";
import { validateColumnName, validateIdentifier } from "../domain/operations";
import type { SchemaDocument, Selection } from "../domain/types";

interface InspectorProps {
  document: SchemaDocument;
  selection: Selection;
  onOperation: (operation: Operation) => void;
}

export function Inspector({ document, selection, onOperation }: InspectorProps) {
  const table = document.tables.find((item) => item.id === (selection?.kind === "table" || selection?.kind === "column" ? selection.tableId : undefined));
  const column = selection?.kind === "column" ? table?.columns.find((item) => item.id === selection.columnId) : undefined;
  const [name, setName] = useState("");
  const [dataType, setDataType] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(column?.name ?? table?.name ?? "");
    setDataType(column?.dataType ?? "");
    setError(null);
  }, [column?.id, column?.name, column?.dataType, table?.id, table?.name]);

  if (!selection || !table) {
    return (
      <aside className="inspector empty-inspector">
        <div className="empty-glyph"><span /><span /><span /></div>
        <h2>Nothing selected</h2>
        <p>Select a table or column on the canvas to inspect and edit it.</p>
      </aside>
    );
  }

  const commitName = () => {
    const next = name.trim();
    const validation = column ? validateColumnName(next, table, column.id) : validateIdentifier(next, document, table.id);
    setError(validation);
    if (validation || next === (column?.name ?? table.name)) return;
    onOperation(column
      ? { kind: "renameColumn", tableId: table.id, columnId: column.id, previous: column.name, next }
      : { kind: "renameTable", tableId: table.id, previous: table.name, next });
  };

  const commitType = () => {
    const next = dataType.trim();
    if (!column || !next || next === column.dataType) return;
    onOperation({ kind: "changeType", tableId: table.id, columnId: column.id, previous: column.dataType, next });
  };

  return (
    <aside className="inspector">
      <div className="inspector-eyebrow">{column ? "COLUMN" : "TABLE"}</div>
      <h2>{column?.name ?? table.name}</h2>
      <div className="rule" />
      <label>
        <span>Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} onBlur={commitName} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} />
      </label>
      {error && <p className="field-error">{error}</p>}
      {column ? (
        <>
          <label>
            <span>Data type</span>
            <input className="mono" value={dataType} onChange={(event) => setDataType(event.target.value)} onBlur={commitType} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} />
          </label>
          <label className="switch-row">
            <span>
              <strong>Allow NULL</strong>
              <small>Column may contain an empty value</small>
            </span>
            <input
              type="checkbox"
              checked={column.nullable}
              disabled={column.primaryKey}
              onChange={(event) => onOperation({
                kind: "changeNullability",
                tableId: table.id,
                columnId: column.id,
                previous: column.nullable,
                next: event.target.checked,
              })}
            />
          </label>
          <div className="inspector-meta"><span>Source</span><code>{table.name}.{column.originalName}</code></div>
        </>
      ) : (
        <div className="table-summary">
          <div><strong>{table.columns.length}</strong><span>Columns</span></div>
          <div><strong>{table.columns.filter((item) => item.primaryKey).length}</strong><span>Primary keys</span></div>
        </div>
      )}
    </aside>
  );
}
