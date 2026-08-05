import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { CanvasToolbar } from "./components/CanvasToolbar";
import { SqlPreview } from "./components/SqlPreview";
import { Toolbar } from "./components/Toolbar";
import { WorkspaceCommandBar } from "./components/WorkspaceCommandBar";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { DialectWorkspaceDialog } from "./components/DialectWorkspaceDialog";
import { WorkspaceImportDialog } from "./components/WorkspaceImportDialog";
import { commitOperation, createDocumentPatchOperation, generateSql, operationAffectsCanvasScene, operationAffectsLayout, operationAffectsSql, operationCanvasChanges, redo, undo, type CanvasOperationChanges, type OperationState } from "./domain/operations";
import { parseSchemaDocument } from "./domain/schemaParser";
import type { FileIdentity, OpenedDocument, SchemaDocument, SqlDialect } from "./domain/types";
import { detectWorkspaceDialect, loadSqlWorkspace } from "./domain/workspaceLoader";
import { mergeWorkspaceData, parseWorkspaceData, type WorkspaceMergeReport } from "./domain/workspaceData";
import { affectedWorkspaceFiles, assignNewEntityOwnership, generateWorkspaceSql } from "./domain/workspaceSql";
import type { FileId, OpenedWorkspace, SqlWorkspace } from "./domain/workspaceTypes";
import { useLayout } from "./layout/useLayout";
import { applyAutoLayout } from "./layout/applyAutoLayout";
import { beginDesktopAuth, desktopAvailable, exportTextFile, exportWorkspaceDataFile, importWorkspaceDataFile, loadDevelopmentWorkspace, loadExample, openExternalUrl, openSqlFile, openSqlWorkspace, pollDesktopAuthResult, saveSqlFile, saveSqlWorkspace } from "./platform/desktop";
import { migrationSnapshotFromDocument } from "./domain/migrationSnapshot";
import type { MigrationSource } from "./components/MigrationPlannerPanel";
import type { MigrationPlan, MigrationPlanDecisions } from "./domain/migrationPlanner";
import { applyMetadata, loadMetadata, saveMetadata, serializeMetadata } from "./platform/metadata";
import { useUiStore } from "./state/uiStore";
import { useAiStore } from "./state/aiStore";
import { useUpdateStore } from "./state/updateStore";
import { UPDATE_CHECK_INTERVAL_MS, isUpdateDeferred } from "./platform/updatePolicy";
import { checkForAppUpdate, discardPendingUpdate, exitForMandatoryUpdate, explainUpdateError, installPendingUpdate } from "./platform/updater";
import { createDesktopAuthState, desktopGoogleAuthUrl, explainFirebaseAuthError, observeFirebaseUser, signInWithGoogleAccount, signInWithGoogleDesktopCredential, signOutFirebaseUser } from "./platform/firebaseClient";
import { buildSafeDiagnostics } from "./platform/diagnostics";
import { enrichExampleDocument } from "./platform/exampleDocument";

const LogicCanvas = lazy(() => import("./components/LogicCanvas").then((module) => ({ default: module.LogicCanvas })));
const RoutineFlowCanvas = lazy(() => import("./components/RoutineFlowCanvas").then((module) => ({ default: module.RoutineFlowCanvas })));
const DiagramCanvas = lazy(() => import("./components/DiagramCanvas").then((module) => ({ default: module.DiagramCanvas })));
const MigrationDiffCanvas = lazy(() => import("./components/MigrationDiffCanvas").then((module) => ({ default: module.MigrationDiffCanvas })));
const MigrationPlanWorkspace = lazy(() => import("./components/MigrationPlanWorkspace").then((module) => ({ default: module.MigrationPlanWorkspace })));
const FeedbackDialog = lazy(() => import("./components/FeedbackDialog").then((module) => ({ default: module.FeedbackDialog })));
const UpdateDialog = lazy(() => import("./components/UpdateDialog").then((module) => ({ default: module.UpdateDialog })));
const BetaNotesDialog = lazy(() => import("./components/BetaNotesDialog").then((module) => ({ default: module.BetaNotesDialog })));
const AiSettingsDialog = lazy(() => import("./components/ai/AiSettingsDialog").then((module) => ({ default: module.AiSettingsDialog })));

const UPDATE_DEFERRAL_KEY = "dbstudio.beta.update.deferred";

function readUpdateDeferral(): { version: string; at: number } | null {
  try {
    const value = JSON.parse(localStorage.getItem(UPDATE_DEFERRAL_KEY) ?? "null") as unknown;
    if (!value || typeof value !== "object") return null;
    const candidate = value as { version?: unknown; at?: unknown };
    return typeof candidate.version === "string" && typeof candidate.at === "number" ? { version: candidate.version, at: candidate.at } : null;
  } catch { return null; }
}

function documentTitle(file: FileIdentity | null): string {
  if (!file?.path) return "two-table-example.sql";
  return file.path.split(/[\\/]/).at(-1) ?? file.path;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function runtimeOs(): string {
  const source = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (source.includes("mac")) return "macos";
  if (source.includes("win")) return "windows";
  if (source.includes("linux")) return "linux";
  return "unknown";
}

function runtimeArchitecture(): string {
  const source = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (source.includes("arm64") || source.includes("aarch64")) return "arm64";
  if (source.includes("x86_64") || source.includes("x64") || source.includes("win64")) return "x64";
  return "unknown";
}

function diagnosticCode(message: string | null): string[] {
  if (!message) return [];
  const lower = message.toLowerCase();
  if (lower.includes("firebase") || lower.includes("sign-in") || lower.includes("sign in")) return ["auth.sign_in"];
  if (lower.includes("create table") || lower.includes("parser") || lower.includes("dialect")) return ["sql.parse"];
  if (lower.includes("save") || lower.includes("changed outside")) return ["file.save"];
  if (lower.includes("update")) return ["update.check"];
  return ["app.error"];
}

function explainReleaseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("No supported CREATE TABLE")) {
    return "No supported CREATE TABLE statements were found. DBStudio beta currently reads PostgreSQL and MySQL schema DDL; check the selected dialect and make sure the file or folder contains CREATE TABLE statements.";
  }
  return message;
}

export function App() {
  const [history, setHistory] = useState<OperationState | null>(null);
  const [migrationBaseline, setMigrationBaseline] = useState<SchemaDocument | null>(null);
  const [migrationPlan, setMigrationPlan] = useState<MigrationPlan | null>(null);
  const [migrationDecisions, setMigrationDecisions] = useState<MigrationPlanDecisions>({});
  const [file, setFile] = useState<FileIdentity | null>(null);
  const [sqlWorkspace, setSqlWorkspace] = useState<SqlWorkspace | null>(null);
  const [pendingWorkspace, setPendingWorkspace] = useState<OpenedWorkspace | null>(null);
  const [pendingImport, setPendingImport] = useState<{ document: SchemaDocument; report: WorkspaceMergeReport; commentRemovals: number } | null>(null);
  const [busy, setBusy] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [betaNotesOpen, setBetaNotesOpen] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [schemaRevision, setSchemaRevision] = useState(0);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [sceneRevision, setSceneRevision] = useState(0);
  const [canvasTopologyRevision, setCanvasTopologyRevision] = useState(0);
  const [canvasChanges, setCanvasChanges] = useState<CanvasOperationChanges & { revision: number }>({ revision: 0, topology: true, tableIds: [], areaIds: [], noteIds: [] });
  const updateState = useUpdateStore();
  const aiSettingsOpen = useAiStore((state) => state.settingsOpen);
  const closeAiSettings = useAiStore((state) => state.closeSettings);
  const setSelection = useUiStore((state) => state.setSelection);
  const previewOpen = useUiStore((state) => state.previewOpen);
  const setPreviewOpen = useUiStore((state) => state.setPreviewOpen);
  const status = useUiStore((state) => state.status);
  const setStatus = useUiStore((state) => state.setStatus);
  const requestFit = useUiStore((state) => state.requestFit);
  const autoLayoutRequest = useUiStore((state) => state.autoLayoutRequest);
  const logicMode = useUiStore((state) => state.activePanel === "logic");
  const migrationMode = useUiStore((state) => state.activePanel === "migration");
  const migrationView = useUiStore((state) => state.migrationView);
  const routineFlowId = useUiStore((state) => state.routineFlowId);
  const document = history?.document ?? null;
  const highlightedTableIds = useMemo(() => {
    const result = new Set<string>();
    if (!sqlWorkspace?.selectedFileId || !document) return result;
    for (const table of document.tables) if (sqlWorkspace.entitySourceById.get(table.id)?.fileId === sqlWorkspace.selectedFileId) result.add(table.id);
    return result;
  }, [document, sqlWorkspace]);
  const layout = useLayout(document, autoLayoutRequest, layoutRevision);
  const appliedManualLayoutRef = useRef<number | undefined>(undefined);
  const updateChecksStartedRef = useRef(false);
  const updateIntervalRef = useRef<number | null>(null);

  const runUpdateCheck = useCallback(async (manual: boolean) => {
    const store = useUpdateStore.getState();
    if (store.phase === "checking" || store.phase === "downloading" || store.phase === "installing") return;
    store.setChecking(manual);
    if (manual) setStatus("Checking for updates…");
    try {
      const result = await checkForAppUpdate();
      if (result.kind === "unavailable") {
        useUpdateStore.getState().setUnavailable();
        if (manual) setStatus("Update checks are available in the desktop app");
        return;
      }
      if (result.kind === "current" || result.kind === "ignored") {
        useUpdateStore.getState().setCurrent();
        if (manual) setStatus("DBStudio is up to date");
        return;
      }
      if (isUpdateDeferred(result.update.version, Date.now(), readUpdateDeferral(), manual)) {
        await discardPendingUpdate();
        useUpdateStore.getState().setDeferred();
        return;
      }
      useUpdateStore.getState().setAvailable(result.update);
      setStatus(`DBStudio ${result.update.version} is available`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      useUpdateStore.getState().setFailed(message, manual);
      setStatus(manual ? "Update check failed" : "Could not check for updates");
    }
  }, [setStatus]);

  useEffect(() => {
    if (!document || layout?.kind !== "manual" || !layout.generation || appliedManualLayoutRef.current === layout.generation) return;
    appliedManualLayoutRef.current = layout.generation;
    const next = applyAutoLayout(document, layout);
    setHistory((current) => current ? commitOperation(current, { kind: "replaceDocument", label: "Auto layout", previous: current.document, next }) : current);
    setStatus("Auto layout applied · unsaved changes");
  }, [document, layout, setStatus]);

  const acceptOpenedDocument = useCallback(async (opened: OpenedDocument) => {
    const metadata = await loadMetadata(opened.path);
    const parsed = metadata ? applyMetadata(parseSchemaDocument(opened.source, opened.dialect), metadata) : opened.isExample ? enrichExampleDocument(parseSchemaDocument(opened.source, opened.dialect)) : parseSchemaDocument(opened.source, opened.dialect);
    if (parsed.tables.length === 0) throw new Error("No supported CREATE TABLE statements were found.");
    setHistory({ document: parsed, past: [], future: [] });
    setMigrationBaseline(parsed);
    setSchemaRevision((revision) => revision + 1);
    setLayoutRevision((revision) => revision + 1);
    setSceneRevision((revision) => revision + 1);
    setCanvasTopologyRevision((revision) => revision + 1);
    setSqlWorkspace(null);
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

  const acceptOpenedWorkspace = useCallback(async (opened: OpenedWorkspace, dialect: SqlDialect) => {
    const loaded = await loadSqlWorkspace(opened, dialect, (progress) => {
      if (progress.stage === "parsing") setStatus(`Parsing ${progress.completed} / ${progress.total} files…`);
      else if (progress.stage === "resolving") setStatus("Resolving cross-file references…");
      else setStatus("Arranging workspace…");
    });
    const parsed = applyMetadata(loaded.document, await loadMetadata(loaded.rootPath));
    if (parsed.tables.length === 0) throw new Error("No supported CREATE TABLE statements were found in this folder.");
    loaded.document = parsed;
    setSqlWorkspace(loaded);
    setHistory({ document: parsed, past: [], future: [] });
    setMigrationBaseline(parsed);
    setSchemaRevision((revision) => revision + 1);
    setLayoutRevision((revision) => revision + 1);
    setSceneRevision((revision) => revision + 1);
    setCanvasTopologyRevision((revision) => revision + 1);
    setFile(null);
    setSelection(null);
    setFatalError(null);
    setStatus(`${opened.files.length} SQL files loaded`);
  }, [setSelection, setStatus]);

  useEffect(() => {
    let active = true;
    void (async () => {
      let fixtureFailed = false;
      try {
        if (!desktopAvailable()) {
          const opened = await loadDevelopmentWorkspace();
          if (opened) {
            setBusy(true); setStatus("Loading development workspace…");
            const detection = detectWorkspaceDialect(opened);
            await acceptOpenedWorkspace(opened, detection.dialect);
            return;
          }
        }
      } catch { fixtureFailed = true; }
      if (!active) return;
      await showExample();
      if (fixtureFailed && active) setStatus("Development workspace unavailable · example loaded");
    })().finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [acceptOpenedWorkspace, setStatus, showExample]);

  useEffect(() => {
    if (busy || !document || updateChecksStartedRef.current) return;
    updateChecksStartedRef.current = true;
    void runUpdateCheck(false);
    updateIntervalRef.current = window.setInterval(() => void runUpdateCheck(false), UPDATE_CHECK_INTERVAL_MS);
  }, [busy, document, runUpdateCheck]);

  useEffect(() => () => {
    if (updateIntervalRef.current !== null) window.clearInterval(updateIntervalRef.current);
    void discardPendingUpdate();
  }, []);

  useEffect(() => observeFirebaseUser(setAuthUser), []);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    setStatus("Opening account sign in…");
    try {
      if (desktopAvailable()) {
        const state = createDesktopAuthState();
        sessionStorage.setItem("dbstudio.desktopAuthState", state);
        const callbackUrl = await beginDesktopAuth(state);
        await openExternalUrl(desktopGoogleAuthUrl(state, callbackUrl));
        setStatus("Continue Google sign-in in your browser");
        for (let attempt = 0; attempt < 180; attempt += 1) {
          const result = await pollDesktopAuthResult();
          if (!result) {
            await delay(1000);
            continue;
          }
          if (result.state !== state) throw new Error("The desktop sign-in callback did not match this session. Please try again.");
          const user = await signInWithGoogleDesktopCredential(result.idToken, result.accessToken);
          setStatus(user.email ? `Signed in as ${user.email}` : "Signed in");
          setFatalError(null);
          return;
        }
        throw new Error("Google sign-in timed out. Start sign-in again and finish it in the browser.");
      } else {
        const user = await signInWithGoogleAccount();
        setStatus(user.email ? `Signed in as ${user.email}` : "Signed in");
        setFatalError(null);
        return;
      }
    } catch (error) {
      setFatalError(explainFirebaseAuthError(error));
      setStatus("Sign in failed");
    } finally {
      setSigningIn(false);
    }
  }, [setStatus]);

  const signOut = useCallback(async () => {
    try {
      await signOutFirebaseUser();
      setStatus("Signed out");
      setFatalError(null);
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : String(error));
      setStatus("Sign out failed");
    }
  }, [setStatus]);

  const openFolder = async () => {
    try {
      setBusy(true);
      setStatus("Scanning SQL files…");
      const opened = await openSqlWorkspace();
      if (!opened) return;
      const detection = detectWorkspaceDialect(opened);
      if (detection.ambiguous) {
        setPendingWorkspace(opened);
        setStatus("Choose the workspace SQL dialect");
      } else {
        await acceptOpenedWorkspace(opened, detection.dialect);
      }
    } catch (error) {
      setFatalError(explainReleaseError(error));
    } finally {
      setBusy(false);
    }
  };

  const openFile = async () => {
    try {
      setBusy(true);
      setStatus("Opening SQL file…");
      const opened = await openSqlFile();
      if (!opened) return;
      await acceptOpenedDocument(opened);
    } catch (error) {
      setFatalError(explainReleaseError(error));
    } finally {
      setBusy(false);
    }
  };

  const copyDiagnostics = useCallback(async () => {
    const diagnostics = buildSafeDiagnostics({
      os: runtimeOs(),
      architecture: runtimeArchitecture(),
      desktop: desktopAvailable(),
      recentErrorCodes: diagnosticCode(fatalError),
    });
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      setStatus("Diagnostics copied");
    } catch {
      setFatalError("Could not copy diagnostics. Your system clipboard did not allow DBStudio to write.");
      setStatus("Diagnostics copy failed");
    }
  }, [fatalError, setStatus]);

  const replaceDocument = useCallback((label: string, next: NonNullable<typeof document>) => {
    if (!document) return;
    const operation = createDocumentPatchOperation(label, document, next);
    const affectsSql = operationAffectsSql(operation);
    const affectsLayout = operationAffectsLayout(operation);
    const affectsCanvasScene = operationAffectsCanvasScene(operation);
    if (affectsSql && sqlWorkspace) {
      assignNewEntityOwnership(sqlWorkspace, document, next);
      const dirtyFileIds = affectedWorkspaceFiles(sqlWorkspace, sqlWorkspace.document, next);
      setSqlWorkspace({ ...sqlWorkspace, dirtyFileIds, entitySourceById: new Map(sqlWorkspace.entitySourceById) });
    }
    if (affectsSql) setSchemaRevision((revision) => revision + 1);
    if (affectsLayout) setLayoutRevision((revision) => revision + 1);
    if (affectsCanvasScene) setSceneRevision((revision) => revision + 1);
    const changes = operationCanvasChanges(operation);
    if (changes.topology) setCanvasTopologyRevision((revision) => revision + 1);
    setCanvasChanges((current) => ({ ...changes, revision: current.revision + 1 }));
    setHistory((current) => current ? commitOperation(current, operation) : current);
    setStatus("Unsaved changes");
  }, [document, setStatus, sqlWorkspace]);

  const chooseMigrationSource = useCallback(async (): Promise<MigrationSource | null> => {
    const opened = await openSqlWorkspace();
    if (!opened) return null;
    const dialect = detectWorkspaceDialect(opened).dialect;
    const loaded = await loadSqlWorkspace(opened, dialect);
    return {
      id: opened.rootPath,
      label: opened.rootName,
      snapshot: migrationSnapshotFromDocument(loaded.document, opened.rootPath, opened.rootName),
    };
  }, []);
  const chooseMigrationFile = useCallback(async (): Promise<MigrationSource | null> => {
    const opened = await openSqlFile();
    if (!opened) return null;
    const document = parseSchemaDocument(opened.source, opened.dialect);
    const sourceId = opened.path ?? `sql:${opened.hash}`;
    const label = documentTitle(opened);
    return {
      id: sourceId,
      label,
      detail: opened.path ?? undefined,
      snapshot: migrationSnapshotFromDocument(document, sourceId, label),
    };
  }, []);
  const handleMigrationPlanChange = useCallback((plan: MigrationPlan | null, decisions: MigrationPlanDecisions) => {
    setMigrationPlan(plan);
    setMigrationDecisions(decisions);
  }, []);

  const candidateSql = useMemo(() => {
    if (!document) return "";
    try {
      if (sqlWorkspace) {
        const generated = generateWorkspaceSql(sqlWorkspace, document);
        const selected = sqlWorkspace.selectedFileId && generated.get(sqlWorkspace.selectedFileId);
        if (selected) return selected;
        const selectedSource = sqlWorkspace.selectedFileId && sqlWorkspace.filesById.get(sqlWorkspace.selectedFileId)?.source;
        return selectedSource ?? [...generated].map(([id, source]) => `-- ${sqlWorkspace.filesById.get(id)?.relativePath}\n${source}`).join("\n\n");
      }
      return generateSql(document);
    } catch (error) {
      return `-- Cannot generate a safe patch\n-- ${error instanceof Error ? error.message : String(error)}`;
    }
  }, [schemaRevision, sqlWorkspace?.selectedFileId]);

  const updateBackupSql = useMemo(() => {
    if (!document) return "";
    if (!sqlWorkspace) return candidateSql;
    try {
      return [...generateWorkspaceSql(sqlWorkspace, document)]
        .map(([id, source]) => `-- ${sqlWorkspace.filesById.get(id)?.relativePath ?? id}\n${source}`)
        .join("\n\n");
    } catch { return candidateSql; }
  }, [candidateSql, document, schemaRevision, sqlWorkspace]);

  const saveFile = async () => {
    if (!document || !history?.past.length) return;
    try {
      setBusy(true);
      setStatus("Validating and saving…");
      if (sqlWorkspace) {
        const generated = generateWorkspaceSql(sqlWorkspace, document);
        const result = await saveSqlWorkspace(sqlWorkspace.rootPath, [...generated].map(([fileId, source]) => {
          const workspaceFile = sqlWorkspace.filesById.get(fileId)!;
          return { path: workspaceFile.path, source, originalHash: workspaceFile.hash ?? "" };
        }), sqlWorkspace.dialect, serializeMetadata(document));
        if (generated.size > 0) {
          const savedByPath = new Map(result.files.map((item) => [item.path, item]));
          const opened: OpenedWorkspace = {
            rootPath: sqlWorkspace.rootPath,
            rootName: sqlWorkspace.rootName,
            files: [...sqlWorkspace.filesById.values()].map((workspaceFile) => {
              const saved = savedByPath.get(workspaceFile.path);
              const source = generated.get(workspaceFile.id) ?? workspaceFile.source;
              return { ...workspaceFile, source, hash: saved?.hash ?? workspaceFile.hash, modifiedMs: saved?.modifiedMs ?? workspaceFile.modifiedMs };
            }),
          };
          const reloaded = await loadSqlWorkspace(opened, sqlWorkspace.dialect);
          reloaded.selectedFileId = sqlWorkspace.selectedFileId;
          reloaded.document = applyMetadata(reloaded.document, {
            version: 1,
            tables: document.tables.map((table) => ({ id: table.id, name: table.name, position: table.position, color: table.color, collapsed: table.collapsed, widthScale: table.widthScale, commentVisible: table.commentVisible, commentOffset: table.commentOffset, commentColor: table.commentColor })),
            areas: document.areas,
            notes: document.notes,
          });
          setSqlWorkspace(reloaded);
          setHistory({ document: reloaded.document, past: [], future: [] });
          setMigrationBaseline(reloaded.document);
          setSchemaRevision((revision) => revision + 1);
          setLayoutRevision((revision) => revision + 1);
          setSceneRevision((revision) => revision + 1);
        } else {
          setHistory({ document, past: [], future: [] });
          setMigrationBaseline(document);
        }
        setStatus(result.cleanupWarning ?? "Workspace saved");
        setFatalError(null);
        return;
      }
      if (!file) return;
      const result = await saveSqlFile(file.path, candidateSql, file.hash, file.dialect);
      if (!result) {
        setStatus("Save cancelled");
        return;
      }
      await saveMetadata(desktopAvailable() ? result.path : null, document);
      const reparsed = applyMetadata(parseSchemaDocument(candidateSql, file.dialect), {
        version: 1,
        tables: document.tables.map((table) => ({ id: table.id, name: table.name, position: table.position, color: table.color, collapsed: table.collapsed, widthScale: table.widthScale, commentVisible: table.commentVisible, commentOffset: table.commentOffset, commentColor: table.commentColor })),
        areas: document.areas,
        notes: document.notes,
      });
      setHistory({ document: reparsed, past: [], future: [] });
      setMigrationBaseline(reparsed);
      setSchemaRevision((revision) => revision + 1);
      setLayoutRevision((revision) => revision + 1);
      setSceneRevision((revision) => revision + 1);
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
    if (!document || (!file && !sqlWorkspace)) return;
    if (sqlWorkspace) {
      if (dialect === sqlWorkspace.dialect) return;
      if (history?.past.length) {
        setFatalError("Save or undo workspace changes before changing the SQL dialect.");
        return;
      }
      const opened: OpenedWorkspace = { rootPath: sqlWorkspace.rootPath, rootName: sqlWorkspace.rootName, files: [...sqlWorkspace.filesById.values()] };
      void loadSqlWorkspace(opened, dialect).then((loaded) => {
        setSqlWorkspace(loaded);
        setHistory({ document: loaded.document, past: [], future: [] });
        setSchemaRevision((revision) => revision + 1);
        setLayoutRevision((revision) => revision + 1);
        setSceneRevision((revision) => revision + 1);
        setSelection(null);
        setStatus(`Dialect changed to ${dialect === "mysql" ? "MySQL" : "PostgreSQL"}`);
      }).catch((error) => setFatalError(error instanceof Error ? error.message : String(error)));
      return;
    }
    if (!file || dialect === file.dialect) return;
    try {
      const parsed = applyMetadata(parseSchemaDocument(candidateSql, dialect), {
        version: 1,
        tables: document.tables.map((table) => ({ id: table.id, name: table.name, position: table.position, color: table.color, collapsed: table.collapsed, widthScale: table.widthScale, commentVisible: table.commentVisible, commentOffset: table.commentOffset, commentColor: table.commentColor })),
        areas: document.areas,
        notes: document.notes,
      });
      if (parsed.tables.length === 0) throw new Error(`No supported CREATE TABLE statements were found for ${dialect === "mysql" ? "MySQL" : "PostgreSQL"}.`);
      setHistory((current) => current ? {
        document: parsed,
        past: candidateSql === document.source ? [] : [createDocumentPatchOperation("Change SQL dialect", document, parsed)],
        future: [],
      } : current);
      setSchemaRevision((revision) => revision + 1);
      setLayoutRevision((revision) => revision + 1);
      setSceneRevision((revision) => revision + 1);
      setFile({ ...file, dialect });
      setSelection(null);
      setStatus(`Dialect changed to ${dialect === "mysql" ? "MySQL" : "PostgreSQL"}`);
      setFatalError(null);
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : String(error));
    }
  };

  const importWorkspaceData = async () => {
    if (!document) return;
    try {
      const raw = await importWorkspaceDataFile();
      if (!raw) return;
      const parsed = parseWorkspaceData(JSON.parse(raw) as unknown);
      if (parsed.data.dialect !== document.dialect) throw new Error(`This workspace data uses ${parsed.data.dialect}, but the current workspace uses ${document.dialect}.`);
      const merged = mergeWorkspaceData(document, parsed.data, { importComments: true, invalid: parsed.issues.length });
      merged.report.details.push(...parsed.issues.map((issue) => `${issue.path}: ${issue.message}`));
      const previousById = new Map(document.tables.map((table) => [table.id, table]));
      const commentRemovals = merged.document.tables.filter((table) => Boolean(previousById.get(table.id)?.comment) && !table.comment).length;
      setPendingImport({ document: merged.document, report: merged.report, commentRemovals });
      setFatalError(null);
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : String(error));
      setStatus("Workspace data import failed");
    }
  };

  const exportWorkspaceData = async () => {
    if (!document) return;
    try {
      const exported = await exportWorkspaceDataFile(serializeMetadata(document));
      if (exported) {
        setStatus("Workspace data exported");
        setFatalError(null);
      } else {
        setStatus("Workspace data export cancelled");
      }
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : String(error));
      setStatus("Workspace data export failed");
    }
  };

  return (
    <main className="app-shell">
      <Toolbar
        onFeedback={() => setFeedbackOpen(true)}
        onCheckForUpdates={() => void runUpdateCheck(true)}
        checkingForUpdates={updateState.phase === "checking"}
        authUser={authUser}
        signingIn={signingIn}
        onSignIn={() => void signIn()}
        onSignOut={() => void signOut()}
        onBetaNotes={() => setBetaNotesOpen(true)}
        onCopyDiagnostics={() => void copyDiagnostics()}
      />
      <section className="workspace">
        {document && <WorkspaceSidebar
          document={document}
          operations={history?.past ?? []}
          fileName={sqlWorkspace?.rootName ?? documentTitle(file)}
          workspace={sqlWorkspace}
          validationRevision={schemaRevision}
          migrationBaseline={migrationBaseline ?? document}
          onChooseMigrationSource={chooseMigrationSource}
          onChooseMigrationFile={chooseMigrationFile}
          onMigrationPlanChange={handleMigrationPlanChange}
          onSelectFile={(fileId: FileId) => setSqlWorkspace((workspace) => workspace ? { ...workspace, selectedFileId: fileId } : workspace)}
          onOpen={() => void openFolder()}
          onReplace={replaceDocument}
        />}
        <WorkspaceCommandBar
          canUndo={Boolean(history?.past.length)}
          canRedo={Boolean(history?.future.length)}
          dialect={sqlWorkspace?.dialect ?? file?.dialect ?? "postgresql"}
          title={sqlWorkspace?.rootName ?? documentTitle(file)}
          dirty={Boolean(history?.past.length)}
          onImportWorkspaceData={() => void importWorkspaceData()}
          onExportWorkspaceData={() => void exportWorkspaceData()}
          onUndo={() => setHistory((current) => {
            if (!current) return current;
            const operation = current.past.at(-1);
            if (operation && operationAffectsSql(operation)) setSchemaRevision((revision) => revision + 1);
            if (operation && operationAffectsLayout(operation)) setLayoutRevision((revision) => revision + 1);
            if (operation && operationAffectsCanvasScene(operation)) setSceneRevision((revision) => revision + 1);
            if (operation) {
              const changes = operationCanvasChanges(operation);
              if (changes.topology) setCanvasTopologyRevision((revision) => revision + 1);
              setCanvasChanges((value) => ({ ...changes, revision: value.revision + 1 }));
            }
            const next = undo(current);
            if (sqlWorkspace) setSqlWorkspace((workspace) => workspace ? { ...workspace, dirtyFileIds: affectedWorkspaceFiles(workspace, workspace.document, next.document) } : workspace);
            setStatus(next.past.length ? "Unsaved changes" : "All changes undone");
            return next;
          })}
          onRedo={() => setHistory((current) => {
            if (!current) return current;
            const operation = current.future[0];
            if (operation && operationAffectsSql(operation)) setSchemaRevision((revision) => revision + 1);
            if (operation && operationAffectsLayout(operation)) setLayoutRevision((revision) => revision + 1);
            if (operation && operationAffectsCanvasScene(operation)) setSceneRevision((revision) => revision + 1);
            if (operation) {
              const changes = operationCanvasChanges(operation);
              if (changes.topology) setCanvasTopologyRevision((revision) => revision + 1);
              setCanvasChanges((value) => ({ ...changes, revision: value.revision + 1 }));
            }
            const next = redo(current);
            if (sqlWorkspace) setSqlWorkspace((workspace) => workspace ? { ...workspace, dirtyFileIds: affectedWorkspaceFiles(workspace, workspace.document, next.document) } : workspace);
            setStatus(next.past.length ? "Unsaved changes" : "Ready");
            return next;
          })}
          onFit={requestFit}
          onPreview={() => setPreviewOpen(!previewOpen)}
          onSave={() => void saveFile()}
          onDialectChange={changeDialect}
        />
        <div className="diagram-region">
          <Suspense fallback={<div className="loading-state"><span />Preparing diagram…</div>}>
            {document && migrationMode ? (migrationPlan ? (migrationView === "canvas" ? <MigrationDiffCanvas plan={migrationPlan} decisions={migrationDecisions} /> : <MigrationPlanWorkspace plan={migrationPlan} />) : <div className="loading-state"><span />Comparing schemas…</div>) : document && logicMode && routineFlowId ? <RoutineFlowCanvas document={document} routineId={routineFlowId} onLayoutChange={(layout) => {
              const routineFlowLayouts = { ...document.routineFlowLayouts, [routineFlowId]: layout };
              setHistory((current) => current ? { ...current, document: { ...current.document, routineFlowLayouts } } : current);
              void saveMetadata(sqlWorkspace?.rootPath ?? file?.path ?? null, { ...document, routineFlowLayouts });
            }} /> : document && logicMode ? <LogicCanvas document={document} onLayoutChange={(logicLayout) => {
              setHistory((current) => current ? { ...current, document: { ...current.document, logicLayout } } : current);
              void saveMetadata(sqlWorkspace?.rootPath ?? file?.path ?? null, { ...document, logicLayout });
            }} /> : document && layout ? <DiagramCanvas
              document={document}
              layout={layout}
              onReplace={replaceDocument}
              highlightedTableIds={highlightedTableIds}
              sceneRevision={sceneRevision}
              topologyRevision={canvasTopologyRevision}
              changes={canvasChanges}
            /> : <div className="loading-state"><span />Preparing diagram…</div>}
          </Suspense>
          {document && !logicMode && !migrationMode && <CanvasToolbar document={document} />}
          {document && file?.isExample && !sqlWorkspace && !history?.past.length && !busy && !logicMode && !migrationMode && (
            <div className="welcome-card">
              <strong>Welcome to the DBStudio beta</strong>
              <p>Open a SQL file or folder to inspect your own schema. The bundled example is safe to edit and reset.</p>
              <div>
                <button onClick={() => void openFile()}>Open SQL file</button>
                <button onClick={() => void openFolder()}>Open SQL folder</button>
                <button onClick={() => setFeedbackOpen(true)}>Send feedback</button>
              </div>
            </div>
          )}
          {document && !migrationMode && <SqlPreview open={previewOpen} sql={candidateSql} changes={history?.past.length ?? 0} onClose={() => setPreviewOpen(false)} />}
        </div>
      </section>
      <footer className="statusbar">
        <div><span className={busy ? "status-pulse busy" : "status-pulse"} />{status}</div>
        <div>
          {document && <><span>{document.tables.length} tables</span><span>{document.relationships.length} relationship</span><span>{document.triggers.length} triggers</span><span>{document.routines.length} routines</span></>}
          {!desktopAvailable() && <span className="runtime">BROWSER PREVIEW</span>}
        </div>
      </footer>
      {fatalError && (
        <div className="error-toast" role="alert">
          <div><strong>DBStudio couldn’t complete that action</strong><p>{fatalError}</p></div>
          <button className="error-feedback-button" onClick={() => setFeedbackOpen(true)}>Feedback</button>
          <button className="error-close-button" onClick={() => setFatalError(null)}>×</button>
        </div>
      )}
      {aiSettingsOpen && <Suspense fallback={null}><AiSettingsDialog onClose={closeAiSettings} /></Suspense>}
      {feedbackOpen && <Suspense fallback={null}><FeedbackDialog onClose={() => setFeedbackOpen(false)} /></Suspense>}
      {betaNotesOpen && <Suspense fallback={null}><BetaNotesDialog onClose={() => setBetaNotesOpen(false)} /></Suspense>}
      {updateState.dialogOpen && <Suspense fallback={null}><UpdateDialog
        phase={updateState.phase}
        update={updateState.update}
        error={updateState.error}
        progress={updateState.progress}
        downloaded={updateState.downloaded}
        total={updateState.total}
        dirty={Boolean(history?.past.length)}
        onClose={updateState.closeDialog}
        onInstall={() => {
          if (history?.past.length) return;
          useUpdateStore.getState().setDownloading();
          void installPendingUpdate(({ downloaded, total, percent }) => {
            useUpdateStore.getState().setProgress(downloaded, total, percent);
            if (percent === 100) useUpdateStore.getState().setInstalling();
          }).catch((error) => useUpdateStore.getState().setFailed(explainUpdateError(error)));
        }}
        onLater={() => {
          if (!updateState.update || updateState.update.mandatory) return;
          localStorage.setItem(UPDATE_DEFERRAL_KEY, JSON.stringify({ version: updateState.update.version, at: Date.now() }));
          void discardPendingUpdate();
          useUpdateStore.getState().setDeferred();
          setStatus("Update postponed for 24 hours");
        }}
        onRetry={() => void runUpdateCheck(true)}
        onSave={() => void saveFile()}
        onExport={() => void exportTextFile(updateBackupSql, "dbstudio-update-backup.sql", "sql").then((saved) => { if (saved) setStatus("SQL backup exported"); })}
        onExit={() => { if (!history?.past.length) void exitForMandatoryUpdate(); }}
      /></Suspense>}
      {pendingWorkspace && <DialectWorkspaceDialog
        rootName={pendingWorkspace.rootName}
        suggested="postgresql"
        onCancel={() => { setPendingWorkspace(null); setStatus("Open cancelled"); }}
        onChoose={(dialect) => {
          const opened = pendingWorkspace;
          setPendingWorkspace(null);
          setBusy(true);
          void acceptOpenedWorkspace(opened, dialect).catch((error) => setFatalError(error instanceof Error ? error.message : String(error))).finally(() => setBusy(false));
        }}
      />}
      {pendingImport && <WorkspaceImportDialog
        report={pendingImport.report}
        commentRemovals={pendingImport.commentRemovals}
        onCancel={() => setPendingImport(null)}
        onConfirm={() => {
          const imported = pendingImport;
          setPendingImport(null);
          replaceDocument("Import workspace data", imported.document);
          const skipped = imported.report.skipped + imported.report.ambiguous + imported.report.invalid;
          setStatus(`Imported workspace data · ${imported.report.changed} changed · ${skipped} skipped`);
        }}
      />}
    </main>
  );
}
