import type { PointerEvent as ReactPointerEvent } from "react";
import { projectPoint } from "../../domain/canvasGeometry";
import type { ViewportBounds } from "../../domain/viewportGeometry";
import type { CanvasViewport } from "./canvasViewport";

export interface MinimapNode {
  id: string;
  className: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function boundsForNodes(nodes: readonly MinimapNode[]): ViewportBounds {
  return nodes.reduce((value, node) => ({
    minX: Math.min(value.minX, node.x),
    minY: Math.min(value.minY, node.y),
    maxX: Math.max(value.maxX, node.x + node.width),
    maxY: Math.max(value.maxY, node.y + node.height),
  }), { minX: 0, minY: 0, maxX: 1, maxY: 1 });
}

export function CanvasMinimap({ className, label, nodes, bounds, viewport, host, onCenter }: { className: string; label: string; nodes: readonly MinimapNode[]; bounds: ViewportBounds; viewport: CanvasViewport; host: HTMLElement | null; onCenter: (point: { x: number; y: number }) => void }) {
  const rect = host?.getBoundingClientRect();
  const topLeft = rect ? projectPoint({ x: -viewport.x / viewport.scale, y: -viewport.y / viewport.scale }, bounds) : null;
  const bottomRight = rect ? projectPoint({ x: (rect.width - viewport.x) / viewport.scale, y: (rect.height - viewport.y) / viewport.scale }, bounds) : null;
  const viewportStyle = topLeft && bottomRight ? {
    left: `${Math.max(0, topLeft.x) * 100}%`,
    top: `${Math.max(0, topLeft.y) * 100}%`,
    width: `${Math.max(3, (Math.min(1, bottomRight.x) - Math.max(0, topLeft.x)) * 100)}%`,
    height: `${Math.max(3, (Math.min(1, bottomRight.y) - Math.max(0, topLeft.y)) * 100)}%`,
  } : null;
  const jump = (event: ReactPointerEvent<HTMLDivElement>) => {
    const mini = event.currentTarget.getBoundingClientRect();
    onCenter({ x: bounds.minX + ((event.clientX - mini.left) / mini.width) * (bounds.maxX - bounds.minX), y: bounds.minY + ((event.clientY - mini.top) / mini.height) * (bounds.maxY - bounds.minY) });
  };
  return <div className={`${className} minimap`} aria-label={label} onPointerDown={jump}>
    {nodes.map((node) => {
      const start = projectPoint({ x: node.x, y: node.y }, bounds);
      return <b key={node.id} className={node.className} style={{ left: `${start.x * 100}%`, top: `${start.y * 100}%`, width: `${Math.max(2, node.width / Math.max(1, bounds.maxX - bounds.minX) * 100)}%`, height: `${Math.max(2, node.height / Math.max(1, bounds.maxY - bounds.minY) * 100)}%` }} />;
    })}
    {viewportStyle && <u style={viewportStyle} />}
  </div>;
}
