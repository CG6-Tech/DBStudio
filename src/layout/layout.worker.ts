/// <reference lib="webworker" />
import ELK from "elkjs/lib/elk-api.js";
import * as ELKWorkerModule from "elkjs/lib/elk-worker.min.js";
import { clusterTables, type LayoutCluster } from "../domain/clustering";
import type { LayoutNode, LayoutResult, SchemaDocument } from "../domain/types";
import { compactClusterLayout, packClusters, type ClusterLayout } from "./clusterPacking";
import { resolveElkWorkerConstructor } from "./elkWorkerFactory";
import { tableHeight, tableWidth } from "../domain/tableGeometry";

const PADDING = 70;
type ElkInstance = InstanceType<typeof ELK>;
let elkInstance: ElkInstance | null | undefined;

function optionalElk(): ElkInstance | null {
  if (elkInstance !== undefined) return elkInstance;
  try {
    const WorkerConstructor = resolveElkWorkerConstructor(ELKWorkerModule);
    elkInstance = new ELK({ workerFactory: () => new WorkerConstructor() as unknown as Worker });
  } catch {
    elkInstance = null;
  }
  return elkInstance;
}

async function layoutCluster(document: SchemaDocument, cluster: LayoutCluster): Promise<ClusterLayout> {
  const members = new Set(cluster.tableIds);
  const internalRelationships = document.relationships.filter((relationship) => members.has(relationship.sourceTableId) && members.has(relationship.targetTableId));
  if (internalRelationships.length === 0) return compactClusterLayout(document, cluster);

  try {
    const elk = optionalElk();
    if (!elk) return compactClusterLayout(document, cluster);
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
      children: cluster.tableIds.map((id) => { const table = document.tables.find((item) => item.id === id)!; return { id, width: tableWidth(table), height: tableHeight(table) }; }),
      edges: internalRelationships.map((relationship) => ({ id: relationship.id, sources: [relationship.sourceTableId], targets: [relationship.targetTableId] })),
    });
    if ((layout.children?.length ?? 0) !== cluster.tableIds.length) return compactClusterLayout(document, cluster);
    const rawNodes: LayoutNode[] = layout.children!.map((node) => ({
      id: node.id,
      x: node.x ?? 0,
      y: node.y ?? 0,
      width: node.width ?? tableWidth(document.tables.find((table) => table.id === node.id)!),
      height: node.height ?? tableHeight(document.tables.find((table) => table.id === node.id)!),
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

interface LayoutRequest { document: SchemaDocument; mode?: "initial" | "manual"; generation?: number }

let activeGeneration = 0;

self.onmessage = async (event: MessageEvent<SchemaDocument | LayoutRequest>) => {
  const request = "document" in event.data ? event.data : { document: event.data, mode: "initial" as const };
  const generation = request.generation ?? activeGeneration + 1;
  activeGeneration = generation;
  const document = request.document;
  const manual = request.mode === "manual";
  if (document.hasSavedLayout) {
    const result: LayoutResult = {
      generation,
      nodes: document.tables.map((table) => ({ id: table.id, x: table.position.x, y: table.position.y, width: tableWidth(table), height: tableHeight(table) })),
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
  for (const cluster of clusterTables(layoutDocument)) {
    localLayouts.push(await layoutCluster(layoutDocument, cluster));
    if (generation !== activeGeneration) return;
  }
  const packed = packClusters(localLayouts);
  let arrangedNodes = packed.flatMap((layout) => layout.nodes.map((node) => ({ ...node, x: node.x + layout.x, y: node.y + layout.y })));
  const fixedNodes = document.tables.filter((table) => lockedTableIds.has(table.id)).map((table) => ({ id: table.id, x: table.position.x, y: table.position.y, width: tableWidth(table), height: tableHeight(table) }));
  if (fixedNodes.length > 0 && arrangedNodes.length > 0) {
    const fixedMaxX = Math.max(...fixedNodes.map((node) => node.x + node.width));
    const fixedMinY = Math.min(...fixedNodes.map((node) => node.y));
    const arrangedMinX = Math.min(...arrangedNodes.map((node) => node.x));
    const arrangedMinY = Math.min(...arrangedNodes.map((node) => node.y));
    arrangedNodes = arrangedNodes.map((node) => ({ ...node, x: node.x + fixedMaxX + 220 - arrangedMinX, y: node.y + fixedMinY - arrangedMinY }));
  }
  const result: LayoutResult = {
    generation,
    kind: manual ? "manual" : "initial",
    nodes: [...fixedNodes, ...arrangedNodes],
    edges: [],
  };
  self.postMessage(result);
};
