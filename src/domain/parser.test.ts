import { describe, expect, it } from "vitest";
import { generateSql } from "./operations";
import { parseSchema, quoteIdentifier } from "./parser";

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

  it("resolves schema-qualified relationships and standalone indexes", () => {
    const document = parseSchema(`
      CREATE TABLE public.users (id INT PRIMARY KEY);
      CREATE TABLE audit.users (id INT PRIMARY KEY, public_id INT REFERENCES public.users(id));
      CREATE INDEX audit_users_public_id ON audit.users USING btree (public_id);
    `);

    expect(document.relationships).toHaveLength(1);
    expect(document.relationships[0]).toMatchObject({
      sourceTableId: document.tables[1].id,
      targetTableId: document.tables[0].id,
    });
    expect(document.tables[1].indexes[0]).toMatchObject({ name: "audit_users_public_id", standalone: true });
    expect(document.tables[1].indexes[0].columnIds).toEqual([document.tables[1].columns[1].id]);
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

  it("applies multiple source patches in one pass without changing untouched SQL", () => {
    const document = parseSchema(sql);
    document.tables[0].name = "accounts";
    document.tables[0].columns[1].name = "login_email";
    document.tables[1].columns[2].dataType = "NUMERIC(14, 4)";

    const result = generateSql(document);
    expect(result).toContain("CREATE TABLE accounts");
    expect(result).toContain("login_email TEXT NOT NULL");
    expect(result).toContain("total NUMERIC(14, 4)");
    expect(result).toContain("REFERENCES accounts(id)");
    expect(result).toContain("-- preserved comment");
  });

  it("rejects overlapping source patches", () => {
    const document = parseSchema(sql);
    document.tables[0].name = "accounts";
    document.tables[0].columns[0].name = "account_id";
    document.tables[0].columns[0].nameRange = { ...document.tables[0].nameRange };
    expect(() => generateSql(document)).toThrow("Overlapping SQL patches");
  });

  it("parses MySQL tables, indexes, options, and a table-level relationship", () => {
    const mysql = `CREATE TABLE \`users\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  \`display_name\` VARCHAR(120) DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`idx_display_name\` (\`display_name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE \`orders\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  \`user_id\` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`idx_user_id\` (\`user_id\`),
  CONSTRAINT \`fk_orders_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)
) ENGINE=InnoDB;`;
    const document = parseSchema(mysql, "mysql");
    expect(document.dialect).toBe("mysql");
    expect(document.tables.map((table) => table.name)).toEqual(["users", "orders"]);
    expect(document.tables[0].columns.map((column) => column.name)).toEqual(["id", "display_name"]);
    expect(document.tables[0].columns[0].dataType).toBe("BIGINT UNSIGNED");
    expect(document.tables[0].tableOptions).toContain("ENGINE=InnoDB");
    expect(document.relationships).toHaveLength(1);
  });

  it("quotes identifiers for the active dialect", () => {
    expect(quoteIdentifier("Order Items", "mysql")).toBe("`Order Items`");
    expect(quoteIdentifier("odd`name", "mysql")).toBe("`odd``name`");
    expect(quoteIdentifier("Order Items", "postgresql")).toBe('"Order Items"');
  });

  it("uses MySQL quoting for generated edits and preserves table options", () => {
    const document = parseSchema("CREATE TABLE `users` (`id` INT PRIMARY KEY) ENGINE=InnoDB;", "mysql");
    document.tables[0].name = "User Accounts";
    document.tables[0].columns[0].name = "User Id";
    const result = generateSql(document);
    expect(result).toContain("CREATE TABLE `User Accounts`");
    expect(result).toContain("`User Id` INT PRIMARY KEY");
    expect(result).toContain("ENGINE=InnoDB");
  });
});
