import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { OpenedDocument, SqlDialect } from "../domain/types";
import type { OpenedWorkspace } from "../domain/workspaceTypes";

export const EXAMPLE_SQL = `-- DBStudio two-table example
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL,
  total NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`;

async function browserHash(source: string): Promise<string> {
  const bytes = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function desktopAvailable(): boolean {
  return isTauri();
}

export async function loadExample(): Promise<OpenedDocument> {
  if (isTauri()) return invoke<OpenedDocument>("load_example");
  return { dialect: "postgresql", path: null, source: EXAMPLE_SQL, hash: await browserHash(EXAMPLE_SQL), modifiedMs: null, isExample: true };
}

export async function openSqlFile(): Promise<OpenedDocument | null> {
  if (!isTauri()) {
    throw new Error("Opening local files is available in the Tauri desktop app. The browser preview uses the bundled example.");
  }
  const path = await open({ multiple: false, filters: [{ name: "SQL schema", extensions: ["sql"] }] });
  return path ? invoke<OpenedDocument>("open_document", { path }) : null;
}

export async function openSqlWorkspace(): Promise<OpenedWorkspace | null> {
  if (!isTauri()) throw new Error("Opening local folders is available in the Tauri desktop app.");
  const path = await open({ directory: true, multiple: false, title: "Open SQL workspace folder" });
  return path ? invoke<OpenedWorkspace>("open_workspace", { rootPath: path }) : null;
}

export async function importWorkspaceDataFile(): Promise<string | null> {
  if (isTauri()) {
    const path = await open({ multiple: false, filters: [{ name: "DBStudio workspace data", extensions: ["json"] }], title: "Import workspace data" });
    return path ? invoke<string>("read_workspace_data", { path }) : null;
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      file.text().then(resolve, reject);
    };
    input.click();
  });
}

export async function exportWorkspaceDataFile(json: string): Promise<boolean> {
  if (isTauri()) {
    const path = await save({ defaultPath: "dbstudio-workspace.json", filters: [{ name: "DBStudio workspace data", extensions: ["json"] }], title: "Export workspace data" });
    if (!path) return false;
    await invoke("write_workspace_data", { path, json });
    return true;
  }
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "dbstudio-workspace.json";
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

export async function exportTextFile(contents: string, defaultPath: string, extension: "sql" | "json"): Promise<boolean> {
  if (isTauri()) {
    const path = await save({ defaultPath, filters: [{ name: extension === "sql" ? "SQL migration" : "Migration plan", extensions: [extension] }], title: extension === "sql" ? "Export migration SQL" : "Export migration plan" });
    if (!path) return false;
    await invoke("write_export_file", { path, contents });
    return true;
  }
  const blob = new Blob([contents], { type: extension === "sql" ? "application/sql" : "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = defaultPath;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

export async function loadDevelopmentWorkspace(): Promise<OpenedWorkspace | null> {
  if (isTauri() || !import.meta.env.DEV) return null;
  const response = await fetch("/__viewdb/development-workspace", { cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof payload === "object" && payload && "error" in payload ? String(payload.error) : "The development workspace fixture could not be loaded.");
  if (!payload || typeof payload !== "object" || !("rootPath" in payload) || !("rootName" in payload) || !("files" in payload) || !Array.isArray(payload.files)) throw new Error("The development workspace fixture returned an invalid response.");
  return payload as OpenedWorkspace;
}

export interface WorkspaceSaveRequest {
  path: string;
  source: string;
  originalHash: string;
}

export interface WorkspaceSaveResponse {
  files: Array<{ path: string; hash: string; modifiedMs: number | null }>;
  cleanupWarning: string | null;
}

export async function saveSqlWorkspace(rootPath: string, files: WorkspaceSaveRequest[], dialect: SqlDialect, metadataJson: string): Promise<WorkspaceSaveResponse> {
  if (!isTauri()) throw new Error("Saving workspace folders is available in the Tauri desktop app.");
  return invoke<WorkspaceSaveResponse>("save_workspace_files", { rootPath, files, dialect, metadataJson });
}

export interface SaveResult {
  path: string;
  hash: string;
  modifiedMs: number | null;
  backupPath: string | null;
}

export async function saveSqlFile(
  currentPath: string | null,
  source: string,
  originalHash: string,
  dialect: SqlDialect,
): Promise<SaveResult | null> {
  if (!isTauri()) {
    const blob = new Blob([source], { type: "application/sql" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dbstudio-example.sql";
    anchor.click();
    URL.revokeObjectURL(url);
    return { path: "dbstudio-example.sql", hash: await browserHash(source), modifiedMs: Date.now(), backupPath: null };
  }
  const path = currentPath ?? (await save({ defaultPath: "dbstudio-example.sql", filters: [{ name: "SQL schema", extensions: ["sql"] }] }));
  if (!path) return null;
  return invoke<SaveResult>("save_document", { path, source, originalHash: currentPath ? originalHash : null, dialect });
}
