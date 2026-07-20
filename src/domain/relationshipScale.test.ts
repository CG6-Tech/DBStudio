import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { buildRelationshipIndex, relationshipRows, searchRelationships } from "./relationshipIndex";

describe("10,000 relationship scale", () => {
  it("builds indexed search and bounded virtual projections", () => {
    const document = parseSchema(Array.from({ length: 100 }, (_, index) => `CREATE TABLE table_${index}(id INT PRIMARY KEY, parent_id INT);`).join("\n"));
    document.relationships = Array.from({ length: 10_000 }, (_, index) => {
      const source = document.tables[index % document.tables.length];
      const target = document.tables[(index + 1) % document.tables.length];
      return { id: `scale-${index}`, sourceTableId: source.id, sourceColumnId: source.columns[1].id, targetTableId: target.id, targetColumnId: target.columns[0].id, targetTableReferenceRange: source.statementRange, targetColumnReferenceRange: source.statementRange };
    });
    const index = buildRelationshipIndex(document);
    const matches = searchRelationships(index, "table_42", new Set(["manyToOne"]));
    expect(index.records).toHaveLength(10_000);
    expect(matches.length).toBeGreaterThan(0);
    expect(relationshipRows(index, matches, "source", new Set()).length).toBeGreaterThan(matches.length);
  });
});
