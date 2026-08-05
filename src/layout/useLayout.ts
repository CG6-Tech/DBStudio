import { useEffect, useMemo, useRef, useState } from "react";
import type { LayoutResult, SchemaDocument } from "../domain/types";
import { clusteredGridLayout } from "./clusterPacking";
import { reconcileLayout } from "./reconcileLayout";

const fallback = (document: SchemaDocument): LayoutResult => clusteredGridLayout(document);
const FIRST_PAINT_GRACE_MS = 150;

export function useLayout(document: SchemaDocument | null, autoLayoutRequest = 0, layoutRevision = 0): LayoutResult | null {
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const loadTokenRef = useRef(0);
  const layoutGenerationRef = useRef(0);
  const pendingTablesRef = useRef<SchemaDocument["tables"] | null>(null);
  const lastAutoLayoutRequestRef = useRef(autoLayoutRequest);
  const documentRef = useRef(document);
  const workerRef = useRef<Worker | null>(null);
  const workerMessageRef = useRef<(event: MessageEvent<LayoutResult>) => void>(() => undefined);
  const workerErrorRef = useRef<() => void>(() => undefined);
  const layoutRef = useRef<LayoutResult | null>(layout);
  documentRef.current = document;
  layoutRef.current = layout;

  const layoutSignature = useMemo(() => document ? JSON.stringify([
    document.hasSavedLayout,
    document.tables.map((table) => [table.id, table.columns.length, table.collapsed, table.widthScale]),
    document.relationships.map((relationship) => [relationship.id, relationship.sourceTableId, relationship.targetTableId]),
    document.areas.map((area) => [area.id, area.locked, area.tableIds]),
  ]) : "", [layoutRevision]);

  useEffect(() => {
    try {
      const worker = new Worker(new URL("./layout.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<LayoutResult>) => workerMessageRef.current(event);
      worker.onerror = () => {
        workerErrorRef.current();
        if (workerRef.current === worker) workerRef.current = null;
        worker.terminate();
      };
      workerRef.current = worker;
      return () => {
        workerMessageRef.current = () => undefined;
        workerErrorRef.current = () => undefined;
        workerRef.current = null;
        worker.terminate();
      };
    } catch {
      workerRef.current = null;
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!document) {
      setLayout(null);
      return;
    }
    const loadToken = ++loadTokenRef.current;
    pendingTablesRef.current = document.tables;
    const publishInitialLayout = (next: LayoutResult) => {
      if (loadToken !== loadTokenRef.current) return;
      pendingTablesRef.current = null;
      setLayout({ ...next, kind: "initial", generation: ++layoutGenerationRef.current });
    };
    const worker = workerRef.current;
    if (!worker) {
      publishInitialLayout(fallback(document));
      return;
    }
    // The synchronous fallback ignores relationships, so painting it first made
    // every load flash a bin-packed grid before snapping to the real layout.
    // Hold it back briefly and let the worker win whenever it can.
    const graceTimer = window.setTimeout(() => publishInitialLayout(fallback(document)), FIRST_PAINT_GRACE_MS);
    workerMessageRef.current = (event) => {
      if (event.data.generation !== loadToken) return;
      window.clearTimeout(graceTimer);
      publishInitialLayout(event.data);
    };
    workerErrorRef.current = () => {
      window.clearTimeout(graceTimer);
      publishInitialLayout(fallback(document));
    };
    worker.postMessage({ document, mode: "initial", generation: loadToken });
    return () => window.clearTimeout(graceTimer);
  }, [layoutSignature]);

  useEffect(() => {
    const currentDocument = documentRef.current;
    if (!currentDocument) return;
    const abandonedLoad = Boolean(pendingTablesRef.current && pendingTablesRef.current !== currentDocument.tables);
    if (abandonedLoad) {
      loadTokenRef.current += 1;
      pendingTablesRef.current = null;
    }
    // Discarding an in-flight load leaves nothing to reconcile, so on a first
    // load the canvas would sit empty forever waiting for a result that can no
    // longer publish.
    if (abandonedLoad && layoutRef.current === null) {
      setLayout({ ...fallback(currentDocument), kind: "initial", generation: ++layoutGenerationRef.current });
      return;
    }
    setLayout((current) => current ? reconcileLayout(currentDocument, current) : current);
  }, [layoutRevision]);

  useEffect(() => {
    const currentDocument = documentRef.current;
    if (!currentDocument || autoLayoutRequest === lastAutoLayoutRequestRef.current) return;
    lastAutoLayoutRequestRef.current = autoLayoutRequest;
    const requestToken = ++loadTokenRef.current;
    const manualDocument = { ...currentDocument, hasSavedLayout: false };
    const publishFallback = () => {
      if (requestToken !== loadTokenRef.current) return;
      const next = clusteredGridLayout(manualDocument);
      setLayout({ ...next, kind: "manual", generation: ++layoutGenerationRef.current });
    };
    const worker = workerRef.current;
    if (!worker) { publishFallback(); return; }
    workerMessageRef.current = (event) => {
      if (event.data.generation !== requestToken || requestToken !== loadTokenRef.current) return;
      setLayout({ ...event.data, kind: "manual", generation: ++layoutGenerationRef.current });
    };
    workerErrorRef.current = publishFallback;
    worker.postMessage({ document: manualDocument, mode: "manual", generation: requestToken });
  }, [autoLayoutRequest]);

  return layout;
}
