import { describe, expect, it } from "vitest";
import { buildCanvasIndexes, createCanvasSnapshot, diffCanvasSnapshots } from "./canvasSnapshot";
import { parseSchema } from "./parser";

describe("canvas snapshots", () => {
  it("indexes tables, columns, and relationship adjacency once", () => {
    const document = parseSchema("CREATE TABLE a (id int PRIMARY KEY); CREATE TABLE b (a_id int REFERENCES a(id));", "postgresql");
    const indexes = buildCanvasIndexes(document);
    expect(indexes.tableById.size).toBe(2);
    expect(indexes.columnById.size).toBe(2);
    expect(indexes.relationshipsByTable.get(document.tables[0].id)).toHaveLength(1);
  });

  it("keeps a localized change proportional at 3,000 tables", () => {
    const base = parseSchema("CREATE TABLE seed (id int);", "postgresql");
    const tables = Array.from({ length: 3000 }, (_, index) => ({ ...base.tables[0], id: `table-${index}`, name: `table_${index}`, position: { x: index * 10, y: 0 }, columns: base.tables[0].columns.map((column) => ({ ...column, id: `column-${index}`, tableId: `table-${index}` })) }));
    const document = { ...base, tables };
    const changed = { ...document, tables: tables.map((table, index) => index === 1499 ? { ...table, position: { x: table.position.x + 28, y: 28 } } : table) };
    const diff = diffCanvasSnapshots(createCanvasSnapshot(document), createCanvasSnapshot(changed));
    expect([...diff.geometryChanged]).toEqual(["table-1499"]);
    expect(diff.contentChanged.size + diff.styleChanged.size + diff.addedTables.size + diff.removedTables.size).toBe(0);
  });
});
