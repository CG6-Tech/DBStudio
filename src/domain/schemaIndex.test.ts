import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { buildSchemaIndex, customTypeDependentClosure, customTypeUsageLabels, findIndexedColumn, findIndexedTable, schemaIndexFor } from "./schemaIndex";

describe("schema indexes", () => {
  it("indexes IDs, qualified names, columns, relationships, and structural membership", () => {
    const document = parseSchema(`
      CREATE TABLE public.users (id INT PRIMARY KEY);
      CREATE TABLE audit.users (id INT PRIMARY KEY, public_id INT REFERENCES public.users(id));
    `);
    document.structuralTableIds = [document.tables[1].id];
    const index = buildSchemaIndex(document);

    expect(findIndexedTable(index, "users", "public")?.schema).toBe("public");
    expect(findIndexedTable(index, "users", "audit")?.schema).toBe("audit");
    expect(findIndexedTable(index, "users")).toBe(document.tables[0]);
    expect(findIndexedColumn(index, document.tables[1].id, "PUBLIC_ID")?.name).toBe("public_id");
    expect(index.tableById.get(document.tables[0].id)).toBe(document.tables[0]);
    expect(index.tablePositionById.get(document.tables[1].id)).toBe(1);
    expect(index.columnLocationById.get(document.tables[1].columns[1].id)).toEqual({ tableIndex: 1, columnIndex: 1 });
    expect(index.relationshipsByTableId.get(document.tables[0].id)).toHaveLength(1);
    expect(index.structuralTableIds.has(document.tables[1].id)).toBe(true);
  });

  it("indexes custom-type usages and reverse dependency closures", () => {
    const document = parseSchema(`
      CREATE TYPE currency AS ENUM ('USD', 'EUR');
      CREATE DOMAIN money_domain AS currency;
      CREATE TYPE invoice AS (total money_domain);
      CREATE TABLE invoices (id INT, status currency, payload invoice);
    `);
    const currency = document.customTypes.find((type) => type.name === "currency")!;
    const money = document.customTypes.find((type) => type.name === "money_domain")!;
    const invoice = document.customTypes.find((type) => type.name === "invoice")!;
    const index = schemaIndexFor(document);

    expect(customTypeUsageLabels(document, currency.id, index)).toEqual(["invoices.status", "domain money_domain"]);
    expect(customTypeDependentClosure(index, currency.id)).toEqual(new Set([currency.id, money.id, invoice.id]));
    expect(schemaIndexFor(document)).toBe(index);
  });

  it("resolves ambiguous unqualified names in stable source order", () => {
    const document = parseSchema("CREATE TABLE first.items (id INT); CREATE TABLE second.items (id INT);");
    const index = buildSchemaIndex(document);
    expect(findIndexedTable(index, "items")).toBe(document.tables[0]);
  });
});
