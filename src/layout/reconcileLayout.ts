import type { LayoutNode, LayoutResult, SchemaDocument } from "../domain/types";

function nodeHeight(document: SchemaDocument, tableId: string): number {
  return 58 + (document.tables.find((table) => table.id === tableId)?.columns.length ?? 0) * 34;
}

export function reconcileLayout(document: SchemaDocument, current: LayoutResult): LayoutResult {
  const existing = new Map(current.nodes.map((node) => [node.id, node]));
  const unchanged = current.nodes.length === document.tables.length && document.tables.every((table) => {
    const node = existing.get(table.id);
    return node?.width === 260 && node.height === nodeHeight(document, table.id);
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
    const height = nodeHeight(document, table.id);
    if (prior) return prior.height === height && prior.width === 260 ? prior : { ...prior, width: 260, height };
    const index = added++;
    return {
      id: table.id,
      x: 80 + (index % 4) * 340,
      y: maxY + 180 + Math.floor(index / 4) * (height + 80),
      width: 260,
      height,
    };
  });
  const relationshipIds = new Set(document.relationships.map((relationship) => relationship.id));
  return { ...current, nodes, edges: current.edges.filter((edge) => relationshipIds.has(edge.id)) };
}
