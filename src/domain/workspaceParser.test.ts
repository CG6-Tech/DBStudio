import { describe, expect, it } from "vitest";
import { loadSqlWorkspace } from "./workspaceLoader";
import type { OpenedWorkspace } from "./workspaceTypes";

const opened: OpenedWorkspace = {
  rootPath: "/schema",
  rootName: "schema",
  files: [
    { path: "/schema/users.sql", relativePath: "users.sql", source: "CREATE TABLE users (id BIGINT PRIMARY KEY);", hash: "1", modifiedMs: 1, error: null },
    { path: "/schema/sales/orders.sql", relativePath: "sales/orders.sql", source: "CREATE TABLE orders (id BIGINT PRIMARY KEY, user_id BIGINT REFERENCES users(id));", hash: "2", modifiedMs: 1, error: null },
  ],
};

describe("workspace parser", () => {
  it("links foreign keys across files and records file dependencies", async () => {
    const workspace = await loadSqlWorkspace(opened, "postgresql");
    expect(workspace.document.tables).toHaveLength(2);
    expect(workspace.document.relationships).toHaveLength(1);
    const relationship = workspace.document.relationships[0];
    const sourceFile = workspace.entitySourceById.get(relationship.sourceTableId)?.fileId;
    const targetFile = workspace.entitySourceById.get(relationship.targetTableId)?.fileId;
    expect(workspace.dependenciesByFileId.get(sourceFile!)?.has(targetFile!)).toBe(true);
  });

  it("produces deterministic IDs regardless of scan result order", async () => {
    const first = await loadSqlWorkspace(opened, "postgresql");
    const second = await loadSqlWorkspace({ ...opened, files: [...opened.files].reverse() }, "postgresql");
    expect(second.document.tables.map((table) => table.id).sort()).toEqual(first.document.tables.map((table) => table.id).sort());
  });

  it("attaches a standalone PostgreSQL index declared in another file", async () => {
    const workspace = await loadSqlWorkspace({ rootPath: "/schema", rootName: "schema", files: [
      { path: "/schema/table.sql", relativePath: "table.sql", source: "CREATE TABLE users (id BIGINT);", hash: "1", modifiedMs: 1, error: null },
      { path: "/schema/index.sql", relativePath: "index.sql", source: "CREATE INDEX users_id_idx ON users (id);", hash: "2", modifiedMs: 1, error: null },
    ] }, "postgresql");
    const index = workspace.document.tables[0].indexes.find((item) => item.name === "users_id_idx");
    expect(index).toBeDefined();
    expect(workspace.entitySourceById.get(index!.id)?.fileId).toBe(workspace.explorer.fileByRelativePath.get("index.sql")?.id);
  });

  it("links trigger and routine dependencies across files", async () => {
    const workspace = await loadSqlWorkspace({ rootPath: "/schema", rootName: "schema", files: [
      { path: "/schema/tables.sql", relativePath: "tables.sql", source: "CREATE TABLE orders (id BIGINT); CREATE TABLE audit_log (order_id BIGINT);", hash: "1", modifiedMs: 1, error: null },
      { path: "/schema/routine.sql", relativePath: "routine.sql", source: "CREATE FUNCTION write_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO audit_log VALUES (NEW.id); RETURN NEW; END; $$;", hash: "2", modifiedMs: 1, error: null },
      { path: "/schema/trigger.sql", relativePath: "trigger.sql", source: "CREATE TRIGGER orders_audit AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION write_audit();", hash: "3", modifiedMs: 1, error: null },
    ] }, "postgresql");
    expect(workspace.document.triggers).toHaveLength(1);
    expect(workspace.document.routines).toHaveLength(1);
    expect(workspace.document.logicEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "table-event", targetId: workspace.document.triggers[0].id }),
      expect.objectContaining({ kind: "executes", targetId: workspace.document.routines[0].id }),
      expect.objectContaining({ kind: "inserts", targetId: workspace.document.tables.find((table) => table.name === "audit_log")?.id }),
    ]));
    expect(workspace.entitySourceById.get(workspace.document.triggers[0].id)).toBeDefined();
    expect(workspace.entitySourceById.get(workspace.document.routines[0].id)).toBeDefined();
    const triggerFile = workspace.entitySourceById.get(workspace.document.triggers[0].id)!.fileId;
    const routineFile = workspace.entitySourceById.get(workspace.document.routines[0].id)!.fileId;
    expect(workspace.dependenciesByFileId.get(triggerFile)?.has(routineFile)).toBe(true);
  });
});
