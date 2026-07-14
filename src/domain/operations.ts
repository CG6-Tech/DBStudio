import { quoteIdentifier } from "./parser";
import type { Column, SchemaDocument, SourceRange, Table } from "./types";

export type Operation =
  | { kind: "renameTable"; tableId: string; previous: string; next: string }
  | { kind: "renameColumn"; tableId: string; columnId: string; previous: string; next: string }
  | { kind: "changeType"; tableId: string; columnId: string; previous: string; next: string }
  | { kind: "changeNullability"; tableId: string; columnId: string; previous: boolean; next: boolean }
  | { kind: "replaceDocument"; label: string; previous: SchemaDocument; next: SchemaDocument };

export interface OperationState {
  document: SchemaDocument;
  past: Operation[];
  future: Operation[];
}

function updateTable(document: SchemaDocument, tableId: string, update: (table: Table) => Table): SchemaDocument {
  return { ...document, tables: document.tables.map((table) => (table.id === tableId ? update(table) : table)) };
}

export function applyOperation(document: SchemaDocument, operation: Operation): SchemaDocument {
  if (operation.kind === "replaceDocument") return operation.next;
  return updateTable(document, operation.tableId, (table) => {
    if (operation.kind === "renameTable") return { ...table, name: operation.next };
    return {
      ...table,
      columns: table.columns.map((column) => {
        if (column.id !== operation.columnId) return column;
        if (operation.kind === "renameColumn") return { ...column, name: operation.next };
        if (operation.kind === "changeType") return { ...column, dataType: operation.next };
        return { ...column, nullable: operation.next };
      }),
    };
  });
}

export function invertOperation(operation: Operation): Operation {
  if (operation.kind === "replaceDocument") {
    return { ...operation, previous: operation.next, next: operation.previous };
  }
  return { ...operation, previous: operation.next, next: operation.previous } as Operation;
}

export function commitOperation(state: OperationState, operation: Operation): OperationState {
  return { document: applyOperation(state.document, operation), past: [...state.past, operation], future: [] };
}

export function undo(state: OperationState): OperationState {
  const operation = state.past.at(-1);
  if (!operation) return state;
  return {
    document: applyOperation(state.document, invertOperation(operation)),
    past: state.past.slice(0, -1),
    future: [operation, ...state.future],
  };
}

export function redo(state: OperationState): OperationState {
  const operation = state.future[0];
  if (!operation) return state;
  return {
    document: applyOperation(state.document, operation),
    past: [...state.past, operation],
    future: state.future.slice(1),
  };
}

interface Patch extends SourceRange {
  value: string;
}

function columnPatches(column: Column): Patch[] {
  const patches: Patch[] = [];
  if (column.name !== column.originalName) patches.push({ ...column.nameRange, value: quoteIdentifier(column.name) });
  if (column.dataType !== column.originalDataType) patches.push({ ...column.typeRange, value: column.dataType.trim() });
  if (column.nullable !== column.originalNullable) {
    if (column.notNullRange) {
      patches.push({ ...column.notNullRange, value: column.nullable ? "" : "NOT NULL" });
    } else if (!column.nullable) {
      patches.push({ start: column.typeRange.end, end: column.typeRange.end, value: " NOT NULL" });
    }
  }
  return patches;
}

function renderTable(document: SchemaDocument, table: Table): string {
  const relationshipByColumn = new Map(
    document.relationships
      .filter((relationship) => relationship.sourceTableId === table.id)
      .map((relationship) => [relationship.sourceColumnId, relationship]),
  );
  const lines = table.columns.map((column) => {
    const parts = [`  ${quoteIdentifier(column.name)}`, column.dataType.trim()];
    if (!column.nullable) parts.push("NOT NULL");
    if (column.primaryKey) parts.push("PRIMARY KEY");
    if (column.unique && !column.primaryKey) parts.push("UNIQUE");
    if (column.defaultExpression) parts.push(`DEFAULT ${column.defaultExpression}`);
    const relationship = relationshipByColumn.get(column.id);
    if (relationship) {
      const targetTable = document.tables.find((item) => item.id === relationship.targetTableId);
      const targetColumn = targetTable?.columns.find((item) => item.id === relationship.targetColumnId);
      if (targetTable && targetColumn) parts.push(`REFERENCES ${quoteIdentifier(targetTable.name)}(${quoteIdentifier(targetColumn.name)})`);
    }
    return parts.join(" ");
  });
  const qualifiedName = table.schema ? `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}` : quoteIdentifier(table.name);
  return `CREATE TABLE ${qualifiedName} (\n${lines.join(",\n")}\n);`;
}

export function generateSql(document: SchemaDocument): string {
  const patches: Patch[] = [];
  const insertions: string[] = [];
  document.tables.forEach((table) => {
    if (table.isNew) {
      insertions.push(renderTable(document, table));
      return;
    }
    if (document.structuralTableIds.includes(table.id)) {
      patches.push({ ...table.statementRange, value: renderTable(document, table) });
      return;
    }
    if (table.name !== table.originalName) patches.push({ ...table.nameRange, value: quoteIdentifier(table.name) });
    table.columns.forEach((column) => patches.push(...columnPatches(column)));
  });
  document.removedStatementRanges.forEach((range) => patches.push({ ...range, value: "" }));
  document.relationships.forEach((relationship) => {
    if (document.structuralTableIds.includes(relationship.sourceTableId)) return;
    const sourceTable = document.tables.find((table) => table.id === relationship.sourceTableId);
    const targetTable = document.tables.find((table) => table.id === relationship.targetTableId);
    const sourceColumn = sourceTable?.columns.find((column) => column.id === relationship.sourceColumnId);
    const targetColumn = targetTable?.columns.find((column) => column.id === relationship.targetColumnId);
    if (relationship.sourceColumnReferenceRange && sourceColumn && sourceColumn.name !== sourceColumn.originalName) {
      patches.push({ ...relationship.sourceColumnReferenceRange, value: quoteIdentifier(sourceColumn.name) });
    }
    if (targetTable && targetTable.name !== targetTable.originalName) {
      patches.push({ ...relationship.targetTableReferenceRange, value: quoteIdentifier(targetTable.name) });
    }
    if (targetColumn && targetColumn.name !== targetColumn.originalName) {
      patches.push({ ...relationship.targetColumnReferenceRange, value: quoteIdentifier(targetColumn.name) });
    }
  });
  patches.sort((a, b) => b.start - a.start || b.end - a.end);
  for (let index = 1; index < patches.length; index += 1) {
    if (patches[index - 1].start < patches[index].end) throw new Error("Overlapping SQL patches cannot be saved safely.");
  }
  const patched = patches.reduce((sql, patch) => sql.slice(0, patch.start) + patch.value + sql.slice(patch.end), document.source);
  return insertions.length ? `${patched.trimEnd()}\n\n${insertions.join("\n\n")}\n` : patched;
}

export function validateIdentifier(value: string, document: SchemaDocument, currentId: string): string | null {
  if (!value.trim()) return "Name cannot be empty.";
  if (value.includes("\0")) return "Name contains an invalid character.";
  const duplicateTable = document.tables.some((table) => table.id !== currentId && table.name.toLowerCase() === value.toLowerCase());
  return duplicateTable ? "A table with this name already exists." : null;
}

export function validateColumnName(value: string, table: Table, currentId: string): string | null {
  if (!value.trim()) return "Name cannot be empty.";
  const duplicate = table.columns.some((column) => column.id !== currentId && column.name.toLowerCase() === value.toLowerCase());
  return duplicate ? "A column with this name already exists in this table." : null;
}
