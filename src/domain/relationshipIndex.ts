import { normalizeRelationshipType } from "./relationshipCreation";
import { relationshipCardinality } from "./relationshipCardinality";
import { schemaIndexFor } from "./schemaIndex";
import type { SchemaDocument } from "./types";

export type RelationshipFilter = "crossFile" | "invalid" | "oneToOne" | "manyToOne";
export type RelationshipGrouping = "none" | "source" | "target" | "schema";

export interface RelationshipRecord {
  ordinal: number;
  id: string;
  sourceTableId: string;
  sourceColumnId: string;
  targetTableId: string;
  targetColumnId: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  sourceSchema: string;
  targetSchema: string;
  sourceFile?: string;
  targetFile?: string;
  cardinality: "1:1" | "N:1";
  valid: boolean;
  searchText: string;
}

export interface RelationshipIndex {
  records: RelationshipRecord[];
  relationshipById: Map<string, RelationshipRecord>;
  ordinalById: Map<string, number>;
  incomingByTableId: Map<string, readonly number[]>;
  outgoingByTableId: Map<string, readonly number[]>;
  relationshipsByColumnId: Map<string, readonly number[]>;
  tokenPostings: Map<string, Uint32Array>;
  filterBits: Record<RelationshipFilter, Uint32Array>;
}

export interface RelationshipFileLookup {
  fileForEntity: (entityId: string) => string | undefined;
}

function tokens(value: string): string[] {
  return [...new Set(value.toLocaleLowerCase("en").split(/[^a-z0-9_$]+/).filter(Boolean))];
}

function setBit(bits: Uint32Array, ordinal: number): void {
  bits[ordinal >>> 5] |= 1 << (ordinal & 31);
}

export function bitsetHas(bits: Uint32Array, ordinal: number): boolean {
  return Boolean(bits[ordinal >>> 5] & (1 << (ordinal & 31)));
}

export function buildRelationshipIndex(document: SchemaDocument, files?: RelationshipFileLookup): RelationshipIndex {
  const schema = schemaIndexFor(document);
  const words = Math.ceil(document.relationships.length / 32);
  const filterBits = {
    crossFile: new Uint32Array(words),
    invalid: new Uint32Array(words),
    oneToOne: new Uint32Array(words),
    manyToOne: new Uint32Array(words),
  };
  const incoming = new Map<string, number[]>();
  const outgoing = new Map<string, number[]>();
  const byColumn = new Map<string, number[]>();
  const postings = new Map<string, number[]>();
  const push = (map: Map<string, number[]>, key: string, value: number) => map.set(key, [...(map.get(key) ?? []), value]);
  const records = document.relationships.map((relationship, ordinal): RelationshipRecord => {
    const sourceTable = schema.tableById.get(relationship.sourceTableId);
    const targetTable = schema.tableById.get(relationship.targetTableId);
    const sourceColumn = schema.columnById.get(relationship.sourceColumnId);
    const targetColumn = schema.columnById.get(relationship.targetColumnId);
    const valid = Boolean(sourceTable && targetTable && sourceColumn && targetColumn && normalizeRelationshipType(sourceColumn.dataType) === normalizeRelationshipType(targetColumn.dataType));
    const sourceFile = files?.fileForEntity(relationship.sourceTableId);
    const targetFile = files?.fileForEntity(relationship.targetTableId);
    const cardinality = relationshipCardinality(document, relationship);
    const record: RelationshipRecord = {
      ordinal, id: relationship.id,
      sourceTableId: relationship.sourceTableId, sourceColumnId: relationship.sourceColumnId,
      targetTableId: relationship.targetTableId, targetColumnId: relationship.targetColumnId,
      sourceTable: sourceTable?.name ?? "Missing table", sourceColumn: sourceColumn?.name ?? "Missing field",
      targetTable: targetTable?.name ?? "Missing table", targetColumn: targetColumn?.name ?? "Missing field",
      sourceSchema: sourceTable?.schema ?? "", targetSchema: targetTable?.schema ?? "",
      sourceFile, targetFile, cardinality, valid,
      searchText: "",
    };
    record.searchText = [record.sourceSchema, record.sourceTable, record.sourceColumn, record.targetSchema, record.targetTable, record.targetColumn, sourceFile, targetFile, cardinality].filter(Boolean).join(" ").toLocaleLowerCase("en");
    push(outgoing, relationship.sourceTableId, ordinal);
    push(incoming, relationship.targetTableId, ordinal);
    push(byColumn, relationship.sourceColumnId, ordinal);
    push(byColumn, relationship.targetColumnId, ordinal);
    for (const token of tokens(record.searchText)) push(postings, token, ordinal);
    if (sourceFile && targetFile && sourceFile !== targetFile) setBit(filterBits.crossFile, ordinal);
    if (!valid) setBit(filterBits.invalid, ordinal);
    setBit(cardinality === "1:1" ? filterBits.oneToOne : filterBits.manyToOne, ordinal);
    return record;
  });
  return {
    records,
    relationshipById: new Map(records.map((record) => [record.id, record])),
    ordinalById: new Map(records.map((record) => [record.id, record.ordinal])),
    incomingByTableId: incoming,
    outgoingByTableId: outgoing,
    relationshipsByColumnId: byColumn,
    tokenPostings: new Map([...postings].map(([token, values]) => [token, Uint32Array.from(values)])),
    filterBits,
  };
}

export function searchRelationships(index: RelationshipIndex, query: string, filters: ReadonlySet<RelationshipFilter>): number[] {
  const normalized = query.trim().toLocaleLowerCase("en");
  const queryTokens = tokens(normalized);
  let candidates: number[];
  if (queryTokens.length === 0) candidates = index.records.map((record) => record.ordinal);
  else {
    const postingLists = queryTokens.map((token) => index.tokenPostings.get(token)).filter((value): value is Uint32Array => Boolean(value)).sort((a, b) => a.length - b.length);
    if (postingLists.length !== queryTokens.length) candidates = index.records.filter((record) => record.searchText.includes(normalized)).map((record) => record.ordinal);
    else {
      candidates = [...postingLists[0]];
      for (let listIndex = 1; listIndex < postingLists.length; listIndex += 1) {
        const right = postingLists[listIndex];
        const intersection: number[] = [];
        let leftIndex = 0;
        let rightIndex = 0;
        while (leftIndex < candidates.length && rightIndex < right.length) {
          if (candidates[leftIndex] === right[rightIndex]) { intersection.push(candidates[leftIndex]); leftIndex += 1; rightIndex += 1; }
          else if (candidates[leftIndex] < right[rightIndex]) leftIndex += 1;
          else rightIndex += 1;
        }
        candidates = intersection;
      }
    }
  }
  return candidates.filter((ordinal) => [...filters].every((filter) => bitsetHas(index.filterBits[filter], ordinal)));
}

export type RelationshipListRow = { kind: "group"; id: string; label: string; count: number } | { kind: "relationship"; id: string; ordinal: number };

export function relationshipRows(index: RelationshipIndex, ordinals: readonly number[], grouping: RelationshipGrouping, collapsed: ReadonlySet<string>): RelationshipListRow[] {
  if (grouping === "none") return ordinals.map((ordinal) => ({ kind: "relationship", id: index.records[ordinal].id, ordinal }));
  const groups = new Map<string, number[]>();
  for (const ordinal of ordinals) {
    const record = index.records[ordinal];
    const key = grouping === "source" ? record.sourceTable : grouping === "target" ? record.targetTable : record.sourceSchema || "Default schema";
    groups.set(key, [...(groups.get(key) ?? []), ordinal]);
  }
  const rows: RelationshipListRow[] = [];
  [...groups].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" })).forEach(([label, values]) => {
    const id = `${grouping}:${label}`;
    rows.push({ kind: "group", id, label, count: values.length });
    if (!collapsed.has(id)) values.forEach((ordinal) => rows.push({ kind: "relationship", id: index.records[ordinal].id, ordinal }));
  });
  return rows;
}

const cache = new WeakMap<SchemaDocument, RelationshipIndex>();
export function relationshipIndexFor(document: SchemaDocument): RelationshipIndex {
  const current = cache.get(document);
  if (current) return current;
  const built = buildRelationshipIndex(document);
  cache.set(document, built);
  return built;
}
