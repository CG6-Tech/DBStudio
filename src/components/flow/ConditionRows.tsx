import type { CSSProperties, ReactNode } from "react";
import type { ConditionDisplayRow } from "../../domain/conditionProjection";
import { flowPortColor } from "../../domain/flowGeometry";
import type { RoutineFlowNode } from "../../domain/routineFlow";
import { FlowPort, type FlowPortRegistrar } from "./FlowPrimitives";

function rowContent(row: ConditionDisplayRow) {
  const operator = row.operator === "evaluates as true" ? "TRUE" : row.operator;
  return <span className="condition-inline-content" title={row.raw}>
    <span className="condition-inline-expression">
      <code title={row.left}>{row.left}</code>
      {operator && <span className={"condition-inline-operator" + (operator === "TRUE" ? " boolean" : "")} title={row.operator}>{operator}</span>}
      {row.right && <b title={row.right}>{row.right}</b>}
    </span>
    <em aria-hidden={!row.portId}>{row.portId ? row.outcome : ""}</em>
  </span>;
}

export function ConditionRows({ node, onPortActivate, registerPort }: { node: RoutineFlowNode; onPortActivate?: (nodeId: string, portId: string) => void; registerPort?: FlowPortRegistrar }) {
  const rows = node.details?.conditionRows ?? [];
  const renderRow = (row: ConditionDisplayRow) => {
    const output = row.portId ? node.outputs.find((port) => port.id === row.portId) : undefined;
    const groupClass = row.group ? `group-${row.group} group-${row.groupIndex === 0 ? "first" : row.groupIndex === (row.groupSize ?? 1) - 1 ? "last" : "middle"}` : "";
    if (!output || !row.portId) return <div key={row.id} className={`standard-flow-port output condition-inline-row passive ${groupClass}`}>{rowContent(row)}</div>;
    return <FlowPort key={row.id} nodeId={node.id} port={{ id: row.portId, label: row.outcome, color: flowPortColor(output.type), content: rowContent(row), className: `condition-inline-row ${groupClass}`, ariaLabel: `${row.left} ${row.operator ?? ""} ${row.right ?? ""} ${row.outcome}`.replace(/\s+/g, " ").trim() }} direction="output" register={registerPort} onActivate={onPortActivate ? () => onPortActivate(node.id, row.portId!) : undefined}/>;
  };
  const content: ReactNode[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.group && row.groupIndex === 0 && (row.groupSize ?? 1) > 1) {
      const groupedRows = rows.slice(index, index + (row.groupSize ?? 1));
      const label = row.group.toUpperCase();
      content.push(<div key={`group:${row.id}`} className={`condition-inline-group group-${row.group}`} style={{ "--condition-group-rows": groupedRows.length } as CSSProperties}>
        <span className="condition-inline-group-operator" aria-label={`${label} condition group`}>{label}</span>
        {groupedRows.map(renderRow)}
      </div>);
      index += groupedRows.length - 1;
    } else {
      content.push(renderRow(row));
    }
  }
  return <div className="condition-inline-rows">{content}</div>;
}
