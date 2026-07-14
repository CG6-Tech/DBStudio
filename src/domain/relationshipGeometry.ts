import type { Column, LayoutNode, Relationship, SchemaDocument, Table } from "./types";

export const TABLE_HEADER_HEIGHT = 50;
export const FIELD_ROW_TOP = 58;
export const FIELD_ROW_HEIGHT = 34;
export const FIELD_ANCHOR_OFFSET = 10;

export type AnchorSide = "left" | "right";

export interface Point {
  x: number;
  y: number;
}

export interface FieldAnchor {
  point: Point;
  side: AnchorSide;
  columnId: string;
}

export interface RelationshipGeometry {
  source: FieldAnchor;
  target: FieldAnchor;
  points: Point[];
  sourceBadge: Point;
  targetBadge: Point;
  sourceCardinality: "1" | "N";
  targetCardinality: "1";
}

function samePoint(first: Point, second: Point): boolean {
  return Math.abs(first.x - second.x) < 0.0001 && Math.abs(first.y - second.y) < 0.0001;
}

export function roundedOrthogonalPath(points: Point[], radius = 12, samplesPerCorner = 6): Point[] {
  if (points.length < 3 || radius <= 0 || samplesPerCorner < 1) return [...points];
  const rounded: Point[] = [{ ...points[0] }];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const incoming = { x: corner.x - previous.x, y: corner.y - previous.y };
    const outgoing = { x: next.x - corner.x, y: next.y - corner.y };
    const incomingLength = Math.hypot(incoming.x, incoming.y);
    const outgoingLength = Math.hypot(outgoing.x, outgoing.y);
    const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;

    if (incomingLength === 0 || outgoingLength === 0 || Math.abs(cross) < 0.0001) {
      if (!samePoint(rounded.at(-1)!, corner)) rounded.push({ ...corner });
      continue;
    }

    const cornerRadius = Math.min(radius, incomingLength / 2, outgoingLength / 2);
    const before = {
      x: corner.x - (incoming.x / incomingLength) * cornerRadius,
      y: corner.y - (incoming.y / incomingLength) * cornerRadius,
    };
    const after = {
      x: corner.x + (outgoing.x / outgoingLength) * cornerRadius,
      y: corner.y + (outgoing.y / outgoingLength) * cornerRadius,
    };
    if (!samePoint(rounded.at(-1)!, before)) rounded.push(before);

    for (let sample = 1; sample <= samplesPerCorner; sample += 1) {
      const t = sample / samplesPerCorner;
      const inverse = 1 - t;
      rounded.push({
        x: inverse * inverse * before.x + 2 * inverse * t * corner.x + t * t * after.x,
        y: inverse * inverse * before.y + 2 * inverse * t * corner.y + t * t * after.y,
      });
    }
  }

  const last = points.at(-1)!;
  if (!samePoint(rounded.at(-1)!, last)) rounded.push({ ...last });
  return rounded;
}

function columnIndex(table: Table, columnId: string): number {
  return Math.max(0, table.columns.findIndex((column) => column.id === columnId));
}

export function fieldAnchor(node: LayoutNode, table: Table, columnId: string, side: AnchorSide): FieldAnchor {
  return {
    columnId,
    side,
    point: {
      x: side === "left" ? node.x : node.x + node.width,
      y: node.y + FIELD_ROW_TOP + columnIndex(table, columnId) * FIELD_ROW_HEIGHT + FIELD_ANCHOR_OFFSET,
    },
  };
}

export function relationshipCardinality(sourceColumn: Column): "1" | "N" {
  return sourceColumn.unique || sourceColumn.primaryKey ? "1" : "N";
}

export function connectedRelationshipIds(document: SchemaDocument, activeTableId: string | null): Set<string> {
  if (!activeTableId) return new Set();
  return new Set(document.relationships
    .filter((relationship) => relationship.sourceTableId === activeTableId || relationship.targetTableId === activeTableId)
    .map((relationship) => relationship.id));
}

export function relationshipAnimationEnabled(activeRelationshipCount: number, reducedMotion: boolean): boolean {
  return activeRelationshipCount > 0 && !reducedMotion;
}

function removeRedundantPoints(points: Point[]): Point[] {
  return points.filter((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    if (point.x === previous.x && point.y === previous.y) return false;
    if (index === points.length - 1) return true;
    const next = points[index + 1];
    return !((previous.x === point.x && point.x === next.x) || (previous.y === point.y && point.y === next.y));
  });
}

export function buildRelationshipGeometry(
  document: SchemaDocument,
  relationship: Relationship,
  nodeById: Map<string, LayoutNode>,
): RelationshipGeometry | null {
  const sourceTable = document.tables.find((table) => table.id === relationship.sourceTableId);
  const targetTable = document.tables.find((table) => table.id === relationship.targetTableId);
  const sourceColumn = sourceTable?.columns.find((column) => column.id === relationship.sourceColumnId);
  const sourceNode = nodeById.get(relationship.sourceTableId);
  const targetNode = nodeById.get(relationship.targetTableId);
  if (!sourceTable || !targetTable || !sourceColumn || !sourceNode || !targetNode) return null;

  const sourceCenter = sourceNode.x + sourceNode.width / 2;
  const targetCenter = targetNode.x + targetNode.width / 2;
  const sourceSide: AnchorSide = sourceCenter <= targetCenter ? "right" : "left";
  const targetSide: AnchorSide = sourceSide === "right" ? "left" : "right";
  const source = fieldAnchor(sourceNode, sourceTable, relationship.sourceColumnId, sourceSide);
  const target = fieldAnchor(targetNode, targetTable, relationship.targetColumnId, targetSide);
  const sourceDirection = sourceSide === "right" ? 1 : -1;
  const targetDirection = targetSide === "right" ? 1 : -1;
  const sourceOut = { x: source.point.x + sourceDirection * 42, y: source.point.y };
  const targetOut = { x: target.point.x + targetDirection * 42, y: target.point.y };
  const middleX = (sourceOut.x + targetOut.x) / 2;
  const points = removeRedundantPoints([
    source.point,
    sourceOut,
    { x: middleX, y: sourceOut.y },
    { x: middleX, y: targetOut.y },
    targetOut,
    target.point,
  ]);

  return {
    source,
    target,
    points,
    sourceBadge: { x: source.point.x + sourceDirection * 24, y: source.point.y },
    targetBadge: { x: target.point.x + targetDirection * 24, y: target.point.y },
    sourceCardinality: relationshipCardinality(sourceColumn),
    targetCardinality: "1",
  };
}
