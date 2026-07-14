export interface CanvasPoint {
  x: number;
  y: number;
}

export interface AreaSize {
  width: number;
  height: number;
}

export const MIN_AREA_WIDTH = 220;
export const MIN_AREA_HEIGHT = 140;

export function pointerDelta(start: CanvasPoint, current: CanvasPoint, scale: number): CanvasPoint {
  const safeScale = scale > 0 ? scale : 1;
  return {
    x: (current.x - start.x) / safeScale,
    y: (current.y - start.y) / safeScale,
  };
}

export function moveArea(start: CanvasPoint, delta: CanvasPoint): CanvasPoint {
  return { x: start.x + delta.x, y: start.y + delta.y };
}

export function resizeArea(start: AreaSize, delta: CanvasPoint): AreaSize {
  return {
    width: Math.max(MIN_AREA_WIDTH, start.width + delta.x),
    height: Math.max(MIN_AREA_HEIGHT, start.height + delta.y),
  };
}
