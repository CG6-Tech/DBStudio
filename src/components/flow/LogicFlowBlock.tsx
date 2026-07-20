import type { PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { LogicGraphNode } from "../../domain/logicGraph";
import type { DatabaseTrigger, Routine, Table } from "../../domain/types";
import { LogicObjectIcon } from "../logic/LogicIcons";
import { LogicOperationChip } from "../logic/LogicOperationChip";
import { logicNodeAccent, logicOperationClass, logicPrimitiveKind } from "../logic/logicUi";
import { SqlText } from "../ui/SqlText";
import { FlowBlock, FlowPort, type FlowPortRegistrar } from "./FlowPrimitives";

function LogicPortChip({ kind, label }: { kind: LogicGraphNode["ports"][number]["edgeKind"]; label: string }) {
  if (kind === "inserts" || kind === "updates" || kind === "deletes") return <LogicOperationChip value={label} />;
  if (kind === "reads") return <span className={`logic-port-chip ${logicOperationClass(kind)}`}>{label}</span>;
  return <span className={`logic-event-chip ${logicOperationClass(kind)}`}>{label}</span>;
}

function RoutineAccordion({ routine }: { routine: Routine }) {
  return <div className="logic-routine-accordion">
    <SqlText sql={routine.body.trim() || routine.definitionSql.trim() || "No SQL statement available."} maxHeight={220} />
  </div>;
}

function LogicFlowSummary({ node, source }: { node: LogicGraphNode; source?: Table | DatabaseTrigger | Routine }) {
  if (node.kind === "trigger" && source && "events" in source) {
    return <div className="standard-flow-compact-body logic-flow-summary trigger-summary">
      <span className="logic-trigger-mode">{source.timing?.toUpperCase()} {source.scope?.toUpperCase()}</span>
      <span className="logic-trigger-events">{source.events.map((event) => <LogicOperationChip key={event} value={event} />)}</span>
    </div>;
  }
  if (node.kind === "routine" && source && "kind" in source) {
    return <div className="standard-flow-compact-body logic-flow-summary routine-summary">
      <span className="logic-routine-signature"><code>{source.parameters.length ? source.parameters.map((item) => item.dataType).join(", ") : "No parameters"}</code></span>
      <span className="logic-language-chip">{source.language ?? source.kind}</span>
    </div>;
  }
  if (node.kind === "table" && source && "columns" in source) {
    return <div className="standard-flow-compact-body logic-flow-summary table-summary">
      <span className="logic-meta-chip">{source.columns.length} fields</span>
      <span className="logic-meta-chip">{node.ports.length} logic link{node.ports.length === 1 ? "" : "s"}</span>
    </div>;
  }
  return <div className="standard-flow-compact-body logic-flow-summary unresolved-summary"><span>Reference could not be resolved</span></div>;
}

export function LogicFlowBlock({ node, source, position, selected, dimmed, pinned, expanded, edgeColor, onSelect, onDoubleClick, onDragStart, onExpand, onOpenFlow, registerPort }: { node: LogicGraphNode; source?: Table | DatabaseTrigger | Routine; position: { x: number; y: number }; selected: boolean; dimmed: boolean; pinned: boolean; expanded: boolean; edgeColor: (kind: LogicGraphNode["ports"][number]["edgeKind"]) => string; onSelect: () => void; onDoubleClick: () => void; onDragStart: (event: ReactPointerEvent, id: string) => void; onExpand: () => void; onOpenFlow: () => void; registerPort?: FlowPortRegistrar }) {
  const toDisplayPort = (port: LogicGraphNode["ports"][number]) => ({
    id: port.id,
    label: port.label,
    color: edgeColor(port.edgeKind),
    className: logicOperationClass(port.edgeKind),
    content: node.kind === "table" ? <LogicPortChip kind={port.edgeKind} label={port.label} /> : node.kind === "routine" && port.direction === "output" ? <LogicPortChip kind={port.edgeKind} label={port.label} /> : undefined,
  });
  const inputs = node.ports.filter((port) => port.direction === "input" && !(node.kind === "trigger" && port.edgeKind === "table-event")).map(toDisplayPort);
  const allOutputs = node.ports.filter((port) => port.direction === "output").map(toDisplayPort);
  const readOutputs = node.kind === "routine" ? allOutputs.filter((port) => port.className === "reads") : [];
  const outputs = node.kind === "routine" ? allOutputs.filter((port) => port.className !== "reads") : allOutputs;
  return <FlowBlock id={node.id} kind={logicPrimitiveKind(node)} title={node.label} icon={<LogicObjectIcon kind={node.kind} />} accent={logicNodeAccent(node.kind)} position={position} width={node.width} minHeight={node.height} compact inputs={inputs} outputs={outputs} selected={selected} dimmed={dimmed} pinned={pinned} onSelect={onSelect} onDoubleClick={onDoubleClick} onDragStart={onDragStart} registerPort={registerPort}>
    {readOutputs.map((port) => <FlowPort key={port.id} nodeId={node.id} port={port} direction="output" register={registerPort}/>)}
    <LogicFlowSummary node={node} source={source} />
    {node.kind === "routine" && <button className="logic-routine-toggle-row" aria-expanded={expanded} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onExpand(); }}>{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<strong>SQL statement</strong></button>}
    {node.kind === "routine" && source && "kind" in source && expanded && <RoutineAccordion routine={source} />}
    {node.kind === "routine" && <div className="standard-flow-actions logic-routine-flow-action" onPointerDown={(event) => event.stopPropagation()}><button onClick={(event) => { event.stopPropagation(); onOpenFlow(); }}>Open full flow →</button></div>}
  </FlowBlock>;
}
