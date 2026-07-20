import { describe, expect, it } from "vitest";
import { fileIdForPath, normalizeRelativePath, workspaceEntityId } from "./workspaceTypes";

describe("workspace identity", () => {
  it("normalizes equivalent relative paths", () => {
    expect(normalizeRelativePath("schema\\sales/./../sales/orders.sql")).toBe("schema/sales/orders.sql");
    expect(fileIdForPath("schema\\sales/orders.sql")).toBe(fileIdForPath("schema/sales/orders.sql"));
  });

  it("keeps duplicate occurrences distinct and deterministic", () => {
    const fileId = fileIdForPath("schema.sql");
    expect(workspaceEntityId(fileId, "table", "public.users", 0)).toBe(workspaceEntityId(fileId, "table", "public.users", 0));
    expect(workspaceEntityId(fileId, "table", "public.users", 0)).not.toBe(workspaceEntityId(fileId, "table", "public.users", 1));
  });

  it("keeps case-distinct paths distinct on case-sensitive filesystems", () => {
    expect(fileIdForPath("A.sql")).not.toBe(fileIdForPath("a.sql"));
  });
});
