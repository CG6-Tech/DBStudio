import { buildExplorerIndex } from "./explorerIndex";
import { stronglyConnectedComponents } from "./dependencyGraph";
import { linkWorkspaceFragments, parseWorkspaceFragment } from "./workspaceParser";
import type { SqlDialect } from "./types";
import {
  fileIdForPath,
  type FileId,
  type OpenedWorkspace,
  type SqlFileFragment,
  type SqlWorkspace,
  type WorkspaceFile,
} from "./workspaceTypes";

export type WorkspaceLoadProgress =
  | { stage: "parsing"; completed: number; total: number }
  | { stage: "resolving" }
  | { stage: "arranging" };

const fragmentCache = new Map<string, SqlFileFragment>();

export async function loadSqlWorkspace(
  opened: OpenedWorkspace,
  dialect: SqlDialect,
  onProgress?: (progress: WorkspaceLoadProgress) => void,
  concurrency = 4,
): Promise<SqlWorkspace> {
  const files: WorkspaceFile[] = opened.files.map((file) => ({ ...file, id: fileIdForPath(file.relativePath), name: file.relativePath.replaceAll("\\", "/").split("/").at(-1)! }));
  const readable = files.filter((file) => file.source !== null);
  const fragments: SqlFileFragment[] = new Array(readable.length);
  let cursor = 0;
  let completed = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      const file = readable[index];
      if (!file) return;
      const cacheKey = `${dialect}:${file.id}:${file.hash}`;
      fragments[index] = fragmentCache.get(cacheKey) ?? parseWorkspaceFragment(file, dialect);
      fragmentCache.set(cacheKey, fragments[index]);
      completed += 1;
      onProgress?.({ stage: "parsing", completed, total: readable.length });
      await Promise.resolve();
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, readable.length)) }, worker));
  onProgress?.({ stage: "resolving" });
  const linked = linkWorkspaceFragments(fragments, dialect);
  onProgress?.({ stage: "arranging" });
  const filesById = new Map<FileId, WorkspaceFile>(files.map((file) => [file.id, file]));
  return {
    rootPath: opened.rootPath,
    rootName: opened.rootName,
    dialect,
    explorer: buildExplorerIndex(opened.files),
    filesById,
    fragmentsByFileId: new Map(fragments.map((fragment) => [fragment.file.id, fragment])),
    document: linked.document,
    entitySourceById: linked.entitySourceById,
    dependenciesByFileId: linked.dependenciesByFileId,
    dependentsByFileId: linked.dependentsByFileId,
    dependencyGroups: stronglyConnectedComponents(linked.dependenciesByFileId),
    dirtyFileIds: new Set(),
    selectedFileId: readable[0]?.id ?? null,
  };
}

export function detectWorkspaceDialect(opened: OpenedWorkspace): { dialect: SqlDialect; ambiguous: boolean } {
  const sources = opened.files.map((file) => file.source ?? "").join("\n");
  const mysql = /`|AUTO_INCREMENT|\bUNSIGNED\b|ENGINE\s*=/i.test(sources);
  const postgresql = /\bBIGSERIAL\b|\bTIMESTAMPTZ\b|\bCREATE\s+(?:TYPE|DOMAIN)\b|\bJSONB\b|\bUUID\b|\[\]/i.test(sources);
  return { dialect: mysql && !postgresql ? "mysql" : "postgresql", ambiguous: mysql === postgresql };
}

export function likelyWorkspaceDialect(opened: OpenedWorkspace): SqlDialect {
  return detectWorkspaceDialect(opened).dialect;
}
