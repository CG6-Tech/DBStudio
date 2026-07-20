import { invoke, isTauri } from "@tauri-apps/api/core";
import type { SchemaDocument } from "../domain/types";
import {
  mergeWorkspaceData,
  parseOrMigrateWorkspaceData,
  workspaceDataFromDocument,
  type WorkspaceDataV2,
} from "../domain/workspaceData";

function key(path: string | null): string {
  return `dbstudio:workspace-data:${path ?? "example"}`;
}

function legacyKey(path: string | null): string {
  return `viewdb:metadata:${path ?? "example"}`;
}

export function metadataFromDocument(document: SchemaDocument): WorkspaceDataV2 {
  return workspaceDataFromDocument(document);
}

export function serializeMetadata(document: SchemaDocument): string {
  return JSON.stringify(metadataFromDocument(document), null, 2);
}

export function applyMetadata(document: SchemaDocument, metadata: unknown): SchemaDocument {
  if (!metadata) return document;
  try {
    const parsed = parseOrMigrateWorkspaceData(document, metadata);
    return mergeWorkspaceData(document, parsed.data, { importComments: false, invalid: parsed.issues.length }).document;
  } catch {
    return document;
  }
}

export async function loadMetadata(path: string | null): Promise<unknown | null> {
  try {
    const raw = isTauri() && path
      ? await invoke<string | null>("load_workspace_metadata", { path })
      : localStorage.getItem(key(path)) ?? localStorage.getItem(legacyKey(path));
    return raw ? JSON.parse(raw) as unknown : null;
  } catch {
    return null;
  }
}

export async function saveMetadata(path: string | null, document: SchemaDocument): Promise<void> {
  const json = serializeMetadata(document);
  if (isTauri() && path) {
    await invoke("save_workspace_metadata", { path, json });
  } else {
    localStorage.setItem(key(path), json);
    localStorage.removeItem(legacyKey(path));
  }
}
