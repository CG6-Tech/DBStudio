import type { LogicEdge, SchemaDocument } from "./types";

export type LogicGraphNodeKind = "table" | "trigger" | "routine" | "unresolved";
export interface LogicGraphPort { id: string; label: string; direction: "input" | "output"; edgeKind: LogicEdge["kind"]; }
export interface LogicGraphNode { id: string; kind: LogicGraphNodeKind; label: string; width: number; height: number; ports: LogicGraphPort[]; sourceId?: string; }
export interface LogicGraphEdge { id: string; kind: LogicEdge["kind"]; sourceId: string; sourcePortId: string; targetId: string; targetPortId: string; label: string; }
export interface LogicArrangementNode {
  id: string;
  laneIds: string[];
  sharedHub: boolean;
  semanticRank: number;
  componentId: string;
}

const logicRankSpacing = 380;
const logicLaneSpacing = 330;
const logicRowSpacing = 245;
const writeEdgeKinds = new Set<LogicEdge["kind"]>(["inserts", "updates", "deletes"]);

function unresolvedId(edge: LogicEdge): string { return `unresolved:${edge.kind}:${edge.unresolvedTarget?.schema ?? ""}.${edge.unresolvedTarget?.name ?? edge.id}`.toLocaleLowerCase("en"); }
function tableReplicaId(tableId: string, routineId: string, role: "read" | "write"): string { return `${tableId}:logic:${routineId}:${role}`; }
function routineTableKey(routineId: string, tableId: string): string { return `${routineId}\0${tableId}`; }

function estimateLogicNodeHeight(node: LogicGraphNode): number {
  const headerHeight = 52;
  const bodyHeight = node.kind === "trigger" ? 50 : 43;
  const portHeight = 25;
  const actionHeight = node.kind === "routine" ? 42 : 0;
  const visiblePorts = node.kind === "trigger" ? node.ports.filter((port) => port.edgeKind !== "table-event").length : node.ports.length;
  const measured = headerHeight + bodyHeight + visiblePorts * portHeight + actionHeight + 2;
  const minimum = node.kind === "routine" ? 164 : node.kind === "trigger" ? 127 : node.kind === "table" ? 124 : 122;
  return Math.max(minimum, measured);
}

export function projectLogicGraph(document: SchemaDocument): { nodes: LogicGraphNode[]; edges: LogicGraphEdge[] } {
  const sourceNodes = new Map<string, LogicGraphNode>();
  const tableById = new Map(document.tables.map((table) => [table.id, table]));
  const routineIds = new Set(document.routines.map((routine) => routine.id));
  const conflictingRoutineTables = new Set<string>();
  routineIds.forEach((routineId) => {
    const routineTableEdges = document.logicEdges.filter((edge) => edge.sourceId === routineId && edge.targetId && tableById.has(edge.targetId));
    const byTable = new Map<string, Set<LogicEdge["kind"]>>();
    routineTableEdges.forEach((edge) => byTable.set(edge.targetId!, new Set([...(byTable.get(edge.targetId!) ?? []), edge.kind])));
    byTable.forEach((kinds, tableId) => {
      if (kinds.has("reads") && [...kinds].some((kind) => writeEdgeKinds.has(kind))) conflictingRoutineTables.add(routineTableKey(routineId, tableId));
    });
  });
  const tableIds = new Set<string>();
  document.logicEdges.forEach((edge) => {
    if (tableById.has(edge.sourceId)) tableIds.add(edge.sourceId);
    if (edge.targetId && tableById.has(edge.targetId) && !conflictingRoutineTables.has(routineTableKey(edge.sourceId, edge.targetId))) tableIds.add(edge.targetId);
  });
  document.tables.filter((table) => tableIds.has(table.id)).forEach((table) => sourceNodes.set(table.id, { id: table.id, sourceId: table.id, kind: "table", label: table.schema ? `${table.schema}.${table.name}` : table.name, width: 250, height: 116, ports: [] }));
  conflictingRoutineTables.forEach((key) => {
    const [routineId, tableId] = key.split("\0");
    const table = tableById.get(tableId);
    if (!table) return;
    const label = table.schema ? `${table.schema}.${table.name}` : table.name;
    sourceNodes.set(tableReplicaId(table.id, routineId, "read"), { id: tableReplicaId(table.id, routineId, "read"), sourceId: table.id, kind: "table", label: `${label} · read`, width: 250, height: 116, ports: [] });
    sourceNodes.set(tableReplicaId(table.id, routineId, "write"), { id: tableReplicaId(table.id, routineId, "write"), sourceId: table.id, kind: "table", label: `${label} · write`, width: 250, height: 116, ports: [] });
  });
  document.triggers.forEach((trigger) => sourceNodes.set(trigger.id, { id: trigger.id, sourceId: trigger.id, kind: "trigger", label: trigger.schema ? `${trigger.schema}.${trigger.name}` : trigger.name, width: 260, height: 145, ports: [] }));
  document.routines.forEach((routine) => sourceNodes.set(routine.id, { id: routine.id, sourceId: routine.id, kind: "routine", label: routine.schema ? `${routine.schema}.${routine.name}` : routine.name, width: 270, height: 142, ports: [] }));
  const edges: LogicGraphEdge[] = [];
  document.logicEdges.forEach((edge) => {
    if (!sourceNodes.has(edge.sourceId)) return;
    const conflictKey = edge.targetId ? routineTableKey(edge.sourceId, edge.targetId) : "";
    const splitConflict = conflictingRoutineTables.has(conflictKey);
    const readReplicaId = edge.targetId ? tableReplicaId(edge.targetId, edge.sourceId, "read") : "";
    const writeReplicaId = edge.targetId ? tableReplicaId(edge.targetId, edge.sourceId, "write") : "";
    const unresolvedTargetId = edge.targetId ?? unresolvedId(edge);
    const sourceId = edge.sourceId;
    const targetId = splitConflict && edge.kind === "reads" ? readReplicaId : splitConflict && writeEdgeKinds.has(edge.kind) ? writeReplicaId : unresolvedTargetId;
    if (!sourceNodes.has(sourceId)) sourceNodes.set(sourceId, { id: sourceId, kind: "unresolved", label: edge.unresolvedTarget ? `${edge.unresolvedTarget.schema ? `${edge.unresolvedTarget.schema}.` : ""}${edge.unresolvedTarget.name}` : "Unresolved", width: 220, height: 88, ports: [] });
    if (!sourceNodes.has(targetId)) sourceNodes.set(targetId, { id: targetId, kind: "unresolved", label: edge.unresolvedTarget ? `${edge.unresolvedTarget.schema ? `${edge.unresolvedTarget.schema}.` : ""}${edge.unresolvedTarget.name}` : "Unresolved", width: 220, height: 88, ports: [] });
    const sourcePortId = `${edge.id}:out`;
    const targetPortId = `${edge.id}:in`;
    sourceNodes.get(sourceId)!.ports.push({ id: sourcePortId, label: edge.label, direction: "output", edgeKind: edge.kind });
    sourceNodes.get(targetId)!.ports.push({ id: targetPortId, label: edge.label, direction: "input", edgeKind: edge.kind });
    edges.push({ id: edge.id, kind: edge.kind, sourceId, sourcePortId, targetId, targetPortId, label: edge.label });
  });
  sourceNodes.forEach((node) => { node.height = estimateLogicNodeHeight(node); });
  return { nodes: [...sourceNodes.values()], edges };
}

export function analyzeLogicArrangement(nodes: readonly LogicGraphNode[], edges: readonly LogicGraphEdge[]): LogicArrangementNode[] {
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const incoming = new Map(nodes.map((node) => [node.id, [] as string[]]));
  edges.forEach((edge) => { outgoing.get(edge.sourceId)?.push(edge.targetId); incoming.get(edge.targetId)?.push(edge.sourceId); });
  const triggers = nodes.filter((node) => node.kind === "trigger").sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  const lanes = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  triggers.forEach((trigger) => {
    const visited = new Set<string>(); const queue = [trigger.id];
    while (queue.length) { const id = queue.shift()!; if (visited.has(id)) continue; visited.add(id); lanes.get(id)?.add(trigger.id); (outgoing.get(id) ?? []).sort().forEach((next) => queue.push(next)); }
    (incoming.get(trigger.id) ?? []).forEach((id) => { if (nodes.find((node) => node.id === id)?.kind === "table") lanes.get(id)?.add(trigger.id); });
  });
  const index = new Map<string, number>(); const low = new Map<string, number>(); const stack: string[] = []; const onStack = new Set<string>(); const component = new Map<string, string>(); let nextIndex = 0;
  const connect = (id: string) => { index.set(id, nextIndex); low.set(id, nextIndex++); stack.push(id); onStack.add(id); for (const target of outgoing.get(id) ?? []) { if (!index.has(target)) { connect(target); low.set(id, Math.min(low.get(id)!, low.get(target)!)); } else if (onStack.has(target)) low.set(id, Math.min(low.get(id)!, index.get(target)!)); } if (low.get(id) === index.get(id)) { const members: string[] = []; let member: string; do { member = stack.pop()!; onStack.delete(member); members.push(member); } while (member !== id); const componentId = members.sort()[0]; members.forEach((item) => component.set(item, componentId)); } };
  [...nodes].sort((a, b) => a.id.localeCompare(b.id)).forEach((node) => { if (!index.has(node.id)) connect(node.id); });
  const rank = new Map<string, number>(nodes.map((node) => [node.id, node.kind === "table" ? 0 : node.kind === "trigger" ? 1 : 2]));
  for (let pass = 0; pass < nodes.length; pass += 1) { let changed = false; edges.forEach((edge) => { if (component.get(edge.sourceId) === component.get(edge.targetId)) return; const value = Math.min(nodes.length + 1, (rank.get(edge.sourceId) ?? 0) + 1); if (value > (rank.get(edge.targetId) ?? 0)) { rank.set(edge.targetId, value); changed = true; } }); if (!changed) break; }
  return nodes.map((node) => ({ id: node.id, laneIds: [...(lanes.get(node.id) ?? [])].sort(), sharedHub: (lanes.get(node.id)?.size ?? 0) > 1, semanticRank: rank.get(node.id) ?? 0, componentId: component.get(node.id) ?? node.id }));
}

export function automaticLogicPositions(nodes: readonly LogicGraphNode[], edges: readonly LogicGraphEdge[]): Map<string, { x: number; y: number }> {
  const analysis = analyzeLogicArrangement(nodes, edges); const info = new Map(analysis.map((item) => [item.id, item]));
  const triggers = nodes.filter((node) => node.kind === "trigger").sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  const laneIndex = new Map(triggers.map((node, index) => [node.id, index])); const rankRows = new Map<string, number>();
  return new Map([...nodes].sort((a, b) => { const ai = info.get(a.id)!; const bi = info.get(b.id)!; const al = ai.laneIds.length ? ai.laneIds.reduce((sum, id) => sum + (laneIndex.get(id) ?? 0), 0) / ai.laneIds.length : triggers.length; const bl = bi.laneIds.length ? bi.laneIds.reduce((sum, id) => sum + (laneIndex.get(id) ?? 0), 0) / bi.laneIds.length : triggers.length; return al - bl || ai.semanticRank - bi.semanticRank || a.label.localeCompare(b.label) || a.id.localeCompare(b.id); }).map((node) => {
    const item = info.get(node.id)!; const lane = item.laneIds.length ? item.laneIds.reduce((sum, id) => sum + (laneIndex.get(id) ?? 0), 0) / item.laneIds.length : triggers.length;
    const key = `${item.semanticRank}:${lane}`; const row = rankRows.get(key) ?? 0; rankRows.set(key, row + 1);
    return [node.id, { x: 70 + item.semanticRank * logicRankSpacing, y: 70 + lane * logicLaneSpacing + row * logicRowSpacing }];
  }));
}

export function reconcileLogicPositions(automatic: ReadonlyMap<string, { x: number; y: number }>, saved: readonly { id: string; position: { x: number; y: number } }[] = []): Map<string, { x: number; y: number }> {
  const result = new Map(automatic);
  saved.forEach((item) => { if (result.has(item.id) && Number.isFinite(item.position.x) && Number.isFinite(item.position.y)) result.set(item.id, item.position); });
  return result;
}
