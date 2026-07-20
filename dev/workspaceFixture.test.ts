import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanDevelopmentWorkspace } from "./workspaceFixture";

const roots: string[] = [];
async function fixture(): Promise<string> { const root = await mkdtemp(path.join(tmpdir(), "viewdb-fixture-")); roots.push(root); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("development workspace fixture scanner", () => {
  it("returns deterministic SQL files and ignores generated and hidden folders", async () => {
    const root = await fixture(); await mkdir(path.join(root, "nested")); await mkdir(path.join(root, "node_modules")); await mkdir(path.join(root, ".viewdb"));
    await writeFile(path.join(root, "z.sql"), "SELECT 3;"); await writeFile(path.join(root, "nested", "a.SQL"), "SELECT 1;");
    await writeFile(path.join(root, "node_modules", "ignored.sql"), "SELECT 0;"); await writeFile(path.join(root, ".viewdb", "ignored.sql"), "SELECT 0;");
    const opened = await scanDevelopmentWorkspace(root);
    expect(opened.files.map((file) => file.relativePath)).toEqual(["nested/a.SQL", "z.sql"]);
    expect(opened.files.every((file) => file.hash?.length === 64 && file.error === null)).toBe(true);
  });

  it("skips symbolic links and rejects missing or empty roots", async () => {
    const root = await fixture(); const outside = await fixture(); await writeFile(path.join(outside, "outside.sql"), "SELECT 1;"); await symlink(path.join(outside, "outside.sql"), path.join(root, "linked.sql"));
    await expect(scanDevelopmentWorkspace(root)).rejects.toThrow("no SQL files");
    await expect(scanDevelopmentWorkspace(path.join(root, "missing"))).rejects.toThrow("unavailable");
  });
});
