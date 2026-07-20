import { describe, expect, it } from "vitest";
import { analyzeLogicArrangement, automaticLogicPositions, projectLogicGraph, reconcileLogicPositions, type LogicGraphEdge, type LogicGraphNode } from "./logicGraph";
import { parseSchema } from "./parser";

describe("Logic graph projection", () => {
  it("creates semantic ports and unresolved blocks", () => {
    const document = parseSchema("CREATE TABLE t(id bigint); CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO missing VALUES (1); RETURN NEW; END; $$; CREATE TRIGGER tr AFTER INSERT ON t EXECUTE FUNCTION f();");
    const graph = projectLogicGraph(document);
    expect(graph.nodes.some((node) => node.kind === "unresolved" && node.label === "missing")).toBe(true);
    expect(graph.edges.map((edge) => edge.kind)).toEqual(expect.arrayContaining(["table-event", "executes", "inserts"]));
    expect(graph.nodes.find((node) => node.kind === "trigger")?.ports.length).toBe(2);
  });

  it("splits a table into read and write blocks when one routine reads and writes it", () => {
    const document = parseSchema("CREATE TABLE inventory(id bigint, count int); CREATE PROCEDURE apply_inventory() LANGUAGE plpgsql AS $$ BEGIN SELECT count FROM inventory WHERE id = 1; UPDATE inventory SET count = count - 1 WHERE id = 1; END; $$;");
    const graph = projectLogicGraph(document);
    const inventoryNodes = graph.nodes.filter((node) => node.kind === "table" && node.label.startsWith("inventory"));
    expect(inventoryNodes.map((node) => node.label).sort()).toEqual(["inventory · read", "inventory · write"]);
    const readEdge = graph.edges.find((edge) => edge.kind === "reads");
    const updateEdge = graph.edges.find((edge) => edge.kind === "updates");
    expect(graph.nodes.find((node) => node.id === readEdge?.sourceId)?.kind).toBe("routine");
    expect(graph.nodes.find((node) => node.id === readEdge?.targetId)?.label).toBe("inventory · read");
    expect(graph.nodes.find((node) => node.id === updateEdge?.sourceId)?.kind).toBe("routine");
    expect(graph.nodes.find((node) => node.id === updateEdge?.targetId)?.label).toBe("inventory · write");
  });

  it("routes routine reads out to tables consistently", () => {
    const document = parseSchema("CREATE TABLE products(id bigint); CREATE FUNCTION load_products() RETURNS int LANGUAGE plpgsql AS $$ BEGIN SELECT id FROM products; RETURN 1; END; $$;");
    const graph = projectLogicGraph(document);
    const readEdge = graph.edges.find((edge) => edge.kind === "reads");
    expect(graph.nodes.find((node) => node.id === readEdge?.sourceId)?.kind).toBe("routine");
    expect(graph.nodes.find((node) => node.id === readEdge?.targetId)?.kind).toBe("table");
  });

  it("reconciles valid saved positions and ignores invalid or stale entries", () => {
    const nodes = [{ id: "a", kind: "table" as const, label: "a", width: 1, height: 1, ports: [] }];
    const automatic = automaticLogicPositions(nodes, []);
    const positions = reconcileLogicPositions(automatic, [{ id: "a", position: { x: 9, y: 8 } }, { id: "stale", position: { x: 1, y: 1 } }]);
    expect(positions.get("a")).toEqual({ x: 9, y: 8 });
    expect(positions.has("stale")).toBe(false);
  });

  it("places a routine reached by multiple triggers in one shared hub", () => {
    const nodes: LogicGraphNode[] = [
      { id: "a", kind: "trigger", label: "A", width: 10, height: 10, ports: [] },
      { id: "b", kind: "trigger", label: "B", width: 10, height: 10, ports: [] },
      { id: "shared", kind: "routine", label: "Shared", width: 10, height: 10, ports: [] },
    ];
    const edges = [edge("a-shared", "a", "shared"), edge("b-shared", "b", "shared")];
    const shared = analyzeLogicArrangement(nodes, edges).find((node) => node.id === "shared");
    expect(shared).toMatchObject({ sharedHub: true, laneIds: ["a", "b"] });
    expect(automaticLogicPositions(nodes, edges).get("shared")?.y).toBe(235);
  });

  it("keeps cycles in one component and returns deterministic finite positions", () => {
    const nodes: LogicGraphNode[] = [
      { id: "trigger", kind: "trigger", label: "Trigger", width: 10, height: 10, ports: [] },
      { id: "one", kind: "routine", label: "One", width: 10, height: 10, ports: [] },
      { id: "two", kind: "routine", label: "Two", width: 10, height: 10, ports: [] },
    ];
    const edges = [edge("start", "trigger", "one"), edge("forward", "one", "two"), edge("back", "two", "one")];
    const analysis = analyzeLogicArrangement(nodes, edges);
    expect(analysis.find((node) => node.id === "one")?.componentId).toBe(analysis.find((node) => node.id === "two")?.componentId);
    expect([...automaticLogicPositions(nodes, edges)]).toEqual([...automaticLogicPositions([...nodes].reverse(), [...edges].reverse())]);
    expect([...automaticLogicPositions(nodes, edges).values()].every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  });
});

function edge(id: string, sourceId: string, targetId: string): LogicGraphEdge {
  return { id, sourceId, targetId, sourcePortId: `${id}:out`, targetPortId: `${id}:in`, kind: "calls", label: "calls" };
}
