import { AlertTriangle, Braces, CircleDot, Code2, CornerDownLeft, Diamond, GitMerge, ListChecks, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { RoutineFlowNode, RoutineFlowNodeKind } from "../../domain/routineFlow";

export function routineFlowAccent(node: Pick<RoutineFlowNode, "kind">): string {
  if (node.kind === "context") return "#8ee0b7";
  if (node.kind === "condition" || node.kind === "merge") return "#b78cff";
  if (node.kind === "raise" || node.kind === "unparsed") return "#ef6b73";
  if (node.kind === "sql" || node.kind === "assignment" || node.kind === "compute") return "#79b8ff";
  return "#8ee0b7";
}

export function RoutineFlowNodeIcon({ kind, size = 15 }: { kind: RoutineFlowNodeKind; size?: number }) {
  if (kind === "context") return <SlidersHorizontal size={size} strokeWidth={2.1} />;
  if (kind === "condition") return <Diamond size={size} strokeWidth={2.1} />;
  if (kind === "merge") return <GitMerge size={size} strokeWidth={2.1} />;
  if (kind === "raise" || kind === "unparsed") return <AlertTriangle size={size} strokeWidth={2.1} />;
  if (kind === "return") return <CornerDownLeft size={size} strokeWidth={2.1} />;
  if (kind === "end") return <RotateCcw size={size} strokeWidth={2.1} />;
  if (kind === "start") return <CircleDot size={size} strokeWidth={2.1} />;
  if (kind === "compute") return <ListChecks size={size} strokeWidth={2.1} />;
  if (kind === "assignment") return <Braces size={size} strokeWidth={2.1} />;
  return <Code2 size={size} strokeWidth={2.1} />;
}
