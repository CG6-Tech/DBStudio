import type { SchemaDocument, SqlDialect } from "./types";

export interface MigrationSnapshotColumn {
  key: string;
  name: string;
  dataType: string;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  defaultExpression?: string;
  fingerprint: string;
}

export interface MigrationSnapshotIndex {
  key: string;
  name?: string;
  columns: string[];
  unique: boolean;
  method: string;
  fingerprint: string;
}

export interface MigrationSnapshotForeignKey {
  key: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  fingerprint: string;
}

export interface MigrationSnapshotTable {
  key: string;
  schema?: string;
  name: string;
  columns: MigrationSnapshotColumn[];
  indexes: MigrationSnapshotIndex[];
  checks: Array<{ key: string; name?: string; expression: string; fingerprint: string }>;
  foreignKeys: MigrationSnapshotForeignKey[];
  fingerprint: string;
}

export interface MigrationSnapshotObject {
  key: string;
  kind: "type" | "routine" | "trigger";
  name: string;
  schema?: string;
  definition: string;
  targetTable?: string;
  routineKind?: "function" | "procedure";
  fingerprint: string;
}

export interface MigrationSnapshot {
  format: "dbstudio-migration-snapshot";
  version: 1;
  dialect: SqlDialect;
  engineVersion?: string;
  sourceId: string;
  sourceLabel: string;
  fingerprint: string;
  tables: MigrationSnapshotTable[];
  objects: MigrationSnapshotObject[];
}

export function normalizedIdentifier(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("en");
}

export function qualifiedObjectKey(schema: string | undefined, name: string): string {
  return `${normalizedIdentifier(schema) || "public"}.${normalizedIdentifier(name)}`;
}

export function stableHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function canonical(parts: Array<string | number | boolean | undefined>): string {
  return parts.map((part) => part === undefined ? "" : String(part).trim().toLocaleLowerCase("en")).join("\u001f");
}

export function migrationSnapshotFromDocument(document: SchemaDocument, sourceId = "current", sourceLabel = "Current schema", engineVersion?: string): MigrationSnapshot {
  const tableById = new Map(document.tables.map((table) => [table.id, table]));
  const columnById = new Map(document.tables.flatMap((table) => table.columns.map((column) => [column.id, column] as const)));
  const relationshipsByTable = new Map<string, typeof document.relationships>();
  document.relationships.forEach((relationship) => relationshipsByTable.set(relationship.sourceTableId, [...(relationshipsByTable.get(relationship.sourceTableId) ?? []), relationship]));

  const tables = document.tables.map((table) => {
    const columns = table.columns.map((column) => {
      const fingerprint = stableHash(canonical([column.dataType, column.nullable, column.primaryKey, column.unique, column.defaultExpression]));
      return { key: normalizedIdentifier(column.name), name: column.name, dataType: column.dataType.trim(), nullable: column.nullable, primaryKey: column.primaryKey, unique: column.unique, defaultExpression: column.defaultExpression?.trim() || undefined, fingerprint };
    });
    const columnNameById = new Map(table.columns.map((column) => [column.id, column.name]));
    const indexes = table.indexes.map((index) => {
      const names = index.columnIds.flatMap((id) => columnNameById.get(id) ?? []);
      return { key: normalizedIdentifier(index.name) || `index:${names.map(normalizedIdentifier).join(",")}`, name: index.name, columns: names, unique: index.unique, method: index.method, fingerprint: stableHash(canonical([index.unique, index.method, ...names.map(normalizedIdentifier)])) };
    });
    const checks = table.checkConstraints.map((check) => ({ key: normalizedIdentifier(check.name) || `check:${stableHash(check.expression)}`, name: check.name, expression: check.expression.trim(), fingerprint: stableHash(check.expression.trim()) }));
    const foreignKeys = (relationshipsByTable.get(table.id) ?? []).flatMap((relationship) => {
      const source = columnById.get(relationship.sourceColumnId);
      const targetTable = tableById.get(relationship.targetTableId);
      const target = columnById.get(relationship.targetColumnId);
      if (!source || !targetTable || !target) return [];
      const targetTableKey = qualifiedObjectKey(targetTable.schema, targetTable.name);
      const signature = canonical([source.name, targetTableKey, target.name]);
      return [{ key: `fk:${normalizedIdentifier(source.name)}:${targetTableKey}:${normalizedIdentifier(target.name)}`, sourceColumn: source.name, targetTable: targetTableKey, targetColumn: target.name, fingerprint: stableHash(signature) }];
    });
    const fingerprint = stableHash([
      ...columns.map((column) => `${column.key}:${column.fingerprint}`),
      ...indexes.map((index) => `${index.key}:${index.fingerprint}`),
      ...checks.map((check) => `${check.key}:${check.fingerprint}`),
      ...foreignKeys.map((foreignKey) => `${foreignKey.key}:${foreignKey.fingerprint}`),
    ].sort().join("\u001e"));
    return { key: qualifiedObjectKey(table.schema, table.name), schema: table.schema, name: table.name, columns, indexes, checks, foreignKeys, fingerprint };
  }).sort((left, right) => left.key.localeCompare(right.key));

  const objects: MigrationSnapshotObject[] = [
    ...document.customTypes.map((type) => ({ key: qualifiedObjectKey(type.schema, type.name), kind: "type" as const, schema: type.schema, name: type.name, definition: document.source.slice(type.statementRange.start, type.statementRange.end).trim(), fingerprint: "" })),
    ...document.routines.map((routine) => ({ key: qualifiedObjectKey(routine.schema, routine.name), kind: "routine" as const, schema: routine.schema, name: routine.name, definition: routine.definitionSql.trim(), routineKind: routine.kind, fingerprint: "" })),
    ...document.triggers.map((trigger) => ({ key: qualifiedObjectKey(trigger.schema, trigger.name), kind: "trigger" as const, schema: trigger.schema, name: trigger.name, definition: trigger.definitionSql.trim(), targetTable: qualifiedObjectKey(trigger.targetTable.schema, trigger.targetTable.name), fingerprint: "" })),
  ].map((object) => ({ ...object, fingerprint: stableHash(object.definition) })).sort((left, right) => left.kind.localeCompare(right.kind) || left.key.localeCompare(right.key));
  const fingerprint = stableHash(`${document.dialect}\u001d${tables.map((table) => `${table.key}:${table.fingerprint}`).join("\u001e")}\u001d${objects.map((object) => `${object.kind}:${object.key}:${object.fingerprint}`).join("\u001e")}`);
  return { format: "dbstudio-migration-snapshot", version: 1, dialect: document.dialect, engineVersion, sourceId, sourceLabel, fingerprint, tables, objects };
}
