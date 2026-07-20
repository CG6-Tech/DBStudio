import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { createMigrationPlan } from "./migrationPlanner";
import { migrationSnapshotFromDocument } from "./migrationSnapshot";
import { migrationRequirementForChange, migrationRequirements } from "./migrationRequirements";

function snapshot(sql: string, id: string) {
  return migrationSnapshotFromDocument(parseSchema(sql), id, id);
}

describe("migration requirements", () => {
  it("requires a backfill but not a second approval for a required added column", () => {
    const target = snapshot("CREATE TABLE orders (id bigint PRIMARY KEY);", "old");
    const desired = snapshot("CREATE TABLE orders (id bigint PRIMARY KEY, external_reference text NOT NULL);", "new");
    const plan = createMigrationPlan(desired, target);
    const requirements = migrationRequirements(plan, {});
    expect(requirements.map((item) => item.kind)).toEqual(["backfill"]);
  });

  it("requires approval for a destructive drop", () => {
    const target = snapshot("CREATE TABLE users (id bigint PRIMARY KEY, legacy text);", "old");
    const desired = snapshot("CREATE TABLE users (id bigint PRIMARY KEY);", "new");
    const plan = createMigrationPlan(desired, target);
    expect(migrationRequirements(plan, {}).map((item) => item.kind)).toEqual(["approval"]);
  });

  it("shows only the rename decision until the candidate is resolved", () => {
    const target = snapshot("CREATE TABLE users (id bigint PRIMARY KEY, name text NOT NULL);", "old");
    const desired = snapshot("CREATE TABLE users (id bigint PRIMARY KEY, full_name text NOT NULL);", "new");
    const first = createMigrationPlan(desired, target);
    expect(migrationRequirements(first, {}).map((item) => item.kind)).toEqual(["rename"]);
    const provisionalDrop = first.changes.find((change) => change.kind === "drop-column")!;
    expect(migrationRequirementForChange(first, {}, provisionalDrop.id)?.kind).toBe("rename");
    const suggestion = first.renameSuggestions[0];
    const rejectedDecisions = { renames: { [suggestion.id]: "rejected" as const } };
    const rejected = createMigrationPlan(desired, target, "standard", rejectedDecisions);
    expect(migrationRequirements(rejected, rejectedDecisions).map((item) => [item.kind, item.resolved])).toEqual([["approval", false], ["backfill", false], ["rename", true]]);
  });
});
