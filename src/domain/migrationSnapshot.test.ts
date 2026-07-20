import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { migrationSnapshotFromDocument } from "./migrationSnapshot";

describe("migration snapshots", () => {
  it("is deterministic across visual-only changes", () => {
    const document = parseSchema("CREATE TABLE public.users (id bigint PRIMARY KEY, email text UNIQUE); CREATE TABLE orders (id bigint, user_id bigint REFERENCES public.users(id));");
    const first = migrationSnapshotFromDocument(document);
    document.tables[0] = { ...document.tables[0], color: "#22c55e", position: { x: 400, y: 300 }, collapsed: true };
    const second = migrationSnapshotFromDocument(document);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.tables.find((table) => table.key === "public.orders")?.foreignKeys[0].targetTable).toBe("public.users");
  });

  it("changes fingerprints for structural edits", () => {
    const before = parseSchema("CREATE TABLE users (id bigint);");
    const after = parseSchema("CREATE TABLE users (id bigint, email text);");
    expect(migrationSnapshotFromDocument(after).fingerprint).not.toBe(migrationSnapshotFromDocument(before).fingerprint);
  });
});
