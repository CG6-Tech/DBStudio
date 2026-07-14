import { MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM, type ViewportBounds } from "./viewportGeometry";

export const BASE_GRID_SIZE = 28;
const GRID_COARSEN_THRESHOLD = 8;
const GRID_REFINE_THRESHOLD = 12;

export function quantizeDevicePixel(value: number, devicePixelRatio = 1): number {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.round(value * ratio) / ratio;
}

export function adaptiveGrid(scale: number, previousLevel?: number, devicePixelRatio = 1): { spacing: number; radius: number; level: number } {
  const safeScale = Number.isFinite(scale) ? Math.max(MIN_CANVAS_ZOOM, scale) : 1;
  let level = previousLevel && previousLevel >= 1 ? previousLevel : 1;
  if (previousLevel === undefined) {
    while (BASE_GRID_SIZE * safeScale * level < 10) level *= 2;
  } else {
    while (BASE_GRID_SIZE * safeScale * level < GRID_COARSEN_THRESHOLD) level *= 2;
    while (level > 1 && BASE_GRID_SIZE * safeScale * (level / 2) > GRID_REFINE_THRESHOLD) level /= 2;
  }
  return {
    spacing: quantizeDevicePixel(BASE_GRID_SIZE * safeScale * level, devicePixelRatio),
    level,
    radius: quantizeDevicePixel(1, devicePixelRatio),
  };
}

export function zoomAround(viewport: { x: number; y: number; scale: number }, anchor: { x: number; y: number }, requestedScale: number) {
  const scale = Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, requestedScale));
  const worldX = (anchor.x - viewport.x) / viewport.scale;
  const worldY = (anchor.y - viewport.y) / viewport.scale;
  return { x: anchor.x - worldX * scale, y: anchor.y - worldY * scale, scale };
}

export function snapPoint(point: { x: number; y: number }, size = BASE_GRID_SIZE) {
  return { x: Math.round(point.x / size) * size, y: Math.round(point.y / size) * size };
}

export function projectPoint(point: { x: number; y: number }, bounds: ViewportBounds) {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  return { x: (point.x - bounds.minX) / width, y: (point.y - bounds.minY) / height };
}
