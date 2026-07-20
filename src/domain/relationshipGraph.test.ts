import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { buildRelationshipGraph, shortestTablePath, stronglyConnectedTableGroups, traverseTables } from "./relationshipGraph";

describe("relationship graph", () => {
  it("finds cycles, paths, and directional impact", () => {
    const document = parseSchema(`CREATE TABLE a(id INT PRIMARY KEY, c_id INT); CREATE TABLE b(id INT PRIMARY KEY, a_id INT REFERENCES a(id)); CREATE TABLE c(id INT PRIMARY KEY, b_id INT REFERENCES b(id), a_id INT REFERENCES a(id));`);
    const [a, b, c] = document.tables;
    document.relationships.push({ id: "cycle", sourceTableId: a.id, sourceColumnId: a.columns[1].id, targetTableId: c.id, targetColumnId: c.columns[0].id, targetTableReferenceRange: a.statementRange, targetColumnReferenceRange: a.statementRange });
    const graph = buildRelationshipGraph(document);
    expect(new Set(stronglyConnectedTableGroups(graph)[0])).toEqual(new Set([a.id, b.id, c.id]));
    expect(shortestTablePath(graph, b.id, c.id)).toEqual([b.id, c.id]);
    expect(traverseTables(graph, c.id, "out", 1)).toEqual(expect.arrayContaining([a.id, b.id]));
  });
});
