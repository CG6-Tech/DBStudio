import type { LayoutNode, LayoutResult, SchemaDocument } from "../domain/types";
import { tableHeight, tableWidth } from "../domain/tableGeometry";

export function reconcileLayout(document: SchemaDocument, current: LayoutResult): LayoutResult {
  const existing = new Map(current.nodes.map((node) => [node.id, node]));
  const unchanged = current.nodes.length === document.tables.length && document.tables.every((table) => {
    const node = existing.get(table.id);
    return node?.width === tableWidth(table) && node.height === tableHeight(table);
  });
  if (unchanged) return current;

  const retained = document.tables.filter((table) => existing.has(table.id));
  const maxY = Math.max(0, ...retained.map((table) => {
    const node = existing.get(table.id)!;
    return node.y + node.height;
  }));
  let added = 0;
  const nodes: LayoutNode[] = document.tables.map((table) => {
    const prior = existing.get(table.id);
    const width = tableWidth(table);
    const height = tableHeight(table);
    if (prior) return prior.height === height && prior.width === width ? prior : { ...prior, width, height };
    const index = added++;
    return {
      id: table.id,
      x: 80 + (index % 4) * 340,
      y: maxY + 180 + Math.floor(index / 4) * (height + 80),
      width,
      height,
    };
  });
  const relationshipIds = new Set(document.relationships.map((relationship) => relationship.id));
  return { ...current, nodes, edges: current.edges.filter((edge) => relationshipIds.has(edge.id)) };
}
