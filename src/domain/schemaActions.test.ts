import { describe, expect, it } from "vitest";
import { generateSql } from "./operations";
import { parseSchema } from "./parser";
import { addArea, addColumn, addNote, addRelationship, addTable, assignTableToArea, updateArea, updateNote, updateTable } from "./schemaActions";

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
});
