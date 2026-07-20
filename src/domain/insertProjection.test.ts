import { describe, expect, it } from "vitest";
import { classifyInsertValue, projectInsertStatement } from "./insertProjection";

const auditInsert = `INSERT INTO public.audit_log (
 action, entity_name, entity_id, operation, actor,
 before_data, after_data, changed_fields, transaction_id, created_at
) VALUES (
 format('%s public.orders', TG_OP), 'public.orders', row_id, TG_OP, session_actor,
 old_data, new_data, changed, txid_current(), clock_timestamp()
);`;

describe("structured INSERT projection", () => {
  it("pairs all audit columns with values while preserving nested commas", () => {
    const result = projectInsertStatement(auditInsert);
    expect(result).toMatchObject({ table: "public.audit_log", columnCount: 10, valueCount: 10, complete: true });
    expect(result?.mappings.map((item) => [item.column, item.value, item.kind])).toEqual([
      ["action", "format('%s public.orders', TG_OP)", "expression"], ["entity_name", "'public.orders'", "constant"], ["entity_id", "row_id", "variable"], ["operation", "TG_OP", "variable"], ["actor", "session_actor", "variable"], ["before_data", "old_data", "variable"], ["after_data", "new_data", "variable"], ["changed_fields", "changed", "variable"], ["transaction_id", "txid_current()", "function"], ["created_at", "clock_timestamp()", "function"],
    ]);
  });

  it("handles quoted commas, escaped quotes, casts, and nested calls", () => {
    const result = projectInsertStatement(`INSERT INTO "audit"."log" (message, payload, count) VALUES ('it''s, valid', jsonb_build_object('a', fn(1, 2)), 1::bigint);`);
    expect(result?.mappings).toHaveLength(3); expect(result?.mappings[0].kind).toBe("constant"); expect(result?.mappings[1].kind).toBe("function"); expect(result?.mappings[2].kind).toBe("constant");
  });

  it("reports count mismatches and rejects uncertain forms", () => {
    expect(projectInsertStatement("INSERT INTO t(a,b) VALUES (1);")?.warning).toBe("2 columns but 1 values");
    expect(projectInsertStatement("INSERT INTO t VALUES (1);")).toBeNull();
    expect(projectInsertStatement("INSERT INTO t(a) SELECT a FROM x;")).toBeNull();
    expect(projectInsertStatement("INSERT INTO t(a) VALUES ('broken);")).toBeNull();
  });

  it("classifies values conservatively", () => {
    expect(classifyInsertValue("NEW.id")).toBe("variable"); expect(classifyInsertValue("now()")).toBe("function"); expect(classifyInsertValue("format('%s', x)")).toBe("expression");
  });
});
