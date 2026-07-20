import { formatFieldType, parseFieldType } from "../dialects";
import { applyEditorDiagnostics } from "./editorDiagnostics";
import { customTypeDependentClosure, customTypeUsageLabels, schemaIndexFor } from "./schemaIndex";
import { cardinalityChangeIssue, isManagedCardinalityIndex, managedCardinalityIndex, sourceHasUniqueKey, type RelationshipCardinality } from "./relationshipCardinality";
import type { CheckConstraint, Column, CompositeTypeField, CustomType, DiagramArea, DiagramNote, FieldTypeSpec, PostgresIndexMethod, Relationship, SchemaDocument, Table, TableIndex } from "./types";

const palette = ["#7ee0b5", "#7fb1ff", "#bc78f0", "#ff6584", "#f4c95d", "#52d5c8"];

function id(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

function replaceAt<T>(items: T[], index: number, value: T): T[] {
  const next = items.slice();
  next[index] = value;
  return next;
}

function replaceTable(document: SchemaDocument, tableId: string, update: (table: Table) => Table): SchemaDocument | null {
  const index = schemaIndexFor(document).tablePositionById.get(tableId);
  if (index === undefined || document.tables[index]?.id !== tableId) return null;
  return { ...document, tables: replaceAt(document.tables, index, update(document.tables[index])) };
}

function replaceColumn(document: SchemaDocument, tableId: string, columnId: string, update: (column: Column) => Column): SchemaDocument | null {
  const location = schemaIndexFor(document).columnLocationById.get(columnId);
  if (!location || document.tables[location.tableIndex]?.id !== tableId || document.tables[location.tableIndex].columns[location.columnIndex]?.id !== columnId) return null;
  const table = document.tables[location.tableIndex];
  const nextTable = { ...table, columns: replaceAt(table.columns, location.columnIndex, update(table.columns[location.columnIndex])) };
  return { ...document, tables: replaceAt(document.tables, location.tableIndex, nextTable) };
}

function structural(previous: SchemaDocument, document: SchemaDocument, tableId: string): SchemaDocument {
  const next = schemaIndexFor(previous).structuralTableIds.has(tableId)
    ? document
    : { ...document, structuralTableIds: [...document.structuralTableIds, tableId] };
  return applyEditorDiagnostics(previous, next, { tableIds: [tableId] });
}

export function addTable(document: SchemaDocument): SchemaDocument {
  const tableId = id("table");
  const table: Table = {
    id: tableId,
    name: `new_table_${document.tables.length + 1}`,
    originalName: "",
    columns: [],
    indexes: [],
    checkConstraints: [],
    nameRange: { start: document.source.length, end: document.source.length },
    statementRange: { start: document.source.length, end: document.source.length },
    position: { x: 120 + document.tables.length * 34, y: 120 + document.tables.length * 26 },
    color: palette[document.tables.length % palette.length],
    collapsed: false,
    widthScale: 1,
    isNew: true,
  };
  return { ...document, tables: [...document.tables, table], structuralTableIds: [...document.structuralTableIds, tableId] };
}

export function deleteTable(document: SchemaDocument, tableId: string): SchemaDocument {
  const index = schemaIndexFor(document).tablePositionById.get(tableId);
  if (index === undefined) return document;
  const table = document.tables[index];
  if (!table || table.id !== tableId) return document;
  const next = {
    ...document,
    tables: [...document.tables.slice(0, index), ...document.tables.slice(index + 1)],
    relationships: document.relationships.filter((item) => item.sourceTableId !== tableId && item.targetTableId !== tableId),
    areas: document.areas.map((area) => ({ ...area, tableIds: area.tableIds.filter((id) => id !== tableId) })),
    structuralTableIds: document.structuralTableIds.filter((id) => id !== tableId),
    removedStatementRanges: table.isNew ? document.removedStatementRanges : [...document.removedStatementRanges, table.statementRange],
  };
  return applyEditorDiagnostics(document, next, { tableIds: [tableId] });
}

export function addColumn(document: SchemaDocument, tableId: string): SchemaDocument {
  const next = replaceTable(document, tableId, (table) => {
      const columnId = id("column");
      const column: Column = {
        id: columnId,
        tableId,
        name: `field_${table.columns.length + 1}`,
        originalName: "",
        dataType: "TEXT",
        typeSpec: parseFieldType("TEXT", document.dialect, document.customTypes),
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
  });
  return next ? structural(document, next, tableId) : document;
}

export function deleteColumn(document: SchemaDocument, tableId: string, columnId: string): SchemaDocument {
  const replaced = replaceTable(document, tableId, (table) => ({
    ...table,
    columns: table.columns.filter((column) => column.id !== columnId),
    indexes: table.indexes.map((index) => ({ ...index, columnIds: index.columnIds.filter((id) => id !== columnId) })),
  }));
  if (!replaced) return document;
  const next = {
    ...replaced,
    relationships: document.relationships.filter((item) => item.sourceColumnId !== columnId && item.targetColumnId !== columnId),
  };
  return structural(document, next, tableId);
}

export function updateColumn(
  document: SchemaDocument,
  tableId: string,
  columnId: string,
  patch: Partial<Pick<Column, "name" | "dataType" | "nullable" | "primaryKey" | "unique">>,
): SchemaDocument {
  const next = replaceColumn(document, tableId, columnId, (column) => ({ ...column, ...patch, ...(patch.dataType ? { typeSpec: parseFieldType(patch.dataType, document.dialect, document.customTypes) } : {}) }));
  if (!next) return document;
  return "primaryKey" in patch || "unique" in patch ? structural(document, next, tableId) : applyEditorDiagnostics(document, next, { tableIds: [tableId] });
}

export function updateColumnType(document: SchemaDocument, tableId: string, columnId: string, typeSpec: FieldTypeSpec): SchemaDocument {
  const dataType = formatFieldType(typeSpec, document.dialect, document.customTypes);
  const next = replaceColumn(document, tableId, columnId, (column) => ({ ...column, typeSpec, dataType }));
  return next ? applyEditorDiagnostics(document, next, { tableIds: [tableId] }) : document;
}

export function customTypeUsage(document: SchemaDocument, customTypeId: string): string[] {
  return customTypeUsageLabels(document, customTypeId);
}

export function addCustomType(document: SchemaDocument, kind: CustomType["kind"]): SchemaDocument {
  if (document.dialect !== "postgresql") return document;
  const typeId = id("custom-type");
  const base = { id: typeId, name: `new_${kind}_${document.customTypes.length + 1}`, originalName: "", statementRange: { start: document.source.length, end: document.source.length }, isNew: true as const };
  const type: CustomType = kind === "enum"
    ? { ...base, kind, values: ["value_1", "value_2"] }
    : kind === "domain"
      ? { ...base, kind, baseType: parseFieldType("TEXT", document.dialect, document.customTypes), nullable: true }
      : { ...base, kind, fields: [] };
  return applyEditorDiagnostics(document, { ...document, customTypes: [...document.customTypes, type] }, { customTypeIds: [type.id], customGlobals: true });
}

export function updateCustomType(document: SchemaDocument, customTypeId: string, patch: Partial<CustomType>): SchemaDocument {
  const index = schemaIndexFor(document);
  const typePosition = index.customTypePositionById.get(customTypeId);
  if (typePosition === undefined) return document;
  const currentType = document.customTypes[typePosition];
  if (!currentType || currentType.id !== customTypeId) return document;

  const affectedTypes = customTypeDependentClosure(index, customTypeId);
  const nextTypes = document.customTypes.slice();
  affectedTypes.forEach((typeId) => {
    const position = index.customTypePositionById.get(typeId);
    if (position !== undefined) nextTypes[position] = { ...nextTypes[position], isEdited: true } as CustomType;
  });
  nextTypes[typePosition] = { ...currentType, ...patch, id: currentType.id, kind: currentType.kind, isEdited: true } as CustomType;

  let tables = document.tables;
  if ("name" in patch && patch.name !== currentType.name) {
    const columnsByTable = new Map<number, number[]>();
    (index.customTypeUsages.get(customTypeId) ?? []).forEach((usage) => {
      if (usage.kind !== "column") return;
      const location = index.columnLocationById.get(usage.columnId);
      if (!location || document.tables[location.tableIndex]?.id !== usage.tableId) return;
      const columnIndexes = columnsByTable.get(location.tableIndex) ?? [];
      columnIndexes.push(location.columnIndex);
      columnsByTable.set(location.tableIndex, columnIndexes);
    });
    if (columnsByTable.size > 0) {
      tables = document.tables.slice();
      columnsByTable.forEach((columnIndexes, tablePosition) => {
        const table = document.tables[tablePosition];
        const columns = table.columns.slice();
        columnIndexes.forEach((columnPosition) => {
          const column = columns[columnPosition];
          columns[columnPosition] = { ...column, dataType: formatFieldType(column.typeSpec, document.dialect, nextTypes) };
        });
        tables[tablePosition] = {
          ...table,
          columns,
        };
      });
    }
  }

  const next = { ...document, customTypes: nextTypes, tables };
  const dependenciesChanged = "baseType" in patch || "fields" in patch;
  const nextAffectedTypes = dependenciesChanged ? customTypeDependentClosure(schemaIndexFor(next), customTypeId) : affectedTypes;
  return applyEditorDiagnostics(document, next, {
    customTypeIds: new Set([...affectedTypes, ...nextAffectedTypes]),
    customNames: "name" in patch,
    customCycles: dependenciesChanged,
  });
}

export function deleteCustomType(document: SchemaDocument, customTypeId: string): SchemaDocument {
  const index = schemaIndexFor(document);
  const position = index.customTypePositionById.get(customTypeId);
  if (position === undefined) return document;
  const type = document.customTypes[position];
  if (!type || type.id !== customTypeId) return document;
  const usages = customTypeUsageLabels(document, customTypeId, index);
  if (usages.length) return { ...document, diagnostics: [...document.diagnostics, { level: "warning", message: `Editor: ${type.name} is used by ${usages.join(", ")} and cannot be deleted.` }] };
  const next = {
    ...document,
    customTypes: [...document.customTypes.slice(0, position), ...document.customTypes.slice(position + 1)],
    removedStatementRanges: type.isNew ? document.removedStatementRanges : [...document.removedStatementRanges, type.statementRange],
  };
  return applyEditorDiagnostics(document, next, { customTypeIds: [customTypeId], customGlobals: true });
}

export function addCompositeField(document: SchemaDocument, customTypeId: string): SchemaDocument {
  const field: CompositeTypeField = { id: id("custom-field"), name: "new_field", type: parseFieldType("TEXT", document.dialect, document.customTypes) };
  const type = schemaIndexFor(document).customTypeById.get(customTypeId);
  return type?.kind === "composite" ? updateCustomType(document, customTypeId, { fields: [...type.fields, field] } as Partial<CustomType>) : document;
}

export function updateCompositeField(document: SchemaDocument, customTypeId: string, fieldId: string, patch: Partial<CompositeTypeField>): SchemaDocument {
  const type = schemaIndexFor(document).customTypeById.get(customTypeId);
  return type?.kind === "composite" ? updateCustomType(document, customTypeId, { fields: type.fields.map((field) => field.id === fieldId ? { ...field, ...patch } : field) } as Partial<CustomType>) : document;
}

export function deleteCompositeField(document: SchemaDocument, customTypeId: string, fieldId: string): SchemaDocument {
  const type = schemaIndexFor(document).customTypeById.get(customTypeId);
  return type?.kind === "composite" ? updateCustomType(document, customTypeId, { fields: type.fields.filter((field) => field.id !== fieldId) } as Partial<CustomType>) : document;
}

export function addIndex(document: SchemaDocument, tableId: string): SchemaDocument {
  const table = schemaIndexFor(document).tableById.get(tableId);
  if (!table) return document;
  const index: TableIndex = {
    id: id("index"),
    name: `idx_${table.name}_${table.indexes.length + 1}`,
    columnIds: table.columns[0] ? [table.columns[0].id] : [],
    unique: false,
    method: "btree",
    standalone: document.dialect === "postgresql",
    isNew: true,
  };
  const next = replaceTable(document, tableId, (item) => ({ ...item, indexes: [...item.indexes, index] }));
  return next ? structural(document, next, tableId) : document;
}

export function updateIndex(
  document: SchemaDocument,
  tableId: string,
  indexId: string,
  patch: Partial<Pick<TableIndex, "name" | "columnIds" | "unique" | "method">>,
): SchemaDocument {
  const next = replaceTable(document, tableId, (table) => ({ ...table, indexes: table.indexes.map((index) => index.id === indexId ? { ...index, ...patch } : index) }));
  return next ? structural(document, next, tableId) : document;
}

export function deleteIndex(document: SchemaDocument, tableId: string, indexId: string): SchemaDocument {
  const next = replaceTable(document, tableId, (table) => ({ ...table, indexes: table.indexes.filter((index) => index.id !== indexId) }));
  return next ? structural(document, next, tableId) : document;
}

export function addCheckConstraint(document: SchemaDocument, tableId: string): SchemaDocument {
  const table = schemaIndexFor(document).tableById.get(tableId);
  if (!table) return document;
  const constraint: CheckConstraint = {
    id: id("check"),
    name: `chk_${table.name}_${table.checkConstraints.length + 1}`,
    expression: "",
    isNew: true,
  };
  const next = replaceTable(document, tableId, (item) => ({ ...item, checkConstraints: [...item.checkConstraints, constraint] }));
  return next ? structural(document, next, tableId) : document;
}

export function updateCheckConstraint(
  document: SchemaDocument,
  tableId: string,
  constraintId: string,
  patch: Partial<Pick<CheckConstraint, "name" | "expression">>,
): SchemaDocument {
  const next = replaceTable(document, tableId, (table) => ({ ...table, checkConstraints: table.checkConstraints.map((constraint) => constraint.id === constraintId ? { ...constraint, ...patch } : constraint) }));
  return next ? structural(document, next, tableId) : document;
}

export function deleteCheckConstraint(document: SchemaDocument, tableId: string, constraintId: string): SchemaDocument {
  const next = replaceTable(document, tableId, (table) => ({ ...table, checkConstraints: table.checkConstraints.filter((constraint) => constraint.id !== constraintId) }));
  return next ? structural(document, next, tableId) : document;
}

export const postgresIndexMethods: PostgresIndexMethod[] = ["btree", "hash", "gist", "spgist", "gin", "brin"];

export function updateTable(
  document: SchemaDocument,
  tableId: string,
  patch: Partial<Pick<Table, "name" | "color" | "collapsed" | "position" | "widthScale" | "comment" | "commentVisible" | "commentOffset" | "commentColor">>,
): SchemaDocument {
  const next = replaceTable(document, tableId, (table) => ({ ...table, ...patch }));
  if (!next) return document;
  return "name" in patch ? applyEditorDiagnostics(document, next, { tableIds: [tableId] }) : next;
}

export function addRelationship(
  document: SchemaDocument,
  sourceTableId: string,
  sourceColumnId: string,
  targetTableId: string,
  targetColumnId: string,
): SchemaDocument {
  const index = schemaIndexFor(document);
  const sourceTable = index.tableById.get(sourceTableId);
  const targetTable = index.tableById.get(targetTableId);
  const sourceColumn = index.columnById.get(sourceColumnId);
  const targetColumn = index.columnById.get(targetColumnId);
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
  return structural(document, { ...document, relationships: [...document.relationships, relationship] }, sourceTableId);
}

export function deleteRelationship(document: SchemaDocument, relationshipId: string): SchemaDocument {
  const relationship = schemaIndexFor(document).relationshipById.get(relationshipId);
  if (!relationship) return document;
  const removedManagedIndexes = schemaIndexFor(document).tableById.get(relationship.sourceTableId)?.indexes
    .filter((index) => isManagedCardinalityIndex(index, relationship.sourceColumnId) && index.sourceRange)
    .map((index) => index.sourceRange!) ?? [];
  const next = replaceTable(document, relationship.sourceTableId, (table) => ({
    ...table,
    indexes: table.indexes.filter((index) => !isManagedCardinalityIndex(index, relationship.sourceColumnId)),
  })) ?? document;
  return structural(document, {
    ...next,
    relationships: document.relationships.filter((item) => item.id !== relationshipId),
    removedStatementRanges: [...next.removedStatementRanges, ...removedManagedIndexes],
  }, relationship.sourceTableId);
}

export function updateRelationship(
  document: SchemaDocument,
  relationshipId: string,
  patch: Pick<Relationship, "sourceTableId" | "sourceColumnId" | "targetTableId" | "targetColumnId">,
): SchemaDocument {
  const current = schemaIndexFor(document).relationshipById.get(relationshipId);
  if (!current) return document;
  const next = { ...document, relationships: document.relationships.map((relationship) => relationship.id === relationshipId ? { ...relationship, ...patch } : relationship) };
  const withOldSource = structural(document, next, current.sourceTableId);
  return patch.sourceTableId === current.sourceTableId ? withOldSource : structural(document, withOldSource, patch.sourceTableId);
}

export function updateRelationshipWithCardinality(
  document: SchemaDocument,
  relationshipId: string,
  patch: Pick<Relationship, "sourceTableId" | "sourceColumnId" | "targetTableId" | "targetColumnId">,
  cardinality: RelationshipCardinality,
): SchemaDocument {
  const current = schemaIndexFor(document).relationshipById.get(relationshipId);
  if (!current || cardinalityChangeIssue(document, patch.sourceTableId, patch.sourceColumnId, cardinality)) return document;
  const sourceChanged = current.sourceTableId !== patch.sourceTableId || current.sourceColumnId !== patch.sourceColumnId;
  const removedManagedIndexes = document.tables
    .filter((table) => table.id === current.sourceTableId && (sourceChanged || cardinality === "N:1"))
    .flatMap((table) => table.indexes.filter((index) => isManagedCardinalityIndex(index, current.sourceColumnId) && index.sourceRange).map((index) => index.sourceRange!));
  const tables = document.tables.map((table) => {
    let indexes = table.indexes;
    if (table.id === current.sourceTableId && (sourceChanged || cardinality === "N:1")) {
      indexes = indexes.filter((index) => !isManagedCardinalityIndex(index, current.sourceColumnId));
    }
    if (table.id === patch.sourceTableId && cardinality === "1:1") {
      const tableWithRemovals = indexes === table.indexes ? table : { ...table, indexes };
      if (!sourceHasUniqueKey(tableWithRemovals, patch.sourceColumnId)) {
        indexes = [...indexes, managedCardinalityIndex(table, patch.sourceColumnId, document.dialect)];
      }
    }
    return indexes === table.indexes ? table : { ...table, indexes };
  });
  const relationships = document.relationships.map((relationship) => relationship.id === relationshipId ? { ...relationship, ...patch } : relationship);
  let next = { ...document, tables, relationships, removedStatementRanges: [...document.removedStatementRanges, ...removedManagedIndexes] };
  next = structural(document, next, current.sourceTableId);
  if (patch.sourceTableId !== current.sourceTableId) next = structural(document, next, patch.sourceTableId);
  return next;
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
    noteIds: [],
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
  return { ...document, notes: document.notes.filter((note) => note.id !== noteId), areas: document.areas.map((area) => ({ ...area, noteIds: (area.noteIds ?? []).filter((id) => id !== noteId) })) };
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

export function assignNoteToArea(document: SchemaDocument, noteId: string, areaId: string | null): SchemaDocument {
  return {
    ...document,
    areas: document.areas.map((area) => ({
      ...area,
      noteIds: area.id === areaId
        ? Array.from(new Set([...(area.noteIds ?? []), noteId]))
        : (area.noteIds ?? []).filter((id) => id !== noteId),
    })),
  };
}

export { palette };
