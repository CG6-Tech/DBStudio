import { describe, expect, it } from "vitest";
import { parseSchema } from "../domain/parser";
import { enrichExampleDocument } from "../platform/exampleDocument";
import { EXAMPLE_SQL } from "../platform/desktop";
import { tableHeight, tableWidth } from "../domain/tableGeometry";
import { applyAutoLayout } from "./applyAutoLayout";

describe("applyAutoLayout", () => {
  it("moves tables and re-wraps areas around their arranged content", () => {
    const document = enrichExampleDocument(parseSchema(EXAMPLE_SQL, "postgresql"));
    const orderArea = document.areas.find((area) => area.name === "Order flow")!;
    const customerArea = document.areas.find((area) => area.name === "Customer context")!;
    const customerNote = document.notes.find((note) => note.id === customerArea.noteIds?.[0])!;
    const nodes = document.tables.map((table, index) => ({
      id: table.id,
      x: 1200 + index * 320,
      y: 240 + (index % 2) * 260,
      width: tableWidth(table),
      height: tableHeight(table),
    }));

    const next = applyAutoLayout(document, { kind: "manual", nodes, edges: [] });
    const movedOrderArea = next.areas.find((area) => area.id === orderArea.id)!;
    const movedCustomerNote = next.notes.find((note) => note.id === customerNote.id)!;

    expect(next.hasSavedLayout).toBe(true);
    expect(next.tables[0].position).toEqual({ x: 1200, y: 240 });
    expect(movedOrderArea.x).toBeLessThan(Math.min(...orderArea.tableIds.map((id) => next.tables.find((table) => table.id === id)!.position.x)));
    expect(movedOrderArea.width).toBeGreaterThan(orderArea.width);
    expect(movedCustomerNote.x).not.toBe(customerNote.x);
    expect(movedCustomerNote.y).not.toBe(customerNote.y);
  });
});
