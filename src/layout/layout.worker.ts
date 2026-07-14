/// <reference lib="webworker" />
import ELK from "elkjs/lib/elk.bundled.js";
import { clusterTables, type LayoutCluster } from "../domain/clustering";
import type { LayoutNode, LayoutResult, SchemaDocument } from "../domain/types";
import { compactClusterLayout, packClusters, type ClusterLayout } from "./clusterPacking";

const elk = new ELK();
const PADDING = 70;

function tableHeight(document: SchemaDocument, tableId: string): number {
  return 58 + (document.tables.find((table) => table.id === tableId)?.columns.length ?? 0) * 34;
}

async function layoutCluster(document: SchemaDocument, cluster: LayoutCluster): Promise<ClusterLayout> {
  const members = new Set(cluster.tableIds);
  const internalRelationships = document.relationships.filter((relationship) => members.has(relationship.sourceTableId) && members.has(relationship.targetTableId));
  if (internalRelationships.length === 0) return compactClusterLayout(document, cluster);

  try {
    const layout = await elk.layout({
      id: cluster.id,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.aspectRatio": "1.6",
        "elk.spacing.nodeNode": "80",
        "elk.layered.spacing.nodeNodeBetweenLayers": "120",
        "elk.edgeRouting": "ORTHOGONAL",
      },
      children: cluster.tableIds.map((id) => ({ id, width: 260, height: tableHeight(document, id) })),
      edges: internalRelationships.map((relationship) => ({ id: relationship.id, sources: [relationship.sourceTableId], targets: [relationship.targetTableId] })),
    });
    if ((layout.children?.length ?? 0) !== cluster.tableIds.length) return compactClusterLayout(document, cluster);
    const rawNodes: LayoutNode[] = layout.children!.map((node) => ({
      id: node.id,
      x: node.x ?? 0,
      y: node.y ?? 0,
      width: node.width ?? 260,
      height: node.height ?? tableHeight(document, node.id),
    }));
    const minX = Math.min(...rawNodes.map((node) => node.x));
    const minY = Math.min(...rawNodes.map((node) => node.y));
    const nodes = rawNodes.map((node) => ({ ...node, x: node.x - minX + PADDING, y: node.y - minY + PADDING }));
    const width = Math.max(...nodes.map((node) => node.x + node.width)) + PADDING;
    const height = Math.max(...nodes.map((node) => node.y + node.height)) + PADDING;
    const elongation = Math.max(width / Math.max(1, height), height / Math.max(1, width));
    return elongation > 3.5 ? compactClusterLayout(document, cluster) : { cluster, nodes, width, height };
  } catch {
    return compactClusterLayout(document, cluster);
  }
}

interface LayoutRequest { document: SchemaDocument; mode?: "initial" | "manual" }

self.onmessage = async (event: MessageEvent<SchemaDocument | LayoutRequest>) => {
  const request = "document" in event.data ? event.data : { document: event.data, mode: "initial" as const };
  const document = request.document;
  const manual = request.mode === "manual";
  if (document.hasSavedLayout) {
    const result: LayoutResult = {
      nodes: document.tables.map((table) => ({ id: table.id, x: table.position.x, y: table.position.y, width: 260, height: tableHeight(document, table.id) })),
      edges: [],
    };
    self.postMessage(result);
    return;
  }

  const lockedTableIds = manual ? new Set(document.areas.filter((area) => area.locked).flatMap((area) => area.tableIds)) : new Set<string>();
  const layoutDocument = lockedTableIds.size === 0 ? document : {
    ...document,
    tables: document.tables.filter((table) => !lockedTableIds.has(table.id)),
    relationships: document.relationships.filter((relationship) => !lockedTableIds.has(relationship.sourceTableId) && !lockedTableIds.has(relationship.targetTableId)),
    areas: document.areas.filter((area) => !area.locked).map((area) => ({ ...area, tableIds: area.tableIds.filter((id) => !lockedTableIds.has(id)) })),
  };
  const localLayouts: ClusterLayout[] = [];
  for (const cluster of clusterTables(layoutDocument)) localLayouts.push(await layoutCluster(layoutDocument, cluster));
  const packed = packClusters(localLayouts);
  let arrangedNodes = packed.flatMap((layout) => layout.nodes.map((node) => ({ ...node, x: node.x + layout.x, y: node.y + layout.y })));
  const fixedNodes = document.tables.filter((table) => lockedTableIds.has(table.id)).map((table) => ({ id: table.id, x: table.position.x, y: table.position.y, width: 260, height: tableHeight(document, table.id) }));
  if (fixedNodes.length > 0 && arrangedNodes.length > 0) {
    const fixedMaxX = Math.max(...fixedNodes.map((node) => node.x + node.width));
    const fixedMinY = Math.min(...fixedNodes.map((node) => node.y));
    const arrangedMinX = Math.min(...arrangedNodes.map((node) => node.x));
    const arrangedMinY = Math.min(...arrangedNodes.map((node) => node.y));
    arrangedNodes = arrangedNodes.map((node) => ({ ...node, x: node.x + fixedMaxX + 220 - arrangedMinX, y: node.y + fixedMinY - arrangedMinY }));
  }
  const result: LayoutResult = {
    kind: manual ? "manual" : "initial",
    nodes: [...fixedNodes, ...arrangedNodes],
    edges: [],
  };
  self.postMessage(result);
};
