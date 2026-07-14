/// <reference lib="webworker" />
import ELK from "elkjs/lib/elk.bundled.js";
import type { LayoutResult, SchemaDocument } from "../domain/types";

const elk = new ELK();

self.onmessage = async (event: MessageEvent<SchemaDocument>) => {
  const document = event.data;
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "90",
      "elk.layered.spacing.nodeNodeBetweenLayers": "160",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: document.tables.map((table) => ({
      id: table.id,
      width: 260,
      height: 58 + table.columns.length * 34,
    })),
    edges: document.relationships.map((relationship) => ({
      id: relationship.id,
      sources: [relationship.sourceTableId],
      targets: [relationship.targetTableId],
    })),
  };
  const layout = await elk.layout(graph);
  const routedEdges = (layout.edges ?? []) as Array<{
    id: string;
    sections?: Array<{
      startPoint: { x: number; y: number };
      bendPoints?: Array<{ x: number; y: number }>;
      endPoint: { x: number; y: number };
    }>;
  }>;
  const result: LayoutResult = {
    nodes: (layout.children ?? []).map((node) => ({
      id: node.id,
      x: node.x ?? 0,
      y: node.y ?? 0,
      width: node.width ?? 260,
      height: node.height ?? 160,
    })),
    edges: routedEdges.map((edge) => ({
      id: edge.id,
      points: (edge.sections?.[0]
        ? [edge.sections[0].startPoint, ...(edge.sections[0].bendPoints ?? []), edge.sections[0].endPoint]
        : []
      ).map((point) => ({ x: point.x, y: point.y })),
    })),
  };
  self.postMessage(result);
};
