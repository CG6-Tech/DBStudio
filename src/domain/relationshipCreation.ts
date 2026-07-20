import type { Column, SchemaDocument } from "./types";

export interface RelationshipCandidate {
  sourceTableId: string;
  sourceColumnId: string;
  targetTableId: string;
  targetColumnId: string;
  sourceName: string;
  targetName: string;
  dataType: string;
  score: number;
}

export function normalizeRelationshipType(rawType: string): string {
  return rawType.trim().toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/character varying/g, "varchar")
    .replace(/double precision/g, "double")
    .replace(/\bint4\b|\binteger\b/g, "int")
    .replace(/\bint8\b/g, "bigint")
    .replace(/\bint2\b/g, "smallint")
    .replace(/\bbigserial\b/g, "bigint")
    .replace(/\bsmallserial\b/g, "smallint")
    .replace(/\bserial\b/g, "int")
    .replace(/\bbool\b/g, "boolean")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)\s*/g, ")")
    .replace(/\s*,\s*/g, ",");
}

export function relationshipColumnsCompatible(source: Column, target: Column): boolean {
  return source.id !== target.id && normalizeRelationshipType(source.dataType) === normalizeRelationshipType(target.dataType);
}

export function relationshipAlreadyExists(document: SchemaDocument, sourceColumnId: string, targetColumnId: string): boolean {
  return document.relationships.some((relationship) => relationship.sourceColumnId === sourceColumnId && relationship.targetColumnId === targetColumnId);
}

export function relationshipCandidates(document: SchemaDocument, sourceTableId: string, targetTableId: string): RelationshipCandidate[] {
  const source = document.tables.find((table) => table.id === sourceTableId);
  const target = document.tables.find((table) => table.id === targetTableId);
  if (!source || !target || source.id === target.id) return [];
  const candidates: RelationshipCandidate[] = [];
  source.columns.forEach((sourceColumn) => target.columns.forEach((targetColumn) => {
    if (!relationshipColumnsCompatible(sourceColumn, targetColumn) || relationshipAlreadyExists(document, sourceColumn.id, targetColumn.id)) return;
    const targetKeyScore = targetColumn.primaryKey ? 0 : targetColumn.unique ? 1 : 4;
    const nameScore = sourceColumn.name.replace(/_id$/i, "").toLowerCase() === target.name.replace(/s$/i, "").toLowerCase() ? 0 : 2;
    candidates.push({
      sourceTableId, sourceColumnId: sourceColumn.id, targetTableId, targetColumnId: targetColumn.id,
      sourceName: sourceColumn.name, targetName: targetColumn.name, dataType: normalizeRelationshipType(sourceColumn.dataType),
      score: targetKeyScore + nameScore,
    });
  }));
  return candidates.sort((left, right) => left.score - right.score || left.sourceName.localeCompare(right.sourceName) || left.targetName.localeCompare(right.targetName));
}

export function canCreateRelationship(document: SchemaDocument, sourceTableId: string, sourceColumnId: string, targetTableId: string, targetColumnId: string): boolean {
  if (sourceTableId === targetTableId && sourceColumnId === targetColumnId) return false;
  const source = document.tables.find((table) => table.id === sourceTableId)?.columns.find((column) => column.id === sourceColumnId);
  const target = document.tables.find((table) => table.id === targetTableId)?.columns.find((column) => column.id === targetColumnId);
  return Boolean(source && target && relationshipColumnsCompatible(source, target) && !relationshipAlreadyExists(document, sourceColumnId, targetColumnId));
}
