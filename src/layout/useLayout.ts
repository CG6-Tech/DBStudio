import { useEffect, useRef, useState } from "react";
import type { LayoutResult, SchemaDocument } from "../domain/types";
import { clusteredGridLayout } from "./clusterPacking";
import { reconcileLayout } from "./reconcileLayout";

const fallback = (document: SchemaDocument): LayoutResult => clusteredGridLayout(document);

export function useLayout(document: SchemaDocument | null, autoLayoutRequest = 0): LayoutResult | null {
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const loadTokenRef = useRef(0);
  const layoutGenerationRef = useRef(0);
  const pendingTablesRef = useRef<SchemaDocument["tables"] | null>(null);
  const lastAutoLayoutRequestRef = useRef(autoLayoutRequest);

  useEffect(() => {
    if (!document) return;
    const loadToken = ++loadTokenRef.current;
    pendingTablesRef.current = document.tables;
    const publishInitialLayout = (next: LayoutResult) => {
      if (loadToken !== loadTokenRef.current) return;
      setLayout({ ...next, kind: "initial", generation: ++layoutGenerationRef.current });
    };
    let worker: Worker;
    try {
      worker = new Worker(new URL("./layout.worker.ts", import.meta.url), { type: "module" });
    } catch {
      pendingTablesRef.current = null;
      publishInitialLayout(fallback(document));
      return;
    }
    const timer = window.setTimeout(() => publishInitialLayout(fallback(document)), 8000);
    worker.onmessage = (event: MessageEvent<LayoutResult>) => {
      window.clearTimeout(timer);
      pendingTablesRef.current = null;
      publishInitialLayout(event.data);
    };
    worker.onerror = () => {
      window.clearTimeout(timer);
      pendingTablesRef.current = null;
      publishInitialLayout(fallback(document));
    };
    worker.postMessage({ document, mode: "initial" });
    return () => {
      window.clearTimeout(timer);
      worker.terminate();
    };
  }, [document?.source]);

  useEffect(() => {
    if (!document) return;
    if (pendingTablesRef.current && pendingTablesRef.current !== document.tables) {
      loadTokenRef.current += 1;
      pendingTablesRef.current = null;
    }
    setLayout((current) => current ? reconcileLayout(document, current) : current);
  }, [document?.tables]);

  useEffect(() => {
    if (!document || autoLayoutRequest === lastAutoLayoutRequestRef.current) return;
    lastAutoLayoutRequestRef.current = autoLayoutRequest;
    const requestToken = ++loadTokenRef.current;
    const manualDocument = { ...document, hasSavedLayout: false };
    let worker: Worker;
    try {
      worker = new Worker(new URL("./layout.worker.ts", import.meta.url), { type: "module" });
    } catch {
      const next = clusteredGridLayout(manualDocument);
      setLayout({ ...next, kind: "manual", generation: ++layoutGenerationRef.current });
      return;
    }
    worker.onmessage = (event: MessageEvent<LayoutResult>) => {
      if (requestToken !== loadTokenRef.current) return;
      setLayout({ ...event.data, kind: "manual", generation: ++layoutGenerationRef.current });
      worker.terminate();
    };
    worker.onerror = () => {
      if (requestToken === loadTokenRef.current) {
        const next = clusteredGridLayout(manualDocument);
        setLayout({ ...next, kind: "manual", generation: ++layoutGenerationRef.current });
      }
      worker.terminate();
    };
    worker.postMessage({ document: manualDocument, mode: "manual" });
    return () => worker.terminate();
  }, [autoLayoutRequest, document]);

  return layout;
}
