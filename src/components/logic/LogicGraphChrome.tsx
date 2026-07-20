import { useState } from "react";
import { ChevronDown, ChevronRight, Pin, PinOff, Workflow } from "lucide-react";
import type { LogicGraphNode } from "../../domain/logicGraph";
import type { DatabaseTrigger, Routine, Table } from "../../domain/types";
import type { ViewportBounds } from "../../domain/viewportGeometry";
import type { CanvasViewport } from "../canvas/canvasViewport";
import { boundsForNodes, CanvasMinimap } from "../canvas/CanvasMinimap";
import { InspectorActions, InspectorMeta, InspectorMetaRow, InspectorSection, InspectorShell, InspectorTitle } from "../ui/InspectorPrimitives";
import { SqlText } from "../ui/SqlText";
import { LogicObjectIcon } from "./LogicIcons";
import { LogicOperationChip } from "./LogicOperationChip";

type LogicSource = Table | DatabaseTrigger | Routine;

function referenceLabel(reference?: { schema?: string; name: string }): string {
  if (!reference) return "None";
  return reference.schema ? `${reference.schema}.${reference.name}` : reference.name;
}

function routineOperationCounts(routine: Routine) {
  const counts: Array<[string, number]> = [
    ["reads", routine.reads.length],
    ["inserts", routine.inserts.length],
    ["updates", routine.updates.length],
    ["deletes", routine.deletes.length],
    ["calls", routine.calls.length],
  ];
  return counts.filter(([, count]) => count > 0);
}

export function logicGraphBounds(nodes: readonly LogicGraphNode[], positions: ReadonlyMap<string, { x: number; y: number }>): ViewportBounds {
  return boundsForNodes(nodes.map((node) => {
    const p = positions.get(node.id) ?? { x: 0, y: 0 };
    return { id: node.id, className: node.kind, x: p.x, y: p.y, width: node.width, height: node.height };
  }));
}

export function LogicGraphHeader({ nodes, edges, pinned }: { nodes: number; edges: number; pinned: number }) {
  return <header className="logic-graph-header"><strong>Logic graph</strong><span>{nodes} blocks · {edges} paths · {pinned} pinned</span></header>;
}

export function LogicGraphMinimap({ nodes, positions, bounds, viewport, host, onCenter }: { nodes: readonly LogicGraphNode[]; positions: ReadonlyMap<string, { x: number; y: number }>; bounds: ViewportBounds; viewport: CanvasViewport; host: HTMLElement | null; onCenter: (point: { x: number; y: number }) => void }) {
  const items = nodes.map((node) => {
    const p = positions.get(node.id) ?? { x: 0, y: 0 };
    return { id: node.id, className: node.kind, x: p.x, y: p.y, width: node.width, height: node.height };
  });
  return <CanvasMinimap className="logic-graph-minimap" label="Logic graph minimap" nodes={items} bounds={bounds} viewport={viewport} host={host} onCenter={onCenter} />;
}

export function LogicInspector({ node, source, pinned, onClose, onTogglePin, onOpenFlow }: { node: LogicGraphNode; source?: LogicSource; pinned: boolean; onClose: () => void; onTogglePin: () => void; onOpenFlow: () => void }) {
  const [sqlOpen, setSqlOpen] = useState(true);
  const body = source && "definitionSql" in source ? source.definitionSql : node.kind === "unresolved" ? "This reference could not be resolved to a loaded database object." : JSON.stringify(source, null, 2);
  const routine = source && "kind" in source ? source : null;
  const trigger = source && "events" in source ? source : null;
  return <InspectorShell onClose={onClose}>
    <InspectorTitle className={node.kind} icon={<LogicObjectIcon kind={node.kind} size={15} />} eyebrow={node.kind.toUpperCase()} title={node.label} />
    <InspectorActions>
      <button onClick={onTogglePin}>{pinned ? <PinOff size={14} /> : <Pin size={14} />}{pinned ? "Unpin position" : "Pin position"}</button>
      {node.kind === "routine" && <button onClick={onOpenFlow}><Workflow size={14} />Open flow</button>}
    </InspectorActions>
    {routine && <InspectorSection title="Details">
      <InspectorMeta>
        <InspectorMetaRow label="Kind" value={routine.kind} />
        <InspectorMetaRow label="Language" value={routine.language ?? "Unknown"} />
        <InspectorMetaRow label="Returns" value={routine.returnType ?? "None"} />
        <InspectorMetaRow label="Params" value={routine.parameters.length ? routine.parameters.map((param) => param.name ? `${param.name}: ${param.dataType}` : param.dataType).join(", ") : "None"} />
      </InspectorMeta>
      {routineOperationCounts(routine).length > 0 && <div className="logic-inspector-chips">{routineOperationCounts(routine).map(([kind, count]) => <LogicOperationChip key={kind} kind={kind} value={`${kind} ${count}`} />)}</div>}
    </InspectorSection>}
    {trigger && <InspectorSection title="Details">
      <InspectorMeta>
        <InspectorMetaRow label="Timing" value={trigger.timing?.toUpperCase()} />
        <InspectorMetaRow label="Scope" value={trigger.scope?.toUpperCase()} />
        <InspectorMetaRow label="Table" value={referenceLabel(trigger.targetTable)} />
        <InspectorMetaRow label="Executes" value={referenceLabel(trigger.executedRoutine)} />
      </InspectorMeta>
      <div className="logic-inspector-chips">{trigger.events.map((event) => <LogicOperationChip key={event} value={event} />)}</div>
    </InspectorSection>}
    <InspectorSection className="sql">
      <button className="logic-inspector-sql-toggle" aria-expanded={sqlOpen} onClick={() => setSqlOpen((open) => !open)}>{sqlOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<strong>SQL statement</strong></button>
      {sqlOpen && ("definitionSql" in (source ?? {}) ? <SqlText sql={body} /> : <pre>{body}</pre>)}
    </InspectorSection>
  </InspectorShell>;
}
