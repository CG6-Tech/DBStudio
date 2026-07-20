import { describe, expect, it } from "vitest";
import { buildExplorerIndex, flattenExplorer } from "./explorerIndex";
import { folderIdForPath, type NativeWorkspaceFile } from "./workspaceTypes";

const file = (relativePath: string): NativeWorkspaceFile => ({ path: `/root/${relativePath}`, relativePath, source: "", hash: "hash", modifiedMs: 0, error: null });

describe("explorer index", () => {
  it("preserves only SQL file ancestors and naturally sorts folders before files", () => {
    const index = buildExplorerIndex([file("z.sql"), file("folder10/a.sql"), file("folder2/file10.sql"), file("folder2/file2.sql")]);
    expect(index.rootNodeIds.map((id) => index.nodesById.get(id)?.name)).toEqual(["folder2", "folder10", "z.sql"]);
    expect((index.childrenByFolderId.get(folderIdForPath("folder2")) ?? []).map((id) => index.nodesById.get(id)?.name)).toEqual(["file2.sql", "file10.sql"]);
  });

  it("flattens expanded rows and preserves ancestors during search", () => {
    const index = buildExplorerIndex([file("one/two/target.sql"), file("hidden.sql")]);
    expect(flattenExplorer(index, new Set()).map(({ node }) => node.name)).toEqual(["one", "hidden.sql"]);
    expect(flattenExplorer(index, new Set(), "target").map(({ node }) => node.name)).toEqual(["one", "two", "target.sql"]);
  });
});
