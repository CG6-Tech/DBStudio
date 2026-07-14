import type { Table } from "./types";

export interface VirtualTableMetrics {
  count: number;
  rowHeight: number;
  expandedIndex: number;
  expandedExtraHeight: number;
}

export interface VirtualTableRange {
  start: number;
  end: number;
  top: number;
  totalHeight: number;
}

export interface TableSearchRecord {
  id: string;
  tableName: string;
  columnNames: string;
}

function validMetrics(metrics: VirtualTableMetrics): VirtualTableMetrics {
  return {
    count: Math.max(0, Math.floor(metrics.count)),
    rowHeight: Number.isFinite(metrics.rowHeight) && metrics.rowHeight > 0 ? metrics.rowHeight : 48,
    expandedIndex: metrics.expandedIndex >= 0 && metrics.expandedIndex < metrics.count ? Math.floor(metrics.expandedIndex) : -1,
    expandedExtraHeight: Number.isFinite(metrics.expandedExtraHeight) ? Math.max(0, metrics.expandedExtraHeight) : 0,
  };
}

export function virtualTableTotalHeight(input: VirtualTableMetrics): number {
  const metrics = validMetrics(input);
  return metrics.count * metrics.rowHeight + (metrics.expandedIndex >= 0 ? metrics.expandedExtraHeight : 0);
}

export function virtualTableOffset(index: number, input: VirtualTableMetrics): number {
  const metrics = validMetrics(input);
  const safeIndex = Math.max(0, Math.min(metrics.count, Math.floor(index)));
  return safeIndex * metrics.rowHeight + (metrics.expandedIndex >= 0 && safeIndex > metrics.expandedIndex ? metrics.expandedExtraHeight : 0);
}

export function locateVirtualTable(offset: number, input: VirtualTableMetrics): { index: number; probes: number } {
  const metrics = validMetrics(input);
  if (metrics.count === 0) return { index: 0, probes: 0 };
  const target = Math.max(0, Math.min(virtualTableTotalHeight(metrics) - 1, Number.isFinite(offset) ? offset : 0));
  let low = 0;
  let high = metrics.count - 1;
  let probes = 0;
  while (low <= high) {
    probes += 1;
    const middle = Math.floor((low + high) / 2);
    const start = virtualTableOffset(middle, metrics);
    const height = metrics.rowHeight + (middle === metrics.expandedIndex ? metrics.expandedExtraHeight : 0);
    if (target < start) high = middle - 1;
    else if (target >= start + height) low = middle + 1;
    else return { index: middle, probes };
  }
  return { index: Math.max(0, Math.min(metrics.count - 1, low)), probes };
}

export function calculateVirtualTableRange(input: VirtualTableMetrics, scrollTop: number, viewportHeight: number, overscan = 240): VirtualTableRange {
  const metrics = validMetrics(input);
  const totalHeight = virtualTableTotalHeight(metrics);
  if (metrics.count === 0) return { start: 0, end: 0, top: 0, totalHeight: 0 };
  const safeViewport = Number.isFinite(viewportHeight) ? Math.max(1, viewportHeight) : 1;
  const safeScroll = Math.max(0, Math.min(Math.max(0, totalHeight - safeViewport), Number.isFinite(scrollTop) ? scrollTop : 0));
  const buffer = Number.isFinite(overscan) ? Math.max(0, overscan) : 0;
  const start = locateVirtualTable(Math.max(0, safeScroll - buffer), metrics).index;
  const end = Math.min(metrics.count, locateVirtualTable(Math.min(totalHeight - 1, safeScroll + safeViewport + buffer), metrics).index + 1);
  return { start, end, top: virtualTableOffset(start, metrics), totalHeight };
}

export function scrollOffsetToReveal(index: number, input: VirtualTableMetrics, scrollTop: number, viewportHeight: number): number {
  const metrics = validMetrics(input);
  if (metrics.count === 0) return 0;
  const safeIndex = Math.max(0, Math.min(metrics.count - 1, Math.floor(index)));
  const start = virtualTableOffset(safeIndex, metrics);
  const height = metrics.rowHeight + (safeIndex === metrics.expandedIndex ? metrics.expandedExtraHeight : 0);
  const end = start + height;
  const viewport = Math.max(1, viewportHeight);
  if (start < scrollTop) return start;
  if (end > scrollTop + viewport) return Math.max(0, end - viewport);
  return scrollTop;
}

export function navigateVirtualTable(index: number, count: number, key: "ArrowUp" | "ArrowDown" | "Home" | "End"): number {
  if (count <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowUp") return Math.max(0, index <= 0 ? 0 : index - 1);
  return Math.min(count - 1, index < 0 ? 0 : index + 1);
}

export function buildTableSearchRecords(tables: Table[]): TableSearchRecord[] {
  return tables.map((table) => ({ id: table.id, tableName: table.name.toLocaleLowerCase(), columnNames: table.columns.map((column) => column.name.toLocaleLowerCase()).join("\u0000") }));
}

export function filterTableSearchRecords(records: TableSearchRecord[], query: string): { ids: string[]; fieldMatchIds: Set<string> } {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return { ids: records.map((record) => record.id), fieldMatchIds: new Set() };
  const ids: string[] = [];
  const fieldMatchIds = new Set<string>();
  records.forEach((record) => {
    const tableMatch = record.tableName.includes(normalized);
    const fieldMatch = record.columnNames.includes(normalized);
    if (!tableMatch && !fieldMatch) return;
    ids.push(record.id);
    if (!tableMatch && fieldMatch) fieldMatchIds.add(record.id);
  });
  return { ids, fieldMatchIds };
}
