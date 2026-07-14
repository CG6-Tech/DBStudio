import { clusterTables, type LayoutCluster } from "../domain/clustering";
import type { LayoutNode, LayoutResult, SchemaDocument } from "../domain/types";

export interface ClusterLayout {
  cluster: LayoutCluster;
  nodes: LayoutNode[];
  width: number;
  height: number;
}

export interface PackedCluster extends ClusterLayout {
  x: number;
  y: number;
}

const CARD_WIDTH = 260;
const COLUMN_GAP = 80;
const ROW_GAP = 80;
const CLUSTER_GAP = 220;
const CLUSTER_PADDING = 70;

function tableHeight(document: SchemaDocument, tableId: string): number {
  const table = document.tables.find((item) => item.id === tableId);
  return 58 + (table?.columns.length ?? 0) * 34;
}

export function compactClusterLayout(document: SchemaDocument, cluster: LayoutCluster): ClusterLayout {
  const columns = Math.max(1, Math.ceil(Math.sqrt(cluster.tableIds.length)));
  const columnHeights = Array.from({ length: columns }, () => CLUSTER_PADDING);
  const nodes = cluster.tableIds.map((id) => {
    const height = tableHeight(document, id);
    const column = columnHeights.indexOf(Math.min(...columnHeights));
    const node = {
      id,
      x: CLUSTER_PADDING + column * (CARD_WIDTH + COLUMN_GAP),
      y: columnHeights[column],
      width: CARD_WIDTH,
      height,
    };
    columnHeights[column] += height + ROW_GAP;
    return node;
  });
  return {
    cluster,
    nodes,
    width: CLUSTER_PADDING * 2 + columns * CARD_WIDTH + Math.max(0, columns - 1) * COLUMN_GAP,
    height: Math.max(...columnHeights, CLUSTER_PADDING * 2) - ROW_GAP + CLUSTER_PADDING,
  };
}

export function packClusters(layouts: ClusterLayout[], aspectRatio = 1.6): PackedCluster[] {
  if (layouts.length === 0) return [];
  const totalArea = layouts.reduce((sum, layout) => sum + layout.width * layout.height, 0);
  const targetWidth = Math.max(...layouts.map((layout) => layout.width), Math.sqrt(totalArea * aspectRatio));
  const packed: PackedCluster[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  layouts.forEach((layout) => {
    if (x > 0 && x + layout.width > targetWidth) {
      x = 0;
      y += rowHeight + CLUSTER_GAP;
      rowHeight = 0;
    }
    packed.push({ ...layout, x, y });
    x += layout.width + CLUSTER_GAP;
    rowHeight = Math.max(rowHeight, layout.height);
  });
  return packed;
}

export function clusteredGridLayout(document: SchemaDocument): LayoutResult {
  if (document.hasSavedLayout) {
    return {
      nodes: document.tables.map((table) => ({ id: table.id, x: table.position.x, y: table.position.y, width: CARD_WIDTH, height: tableHeight(document, table.id) })),
      edges: [],
    };
  }
  const packed = packClusters(clusterTables(document).map((cluster) => compactClusterLayout(document, cluster)));
  return {
    nodes: packed.flatMap((layout) => layout.nodes.map((node) => ({ ...node, x: node.x + layout.x, y: node.y + layout.y }))),
    edges: [],
  };
}
