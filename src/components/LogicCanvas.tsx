import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { LayoutDashboard, Map as MapIcon, RefreshCcw } from "lucide-react";
import { automaticLogicPositions, projectLogicGraph, reconcileLogicPositions, type LogicGraphNode } from "../domain/logicGraph";
import type { DatabaseTrigger, Routine, SchemaDocument, Table } from "../domain/types";
import { MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM } from "../domain/viewportGeometry";
import type { LogicLayoutRequest, LogicLayoutResponse } from "../layout/logic-layout.worker";
import { useUiStore } from "../state/uiStore";
import { LogicFlowBlock } from "./flow/LogicFlowBlock";
import { flowPortKey, useFlowGeometry } from "./flow/useFlowGeometry";
import { parallelFlowEdgeIndexes, routeFlowConnection } from "../layout/flowRouting";
import { CanvasControlToolbar } from "./CanvasToolbar";
import type { CanvasViewport } from "./canvas/canvasViewport";
import { useCanvasKeyboardZoom } from "./canvas/useCanvasKeyboardZoom";
import { useCanvasViewport } from "./canvas/useCanvasViewport";
import { LogicGraphHeader, LogicGraphMinimap, LogicInspector, logicGraphBounds } from "./logic/LogicGraphChrome";
import { logicEdgeColor } from "./logic/logicUi";

type Point = { x: number; y: number };
type Viewport = CanvasViewport;

function portY(node: LogicGraphNode, portId: string): number { const ports = node.ports.filter((port) => port.direction === (portId.endsWith(":out") ? "output" : "input")); return 70 + Math.max(0, ports.findIndex((port) => port.id === portId)) * 25; }

export function LogicCanvas({ document, onLayoutChange }: { document: SchemaDocument; onLayoutChange: (layout: NonNullable<SchemaDocument["logicLayout"]>) => void }) {
  const selectedId = useUiStore((state) => state.logicSelectionId);
  const setSelected = useUiStore((state) => state.setLogicSelection);
  const openFlow = useUiStore((state) => state.openRoutineFlow);
  const setZoom = useUiStore((state) => state.setZoom);
  const minimapVisible = useUiStore((state) => state.minimapVisible);
  const toggleMinimap = useUiStore((state) => state.toggleMinimap);
  const graph = useMemo(() => projectLogicGraph(document), [document.tables, document.triggers, document.routines, document.logicEdges]);
  const automatic = useMemo(() => automaticLogicPositions(graph.nodes, graph.edges), [graph]);
  const [positions, setPositions] = useState(() => reconcileLogicPositions(automatic, document.logicLayout?.nodes));
  const [pinned, setPinned] = useState(() => new Set(document.logicLayout?.nodes.filter((node) => node.pinned).map((node) => node.id) ?? []));
  const [expandedRoutineId, setExpandedRoutineId] = useState<string | null>(null);
  const positionsRef = useRef(positions);
  const graphStageRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(pinned);
  const layoutWorker = useRef<Worker | null>(null);
  const layoutGeneration = useRef(0);
  const layoutResponse = useRef<(event: MessageEvent<LogicLayoutResponse>) => void>(() => undefined);
  const layoutFailure = useRef<() => void>(() => undefined);
  const interaction = useRef<{ kind: "node"; id: string; startPointer: Point; start: Point } | { kind: "pan"; startPointer: Point; startViewport: Viewport } | null>(null);
  const canvas = useCanvasViewport({
    initialViewport: document.logicLayout?.viewport ?? { x: 20, y: 20, scale: .9 },
    onScaleChange: setZoom,
    onViewportCommit: (nextViewport) => onLayoutChange({ nodes: [...positionsRef.current].map(([id, position]) => ({ id, position, pinned: pinnedRef.current.has(id) || undefined })), viewport: nextViewport, algorithmVersion: 2 }),
  });
  const persist = (nextPositions = positionsRef.current, nextViewport = canvas.viewportRef.current, nextPinned = pinnedRef.current) => onLayoutChange({ nodes: [...nextPositions].map(([id, position]) => ({ id, position, pinned: nextPinned.has(id) || undefined })), viewport: nextViewport, algorithmVersion: 2 });
  const { viewport, viewportRef } = canvas;
  const geometry = useFlowGeometry(graphStageRef, positions, viewport.scale);
  useEffect(() => { const next = reconcileLogicPositions(automatic, document.logicLayout?.nodes); positionsRef.current = next; setPositions(next); const nextPinned = new Set(document.logicLayout?.nodes.filter((node) => node.pinned).map((node) => node.id) ?? []); pinnedRef.current = nextPinned; setPinned(nextPinned); }, [automatic]);
  useEffect(() => {
    const worker = new Worker(new URL("../layout/logic-layout.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<LogicLayoutResponse>) => layoutResponse.current(event);
    worker.onerror = () => layoutFailure.current();
    layoutWorker.current = worker;
    return () => { layoutWorker.current = null; worker.terminate(); };
  }, []);
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const logicObstacles = useMemo(() => graph.nodes.map((node) => { const point = positions.get(node.id) ?? { x: 0, y: 0 }; return { id: node.id, x: point.x, y: point.y, width: node.width, height: node.height }; }), [graph.nodes, positions]);
  const logicParallelIndexes = useMemo(() => parallelFlowEdgeIndexes(graph.edges), [graph.edges]);
  const sourceById = useMemo(() => new Map<string, Table | DatabaseTrigger | Routine>([...document.tables, ...document.triggers, ...document.routines].map((item) => [item.id, item])), [document.tables, document.triggers, document.routines]);
  const connected = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const result = new Set([selectedId]); let changed = true;
    while (changed) { changed = false; graph.edges.forEach((edge) => { if ((result.has(edge.sourceId) || result.has(edge.targetId)) && (!result.has(edge.sourceId) || !result.has(edge.targetId))) { result.add(edge.sourceId); result.add(edge.targetId); changed = true; } }); }
    return result;
  }, [graph.edges, selectedId]);
  const graphBounds = useMemo(() => logicGraphBounds(graph.nodes, positions), [graph.nodes, positions]);
  const centerOnMinimap = (point: { x: number; y: number }) => {
    const host = canvas.hostRef.current?.getBoundingClientRect();
    if (!host) return;
    canvas.setViewportNow({ ...viewportRef.current, x: host.width / 2 - point.x * viewportRef.current.scale, y: host.height / 2 - point.y * viewportRef.current.scale }, true);
  };
  const fit = () => {
    const rect = canvas.hostRef.current?.getBoundingClientRect(); if (!rect || graph.nodes.length === 0) return;
    const bounds = graph.nodes.reduce((value, node) => { const p = positions.get(node.id) ?? { x: 0, y: 0 }; return { minX: Math.min(value.minX, p.x), minY: Math.min(value.minY, p.y), maxX: Math.max(value.maxX, p.x + node.width), maxY: Math.max(value.maxY, p.y + node.height) }; }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const scale = Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, Math.min((rect.width - 100) / (bounds.maxX - bounds.minX), (rect.height - 100) / (bounds.maxY - bounds.minY))));
    const next = { scale, x: (rect.width - (bounds.maxX - bounds.minX) * scale) / 2 - bounds.minX * scale, y: (rect.height - (bounds.maxY - bounds.minY) * scale) / 2 - bounds.minY * scale };
    canvas.setViewportNow(next, true);
  };
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => { if ((event.target as HTMLElement).closest(".standard-flow-block, .logic-block, .logic-graph-header, .canvas-toolbar-wrap, .logic-graph-minimap, .logic-inspector")) return; interaction.current = { kind: "pan", ...canvas.beginPan(event) }; };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => { const current = interaction.current; if (!current) return; if (current.kind === "pan") { canvas.panFrom(current.startViewport, current.startPointer, { x: event.clientX, y: event.clientY }); } else { const next = new Map(positionsRef.current).set(current.id, { x: current.start.x + (event.clientX - current.startPointer.x) / viewportRef.current.scale, y: current.start.y + (event.clientY - current.startPointer.y) / viewportRef.current.scale }); positionsRef.current = next; setPositions(next); } };
  const pointerUp = () => { if (!interaction.current) return; if (interaction.current.kind === "node") { const nextPinned = new Set(pinnedRef.current).add(interaction.current.id); pinnedRef.current = nextPinned; setPinned(nextPinned); } interaction.current = null; persist(); };
  const zoomBy = canvas.zoomBy;
  useCanvasKeyboardZoom({ zoomBy, fit });
  const startNodeDrag = (event: ReactPointerEvent, id: string) => { event.stopPropagation(); const start = positions.get(id) ?? { x: 0, y: 0 }; interaction.current = { kind: "node", id, startPointer: { x: event.clientX, y: event.clientY }, start }; event.currentTarget.setPointerCapture(event.pointerId); };
  const arrange = (clearPins = false) => {
    if (clearPins && !window.confirm("Arrange all nodes and remove every pin?")) return;
    const nextPinned = clearPins ? new Set<string>() : pinnedRef.current; pinnedRef.current = nextPinned; setPinned(nextPinned);
    const generation = ++layoutGeneration.current;
    layoutResponse.current = (event) => { if (event.data.generation !== layoutGeneration.current) return; const next = new Map(event.data.positions.map((item) => [item.id, item.position])); positionsRef.current = next; setPositions(next); persist(next, viewportRef.current, nextPinned); };
    layoutFailure.current = () => { const next = new Map(automatic); nextPinned.forEach((id) => { const point = positionsRef.current.get(id); if (point) next.set(id, point); }); positionsRef.current = next; setPositions(next); persist(next, viewportRef.current, nextPinned); };
    layoutWorker.current?.postMessage({ generation, nodes: graph.nodes, edges: graph.edges, pinned: [...nextPinned].flatMap((id) => { const position = positionsRef.current.get(id); return position ? [{ id, position }] : []; }) } satisfies LogicLayoutRequest);
  };
  const togglePin = (id: string) => { const next = new Set(pinnedRef.current); next.has(id) ? next.delete(id) : next.add(id); pinnedRef.current = next; setPinned(next); persist(positionsRef.current, viewportRef.current, next); };
  const selectedNode = selectedId ? nodeById.get(selectedId) : undefined;
  const selectedSource = selectedId ? sourceById.get(selectedId) : undefined;
  const animateSelectedPaths = selectedNode?.kind === "trigger" || selectedNode?.kind === "routine";
  if (document.triggers.length + document.routines.length === 0) return <div className="logic-empty"><span>⌁</span><h2>No database logic found</h2><p>Open SQL containing supported triggers, functions, or procedures to build a Logic graph.</p></div>;
  return <div className="logic-canvas-v2 canvas-shell" ref={canvas.hostRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
    <div className="canvas-hint">Drag to pan · Two-finger pan · Pinch to zoom · Drag block headers to move</div>
    <LogicGraphHeader nodes={graph.nodes.length} edges={graph.edges.length} pinned={pinned.size} />
    <div ref={graphStageRef} className="logic-graph-stage" style={{ transform: `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.scale})` }}>
      <svg width="4000" height="3000">{graph.edges.map((edge) => { const from = nodeById.get(edge.sourceId)!; const to = nodeById.get(edge.targetId)!; const a = positions.get(from.id) ?? { x: 0, y: 0 }; const b = positions.get(to.id) ?? { x: 0, y: 0 }; const measuredStart = geometry.centers.get(flowPortKey(from.id, edge.sourcePortId, "output")); const measuredEnd = geometry.centers.get(flowPortKey(to.id, edge.targetPortId, "input")); const start = measuredStart ?? { x: a.x + from.width, y: a.y + portY(from, edge.sourcePortId) }; const end = measuredEnd ?? { x: b.x, y: b.y + portY(to, edge.targetPortId) }; const route = routeFlowConnection(start, end, logicObstacles, logicParallelIndexes.get(edge.id) ?? 0); const active = !selectedId || (connected.has(from.id) && connected.has(to.id)); const animated = animateSelectedPaths && active; return <g key={edge.id} opacity={active ? 1 : .12}><path className={`logic-flow-path ${edge.kind}${animated ? " animated" : ""}`} d={route.path} fill="none" stroke={logicEdgeColor(edge.kind)} strokeWidth={animated ? "2.4" : "2"}/></g>; })}</svg>
      {graph.nodes.map((node) => <LogicFlowBlock key={node.id} node={node} source={node.sourceId ? sourceById.get(node.sourceId) : undefined} position={positions.get(node.id) ?? { x: 0, y: 0 }} selected={selectedId === node.id} dimmed={Boolean(selectedId && !connected.has(node.id))} pinned={pinned.has(node.id)} expanded={expandedRoutineId === node.id} edgeColor={logicEdgeColor} onSelect={() => setSelected(node.id)} onDoubleClick={() => { if (node.kind === "routine") setExpandedRoutineId((id) => id === node.id ? null : node.id); }} onDragStart={startNodeDrag} onExpand={() => setExpandedRoutineId((id) => id === node.id ? null : node.id)} onOpenFlow={() => openFlow(node.id)} registerPort={geometry.registerPort}/>)}
    </div>
    <CanvasControlToolbar label="Logic canvas controls" zoom={viewport.scale} onZoomOut={() => zoomBy(-0.1)} onZoomIn={() => zoomBy(0.1)} onFit={fit} actions={[
      { title: "Arrange", onClick: () => arrange(false), icon: <LayoutDashboard size={17} /> },
      { title: "Arrange all", onClick: () => arrange(true), icon: <RefreshCcw size={16} /> },
      { title: "Toggle minimap", onClick: toggleMinimap, pressed: minimapVisible, icon: <MapIcon size={17} /> },
    ]} />
    {minimapVisible && <LogicGraphMinimap nodes={graph.nodes} positions={positions} bounds={graphBounds} viewport={viewport} host={canvas.hostRef.current} onCenter={centerOnMinimap} />}
    {selectedNode && <LogicInspector node={selectedNode} source={selectedSource} dialect={document.dialect} pinned={pinned.has(selectedNode.id)} onClose={() => setSelected(null)} onTogglePin={() => togglePin(selectedNode.id)} onOpenFlow={() => openFlow(selectedNode.id)} />}
  </div>;
}
