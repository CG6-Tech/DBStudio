import type { AnchorSide, Point } from "./relationshipGeometry";

export interface RoutingObstacle { id: string; minX: number; minY: number; maxX: number; maxY: number }
export interface RoutingRequest { id: string; start: Point; end: Point; startSide: AnchorSide; endSide: AnchorSide; sourceId: string; targetId: string }

const PORT_CLEARANCE = 42;
const BEND_COST = 28;
const MAX_LOCAL_OBSTACLES = 40;

function direction(side: AnchorSide): number { return side === "right" ? 1 : -1; }
function uniqueSorted(values: number[]): number[] { return [...new Set(values)].sort((a, b) => a - b); }
function pointInside(point: Point, obstacle: RoutingObstacle): boolean {
  return point.x > obstacle.minX && point.x < obstacle.maxX && point.y > obstacle.minY && point.y < obstacle.maxY;
}
function segmentBlocked(a: Point, b: Point, obstacles: RoutingObstacle[]): boolean {
  if (a.x === b.x) {
    const low = Math.min(a.y, b.y), high = Math.max(a.y, b.y);
    return obstacles.some((item) => a.x > item.minX && a.x < item.maxX && high > item.minY && low < item.maxY);
  }
  const low = Math.min(a.x, b.x), high = Math.max(a.x, b.x);
  return obstacles.some((item) => a.y > item.minY && a.y < item.maxY && high > item.minX && low < item.maxX);
}

function fallback(request: RoutingRequest): Point[] {
  const startOut = { x: request.start.x + direction(request.startSide) * PORT_CLEARANCE, y: request.start.y };
  const endOut = { x: request.end.x + direction(request.endSide) * PORT_CLEARANCE, y: request.end.y };
  const middleX = (startOut.x + endOut.x) / 2;
  return simplify([request.start, startOut, { x: middleX, y: startOut.y }, { x: middleX, y: endOut.y }, endOut, request.end]);
}

function simplify(points: Point[]): Point[] {
  return points.filter((point, index) => {
    if (index > 0 && point.x === points[index - 1].x && point.y === points[index - 1].y) return false;
    if (index === 0 || index === points.length - 1) return true;
    const previous = points[index - 1], next = points[index + 1];
    return !((previous.x === point.x && point.x === next.x) || (previous.y === point.y && point.y === next.y));
  });
}

interface QueueItem { key: string; x: number; y: number; axis: 0 | 1 | 2; priority: number }
class MinHeap {
  values: QueueItem[] = [];
  push(value: QueueItem) { this.values.push(value); let i = this.values.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.values[p].priority <= value.priority) break; this.values[i] = this.values[p]; i = p; } this.values[i] = value; }
  pop(): QueueItem | undefined { const first = this.values[0], last = this.values.pop(); if (!first || !last || this.values.length === 0) return first; let i = 0; while (true) { const l = i * 2 + 1, r = l + 1; if (l >= this.values.length) break; const child = r < this.values.length && this.values[r].priority < this.values[l].priority ? r : l; if (this.values[child].priority >= last.priority) break; this.values[i] = this.values[child]; i = child; } this.values[i] = last; return first; }
}

export function routeOrthogonalAStar(request: RoutingRequest, allObstacles: RoutingObstacle[]): Point[] {
  const startOut = { x: request.start.x + direction(request.startSide) * PORT_CLEARANCE, y: request.start.y };
  const endOut = { x: request.end.x + direction(request.endSide) * PORT_CLEARANCE, y: request.end.y };
  const center = { x: (startOut.x + endOut.x) / 2, y: (startOut.y + endOut.y) / 2 };
  const obstacles = allObstacles.filter((item) => item.id !== request.sourceId && item.id !== request.targetId)
    .sort((a, b) => Math.hypot((a.minX + a.maxX) / 2 - center.x, (a.minY + a.maxY) / 2 - center.y) - Math.hypot((b.minX + b.maxX) / 2 - center.x, (b.minY + b.maxY) / 2 - center.y))
    .slice(0, MAX_LOCAL_OBSTACLES);
  const xs = uniqueSorted([startOut.x, endOut.x, ...obstacles.flatMap((item) => [item.minX, item.maxX])]);
  const ys = uniqueSorted([startOut.y, endOut.y, ...obstacles.flatMap((item) => [item.minY, item.maxY])]);
  const startX = xs.indexOf(startOut.x), startY = ys.indexOf(startOut.y), endX = xs.indexOf(endOut.x), endY = ys.indexOf(endOut.y);
  const key = (x: number, y: number, axis: number) => `${x}:${y}:${axis}`;
  const queue = new MinHeap();
  const startKey = key(startX, startY, 0);
  const costs = new Map([[startKey, 0]]);
  const previous = new Map<string, string>();
  const states = new Map<string, { x: number; y: number; axis: 0 | 1 | 2 }>([[startKey, { x: startX, y: startY, axis: 0 }]]);
  queue.push({ key: startKey, x: startX, y: startY, axis: 0, priority: 0 });
  let goalKey: string | null = null;
  while (queue.values.length > 0) {
    const current = queue.pop()!;
    if (current.x === endX && current.y === endY) { goalKey = current.key; break; }
    const currentPoint = { x: xs[current.x], y: ys[current.y] };
    const neighbors: Array<[number, number, 1 | 2]> = [[current.x - 1, current.y, 1], [current.x + 1, current.y, 1], [current.x, current.y - 1, 2], [current.x, current.y + 1, 2]];
    neighbors.forEach(([x, y, axis]) => {
      if (x < 0 || y < 0 || x >= xs.length || y >= ys.length) return;
      const point = { x: xs[x], y: ys[y] };
      if (obstacles.some((item) => pointInside(point, item)) || segmentBlocked(currentPoint, point, obstacles)) return;
      const nextKey = key(x, y, axis);
      const move = Math.abs(point.x - currentPoint.x) + Math.abs(point.y - currentPoint.y);
      const nextCost = (costs.get(current.key) ?? Infinity) + move + (current.axis !== 0 && current.axis !== axis ? BEND_COST : 0);
      if (nextCost >= (costs.get(nextKey) ?? Infinity)) return;
      costs.set(nextKey, nextCost); previous.set(nextKey, current.key); states.set(nextKey, { x, y, axis });
      queue.push({ key: nextKey, x, y, axis, priority: nextCost + Math.abs(point.x - endOut.x) + Math.abs(point.y - endOut.y) });
    });
  }
  if (!goalKey) return fallback(request);
  const routed: Point[] = [];
  for (let cursor: string | undefined = goalKey; cursor; cursor = previous.get(cursor)) { const state = states.get(cursor)!; routed.push({ x: xs[state.x], y: ys[state.y] }); }
  routed.reverse();
  return simplify([request.start, ...routed, request.end]);
}

export function inflateRoutingObstacles(items: Array<{ id: string; x: number; y: number; width: number; height: number }>, padding = 24): RoutingObstacle[] {
  return items.map((item) => ({ id: item.id, minX: item.x - padding, minY: item.y - padding, maxX: item.x + item.width + padding, maxY: item.y + item.height + padding }));
}

export function routeIntersectsObstacles(points: Point[], obstacles: RoutingObstacle[], excludedIds = new Set<string>()): boolean {
  const relevant = obstacles.filter((item) => !excludedIds.has(item.id));
  return points.slice(1).some((point, index) => segmentBlocked(points[index], point, relevant));
}
