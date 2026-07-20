import { describe, expect, it } from "vitest";
import { commitOperation, operationAffectsCanvasScene, operationAffectsLayout, operationAffectsSql, operationCanvasChanges, redo, undo, type OperationState } from "./operations";
import { parseSchema } from "./parser";

describe("operation history", () => {
  it("undoes and redoes a table rename", () => {
    const document = parseSchema("CREATE TABLE a (id int); CREATE TABLE b (id int REFERENCES a(id));");
    const state: OperationState = { document, past: [], future: [] };
    const renamed = commitOperation(state, {
      kind: "renameTable",
      tableId: document.tables[0].id,
      previous: "a",
      next: "accounts",
    });
    expect(renamed.document.tables[0].name).toBe("accounts");
    const undone = undo(renamed);
    expect(undone.document.tables[0].name).toBe("a");
    expect(redo(undone).document.tables[0].name).toBe("accounts");
  });

  it("stores document replacements as entity patches", () => {
    const document = parseSchema("CREATE TABLE users (id bigint); CREATE TABLE orders (id bigint);");
    const next = { ...document, tables: document.tables.map((table, index) => index === 0 ? { ...table, color: "#22c55e" } : table) };
    const state = commitOperation({ document, past: [], future: [] }, {
      kind: "replaceDocument",
      label: "Change table color",
      previous: document,
      next,
    });
    expect(state.past[0].kind).toBe("patchDocument");
    if (state.past[0].kind !== "patchDocument") throw new Error("Expected an entity patch");
    expect(state.past[0].patch.collections.tables?.changes).toHaveLength(1);
    expect(undo(state).document.tables[0].color).toBe(document.tables[0].color);
    expect(operationAffectsSql(state.past[0])).toBe(false);
    expect(operationAffectsLayout(state.past[0])).toBe(false);
    expect(operationAffectsCanvasScene(state.past[0])).toBe(true);
    expect(operationCanvasChanges(state.past[0]).topology).toBe(false);
  });

  it("marks only structural canvas changes as topology changes", () => {
    const document = parseSchema("CREATE TABLE users (id bigint);");
    const added = parseSchema("CREATE TABLE users (id bigint); CREATE TABLE orders (id bigint);");
    const operation = commitOperation({ document, past: [], future: [] }, {
      kind: "replaceDocument",
      label: "Add table",
      previous: document,
      next: { ...added, source: document.source },
    }).past[0];
    expect(operationCanvasChanges(operation).topology).toBe(true);
  });

  it("classifies SQL comments and geometry separately", () => {
    const document = parseSchema("CREATE TABLE users (id bigint);");
    const comment = commitOperation({ document, past: [], future: [] }, {
      kind: "replaceDocument",
      label: "Edit comment",
      previous: document,
      next: { ...document, tables: [{ ...document.tables[0], comment: "People" }] },
    }).past[0];
    const collapsed = commitOperation({ document, past: [], future: [] }, {
      kind: "replaceDocument",
      label: "Collapse table",
      previous: document,
      next: { ...document, tables: [{ ...document.tables[0], collapsed: true }] },
    }).past[0];
    expect(operationAffectsSql(comment)).toBe(true);
    expect(operationAffectsLayout(collapsed)).toBe(true);
  });

  it("keeps movement on the retained canvas scene", () => {
    const document = parseSchema("CREATE TABLE users (id bigint);");
    const moved = commitOperation({ document, past: [], future: [] }, {
      kind: "replaceDocument",
      label: "Move table",
      previous: document,
      next: { ...document, tables: [{ ...document.tables[0], position: { x: 200, y: 300 } }] },
    }).past[0];
    expect(operationAffectsCanvasScene(moved)).toBe(false);
    expect(operationCanvasChanges(moved)).toEqual({ topology: false, tableIds: [document.tables[0].id], areaIds: [], noteIds: [] });
  });
});
