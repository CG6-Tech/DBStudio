import type { Column, DiagramArea, DiagramNote, Relationship, SchemaDocument, Table } from "./types";

const palette = ["#7ee0b5", "#7fb1ff", "#bc78f0", "#ff6584", "#f4c95d", "#52d5c8"];

function id(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

function structural(document: SchemaDocument, tableId: string): SchemaDocument {
  return document.structuralTableIds.includes(tableId)
    ? document
    : { ...document, structuralTableIds: [...document.structuralTableIds, tableId] };
}

export function addTable(document: SchemaDocument): SchemaDocument {
  const tableId = id("table");
  const table: Table = {
    id: tableId,
    name: `new_table_${document.tables.length + 1}`,
    originalName: "",
    columns: [],
    nameRange: { start: document.source.length, end: document.source.length },
    statementRange: { start: document.source.length, end: document.source.length },
    position: { x: 120 + document.tables.length * 34, y: 120 + document.tables.length * 26 },
    color: palette[document.tables.length % palette.length],
    collapsed: false,
    isNew: true,
  };
  return { ...document, tables: [...document.tables, table], structuralTableIds: [...document.structuralTableIds, tableId] };
}

export function deleteTable(document: SchemaDocument, tableId: string): SchemaDocument {
  const table = document.tables.find((item) => item.id === tableId);
  if (!table) return document;
  return {
    ...document,
    tables: document.tables.filter((item) => item.id !== tableId),
    relationships: document.relationships.filter((item) => item.sourceTableId !== tableId && item.targetTableId !== tableId),
    areas: document.areas.map((area) => ({ ...area, tableIds: area.tableIds.filter((id) => id !== tableId) })),
    structuralTableIds: document.structuralTableIds.filter((id) => id !== tableId),
    removedStatementRanges: table.isNew ? document.removedStatementRanges : [...document.removedStatementRanges, table.statementRange],
  };
}

export function addColumn(document: SchemaDocument, tableId: string): SchemaDocument {
  const next = {
    ...document,
    tables: document.tables.map((table) => {
      if (table.id !== tableId) return table;
      const columnId = id("column");
      const column: Column = {
        id: columnId,
        tableId,
        name: `field_${table.columns.length + 1}`,
        originalName: "",
        dataType: "TEXT",
        originalDataType: "",
        nullable: true,
        originalNullable: true,
        primaryKey: false,
        unique: false,
        nameRange: { start: table.statementRange.end, end: table.statementRange.end },
        typeRange: { start: table.statementRange.end, end: table.statementRange.end },
        isNew: true,
      };
      return { ...table, columns: [...table.columns, column] };
    }),
  };
  return structural(next, tableId);
}

export function deleteColumn(document: SchemaDocument, tableId: string, columnId: string): SchemaDocument {
  const next = {
    ...document,
    tables: document.tables.map((table) => table.id === tableId
      ? { ...table, columns: table.columns.filter((column) => column.id !== columnId) }
      : table),
    relationships: document.relationships.filter((item) => item.sourceColumnId !== columnId && item.targetColumnId !== columnId),
  };
  return structural(next, tableId);
}

export function updateColumn(
  document: SchemaDocument,
  tableId: string,
  columnId: string,
  patch: Partial<Pick<Column, "name" | "dataType" | "nullable" | "primaryKey" | "unique">>,
): SchemaDocument {
  const next = {
    ...document,
    tables: document.tables.map((table) => table.id === tableId
      ? { ...table, columns: table.columns.map((column) => column.id === columnId ? { ...column, ...patch } : column) }
      : table),
  };
  return "primaryKey" in patch || "unique" in patch ? structural(next, tableId) : next;
}

export function updateTable(
  document: SchemaDocument,
  tableId: string,
  patch: Partial<Pick<Table, "name" | "color" | "collapsed" | "position">>,
): SchemaDocument {
  return { ...document, tables: document.tables.map((table) => table.id === tableId ? { ...table, ...patch } : table) };
}

export function addRelationship(
  document: SchemaDocument,
  sourceTableId: string,
  sourceColumnId: string,
  targetTableId: string,
  targetColumnId: string,
): SchemaDocument {
  const sourceTable = document.tables.find((table) => table.id === sourceTableId);
  const targetTable = document.tables.find((table) => table.id === targetTableId);
  const sourceColumn = sourceTable?.columns.find((column) => column.id === sourceColumnId);
  const targetColumn = targetTable?.columns.find((column) => column.id === targetColumnId);
  if (!sourceTable || !targetTable || !sourceColumn || !targetColumn) return document;
  const relationship: Relationship = {
    id: id("relationship"),
    sourceTableId,
    sourceColumnId,
    targetTableId,
    targetColumnId,
    targetTableReferenceRange: { start: sourceTable.statementRange.end, end: sourceTable.statementRange.end },
    targetColumnReferenceRange: { start: sourceTable.statementRange.end, end: sourceTable.statementRange.end },
  };
  return structural({ ...document, relationships: [...document.relationships, relationship] }, sourceTableId);
}

export function deleteRelationship(document: SchemaDocument, relationshipId: string): SchemaDocument {
  const relationship = document.relationships.find((item) => item.id === relationshipId);
  if (!relationship) return document;
  return structural({ ...document, relationships: document.relationships.filter((item) => item.id !== relationshipId) }, relationship.sourceTableId);
}

export function addArea(document: SchemaDocument): SchemaDocument {
  const area: DiagramArea = {
    id: id("area"),
    name: `Area ${document.areas.length + 1}`,
    color: palette[(document.areas.length + 1) % palette.length],
    x: 90 + document.areas.length * 50,
    y: 390 + document.areas.length * 45,
    width: 620,
    height: 380,
    tableIds: [],
    locked: false,
    collapsed: false,
    moveContents: true,
  };
  return { ...document, areas: [...document.areas, area] };
}

export function updateArea(document: SchemaDocument, areaId: string, patch: Partial<DiagramArea>): SchemaDocument {
  return { ...document, areas: document.areas.map((area) => area.id === areaId ? { ...area, ...patch } : area) };
}

export function deleteArea(document: SchemaDocument, areaId: string): SchemaDocument {
  return { ...document, areas: document.areas.filter((area) => area.id !== areaId) };
}

export function addNote(document: SchemaDocument): SchemaDocument {
  const note: DiagramNote = {
    id: id("note"),
    text: "New note",
    color: palette[(document.notes.length + 4) % palette.length],
    x: 180 + document.notes.length * 36,
    y: 140 + document.notes.length * 30,
  };
  return { ...document, notes: [...document.notes, note] };
}

export function updateNote(document: SchemaDocument, noteId: string, patch: Partial<DiagramNote>): SchemaDocument {
  return { ...document, notes: document.notes.map((note) => note.id === noteId ? { ...note, ...patch } : note) };
}

export function deleteNote(document: SchemaDocument, noteId: string): SchemaDocument {
  return { ...document, notes: document.notes.filter((note) => note.id !== noteId) };
}

export function assignTableToArea(document: SchemaDocument, tableId: string, areaId: string | null): SchemaDocument {
  return {
    ...document,
    areas: document.areas.map((area) => ({
      ...area,
      tableIds: area.id === areaId
        ? Array.from(new Set([...area.tableIds, tableId]))
        : area.tableIds.filter((id) => id !== tableId),
    })),
  };
}

export { palette };
