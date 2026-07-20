import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { createMigrationPlan } from "./migrationPlanner";
import { migrationSnapshotFromDocument } from "./migrationSnapshot";

describe("target-scale migration planning", () => {
  it("bounds rename candidates across 3,000 unmatched tables", () => {
    const count = 1_500;
    const desiredSql = Array.from({ length: count }, (_, index) => `CREATE TABLE current_${index} (id bigint PRIMARY KEY, value text);`).join("\n");
    const targetSql = Array.from({ length: count }, (_, index) => `CREATE TABLE legacy_${index} (id bigint PRIMARY KEY, value text);`).join("\n");
    const desired = migrationSnapshotFromDocument(parseSchema(desiredSql), "desired", "Desired");
    const target = migrationSnapshotFromDocument(parseSchema(targetSql), "target", "Target");
    const plan = createMigrationPlan(desired, target);
    expect(plan.changes).toHaveLength(count * 2);
    expect(plan.renameSuggestions.length).toBeLessThanOrEqual(count);
  }, 20_000);
});
