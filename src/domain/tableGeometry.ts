import type { Table, TableWidthScale } from "./types";

export const BASE_TABLE_WIDTH = 260;
export const TABLE_HEADER_HEIGHT = 58;
export const TABLE_FIELD_HEIGHT = 34;
export const TABLE_WIDTH_SCALES: readonly TableWidthScale[] = [1, 1.5, 2];

export function normalizeTableWidthScale(value: unknown): TableWidthScale {
  return value === 1.5 || value === 2 ? value : 1;
}

export function nextTableWidthScale(value: unknown): TableWidthScale {
  const current = normalizeTableWidthScale(value);
  return TABLE_WIDTH_SCALES[(TABLE_WIDTH_SCALES.indexOf(current) + 1) % TABLE_WIDTH_SCALES.length];
}

export function tableWidth(table: Pick<Table, "widthScale">): number {
  return BASE_TABLE_WIDTH * normalizeTableWidthScale(table.widthScale);
}

export function tableHeight(table: Pick<Table, "columns">): number {
  return TABLE_HEADER_HEIGHT + table.columns.length * TABLE_FIELD_HEIGHT;
}
