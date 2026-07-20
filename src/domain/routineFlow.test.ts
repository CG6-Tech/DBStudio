import { describe, expect, it } from "vitest";
import { parseRoutineFlow } from "./routineFlow";

const body = `BEGIN
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23502', MESSAGE = 'A review must reference a user.';
  END IF;
  NEW.body := nullif(btrim(NEW.body), '');
  IF NEW.body IS NULL OR
     char_length(NEW.body) < 10 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Review text is too short.';
  ELSIF char_length(NEW.body) > 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22001', MESSAGE = 'Review text is too long.';
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;`;

describe("PL/pgSQL routine flow", () => {
  it("builds conditions, assignments, exceptions, and returns with semantic ports", () => {
    const flow = parseRoutineFlow("routine:test", body);
    expect(flow.complete).toBe(true);
    expect(flow.nodes.find((node) => node.kind === "start")?.title).toBe("BEGIN");
    expect(flow.nodes.filter((node) => node.kind === "condition")).toHaveLength(2);
    expect(flow.nodes.filter((node) => node.kind === "raise")).toHaveLength(3);
    expect(flow.nodes.filter((node) => node.kind === "assignment")).toHaveLength(2);
    expect(flow.nodes.some((node) => node.kind === "return")).toBe(true);
    const compound = flow.nodes.find((node) => node.kind === "condition" && node.source.includes("5000"));
    expect(compound?.outputs.map((port) => port.label)).toEqual(["Then", "Elsif", "Else"]);
    expect(compound?.details?.conditionRows?.map((row) => [row.left, row.outcome])).toEqual([
      ["NEW.body", "Then"], ["char_length(NEW.body)", "Then"], ["char_length(NEW.body)", "Elsif"], ["Otherwise", "Else"],
    ]);
    expect(flow.nodes.find((node) => node.details?.errcode === "23502")?.details?.message).toBe("A review must reference a user.");
  });

  it("returns a partial flow for an unclosed condition", () => {
    const flow = parseRoutineFlow("routine:broken", "BEGIN\nIF value IS NULL THEN\nRETURN NULL;\n");
    expect(flow.complete).toBe(false);
    expect(flow.diagnostics[0]?.message).toContain("Unclosed IF");
  });

  it("uses deterministic IDs", () => {
    expect(parseRoutineFlow("routine:test", body).nodes.map((node) => node.id)).toEqual(parseRoutineFlow("routine:test", body).nodes.map((node) => node.id));
  });

  it("preserves expression-based exception messages", () => {
    const source = [
      "BEGIN",
      "IF available_stock < required_quantity THEN",
      "  RAISE EXCEPTION USING",
      "    ERRCODE = '23514',",
      "    MESSAGE = format('Requested %s, available %s.', required_quantity, available_stock),",
      "    HINT = 'Reduce the quantity.';",
      "END IF;",
      "RETURN NEW;",
      "END;",
    ].join("\n");
    const flow = parseRoutineFlow("routine:raise-expression", source);
    const exception = flow.nodes.find((node) => node.kind === "raise");
    expect(exception?.details).toMatchObject({
      errcode: "23514",
      message: "format('Requested %s, available %s.', required_quantity, available_stock)",
      hint: "Reduce the quantity.",
    });
  });

  it("groups consecutive raise-only validations without losing failure outputs", () => {
    const flow = parseRoutineFlow("routine:validation", `BEGIN
IF NEW.user_id IS NULL THEN
  RAISE EXCEPTION USING MESSAGE = 'Missing user';
END IF;
IF NEW.product_id IS NULL THEN
  RAISE EXCEPTION USING MESSAGE = 'Missing product';
END IF;
RETURN NEW;
END;`);
    const validation = flow.nodes.find((node) => node.title === "Validation");
    expect(validation?.groupedSourceIds).toHaveLength(2);
    expect(validation?.outputs).toHaveLength(3);
    expect(flow.edges.filter((edge) => edge.sourceId === validation?.id)).toHaveLength(3);
  });

  it("normalizes the audit trigger into an early return and explicit operation merge", () => {
    const flow = parseRoutineFlow("routine:audit", `DECLARE
old_data jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
new_data jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
changed text[];
BEGIN
IF pg_trigger_depth() > 1 THEN
  RETURN coalesce(NEW, OLD);
END IF;
IF TG_OP = 'UPDATE' THEN
  SELECT array_agg(key) INTO changed FROM jsonb_object_keys(old_data || new_data) keys(key);
ELSIF TG_OP = 'INSERT' THEN
  SELECT array_agg(key) INTO changed FROM jsonb_object_keys(new_data) keys(key);
ELSE
  SELECT array_agg(key) INTO changed FROM jsonb_object_keys(old_data) keys(key);
END IF;
INSERT INTO public.audit_log(action, changed_fields) VALUES (TG_OP, changed);
RETURN coalesce(NEW, OLD);
END;`);
    const operation = flow.nodes.find((node) => node.kind === "condition" && node.source.includes("TG_OP = 'UPDATE'"));
    expect(operation?.outputs).toHaveLength(3);
    expect(operation?.title).toBe("IF");
    expect(operation?.outputs.map((port) => port.label)).toEqual(["Then", "Then", "Else"]);
    expect(operation?.details?.conditionRows?.map((row) => [row.left, row.operator, row.right, row.outcome])).toEqual([
      ["TG_OP", "=", "UPDATE", "Then"], ["TG_OP", "=", "INSERT", "Then"], ["Otherwise", undefined, undefined, "Else"],
    ]);
    expect(operation?.details?.condition).toMatchObject({ kind: "switch", subject: "TG_OP" });
    expect(operation?.details?.condition?.branches?.map((branch) => branch.summary)).toEqual(["Compare old and new fields", "Collect fields from new data", "Collect fields from old data"]);
    const context = flow.nodes.find((node) => node.kind === "context");
    const begin = flow.nodes.find((node) => node.kind === "start");
    expect(context?.title).toBe("DECLARE");
    expect(context?.inputs).toHaveLength(0);
    expect(begin?.inputs).toHaveLength(1);
    expect(flow.edges.some((edge) => edge.sourceId === context?.id && edge.targetId === begin?.id)).toBe(true);
    expect(context?.details?.message).toBe("old_data, new_data, changed");
    expect(context?.details?.context?.declarations).toMatchObject([
      { name: "old_data", dataType: "jsonb", initialValue: "CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END" },
      { name: "new_data", dataType: "jsonb", initialValue: "CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END" },
      { name: "changed", dataType: "text[]" },
    ]);
    const computeNodes = flow.nodes.filter((node) => node.kind === "compute");
    expect(computeNodes.map((node) => node.title)).toEqual(["Changed fields", "Changed fields", "Changed fields"]);
    expect(computeNodes.map((node) => node.details?.message)).toEqual(["Compare old and new fields", "Collect fields from new data", "Collect fields from old data"]);
    expect(computeNodes.map((node) => node.details?.compute?.source)).toEqual(["keys from old_data || new_data", "keys from new_data", "keys from old_data"]);
    expect(computeNodes[0]?.details?.compute?.select).toMatchObject({ fields: ["array_agg(key)"], target: "changed", table: "keys from old_data || new_data" });
    const guard = flow.nodes.find((node) => node.kind === "condition" && node.source.includes("pg_trigger_depth"));
    expect(guard?.details?.condition?.kind).toBe("guard");
    expect(guard?.outputs.map((port) => port.label)).toEqual(["Then", "Continue"]);
    expect(guard?.details?.conditionRows?.map((row) => row.left)).toEqual(["pg_trigger_depth()", "Otherwise"]);
    const auditInsert = flow.nodes.find((node) => node.kind === "sql" && node.source.startsWith("INSERT INTO public.audit_log"));
    const merge = flow.nodes.find((node) => node.kind === "merge" && flow.edges.some((edge) => edge.sourceId === node.id && edge.targetId === auditInsert?.id));
    expect(merge?.inputs).toHaveLength(3);
    expect(merge?.title).toBe("changed ready");
    expect(merge?.inputs.map((input) => input.label)).toEqual(["changed", "changed", "changed"]);
    expect(merge?.details?.merge?.rows.map((row) => [row.label, row.detail, row.kind])).toEqual([
      ["changed", "array_agg(key)", "variable"], ["changed", "array_agg(key)", "variable"], ["changed", "array_agg(key)", "variable"],
    ]);
    expect(merge?.outputs[0]?.label).toBe("to changed_fields");
    const routineReturn = flow.nodes.find((node) => node.kind === "return" && node.source.includes("coalesce(NEW, OLD)"));
    expect(routineReturn?.title).toBe("RETURN");
    expect(routineReturn?.details?.return?.value).toBe("coalesce(NEW, OLD)");
  });

  it("maps grouped OR and AND clauses to one execution branch", () => {
    const orFlow = parseRoutineFlow("routine:or", "BEGIN\nIF NEW.quantity IS NULL OR NEW.quantity < 1 THEN\nRAISE EXCEPTION USING MESSAGE = 'Invalid quantity';\nEND IF;\nRETURN NEW;\nEND;");
    const orNode = orFlow.nodes.find((node) => node.kind === "condition")!;
    expect(orNode.outputs.map((port) => port.id)).toEqual(["branch-0", "default"]);
    expect(orNode.details?.conditionRows?.slice(0, 2).map((row) => row.portId)).toEqual([undefined, "branch-0"]);
    expect(orFlow.edges.filter((edge) => edge.sourceId === orNode.id && edge.sourcePortId === "branch-0")).toHaveLength(1);

    const andFlow = parseRoutineFlow("routine:and", "BEGIN\nIF NEW.status = 'PAID' AND NEW.total > 0 THEN\nRETURN NEW;\nEND IF;\nRETURN OLD;\nEND;");
    const andNode = andFlow.nodes.find((node) => node.kind === "condition")!;
    expect(andNode.title).toBe("Guard");
    expect(andNode.outputs.map((port) => port.id)).toEqual(["branch-0", "default"]);
    expect(andNode.details?.conditionRows?.slice(0, 2).map((row) => row.portId)).toEqual([undefined, "branch-0"]);

    const decisionFlow = parseRoutineFlow("routine:decision", "BEGIN\nIF TG_OP = 'UPDATE' AND OLD.product IS DISTINCT FROM NEW.product THEN\nrequired_quantity := NEW.quantity;\nEND IF;\nRETURN NEW;\nEND;");
    expect(decisionFlow.nodes.find((node) => node.kind === "condition")?.title).toBe("IF");
  });

  it("groups review validations across OR clauses and omits unreachable END", () => {
    const flow = parseRoutineFlow("routine:validate-review", `BEGIN
IF NEW.user_id IS NULL THEN
  RAISE EXCEPTION USING ERRCODE = '23502', MESSAGE = 'A review must reference a user.';
END IF;
IF NEW.product_id IS NULL THEN
  RAISE EXCEPTION USING ERRCODE = '23502', MESSAGE = 'A review must reference a product.';
END IF;
IF NEW.rating IS NULL OR NEW.rating NOT BETWEEN 1 AND 5 THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Review rating must be between 1 and 5.';
END IF;
NEW.body := nullif(btrim(NEW.body), '');
IF NEW.body IS NULL OR char_length(NEW.body) < 10 THEN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Review text must contain at least 10 characters.';
END IF;
IF char_length(NEW.body) > 5000 THEN
  RAISE EXCEPTION USING ERRCODE = '22001', MESSAGE = 'Review text cannot exceed 5000 characters.';
END IF;
NEW.updated_at := now();
RETURN NEW;
END;`);
    const validations = flow.nodes.filter((node) => node.title === "Validation");
    expect(validations.map((node) => node.groupedSourceIds?.length)).toEqual([3, 2]);
    expect(validations.map((node) => node.details?.conditionRows?.filter((row) => row.left !== "Otherwise").length)).toEqual([4, 3]);
    for (const validation of validations) {
      const rowIds = validation.details?.conditionRows?.map((row) => row.id) ?? [];
      expect(new Set(rowIds).size).toBe(rowIds.length);
    }
    expect(flow.nodes.some((node) => node.kind === "end")).toBe(false);
    expect(flow.nodes.filter((node) => node.kind === "raise")).toHaveLength(5);
    for (const raise of flow.nodes.filter((node) => node.kind === "raise")) {
      expect(flow.edges.filter((edge) => edge.targetId === raise.id)).toHaveLength(1);
    }
  });

  it("projects plain select, update, and delete SQL blocks in full flow", () => {
    const flow = parseRoutineFlow("routine:sql", `BEGIN
PERFORM 1 FROM inventory WHERE id = 1 FOR UPDATE;
SELECT count FROM inventory WHERE id = 1;
UPDATE inventory SET count = count - 1 WHERE id = 1;
DELETE FROM audit_log WHERE created_at < cutoff;
END;`);
    const perform = flow.nodes.find((node) => node.details?.perform);
    const select = flow.nodes.find((node) => node.details?.select);
    const update = flow.nodes.find((node) => node.details?.mutation?.operation === "UPDATE");
    const remove = flow.nodes.find((node) => node.details?.mutation?.operation === "DELETE");
    expect(perform?.title).toBe("PERFORM");
    expect(perform?.details?.perform).toMatchObject({ table: "inventory", condition: "id = 1", lock: "FOR UPDATE" });
    expect(select?.title).toBe("Read inventory");
    expect(select?.details?.select).toMatchObject({ fields: ["count"], table: "inventory", condition: "id = 1" });
    expect(update?.title).toBe("UPDATE");
    expect(update?.details?.mutation).toMatchObject({ table: "inventory", assignments: [{ field: "count", value: "count - 1" }], condition: "id = 1" });
    expect(remove?.title).toBe("Delete audit_log");
    expect(remove?.details?.mutation).toMatchObject({ table: "audit_log", condition: "created_at < cutoff" });
  });
});
