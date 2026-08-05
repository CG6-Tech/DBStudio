import type { LayoutNode, LayoutResult, SchemaDocument } from "../domain/types";
import { tableHeight, tableWidth } from "../domain/tableGeometry";

const NODE_GAP = 80;
const RELATED_GAP = 120;
const SWEEP_LIMIT = 200;

/** Slides a candidate down past anything it would land on. */
function freePosition(seed: { x: number; y: number }, width: number, height: number, occupied: LayoutNode[]): { x: number; y: number } {
  let { x, y } = seed;
  for (let attempt = 0; attempt < SWEEP_LIMIT; attempt += 1) {
    const clash = occupied.find((node) => x < node.x + node.width + NODE_GAP && node.x < x + width + NODE_GAP && y < node.y + node.height + NODE_GAP && node.y < y + height + NODE_GAP);
    if (!clash) break;
    y = clash.y + clash.height + NODE_GAP;
  }
  return { x, y };
}

function neighbourIds(document: SchemaDocument): Map<string, Set<string>> {
  const neighbours = new Map<string, Set<string>>();
  const link = (from: string, to: string) => {
    const targets = neighbours.get(from) ?? new Set<string>();
    targets.add(to);
    neighbours.set(from, targets);
  };
  document.relationships.forEach((relationship) => {
    link(relationship.sourceTableId, relationship.targetTableId);
    link(relationship.targetTableId, relationship.sourceTableId);
  });
  return neighbours;
}

export function reconcileLayout(document: SchemaDocument, current: LayoutResult): LayoutResult {
  const existing = new Map(current.nodes.map((node) => [node.id, node]));
  const unchanged = current.nodes.length === document.tables.length && document.tables.every((table) => {
    const node = existing.get(table.id);
    return node?.width === tableWidth(table) && node.height === tableHeight(table);
  });
  if (unchanged) return current;

  const retained = new Map<string, LayoutNode>();
  document.tables.forEach((table) => {
    const prior = existing.get(table.id);
    if (!prior) return;
    const width = tableWidth(table);
    const height = tableHeight(table);
    retained.set(table.id, prior.width === width && prior.height === height ? prior : { ...prior, width, height });
  });

  const occupied = [...retained.values()];
  const maxY = Math.max(0, ...occupied.map((node) => node.y + node.height));
  const neighbours = neighbourIds(document);
  const placed = new Map<string, LayoutNode>();
  let added = 0;

  document.tables.filter((table) => !retained.has(table.id)).forEach((table) => {
    const width = tableWidth(table);
    const height = tableHeight(table);
    // Anchor a new table beside whatever it references; dropping it below the
    // whole diagram left every new foreign key spanning the entire canvas.
    const anchors = [...(neighbours.get(table.id) ?? [])].flatMap((id) => {
      const node = retained.get(id) ?? placed.get(id);
      return node ? [node] : [];
    });
    const index = added++;
    const seed = anchors.length > 0
      ? {
        x: Math.max(...anchors.map((node) => node.x + node.width)) + RELATED_GAP,
        y: anchors.reduce((sum, node) => sum + node.y + node.height / 2, 0) / anchors.length - height / 2,
      }
      : { x: 80 + (index % 4) * 340, y: maxY + 180 + Math.floor(index / 4) * (height + 80) };
    const node = { id: table.id, ...freePosition(seed, width, height, occupied), width, height };
    occupied.push(node);
    placed.set(table.id, node);
  });

  const nodes: LayoutNode[] = document.tables.map((table) => retained.get(table.id) ?? placed.get(table.id)!);
  const relationshipIds = new Set(document.relationships.map((relationship) => relationship.id));
  return { ...current, nodes, edges: current.edges.filter((edge) => relationshipIds.has(edge.id)) };
}
