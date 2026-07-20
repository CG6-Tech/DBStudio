import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { compatibleTargets, validateRelationshipEndpoints } from "./relationshipCompatibility";

describe("relationship compatibility", () => {
  it("ranks matching primary keys and rejects invalid endpoints", () => {
    const document = parseSchema("CREATE TABLE users(id BIGINT PRIMARY KEY); CREATE TABLE orders(user_id BIGINT, note TEXT);");
    const source = document.tables[1].columns[0];
    const target = document.tables[0].columns[0];
    expect(compatibleTargets(document, source.id)[0].columnId).toBe(target.id);
    expect(validateRelationshipEndpoints(document, source.id, target.id).valid).toBe(true);
    expect(validateRelationshipEndpoints(document, document.tables[1].columns[1].id, target.id).reason).toBe("incompatible-type");
  });

  it("treats PostgreSQL serial aliases as their integer storage types", () => {
    const document = parseSchema("CREATE TABLE users(id BIGSERIAL PRIMARY KEY); CREATE TABLE orders(user_id BIGINT);");
    expect(validateRelationshipEndpoints(document, document.tables[1].columns[0].id, document.tables[0].columns[0].id).valid).toBe(true);
  });
});
