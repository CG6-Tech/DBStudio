import type { Point } from "../../domain/relationshipGeometry";

/**
 * Pure scene primitives shared by the diagram canvas.
 *
 * Everything here is plain-data-in / plain-data-out with no PixiJS, DOM, React,
 * or module-state side effects — safe to unit-test and reuse in isolation.
 */

export const colors = {
  canvas: 0x0d1114,
  grid: 0x20272b,
  card: 0x171d21,
  cardTop: 0x1e262b,
  border: 0x344047,
  selected: 0x7ee0b5,
  text: 0xe9f1ed,
  muted: 0x8f9b97,
  type: 0x799089,
  key: 0xf5bd69,
  edge: 0x63736d,
};

export const areaResizeTargetSize = 28;
export const areaLabelOffset = { x: 12, y: -15 };
export const tableCommentSize = { width: 220, height: 110, gap: 18 };

export function pixelPoint(point: Point): Point {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

export function colorNumber(value: string): number {
  return Number.parseInt(value.replace("#", ""), 16);
}
