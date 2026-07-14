import { describe, expect, it } from "vitest";
import { parseSchema } from "../domain/parser";
import { addTable, updateTable } from "../domain/schemaActions";
import { clusteredGridLayout } from "./clusterPacking";
import { reconcileLayout } from "./reconcileLayout";

describe("reconcileLayout", () => {
  it("preserves layout identity for a position-only table commit", () => {
    const document = parseSchema("CREATE TABLE a (id INT); CREATE TABLE b (id INT);");
    const layout = { ...clusteredGridLayout(document), generation: 4 };
    const moved = updateTable(document, document.tables[0].id, { position: { x: 400, y: 300 } });
    expect(reconcileLayout(moved, layout)).toBe(layout);
  });

  it("adds a node without moving retained nodes or changing generation", () => {
    const document = parseSchema("CREATE TABLE a (id INT); CREATE TABLE b (id INT);");
    const layout = { ...clusteredGridLayout(document), generation: 7 };
    const next = reconcileLayout(addTable(document), layout);
    expect(next).not.toBe(layout);
    expect(next.generation).toBe(7);
    expect(next.nodes.slice(0, 2)).toEqual(layout.nodes);
    expect(next.nodes).toHaveLength(3);
  });
});
