import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { createMigrationPlan } from "./migrationPlanner";
import { migrationSnapshotFromDocument } from "./migrationSnapshot";

function snapshot(sql: string, id: string) {
  return migrationSnapshotFromDocument(parseSchema(sql), id, id);
}

describe("migration planner", () => {
  it("classifies additive and destructive column changes", () => {
    const target = snapshot("CREATE TABLE users (id bigint, legacy text);", "target");
    const desired = snapshot("CREATE TABLE users (id bigint, email text NOT NULL);", "desired");
    const plan = createMigrationPlan(desired, target);
    expect(plan.changes.find((change) => change.kind === "add-column")?.risk).toBe("blocked");
    expect(plan.changes.find((change) => change.kind === "drop-column")?.risk).toBe("blocked");
  });

  it("suggests but does not automatically accept table renames", () => {
    const target = snapshot("CREATE TABLE customers (id bigint PRIMARY KEY, email text);", "target");
    const desired = snapshot("CREATE TABLE users (id bigint PRIMARY KEY, email text);", "desired");
    const first = createMigrationPlan(desired, target);
    expect(first.renameSuggestions).toHaveLength(1);
    expect(first.changes.map((change) => change.kind)).toEqual(["create-table", "drop-table"]);
    const accepted = createMigrationPlan(desired, target, "standard", { renames: { [first.renameSuggestions[0].id]: "accepted" } });
    expect(accepted.changes.some((change) => change.kind === "rename-table")).toBe(true);
    expect(accepted.changes.some((change) => change.kind === "drop-table")).toBe(false);
  });

  it("orders foreign-key removal before destructive table changes", () => {
    const target = snapshot("CREATE TABLE users (id bigint PRIMARY KEY); CREATE TABLE orders (user_id bigint REFERENCES users(id));", "target");
    const desired = snapshot("CREATE TABLE orders (user_id bigint);", "desired");
    const kinds = createMigrationPlan(desired, target).changes.map((change) => change.kind);
    expect(kinds.indexOf("drop-foreign-key")).toBeLessThan(kinds.indexOf("drop-table"));
  });

  it("plans indexes and foreign keys for newly created tables", () => {
    const desired = snapshot("CREATE TABLE users (id bigint PRIMARY KEY); CREATE TABLE orders (id bigint, user_id bigint REFERENCES users(id)); CREATE INDEX orders_user_idx ON orders(user_id);", "desired");
    const target = snapshot("CREATE TABLE users (id bigint PRIMARY KEY);", "target");
    const plan = createMigrationPlan(desired, target);
    const tableIndex = plan.changes.findIndex((item) => item.kind === "create-table" && item.objectKey === "public.orders");
    const indexIndex = plan.changes.findIndex((item) => item.kind === "create-index" && item.tableKey === "public.orders");
    const foreignKeyIndex = plan.changes.findIndex((item) => item.kind === "add-foreign-key" && item.tableKey === "public.orders");
    expect(tableIndex).toBeGreaterThanOrEqual(0);
    expect(indexIndex).toBeGreaterThan(tableIndex);
    expect(foreignKeyIndex).toBeGreaterThan(tableIndex);
  });
});
