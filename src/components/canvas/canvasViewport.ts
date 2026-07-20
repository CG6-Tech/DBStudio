import { BASE_GRID_SIZE, quantizeDevicePixel, zoomAround } from "../../domain/canvasGeometry";
import { MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM } from "../../domain/viewportGeometry";

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
