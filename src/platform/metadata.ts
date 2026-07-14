import { invoke, isTauri } from "@tauri-apps/api/core";
import type { DiagramArea, DiagramNote, SchemaDocument } from "../domain/types";

interface WorkspaceMetadata {
  version: 1;
  tables: Array<{ name: string; position: { x: number; y: number }; color: string; collapsed: boolean }>;
  areas: DiagramArea[];
  notes: DiagramNote[];
}

function key(path: string | null): string {
  return `viewdb:metadata:${path ?? "example"}`;
}

export function metadataFromDocument(document: SchemaDocument): WorkspaceMetadata {
  return {
    version: 1,
    tables: document.tables.map((table) => ({ name: table.name, position: table.position, color: table.color, collapsed: table.collapsed })),
    areas: document.areas,
    notes: document.notes,
  };
}

export function applyMetadata(document: SchemaDocument, metadata: WorkspaceMetadata | null): SchemaDocument {
  if (!metadata) return document;
  return {
    ...document,
    hasSavedLayout: metadata.tables.length > 0,
    tables: document.tables.map((table, index) => {
      const visual = metadata.tables.find((item) => item.name.toLowerCase() === table.name.toLowerCase()) ?? metadata.tables[index];
      return visual ? { ...table, position: visual.position, color: visual.color, collapsed: visual.collapsed } : table;
    }),
    areas: metadata.areas ?? [],
    notes: metadata.notes ?? [],
  };
}

export async function loadMetadata(path: string | null): Promise<WorkspaceMetadata | null> {
  try {
    const raw = isTauri() && path
      ? await invoke<string | null>("load_workspace_metadata", { path })
      : localStorage.getItem(key(path));
    return raw ? JSON.parse(raw) as WorkspaceMetadata : null;
  } catch {
    return null;
  }
}

export async function saveMetadata(path: string | null, document: SchemaDocument): Promise<void> {
  const json = JSON.stringify(metadataFromDocument(document), null, 2);
  if (isTauri() && path) {
    await invoke("save_workspace_metadata", { path, json });
  } else {
    localStorage.setItem(key(path), json);
  }
}
