import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { OpenedDocument } from "../domain/types";

export const EXAMPLE_SQL = `-- ViewDB two-table example
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
  return { path: null, source: EXAMPLE_SQL, hash: await browserHash(EXAMPLE_SQL), modifiedMs: null, isExample: true };
}

export async function openSqlFile(): Promise<OpenedDocument | null> {
  if (!isTauri()) {
    throw new Error("Opening local files is available in the Tauri desktop app. The browser preview uses the bundled example.");
  }
  const path = await open({ multiple: false, filters: [{ name: "PostgreSQL", extensions: ["sql"] }] });
  return path ? invoke<OpenedDocument>("open_document", { path }) : null;
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
): Promise<SaveResult | null> {
  if (!isTauri()) {
    const blob = new Blob([source], { type: "application/sql" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "viewdb-example.sql";
    anchor.click();
    URL.revokeObjectURL(url);
    return { path: "viewdb-example.sql", hash: await browserHash(source), modifiedMs: Date.now(), backupPath: null };
  }
  const path = currentPath ?? (await save({ defaultPath: "viewdb-example.sql", filters: [{ name: "PostgreSQL", extensions: ["sql"] }] }));
  if (!path) return null;
  return invoke<SaveResult>("save_document", { path, source, originalHash: currentPath ? originalHash : null });
}
