import { describe, expect, it } from "vitest";
import { parseSchema } from "./parser";
import { createMigrationPlan } from "./migrationPlanner";
import { migrationSnapshotFromDocument } from "./migrationSnapshot";
import { generateMigrationSql } from "./migrationSql";

function plan(desiredSql: string, targetSql: string, strategy: "standard" | "low-lock" | "expand-contract" = "standard") {
  return createMigrationPlan(
    migrationSnapshotFromDocument(parseSchema(desiredSql), "desired", "Desired"),
    migrationSnapshotFromDocument(parseSchema(targetSql), "target", "Target"),
    strategy,
  );
}

describe("migration SQL", () => {
  it("blocks required columns until a backfill is supplied without requiring a second approval", () => {
    const migration = plan("CREATE TABLE users (id bigint, email text NOT NULL);", "CREATE TABLE users (id bigint);");
    const change = migration.changes.find((item) => item.kind === "add-column")!;
    expect(generateMigrationSql(migration).exportable).toBe(false);
    expect(generateMigrationSql(migration, { approvals: { [change.id]: { approved: true } } }).exportable).toBe(false);
    const result = generateMigrationSql(migration, { backfills: { [change.id]: "'unknown'" } });
    expect(result.exportable).toBe(true);
    expect(result.sql).toContain("UPDATE \"public\".\"users\" SET \"email\" = 'unknown'");
  });

  it("uses concurrent PostgreSQL indexes in low-lock plans", () => {
    const migration = plan("CREATE TABLE users (id bigint); CREATE INDEX users_id_idx ON users(id);", "CREATE TABLE users (id bigint);", "low-lock");
    expect(generateMigrationSql(migration).sql).toContain("CREATE INDEX CONCURRENTLY");
  });

  it("adds explicit deployment checkpoints for expand-contract plans", () => {
    const migration = plan("CREATE TABLE users (id bigint, nickname text);", "CREATE TABLE users (id bigint);", "expand-contract");
    expect(generateMigrationSql(migration).sql).toContain("MANUAL CHECKPOINT");
  });
});
