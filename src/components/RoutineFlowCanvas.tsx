import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, CheckCircle2, Code2, LayoutDashboard, Map as MapIcon, Pin, PinOff, RefreshCcw } from "lucide-react";
import { FLOW_NODE_WIDTH, flowNodeHeight } from "../domain/flowGeometry";
import { layoutRoutineFlow } from "../domain/flowLayout";
import { parseRoutineFlow } from "../domain/routineFlow";
import type { RoutineFlow, RoutineFlowNode } from "../domain/routineFlow";
import type { SchemaDocument, SqlDialect } from "../domain/types";
import { MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM } from "../domain/viewportGeometry";
import { useUiStore } from "../state/uiStore";
import { CanvasControlToolbar } from "./CanvasToolbar";
import { boundsForNodes, CanvasMinimap } from "./canvas/CanvasMinimap";
import type { CanvasViewport } from "./canvas/canvasViewport";
import { useCanvasKeyboardZoom } from "./canvas/useCanvasKeyboardZoom";
import { useCanvasViewport } from "./canvas/useCanvasViewport";
import { FlowBlock } from "./flow/FlowBlock";
import { FlowConnections, flowAnimationOrder, reachableFlow } from "./flow/FlowConnections";
import { RoutineFlowNodeIcon } from "./flow/RoutineFlowIcons";
import { useFlowGeometry } from "./flow/useFlowGeometry";
import { InspectorActions, InspectorMeta, InspectorMetaRow, InspectorSection, InspectorShell, InspectorTitle } from "./ui/InspectorPrimitives";
import { SqlText } from "./ui/SqlText";
import { ExplainSection } from "./ai/ExplainSection";

const cache = new Map<string, ReturnType<typeof parseRoutineFlow>>();
const ROUTINE_FLOW_ALGORITHM_VERSION = 10;
function cachedFlow(routineId: string, body: string) { const key = `${ROUTINE_FLOW_ALGORITHM_VERSION}\0${routineId}\0${body}`; const prior = cache.get(key); if (prior) return prior; const next = parseRoutineFlow(routineId, body); cache.set(key, next); return next; }
type Point = { x: number; y: number };

function routineFlowConnected(flow: RoutineFlow, nodeId: string): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>([nodeId]);
  const edges = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    flow.edges.forEach((edge) => {
      if ((nodes.has(edge.sourceId) || nodes.has(edge.targetId)) && (!nodes.has(edge.sourceId) || !nodes.has(edge.targetId))) {
        nodes.add(edge.sourceId);
        nodes.add(edge.targetId);
        edges.add(edge.id);
        changed = true;
      } else if (nodes.has(edge.sourceId) && nodes.has(edge.targetId)) {
        edges.add(edge.id);
      }
    });
  }
  return { nodes, edges };
}

function RoutineFlowInspector({ node, dialect, routineName, pinned, onClose, onTogglePin }: { node: RoutineFlowNode; dialect: SqlDialect; routineName: string; pinned: boolean; onClose: () => void; onTogglePin: () => void }) {
  const source = node.source || "Generated branch merge";
  return <InspectorShell className="routine-flow-inspector" onClose={onClose}>
    <InspectorTitle className={`routine-node-title ${node.kind}`} icon={<RoutineFlowNodeIcon kind={node.kind} />} eyebrow={node.kind.toUpperCase()} title={node.title} />
    <InspectorActions>
      <button onClick={onTogglePin}>{pinned ? <PinOff size={14} /> : <Pin size={14} />}{pinned ? "Unpin position" : "Pin position"}</button>
      {node.kind !== "raise" && <button disabled><CheckCircle2 size={14} />Parsed block</button>}
    </InspectorActions>
    <InspectorSection title="Details">
      <InspectorMeta>
        <InspectorMetaRow label="Inputs" value={node.inputs.length} />
        <InspectorMetaRow label="Outputs" value={node.outputs.length} />
        {node.source && <InspectorMetaRow label="Source" value={`${node.range.start}-${node.range.end}`} />}
        {node.details?.errcode && <InspectorMetaRow label="Errcode" value={node.details.errcode} />}
      </InspectorMeta>
    </InspectorSection>
    {node.details?.merge && <InspectorSection title="Variable handoff">
      <div className="routine-merge-inspector">
        {node.details.merge.rows.map((row) => <div className="routine-merge-inspector-row" key={row.inputId}><b className="select-kind-chip variable">{row.label}</b><code title={row.detail}>{row.detail}</code></div>)}
        {node.details.merge.consumer && <div className="routine-merge-inspector-target"><span>used as</span><strong>{node.details.merge.consumer}</strong></div>}
      </div>
    </InspectorSection>}
    {!node.details?.merge && <InspectorSection className="sql">
      <button className="logic-inspector-sql-toggle" aria-expanded="true"><Code2 size={13} /><strong>SQL statement</strong></button>
      <SqlText sql={source} />
    </InspectorSection>}
    <ExplainSection targetId={`flow-node:${routineName}:${node.id}`} input={{ kind: "flow-node", dialect, routineName, node }} />
  </InspectorShell>;
}

function routineMinimapNodes(nodes: readonly RoutineFlowNode[], positions: ReadonlyMap<string, { x: number; y: number }>) {
  return nodes.map((node) => {
    const p = positions.get(node.id) ?? { x: 0, y: 0 };
    return { id: node.id, className: node.kind, x: p.x, y: p.y, width: FLOW_NODE_WIDTH, height: flowNodeHeight(node) };
  });
}

export function RoutineFlowCanvas({ document, routineId, onLayoutChange }: { document: SchemaDocument; routineId: string; onLayoutChange: (layout: NonNullable<SchemaDocument["routineFlowLayouts"]>[string]) => void }) {
  const routine = document.routines.find((item) => item.id === routineId); const closeFlow = useUiStore((state) => state.closeRoutineFlow); const minimapVisible = useUiStore((state) => state.minimapVisible); const toggleMinimap = useUiStore((state) => state.toggleMinimap); const projectionSignature = `${ROUTINE_FLOW_ALGORITHM_VERSION}:${routine?.id ?? ""}:${routine?.body ?? ""}`; const flow = useMemo(() => routine ? cachedFlow(routine.id, routine.body) : null, [projectionSignature]); const automatic = useMemo(() => flow ? layoutRoutineFlow(flow) : new Map<string, { x: number; y: number }>(), [flow]);
  const saved = document.routineFlowLayouts?.[routineId]?.algorithmVersion === ROUTINE_FLOW_ALGORITHM_VERSION ? document.routineFlowLayouts?.[routineId] : undefined; const [manual, setManual] = useState<Map<string, { x: number; y: number }>>(() => new Map(saved?.nodes.map((node) => [node.id, node.position]) ?? [])); const [pinned, setPinned] = useState<Set<string>>(() => new Set(saved?.nodes.filter((node) => node.pinned).map((node) => node.id) ?? [])); const [selectedId, setSelectedId] = useState<string | null>(null); const [focus, setFocus] = useState<{ nodeId: string; portId: string } | null>(null);
  const manualRef = useRef(manual); const pinnedRef = useRef(pinned);
  const flowSignatureRef = useRef(`${ROUTINE_FLOW_ALGORITHM_VERSION}:${routineId}:${flow?.bodyHash ?? ""}:${saved?.algorithmVersion ?? 0}`);
  const interaction = useRef<{ kind: "node"; id: string; startPointer: Point; start: Point } | { kind: "pan"; startPointer: Point; startViewport: CanvasViewport } | null>(null);
  const canvas = useCanvasViewport({
    initialViewport: saved?.viewport ?? { x: 20, y: 20, scale: saved?.scale ?? .78 },
    onViewportCommit: (nextViewport) => onLayoutChange({ nodes: [...manualRef.current].map(([id, position]) => ({ id, position, pinned: pinnedRef.current.has(id) || undefined })), scale: nextViewport.scale, viewport: nextViewport, algorithmVersion: ROUTINE_FLOW_ALGORITHM_VERSION }),
  });
  const persist = (nextManual = manualRef.current, nextPinned = pinnedRef.current, nextViewport = canvas.viewportRef.current) => onLayoutChange({ nodes: [...nextManual].map(([id, position]) => ({ id, position, pinned: nextPinned.has(id) || undefined })), scale: nextViewport.scale, viewport: nextViewport, algorithmVersion: ROUTINE_FLOW_ALGORITHM_VERSION });
  const { viewport, viewportRef } = canvas;
  useEffect(() => {
    const signature = `${ROUTINE_FLOW_ALGORITHM_VERSION}:${routineId}:${flow?.bodyHash ?? ""}:${saved?.algorithmVersion ?? 0}`;
    if (flowSignatureRef.current === signature) return;
    flowSignatureRef.current = signature;
    const nextManual = new Map(saved?.nodes.map((node) => [node.id, node.position]) ?? []);
    const nextPinned = new Set(saved?.nodes.filter((node) => node.pinned).map((node) => node.id) ?? []);
    manualRef.current = nextManual; pinnedRef.current = nextPinned;
    setManual(nextManual); setPinned(nextPinned); setSelectedId(null); setFocus(null);
  }, [routineId, flow?.bodyHash, saved]);
  const positions = new Map(automatic); manual.forEach((point, id) => positions.set(id, point)); const selected = flow?.nodes.find((node) => node.id === selectedId); const focused = flow && focus ? reachableFlow(flow, focus.nodeId, focus.portId) : flow && selectedId ? routineFlowConnected(flow, selectedId) : null; const animationOrder = useMemo(() => flow && focus ? flowAnimationOrder(flow, focus.nodeId, focus.portId) : flow && selectedId ? flowAnimationOrder(flow, selectedId) : null, [flow, focus, selectedId]);
  const stageRef = useRef<HTMLDivElement>(null); const geometry = useFlowGeometry(stageRef, positions, viewport.scale);
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => { if ((event.target as HTMLElement).closest(".standard-flow-block, .routine-flow-header, .canvas-toolbar-wrap, .routine-flow-overview, .routine-flow-inspector, .logic-inspector")) return; interaction.current = { kind: "pan", ...canvas.beginPan(event) }; };
  const startDrag = (event: ReactPointerEvent, id: string) => { event.stopPropagation(); const point = positions.get(id)!; interaction.current = { kind: "node", id, startPointer: { x: event.clientX, y: event.clientY }, start: point }; event.currentTarget.setPointerCapture(event.pointerId); };
  const moveDrag = (event: ReactPointerEvent) => { const current = interaction.current; if (!current) return; if (current.kind === "pan") { canvas.panFrom(current.startViewport, current.startPointer, { x: event.clientX, y: event.clientY }); return; } const nextManual = new Map(manualRef.current).set(current.id, { x: current.start.x + (event.clientX - current.startPointer.x) / viewportRef.current.scale, y: current.start.y + (event.clientY - current.startPointer.y) / viewportRef.current.scale }); manualRef.current = nextManual; setManual(nextManual); };
  const finishDrag = () => { const current = interaction.current; if (!current) return; interaction.current = null; if (current.kind === "node") { const nextPinned = new Set(pinnedRef.current).add(current.id); pinnedRef.current = nextPinned; setPinned(nextPinned); } persist(); };
  const focusPort = (nodeId: string, portId: string) => setFocus((value) => value?.nodeId === nodeId && value.portId === portId ? null : { nodeId, portId });
  const zoomBy = canvas.zoomBy;
  const togglePin = (id: string) => { const nextPinned = new Set(pinnedRef.current); const nextManual = new Map(manualRef.current); if (nextPinned.has(id)) { nextPinned.delete(id); nextManual.delete(id); } else { nextPinned.add(id); nextManual.set(id, positions.get(id) ?? { x: 0, y: 0 }); } pinnedRef.current = nextPinned; manualRef.current = nextManual; setPinned(nextPinned); setManual(nextManual); persist(nextManual, nextPinned); };
  const fit = () => {
    const rect = canvas.hostRef.current?.getBoundingClientRect(); if (!rect || !flow || flow.nodes.length === 0) return;
    const bounds = flow.nodes.reduce((value, node) => { const p = positions.get(node.id) ?? { x: 0, y: 0 }; return { minX: Math.min(value.minX, p.x), minY: Math.min(value.minY, p.y), maxX: Math.max(value.maxX, p.x + FLOW_NODE_WIDTH), maxY: Math.max(value.maxY, p.y + flowNodeHeight(node)) }; }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const width = Math.max(1, bounds.maxX - bounds.minX); const height = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, Math.min((rect.width - 100) / width, (rect.height - 100) / height)));
    canvas.setViewportNow({ scale, x: (rect.width - width * scale) / 2 - bounds.minX * scale, y: (rect.height - height * scale) / 2 - bounds.minY * scale }, true);
  };
  const minimapNodes = useMemo(() => flow ? routineMinimapNodes(flow.nodes, positions) : [], [flow, positions]);
  const flowBounds = useMemo(() => boundsForNodes(minimapNodes), [minimapNodes]);
  const centerOnMinimap = (point: { x: number; y: number }) => {
    const host = canvas.hostRef.current?.getBoundingClientRect();
    if (!host) return;
    canvas.setViewportNow({ ...viewportRef.current, x: host.width / 2 - point.x * viewportRef.current.scale, y: host.height / 2 - point.y * viewportRef.current.scale }, true);
  };
  useCanvasKeyboardZoom({ zoomBy, fit });
  if (!routine || !flow) return <div className="logic-empty"><h2>Routine not found</h2><button onClick={closeFlow}>Back to Logic graph</button></div>;
  return <div className="routine-flow-shell postman-flow-shell" onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
    <header className="routine-flow-header postman-flow-header"><button onClick={closeFlow}><ArrowLeft size={14} />Logic graph</button><strong>{routine.schema ? `${routine.schema}.` : ""}{routine.name}</strong><span>{flow.nodes.length} blocks · {flow.edges.length} paths · {pinned.size} pinned</span></header>
    <div ref={canvas.hostRef} className="routine-flow-canvas postman-flow-canvas canvas-shell" onPointerDown={pointerDown}><div className="canvas-hint">Drag to pan · Two-finger pan · Pinch to zoom · Drag block headers to move</div><div ref={stageRef} className="routine-flow-stage postman-flow-stage" style={{ transform: `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.scale})` }}><FlowConnections key={focus ? `${focus.nodeId}:${focus.portId}` : selectedId ?? "idle"} flow={flow} positions={positions} focusedEdges={focused?.edges ?? null} animationOrder={animationOrder} portCenters={geometry.centers}/>{flow.nodes.map((node) => <FlowBlock key={node.id} node={node} position={positions.get(node.id)!} selected={selectedId === node.id} dimmed={Boolean(focused && !focused.nodes.has(node.id))} pinned={pinned.has(node.id)} onSelect={() => { setSelectedId((value) => value === node.id ? null : node.id); setFocus(null); }} onDragStart={startDrag} onPortFocus={focusPort} registerPort={geometry.registerPort}/>)}</div>
      <CanvasControlToolbar label="Routine canvas controls" zoom={viewport.scale} onZoomOut={() => zoomBy(-.1)} onZoomIn={() => zoomBy(.1)} onFit={fit} actions={[
        { title: "Arrange", onClick: () => { const next = new Map([...manualRef.current].filter(([id]) => pinnedRef.current.has(id))); manualRef.current = next; setManual(next); persist(next, pinnedRef.current); }, icon: <LayoutDashboard size={17} /> },
        { title: "Arrange all", onClick: () => { if (window.confirm("Arrange all blocks and remove every pin?")) { const nextPinned = new Set<string>(); const nextManual = new Map<string, { x: number; y: number }>(); pinnedRef.current = nextPinned; manualRef.current = nextManual; setPinned(nextPinned); setManual(nextManual); persist(nextManual, nextPinned); } }, icon: <RefreshCcw size={16} /> },
        { title: "Toggle minimap", onClick: toggleMinimap, pressed: minimapVisible, icon: <MapIcon size={17} /> },
      ]} />
      {minimapVisible && <CanvasMinimap className="routine-flow-overview" label="Routine flow minimap" nodes={minimapNodes} bounds={flowBounds} viewport={viewport} host={canvas.hostRef.current} onCenter={centerOnMinimap} />}
      {flow.diagnostics.length > 0 && <div className="routine-flow-warning">⚠ {flow.diagnostics.length} parser warning{flow.diagnostics.length === 1 ? "" : "s"}</div>}
    </div>
    {selected && <RoutineFlowInspector node={selected} dialect={document.dialect} routineName={routine.name} pinned={pinned.has(selected.id)} onClose={() => setSelectedId(null)} onTogglePin={() => togglePin(selected.id)} />}
  </div>;
}
