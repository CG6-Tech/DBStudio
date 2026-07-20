import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { createMigrationPlan } from "./migrationPlanner";
import { migrationSnapshotFromDocument } from "./migrationSnapshot";
import { projectMigrationDiff } from "./migrationDiffProjection";

function snapshot(sql: string, id: string) {
  return migrationSnapshotFromDocument(parseSchema(sql), id, id);
}

describe("migration diff projection", () => {
  it("merges table changes and preserves unchanged context", () => {
    const target = snapshot("CREATE TABLE users (id bigint PRIMARY KEY, name text, legacy text);", "old");
    const desired = snapshot("CREATE TABLE users (id bigint PRIMARY KEY, full_name text, created_at timestamptz);", "new");
    const plan = createMigrationPlan(desired, target);
    const projection = projectMigrationDiff(plan);
    const users = projection.cards.find((card) => card.key === "public.users");
    expect(users?.lane).toBe("changed");
    expect(users?.rows.some((row) => row.state === "unchanged" && row.label === "id")).toBe(true);
    expect(users?.rows.filter((row) => row.state === "added")).toHaveLength(2);
    expect(users?.rows.filter((row) => row.state === "removed")).toHaveLength(2);
  });

  it("projects an accepted rename as one blue row", () => {
    const target = snapshot("CREATE TABLE users (id bigint PRIMARY KEY, name text);", "old");
    const desired = snapshot("CREATE TABLE users (id bigint PRIMARY KEY, full_name text);", "new");
    const initial = createMigrationPlan(desired, target);
    const suggestion = initial.renameSuggestions.find((item) => item.kind === "column")!;
    const plan = createMigrationPlan(desired, target, "standard", { renames: { [suggestion.id]: "accepted" } });
    const users = projectMigrationDiff(plan).cards.find((card) => card.key === "public.users");
    expect(users?.rows.filter((row) => row.state === "renamed")).toHaveLength(1);
    expect(users?.rows.find((row) => row.state === "renamed")?.label).toBe("name → full_name");
  });

  it("creates affected relationship edges", () => {
    const target = snapshot("CREATE TABLE users (id bigint PRIMARY KEY); CREATE TABLE orders (id bigint PRIMARY KEY, user_id bigint);", "old");
    const desired = snapshot("CREATE TABLE users (id bigint PRIMARY KEY); CREATE TABLE orders (id bigint PRIMARY KEY, user_id bigint REFERENCES users(id));", "new");
    const projection = projectMigrationDiff(createMigrationPlan(desired, target));
    expect(projection.edges).toHaveLength(1);
    expect(projection.edges[0].sourceCardId).toContain("public.orders");
    expect(projection.edges[0].targetCardId).toContain("public.users");
  });

  it("groups added and removed tables into stable lanes", () => {
    const target = snapshot("CREATE TABLE legacy (id bigint);", "old");
    const desired = snapshot("CREATE TABLE accounts (id bigint);", "new");
    const projection = projectMigrationDiff(createMigrationPlan(desired, target));
    expect(projection.cards.map((card) => card.lane)).toEqual(["added", "removed"]);
  });

  it("keeps columns on newly added tables that also have indexes", () => {
    const target = snapshot("CREATE TABLE users (id bigint PRIMARY KEY);", "old");
    const desired = snapshot("CREATE TABLE users (id bigint PRIMARY KEY); CREATE TABLE orders (id bigint PRIMARY KEY, user_id bigint REFERENCES users(id)); CREATE INDEX orders_user_idx ON orders(user_id);", "new");
    const orders = projectMigrationDiff(createMigrationPlan(desired, target)).cards.find((card) => card.key === "public.orders");
    expect(orders?.rows.some((row) => row.kind === "column" && row.label === "id")).toBe(true);
    expect(orders?.rows.some((row) => row.kind === "index")).toBe(true);
  });

  it("merges an accepted table rename into one card", () => {
    const target = snapshot("CREATE TABLE customer (id bigint PRIMARY KEY, email text);", "old");
    const desired = snapshot("CREATE TABLE customers (id bigint PRIMARY KEY, email text);", "new");
    const initial = createMigrationPlan(desired, target);
    const suggestion = initial.renameSuggestions.find((item) => item.kind === "table")!;
    const accepted = createMigrationPlan(desired, target, "standard", { renames: { [suggestion.id]: "accepted" } });
    const cards = projectMigrationDiff(accepted).cards.filter((card) => card.objectKind === "table");
    expect(cards).toHaveLength(1);
    expect(cards[0].state).toBe("renamed");
    expect(cards[0].key).toBe("public.customers");
  });
});
