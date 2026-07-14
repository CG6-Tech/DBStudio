import { describe, expect, it } from "vitest";
import { commitOperation, redo, undo, type OperationState } from "./operations";
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
});
