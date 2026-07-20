import type { FlowPoint, FlowRect } from "../domain/flowGeometry";

export interface FlowRoute { kind: "curve"; points: FlowPoint[]; path: string }

const routeCache = new Map<string, FlowRoute>();
const MAX_CACHE_SIZE = 10_000;
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
function rounded(value: number): number { return Math.round(value * 10) / 10; }

function cacheKey(source: FlowPoint, target: FlowPoint, parallelIndex: number): string {
  return `${rounded(source.x)},${rounded(source.y)}:${rounded(target.x)},${rounded(target.y)}:${parallelIndex}`;
}

/**
 * Builds a compact local spline. Obstacles are deliberately ignored: crossings are
 * preferable to routes escaping to the graph boundary. The third argument remains
 * for API compatibility with existing canvas callers.
 */
export function routeFlowConnection(source: FlowPoint, target: FlowPoint, _obstacles: readonly FlowRect[] = [], parallelIndex = 0): FlowRoute {
  const key = cacheKey(source, target, parallelIndex); const cached = routeCache.get(key); if (cached) return cached;
  const dx = target.x - source.x; const dy = target.y - source.y; const distance = Math.hypot(dx, dy); const tangent = clamp(Math.abs(dx) * .42, 44, 150); const parallelOffset = [0, 10, -10, 20, -20][parallelIndex % 5];
  let path: string; let points: FlowPoint[];
  if (dx >= 80 && parallelOffset === 0) {
    const c1 = { x: source.x + tangent, y: source.y }; const c2 = { x: target.x - tangent, y: target.y };
    path = `M${source.x} ${source.y} C${c1.x} ${c1.y},${c2.x} ${c2.y},${target.x} ${target.y}`; points = [source, c1, c2, target];
  } else {
    const midpoint = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 + parallelOffset };
    const localTangent = clamp(distance * .2, 38, 110); const direction = dx >= 0 ? 1 : -1;
    const c1 = { x: source.x + localTangent, y: source.y }; const c2 = { x: midpoint.x - localTangent * direction, y: midpoint.y };
    const c3 = { x: midpoint.x + localTangent * direction, y: midpoint.y }; const c4 = { x: target.x - localTangent, y: target.y };
    path = `M${source.x} ${source.y} C${c1.x} ${c1.y},${c2.x} ${c2.y},${midpoint.x} ${midpoint.y} C${c3.x} ${c3.y},${c4.x} ${c4.y},${target.x} ${target.y}`; points = [source, c1, c2, midpoint, c3, c4, target];
  }
  const route = { kind: "curve" as const, points, path }; if (routeCache.size >= MAX_CACHE_SIZE) routeCache.clear(); routeCache.set(key, route); return route;
}

export function clearFlowRouteCache(): void { routeCache.clear(); }
export function flowRouteCacheSize(): number { return routeCache.size; }

export function parallelFlowEdgeIndexes<T extends { id: string; sourceId: string; targetId: string }>(edges: readonly T[]): Map<string, number> {
  const counts = new Map<string, number>(); const result = new Map<string, number>();
  edges.forEach((edge) => { const key = `${edge.sourceId}\0${edge.targetId}`; const index = counts.get(key) ?? 0; result.set(edge.id, index); counts.set(key, index + 1); });
  return result;
}
