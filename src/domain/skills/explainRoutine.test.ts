import { describe, expect, it } from "vitest";
import { explainRoutineSkill, parseExplainOutput, type ExplainInput } from "./explainRoutine";
import type { Routine, DatabaseTrigger } from "../types";
import type { RoutineFlowNode } from "../routineFlow";

const routine: Routine = {
  id: "r1",
  kind: "function",
  name: "sync_totals",
  parameters: [{ name: "order_id", dataType: "bigint", mode: "in" }],
  returnType: "void",
  language: "plpgsql",
  body: "BEGIN UPDATE orders SET total = 0; END",
  definitionSql: "CREATE FUNCTION sync_totals(order_id bigint) ...",
  statementRange: { start: 0, end: 10 },
  calls: [],
  reads: [{ name: "line_items" }],
  inserts: [],
  updates: [{ name: "orders", schema: "public" }],
  deletes: [],
  partial: false,
};

describe("explainRoutine prompt building", () => {
  it("includes structured reference lists and the definition for a routine", () => {
    const input: ExplainInput = { kind: "routine", dialect: "postgresql", routine };
    const request = explainRoutineSkill.buildPrompt(input);
    const prompt = request.messages[0].content;
    expect(request.system).toMatch(/JSON object/);
    expect(prompt).toContain("Reads from: line_items");
    expect(prompt).toContain("Updates: public.orders");
    expect(prompt).toContain("Returns: void");
    expect(prompt).toContain("CREATE FUNCTION sync_totals");
  });

  it("summarizes trigger metadata", () => {
    const trigger: DatabaseTrigger = {
      id: "t1",
      name: "audit_orders",
      timing: "after",
      events: ["insert", "update"],
      scope: "row",
      targetTable: { name: "orders", schema: "public" },
      executedRoutine: { name: "log_change" },
      definitionSql: "CREATE TRIGGER audit_orders ...",
      statementRange: { start: 0, end: 5 },
      partial: false,
    };
    const request = explainRoutineSkill.buildPrompt({ kind: "trigger", dialect: "postgresql", trigger });
    const prompt = request.messages[0].content;
    expect(prompt).toContain("Timing: after");
    expect(prompt).toContain("Events: insert, update");
    expect(prompt).toContain("On table: public.orders");
    expect(prompt).toContain("Executes: log_change");
  });

  it("includes parsed details for a flow node", () => {
    const node: RoutineFlowNode = {
      id: "n1",
      kind: "sql",
      title: "Insert audit row",
      source: "INSERT INTO audit (id) VALUES (NEW.id)",
      range: { start: 0, end: 20 },
      inputs: [],
      outputs: [],
      details: { insert: { table: "audit", mappings: [], columnCount: 1, valueCount: 1, complete: true } },
    };
    const request = explainRoutineSkill.buildPrompt({ kind: "flow-node", dialect: "postgresql", routineName: "sync_totals", node });
    const prompt = request.messages[0].content;
    expect(prompt).toContain('Step in routine "sync_totals"');
    expect(prompt).toContain("Step type: sql");
    expect(prompt).toContain("INSERT INTO audit");
    expect(prompt).toContain("\"table\": \"audit\"");
  });
});

describe("explainRoutine result parsing", () => {
  it("parses a clean JSON object", () => {
    const out = parseExplainOutput('{"summary":"Does X","sideEffects":["writes orders"],"risks":["locks table"]}');
    expect(out).toEqual({ summary: "Does X", sideEffects: ["writes orders"], risks: ["locks table"] });
  });

  it("extracts JSON from a fenced code block with prose", () => {
    const raw = "Here you go:\n```json\n{\"summary\":\"Y\",\"sideEffects\":[],\"risks\":[]}\n```\nHope that helps.";
    expect(parseExplainOutput(raw)).toEqual({ summary: "Y", sideEffects: [], risks: [] });
  });

  it("drops non-string array entries and defaults missing fields", () => {
    const out = parseExplainOutput('{"summary":"Z","sideEffects":["ok", 5, ""],"risks":null}');
    expect(out).toEqual({ summary: "Z", sideEffects: ["ok"], risks: [] });
  });

  it("falls back to treating non-JSON as the summary", () => {
    const out = parseExplainOutput("This routine just returns a constant.");
    expect(out.summary).toBe("This routine just returns a constant.");
    expect(out.sideEffects).toEqual([]);
    expect(out.risks).toEqual([]);
  });
});
