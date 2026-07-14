import type { Column, Relationship, SchemaDocument, Table } from "./types";

export interface CanvasIndexes {
  tableById: Map<string, Table>;
  columnById: Map<string, Column>;
  relationshipsByTable: Map<string, Relationship[]>;
}

export interface CanvasTableSnapshot {
  geometry: string;
  content: string;
  style: string;
}

export interface CanvasSnapshot {
  source: string;
  tables: Map<string, CanvasTableSnapshot>;
  relationshipIds: Set<string>;
}

export interface CanvasDiff {
  sourceChanged: boolean;
  addedTables: Set<string>;
  removedTables: Set<string>;
  geometryChanged: Set<string>;
  contentChanged: Set<string>;
  styleChanged: Set<string>;
  addedRelationships: Set<string>;
  removedRelationships: Set<string>;
}

export function buildCanvasIndexes(document: SchemaDocument): CanvasIndexes {
  const tableById = new Map(document.tables.map((table) => [table.id, table]));
  const columnById = new Map<string, Column>();
  const relationshipsByTable = new Map<string, Relationship[]>();
  document.tables.forEach((table) => table.columns.forEach((column) => columnById.set(column.id, column)));
  document.relationships.forEach((relationship) => {
    const sourceRelationships = relationshipsByTable.get(relationship.sourceTableId) ?? [];
    sourceRelationships.push(relationship);
    relationshipsByTable.set(relationship.sourceTableId, sourceRelationships);
    if (relationship.targetTableId !== relationship.sourceTableId) {
      const targetRelationships = relationshipsByTable.get(relationship.targetTableId) ?? [];
      targetRelationships.push(relationship);
      relationshipsByTable.set(relationship.targetTableId, targetRelationships);
    }
  });
  return { tableById, columnById, relationshipsByTable };
}

export function createCanvasSnapshot(document: SchemaDocument): CanvasSnapshot {
  return {
    source: document.source,
    tables: new Map(document.tables.map((table) => [table.id, {
      geometry: `${table.position.x}:${table.position.y}:${table.collapsed}`,
      content: `${table.name}|${table.columns.map((column) => `${column.id}:${column.name}:${column.dataType}:${column.nullable}:${column.primaryKey}:${column.unique}`).join("|")}`,
      style: table.color,
    }])),
    relationshipIds: new Set(document.relationships.map((relationship) => relationship.id)),
  };
}

export function diffCanvasSnapshots(previous: CanvasSnapshot, next: CanvasSnapshot): CanvasDiff {
  const addedTables = new Set<string>(), removedTables = new Set<string>(), geometryChanged = new Set<string>(), contentChanged = new Set<string>(), styleChanged = new Set<string>();
  next.tables.forEach((value, id) => {
    const prior = previous.tables.get(id);
    if (!prior) { addedTables.add(id); return; }
    if (prior.geometry !== value.geometry) geometryChanged.add(id);
    if (prior.content !== value.content) contentChanged.add(id);
    if (prior.style !== value.style) styleChanged.add(id);
  });
  previous.tables.forEach((_value, id) => { if (!next.tables.has(id)) removedTables.add(id); });
  return {
    sourceChanged: previous.source !== next.source,
    addedTables, removedTables, geometryChanged, contentChanged, styleChanged,
    addedRelationships: new Set([...next.relationshipIds].filter((id) => !previous.relationshipIds.has(id))),
    removedRelationships: new Set([...previous.relationshipIds].filter((id) => !next.relationshipIds.has(id))),
  };
}
