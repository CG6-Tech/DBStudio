import { normalizeRelationshipType } from "./relationshipCreation";
import { schemaIndexFor } from "./schemaIndex";
import type { Column, SchemaDocument } from "./types";

export interface CompatibilityCandidate {
  tableId: string;
  columnId: string;
  label: string;
  dataType: string;
  score: number;
  reason: string;
}

export interface RelationshipValidation {
  valid: boolean;
  reason?: "missing" | "same-field" | "incompatible-type" | "target-not-key" | "duplicate";
  message?: string;
}

function pair(sourceId: string, targetId: string): string { return `${sourceId}>${targetId}`; }

export function validateRelationshipEndpoints(document: SchemaDocument, sourceColumnId: string, targetColumnId: string, ignoreRelationshipId?: string): RelationshipValidation {
  const index = schemaIndexFor(document);
  const source = index.columnById.get(sourceColumnId);
  const target = index.columnById.get(targetColumnId);
  if (!source || !target) return { valid: false, reason: "missing", message: "Choose both endpoint fields." };
  if (source.id === target.id) return { valid: false, reason: "same-field", message: "A field cannot reference itself." };
  if (normalizeRelationshipType(source.dataType) !== normalizeRelationshipType(target.dataType)) return { valid: false, reason: "incompatible-type", message: "The field types are not compatible." };
  if (!target.primaryKey && !target.unique) return { valid: false, reason: "target-not-key", message: "The target should be a primary or unique field." };
  if (document.relationships.some((relationship) => relationship.id !== ignoreRelationshipId && relationship.sourceColumnId === source.id && relationship.targetColumnId === target.id)) return { valid: false, reason: "duplicate", message: "This relationship already exists." };
  return { valid: true };
}

function pushHeap(heap: CompatibilityCandidate[], item: CompatibilityCandidate, limit: number): void {
  heap.push(item);
  heap.sort((a, b) => b.score - a.score || b.label.localeCompare(a.label));
  if (heap.length > limit) heap.shift();
}

export function compatibleTargets(document: SchemaDocument, sourceColumnId: string, limit = 20): CompatibilityCandidate[] {
  const index = schemaIndexFor(document);
  const source = index.columnById.get(sourceColumnId);
  if (!source) return [];
  const connected = new Set(document.relationships.map((relationship) => pair(relationship.sourceColumnId, relationship.targetColumnId)));
  const sourceTable = index.tableById.get(source.tableId);
  const sourceBase = source.name.replace(/_id$/i, "").toLocaleLowerCase("en");
  const heap: CompatibilityCandidate[] = [];
  for (const table of document.tables) for (const column of table.columns) {
    if (column.id === source.id || connected.has(pair(source.id, column.id)) || normalizeRelationshipType(column.dataType) !== normalizeRelationshipType(source.dataType)) continue;
    let score = column.primaryKey ? 0 : column.unique ? 5 : 25;
    const tableBase = table.name.replace(/s$/i, "").toLocaleLowerCase("en");
    if (sourceBase === tableBase) score -= 10;
    if (source.name.toLocaleLowerCase("en") === column.name.toLocaleLowerCase("en")) score -= 4;
    if (sourceTable?.schema && sourceTable.schema === table.schema) score -= 1;
    pushHeap(heap, { tableId: table.id, columnId: column.id, label: `${table.schema ? `${table.schema}.` : ""}${table.name}.${column.name}`, dataType: column.dataType, score, reason: column.primaryKey ? "Primary key" : column.unique ? "Unique field" : "Compatible type" }, limit);
  }
  return heap.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label, "en", { numeric: true }));
}

export function allEndpointColumns(document: SchemaDocument): Array<{ tableId: string; column: Column; label: string }> {
  return document.tables.flatMap((table) => table.columns.map((column) => ({ tableId: table.id, column, label: `${table.schema ? `${table.schema}.` : ""}${table.name}.${column.name}` })));
}
