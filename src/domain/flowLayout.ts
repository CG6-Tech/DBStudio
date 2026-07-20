import { FLOW_NODE_WIDTH, flowNodeHeight } from "./flowGeometry";
import type { RoutineFlow } from "./routineFlow";

export function layoutRoutineFlow(flow: RoutineFlow, origin = { x: 70, y: 100 }): Map<string, { x: number; y: number }> {
  const rank = new Map<string, number>(); const incoming = new Map(flow.nodes.map((node) => [node.id, 0]));
  flow.edges.forEach((edge) => incoming.set(edge.targetId, (incoming.get(edge.targetId) ?? 0) + 1)); const queue = flow.nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id); queue.forEach((id) => rank.set(id, 0));
  while (queue.length) { const id = queue.shift()!; flow.edges.filter((edge) => edge.sourceId === id).forEach((edge) => { rank.set(edge.targetId, Math.max(rank.get(edge.targetId) ?? 0, (rank.get(id) ?? 0) + 1)); incoming.set(edge.targetId, (incoming.get(edge.targetId) ?? 1) - 1); if (incoming.get(edge.targetId) === 0) queue.push(edge.targetId); }); }
  const nextY = new Map<number, number>(); return new Map([...flow.nodes].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0) || a.id.localeCompare(b.id)).map((node) => { const column = rank.get(node.id) ?? 0; const y = nextY.get(column) ?? origin.y; nextY.set(column, y + flowNodeHeight(node) + 90); return [node.id, { x: origin.x + column * (FLOW_NODE_WIDTH + 170), y }]; }));
}
