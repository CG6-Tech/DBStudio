import RBush from "rbush";
import type { Point } from "./relationshipGeometry";

export interface RelationshipSegmentItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
  relationshipId: string;
  start: Point;
  end: Point;
}

export function isRelationshipDeleteKey(key: string): boolean {
  return key === "Backspace" || key === "Delete";
}

export function pointToSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

export function relationshipSegments(relationshipId: string, points: Point[]): RelationshipSegmentItem[] {
  return points.slice(1).map((end, index) => {
    const start = points[index];
    return { id: `${relationshipId}:${index}`, relationshipId, start, end, minX: Math.min(start.x, end.x), minY: Math.min(start.y, end.y), maxX: Math.max(start.x, end.x), maxY: Math.max(start.y, end.y) };
  });
}

export function nearestRelationship(index: RBush<RelationshipSegmentItem>, point: Point, tolerance: number): string | null {
  let nearestId: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  index.search({ minX: point.x - tolerance, minY: point.y - tolerance, maxX: point.x + tolerance, maxY: point.y + tolerance }).forEach((segment) => {
    const distance = pointToSegmentDistance(point, segment.start, segment.end);
    if (distance <= tolerance && (distance < nearestDistance || (distance === nearestDistance && segment.relationshipId < (nearestId ?? "")))) {
      nearestId = segment.relationshipId;
      nearestDistance = distance;
    }
  });
  return nearestId;
}
