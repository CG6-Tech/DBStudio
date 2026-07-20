import { useEffect, useMemo, useRef, useState } from "react";
import type { LayoutResult, SchemaDocument } from "../domain/types";
import { clusteredGridLayout } from "./clusterPacking";
import { reconcileLayout } from "./reconcileLayout";

const fallback = (document: SchemaDocument): LayoutResult => clusteredGridLayout(document);

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
  documentRef.current = document;

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
    publishInitialLayout(fallback(document));
    const worker = workerRef.current;
    if (!worker) return;
    pendingTablesRef.current = document.tables;
    workerMessageRef.current = (event) => {
      if (event.data.generation !== loadToken) return;
      publishInitialLayout(event.data);
    };
    workerErrorRef.current = () => { if (loadToken === loadTokenRef.current) pendingTablesRef.current = null; };
    worker.postMessage({ document, mode: "initial", generation: loadToken });
  }, [layoutSignature]);

  useEffect(() => {
    const currentDocument = documentRef.current;
    if (!currentDocument) return;
    if (pendingTablesRef.current && pendingTablesRef.current !== currentDocument.tables) {
      loadTokenRef.current += 1;
      pendingTablesRef.current = null;
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
