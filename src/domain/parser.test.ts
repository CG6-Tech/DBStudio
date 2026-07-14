import { describe, expect, it } from "vitest";
import { generateSql } from "./operations";
import { parseSchema } from "./parser";

const sql = `-- preserved comment
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  total NUMERIC(10, 2)
);`;

describe("parseSchema", () => {
  it("parses two tables and an inline relationship", () => {
    const document = parseSchema(sql);
    expect(document.tables.map((table) => table.name)).toEqual(["users", "orders"]);
    expect(document.relationships).toHaveLength(1);
    expect(document.tables[1].columns[1]).toMatchObject({ name: "user_id", dataType: "BIGINT", nullable: false });
  });

  it("patches names, types and nullability while preserving unrelated text", () => {
    const document = parseSchema(sql);
    document.tables[0].name = "customers";
    document.tables[0].columns[0].name = "customer_id";
    document.tables[1].columns[2].dataType = "DECIMAL(12, 2)";
    document.tables[1].columns[2].nullable = false;
    const result = generateSql(document);
    expect(result).toContain("-- preserved comment");
    expect(result).toContain("CREATE TABLE customers");
    expect(result).toContain("REFERENCES customers(customer_id)");
    expect(result).toContain("total DECIMAL(12, 2) NOT NULL");
  });
});
