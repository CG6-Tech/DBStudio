import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { FlowPoint } from "../../domain/flowGeometry";
import type { FlowPortDirection, FlowPortRegistrar } from "./FlowPrimitives";

export function flowPortKey(nodeId: string, portId: string, direction: FlowPortDirection): string { return `${nodeId}\0${direction}\0${portId}`; }

export function useFlowGeometry(stageRef: RefObject<HTMLElement | null>, revision: unknown, scale = 1): { centers: ReadonlyMap<string, FlowPoint>; registerPort: FlowPortRegistrar } {
  const elements = useRef(new Map<string, HTMLElement>()); const frame = useRef<number | null>(null); const observer = useRef<ResizeObserver | null>(null); const [centers, setCenters] = useState<ReadonlyMap<string, FlowPoint>>(new Map());
  const measure = useCallback(() => { const stage = stageRef.current; if (!stage) return; const stageRect = stage.getBoundingClientRect(); const next = new Map<string, FlowPoint>(); elements.current.forEach((element, key) => { const rect = element.getBoundingClientRect(); next.set(key, { x: (rect.left + rect.width / 2 - stageRect.left) / scale, y: (rect.top + rect.height / 2 - stageRect.top) / scale }); }); setCenters(next); }, [stageRef, scale]);
  const schedule = useCallback(() => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(() => { frame.current = null; measure(); }); }, [measure]);
  const registerPort = useCallback<FlowPortRegistrar>((nodeId, portId, direction, element) => { const key = flowPortKey(nodeId, portId, direction); if (element) { elements.current.set(key, element); const block = element.closest<HTMLElement>("[data-flow-node]"); if (block) observer.current?.observe(block); } else elements.current.delete(key); schedule(); }, [schedule]);
  useLayoutEffect(() => { observer.current = new ResizeObserver(schedule); const blocks = new Set<HTMLElement>(); elements.current.forEach((element) => { const block = element.closest<HTMLElement>("[data-flow-node]"); if (block) blocks.add(block); }); blocks.forEach((block) => observer.current?.observe(block)); schedule(); return () => { observer.current?.disconnect(); observer.current = null; if (frame.current !== null) cancelAnimationFrame(frame.current); }; }, [revision, scale, schedule]);
  return { centers, registerPort };
}
