import type { Diagnostic, SchemaDocument, SourceRange, SqlDialect } from "./types";

export type FileId = string & { readonly __fileId: unique symbol };
export type FolderId = string & { readonly __folderId: unique symbol };
export type ExplorerNodeId = FileId | FolderId;

export interface NativeWorkspaceFile {
  path: string;
  relativePath: string;
  source: string | null;
  hash: string | null;
  modifiedMs: number | null;
  error: string | null;
}

export interface OpenedWorkspace {
  rootPath: string;
  rootName: string;
  files: NativeWorkspaceFile[];
}

export interface WorkspaceFile extends NativeWorkspaceFile {
  id: FileId;
  name: string;
}

export interface SourceLocation {
  fileId: FileId;
  range: SourceRange;
}

export interface WorkspaceDiagnostic extends Diagnostic {
  fileId: FileId;
  entityId?: string;
}

export interface SqlFileFragment {
  file: WorkspaceFile;
  document: SchemaDocument;
}

export interface FolderNode {
  kind: "folder";
  id: FolderId;
  name: string;
  relativePath: string;
  parentId: FolderId | null;
}

export interface FileNode {
  kind: "file";
  id: FileId;
  name: string;
  relativePath: string;
  parentId: FolderId | null;
  error: string | null;
}

export type ExplorerNode = FolderNode | FileNode;

export interface ExplorerIndex {
  nodesById: Map<ExplorerNodeId, ExplorerNode>;
  childrenByFolderId: Map<FolderId | null, readonly ExplorerNodeId[]>;
  fileByRelativePath: Map<string, FileNode>;
  rootNodeIds: readonly ExplorerNodeId[];
}

export interface ExplorerRow {
  node: ExplorerNode;
  depth: number;
}

export interface SqlWorkspace {
  rootPath: string;
  rootName: string;
  dialect: SqlDialect;
  explorer: ExplorerIndex;
  filesById: Map<FileId, WorkspaceFile>;
  fragmentsByFileId: Map<FileId, SqlFileFragment>;
  document: SchemaDocument;
  entitySourceById: Map<string, SourceLocation>;
  dependenciesByFileId: Map<FileId, Set<FileId>>;
  dependentsByFileId: Map<FileId, Set<FileId>>;
  dependencyGroups: FileId[][];
  dirtyFileIds: Set<FileId>;
  selectedFileId: FileId | null;
}

export function normalizeRelativePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function stablePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_$.-]+/g, "_");
}

export function fileIdForPath(relativePath: string): FileId {
  return `file:${encodeURIComponent(normalizeRelativePath(relativePath))}` as FileId;
}

export function folderIdForPath(relativePath: string): FolderId {
  return `folder:${encodeURIComponent(normalizeRelativePath(relativePath))}` as FolderId;
}

export function workspaceEntityId(fileId: FileId, kind: string, qualifiedName: string, occurrence = 0): string {
  return `${fileId}:${stablePart(kind)}:${stablePart(qualifiedName)}:${occurrence}`;
}
