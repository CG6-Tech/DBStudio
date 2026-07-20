import type { RoutineFlowNode, RoutineFlowPortType } from "./routineFlow";
import { contextProjectionHeight } from "./contextProjection";
import { performProjectionHeight } from "./performProjection";
import { mutationProjectionHeight } from "./mutationProjection";
import { RETURN_PROJECTION_HEIGHT } from "./returnProjection";

export interface FlowPoint { x: number; y: number }
export interface FlowRect { x: number; y: number; width: number; height: number }
export interface FlowNodeGeometry extends FlowRect { id: string }

export const FLOW_NODE_WIDTH = 260;
export const FLOW_HEADER_HEIGHT = 42;
export const FLOW_PORT_HEIGHT = 31;

export function flowSourceHeight(node: RoutineFlowNode): number {
  if (node.details?.context) return contextProjectionHeight(node.details.context);
  if (node.details?.perform) return performProjectionHeight(node.details.perform);
  if (node.details?.return) return RETURN_PROJECTION_HEIGHT;
  if (node.details?.assignment) return 62;
  if (node.details?.insert) return 4 * 28 + 58;
  if (node.details?.select) return 108;
  if (node.details?.mutation) return mutationProjectionHeight(node.details.mutation);
  if (node.details?.compute?.select) return 108;
  if (node.details?.compute) return 86;
  if (node.details?.conditionRows) return 0;
  if (node.kind === "raise" && node.details) {
    const rows = [node.details.errcode, node.details.message, node.details.detail, node.details.hint].filter(Boolean).length;
    return Math.max(1, rows) * 31;
  }
  return Math.min(3, Math.max(1, node.source.split("\n").length)) * 15 + 18;
}

export function flowNodeHeight(node: RoutineFlowNode): number {
  if (node.kind === "merge") return FLOW_HEADER_HEIGHT + (node.inputs.length + node.outputs.length) * FLOW_PORT_HEIGHT;
  if (node.details?.conditionRows) return FLOW_HEADER_HEIGHT + node.inputs.length * FLOW_PORT_HEIGHT + node.details.conditionRows.length * FLOW_PORT_HEIGHT;
  return FLOW_HEADER_HEIGHT + flowSourceHeight(node) + (node.inputs.length + node.outputs.length) * FLOW_PORT_HEIGHT;
}

export function flowInputOffset(node: RoutineFlowNode, index: number): FlowPoint { return { x: 0, y: FLOW_HEADER_HEIGHT + index * FLOW_PORT_HEIGHT + FLOW_PORT_HEIGHT / 2 }; }
export function flowOutputOffset(node: RoutineFlowNode, index: number): FlowPoint {
  const output = node.outputs[index]; const rowIndex = output && node.details?.conditionRows?.findIndex((row) => row.portId === output.id);
  if (rowIndex !== undefined && rowIndex >= 0) return { x: FLOW_NODE_WIDTH, y: FLOW_HEADER_HEIGHT + node.inputs.length * FLOW_PORT_HEIGHT + rowIndex * FLOW_PORT_HEIGHT + FLOW_PORT_HEIGHT / 2 };
  return { x: FLOW_NODE_WIDTH, y: FLOW_HEADER_HEIGHT + node.inputs.length * FLOW_PORT_HEIGHT + flowSourceHeight(node) + index * FLOW_PORT_HEIGHT + FLOW_PORT_HEIGHT / 2 };
}

export function flowPortColor(type: RoutineFlowPortType): string {
  return type === "error" ? "#e45f69" : type === "branch" ? "#8155b6" : type === "data" || type === "result" ? "#4d92d6" : "#35a66f";
}

export function expandFlowRect(rect: FlowRect, padding = 24): FlowRect {
  return { x: rect.x - padding, y: rect.y - padding, width: rect.width + padding * 2, height: rect.height + padding * 2 };
}

export function pointInFlowRect(point: FlowPoint, rect: FlowRect): boolean {
  return point.x > rect.x && point.x < rect.x + rect.width && point.y > rect.y && point.y < rect.y + rect.height;
}
