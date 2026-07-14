import { quoteIdentifier } from "./parser";
import type { Column, SchemaDocument, SourceRange, Table } from "./types";

export type Operation =
  | { kind: "renameTable"; tableId: string; previous: string; next: string }
  | { kind: "renameColumn"; tableId: string; columnId: string; previous: string; next: string }
  | { kind: "changeType"; tableId: string; columnId: string; previous: string; next: string }
  | { kind: "changeNullability"; tableId: string; columnId: string; previous: boolean; next: boolean };

export interface OperationState {
  document: SchemaDocument;
  past: Operation[];
  future: Operation[];
}

function updateTable(document: SchemaDocument, tableId: string, update: (table: Table) => Table): SchemaDocument {
  return { ...document, tables: document.tables.map((table) => (table.id === tableId ? update(table) : table)) };
}

export function applyOperation(document: SchemaDocument, operation: Operation): SchemaDocument {
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

export function generateSql(document: SchemaDocument): string {
  const patches: Patch[] = [];
  document.tables.forEach((table) => {
    if (table.name !== table.originalName) patches.push({ ...table.nameRange, value: quoteIdentifier(table.name) });
    table.columns.forEach((column) => patches.push(...columnPatches(column)));
  });
  document.relationships.forEach((relationship) => {
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
  return patches.reduce((sql, patch) => sql.slice(0, patch.start) + patch.value + sql.slice(patch.end), document.source);
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
