import { describe, expect, it } from "vitest";
import type { RoutineFlow } from "../../domain/routineFlow";
import { parseRoutineFlow } from "../../domain/routineFlow";
import { flowAnimationOrder, reachableFlow } from "./FlowConnections";

describe("flow branch focus", () => {
  it("follows one branch through a shared merge without selecting its sibling", () => {
    const flow = {
      routineId: "r", bodyHash: "x", diagnostics: [], complete: true, nodes: [],
      edges: [
        { id: "update", sourceId: "condition", sourcePortId: "update", targetId: "update-sql", targetPortId: "in" },
        { id: "insert", sourceId: "condition", sourcePortId: "insert", targetId: "insert-sql", targetPortId: "in" },
        { id: "update-merge", sourceId: "update-sql", sourcePortId: "next", targetId: "merge", targetPortId: "in-0" },
        { id: "insert-merge", sourceId: "insert-sql", sourcePortId: "next", targetId: "merge", targetPortId: "in-1" },
        { id: "audit", sourceId: "merge", sourcePortId: "next", targetId: "audit-log", targetPortId: "in" },
      ],
    } satisfies RoutineFlow;
    const focused = reachableFlow(flow, "condition", "update");
    expect(focused.nodes).toEqual(new Set(["condition", "update-sql", "merge", "audit-log"]));
    expect(focused.edges.has("insert")).toBe(false);
    expect(focused.edges.has("insert-merge")).toBe(false);
    expect(focused.edges.has("audit")).toBe(true);
  });

  it("orders clicked-flow animation by SQL branch and execution depth", () => {
    const flow = parseRoutineFlow("routine:animation", [
      "BEGIN",
      "IF TG_OP = 'UPDATE' THEN",
      "  NEW.value := 1;",
      "ELSIF TG_OP = 'INSERT' THEN",
      "  NEW.value := 2;",
      "ELSE",
      "  NEW.value := 3;",
      "END IF;",
      "NEW.updated_at := now();",
      "RETURN NEW;",
      "END;",
    ].join("\n"));
    const condition = flow.nodes.find((node) => node.kind === "condition")!;
    const order = flowAnimationOrder(flow, condition.id);
    const conditionEdges = flow.edges
      .filter((edge) => edge.sourceId === condition.id)
      .sort((left, right) => order.get(left.id)! - order.get(right.id)!);
    expect(conditionEdges.map((edge) => edge.sourcePortId)).toEqual(["branch-0", "branch-1", "branch-2"]);
    const merge = flow.nodes.find((node) => node.kind === "merge")!;
    const mergeOutput = flow.edges.find((edge) => edge.sourceId === merge.id)!;
    expect(order.get(mergeOutput.id)).toBeGreaterThan(Math.max(...conditionEdges.map((edge) => order.get(edge.id)!)));
  });

  it("animates only the focused condition branch", () => {
    const flow = parseRoutineFlow("routine:focused-animation", "BEGIN\nIF TG_OP = 'UPDATE' THEN\nNEW.value := 1;\nELSE\nNEW.value := 2;\nEND IF;\nRETURN NEW;\nEND;");
    const condition = flow.nodes.find((node) => node.kind === "condition")!;
    const order = flowAnimationOrder(flow, condition.id, "branch-0");
    expect(flow.edges.find((edge) => edge.sourceId === condition.id && edge.sourcePortId === "branch-0" && order.has(edge.id))).toBeDefined();
    expect(flow.edges.find((edge) => edge.sourceId === condition.id && edge.sourcePortId === "branch-1" && order.has(edge.id))).toBeUndefined();
  });
});
