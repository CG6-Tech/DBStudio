import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiagramCanvas } from "./components/DiagramCanvas";
import { CanvasToolbar } from "./components/CanvasToolbar";
import { SqlPreview } from "./components/SqlPreview";
import { Toolbar } from "./components/Toolbar";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { commitOperation, generateSql, redo, undo, type OperationState } from "./domain/operations";
import { parseSchema } from "./domain/parser";
import type { FileIdentity, OpenedDocument, SqlDialect } from "./domain/types";
import { useLayout } from "./layout/useLayout";
import { desktopAvailable, loadExample, openSqlFile, saveSqlFile } from "./platform/desktop";
import { applyMetadata, loadMetadata, saveMetadata } from "./platform/metadata";
import { useUiStore } from "./state/uiStore";

function documentTitle(file: FileIdentity | null): string {
  if (!file?.path) return "two-table-example.sql";
  return file.path.split(/[\\/]/).at(-1) ?? file.path;
}

export function App() {
  const [history, setHistory] = useState<OperationState | null>(null);
  const [file, setFile] = useState<FileIdentity | null>(null);
  const [busy, setBusy] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const setSelection = useUiStore((state) => state.setSelection);
  const previewOpen = useUiStore((state) => state.previewOpen);
  const setPreviewOpen = useUiStore((state) => state.setPreviewOpen);
  const status = useUiStore((state) => state.status);
  const setStatus = useUiStore((state) => state.setStatus);
  const requestFit = useUiStore((state) => state.requestFit);
  const autoLayoutRequest = useUiStore((state) => state.autoLayoutRequest);
  const document = history?.document ?? null;
  const layout = useLayout(document, autoLayoutRequest);
  const appliedManualLayoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!document || layout?.kind !== "manual" || !layout.generation || appliedManualLayoutRef.current === layout.generation) return;
    appliedManualLayoutRef.current = layout.generation;
    const positionById = new Map(layout.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
    const next = { ...document, hasSavedLayout: true, tables: document.tables.map((table) => ({ ...table, position: positionById.get(table.id) ?? table.position })) };
    setHistory((current) => current ? commitOperation(current, { kind: "replaceDocument", label: "Auto layout", previous: current.document, next }) : current);
    setStatus("Auto layout applied · unsaved changes");
  }, [document, layout, setStatus]);

  const acceptOpenedDocument = useCallback(async (opened: OpenedDocument) => {
    const parsed = applyMetadata(parseSchema(opened.source, opened.dialect), await loadMetadata(opened.path));
    if (parsed.tables.length === 0) throw new Error("No supported CREATE TABLE statements were found.");
    setHistory({ document: parsed, past: [], future: [] });
    setFile({ dialect: opened.dialect, path: opened.path, hash: opened.hash, modifiedMs: opened.modifiedMs, isExample: opened.isExample });
    setSelection(null);
    setFatalError(null);
    setStatus(opened.isExample ? "Example loaded" : "File opened");
  }, [setSelection, setStatus]);

  const showExample = useCallback(async () => {
    setBusy(true);
    try {
      await acceptOpenedDocument(await loadExample());
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [acceptOpenedDocument]);

  useEffect(() => { void showExample(); }, [showExample]);

  const openFile = async () => {
    try {
      setBusy(true);
      const opened = await openSqlFile();
      if (opened) await acceptOpenedDocument(opened);
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const replaceDocument = useCallback((label: string, next: NonNullable<typeof document>) => {
    setHistory((current) => current ? commitOperation(current, { kind: "replaceDocument", label, previous: current.document, next }) : current);
    setStatus("Unsaved changes");
  }, [setStatus]);

  const candidateSql = useMemo(() => {
    if (!document) return "";
    try {
      return generateSql(document);
    } catch (error) {
      return `-- Cannot generate a safe patch\n-- ${error instanceof Error ? error.message : String(error)}`;
    }
  }, [document]);

  const saveFile = async () => {
    if (!document || !file || !history?.past.length) return;
    try {
      setBusy(true);
      setStatus("Validating and saving…");
      const result = await saveSqlFile(file.path, candidateSql, file.hash, file.dialect);
      if (!result) {
        setStatus("Save cancelled");
        return;
      }
      await saveMetadata(desktopAvailable() ? result.path : null, document);
      const reparsed = applyMetadata(parseSchema(candidateSql, file.dialect), {
        version: 1,
        tables: document.tables.map((table) => ({ name: table.name, position: table.position, color: table.color, collapsed: table.collapsed })),
        areas: document.areas,
        notes: document.notes,
      });
      setHistory({ document: reparsed, past: [], future: [] });
      setFile({ dialect: file.dialect, path: desktopAvailable() ? result.path : null, hash: result.hash, modifiedMs: result.modifiedMs, isExample: !desktopAvailable() });
      setStatus(result.backupPath ? `Saved · backup created` : "Saved");
      setFatalError(null);
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : String(error));
      setStatus("Save failed");
    } finally {
      setBusy(false);
    }
  };

  const changeDialect = (dialect: SqlDialect) => {
    if (!document || !file || dialect === file.dialect) return;
    try {
      const parsed = applyMetadata(parseSchema(candidateSql, dialect), {
        version: 1,
        tables: document.tables.map((table) => ({ name: table.name, position: table.position, color: table.color, collapsed: table.collapsed })),
        areas: document.areas,
        notes: document.notes,
      });
      if (parsed.tables.length === 0) throw new Error(`No supported CREATE TABLE statements were found for ${dialect === "mysql" ? "MySQL" : "PostgreSQL"}.`);
      setHistory((current) => current ? {
        document: parsed,
        past: candidateSql === document.source ? [] : [{ kind: "replaceDocument", label: "Change SQL dialect", previous: document, next: parsed }],
        future: [],
      } : current);
      setFile({ ...file, dialect });
      setSelection(null);
      setStatus(`Dialect changed to ${dialect === "mysql" ? "MySQL" : "PostgreSQL"}`);
      setFatalError(null);
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <main className="app-shell">
      <Toolbar
        title={documentTitle(file)}
        dirty={Boolean(history?.past.length)}
        canUndo={Boolean(history?.past.length)}
        canRedo={Boolean(history?.future.length)}
        desktop={desktopAvailable()}
        dialect={file?.dialect ?? "postgresql"}
        onExample={() => void showExample()}
        onOpen={() => void openFile()}
        onUndo={() => setHistory((current) => {
          if (!current) return current;
          const next = undo(current);
          setStatus(next.past.length ? "Unsaved changes" : "All changes undone");
          return next;
        })}
        onRedo={() => setHistory((current) => {
          if (!current) return current;
          const next = redo(current);
          setStatus(next.past.length ? "Unsaved changes" : "Ready");
          return next;
        })}
        onFit={requestFit}
        onPreview={() => setPreviewOpen(!previewOpen)}
        onSave={() => void saveFile()}
        onDialectChange={changeDialect}
      />
      <section className="workspace">
        {document && <WorkspaceSidebar
          document={document}
          operations={history?.past ?? []}
          fileName={documentTitle(file)}
          onOpen={() => void openFile()}
          onReplace={replaceDocument}
        />}
        <div className="diagram-region">
          {document && layout ? <DiagramCanvas
            document={document}
            layout={layout}
            onReplace={replaceDocument}
          /> : <div className="loading-state"><span />Preparing diagram…</div>}
          {document && <CanvasToolbar document={document} />}
          {document && <SqlPreview open={previewOpen} sql={candidateSql} changes={history?.past.length ?? 0} onClose={() => setPreviewOpen(false)} />}
        </div>
      </section>
      <footer className="statusbar">
        <div><span className={busy ? "status-pulse busy" : "status-pulse"} />{status}</div>
        <div>
          {document && <><span>{document.tables.length} tables</span><span>{document.relationships.length} relationship</span></>}
          <span className={desktopAvailable() ? "runtime desktop" : "runtime"}>{desktopAvailable() ? "TAURI DESKTOP" : "BROWSER PREVIEW"}</span>
        </div>
      </footer>
      {fatalError && (
        <div className="error-toast" role="alert">
          <div><strong>ViewDB couldn’t complete that action</strong><p>{fatalError}</p></div>
          <button onClick={() => setFatalError(null)}>×</button>
        </div>
      )}
    </main>
  );
}
