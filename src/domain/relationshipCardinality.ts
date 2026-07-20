import { schemaIndexFor } from "./schemaIndex";
import type { Relationship, SchemaDocument, Table, TableIndex } from "./types";

export type RelationshipCardinality = "N:1" | "1:1";

const managedIndexPrefix = "viewdb_rel_";

function isSingleColumnUniqueIndex(index: TableIndex, columnId: string): boolean {
  return index.unique && index.columnIds.length === 1 && index.columnIds[0] === columnId;
}

export function isManagedCardinalityIndex(index: TableIndex, columnId: string): boolean {
  return isSingleColumnUniqueIndex(index, columnId) && Boolean(index.name?.startsWith(managedIndexPrefix));
}

export function relationshipCardinality(document: SchemaDocument, relationship: Relationship): RelationshipCardinality {
  const schema = schemaIndexFor(document);
  const sourceTable = schema.tableById.get(relationship.sourceTableId);
  const sourceColumn = schema.columnById.get(relationship.sourceColumnId);
  if (!sourceTable || !sourceColumn) return "N:1";
  const hasUniqueIndex = sourceTable.indexes.some((index) => isSingleColumnUniqueIndex(index, sourceColumn.id));
  return sourceColumn.primaryKey || sourceColumn.unique || hasUniqueIndex ? "1:1" : "N:1";
}

export function cardinalityChangeIssue(
  document: SchemaDocument,
  sourceTableId: string,
  sourceColumnId: string,
  cardinality: RelationshipCardinality,
): string | null {
  if (cardinality === "1:1") return null;
  const sourceTable = schemaIndexFor(document).tableById.get(sourceTableId);
  const sourceColumn = schemaIndexFor(document).columnById.get(sourceColumnId);
  if (!sourceTable || !sourceColumn) return "Choose a valid source field.";
  if (sourceColumn.primaryKey) return "This field is a primary key. Remove the primary key before using N:1.";
  if (sourceColumn.unique) return "This field has a user-defined UNIQUE constraint. Remove it in the table editor before using N:1.";
  const userUniqueIndex = sourceTable.indexes.some((index) => isSingleColumnUniqueIndex(index, sourceColumn.id) && !isManagedCardinalityIndex(index, sourceColumn.id));
  return userUniqueIndex ? "This field has a user-defined unique index. Remove it in the table editor before using N:1." : null;
}

export function managedCardinalityIndex(table: Table, columnId: string, dialect: SchemaDocument["dialect"]): TableIndex {
  const column = table.columns.find((item) => item.id === columnId);
  const safeName = `${table.name}_${column?.name ?? "field"}`.replace(/[^a-zA-Z0-9_]+/g, "_").toLocaleLowerCase("en");
  return {
    id: `index:${crypto.randomUUID()}`,
    name: `${managedIndexPrefix}${safeName}_unique`,
    columnIds: [columnId],
    unique: true,
    method: "btree",
    standalone: dialect === "postgresql",
    isNew: true,
  };
}

export function sourceHasUniqueKey(table: Table, columnId: string): boolean {
  const column = table.columns.find((item) => item.id === columnId);
  return Boolean(column?.primaryKey || column?.unique || table.indexes.some((index) => isSingleColumnUniqueIndex(index, columnId)));
}
