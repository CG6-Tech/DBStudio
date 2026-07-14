import { describe, expect, it } from "vitest";
import { parseFieldType } from "../dialects";
import { rebuildEditorDiagnostics, recursiveCustomTypeIds } from "./editorDiagnostics";
import { generateSql } from "./operations";
import { parseSchema } from "./parser";
import { addArea, addColumn, addNote, addRelationship, addTable, assignTableToArea, customTypeUsage, deleteCustomType, updateArea, updateColumn, updateColumnType, updateCustomType, updateNote, updateTable } from "./schemaActions";

const source = `CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY
);`;

describe("structural schema actions", () => {
  it("adds a field without dropping defaults", () => {
    const parsed = parseSchema(source);
    const changed = addColumn(parsed, parsed.tables[0].id);
    const sql = generateSql(changed);
    expect(sql).toContain("created_at TIMESTAMPTZ NOT NULL DEFAULT now()");
    expect(sql).toContain("field_3 TEXT");
  });

  it("creates a table and relationship", () => {
    const parsed = parseSchema(source);
    let changed = addTable(parsed);
    const added = changed.tables.at(-1)!;
    changed = addColumn(changed, added.id);
    changed = addRelationship(changed, added.id, changed.tables.at(-1)!.columns[0].id, parsed.tables[0].id, parsed.tables[0].columns[0].id);
    expect(generateSql(changed)).toContain("REFERENCES users(id)");
  });

  it("moves and groups tables without changing SQL", () => {
    const parsed = parseSchema(source);
    const baseline = generateSql(parsed);
    let changed = addArea(parsed);
    changed = updateArea(changed, changed.areas[0].id, { color: "#ff6584" });
    changed = updateTable(changed, changed.tables[0].id, { position: { x: 240, y: 180 }, color: "#7fb1ff" });
    changed = assignTableToArea(changed, changed.tables[0].id, changed.areas[0].id);
    expect(generateSql(changed)).toBe(baseline);
    expect(changed.areas[0].tableIds).toEqual([changed.tables[0].id]);
  });

  it("adds and moves notes without changing SQL", () => {
    const parsed = parseSchema(source);
    const baseline = generateSql(parsed);
    let changed = addNote(parsed);
    changed = updateNote(changed, changed.notes[0].id, { text: "Billing domain", x: 340, y: 220 });
    expect(generateSql(changed)).toBe(baseline);
    expect(changed.notes[0]).toMatchObject({ text: "Billing domain", x: 340, y: 220 });
  });

  it("keeps incremental table diagnostics equivalent to a full rebuild", () => {
    const parsed = parseSchema(source);
    parsed.diagnostics.push({ level: "warning", message: "Parser diagnostic stays" });
    const unresolved = parseFieldType("unknown_business_type", parsed.dialect, parsed.customTypes);
    const changed = updateColumnType(parsed, parsed.tables[0].id, parsed.tables[0].columns[0].id, unresolved);
    const rebuilt = rebuildEditorDiagnostics(changed);

    expect(changed.diagnostics).toEqual(rebuilt.diagnostics);
    expect(changed.diagnostics.some((diagnostic) => diagnostic.message === "Parser diagnostic stays")).toBe(true);
    expect(changed.diagnostics.some((diagnostic) => diagnostic.message.includes("unknown_business_type"))).toBe(true);
  });

  it("detects every member of a recursive custom-type component", () => {
    const parsed = parseSchema(`
      CREATE TYPE first_type AS (second second_type);
      CREATE TYPE second_type AS (first first_type);
    `);
    expect(recursiveCustomTypeIds(parsed)).toEqual(new Set(parsed.customTypes.map((type) => type.id)));
  });

  it("keeps incremental custom-type diagnostics equivalent after a duplicate rename", () => {
    const parsed = parseSchema(`
      CREATE TYPE first_status AS ENUM ('open');
      CREATE TYPE second_status AS ENUM ('closed');
    `);
    const changed = updateCustomType(parsed, parsed.customTypes[1].id, { name: "first_status" });
    expect(changed.diagnostics).toEqual(rebuildEditorDiagnostics(changed).diagnostics);
    expect(changed.diagnostics.some((diagnostic) => diagnostic.message === "Editor: Duplicate custom type first_status.")).toBe(true);
  });

  it("uses reverse usages for deletion and localizes custom-type rename propagation", () => {
    const parsed = parseSchema(`
      CREATE TYPE status_type AS ENUM ('open', 'closed');
      CREATE TABLE orders (id INT, status status_type);
      CREATE TABLE audit_log (id INT);
    `);
    const type = parsed.customTypes[0];
    expect(customTypeUsage(parsed, type.id)).toEqual(["orders.status"]);
    expect(deleteCustomType(parsed, type.id).customTypes).toHaveLength(1);

    const changed = updateCustomType(parsed, type.id, { name: "order_status" });
    expect(changed.tables[0]).not.toBe(parsed.tables[0]);
    expect(changed.tables[0].columns[1].dataType).toBe("order_status");
    expect(changed.tables[1]).toBe(parsed.tables[1]);
  });

  it("marks transitive custom-type dependents for regenerated SQL", () => {
    const parsed = parseSchema(`
      CREATE TYPE currency_type AS ENUM ('USD', 'EUR');
      CREATE DOMAIN money_domain AS currency_type;
      CREATE TYPE invoice_type AS (total money_domain);
    `);
    const changed = updateCustomType(parsed, parsed.customTypes[0].id, { name: "currency_code" });
    expect(changed.customTypes.map((type) => type.isEdited)).toEqual([true, true, true]);
  });

  it("preserves unrelated table identities during repeated indexed edits", () => {
    const parsed = parseSchema(Array.from({ length: 3_000 }, (_, index) => `CREATE TABLE edit_${index} (id INT);`).join("\n"));
    const first = updateColumn(parsed, parsed.tables[1_500].id, parsed.tables[1_500].columns[0].id, { name: "record_id" });
    const second = updateColumn(first, first.tables[1_500].id, first.tables[1_500].columns[0].id, { nullable: false });

    expect(first.tables[0]).toBe(parsed.tables[0]);
    expect(first.tables[1_500]).not.toBe(parsed.tables[1_500]);
    expect(first.tables[2_999]).toBe(parsed.tables[2_999]);
    expect(second.tables[0]).toBe(first.tables[0]);
    expect(second.tables[2_999]).toBe(first.tables[2_999]);
  });
});
