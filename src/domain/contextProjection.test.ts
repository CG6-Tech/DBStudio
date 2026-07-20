import { describe, expect, it } from "vitest";
import { projectContextDeclarations } from "./contextProjection";

describe("context declaration projection", () => {
  it("extracts names and complete data types", () => {
    expect(projectContextDeclarations(`DECLARE
selected_price numeric(12,2);
available_stock integer;
created_at timestamp with time zone;
changed text[];`).declarations).toMatchObject([
      { name: "selected_price", dataType: "numeric(12,2)" },
      { name: "available_stock", dataType: "integer" },
      { name: "created_at", dataType: "timestamp with time zone" },
      { name: "changed", dataType: "text[]" },
    ]);
  });

  it("supports default, assignment, and equals initializers", () => {
    const result = projectContextDeclarations(`DECLARE
status text DEFAULT 'new';
quantity integer := 1;
enabled boolean = true;`);
    expect(result.declarations.map(({ name, initialValue }) => [name, initialValue])).toEqual([
      ["status", "'new'"], ["quantity", "1"], ["enabled", "true"],
    ]);
  });

  it("preserves function calls, quoted delimiters, and multiline expressions", () => {
    const result = projectContextDeclarations(`DECLARE
message text := format('a;b, %s', NEW.id);
old_data jsonb := CASE
  WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD)
  ELSE NULL
END;`);
    expect(result.declarations[0]?.initialValue).toBe("format('a;b, %s', NEW.id)");
    expect(result.declarations[1]).toMatchObject({
      name: "old_data",
      dataType: "jsonb",
      initialValue: "CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END",
    });
  });

  it("keeps uncertain declarations without dropping valid neighbors", () => {
    const result = projectContextDeclarations(`DECLARE
valid_id bigint;
old_name ALIAS FOR old_value;
broken_value :=;`);
    expect(result.declarations).toMatchObject([{ name: "valid_id", dataType: "bigint" }]);
    expect(result.unparsed).toHaveLength(2);
  });
});
