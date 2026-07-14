import { describe, expect, it } from "vitest";
import { clusterTables } from "./clustering";
import { parseSchema } from "./parser";

function chainSql(count: number): string {
  return Array.from({ length: count }, (_, index) => `CREATE TABLE t${index} (id INT PRIMARY KEY${index ? `, parent_id INT REFERENCES t${index - 1}(id)` : ""});`).join("\n");
}

describe("clusterTables", () => {
  it("keeps Area membership authoritative", () => {
    const document = parseSchema(chainSql(4));
    document.areas = [{ id: "core", name: "Core", color: "#fff", x: 0, y: 0, width: 500, height: 500, tableIds: [document.tables[1].id, document.tables[2].id], locked: false, collapsed: false, moveContents: true }];
    const clusters = clusterTables(document);
    expect(clusters[0]).toMatchObject({ kind: "area", areaId: "core", tableIds: [document.tables[1].id, document.tables[2].id] });
    expect(clusters.slice(1).flatMap((cluster) => cluster.tableIds)).not.toContain(document.tables[1].id);
  });

  it("splits a large connected graph into stable 8-20 table communities", () => {
    const document = parseSchema(chainSql(47));
    const first = clusterTables(document).filter((cluster) => cluster.kind === "community");
    const reordered = clusterTables({ ...document, tables: [...document.tables].reverse(), relationships: [...document.relationships].reverse() }).filter((cluster) => cluster.kind === "community");
    expect(first.map((cluster) => cluster.tableIds.length)).toEqual([16, 16, 15]);
    expect(reordered).toEqual(first);
    expect(new Set(first.flatMap((cluster) => cluster.tableIds)).size).toBe(47);
  });

  it("packs unrelated tables into bounded fallback groups", () => {
    const document = parseSchema(Array.from({ length: 45 }, (_, index) => `CREATE TABLE i${index} (id INT);`).join("\n"));
    expect(clusterTables(document).map((cluster) => cluster.tableIds.length)).toEqual([15, 15, 15]);
  });

  it("handles the target large sparse schema without losing or duplicating tables", () => {
    const tableCount = 3_000;
    const relationshipCount = 1_500;
    const document = parseSchema(Array.from({ length: tableCount }, (_, index) => `CREATE TABLE large_${index} (id INT PRIMARY KEY);`).join("\n"));
    document.relationships = Array.from({ length: relationshipCount }, (_, index) => ({
      id: `large-relationship-${index}`,
      sourceTableId: document.tables[index].id,
      sourceColumnId: document.tables[index].columns[0].id,
      targetTableId: document.tables[index + 1].id,
      targetColumnId: document.tables[index + 1].columns[0].id,
      targetTableReferenceRange: { start: 0, end: 0 },
      targetColumnReferenceRange: { start: 0, end: 0 },
    }));

    const clusters = clusterTables(document);
    const members = clusters.flatMap((cluster) => cluster.tableIds);
    expect(members).toHaveLength(tableCount);
    expect(new Set(members).size).toBe(tableCount);
    expect(clusters.every((cluster) => cluster.tableIds.length <= 20)).toBe(true);
  });
});
