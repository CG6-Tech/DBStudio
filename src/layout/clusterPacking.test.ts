import { describe, expect, it } from "vitest";
import { clusterTables } from "../domain/clustering";
import { parseSchema } from "../domain/parser";
import { EXAMPLE_SQL } from "../platform/desktop";
import { enrichExampleDocument } from "../platform/exampleDocument";
import { applyAutoLayout } from "./applyAutoLayout";
import { clusteredGridLayout, compactClusterLayout, packClusters } from "./clusterPacking";

function rectanglesOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

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

  it("reserves area footprints so visible areas do not overlap after auto layout", () => {
    const document = enrichExampleDocument(parseSchema(EXAMPLE_SQL, "postgresql"));
    const packed = packClusters(clusterTables(document).map((cluster) => compactClusterLayout(document, cluster)));
    const layout = {
      nodes: packed.flatMap((cluster) => cluster.nodes.map((node) => ({ ...node, x: node.x + cluster.x, y: node.y + cluster.y }))),
      edges: [],
    };
    const arranged = applyAutoLayout(document, layout);

    arranged.areas.forEach((left, index) => arranged.areas.slice(index + 1).forEach((right) => {
      expect(rectanglesOverlap(left, right)).toBe(false);
    }));
  });

  it("fills a shelf instead of giving every equal-width cluster its own row", () => {
    const document = parseSchema("CREATE TABLE a (id INT);");
    const layouts = Array.from({ length: 4 }, (_, index) => ({
      cluster: { id: `c${index}`, kind: "community" as const, tableIds: [] },
      nodes: [],
      width: 1280,
      height: 1750,
    }));
    const packed = packClusters(layouts);
    const rows = new Set(packed.map((item) => item.y));
    expect(rows.size).toBeLessThan(layouts.length);
    // The old shelf broke on every cluster, so no two ever shared a row.
    expect(Math.max(...[...rows].map((row) => packed.filter((item) => item.y === row).length))).toBeGreaterThan(1);
    expect(document.tables).toHaveLength(1);
  });

  it("packs toward the requested aspect ratio", () => {
    const layouts = Array.from({ length: 9 }, (_, index) => ({
      cluster: { id: `c${index}`, kind: "community" as const, tableIds: [] },
      nodes: [],
      width: 900,
      height: 900,
    }));
    const packed = packClusters(layouts, 1.6);
    const width = Math.max(...packed.map((item) => item.x + item.width));
    const height = Math.max(...packed.map((item) => item.y + item.height));
    expect(width / height).toBeGreaterThan(1);
    expect(width / height).toBeLessThan(2.4);
  });

  it("reverses alternate rows so the wrap stays local", () => {
    const layouts = Array.from({ length: 8 }, (_, index) => ({
      cluster: { id: `c${index}`, kind: "community" as const, tableIds: [] },
      nodes: [],
      width: 1000,
      height: 1000,
    }));
    const packed = packClusters(layouts);
    const rows = [...new Set(packed.map((item) => item.y))].sort((left, right) => left - right);
    expect(rows.length).toBeGreaterThan(1);
    rows.forEach((row, index) => {
      // Row order alternates, so the cluster ending one row sits above the one
      // starting the next rather than a full canvas width away.
      const xs = packed.filter((item) => item.y === row).map((item) => item.x);
      const ascending = xs.every((value, position) => position === 0 || value > xs[position - 1]);
      const descending = xs.every((value, position) => position === 0 || value < xs[position - 1]);
      expect(index % 2 === 0 ? ascending : descending).toBe(true);
    });
  });

  it("places linked clusters next to each other", () => {
    const document = parseSchema([
      "CREATE TABLE lonely (id INT PRIMARY KEY);",
      "CREATE TABLE left_a (id INT PRIMARY KEY);",
      "CREATE TABLE right_a (id INT PRIMARY KEY, left_id INT REFERENCES left_a(id));",
    ].join("\n"));
    const [lonely, leftA, rightA] = document.tables;
    const layout = (id: string, tableIds: string[]) => ({
      cluster: { id, kind: "community" as const, tableIds },
      nodes: [],
      width: 800,
      height: 800,
    });
    // Emitted with the unrelated cluster between the two linked ones.
    const packed = packClusters([layout("left", [leftA.id]), layout("lonely", [lonely.id]), layout("right", [rightA.id])], 1.6, document);
    const positionOf = (id: string) => packed.findIndex((item) => item.cluster.id === id);
    expect(Math.abs(positionOf("left") - positionOf("right"))).toBe(1);
  });

  it("preserves saved table positions instead of clustering again", () => {
    const document = parseSchema("CREATE TABLE a (id INT); CREATE TABLE b (id INT);");
    document.hasSavedLayout = true;
    document.tables[0].position = { x: 900, y: 400 };
    document.tables[1].position = { x: 120, y: 80 };
    expect(clusteredGridLayout(document).nodes.map(({ x, y }) => ({ x, y }))).toEqual([{ x: 900, y: 400 }, { x: 120, y: 80 }]);
  });
});
