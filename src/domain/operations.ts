import { quoteIdentifier } from "./parser";
import { formatFieldType } from "../dialects";
import { buildSchemaIndex, type SchemaIndex } from "./schemaIndex";
import type { Column, CustomType, SchemaDocument, SourceRange, Table } from "./types";

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

function columnPatches(column: Column, document: SchemaDocument): Patch[] {
  const patches: Patch[] = [];
  if (column.name !== column.originalName) patches.push({ ...column.nameRange, value: quoteIdentifier(column.name, document.dialect) });
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

function renderTable(document: SchemaDocument, table: Table, schemaIndex: SchemaIndex): string {
  const relationshipByColumn = new Map(
    (schemaIndex.relationshipsByTableId.get(table.id) ?? [])
      .filter((relationship) => relationship.sourceTableId === table.id)
      .map((relationship) => [relationship.sourceColumnId, relationship]),
  );
  const lines = table.columns.map((column) => {
    const parts = [`  ${quoteIdentifier(column.name, document.dialect)}`, column.dataType.trim()];
    if (!column.nullable) parts.push("NOT NULL");
    if (column.primaryKey) parts.push("PRIMARY KEY");
    if (column.unique && !column.primaryKey) parts.push("UNIQUE");
    if (column.defaultExpression) parts.push(`DEFAULT ${column.defaultExpression}`);
    const relationship = relationshipByColumn.get(column.id);
    if (relationship) {
      const targetTable = schemaIndex.tableById.get(relationship.targetTableId);
      const targetColumn = schemaIndex.columnById.get(relationship.targetColumnId);
      if (targetTable && targetColumn) parts.push(`REFERENCES ${quoteIdentifier(targetTable.name, document.dialect)}(${quoteIdentifier(targetColumn.name, document.dialect)})`);
    }
    return parts.join(" ");
  });
  table.checkConstraints.forEach((constraint) => {
    if (!constraint.expression.trim()) return;
    const prefix = constraint.name?.trim() ? `CONSTRAINT ${quoteIdentifier(constraint.name.trim(), document.dialect)} ` : "";
    lines.push(`  ${prefix}CHECK (${constraint.expression.trim()})`);
  });
  if (document.dialect === "mysql") {
    table.indexes.forEach((index) => {
      const columns = index.columnIds
        .map((columnId) => schemaIndex.columnById.get(columnId))
        .filter((column): column is Column => column?.tableId === table.id)
        .map((column) => quoteIdentifier(column.name, document.dialect));
      if (columns.length === 0) return;
      const name = index.name?.trim() ? ` ${quoteIdentifier(index.name.trim(), document.dialect)}` : "";
      lines.push(`  ${index.unique ? "UNIQUE " : ""}KEY${name} (${columns.join(", ")})`);
    });
  }
  const qualifiedName = table.schema ? `${quoteIdentifier(table.schema, document.dialect)}.${quoteIdentifier(table.name, document.dialect)}` : quoteIdentifier(table.name, document.dialect);
  return `CREATE TABLE ${qualifiedName} (\n${lines.join(",\n")}\n)${table.tableOptions ?? ""};`;
}

function renderPostgresIndexes(document: SchemaDocument, table: Table, schemaIndex: SchemaIndex): string[] {
  if (document.dialect !== "postgresql") return [];
  const qualifiedName = table.schema ? `${quoteIdentifier(table.schema, document.dialect)}.${quoteIdentifier(table.name, document.dialect)}` : quoteIdentifier(table.name, document.dialect);
  return table.indexes.flatMap((index) => {
    const columns = index.columnIds
      .map((columnId) => schemaIndex.columnById.get(columnId))
      .filter((column): column is Column => column?.tableId === table.id)
      .map((column) => quoteIdentifier(column.name, document.dialect));
    if (columns.length === 0) return [];
    const fallbackName = `idx_${table.name}_${columns.map((column) => column.replaceAll('"', "")).join("_")}`;
    const name = quoteIdentifier(index.name?.trim() || fallbackName, document.dialect);
    return [`CREATE ${index.unique ? "UNIQUE " : ""}INDEX ${name} ON ${qualifiedName} USING ${index.method} (${columns.join(", ")});`];
  });
}

function renderCustomType(document: SchemaDocument, type: CustomType): string | null {
  if (document.dialect !== "postgresql" || !type.name.trim()) return null;
  const qualifiedName = type.schema ? `${quoteIdentifier(type.schema, document.dialect)}.${quoteIdentifier(type.name, document.dialect)}` : quoteIdentifier(type.name, document.dialect);
  if (type.kind === "enum") {
    const values = type.values.map((value) => value.trim());
    if (values.some((value) => !value) || new Set(values).size !== values.length) return null;
    return `CREATE TYPE ${qualifiedName} AS ENUM (${values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ")});`;
  }
  if (type.kind === "domain") {
    if (type.baseType.kind === "unresolved") return null;
    const parts = [`CREATE DOMAIN ${qualifiedName} AS ${formatFieldType(type.baseType, document.dialect, document.customTypes)}`];
    if (type.defaultExpression?.trim()) parts.push(`DEFAULT ${type.defaultExpression.trim()}`);
    if (!type.nullable) parts.push("NOT NULL");
    if (type.checkExpression?.trim()) parts.push(`CHECK (${type.checkExpression.trim()})`);
    return `${parts.join(" ")};`;
  }
  const names = type.fields.map((field) => field.name.trim());
  if (names.some((name) => !name) || new Set(names.map((name) => name.toLowerCase())).size !== names.length || type.fields.some((field) => field.type.kind === "unresolved")) return null;
  const fields = type.fields.map((field) => `  ${quoteIdentifier(field.name, document.dialect)} ${formatFieldType(field.type, document.dialect, document.customTypes)}`);
  return `CREATE TYPE ${qualifiedName} AS (\n${fields.join(",\n")}\n);`;
}

export function generateSql(document: SchemaDocument): string {
  const patches: Patch[] = [];
  const customInsertions: string[] = [];
  const tableInsertions: string[] = [];
  const schemaIndex = buildSchemaIndex(document);
  document.customTypes.forEach((type) => {
    const rendered = renderCustomType(document, type);
    if (type.isNew) {
      if (rendered) customInsertions.push(rendered);
    } else if (type.isEdited && rendered) {
      patches.push({ ...type.statementRange, value: rendered });
    }
  });
  document.tables.forEach((table) => {
    if (table.isNew) {
      tableInsertions.push([renderTable(document, table, schemaIndex), ...renderPostgresIndexes(document, table, schemaIndex)].join("\n"));
      return;
    }
    if (schemaIndex.structuralTableIds.has(table.id)) {
      patches.push({ ...table.statementRange, value: renderTable(document, table, schemaIndex) });
      table.indexes.forEach((index) => {
        if (index.standalone && index.sourceRange) patches.push({ ...index.sourceRange, value: "" });
      });
      tableInsertions.push(...renderPostgresIndexes(document, table, schemaIndex));
      return;
    }
    if (table.name !== table.originalName) patches.push({ ...table.nameRange, value: quoteIdentifier(table.name, document.dialect) });
    table.columns.forEach((column) => patches.push(...columnPatches(column, document)));
  });
  document.removedStatementRanges.forEach((range) => patches.push({ ...range, value: "" }));
  document.relationships.forEach((relationship) => {
    if (schemaIndex.structuralTableIds.has(relationship.sourceTableId)) return;
    const targetTable = schemaIndex.tableById.get(relationship.targetTableId);
    const sourceColumn = schemaIndex.columnById.get(relationship.sourceColumnId);
    const targetColumn = schemaIndex.columnById.get(relationship.targetColumnId);
    if (relationship.sourceColumnReferenceRange && sourceColumn && sourceColumn.name !== sourceColumn.originalName) {
      patches.push({ ...relationship.sourceColumnReferenceRange, value: quoteIdentifier(sourceColumn.name, document.dialect) });
    }
    if (targetTable && targetTable.name !== targetTable.originalName) {
      patches.push({ ...relationship.targetTableReferenceRange, value: quoteIdentifier(targetTable.name, document.dialect) });
    }
    if (targetColumn && targetColumn.name !== targetColumn.originalName) {
      patches.push({ ...relationship.targetColumnReferenceRange, value: quoteIdentifier(targetColumn.name, document.dialect) });
    }
  });
  patches.sort((a, b) => b.start - a.start || b.end - a.end);
  for (let index = 1; index < patches.length; index += 1) {
    if (patches[index - 1].start < patches[index].end) throw new Error("Overlapping SQL patches cannot be saved safely.");
  }
  const pieces: string[] = [];
  let sourceCursor = document.source.length;
  patches.forEach((patch) => {
    pieces.push(document.source.slice(patch.end, sourceCursor), patch.value);
    sourceCursor = patch.start;
  });
  pieces.push(document.source.slice(0, sourceCursor));
  const patched = pieces.reverse().join("");
  const insertions = [...customInsertions, ...tableInsertions];
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
