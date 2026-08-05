/// <reference lib="webworker" />
import ELK from "elkjs/lib/elk-api.js";
import * as ELKWorkerModule from "elkjs/lib/elk-worker.min.js";
import { clusterTables, type LayoutCluster } from "../domain/clustering";
import type { LayoutNode, LayoutResult, Relationship, SchemaDocument } from "../domain/types";
import { compactClusterLayout, packClusters, reserveAreaClusterFootprint, type ClusterLayout } from "./clusterPacking";
import { resolveElkWorkerConstructor } from "./elkWorkerFactory";
import { tableHeight, tableWidth } from "../domain/tableGeometry";
import { FIELD_ANCHOR_OFFSET, FIELD_ROW_HEIGHT, FIELD_ROW_TOP } from "../domain/relationshipGeometry";

interface ElkPort { id: string; width: number; height: number; x: number; y: number; layoutOptions: Record<string, string> }

const PADDING = 70;
const LOCKED_GAP = 220;
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

/** Past roughly 2:1 a cluster reads as a strip rather than a block. */
const ELONGATION_RETRY = 2.2;
const ELONGATION_ABANDON = 6;

function elongationOf(layout: ClusterLayout): number {
  return Math.max(layout.width / Math.max(1, layout.height), layout.height / Math.max(1, layout.width));
}

/**
 * Ports pinned to the exact field-row offsets the canvas anchors to, so ELK
 * orders layers against the rows the edges really leave from rather than
 * treating every table as a featureless box.
 */
function elkPorts(document: SchemaDocument, table: SchemaDocument["tables"][number], relationships: Relationship[]): ElkPort[] {
  const width = tableWidth(table);
  const touched = new Set(relationships.flatMap((relationship) => [
    ...(relationship.sourceTableId === table.id ? [relationship.sourceColumnId] : []),
    ...(relationship.targetTableId === table.id ? [relationship.targetColumnId] : []),
  ]));
  return [...touched].flatMap((columnId) => {
    const index = table.columns.findIndex((column) => column.id === columnId);
    if (index < 0) return [];
    const y = FIELD_ROW_TOP + index * FIELD_ROW_HEIGHT + FIELD_ANCHOR_OFFSET;
    return [
      { id: `${table.id} ${columnId} east`, width: 1, height: 1, x: width, y, layoutOptions: { "elk.port.side": "EAST" } },
      { id: `${table.id} ${columnId} west`, width: 1, height: 1, x: 0, y, layoutOptions: { "elk.port.side": "WEST" } },
    ];
  });
}

function layeredOptions(direction: "RIGHT" | "DOWN"): Record<string, string> {
  return {
    "elk.algorithm": "layered",
    "elk.direction": direction,
    "elk.spacing.nodeNode": "80",
    "elk.layered.spacing.nodeNodeBetweenLayers": "120",
    "elk.edgeRouting": "ORTHOGONAL",
  };
}

/** Seeded so a reload reproduces the arrangement; ELK's force pass is random otherwise. */
const FORCE_OPTIONS: Record<string, string> = {
  "elk.algorithm": "force",
  "elk.aspectRatio": "1.6",
  "elk.spacing.nodeNode": "80",
  "elk.randomSeed": "1",
};

async function runElk(document: SchemaDocument, cluster: LayoutCluster, relationships: Relationship[], layoutOptions: Record<string, string>, usePorts: boolean): Promise<ClusterLayout | null> {
  const elk = optionalElk();
  if (!elk) return null;
  const tableById = new Map(document.tables.map((table) => [table.id, table]));
  const layout = await elk.layout({
    id: cluster.id,
    layoutOptions,
    children: cluster.tableIds.map((id) => {
      const table = tableById.get(id)!;
      const box = { id, width: tableWidth(table), height: tableHeight(table) };
      return usePorts
        ? { ...box, ports: elkPorts(document, table, relationships), layoutOptions: { "elk.portConstraints": "FIXED_POS" } }
        : box;
    }),
    edges: relationships.map((relationship) => (usePorts
      ? {
        id: relationship.id,
        sources: [`${relationship.sourceTableId} ${relationship.sourceColumnId} east`],
        targets: [`${relationship.targetTableId} ${relationship.targetColumnId} west`],
      }
      : { id: relationship.id, sources: [relationship.sourceTableId], targets: [relationship.targetTableId] })),
  });
  if ((layout.children?.length ?? 0) !== cluster.tableIds.length) return null;
  const rawNodes: LayoutNode[] = layout.children!.map((node) => ({
    id: node.id,
    x: node.x ?? 0,
    y: node.y ?? 0,
    width: node.width ?? tableWidth(tableById.get(node.id)!),
    height: node.height ?? tableHeight(tableById.get(node.id)!),
  }));
  const minX = Math.min(...rawNodes.map((node) => node.x));
  const minY = Math.min(...rawNodes.map((node) => node.y));
  const nodes = rawNodes.map((node) => ({ ...node, x: node.x - minX + PADDING, y: node.y - minY + PADDING }));
  return {
    cluster,
    nodes,
    width: Math.max(...nodes.map((node) => node.x + node.width)) + PADDING,
    height: Math.max(...nodes.map((node) => node.y + node.height)) + PADDING,
  };
}

async function layoutCluster(document: SchemaDocument, cluster: LayoutCluster): Promise<ClusterLayout> {
  const members = new Set(cluster.tableIds);
  const internalRelationships = document.relationships.filter((relationship) => members.has(relationship.sourceTableId) && members.has(relationship.targetTableId));
  if (internalRelationships.length === 0) return compactClusterLayout(document, cluster);

  try {
    // Left-to-right layering reads best for foreign keys, so it always wins when
    // its shape is usable. Rotating recovers most of the rest.
    const wide = await runElk(document, cluster, internalRelationships, layeredOptions("RIGHT"), true);
    if (!wide) return compactClusterLayout(document, cluster);
    if (elongationOf(wide) <= ELONGATION_RETRY) return reserveAreaClusterFootprint(document, wide);
    const tall = await runElk(document, cluster, internalRelationships, layeredOptions("DOWN"), true);
    if (tall && elongationOf(tall) <= ELONGATION_RETRY) return reserveAreaClusterFootprint(document, tall);

    // What is left is hub shaped: layering can only stack a hub's neighbours in
    // one enormous layer. A force pass spreads them around the hub instead, and
    // unlike the bin-packing fallback it still honours every relationship.
    const relaxed = await runElk(document, cluster, internalRelationships, FORCE_OPTIONS, false);
    const best = [wide, tall, relaxed].filter((layout): layout is ClusterLayout => layout !== null)
      .reduce((left, right) => (elongationOf(right) < elongationOf(left) ? right : left));
    return elongationOf(best) > ELONGATION_ABANDON ? compactClusterLayout(document, cluster) : reserveAreaClusterFootprint(document, best);
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
  const packed = packClusters(localLayouts, 1.6, layoutDocument);
  let arrangedNodes = packed.flatMap((layout) => layout.nodes.map((node) => ({ ...node, x: node.x + layout.x, y: node.y + layout.y })));
  const fixedNodes = document.tables.filter((table) => lockedTableIds.has(table.id)).map((table) => ({ id: table.id, x: table.position.x, y: table.position.y, width: tableWidth(table), height: tableHeight(table) }));
  if (fixedNodes.length > 0 && arrangedNodes.length > 0) {
    const fixedMaxX = Math.max(...fixedNodes.map((node) => node.x + node.width));
    const fixedCenterY = (Math.min(...fixedNodes.map((node) => node.y)) + Math.max(...fixedNodes.map((node) => node.y + node.height))) / 2;
    const arrangedMinX = Math.min(...arrangedNodes.map((node) => node.x));
    const arrangedMinY = Math.min(...arrangedNodes.map((node) => node.y));
    const arrangedMaxY = Math.max(...arrangedNodes.map((node) => node.y + node.height));
    // Centre the arranged block on the locked block instead of top-aligning it,
    // which used to drag every unlocked table below the locked content.
    const offsetY = fixedCenterY - (arrangedMinY + arrangedMaxY) / 2;
    arrangedNodes = arrangedNodes.map((node) => ({ ...node, x: node.x + fixedMaxX + LOCKED_GAP - arrangedMinX, y: node.y + offsetY }));
  }
  const result: LayoutResult = {
    generation,
    kind: manual ? "manual" : "initial",
    nodes: [...fixedNodes, ...arrangedNodes],
    edges: [],
  };
  self.postMessage(result);
};
