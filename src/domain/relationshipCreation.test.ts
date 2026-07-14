import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { addRelationship } from "./schemaActions";
import { canCreateRelationship, normalizeRelationshipType, relationshipCandidates } from "./relationshipCreation";

const document = parseSchema(`CREATE TABLE users (id bigint PRIMARY KEY, code varchar(20) UNIQUE);
CREATE TABLE orders (id bigint PRIMARY KEY, user_id int8, code varchar(20));`, "postgresql");

describe("relationship creation", () => {
  it("normalizes common PostgreSQL and MySQL type aliases", () => {
    expect(normalizeRelationshipType(" INT8 ")).toBe("bigint");
    expect(normalizeRelationshipType("character varying ( 20 )")).toBe("varchar(20)");
  });

  it("ranks compatible key targets first", () => {
    const candidates = relationshipCandidates(document, document.tables[1].id, document.tables[0].id);
    expect(candidates[0]).toMatchObject({ sourceName: "user_id", targetName: "id" });
    expect(candidates.every((candidate) => candidate.dataType === "bigint" || candidate.dataType === "varchar(20)")).toBe(true);
  });

  it("rejects identical duplicates", () => {
    const source = document.tables[1];
    const target = document.tables[0];
    const changed = addRelationship(document, source.id, source.columns[1].id, target.id, target.columns[0].id);
    expect(canCreateRelationship(changed, source.id, source.columns[1].id, target.id, target.columns[0].id)).toBe(false);
  });
});
