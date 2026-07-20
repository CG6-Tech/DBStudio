import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { buildRelationshipIndex, relationshipRows, searchRelationships } from "./relationshipIndex";

describe("relationship index", () => {
  const document = parseSchema(`CREATE TABLE users(id INT PRIMARY KEY); CREATE TABLE orders(id INT PRIMARY KEY, user_id INT REFERENCES users(id)); CREATE TABLE notes(id INT UNIQUE, user_id INT UNIQUE REFERENCES users(id));`);

  it("indexes direction, cardinality, tokens, and bitset filters", () => {
    const index = buildRelationshipIndex(document);
    expect(index.outgoingByTableId.get(document.tables[1].id)).toEqual([0]);
    expect(searchRelationships(index, "orders user_id", new Set())).toEqual([0]);
    expect(searchRelationships(index, "", new Set(["oneToOne"]))).toEqual([1]);
    expect(searchRelationships(index, "", new Set(["manyToOne"]))).toEqual([0]);
  });

  it("builds stable grouped virtual rows", () => {
    const index = buildRelationshipIndex(document);
    const rows = relationshipRows(index, [0, 1], "target", new Set());
    expect(rows[0]).toMatchObject({ kind: "group", label: "users", count: 2 });
    expect(rows).toHaveLength(3);
  });
});
