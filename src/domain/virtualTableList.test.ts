import { describe, expect, it } from "vitest";
import {
  buildTableSearchRecords, calculateVirtualTableRange, filterTableSearchRecords, locateVirtualTable,
  navigateVirtualTable, scrollOffsetToReveal, virtualTableOffset, virtualTableTotalHeight,
} from "./virtualTableList";
import type { Table } from "./types";

const metrics = { count: 3_000, rowHeight: 46, expandedIndex: 1_500, expandedExtraHeight: 420 };

describe("virtual table list", () => {
  it("keeps visible work bounded for 3,000 tables", () => {
    const range = calculateVirtualTableRange(metrics, 60_000, 720, 184);
    expect(range.end - range.start).toBeLessThan(30);
    expect(range.totalHeight).toBe(138_420);
  });

  it("accounts for the expanded row in offsets", () => {
    expect(virtualTableOffset(1_500, metrics)).toBe(69_000);
    expect(virtualTableOffset(1_501, metrics)).toBe(69_466);
    expect(virtualTableTotalHeight(metrics)).toBe(138_420);
  });

  it("finds distant rows logarithmically", () => {
    const located = locateVirtualTable(120_000, metrics);
    expect(located.index).toBeGreaterThan(2_500);
    expect(located.probes).toBeLessThanOrEqual(12);
  });

  it("clamps ranges and reveal offsets", () => {
    expect(calculateVirtualTableRange(metrics, -500, 500).start).toBe(0);
    expect(calculateVirtualTableRange(metrics, 999_999, 500).end).toBe(3_000);
    expect(scrollOffsetToReveal(2_900, metrics, 0, 600)).toBeGreaterThan(100_000);
  });

  it("navigates within list boundaries", () => {
    expect(navigateVirtualTable(0, 4, "ArrowUp")).toBe(0);
    expect(navigateVirtualTable(3, 4, "ArrowDown")).toBe(3);
    expect(navigateVirtualTable(2, 4, "Home")).toBe(0);
    expect(navigateVirtualTable(1, 4, "End")).toBe(3);
  });

  it("searches table and field names separately", () => {
    const tables = [
      { id: "orders", name: "Orders", columns: [{ id: "customer", name: "customer_id" }] },
      { id: "customers", name: "Customers", columns: [{ id: "email", name: "email" }] },
    ] as Table[];
    const records = buildTableSearchRecords(tables);
    expect(filterTableSearchRecords(records, "orders").ids).toEqual(["orders"]);
    const fieldResult = filterTableSearchRecords(records, "email");
    expect(fieldResult.ids).toEqual(["customers"]);
    expect(fieldResult.fieldMatchIds.has("customers")).toBe(true);
  });
});
