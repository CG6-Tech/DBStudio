import { parseFieldType } from "../dialects";
import { parseSchema } from "./parser";
import { linkDatabaseLogic } from "./logicParser";
import type { Column, CustomType, Relationship, SchemaDocument, SqlDialect, Table } from "./types";
import {
  fileIdForPath,
  workspaceEntityId,
  type FileId,
  type SourceLocation,
  type SqlFileFragment,
  type WorkspaceFile,
} from "./workspaceTypes";

function qualified(schema: string | undefined, name: string): string {
  return `${schema?.toLocaleLowerCase("en") ?? ""}.${name.toLocaleLowerCase("en")}`;
}

function namespaceDocument(document: SchemaDocument, fileId: FileId): SchemaDocument {
  const tableIds = new Map<string, string>();
  const columnIds = new Map<string, string>();
  const customTypeIds = new Map<string, string>();
  const routineIds = new Map<string, string>();
  const triggerIds = new Map<string, string>();
  const tables = document.tables.map((table, occurrence) => {
    const tableId = workspaceEntityId(fileId, "table", qualified(table.schema, table.name), occurrence);
    tableIds.set(table.id, tableId);
    const columns = table.columns.map((column, columnOccurrence) => {
      const columnId = workspaceEntityId(fileId, "column", `${qualified(table.schema, table.name)}.${column.name}`, columnOccurrence);
      columnIds.set(column.id, columnId);
      return { ...column, id: columnId, tableId };
    });
    return {
      ...table,
      id: tableId,
      columns,
      indexes: table.indexes.map((index, indexOccurrence) => ({
        ...index,
        id: workspaceEntityId(fileId, "index", `${qualified(table.schema, table.name)}.${index.name ?? "anonymous"}`, indexOccurrence),
        columnIds: index.columnIds.map((id) => columnIds.get(id) ?? id),
      })),
      checkConstraints: table.checkConstraints.map((check, checkOccurrence) => ({
        ...check,
        id: workspaceEntityId(fileId, "check", `${qualified(table.schema, table.name)}.${check.name ?? "anonymous"}`, checkOccurrence),
      })),
    };
  });
  const customTypes = document.customTypes.map((type, occurrence) => {
    const id = workspaceEntityId(fileId, "custom-type", qualified(type.schema, type.name), occurrence);
    customTypeIds.set(type.id, id);
    if (type.kind !== "composite") return { ...type, id };
    return { ...type, id, fields: type.fields.map((field, fieldOccurrence) => ({ ...field, id: workspaceEntityId(fileId, "custom-field", `${qualified(type.schema, type.name)}.${field.name}`, fieldOccurrence) })) };
  });
  const relationships = document.relationships.map((relationship, occurrence) => ({
    ...relationship,
    id: workspaceEntityId(fileId, "relationship", relationship.id, occurrence),
    sourceTableId: tableIds.get(relationship.sourceTableId) ?? relationship.sourceTableId,
    sourceColumnId: columnIds.get(relationship.sourceColumnId) ?? relationship.sourceColumnId,
    targetTableId: tableIds.get(relationship.targetTableId) ?? relationship.targetTableId,
    targetColumnId: columnIds.get(relationship.targetColumnId) ?? relationship.targetColumnId,
  }));
  const routines = document.routines.map((routine, occurrence) => {
    const id = workspaceEntityId(fileId, "routine", qualified(routine.schema, routine.name), occurrence);
    routineIds.set(routine.id, id);
    return { ...routine, id };
  });
  const triggers = document.triggers.map((trigger, occurrence) => {
    const id = workspaceEntityId(fileId, "trigger", qualified(trigger.schema, trigger.name), occurrence);
    triggerIds.set(trigger.id, id);
    return { ...trigger, id };
  });
  const updateType = (column: Column): Column => column.typeSpec.customTypeId
    ? { ...column, typeSpec: { ...column.typeSpec, customTypeId: customTypeIds.get(column.typeSpec.customTypeId) ?? column.typeSpec.customTypeId } }
    : column;
  return {
    ...document,
    tables: tables.map((table) => ({ ...table, columns: table.columns.map(updateType) })),
    customTypes,
    relationships,
    routines,
    triggers,
    logicEdges: document.logicEdges.map((edge, occurrence) => ({
      ...edge,
      id: workspaceEntityId(fileId, "logic-edge", edge.id, occurrence),
      sourceId: tableIds.get(edge.sourceId) ?? routineIds.get(edge.sourceId) ?? triggerIds.get(edge.sourceId) ?? edge.sourceId,
      targetId: edge.targetId ? tableIds.get(edge.targetId) ?? routineIds.get(edge.targetId) ?? triggerIds.get(edge.targetId) ?? edge.targetId : undefined,
    })),
    structuralTableIds: document.structuralTableIds.map((id) => tableIds.get(id) ?? id),
  };
}

export function parseWorkspaceFragment(file: WorkspaceFile, dialect: SqlDialect): SqlFileFragment {
  const source = file.source ?? "";
  const document = namespaceDocument(parseSchema(source, dialect), file.id);
  return { file, document };
}

export interface LinkedWorkspaceDocument {
  document: SchemaDocument;
  entitySourceById: Map<string, SourceLocation>;
  dependenciesByFileId: Map<FileId, Set<FileId>>;
  dependentsByFileId: Map<FileId, Set<FileId>>;
}

function tableOwnerMap(fragments: readonly SqlFileFragment[]): Map<string, FileId> {
  const result = new Map<string, FileId>();
  for (const fragment of fragments) for (const table of fragment.document.tables) result.set(table.id, fragment.file.id);
  return result;
}

function uniqueTableByName(tables: readonly Table[]): Map<string, Table> {
  const candidates = new Map<string, Table[]>();
  for (const table of tables) {
    const key = qualified(table.schema, table.name);
    const values = candidates.get(key) ?? [];
    values.push(table);
    candidates.set(key, values);
  }
  return new Map([...candidates].filter(([, values]) => values.length === 1).map(([key, values]) => [key, values[0]]));
}

function relationshipKey(relationship: Relationship): string {
  return `${relationship.sourceColumnId}>${relationship.targetColumnId}`;
}

export function linkWorkspaceFragments(fragmentsInput: readonly SqlFileFragment[], dialect: SqlDialect): LinkedWorkspaceDocument {
  const fragments = [...fragmentsInput].sort((a, b) => a.file.relativePath.localeCompare(b.file.relativePath, "en"));
  const tables = fragments.flatMap((fragment) => fragment.document.tables.map((table) => ({ ...table, indexes: [...table.indexes] })));
  const customTypes = fragments.flatMap((fragment) => fragment.document.customTypes);
  const routines = fragments.flatMap((fragment) => fragment.document.routines);
  const triggers = fragments.flatMap((fragment) => fragment.document.triggers);
  const diagnostics = fragments.flatMap((fragment) => fragment.document.diagnostics.filter((item) => !item.message.startsWith("Foreign key ")));
  const entitySourceById = new Map<string, SourceLocation>();
  for (const fragment of fragments) {
    const own = (id: string, range: { start: number; end: number }) => entitySourceById.set(id, { fileId: fragment.file.id, range });
    for (const table of fragment.document.tables) {
      own(table.id, table.statementRange);
      for (const column of table.columns) own(column.id, column.nameRange);
      for (const index of table.indexes) own(index.id, index.sourceRange ?? table.statementRange);
      for (const check of table.checkConstraints) own(check.id, check.sourceRange ?? table.statementRange);
    }
    for (const type of fragment.document.customTypes) own(type.id, type.statementRange);
    for (const routine of fragment.document.routines) own(routine.id, routine.statementRange);
    for (const trigger of fragment.document.triggers) own(trigger.id, trigger.statementRange);
    for (const relationship of fragment.document.relationships) own(relationship.id, relationship.targetTableReferenceRange);
  }

  const byName = uniqueTableByName(tables);
  const duplicates = new Map<string, number>();
  for (const table of tables) duplicates.set(qualified(table.schema, table.name), (duplicates.get(qualified(table.schema, table.name)) ?? 0) + 1);
  for (const [name, count] of duplicates) if (count > 1) diagnostics.push({ level: "error", message: `Duplicate table declaration: ${name.slice(1)}` });

  // Reparse one synthetic stream only as a semantic linker. File-local documents remain authoritative for saving.
  const spans: Array<{ fileId: FileId; start: number; end: number }> = [];
  let syntheticOffset = 0;
  const syntheticSource = fragments.map((fragment) => {
    const source = fragment.file.source ?? "";
    spans.push({ fileId: fragment.file.id, start: syntheticOffset, end: syntheticOffset + source.length });
    syntheticOffset += source.length + 3;
    return source;
  }).join("\n;\n");
  const synthetic = parseSchema(syntheticSource, dialect);
  diagnostics.push(...synthetic.diagnostics.filter((item) => item.message.startsWith("Foreign key ")));
  const syntheticTables = new Map(synthetic.tables.map((table) => [table.id, table]));
  const relationships = fragments.flatMap((fragment) => fragment.document.relationships);
  const relationshipKeys = new Set(relationships.map(relationshipKey));
  const owners = tableOwnerMap(fragments);
  const dependenciesByFileId = new Map<FileId, Set<FileId>>(fragments.map((fragment) => [fragment.file.id, new Set()]));
  const dependentsByFileId = new Map<FileId, Set<FileId>>(fragments.map((fragment) => [fragment.file.id, new Set()]));
  const spanForOffset = (offset: number) => spans.find((span) => offset >= span.start && offset <= span.end);
  const localRange = (range: { start: number; end: number }, span: { start: number }) => ({ start: range.start - span.start, end: range.end - span.start });

  for (const syntheticTable of synthetic.tables) {
    const target = byName.get(qualified(syntheticTable.schema, syntheticTable.name));
    if (!target) continue;
    for (const index of syntheticTable.indexes) {
      if (!index.standalone || !index.sourceRange) continue;
      const span = spanForOffset(index.sourceRange.start);
      if (!span || target.indexes.some((existing) => existing.standalone && existing.name?.toLocaleLowerCase("en") === index.name?.toLocaleLowerCase("en"))) continue;
      const columnIds = index.columnIds.flatMap((columnId) => {
        const sourceColumn = syntheticTable.columns.find((column) => column.id === columnId);
        const targetColumn = target.columns.find((column) => column.name.toLocaleLowerCase("en") === sourceColumn?.name.toLocaleLowerCase("en"));
        return targetColumn ? [targetColumn.id] : [];
      });
      const linkedIndex = {
        ...index,
        id: workspaceEntityId(span.fileId, "index", index.name ?? `${target.name}-index`, target.indexes.length),
        columnIds,
        sourceRange: localRange(index.sourceRange, span),
      };
      target.indexes.push(linkedIndex);
      entitySourceById.set(linkedIndex.id, { fileId: span.fileId, range: linkedIndex.sourceRange });
    }
  }

  for (const relation of synthetic.relationships) {
    const sourceSynthetic = syntheticTables.get(relation.sourceTableId);
    const targetSynthetic = syntheticTables.get(relation.targetTableId);
    if (!sourceSynthetic || !targetSynthetic) continue;
    const source = byName.get(qualified(sourceSynthetic.schema, sourceSynthetic.name));
    const target = byName.get(qualified(targetSynthetic.schema, targetSynthetic.name));
    const sourceSyntheticColumn = sourceSynthetic.columns.find((column) => column.id === relation.sourceColumnId);
    const targetSyntheticColumn = targetSynthetic.columns.find((column) => column.id === relation.targetColumnId);
    const sourceColumn = source?.columns.find((column) => column.name.toLocaleLowerCase("en") === sourceSyntheticColumn?.name.toLocaleLowerCase("en"));
    const targetColumn = target?.columns.find((column) => column.name.toLocaleLowerCase("en") === targetSyntheticColumn?.name.toLocaleLowerCase("en"));
    if (!source || !target || !sourceColumn || !targetColumn) continue;
    const key = `${sourceColumn.id}>${targetColumn.id}`;
    if (!relationshipKeys.has(key)) {
      const sourceFileId = owners.get(source.id)!;
      const span = spanForOffset(relation.targetTableReferenceRange.start);
      const linked: Relationship = {
        id: workspaceEntityId(sourceFileId, "relationship", key, relationships.length),
        sourceTableId: source.id,
        sourceColumnId: sourceColumn.id,
        targetTableId: target.id,
        targetColumnId: targetColumn.id,
        sourceColumnReferenceRange: relation.sourceColumnReferenceRange && span ? localRange(relation.sourceColumnReferenceRange, span) : undefined,
        targetTableReferenceRange: span ? localRange(relation.targetTableReferenceRange, span) : source.statementRange,
        targetColumnReferenceRange: span ? localRange(relation.targetColumnReferenceRange, span) : source.statementRange,
      };
      relationships.push(linked);
      relationshipKeys.add(key);
      entitySourceById.set(linked.id, { fileId: sourceFileId, range: linked.targetTableReferenceRange });
    }
  }

  for (const relation of relationships) {
    const sourceFile = owners.get(relation.sourceTableId);
    const targetFile = owners.get(relation.targetTableId);
    if (!sourceFile || !targetFile || sourceFile === targetFile) continue;
    dependenciesByFileId.get(sourceFile)?.add(targetFile);
    dependentsByFileId.get(targetFile)?.add(sourceFile);
  }

  const linkedTypes = new Map(customTypes.map((type) => [qualified(type.schema, type.name), type]));
  const resolvedTables = tables.map((table) => ({
    ...table,
    columns: table.columns.map((column) => {
      if (column.typeSpec.kind !== "unresolved") return column;
      const key = column.typeSpec.typeId.includes(".") ? `.${column.typeSpec.typeId.split(".").at(-1)!.toLocaleLowerCase("en")}` : `.${column.typeSpec.typeId.toLocaleLowerCase("en")}`;
      const custom = linkedTypes.get(key) ?? [...linkedTypes].find(([name]) => name.endsWith(key))?.[1];
      return custom ? { ...column, typeSpec: parseFieldType(column.dataType, dialect, [custom]) } : column;
    }),
  }));
  const logicEdges = linkDatabaseLogic(resolvedTables, routines, triggers);
  for (const edge of logicEdges) {
    if (!edge.targetId) continue;
    const sourceFile = entitySourceById.get(edge.sourceId)?.fileId;
    const targetFile = entitySourceById.get(edge.targetId)?.fileId;
    if (!sourceFile || !targetFile || sourceFile === targetFile) continue;
    dependenciesByFileId.get(sourceFile)?.add(targetFile);
    dependentsByFileId.get(targetFile)?.add(sourceFile);
  }

  return {
    document: {
      dialect,
      hasSavedLayout: false,
      source: "",
      tables: resolvedTables,
      relationships,
      diagnostics,
      areas: [],
      notes: [],
      customTypes: customTypes as CustomType[],
      triggers,
      routines,
      logicEdges,
      structuralTableIds: [],
      removedStatementRanges: [],
    },
    entitySourceById,
    dependenciesByFileId,
    dependentsByFileId,
  };
}

export function workspaceFiles(files: readonly WorkspaceFile[]): Map<FileId, WorkspaceFile> {
  return new Map(files.map((file) => [file.id || fileIdForPath(file.relativePath), file]));
}
