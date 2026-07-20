import type { PointerEvent as ReactPointerEvent } from "react";
import { FLOW_NODE_WIDTH, flowNodeHeight, flowPortColor, flowSourceHeight } from "../../domain/flowGeometry";
import type { RoutineFlowNode } from "../../domain/routineFlow";
import { FlowBlock as StandardFlowBlock, type FlowPortRegistrar, type FlowPrimitiveKind } from "./FlowPrimitives";
import { InsertMappingBody } from "./InsertMappingBody";
import { ComputeProjectionBody } from "./ComputeProjectionBody";
import { ContextProjectionBody } from "./ContextProjectionBody";
import { PerformProjectionBody } from "./PerformProjectionBody";
import { ReturnProjectionBody } from "./ReturnProjectionBody";
import { RaiseProjectionBody } from "./RaiseProjectionBody";
import { AssignmentProjectionBody } from "./AssignmentProjectionBody";
import { SelectProjectionBody } from "./SelectProjectionBody";
import { MutationProjectionBody } from "./MutationProjectionBody";
import { ConditionRows } from "./ConditionRows";
import { RoutineFlowNodeIcon, routineFlowAccent } from "./RoutineFlowIcons";

function primitive(node: RoutineFlowNode): FlowPrimitiveKind { return node.kind === "condition" ? "condition" : node.kind === "raise" ? "exception" : node.kind === "merge" ? "merge" : node.kind === "return" || node.kind === "start" || node.kind === "end" ? "return" : node.kind === "unparsed" ? "reference" : "operation"; }
function summary(node: RoutineFlowNode): string { if (node.kind === "condition") return node.source.match(/^\s*(?:IF|ELSIF)\s+(.+?)\s+THEN/im)?.[1] ?? node.source; return node.details?.message ?? node.source; }
function mergeRow(node: RoutineFlowNode, inputId: string) { return node.details?.merge?.rows.find((row) => row.inputId === inputId); }
function mergeColor(kind?: string): string { return kind === "variable" ? "#79b8ff" : "#8155b6"; }

export function FlowBlock({ node, position, selected, dimmed, pinned, onSelect, onDragStart, onPortFocus, registerPort }: { node: RoutineFlowNode; position: { x: number; y: number }; selected: boolean; dimmed: boolean; pinned: boolean; onSelect: () => void; onDragStart: (event: ReactPointerEvent, id: string) => void; onPortFocus: (nodeId: string, portId: string) => void; registerPort?: FlowPortRegistrar }) {
  const context = node.details?.context; const assignment = node.details?.assignment; const perform = node.details?.perform; const returnProjection = node.details?.return; const insert = node.details?.insert; const compute = node.details?.compute; const select = node.details?.select; const mutation = node.details?.mutation; const condition = node.details?.condition;
  const inlineCondition = Boolean(condition && node.details?.conditionRows);
  const comparedConditionRows = node.details?.conditionRows?.filter((row) => row.left !== "Otherwise") ?? [];
  const isTriggerOperation = comparedConditionRows.length > 0 && comparedConditionRows.every((row) => row.left.replace(/\s+/g, "").toUpperCase() === "TG_OP");
  const branchCount = node.outputs.length;
  const subtitle = context
    ? `Initialize context · ${context.declarations.length} variable${context.declarations.length === 1 ? "" : "s"}`
    : isTriggerOperation
      ? `Trigger operation · ${branchCount} branch${branchCount === 1 ? "" : "es"}`
      : condition && node.title === "IF"
        ? `Condition · ${comparedConditionRows.length} clause${comparedConditionRows.length === 1 ? "" : "s"}`
      : perform
        ? `${perform.lock ? "Lock row" : "Read row"} · ${perform.table}`
        : mutation?.operation === "UPDATE"
          ? `Write row · ${mutation.table}`
          : returnProjection
            ? "Exit routine"
          : node.kind === "raise"
            ? "Stop routine"
          : assignment
            ? "Set " + assignment.target
      : undefined;
  return <StandardFlowBlock id={node.id} kind={primitive(node)} title={insert ? `INSERT ${insert.table}` : node.title} subtitle={subtitle} icon={<RoutineFlowNodeIcon kind={node.kind} size={13} />} accent={routineFlowAccent(node)} position={position} width={FLOW_NODE_WIDTH} minHeight={flowNodeHeight(node)} compact inputs={node.inputs.map((port) => {
    const row = mergeRow(node, port.id);
    return { id: port.id, label: port.label, color: row ? mergeColor(row.kind) : flowPortColor(port.type), className: row ? `merge-semantic ${row.kind}` : port.type, content: row ? <span className="merge-port-content"><b className={`select-kind-chip ${row.kind}`}>{row.label}</b><small>{row.detail}</small></span> : undefined };
  })} outputs={inlineCondition ? [] : node.outputs.map((port, index) => ({ id: port.id, label: port.label, color: condition && port.id === "default" ? "#59c98f" : flowPortColor(port.type), description: condition?.branches?.[index]?.summary, className: port.type }))} selected={selected} dimmed={dimmed} pinned={pinned} onSelect={onSelect} onDragStart={onDragStart} onPortActivate={onPortFocus} registerPort={registerPort}>{context ? <ContextProjectionBody context={context}/> : assignment ? <AssignmentProjectionBody assignment={assignment}/> : perform ? <PerformProjectionBody perform={perform}/> : returnProjection ? <ReturnProjectionBody projection={returnProjection}/> : insert ? <InsertMappingBody insert={insert}/> : compute ? <ComputeProjectionBody compute={compute}/> : select ? <SelectProjectionBody select={select}/> : mutation ? <MutationProjectionBody mutation={mutation}/> : inlineCondition ? <ConditionRows node={node} onPortActivate={onPortFocus} registerPort={registerPort}/> : node.kind === "raise" && node.details ? <RaiseProjectionBody details={node.details}/> : node.details?.merge ? null : <pre style={{ height: flowSourceHeight(node) }}>{summary(node) || "Branch convergence"}</pre>}</StandardFlowBlock>;
}
