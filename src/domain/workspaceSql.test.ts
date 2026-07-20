import { describe, expect, it } from "vitest";
import { updateTable } from "./schemaActions";
import { updateRelationship } from "./schemaActions";
import { assignNewEntityOwnership } from "./workspaceSql";
import { loadSqlWorkspace } from "./workspaceLoader";
import { affectedWorkspaceFiles, generateWorkspaceSql } from "./workspaceSql";

describe("workspace SQL generation", () => {
  it("patches only the file that owns the edited table", async () => {
    const workspace = await loadSqlWorkspace({ rootPath: "/root", rootName: "root", files: [
      { path: "/root/a.sql", relativePath: "a.sql", source: "CREATE TABLE a (id INT);", hash: "a", modifiedMs: 1, error: null },
      { path: "/root/b.sql", relativePath: "b.sql", source: "CREATE TABLE b (id INT);", hash: "b", modifiedMs: 1, error: null },
    ] }, "postgresql");
    const previous = workspace.document;
    const next = updateTable(previous, previous.tables[0].id, { name: "renamed_a" });
    workspace.dirtyFileIds = affectedWorkspaceFiles(workspace, previous, next);
    const output = generateWorkspaceSql(workspace, next);
    expect(output.size).toBe(1);
    expect([...output.values()][0]).toContain("renamed_a");
  });

  it("marks both files and transfers ownership when the foreign-key source moves", async () => {
    const workspace = await loadSqlWorkspace({ rootPath: "/root", rootName: "root", files: [
      { path: "/root/a.sql", relativePath: "a.sql", source: "CREATE TABLE a(id INT PRIMARY KEY, b_id INT);", hash: "ownership-a", modifiedMs: 1, error: null },
      { path: "/root/b.sql", relativePath: "b.sql", source: "CREATE TABLE b(id INT PRIMARY KEY, a_id INT REFERENCES a(id));", hash: "ownership-b", modifiedMs: 1, error: null },
    ] }, "postgresql");
    const previous = workspace.document;
    const relationship = previous.relationships[0];
    const a = previous.tables.find((table) => table.name === "a")!;
    const b = previous.tables.find((table) => table.name === "b")!;
    const next = updateRelationship(previous, relationship.id, { sourceTableId: a.id, sourceColumnId: a.columns[1].id, targetTableId: b.id, targetColumnId: b.columns[0].id });
    assignNewEntityOwnership(workspace, previous, next);
    expect(affectedWorkspaceFiles(workspace, previous, next).size).toBe(2);
    expect(workspace.entitySourceById.get(relationship.id)?.fileId).toBe(workspace.entitySourceById.get(a.id)?.fileId);
  });

  it("dirties the source file when a referenced table is renamed", async () => {
    const workspace = await loadSqlWorkspace({ rootPath: "/root", rootName: "root", files: [
      { path: "/root/users.sql", relativePath: "users.sql", source: "CREATE TABLE users (id INT PRIMARY KEY);", hash: "a", modifiedMs: 1, error: null },
      { path: "/root/orders.sql", relativePath: "orders.sql", source: "CREATE TABLE orders (user_id INT REFERENCES users(id));", hash: "b", modifiedMs: 1, error: null },
    ] }, "postgresql");
    const previous = workspace.document;
    const users = previous.tables.find((table) => table.name === "users")!;
    const next = updateTable(previous, users.id, { name: "accounts" });
    const dirty = affectedWorkspaceFiles(workspace, previous, next);
    expect(dirty.size).toBe(2);
  });
});
