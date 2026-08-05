import { registerSkill, type Skill } from "../skills";
import type { CompletionRequest } from "../modelConnector";
import type { SqlDialect } from "../types";
import type { MigrationChange } from "../migrationPlanner";
import type { MigrationSnapshotColumn, MigrationSnapshotTable } from "../migrationSnapshot";

/**
 * Migration Reviewer / Backfill Drafter — the second skill.
 *
 * Two modes share one output shape and one skill id, dispatched on `kind`:
 *  - `backfill`: drafts a SQL expression to fill existing rows for a new NOT NULL
 *    column that the planner flagged as needing a backfill. The whole desired
 *    table is passed so the model can reference sibling columns rather than
 *    inventing a bare literal.
 *  - `blocked`: explains *why* a destructive/blocking change is unsafe to run
 *    directly and lists concrete safer alternatives (make nullable, add a
 *    default, expand-contract, …).
 *
 * The prompt is built from the already-structured migration snapshot, mirroring
 * the explainer skill so the model gets precise, pre-digested context.
 */

export interface DraftOutput {
  /** Backfill mode: the drafted SQL expression. Null in blocked mode. */
  expression: string | null;
  /** Why this expression / why the change is blocked. */
  rationale: string;
  /** Correctness / performance / safety risks. */
  risks: string[];
  /** Blocked mode: safe ways forward. Usually empty for backfill. */
  alternatives: string[];
}

export type DraftInput =
  | { kind: "backfill"; dialect: SqlDialect; column: MigrationSnapshotColumn; table: MigrationSnapshotTable }
  | { kind: "blocked"; dialect: SqlDialect; change: MigrationChange };

export const DRAFT_MIGRATION_SKILL_ID = "draft-migration-change";

const SYSTEM_PROMPT =
  "You are a senior database engineer reviewing a schema migration plan. " +
  "You either draft a backfill SQL expression for a new required column, or explain why a " +
  "destructive change is unsafe to run directly and how to do it safely. " +
  "Ground every answer in the provided structured context — do not invent tables, columns, or behavior. " +
  "Respond ONLY with a JSON object of the form " +
  '{"expression": string | null, "rationale": string, "risks": string[], "alternatives": string[]}. ' +
  "In backfill mode, `expression` is a single SQL value expression valid for the given dialect and " +
  "`alternatives` is usually empty. In blocked mode, `expression` is null and `alternatives` lists " +
  "concrete safer approaches. Keep rationale to 1-3 sentences. Use empty arrays when there is nothing to add.";

function columnFacts(column: MigrationSnapshotColumn): string {
  return [
    `${column.name} ${column.dataType}`,
    column.nullable ? "nullable" : "NOT NULL",
    column.primaryKey ? "primary key" : null,
    column.unique ? "unique" : null,
    column.defaultExpression ? `default ${column.defaultExpression}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function backfillPrompt(dialect: SqlDialect, column: MigrationSnapshotColumn, table: MigrationSnapshotTable): string {
  const tableName = table.schema ? `${table.schema}.${table.name}` : table.name;
  const siblings = table.columns
    .filter((other) => other.key !== column.key)
    .map((other) => `- ${columnFacts(other)}`)
    .join("\n");
  const facts = [
    `Dialect: ${dialect}`,
    `Task: draft a backfill expression for existing rows in table ${tableName}`,
    `New required column: ${columnFacts(column)}`,
    siblings ? `Other columns in the table:\n${siblings}` : "The table has no other columns.",
  ];
  return `${facts.join("\n")}\n\nProduce a single SQL value expression that populates this column for existing rows. Only reference the columns listed above.`;
}

function payloadSummary(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.name === "string") {
    const type = typeof record.dataType === "string" ? ` ${record.dataType}` : "";
    return `${record.name}${type}`;
  }
  if (typeof record.key === "string") return record.key;
  return null;
}

function blockedPrompt(dialect: SqlDialect, change: MigrationChange): string {
  const before = payloadSummary(change.before);
  const after = payloadSummary(change.after);
  const facts = [
    `Dialect: ${dialect}`,
    `Task: explain why this migration change is blocked and how to perform it safely`,
    `Change: ${change.kind.replaceAll("-", " ")} on ${change.objectKind} ${change.objectKey}`,
    `Planner reason: ${change.reason}`,
    `Reversible: ${change.reversible ? "yes" : "no"}`,
    change.phase ? `Phase: ${change.phase}` : null,
    before ? `Current: ${before}` : null,
    after ? `Desired: ${after}` : null,
  ].filter(Boolean);
  return `${facts.join("\n")}\n\nExplain the risk and list concrete safer alternatives. Do not draft a backfill expression.`;
}

function buildUserPrompt(input: DraftInput): string {
  switch (input.kind) {
    case "backfill":
      return backfillPrompt(input.dialect, input.column, input.table);
    case "blocked":
      return blockedPrompt(input.dialect, input.change);
  }
}

export function parseDraftOutput(raw: string, input: DraftInput): DraftOutput {
  const text = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Model didn't return JSON. In backfill mode the whole reply is a candidate
    // expression; in blocked mode it's the rationale.
    const trimmed = raw.trim();
    return input.kind === "backfill"
      ? { expression: trimmed, rationale: "", risks: [], alternatives: [] }
      : { expression: null, rationale: trimmed, risks: [], alternatives: [] };
  }
  const object = (parsed ?? {}) as Record<string, unknown>;
  const expression =
    input.kind === "backfill" && typeof object.expression === "string" && object.expression.trim().length > 0
      ? object.expression.trim()
      : null;
  return {
    expression,
    rationale: typeof object.rationale === "string" ? object.rationale.trim() : "",
    risks: toStringArray(object.risks),
    alternatives: toStringArray(object.alternatives),
  };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

/** Pull the first {...} block out of a response that may be fenced or prose-wrapped. */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start !== -1 && end > start) return candidate.slice(start, end + 1);
  return candidate;
}

export const draftMigrationChangeSkill: Skill<DraftInput, DraftOutput> = {
  id: DRAFT_MIGRATION_SKILL_ID,
  label: "Draft migration change",
  buildPrompt(input): CompletionRequest {
    return {
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(input) }],
      maxTokens: 700,
      temperature: 0.2,
    };
  },
  parseResult(raw, input): DraftOutput {
    return parseDraftOutput(raw, input);
  },
};

/** Register the migration-drafter skill. Called from registerConnectors at startup. */
export function registerDraftMigrationChangeSkill(): void {
  registerSkill(draftMigrationChangeSkill);
}
