import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";

describe("database logic parsing", () => {
  it("parses PostgreSQL trigger functions and connects their effects", () => {
    const document = parseSchema(`
      CREATE TABLE orders (id BIGINT PRIMARY KEY, total NUMERIC);
      CREATE TABLE order_audit (order_id BIGINT, total NUMERIC);
      CREATE FUNCTION audit_order() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO order_audit(order_id, total) VALUES (NEW.id, NEW.total);
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER audit_order_changes AFTER UPDATE OR DELETE ON orders
        FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
        EXECUTE FUNCTION audit_order();
    `, "postgresql");

    expect(document.routines).toHaveLength(1);
    expect(document.routines[0]).toMatchObject({ kind: "function", name: "audit_order", returnType: "trigger", language: "plpgsql" });
    expect(document.routines[0].inserts[0]).toMatchObject({ name: "order_audit", resolvedId: document.tables[1].id });
    expect(document.triggers[0]).toMatchObject({ name: "audit_order_changes", timing: "after", events: ["update", "delete"], scope: "row" });
    expect(document.triggers[0].targetTable.resolvedId).toBe(document.tables[0].id);
    expect(document.triggers[0].executedRoutine?.resolvedId).toBe(document.routines[0].id);
    expect(document.logicEdges.map((edge) => edge.kind)).toEqual(expect.arrayContaining(["table-event", "executes", "inserts"]));
  });

  it("parses MySQL procedures and inline trigger bodies", () => {
    const document = parseSchema(`
      CREATE TABLE orders (id BIGINT PRIMARY KEY, total DECIMAL(10,2));
      CREATE TABLE order_audit (order_id BIGINT, total DECIMAL(10,2));
      DELIMITER //
      CREATE PROCEDURE record_order_audit(IN p_id BIGINT, IN p_total DECIMAL(10,2))
      BEGIN
        INSERT INTO order_audit(order_id, total) VALUES (p_id, p_total);
      END//
      CREATE TRIGGER audit_order_changes AFTER UPDATE ON orders FOR EACH ROW
      BEGIN
        CALL record_order_audit(NEW.id, NEW.total);
      END//
      DELIMITER ;
    `, "mysql");

    expect(document.routines[0]).toMatchObject({ kind: "procedure", name: "record_order_audit" });
    expect(document.routines[0].parameters).toHaveLength(2);
    expect(document.triggers[0]).toMatchObject({ timing: "after", events: ["update"], scope: "row" });
    expect(document.triggers[0].body).toContain("CALL record_order_audit");
  });

  it("keeps unresolved and dynamic dependencies explicit", () => {
    const document = parseSchema(`
      CREATE PROCEDURE refresh_cache()
      BEGIN
        CALL missing_routine();
        UPDATE missing_table SET value = 1;
      END;
    `, "mysql");

    expect(document.logicEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "calls", targetId: undefined, unresolvedTarget: expect.objectContaining({ name: "missing_routine" }) }),
      expect.objectContaining({ kind: "updates", targetId: undefined, unresolvedTarget: expect.objectContaining({ name: "missing_table" }) }),
    ]));
  });
});
