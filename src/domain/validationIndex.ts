import { schemaIndexFor } from "./schemaIndex";
import type { Diagnostic, SchemaDocument, Selection, SourceRange } from "./types";

export type ValidationTarget =
  | { kind: "selection"; selection: Exclude<Selection, null>; panel?: "tables" | "relationships" }
  | { kind: "types" }
  | null;

export interface ValidationIssueRecord {
  id: string;
  diagnostic: Diagnostic;
  title: string;
  target: ValidationTarget;
  targetName: string;
}

interface RangeEntry {
  start: number;
  end: number;
  target: Exclude<ValidationTarget, null>;
}

interface RangeIndex {
  entries: RangeEntry[];
  prefixMaxEnd: number[];
}

function buildRangeIndex(entries: RangeEntry[]): RangeIndex {
  entries.sort((left, right) => left.start - right.start || left.end - right.end);
  const prefixMaxEnd: number[] = [];
  entries.forEach((entry, index) => { prefixMaxEnd[index] = Math.max(entry.end, prefixMaxEnd[index - 1] ?? Number.NEGATIVE_INFINITY); });
  return { entries, prefixMaxEnd };
}

function findRange(index: RangeIndex, offset: number): ValidationTarget {
  let low = 0;
  let high = index.entries.length - 1;
  let candidate = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (index.entries[middle].start <= offset) { candidate = middle; low = middle + 1; }
    else high = middle - 1;
  }
  for (let cursor = candidate; cursor >= 0 && index.prefixMaxEnd[cursor] >= offset; cursor -= 1) {
    const entry = index.entries[cursor];
    if (offset <= entry.end) return entry.target;
  }
  return null;
}

function rangeEntry(range: SourceRange | undefined, target: Exclude<ValidationTarget, null>): RangeEntry[] {
  return range ? [{ start: range.start, end: range.end, target }] : [];
}

function validationTitle(message: string): string {
  const clean = message.replace(/^Editor:\s*/, "");
  if (/^Index\b/i.test(clean)) return "Index issue";
  if (/^Field\b/i.test(clean)) return "Field issue";
  if (/^Check\b/i.test(clean)) return "Check issue";
  if (/^Duplicate table\b|CREATE TABLE/i.test(clean)) return "Table issue";
  if (/Foreign key|reference/i.test(clean)) return "Reference issue";
  if (/Custom type|Enum\b|Domain\b|Composite\b/i.test(clean)) return "Type issue";
  return message.startsWith("Editor:") ? "Schema issue" : "Parser issue";
}

function targetName(document: SchemaDocument, target: ValidationTarget): string {
  if (!target) return "No linked table";
  if (target.kind === "types") return "Custom types";
  const schema = schemaIndexFor(document);
  const selection = target.selection;
  if (selection.kind === "relationship") {
    const relationship = schema.relationshipById.get(selection.relationshipId);
    const source = relationship && schema.tableById.get(relationship.sourceTableId);
    const destination = relationship && schema.tableById.get(relationship.targetTableId);
    return [source?.name, destination?.name].filter(Boolean).join(" -> ") || "Reference";
  }
  const table = schema.tableById.get(selection.tableId);
  if (!table) return "Table";
  if (selection.kind === "column") return `${table.name}.${schema.columnById.get(selection.columnId)?.name ?? "Field"}`;
  return table.name;
}

function buildValidationIssues(document: SchemaDocument): ValidationIssueRecord[] {
  const schema = schemaIndexFor(document);
  const relationshipRanges: RangeEntry[] = [];
  document.relationships.forEach((relationship) => {
    const target = { kind: "selection" as const, panel: "relationships" as const, selection: { kind: "relationship" as const, relationshipId: relationship.id } };
    relationshipRanges.push(...rangeEntry(relationship.sourceColumnReferenceRange, target), ...rangeEntry(relationship.targetTableReferenceRange, target), ...rangeEntry(relationship.targetColumnReferenceRange, target));
  });
  const columnRanges: RangeEntry[] = [];
  const tableRanges: RangeEntry[] = [];
  document.tables.forEach((table) => {
    const tableTarget = { kind: "selection" as const, panel: "tables" as const, selection: { kind: "table" as const, tableId: table.id } };
    tableRanges.push(...rangeEntry(table.statementRange, tableTarget));
    table.columns.forEach((column) => {
      const target = { kind: "selection" as const, panel: "tables" as const, selection: { kind: "column" as const, tableId: table.id, columnId: column.id } };
      columnRanges.push(...rangeEntry(column.nameRange, target), ...rangeEntry(column.typeRange, target), ...rangeEntry(column.notNullRange, target));
    });
  });
  const customTypeRanges = buildRangeIndex(document.customTypes.flatMap((type) => rangeEntry(type.statementRange, { kind: "types" })));
  const rangeIndexes = [buildRangeIndex(relationshipRanges), buildRangeIndex(columnRanges), buildRangeIndex(tableRanges), customTypeRanges];

  const targetFor = (diagnostic: Diagnostic): ValidationTarget => {
    if (diagnostic.offset !== undefined) {
      for (const index of rangeIndexes) {
        const target = findRange(index, diagnostic.offset);
        if (target) return target;
      }
    }
    const field = diagnostic.message.match(/^Editor: Field\s+([^.]+)\.([^\s]+)\s+/);
    if (field) {
      const table = schema.tableByName.get(field[1].toLowerCase());
      const column = table && schema.columnsByNameByTableId.get(table.id)?.get(field[2].toLowerCase());
      if (table && column) return { kind: "selection", panel: "tables", selection: { kind: "column", tableId: table.id, columnId: column.id } };
    }
    const tableMatch = diagnostic.message.match(/\bon\s+([A-Za-z_][\w$]*)\b/) ?? diagnostic.message.match(/Duplicate table declaration:\s+(.+)$/);
    if (tableMatch) {
      const name = tableMatch[1].replace(/^["']|["']$/g, "").toLowerCase();
      const table = schema.tableByQualifiedName.get(name) ?? schema.tableByName.get(name);
      if (table) return { kind: "selection", panel: "tables", selection: { kind: "table", tableId: table.id } };
    }
    return /custom type|enum|domain|composite/i.test(diagnostic.message) ? { kind: "types" } : null;
  };

  return document.diagnostics.map((diagnostic, index) => {
    const target = targetFor(diagnostic);
    return { id: `${diagnostic.level}:${diagnostic.message}:${index}`, diagnostic, title: validationTitle(diagnostic.message), target, targetName: targetName(document, target) };
  });
}

const cache = new WeakMap<SchemaDocument, ValidationIssueRecord[]>();

export function validationIssuesFor(document: SchemaDocument): ValidationIssueRecord[] {
  const cached = cache.get(document);
  if (cached) return cached;
  const issues = buildValidationIssues(document);
  cache.set(document, issues);
  return issues;
}
