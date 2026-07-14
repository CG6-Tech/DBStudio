import { useEffect, useState } from "react";
import type { LayoutResult, SchemaDocument } from "../domain/types";

const fallback = (document: SchemaDocument): LayoutResult => ({
  nodes: document.tables.map((table, index) => ({
    id: table.id,
    x: index * 420,
    y: index % 2 ? 80 : 0,
    width: 260,
    height: 58 + table.columns.length * 34,
  })),
  edges: [],
});

export function useLayout(document: SchemaDocument | null): LayoutResult | null {
  const [layout, setLayout] = useState<LayoutResult | null>(null);

  useEffect(() => {
    if (!document) return;
    let worker: Worker;
    try {
      worker = new Worker(new URL("./layout.worker.ts", import.meta.url), { type: "module" });
    } catch {
      setLayout(fallback(document));
      return;
    }
    const timer = window.setTimeout(() => setLayout(fallback(document)), 1800);
    worker.onmessage = (event: MessageEvent<LayoutResult>) => {
      window.clearTimeout(timer);
      setLayout(event.data);
    };
    worker.onerror = () => {
      window.clearTimeout(timer);
      setLayout(fallback(document));
    };
    worker.postMessage(document);
    return () => {
      window.clearTimeout(timer);
      worker.terminate();
    };
  }, [document?.source, document?.tables.length, document?.relationships.length]);

  return layout;
}
