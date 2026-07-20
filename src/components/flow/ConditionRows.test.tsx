import { render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseRoutineFlow } from "../../domain/routineFlow";
import { ConditionRows } from "./ConditionRows";

describe("ConditionRows", () => {
  it("renders OR clauses with one shared Then port on the final row", () => {
    const flow = parseRoutineFlow("r", "BEGIN\nIF NEW.quantity IS NULL OR NEW.quantity < 1 THEN\nRAISE EXCEPTION USING MESSAGE = 'Invalid';\nEND IF;\nRETURN NEW;\nEND;");
    const node = flow.nodes.find((item) => item.kind === "condition")!; const register = vi.fn();
    const { container } = render(<ConditionRows node={node} registerPort={register}/>);
    expect(within(container).getByText("OR")).toBeInTheDocument();
    expect(within(container).getByText("is missing")).toBeInTheDocument();
    expect(within(container).getByText("<")).toBeInTheDocument();
    expect(within(container).getAllByText("Then")).toHaveLength(1);
    expect(container.querySelectorAll("[data-port-direction='output']")).toHaveLength(2);
    expect(container.querySelector(".condition-flow-summary")).toBeNull();
    expect(container.querySelector(".condition-expression")).toBeNull();
  });

  it("renders one shared Then port on the final AND clause", () => {
    const flow = parseRoutineFlow("r", "BEGIN\nIF NEW.status = 'PAID' AND NEW.total > 0 THEN\nRETURN NEW;\nEND IF;\nRETURN OLD;\nEND;");
    const node = flow.nodes.find((item) => item.kind === "condition")!;
    expect(node.details?.conditionRows?.map((row) => [row.left, row.portId, row.outcome])).toEqual([["NEW.status", undefined, "Then"], ["NEW.total", "branch-0", "Then"], ["Otherwise", "default", "Continue"]]);
    const { container } = render(<ConditionRows node={node}/>);
    expect(within(container).getByText("AND")).toBeInTheDocument();
    expect(within(container).getAllByText("Then")).toHaveLength(1);
    expect(container.querySelectorAll("[data-port-id='branch-0']")).toHaveLength(1);
  });

  it("uses a compact TRUE chip for boolean conditions", () => {
    const flow = parseRoutineFlow("r", "BEGIN\nIF NOT FOUND THEN\nRETURN OLD;\nEND IF;\nRETURN NEW;\nEND;");
    const node = flow.nodes.find((item) => item.kind === "condition")!;
    const { container } = render(<ConditionRows node={node}/>);
    expect(within(container).getByText("TRUE")).toHaveClass("condition-inline-operator", "boolean");
    expect(within(container).queryByText("evaluates as true")).toBeNull();
  });
});
