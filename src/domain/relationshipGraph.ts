import type { SchemaDocument } from "./types";

export interface RelationshipGraph {
  tableIdByOrdinal: string[];
  ordinalByTableId: Map<string, number>;
  outOffsets: Uint32Array;
  outNeighbors: Uint32Array;
  inOffsets: Uint32Array;
  inNeighbors: Uint32Array;
}

function csr(nodeCount: number, edges: Array<[number, number]>): { offsets: Uint32Array; neighbors: Uint32Array } {
  const offsets = new Uint32Array(nodeCount + 1);
  edges.forEach(([from]) => { offsets[from + 1] += 1; });
  for (let index = 1; index < offsets.length; index += 1) offsets[index] += offsets[index - 1];
  const cursor = offsets.slice();
  const neighbors = new Uint32Array(edges.length);
  edges.forEach(([from, to]) => { neighbors[cursor[from]++] = to; });
  return { offsets, neighbors };
}

export function buildRelationshipGraph(document: SchemaDocument): RelationshipGraph {
  const tableIdByOrdinal = document.tables.map((table) => table.id);
  const ordinalByTableId = new Map(tableIdByOrdinal.map((id, ordinal) => [id, ordinal]));
  const edges = document.relationships.flatMap((relationship): Array<[number, number]> => {
    const from = ordinalByTableId.get(relationship.sourceTableId);
    const to = ordinalByTableId.get(relationship.targetTableId);
    return from === undefined || to === undefined ? [] : [[from, to]];
  });
  const outgoing = csr(tableIdByOrdinal.length, edges);
  const incoming = csr(tableIdByOrdinal.length, edges.map(([from, to]) => [to, from]));
  return { tableIdByOrdinal, ordinalByTableId, outOffsets: outgoing.offsets, outNeighbors: outgoing.neighbors, inOffsets: incoming.offsets, inNeighbors: incoming.neighbors };
}

function neighbors(graph: RelationshipGraph, node: number, direction: "out" | "in"): Uint32Array {
  const offsets = direction === "out" ? graph.outOffsets : graph.inOffsets;
  const values = direction === "out" ? graph.outNeighbors : graph.inNeighbors;
  return values.subarray(offsets[node], offsets[node + 1]);
}

export function stronglyConnectedTableGroups(graph: RelationshipGraph): string[][] {
  const count = graph.tableIdByOrdinal.length;
  const index = new Int32Array(count).fill(-1);
  const low = new Int32Array(count);
  const onStack = new Uint8Array(count);
  const componentStack: number[] = [];
  const result: string[][] = [];
  let nextIndex = 0;
  type Frame = { node: number; edge: number; parent: number };
  for (let root = 0; root < count; root += 1) {
    if (index[root] >= 0) continue;
    const frames: Frame[] = [{ node: root, edge: 0, parent: -1 }];
    while (frames.length) {
      const frame = frames.at(-1)!;
      if (index[frame.node] < 0) {
        index[frame.node] = low[frame.node] = nextIndex++;
        componentStack.push(frame.node);
        onStack[frame.node] = 1;
      }
      const adjacent = neighbors(graph, frame.node, "out");
      if (frame.edge < adjacent.length) {
        const target = adjacent[frame.edge++];
        if (index[target] < 0) frames.push({ node: target, edge: 0, parent: frame.node });
        else if (onStack[target]) low[frame.node] = Math.min(low[frame.node], index[target]);
        continue;
      }
      frames.pop();
      if (frame.parent >= 0) low[frame.parent] = Math.min(low[frame.parent], low[frame.node]);
      if (low[frame.node] === index[frame.node]) {
        const group: string[] = [];
        while (componentStack.length) {
          const item = componentStack.pop()!;
          onStack[item] = 0;
          group.push(graph.tableIdByOrdinal[item]);
          if (item === frame.node) break;
        }
        if (group.length > 1 || [...neighbors(graph, frame.node, "out")].includes(frame.node)) result.push(group);
      }
    }
  }
  return result;
}

export function traverseTables(graph: RelationshipGraph, startTableId: string, direction: "out" | "in", maxDepth = Number.POSITIVE_INFINITY): string[] {
  const start = graph.ordinalByTableId.get(startTableId);
  if (start === undefined) return [];
  const visited = new Uint8Array(graph.tableIdByOrdinal.length);
  const queue = [start];
  const depth = [0];
  visited[start] = 1;
  const result: string[] = [];
  for (let head = 0; head < queue.length; head += 1) {
    if (depth[head] >= maxDepth) continue;
    for (const target of neighbors(graph, queue[head], direction)) {
      if (visited[target]) continue;
      visited[target] = 1;
      queue.push(target);
      depth.push(depth[head] + 1);
      result.push(graph.tableIdByOrdinal[target]);
    }
  }
  return result;
}

export function shortestTablePath(graph: RelationshipGraph, fromId: string, toId: string): string[] {
  const from = graph.ordinalByTableId.get(fromId);
  const to = graph.ordinalByTableId.get(toId);
  if (from === undefined || to === undefined) return [];
  if (from === to) return [fromId];
  const previous = new Int32Array(graph.tableIdByOrdinal.length).fill(-1);
  const visited = new Uint8Array(graph.tableIdByOrdinal.length);
  const queue = [from];
  visited[from] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head];
    const adjacent = [...neighbors(graph, node, "out"), ...neighbors(graph, node, "in")];
    for (const target of adjacent) {
      if (visited[target]) continue;
      visited[target] = 1;
      previous[target] = node;
      if (target === to) {
        const path = [to];
        while (path.at(-1) !== from) path.push(previous[path.at(-1)!]);
        return path.reverse().map((ordinal) => graph.tableIdByOrdinal[ordinal]);
      }
      queue.push(target);
    }
  }
  return [];
}
