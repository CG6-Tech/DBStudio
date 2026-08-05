import { describe, expect, it } from "vitest";
import { clusterTables, communitySizeRange } from "./clustering";
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
    expect(first.map((cluster) => cluster.tableIds.length)).toEqual([10, 20, 17]);
    expect(first.every((cluster) => cluster.tableIds.length >= communitySizeRange.min && cluster.tableIds.length <= communitySizeRange.max)).toBe(true);
    expect(reordered).toEqual(first);
    expect(new Set(first.flatMap((cluster) => cluster.tableIds)).size).toBe(47);
  });

  it("keeps a component that already fits one cluster intact", () => {
    const document = parseSchema(chainSql(communitySizeRange.max));
    expect(clusterTables(document).map((cluster) => cluster.tableIds.length)).toEqual([communitySizeRange.max]);
  });

  it("cuts a two-hub schema at the bridge instead of at a table count", () => {
    // Two dense hubs joined by a single foreign key: the split must fall on that
    // one link, not wherever a size cap happens to land.
    const table = (name: string, references: string[]) =>
      `CREATE TABLE ${name} (id INT PRIMARY KEY${references.map((target, index) => `, ref_${index} INT REFERENCES ${target}(id)`).join("")});`;
    const statements = ["CREATE TABLE hub_a (id INT PRIMARY KEY);", "CREATE TABLE hub_b (id INT PRIMARY KEY);"];
    for (let index = 0; index < 11; index += 1) statements.push(table(`a_${index}`, ["hub_a"]));
    for (let index = 0; index < 11; index += 1) statements.push(table(`b_${index}`, ["hub_b"]));
    statements.push(table("bridge", ["hub_a", "hub_b"]));

    const document = parseSchema(statements.join("\n"));
    const clusters = clusterTables(document);
    const clusterOf = new Map(clusters.flatMap((cluster) => cluster.tableIds.map((id) => [id, cluster.id] as const)));
    const cut = document.relationships.filter((relationship) => clusterOf.get(relationship.sourceTableId) !== clusterOf.get(relationship.targetTableId));

    expect(clusters).toHaveLength(2);
    expect(cut).toHaveLength(1);
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
