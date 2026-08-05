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

  it("places a new table beside the table it references", () => {
    const document = parseSchema("CREATE TABLE users (id INT PRIMARY KEY); CREATE TABLE unrelated (id INT PRIMARY KEY);");
    const layout = clusteredGridLayout(document);
    const users = layout.nodes[0];
    const withOrders = parseSchema([
      "CREATE TABLE users (id INT PRIMARY KEY);",
      "CREATE TABLE unrelated (id INT PRIMARY KEY);",
      "CREATE TABLE orders (id INT PRIMARY KEY, user_id INT REFERENCES users(id));",
    ].join("\n"));
    // Reuse the laid-out ids so the first two tables count as retained.
    const aligned = {
      ...withOrders,
      tables: withOrders.tables.map((table, index) => (index < 2 ? { ...table, id: document.tables[index].id } : table)),
      relationships: withOrders.relationships.map((relationship) => ({ ...relationship, targetTableId: document.tables[0].id })),
    };

    const next = reconcileLayout(aligned, layout);
    const orders = next.nodes[2];
    expect(orders.x).toBeGreaterThan(users.x);
    expect(Math.abs((orders.y + orders.height / 2) - (users.y + users.height / 2))).toBeLessThan(users.height);
  });

  it("does not drop a new table on top of an existing one", () => {
    const document = parseSchema("CREATE TABLE users (id INT PRIMARY KEY);");
    const layout = clusteredGridLayout(document);
    const withMany = parseSchema([
      "CREATE TABLE users (id INT PRIMARY KEY);",
      "CREATE TABLE a (id INT PRIMARY KEY, user_id INT REFERENCES users(id));",
      "CREATE TABLE b (id INT PRIMARY KEY, user_id INT REFERENCES users(id));",
      "CREATE TABLE c (id INT PRIMARY KEY, user_id INT REFERENCES users(id));",
    ].join("\n"));
    const aligned = {
      ...withMany,
      tables: withMany.tables.map((table, index) => (index === 0 ? { ...table, id: document.tables[0].id } : table)),
      relationships: withMany.relationships.map((relationship) => ({ ...relationship, targetTableId: document.tables[0].id })),
    };

    const nodes = reconcileLayout(aligned, layout).nodes;
    nodes.forEach((left, index) => nodes.slice(index + 1).forEach((right) => {
      const overlap = left.x < right.x + right.width && right.x < left.x + left.width && left.y < right.y + right.height && right.y < left.y + left.height;
      expect(overlap).toBe(false);
    }));
  });
});
