import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";

export type FlowPrimitiveKind = "trigger" | "condition" | "operation" | "exception" | "merge" | "return" | "reference";
export type FlowPortDirection = "input" | "output";
export interface FlowDisplayPort { id: string; label: string; color: string; description?: string; content?: ReactNode; className?: string; ariaLabel?: string; }
export type FlowPortRegistrar = (nodeId: string, portId: string, direction: FlowPortDirection, element: HTMLElement | null) => void;

export function FlowPort({ nodeId, port, direction, onActivate, register }: { nodeId: string; port: FlowDisplayPort; direction: FlowPortDirection; onActivate?: () => void; register?: FlowPortRegistrar }) {
  const Tag = direction === "output" && onActivate ? "button" : "div";
  return <Tag className={`standard-flow-port ${direction} ${port.className ?? ""}`} data-node-id={nodeId} data-port-id={port.id} data-port-direction={direction} onClick={onActivate} aria-label={port.ariaLabel}>
    {direction === "input" && <i ref={(element) => register?.(nodeId, port.id, direction, element)} style={{ borderColor: port.color }}/>} {port.content ?? <span>{port.label}{port.description && <small>{port.description}</small>}</span>} {direction === "output" && <i ref={(element) => register?.(nodeId, port.id, direction, element)} style={{ borderColor: port.color }}/>}</Tag>;
}

export interface StandardFlowBlockProps {
  id: string; kind: FlowPrimitiveKind; title: string; subtitle?: string; icon: ReactNode; accent: string; position: { x: number; y: number }; width: number; minHeight?: number; compact?: boolean;
  inputs?: FlowDisplayPort[]; outputs?: FlowDisplayPort[]; selected?: boolean; dimmed?: boolean; pinned?: boolean; children?: ReactNode; footer?: ReactNode;
  onSelect?: () => void; onDoubleClick?: () => void; onDragStart?: (event: ReactPointerEvent, id: string) => void; onPortActivate?: (nodeId: string, portId: string) => void; registerPort?: FlowPortRegistrar;
}

export function FlowBlock({ id, kind, title, subtitle, icon, accent, position, width, minHeight, compact, inputs = [], outputs = [], selected, dimmed, pinned, children, footer, onSelect, onDoubleClick, onDragStart, onPortActivate, registerPort }: StandardFlowBlockProps) {
  const startDrag = (event: ReactPointerEvent) => {
    if ((event.target as HTMLElement).closest("button, .standard-flow-port")) return;
    onDragStart?.(event, id);
  };
  return <div tabIndex={0} role="button" aria-label={`${kind} ${title}`} data-flow-node={id} className={`standard-flow-block ${kind} ${compact ? "compact" : "detailed"} ${selected ? "selected" : ""} ${dimmed ? "dim" : ""}`} style={{ left: position.x, top: position.y, width, minHeight, ["--flow-accent" as string]: accent } as CSSProperties} onClick={onSelect} onDoubleClick={onDoubleClick} onPointerDown={startDrag}>
    <header><span>{icon}</span><div className="standard-flow-title"><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div>{pinned && <em title="Pinned">●</em>}<b>⠿</b></header>
    {inputs.map((port) => <FlowPort key={port.id} nodeId={id} port={port} direction="input" register={registerPort}/>)}
    {children}
    {outputs.map((port) => <FlowPort key={port.id} nodeId={id} port={port} direction="output" register={registerPort} onActivate={onPortActivate ? () => onPortActivate(id, port.id) : undefined}/>)}
    {footer}
  </div>;
}

export const TriggerBlock = (props: Omit<StandardFlowBlockProps, "kind">) => <FlowBlock {...props} kind="trigger"/>;
export const ConditionBlock = (props: Omit<StandardFlowBlockProps, "kind">) => <FlowBlock {...props} kind="condition"/>;
export const OperationBlock = (props: Omit<StandardFlowBlockProps, "kind">) => <FlowBlock {...props} kind="operation"/>;
export const ExceptionBlock = (props: Omit<StandardFlowBlockProps, "kind">) => <FlowBlock {...props} kind="exception"/>;
export const MergeBlock = (props: Omit<StandardFlowBlockProps, "kind">) => <FlowBlock {...props} kind="merge"/>;
export const ReturnBlock = (props: Omit<StandardFlowBlockProps, "kind">) => <FlowBlock {...props} kind="return"/>;
export const ReferenceBlock = (props: Omit<StandardFlowBlockProps, "kind">) => <FlowBlock {...props} kind="reference"/>;
