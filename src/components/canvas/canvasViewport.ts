import { BASE_GRID_SIZE, projectPoint, quantizeDevicePixel, zoomAround } from "../../domain/canvasGeometry";
import { MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM, type ViewportBounds } from "../../domain/viewportGeometry";

export interface CanvasViewport {
  x: number;
  y: number;
  scale: number;
}

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasWheelInput {
  clientX: number;
  clientY: number;
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  metaKey: boolean;
}

export const CANVAS_PINCH_ZOOM_SENSITIVITY = 0.0024;

export function syncCanvasGrid(host: HTMLElement | null, viewport: CanvasViewport, previousLevel: number): number {
  if (!host) return previousLevel;
  const devicePixelRatio = window.devicePixelRatio || 1;
  const spacing = quantizeDevicePixel(BASE_GRID_SIZE * viewport.scale, devicePixelRatio);
  const radius = quantizeDevicePixel(1, devicePixelRatio);
  const offsetX = quantizeDevicePixel(((viewport.x % spacing) + spacing) % spacing, devicePixelRatio);
  const offsetY = quantizeDevicePixel(((viewport.y % spacing) + spacing) % spacing, devicePixelRatio);
  host.style.setProperty("--grid-spacing", `${spacing}px`);
  host.style.setProperty("--grid-radius", `${radius}px`);
  host.style.setProperty("--grid-x", `${offsetX}px`);
  host.style.setProperty("--grid-y", `${offsetY}px`);
  return previousLevel;
}

export function panViewport(start: CanvasViewport, startPointer: CanvasPoint, currentPointer: CanvasPoint): CanvasViewport {
  return {
    ...start,
    x: start.x + currentPointer.x - startPointer.x,
    y: start.y + currentPointer.y - startPointer.y,
  };
}

export function wheelViewport(current: CanvasViewport, wheel: CanvasWheelInput, bounds: DOMRect): CanvasViewport {
  if (wheel.ctrlKey || wheel.metaKey) {
    const anchor = { x: wheel.clientX - bounds.left, y: wheel.clientY - bounds.top };
    const nextScale = Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, current.scale * Math.exp(-wheel.deltaY * CANVAS_PINCH_ZOOM_SENSITIVITY)));
    return zoomAround(current, anchor, nextScale);
  }
  return { ...current, x: current.x - wheel.deltaX, y: current.y - wheel.deltaY };
}

export function zoomViewportAtCenter(current: CanvasViewport, bounds: { width: number; height: number }, scale: number): CanvasViewport {
  return zoomAround(current, { x: bounds.width / 2, y: bounds.height / 2 }, Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, scale)));
}

/** Percentages (0–1 → apply `* 100` and `%`) describing where the visible screen sits within the workspace bounds. */
export interface MinimapViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The minimap's viewport indicator rectangle, as workspace-relative fractions.
 * Shared by the PixiJS `DiagramCanvas` (imperative, per-pan-frame) and the React
 * `CanvasMinimap` (per-render) so the projection/clamp math lives in one place.
 */
export function minimapViewportRect(viewport: CanvasViewport, screen: { width: number; height: number }, bounds: ViewportBounds): MinimapViewportRect {
  const topLeft = projectPoint({ x: -viewport.x / viewport.scale, y: -viewport.y / viewport.scale }, bounds);
  const bottomRight = projectPoint({ x: (screen.width - viewport.x) / viewport.scale, y: (screen.height - viewport.y) / viewport.scale }, bounds);
  return {
    left: Math.max(0, topLeft.x),
    top: Math.max(0, topLeft.y),
    width: Math.max(0.03, Math.min(1, bottomRight.x) - Math.max(0, topLeft.x)),
    height: Math.max(0.03, Math.min(1, bottomRight.y) - Math.max(0, topLeft.y)),
  };
}
