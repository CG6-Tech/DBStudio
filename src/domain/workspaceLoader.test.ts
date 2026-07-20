import { describe, expect, it } from "vitest";
import { detectWorkspaceDialect } from "./workspaceLoader";
import type { OpenedWorkspace } from "./workspaceTypes";

const opened = (source: string): OpenedWorkspace => ({ rootPath: "/root", rootName: "root", files: [{ path: "/root/schema.sql", relativePath: "schema.sql", source, hash: "x", modifiedMs: 1, error: null }] });

describe("workspace dialect detection", () => {
  it("recognizes strong MySQL and PostgreSQL markers", () => {
    expect(detectWorkspaceDialect(opened("CREATE TABLE `users` (id INT AUTO_INCREMENT);"))).toEqual({ dialect: "mysql", ambiguous: false });
    expect(detectWorkspaceDialect(opened("CREATE TABLE users (id BIGSERIAL);"))).toEqual({ dialect: "postgresql", ambiguous: false });
  });

  it("requires a choice for portable SQL", () => {
    expect(detectWorkspaceDialect(opened("CREATE TABLE users (id INT);"))).toEqual({ dialect: "postgresql", ambiguous: true });
  });
});
