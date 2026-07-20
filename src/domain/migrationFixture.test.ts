import { describe, expect, it } from "vitest";
import oldSql from "../../tests/fixtures/postgresql/realistic-schema-upgrade/old/schema.sql?raw";
import newSql from "../../tests/fixtures/postgresql/realistic-schema-upgrade/new/schema.sql?raw";
import { createMigrationPlan, type MigrationPlanDecisions } from "./migrationPlanner";
import { changeNeedsBackfill, migrationRequirements } from "./migrationRequirements";
import { migrationSnapshotFromDocument } from "./migrationSnapshot";
import { generateMigrationSql } from "./migrationSql";
import { parseSchema } from "./parser";

function fixturePlan(decisions: MigrationPlanDecisions = {}) {
  const desired = migrationSnapshotFromDocument(parseSchema(newSql, "postgresql"), "new", "New schema");
  const target = migrationSnapshotFromDocument(parseSchema(oldSql, "postgresql"), "old", "Old schema");
  return createMigrationPlan(desired, target, "standard", decisions);
}

describe("realistic schema upgrade fixture", () => {
  it("becomes exportable after every explicit required action is completed", () => {
    const initial = fixturePlan();
    const decisions: MigrationPlanDecisions = {
      renames: Object.fromEntries(initial.renameSuggestions.map((suggestion) => [suggestion.id, "accepted" as const])),
    };
    const renamed = fixturePlan(decisions);
    decisions.backfills = Object.fromEntries(renamed.changes.filter(changeNeedsBackfill).map((change) => [change.id, change.objectKey.endsWith("external_reference") ? "format('ORD-%s', id)" : "0"]));
    decisions.approvals = Object.fromEntries(renamed.changes.filter((change) => change.risk === "blocked" && !changeNeedsBackfill(change)).map((change) => [change.id, { approved: true }]));
    const resolved = fixturePlan(decisions);
    expect(migrationRequirements(resolved, decisions).filter((requirement) => !requirement.resolved)).toEqual([]);
    expect(generateMigrationSql(resolved, decisions).exportable).toBe(true);
  });
});
