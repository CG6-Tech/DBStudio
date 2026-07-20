import { describe, expect, it } from "vitest";
import { loadSqlWorkspace } from "./workspaceLoader";
import type { OpenedWorkspace } from "./workspaceTypes";

describe("target-scale workspace", () => {
  it("loads 80 files, 3,000 tables, and 1,500 cross-table references deterministically", async () => {
    const files: OpenedWorkspace["files"] = [];
    let tableIndex = 0;
    for (let fileIndex = 0; fileIndex < 80; fileIndex += 1) {
      const count = fileIndex < 40 ? 38 : 37;
      const statements: string[] = [];
      for (let local = 0; local < count; local += 1) {
        const current = tableIndex++;
        const reference = current > 0 && current <= 1_500 ? `, parent_id INT REFERENCES t${current - 1}(id)` : "";
        statements.push(`CREATE TABLE t${current} (id INT PRIMARY KEY${reference});`);
      }
      const source = statements.join("\n");
      files.push({ path: `/root/group${fileIndex % 8}/file${fileIndex}.sql`, relativePath: `group${fileIndex % 8}/file${fileIndex}.sql`, source, hash: String(fileIndex), modifiedMs: 1, error: null });
    }
    const workspace = await loadSqlWorkspace({ rootPath: "/root", rootName: "root", files }, "postgresql", undefined, 4);
    expect(workspace.document.tables).toHaveLength(3_000);
    expect(workspace.document.relationships).toHaveLength(1_500);
    expect(workspace.filesById.size).toBe(80);
  }, 20_000);
});
