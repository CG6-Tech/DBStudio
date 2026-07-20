import { describe, expect, it } from "vitest";
import { projectConditionChain, projectConditionExpression } from "./conditionProjection";

describe("condition projection", () => {
  it("renders common comparisons as human-readable parts", () => {
    expect(projectConditionExpression("pg_trigger_depth() > 1").clauses[0]).toMatchObject({ left: "pg_trigger_depth()", operator: ">", right: "1" });
    expect(projectConditionExpression("NEW.rating NOT BETWEEN 1 AND 5").clauses[0]).toMatchObject({ left: "NEW.rating", operator: "outside range", right: "1 – 5" });
  });

  it("splits top-level OR clauses without splitting quoted or nested text", () => {
    const result = projectConditionExpression("NEW.body IS NULL OR char_length(NEW.body) < 10");
    expect(result.logic).toBe("or"); expect(result.clauses).toHaveLength(2);
    expect(projectConditionExpression("label = 'A OR B'").clauses).toHaveLength(1);
  });

  it("recognizes a shared-subject IF ELSIF chain as a switch", () => {
    const result = projectConditionChain(["TG_OP = 'UPDATE'", "TG_OP = 'INSERT'", undefined]);
    expect(result).toMatchObject({ kind: "switch", subject: "TG_OP" });
    expect(result.branches?.map((branch) => branch.label)).toEqual(["UPDATE", "INSERT", "Otherwise"]);
  });

  it("falls back to one raw clause for unsupported expressions", () => {
    expect(projectConditionExpression("EXISTS (SELECT 1 FROM audit_log)").clauses[0]).toMatchObject({ operator: "evaluates as true" });
  });
});
