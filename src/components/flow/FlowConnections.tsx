import type { CSSProperties } from "react";
import { FLOW_NODE_WIDTH, flowInputOffset, flowNodeHeight, flowOutputOffset, flowPortColor } from "../../domain/flowGeometry";
import type { RoutineFlow, RoutineFlowPortType } from "../../domain/routineFlow";
import { parallelFlowEdgeIndexes, routeFlowConnection } from "../../layout/flowRouting";
import { flowPortKey } from "./useFlowGeometry";

function edgeClass(type: RoutineFlowPortType): string {
  return type === "error" ? "error" : type === "branch" ? "branch" : type === "data" || type === "result" ? "data" : "control";
}

export function FlowConnections({ flow, positions, focusedEdges, animationOrder, portCenters }: { flow: RoutineFlow; positions: ReadonlyMap<string, { x: number; y: number }>; focusedEdges: Set<string> | null; animationOrder?: ReadonlyMap<string, number> | null; portCenters?: ReadonlyMap<string, { x: number; y: number }> }) {
  const nodes = new Map(flow.nodes.map((node) => [node.id, node]));
  const parallelIndexes = parallelFlowEdgeIndexes(flow.edges);
  const obstacles = flow.nodes.map((node) => { const point = positions.get(node.id)!; return { id: node.id, x: point.x, y: point.y, width: FLOW_NODE_WIDTH, height: flowNodeHeight(node) }; });
  return <svg className="postman-flow-connections" width="4200" height="2800">{flow.edges.map((edge) => {
    const sourceNode = nodes.get(edge.sourceId)!; const targetNode = nodes.get(edge.targetId)!; const sourcePosition = positions.get(edge.sourceId)!; const targetPosition = positions.get(edge.targetId)!;
    const sourceIndex = Math.max(0, sourceNode.outputs.findIndex((port) => port.id === edge.sourcePortId)); const targetIndex = Math.max(0, targetNode.inputs.findIndex((port) => port.id === edge.targetPortId));
    const so = flowOutputOffset(sourceNode, sourceIndex); const to = flowInputOffset(targetNode, targetIndex); const source = portCenters?.get(flowPortKey(sourceNode.id, edge.sourcePortId, "output")) ?? { x: sourcePosition.x + so.x, y: sourcePosition.y + so.y }; const target = portCenters?.get(flowPortKey(targetNode.id, edge.targetPortId, "input")) ?? { x: targetPosition.x + to.x, y: targetPosition.y + to.y };
    const route = routeFlowConnection(source, target, obstacles, parallelIndexes.get(edge.id) ?? 0); const active = !focusedEdges || focusedEdges.has(edge.id); const port = sourceNode.outputs[sourceIndex]; const type = port?.type ?? "control"; const animationIndex = animationOrder?.get(edge.id); const animated = animationIndex !== undefined;
    const style = animated ? { "--flow-animation-delay": `${Math.min(animationIndex * 140, 2800)}ms` } as CSSProperties : undefined;
    return <path key={edge.id} className={`logic-flow-path routine-flow-path ${edgeClass(type)}${animated ? " animated" : ""}`} style={style} d={route.path} fill="none" stroke={flowPortColor(type)} strokeWidth={animated ? 2.4 : 2} opacity={active ? 1 : .12} strokeLinecap="round" strokeLinejoin="round"/>;
  })}</svg>;
}

export function reachableFlow(flow: RoutineFlow, nodeId: string, portId: string): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>([nodeId]); const edges = new Set<string>(); const queue = flow.edges.filter((edge) => edge.sourceId === nodeId && edge.sourcePortId === portId);
  while (queue.length) { const edge = queue.shift()!; if (edges.has(edge.id)) continue; edges.add(edge.id); nodes.add(edge.targetId); flow.edges.filter((item) => item.sourceId === edge.targetId).forEach((item) => queue.push(item)); }
  return { nodes, edges };
}

export function flowAnimationOrder(flow: RoutineFlow, nodeId: string, portId?: string): Map<string, number> {
  const nodesById = new Map(flow.nodes.map((node) => [node.id, node]));
  const first = flow.edges.filter((edge) => edge.sourceId === nodeId && (!portId || edge.sourcePortId === portId));
  const reachableEdges = new Map<string, (typeof flow.edges)[number]>();
  const queue = [...first];
  while (queue.length) {
    const edge = queue.shift()!;
    if (reachableEdges.has(edge.id)) continue;
    reachableEdges.set(edge.id, edge);
    flow.edges.filter((candidate) => candidate.sourceId === edge.targetId).forEach((candidate) => queue.push(candidate));
  }
  const ranks = new Map<string, number>([[nodeId, 0]]);
  for (let pass = 0; pass < flow.nodes.length; pass += 1) {
    let changed = false;
    reachableEdges.forEach((edge) => {
      const sourceRank = ranks.get(edge.sourceId);
      if (sourceRank === undefined) return;
      const nextRank = sourceRank + 1;
      if (nextRank > (ranks.get(edge.targetId) ?? -1)) { ranks.set(edge.targetId, nextRank); changed = true; }
    });
    if (!changed) break;
  }
  const ordered = [...reachableEdges.values()].sort((left, right) => {
    const rankDifference = (ranks.get(left.sourceId) ?? 0) - (ranks.get(right.sourceId) ?? 0);
    if (rankDifference) return rankDifference;
    const leftNode = nodesById.get(left.sourceId); const rightNode = nodesById.get(right.sourceId);
    const sourceDifference = (leftNode?.range.start ?? 0) - (rightNode?.range.start ?? 0);
    if (sourceDifference) return sourceDifference;
    const portDifference = (leftNode?.outputs.findIndex((port) => port.id === left.sourcePortId) ?? 0) - (rightNode?.outputs.findIndex((port) => port.id === right.sourcePortId) ?? 0);
    if (portDifference) return portDifference;
    const targetDifference = (nodesById.get(left.targetId)?.range.start ?? 0) - (nodesById.get(right.targetId)?.range.start ?? 0);
    return targetDifference || left.id.localeCompare(right.id);
  });
  return new Map(ordered.map((edge, index) => [edge.id, index]));
}
