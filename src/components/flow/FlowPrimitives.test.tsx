import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConditionBlock, ExceptionBlock, FlowPort, MergeBlock, OperationBlock, ReferenceBlock, ReturnBlock, TriggerBlock } from "./FlowPrimitives";
import { parseRoutineFlow } from "../../domain/routineFlow";
import { FlowConnections } from "./FlowConnections";
import { flowPortKey } from "./useFlowGeometry";

describe("standard flow primitives", () => {
  it("renders circular ports with stable endpoint attributes", () => {
    const register = vi.fn();
    render(<FlowPort nodeId="condition" port={{ id: "then", label: "THEN", color: "#f00" }} direction="output" onActivate={() => undefined} register={register}/>);
    const port = screen.getByRole("button", { name: "THEN" });
    expect(port).toHaveAttribute("data-node-id", "condition");
    expect(port).toHaveAttribute("data-port-id", "then");
    expect(port.querySelector("i")).toBeTruthy();
  });

  it("provides one shared contract for all seven primitive types", () => {
    const common = { id: "n", title: "Node", icon: "•", accent: "#fff", position: { x: 0, y: 0 }, width: 200 };
    const { container } = render(<>{[TriggerBlock, ConditionBlock, OperationBlock, ExceptionBlock, MergeBlock, ReturnBlock, ReferenceBlock].map((Block, index) => <Block key={index} {...common} id={`n${index}`}/>)}</>);
    expect(container.querySelectorAll(".standard-flow-block")).toHaveLength(7);
    expect(container.querySelectorAll('[data-flow-node]')).toHaveLength(7);
  });

  it("uses registered circular centers as exact connection endpoints", () => {
    const flow = parseRoutineFlow("r", "BEGIN\nRETURN NEW;\nEND;"); const edge = flow.edges[0];
    const centers = new Map([[flowPortKey(edge.sourceId, edge.sourcePortId, "output"), { x: 11, y: 22 }], [flowPortKey(edge.targetId, edge.targetPortId, "input"), { x: 333, y: 44 }]]);
    const positions = new Map(flow.nodes.map((node, index) => [node.id, { x: index * 400, y: 0 }]));
    const { container } = render(<FlowConnections flow={flow} positions={positions} focusedEdges={null} portCenters={centers}/>);
    const path = container.querySelector("path")?.getAttribute("d") ?? "";
    expect(path.startsWith("M11 22")).toBe(true);
    expect(path.endsWith(",333 44")).toBe(true);
  });
});
