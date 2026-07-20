import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export interface DevelopmentWorkspaceFile {
  path: string;
  relativePath: string;
  source: string | null;
  hash: string | null;
  modifiedMs: number | null;
  error: string | null;
}

export interface DevelopmentWorkspace {
  rootPath: string;
  rootName: string;
  files: DevelopmentWorkspaceFile[];
}

const ignoredDirectories = new Set([".git", ".viewdb", "node_modules", "target", "dist", "build"]);

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function slash(value: string): string { return value.split(path.sep).join("/"); }

export async function scanDevelopmentWorkspace(rootPath: string): Promise<DevelopmentWorkspace> {
  const rootStats = await stat(rootPath).catch(() => null);
  if (!rootStats?.isDirectory()) throw new Error("The development workspace fixture is unavailable.");
  const root = await realpath(rootPath); const paths: string[] = []; const stack = [root];
  while (stack.length) {
    const directory = stack.pop()!; const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const candidate = path.join(directory, entry.name); const canonical = await realpath(candidate).catch(() => null);
      if (!canonical || !isWithin(root, canonical)) continue;
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name) && !entry.name.startsWith(".")) stack.push(canonical);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".sql" && entry.name !== "workspace.sql-erd.json" && !entry.name.startsWith(".viewdb-") && !entry.name.includes(".bak-") && !entry.name.endsWith(".tmp")) paths.push(canonical);
    }
  }
  paths.sort((left, right) => slash(path.relative(root, left)).localeCompare(slash(path.relative(root, right))));
  if (!paths.length) throw new Error("The development workspace fixture contains no SQL files.");
  const files = await Promise.all(paths.map(async (filePath): Promise<DevelopmentWorkspaceFile> => {
    const relativePath = slash(path.relative(root, filePath)); const fileStats = await stat(filePath).catch(() => null);
    try {
      const source = await readFile(filePath, "utf8");
      return { path: filePath, relativePath, source, hash: createHash("sha256").update(source).digest("hex"), modifiedMs: fileStats?.mtimeMs ?? null, error: null };
    } catch {
      return { path: filePath, relativePath, source: null, hash: null, modifiedMs: fileStats?.mtimeMs ?? null, error: `Could not read ${relativePath}` };
    }
  }));
  return { rootPath: root, rootName: path.basename(root) || "SQL workspace", files };
}
