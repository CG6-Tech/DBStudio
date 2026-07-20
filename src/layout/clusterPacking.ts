import { clusterTables, type LayoutCluster } from "../domain/clustering";
import type { LayoutNode, LayoutResult, SchemaDocument } from "../domain/types";
import { tableHeight, tableWidth } from "../domain/tableGeometry";

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

const COLUMN_GAP = 80;
const ROW_GAP = 80;
const CLUSTER_GAP = 220;
const CLUSTER_PADDING = 70;

export function compactClusterLayout(document: SchemaDocument, cluster: LayoutCluster): ClusterLayout {
  const columns = Math.max(1, Math.ceil(Math.sqrt(cluster.tableIds.length)));
  const columnHeights = Array.from({ length: columns }, () => CLUSTER_PADDING);
  const columnWidths = Array.from({ length: columns }, () => 0);
  const placements = cluster.tableIds.map((id) => {
    const table = document.tables.find((item) => item.id === id)!;
    const width = tableWidth(table);
    const height = tableHeight(table);
    const column = columnHeights.indexOf(Math.min(...columnHeights));
    const y = columnHeights[column];
    columnWidths[column] = Math.max(columnWidths[column], width);
    columnHeights[column] += height + ROW_GAP;
    return { id, column, y, width, height };
  });
  const columnOffsets = columnWidths.map((_width, column) => CLUSTER_PADDING + columnWidths.slice(0, column).reduce((sum, value) => sum + value + COLUMN_GAP, 0));
  const nodes = placements.map(({ column, ...node }) => ({ ...node, x: columnOffsets[column] }));
  return {
    cluster,
    nodes,
    width: CLUSTER_PADDING * 2 + columnWidths.reduce((sum, value) => sum + value, 0) + Math.max(0, columns - 1) * COLUMN_GAP,
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
      nodes: document.tables.map((table) => ({ id: table.id, x: table.position.x, y: table.position.y, width: tableWidth(table), height: tableHeight(table) })),
      edges: [],
    };
  }
  const packed = packClusters(clusterTables(document).map((cluster) => compactClusterLayout(document, cluster)));
  return {
    nodes: packed.flatMap((layout) => layout.nodes.map((node) => ({ ...node, x: node.x + layout.x, y: node.y + layout.y }))),
    edges: [],
  };
}
