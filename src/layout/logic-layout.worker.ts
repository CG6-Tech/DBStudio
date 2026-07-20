/// <reference lib="webworker" />
import { automaticLogicPositions, type LogicGraphEdge, type LogicGraphNode } from "../domain/logicGraph";
type Point = { x: number; y: number };
export interface LogicLayoutRequest { generation: number; nodes: LogicGraphNode[]; edges: LogicGraphEdge[]; pinned: Array<{ id: string; position: Point }> }
export interface LogicLayoutResponse { generation: number; positions: Array<{ id: string; position: Point }> }

const overlapGapX = 96;
const overlapGapY = 96;

function overlaps(a: Point, an: LogicGraphNode, b: Point, bn: LogicGraphNode): boolean {
  return a.x < b.x + bn.width + overlapGapX && a.x + an.width + overlapGapX > b.x && a.y < b.y + bn.height + overlapGapY && a.y + an.height + overlapGapY > b.y;
}

function resolveOverlaps(nodes: LogicGraphNode[], positions: Map<string, Point>, pinnedIds: Set<string>): void {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const placed: string[] = [];
  const ordered = [...nodes].sort((a, b) => {
    if (pinnedIds.has(a.id) !== pinnedIds.has(b.id)) return pinnedIds.has(a.id) ? -1 : 1;
    const ap = positions.get(a.id)!; const bp = positions.get(b.id)!;
    return ap.x - bp.x || ap.y - bp.y || a.id.localeCompare(b.id);
  });
  ordered.forEach((node) => {
    const point = positions.get(node.id)!;
    if (!pinnedIds.has(node.id)) {
      let attempts = 0;
      while (attempts++ < 80) {
        const blockerId = placed.find((id) => overlaps(point, node, positions.get(id)!, nodeById.get(id)!));
        if (!blockerId) break;
        const blocker = nodeById.get(blockerId)!;
        const blockerPoint = positions.get(blockerId)!;
        point.y = blockerPoint.y + blocker.height + overlapGapY;
      }
    }
    placed.push(node.id);
  });
}

self.onmessage = (event: MessageEvent<LogicLayoutRequest>) => {
  const { generation, nodes, edges, pinned } = event.data;
  const positions = automaticLogicPositions(nodes, edges);
  const pinnedMap = new Map(pinned.map((item) => [item.id, item.position]));
  pinnedMap.forEach((point, id) => positions.set(id, point));
  resolveOverlaps(nodes, positions, new Set(pinnedMap.keys()));
  self.postMessage({ generation, positions: nodes.map((node) => ({ id: node.id, position: positions.get(node.id)! })) } satisfies LogicLayoutResponse);
};
