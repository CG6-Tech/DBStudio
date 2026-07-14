import { describe, expect, it } from "vitest";
import { parseSchema } from "../domain/parser";
import { clusteredGridLayout, compactClusterLayout, packClusters } from "./clusterPacking";

describe("cluster packing", () => {
  it("packs multiple clusters across balanced rows without overlap", () => {
    const document = parseSchema(Array.from({ length: 60 }, (_, index) => `CREATE TABLE t${index} (id INT);`).join("\n"));
    const result = clusteredGridLayout(document);
    const uniqueRows = new Set(result.nodes.map((node) => node.y));
    expect(result.nodes).toHaveLength(60);
    expect(uniqueRows.size).toBeGreaterThan(3);
  });

  it("produces non-overlapping cluster rectangles", () => {
    const document = parseSchema("CREATE TABLE a (id INT); CREATE TABLE b (id INT);");
    const layouts = Array.from({ length: 6 }, (_, index) => compactClusterLayout(document, { id: `c${index}`, kind: "community", tableIds: document.tables.map((table) => table.id) }));
    const packed = packClusters(layouts);
    packed.forEach((left, index) => packed.slice(index + 1).forEach((right) => {
      const overlap = left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
      expect(overlap).toBe(false);
    }));
  });

  it("preserves saved table positions instead of clustering again", () => {
    const document = parseSchema("CREATE TABLE a (id INT); CREATE TABLE b (id INT);");
    document.hasSavedLayout = true;
    document.tables[0].position = { x: 900, y: 400 };
    document.tables[1].position = { x: 120, y: 80 };
    expect(clusteredGridLayout(document).nodes.map(({ x, y }) => ({ x, y }))).toEqual([{ x: 900, y: 400 }, { x: 120, y: 80 }]);
  });
});
