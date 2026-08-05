import { describe, expect, it } from "vitest";
import { parseSchema } from "../domain/parser";
import { EXAMPLE_SQL } from "./desktop";
import { enrichExampleDocument } from "./exampleDocument";

describe("example document enrichment", () => {
  it("adds a useful starter canvas with areas and notes", () => {
    const document = enrichExampleDocument(parseSchema(EXAMPLE_SQL, "postgresql"));

    expect(document.hasSavedLayout).toBe(true);
    expect(document.tables.map((table) => table.name)).toEqual([
      "users",
      "addresses",
      "products",
      "orders",
      "order_items",
      "payments",
      "shipments",
    ]);
    expect(document.relationships).toHaveLength(7);
    expect(document.areas.map((area) => area.name)).toEqual(["Customer context", "Order flow", "Catalog"]);
    expect(document.notes).toHaveLength(3);
    expect(document.triggers.map((trigger) => trigger.name)).toEqual(["payments_sync_order", "order_items_refresh_order", "shipments_mark_order"]);
    expect(document.routines.map((routine) => routine.name)).toEqual(["recalculate_order_total", "sync_order_payment_status", "refresh_order_from_item", "mark_order_shipped"]);
    expect(document.logicEdges.length).toBeGreaterThanOrEqual(12);
    expect(document.logicLayout?.nodes).toHaveLength(12);
    expect(document.tables.find((table) => table.name === "users")?.comment).toMatch(/Customer account root/);
    expect(document.areas.find((area) => area.name === "Order flow")?.tableIds).toHaveLength(4);
  });
});
