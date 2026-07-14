export const MIN_CANVAS_ZOOM = 0.001;
export const MAX_CANVAS_ZOOM = 2.2;

export interface ViewportBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function scaleToFit(
  viewportWidth: number,
  viewportHeight: number,
  bounds: ViewportBounds,
  padding = 140,
): number {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const availableWidth = Math.max(1, viewportWidth - padding);
  const availableHeight = Math.max(1, viewportHeight - padding);
  return Math.min(1.15, Math.max(MIN_CANVAS_ZOOM, Math.min(availableWidth / width, availableHeight / height)));
}
