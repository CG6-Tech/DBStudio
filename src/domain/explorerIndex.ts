import {
  fileIdForPath,
  folderIdForPath,
  normalizeRelativePath,
  type ExplorerIndex,
  type ExplorerNode,
  type ExplorerNodeId,
  type ExplorerRow,
  type FileNode,
  type FolderId,
  type FolderNode,
  type NativeWorkspaceFile,
} from "./workspaceTypes";

const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function compareNodes(left: ExplorerNode, right: ExplorerNode): number {
  if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
  return natural.compare(left.name, right.name)
    || left.name.localeCompare(right.name, "en")
    || left.relativePath.localeCompare(right.relativePath, "en");
}

export function buildExplorerIndex(files: readonly NativeWorkspaceFile[]): ExplorerIndex {
  const nodesById = new Map<ExplorerNodeId, ExplorerNode>();
  const children = new Map<FolderId | null, ExplorerNodeId[]>();
  const fileByRelativePath = new Map<string, FileNode>();
  const addChild = (parentId: FolderId | null, id: ExplorerNodeId) => {
    const values = children.get(parentId) ?? [];
    if (!values.includes(id)) values.push(id);
    children.set(parentId, values);
  };

  for (const input of files) {
    const relativePath = normalizeRelativePath(input.relativePath);
    if (!relativePath) continue;
    const parts = relativePath.split("/");
    let parentId: FolderId | null = null;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const folderPath = parts.slice(0, index + 1).join("/");
      const id = folderIdForPath(folderPath);
      if (!nodesById.has(id)) {
        const node: FolderNode = { kind: "folder", id, name: parts[index], relativePath: folderPath, parentId };
        nodesById.set(id, node);
        addChild(parentId, id);
      }
      parentId = id;
    }
    const id = fileIdForPath(relativePath);
    const node: FileNode = { kind: "file", id, name: parts.at(-1)!, relativePath, parentId, error: input.error };
    nodesById.set(id, node);
    fileByRelativePath.set(relativePath, node);
    addChild(parentId, id);
  }

  for (const [parentId, ids] of children) {
    ids.sort((left, right) => compareNodes(nodesById.get(left)!, nodesById.get(right)!));
    children.set(parentId, ids);
  }
  const rootNodeIds = children.get(null) ?? [];
  return { nodesById, childrenByFolderId: children, fileByRelativePath, rootNodeIds };
}

export function flattenExplorer(
  index: ExplorerIndex,
  expandedFolderIds: ReadonlySet<FolderId>,
  search = "",
): ExplorerRow[] {
  const query = search.trim().toLocaleLowerCase("en");
  const visibleBySearch = new Set<ExplorerNodeId>();
  if (query) {
    for (const node of index.nodesById.values()) {
      if (node.kind !== "file" || !`${node.name}\n${node.relativePath}`.toLocaleLowerCase("en").includes(query)) continue;
      visibleBySearch.add(node.id);
      let parentId = node.parentId;
      while (parentId) {
        visibleBySearch.add(parentId);
        parentId = (index.nodesById.get(parentId) as FolderNode | undefined)?.parentId ?? null;
      }
    }
  }

  const rows: ExplorerRow[] = [];
  const stack = [...index.rootNodeIds].reverse().map((id) => ({ id, depth: 0 }));
  while (stack.length) {
    const current = stack.pop()!;
    const node = index.nodesById.get(current.id);
    if (!node || (query && !visibleBySearch.has(node.id))) continue;
    rows.push({ node, depth: current.depth });
    if (node.kind === "folder" && (query || expandedFolderIds.has(node.id))) {
      const childIds = index.childrenByFolderId.get(node.id) ?? [];
      for (let index = childIds.length - 1; index >= 0; index -= 1) stack.push({ id: childIds[index], depth: current.depth + 1 });
    }
  }
  return rows;
}
