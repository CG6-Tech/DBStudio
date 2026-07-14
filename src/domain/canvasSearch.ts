import type { SchemaDocument, Selection } from "./types";

export interface CanvasSearchResult {
  key: string;
  tableName: string;
  columnName?: string;
  selection: NonNullable<Selection>;
  score: number;
}

function rank(value: string, query: string, base: number): number | null {
  if (value === query) return base;
  if (value.startsWith(query)) return base + 10;
  if (value.includes(query)) return base + 20;
  return null;
}

export function searchCanvas(document: SchemaDocument, rawQuery: string, limit = 12): CanvasSearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];
  const results: CanvasSearchResult[] = [];
  document.tables.forEach((table) => {
    const tableScore = rank(table.name.toLowerCase(), query, 0);
    if (tableScore !== null) results.push({ key: table.id, tableName: table.name, selection: { kind: "table", tableId: table.id }, score: tableScore });
    table.columns.forEach((column) => {
      const columnScore = rank(column.name.toLowerCase(), query, 2);
      if (columnScore !== null) results.push({ key: column.id, tableName: table.name, columnName: column.name, selection: { kind: "column", tableId: table.id, columnId: column.id }, score: columnScore });
    });
  });
  return results.sort((left, right) => left.score - right.score || left.tableName.localeCompare(right.tableName) || (left.columnName ?? "").localeCompare(right.columnName ?? "")).slice(0, limit);
}
