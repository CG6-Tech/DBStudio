import type { LogicGraphNode, LogicGraphNodeKind } from "../../domain/logicGraph";
import type { LogicEdge } from "../../domain/types";
import type { FlowPrimitiveKind } from "../flow/FlowPrimitives";

export type LogicOperationKind = "reads" | "inserts" | "updates" | "deletes" | "executes" | "calls" | "table-event";

export const logicOperationColors: Record<LogicOperationKind, string> = {
  "table-event": "#79b8ff",
  executes: "#ff9d63",
  calls: "#c9a9ef",
  reads: "#8ee0b7",
  inserts: "#79b8ff",
  updates: "#f5bd69",
  deletes: "#ef8a91",
};

export const logicNodeAccents: Record<LogicGraphNodeKind, string> = {
  table: "#79b8ff",
  trigger: "#ff9d63",
  routine: "#8ee0b7",
  unresolved: "#ef6b73",
};

export function logicEdgeColor(kind: LogicEdge["kind"]): string {
  return logicOperationColors[kind];
}

export function logicNodeAccent(kind: LogicGraphNodeKind): string {
  return logicNodeAccents[kind];
}

export function logicPrimitiveKind(node: LogicGraphNode): FlowPrimitiveKind {
  if (node.kind === "trigger") return "trigger";
  if (node.kind === "routine") return "operation";
  return "reference";
}

export function logicOperationKind(value: string): string {
  const normalized = value.toLocaleLowerCase("en").trim();
  if (normalized === "read") return "reads";
  if (normalized === "insert") return "inserts";
  if (normalized === "update") return "updates";
  if (normalized === "delete") return "deletes";
  return normalized;
}

export function logicOperationClass(kind: string): string {
  return logicOperationKind(kind).replace(/[^a-z0-9-]/g, "-");
}
