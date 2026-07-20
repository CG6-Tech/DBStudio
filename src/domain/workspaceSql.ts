import { generateSql } from "./operations";
import type { CustomType, SchemaDocument, Table } from "./types";
import type { FileId, SqlWorkspace } from "./workspaceTypes";

function unchangedTable(table: Table): Table {
  return {
    ...table,
    originalName: table.name,
    isNew: false,
    columns: table.columns.map((column) => ({ ...column, originalName: column.name, originalDataType: column.dataType, originalNullable: column.nullable, isNew: false })),
    indexes: table.indexes.map((index) => ({ ...index, isNew: false })),
    checkConstraints: table.checkConstraints.map((check) => ({ ...check, isNew: false })),
  };
}

function unchangedType(type: CustomType): CustomType {
  return { ...type, originalName: type.name, isNew: false, isEdited: false } as CustomType;
}

export function assignNewEntityOwnership(workspace: SqlWorkspace, previous: SchemaDocument, next: SchemaDocument): void {
  const selected = workspace.selectedFileId;
  if (!selected) return;
  const previousIds = new Set([
    ...previous.tables.map((table) => table.id),
    ...previous.customTypes.map((type) => type.id),
  ]);
  for (const table of next.tables) {
    if (!previousIds.has(table.id) && !workspace.entitySourceById.has(table.id)) {
      workspace.entitySourceById.set(table.id, { fileId: selected, range: { start: workspace.filesById.get(selected)?.source?.length ?? 0, end: workspace.filesById.get(selected)?.source?.length ?? 0 } });
      table.columns.forEach((column) => workspace.entitySourceById.set(column.id, { fileId: selected, range: table.statementRange }));
    }
    for (const column of table.columns) {
      if (!workspace.entitySourceById.has(column.id)) workspace.entitySourceById.set(column.id, { fileId: workspace.entitySourceById.get(table.id)?.fileId ?? selected, range: table.statementRange });
    }
  }
  for (const type of next.customTypes) if (!previousIds.has(type.id) && !workspace.entitySourceById.has(type.id)) {
    workspace.entitySourceById.set(type.id, { fileId: selected, range: { start: workspace.filesById.get(selected)?.source?.length ?? 0, end: workspace.filesById.get(selected)?.source?.length ?? 0 } });
  }
  for (const relationship of next.relationships) if (!workspace.entitySourceById.has(relationship.id)) {
    const sourceOwner = workspace.entitySourceById.get(relationship.sourceTableId)?.fileId ?? selected;
    workspace.entitySourceById.set(relationship.id, { fileId: sourceOwner, range: workspace.entitySourceById.get(relationship.sourceTableId)?.range ?? { start: 0, end: 0 } });
  }
  const previousRelationships = new Map(previous.relationships.map((relationship) => [relationship.id, relationship]));
  for (const relationship of next.relationships) {
    const prior = previousRelationships.get(relationship.id);
    if (!prior || prior.sourceTableId === relationship.sourceTableId) continue;
    const nextOwner = workspace.entitySourceById.get(relationship.sourceTableId)?.fileId;
    if (nextOwner) workspace.entitySourceById.set(relationship.id, { fileId: nextOwner, range: workspace.entitySourceById.get(relationship.sourceTableId)?.range ?? { start: 0, end: 0 } });
  }
}

function signature(value: unknown): string {
  return JSON.stringify(value, (key, item) => ["position", "color", "collapsed", "commentVisible", "commentOffset", "commentColor"].includes(key) ? undefined : item);
}

export function affectedWorkspaceFiles(workspace: SqlWorkspace, previous: SchemaDocument, next: SchemaDocument): Set<FileId> {
  const affected = new Set<FileId>();
  const previousEntities = new Map<string, unknown>([
    ...previous.tables.map((table) => [table.id, table] as const),
    ...previous.customTypes.map((type) => [type.id, type] as const),
    ...previous.relationships.map((relationship) => [relationship.id, relationship] as const),
  ]);
  const nextEntities = new Map<string, unknown>([
    ...next.tables.map((table) => [table.id, table] as const),
    ...next.customTypes.map((type) => [type.id, type] as const),
    ...next.relationships.map((relationship) => [relationship.id, relationship] as const),
  ]);
  const ids = new Set([...previousEntities.keys(), ...nextEntities.keys()]);
  for (const id of ids) {
    if (signature(previousEntities.get(id)) === signature(nextEntities.get(id))) continue;
    const owner = workspace.entitySourceById.get(id)?.fileId;
    if (owner) affected.add(owner);
  }
  const previousTables = new Map(previous.tables.map((table) => [table.id, table]));
  const nextTables = new Map(next.tables.map((table) => [table.id, table]));
  for (const relationship of next.relationships) {
    const previousTarget = previousTables.get(relationship.targetTableId);
    const nextTarget = nextTables.get(relationship.targetTableId);
    const previousColumn = previousTarget?.columns.find((column) => column.id === relationship.targetColumnId);
    const nextColumn = nextTarget?.columns.find((column) => column.id === relationship.targetColumnId);
    if (previousTarget?.name === nextTarget?.name && previousColumn?.name === nextColumn?.name) continue;
    const sourceOwner = workspace.entitySourceById.get(relationship.sourceTableId)?.fileId;
    if (sourceOwner) affected.add(sourceOwner);
  }
  for (const tableId of new Set([...previous.structuralTableIds, ...next.structuralTableIds])) {
    if (previous.structuralTableIds.includes(tableId) === next.structuralTableIds.includes(tableId)) continue;
    const owner = workspace.entitySourceById.get(tableId)?.fileId;
    if (owner) affected.add(owner);
  }
  return affected;
}

export function generateWorkspaceSql(workspace: SqlWorkspace, document: SchemaDocument): Map<FileId, string> {
  const result = new Map<FileId, string>();
  for (const fileId of workspace.dirtyFileIds) {
    const fragment = workspace.fragmentsByFileId.get(fileId);
    if (!fragment) continue;
    const owned = (id: string) => workspace.entitySourceById.get(id)?.fileId === fileId;
    const originalOwnedTables = fragment.document.tables;
    const liveIds = new Set(document.tables.map((table) => table.id));
    const removedStatementRanges = originalOwnedTables.filter((table) => !liveIds.has(table.id)).map((table) => table.statementRange);
    const structuralTableIds = new Set(document.structuralTableIds.filter(owned));
    for (const relationship of document.relationships) {
      if (!owned(relationship.sourceTableId)) continue;
      const target = document.tables.find((table) => table.id === relationship.targetTableId);
      const targetColumn = target?.columns.find((column) => column.id === relationship.targetColumnId);
      if (target && (target.name !== target.originalName || targetColumn?.name !== targetColumn?.originalName)) structuralTableIds.add(relationship.sourceTableId);
    }
    const projection: SchemaDocument = {
      ...document,
      source: fragment.file.source ?? "",
      tables: document.tables.map((table) => owned(table.id) ? table : unchangedTable(table)),
      customTypes: document.customTypes.map((type) => owned(type.id) ? type : unchangedType(type)),
      triggers: document.triggers,
      routines: document.routines,
      logicEdges: document.logicEdges,
      structuralTableIds: [...structuralTableIds],
      removedStatementRanges,
    };
    result.set(fileId, generateSql(projection));
  }
  return result;
}
