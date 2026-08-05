import { describe, expect, it } from "vitest";
import { draftMigrationChangeSkill, parseDraftOutput, type DraftInput } from "./draftMigrationChange";
import type { MigrationChange } from "../migrationPlanner";
import type { MigrationSnapshotColumn, MigrationSnapshotTable } from "../migrationSnapshot";

const column = (name: string, dataType: string, over: Partial<MigrationSnapshotColumn> = {}): MigrationSnapshotColumn => ({
  key: name,
  name,
  dataType,
  nullable: false,
  primaryKey: false,
  unique: false,
  fingerprint: `${name}:${dataType}`,
  ...over,
});

const table: MigrationSnapshotTable = {
  key: "public.users",
  schema: "public",
  name: "users",
  columns: [column("id", "bigint", { primaryKey: true }), column("first_name", "text"), column("last_name", "text")],
  indexes: [],
  checks: [],
  foreignKeys: [],
  fingerprint: "users",
};

const addColumn: MigrationChange = {
  id: "change:1",
  kind: "add-column",
  objectKind: "column",
  objectKey: "public.users.full_name",
  tableKey: "public.users",
  risk: "blocked",
  reason: "Required column needs a backfill",
  dependsOn: [],
  phase: "expand",
  reversible: true,
  after: column("full_name", "text"),
};

const dropColumn: MigrationChange = {
  id: "change:2",
  kind: "drop-column",
  objectKind: "column",
  objectKey: "public.users.legacy",
  tableKey: "public.users",
  risk: "blocked",
  reason: "Drops column data",
  dependsOn: [],
  phase: "contract",
  reversible: false,
  before: column("legacy", "text"),
};

describe("draftMigrationChange prompt building", () => {
  it("includes sibling column names and the new column for a backfill", () => {
    const input: DraftInput = { kind: "backfill", dialect: "postgresql", column: addColumn.after, table };
    const request = draftMigrationChangeSkill.buildPrompt(input);
    const prompt = request.messages[0].content;
    expect(request.system).toMatch(/JSON object/);
    expect(prompt).toContain("public.users");
    expect(prompt).toContain("full_name text, NOT NULL");
    expect(prompt).toContain("first_name text");
    expect(prompt).toContain("last_name text");
    // The new column itself should not be listed among the siblings.
    expect(prompt.match(/full_name/g)?.length).toBe(1);
  });

  it("includes the planner reason and reversibility for a blocked change", () => {
    const request = draftMigrationChangeSkill.buildPrompt({ kind: "blocked", dialect: "mysql", change: dropColumn });
    const prompt = request.messages[0].content;
    expect(prompt).toContain("Dialect: mysql");
    expect(prompt).toContain("drop column");
    expect(prompt).toContain("Planner reason: Drops column data");
    expect(prompt).toContain("Reversible: no");
  });
});

describe("draftMigrationChange result parsing", () => {
  const backfill: DraftInput = { kind: "backfill", dialect: "postgresql", column: addColumn.after, table };
  const blocked: DraftInput = { kind: "blocked", dialect: "postgresql", change: dropColumn };

  it("parses a clean backfill JSON object", () => {
    const out = parseDraftOutput('{"expression":"concat(first_name, \' \', last_name)","rationale":"Combine names","risks":["null names"],"alternatives":[]}', backfill);
    expect(out).toEqual({ expression: "concat(first_name, ' ', last_name)", rationale: "Combine names", risks: ["null names"], alternatives: [] });
  });

  it("extracts JSON from a fenced block with prose", () => {
    const raw = "Sure:\n```json\n{\"expression\":\"0\",\"rationale\":\"Zero default\",\"risks\":[],\"alternatives\":[]}\n```";
    expect(parseDraftOutput(raw, backfill).expression).toBe("0");
  });

  it("forces expression to null in blocked mode even if the model returns one", () => {
    const out = parseDraftOutput('{"expression":"whatever","rationale":"Unsafe","risks":[],"alternatives":["Use expand-contract"]}', blocked);
    expect(out.expression).toBeNull();
    expect(out.alternatives).toEqual(["Use expand-contract"]);
  });

  it("falls back to non-JSON as the backfill expression", () => {
    const out = parseDraftOutput("coalesce(first_name, '')", backfill);
    expect(out.expression).toBe("coalesce(first_name, '')");
    expect(out.rationale).toBe("");
  });

  it("falls back to non-JSON as the rationale in blocked mode", () => {
    const out = parseDraftOutput("This drops data irreversibly.", blocked);
    expect(out.expression).toBeNull();
    expect(out.rationale).toBe("This drops data irreversibly.");
  });

  it("drops non-string array entries and defaults missing fields", () => {
    const out = parseDraftOutput('{"expression":"1","risks":["ok", 5, ""],"alternatives":null}', backfill);
    expect(out.risks).toEqual(["ok"]);
    expect(out.alternatives).toEqual([]);
    expect(out.rationale).toBe("");
  });
});
