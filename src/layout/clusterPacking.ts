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
const AREA_PADDING = 50;
const NOTE_WIDTH = 220;
const NOTE_HEIGHT = 110;

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boundsOf(items: Bounds[]): Bounds | null {
  if (items.length === 0) return null;
  return {
    minX: Math.min(...items.map((item) => item.minX)),
    minY: Math.min(...items.map((item) => item.minY)),
    maxX: Math.max(...items.map((item) => item.maxX)),
    maxY: Math.max(...items.map((item) => item.maxY)),
  };
}

function center(bounds: Bounds): { x: number; y: number } {
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

function originalTableBounds(document: SchemaDocument, tableId: string): Bounds | null {
  const table = document.tables.find((item) => item.id === tableId);
  return table ? { minX: table.position.x, minY: table.position.y, maxX: table.position.x + tableWidth(table), maxY: table.position.y + tableHeight(table) } : null;
}

function layoutNodeBounds(nodes: Map<string, LayoutNode>, tableId: string): Bounds | null {
  const node = nodes.get(tableId);
  return node ? { minX: node.x, minY: node.y, maxX: node.x + node.width, maxY: node.y + node.height } : null;
}

function shiftedNoteBounds(document: SchemaDocument, noteId: string, delta: { x: number; y: number }): Bounds | null {
  const note = document.notes.find((item) => item.id === noteId);
  return note ? { minX: note.x + delta.x, minY: note.y + delta.y, maxX: note.x + delta.x + NOTE_WIDTH, maxY: note.y + delta.y + NOTE_HEIGHT } : null;
}

export function reserveAreaClusterFootprint(document: SchemaDocument, layout: ClusterLayout): ClusterLayout {
  if (layout.cluster.kind !== "area" || !layout.cluster.areaId) return layout;
  const area = document.areas.find((item) => item.id === layout.cluster.areaId);
  if (!area) return layout;

  const nodeById = new Map(layout.nodes.map((node) => [node.id, node]));
  const previousTableBounds = boundsOf(area.tableIds.flatMap((id) => originalTableBounds(document, id) ?? []));
  const nextTableBounds = boundsOf(area.tableIds.flatMap((id) => layoutNodeBounds(nodeById, id) ?? []));
  if (!nextTableBounds) return layout;
  const delta = previousTableBounds
    ? { x: center(nextTableBounds).x - center(previousTableBounds).x, y: center(nextTableBounds).y - center(previousTableBounds).y }
    : { x: 0, y: 0 };
  const contentBounds = boundsOf([
    nextTableBounds,
    ...(area.noteIds ?? []).flatMap((id) => shiftedNoteBounds(document, id, delta) ?? []),
  ]);
  if (!contentBounds) return layout;

  const footprint = {
    minX: contentBounds.minX - AREA_PADDING,
    minY: contentBounds.minY - AREA_PADDING,
    maxX: contentBounds.maxX + AREA_PADDING,
    maxY: contentBounds.maxY + AREA_PADDING,
  };
  const shiftX = Math.max(0, -footprint.minX);
  const shiftY = Math.max(0, -footprint.minY);
  return {
    ...layout,
    nodes: shiftX || shiftY ? layout.nodes.map((node) => ({ ...node, x: node.x + shiftX, y: node.y + shiftY })) : layout.nodes,
    width: Math.max(layout.width + shiftX, footprint.maxX + shiftX),
    height: Math.max(layout.height + shiftY, footprint.maxY + shiftY),
  };
}

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
  return reserveAreaClusterFootprint(document, {
    cluster,
    nodes,
    width: CLUSTER_PADDING * 2 + columnWidths.reduce((sum, value) => sum + value, 0) + Math.max(0, columns - 1) * COLUMN_GAP,
    height: Math.max(...columnHeights, CLUSTER_PADDING * 2) - ROW_GAP + CLUSTER_PADDING,
  });
}

function shelve(layouts: ClusterLayout[], targetWidth: number): PackedCluster[] {
  const rows: ClusterLayout[][] = [];
  let row: ClusterLayout[] = [];
  let x = 0;
  layouts.forEach((layout) => {
    if (x > 0 && x + layout.width > targetWidth) {
      rows.push(row);
      row = [];
      x = 0;
    }
    row.push(layout);
    x += layout.width + CLUSTER_GAP;
  });
  if (row.length > 0) rows.push(row);

  const packed: PackedCluster[] = [];
  let y = 0;
  rows.forEach((members, index) => {
    // Serpentine rows: reversing every other row keeps clusters that are
    // neighbours in the visiting order physically adjacent across the wrap,
    // instead of throwing them to opposite ends of the canvas.
    const sequence = index % 2 === 1 ? [...members].reverse() : members;
    const offsets = new Map<ClusterLayout, number>();
    let cursor = 0;
    sequence.forEach((layout) => {
      offsets.set(layout, cursor);
      cursor += layout.width + CLUSTER_GAP;
    });
    members.forEach((layout) => packed.push({ ...layout, x: offsets.get(layout)!, y }));
    y += Math.max(...members.map((layout) => layout.height)) + CLUSTER_GAP;
  });
  return packed;
}

function packedAspect(packed: PackedCluster[]): number {
  const width = Math.max(...packed.map((item) => item.x + item.width));
  const height = Math.max(...packed.map((item) => item.y + item.height));
  return width / Math.max(1, height);
}

/**
 * Visits clusters in connectivity order so clusters joined by foreign keys land
 * on adjacent shelves instead of wherever `clusterTables` happened to emit them.
 */
function connectivityOrder(layouts: ClusterLayout[], document: SchemaDocument): ClusterLayout[] {
  const clusterOf = new Map<string, string>();
  layouts.forEach((layout) => layout.cluster.tableIds.forEach((id) => clusterOf.set(id, layout.cluster.id)));
  const links = new Map<string, Map<string, number>>(layouts.map((layout) => [layout.cluster.id, new Map()]));
  document.relationships.forEach((relationship) => {
    const source = clusterOf.get(relationship.sourceTableId);
    const target = clusterOf.get(relationship.targetTableId);
    if (!source || !target || source === target) return;
    links.get(source)!.set(target, (links.get(source)!.get(target) ?? 0) + 1);
    links.get(target)!.set(source, (links.get(target)!.get(source) ?? 0) + 1);
  });

  const byId = new Map(layouts.map((layout) => [layout.cluster.id, layout]));
  const area = (id: string) => byId.get(id)!.width * byId.get(id)!.height;
  const unplaced = new Set(byId.keys());
  const ordered: ClusterLayout[] = [];
  while (unplaced.size > 0) {
    const seed = [...unplaced].sort((left, right) => area(right) - area(left) || left.localeCompare(right))[0];
    const queue = [seed];
    unplaced.delete(seed);
    while (queue.length > 0) {
      const current = queue.shift()!;
      ordered.push(byId.get(current)!);
      [...(links.get(current) ?? new Map<string, number>()).entries()]
        .sort(([leftId, leftWeight], [rightId, rightWeight]) => rightWeight - leftWeight || leftId.localeCompare(rightId))
        .forEach(([neighbor]) => {
          if (unplaced.delete(neighbor)) queue.push(neighbor);
        });
    }
  }
  return ordered;
}

/**
 * Picks the shelf width whose resulting bounding box sits closest to
 * `aspectRatio`. Flooring the width at the widest cluster (the previous
 * behaviour) forced one cluster per row whenever clusters were similarly wide.
 */
export function packClusters(layouts: ClusterLayout[], aspectRatio = 1.6, document?: SchemaDocument): PackedCluster[] {
  if (layouts.length === 0) return [];
  const ordered = document ? connectivityOrder(layouts, document) : layouts;
  const widest = Math.max(...ordered.map((layout) => layout.width));
  const candidates = new Set<number>([widest]);
  let run = 0;
  ordered.forEach((layout) => {
    run += layout.width + CLUSTER_GAP;
    candidates.add(Math.max(widest, run - CLUSTER_GAP));
  });

  let best: PackedCluster[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  candidates.forEach((targetWidth) => {
    const packed = shelve(ordered, targetWidth);
    const score = Math.abs(Math.log(packedAspect(packed) / aspectRatio));
    if (score < bestScore) {
      bestScore = score;
      best = packed;
    }
  });
  return best ?? shelve(ordered, widest);
}

export function clusteredGridLayout(document: SchemaDocument): LayoutResult {
  if (document.hasSavedLayout) {
    return {
      nodes: document.tables.map((table) => ({ id: table.id, x: table.position.x, y: table.position.y, width: tableWidth(table), height: tableHeight(table) })),
      edges: [],
    };
  }
  const packed = packClusters(clusterTables(document).map((cluster) => compactClusterLayout(document, cluster)), 1.6, document);
  return {
    nodes: packed.flatMap((layout) => layout.nodes.map((node) => ({ ...node, x: node.x + layout.x, y: node.y + layout.y }))),
    edges: [],
  };
}
