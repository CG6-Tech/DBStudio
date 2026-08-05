import { isChangeKind, objectPayload, type MigrationChange, type MigrationChangePayload, type MigrationPlan, type MigrationRisk } from "./migrationPlanner";
import type { MigrationSnapshotColumn, MigrationSnapshotObject, MigrationSnapshotTable } from "./migrationSnapshot";

export type MigrationDiffState = "added" | "removed" | "modified" | "renamed" | "unchanged";
export type MigrationDiffLane = "added" | "changed" | "removed" | "unchanged";

export interface MigrationDiffRow {
  id: string;
  changeId?: string;
  kind: MigrationChange["objectKind"] | "column";
  label: string;
  before?: string;
  after?: string;
  state: MigrationDiffState;
  risk: MigrationRisk;
}

export interface MigrationDiffCard {
  id: string;
  key: string;
  title: string;
  subtitle: string;
  objectKind: "table" | "type" | "routine" | "trigger";
  state: MigrationDiffState;
  lane: MigrationDiffLane;
  risk: MigrationRisk;
  changeIds: string[];
  rows: MigrationDiffRow[];
}

export interface MigrationDiffEdge {
  id: string;
  changeId: string;
  sourceCardId: string;
  targetCardId: string;
  state: MigrationDiffState;
  risk: MigrationRisk;
}

export interface MigrationDiffProjection {
  cards: MigrationDiffCard[];
  edges: MigrationDiffEdge[];
  cardById: Map<string, MigrationDiffCard>;
  cardIdByChangeId: Map<string, string>;
  changeById: Map<string, MigrationChange>;
}

const riskRank: Record<MigrationRisk, number> = { safe: 0, review: 1, blocked: 2 };
const laneRank: Record<MigrationDiffLane, number> = { added: 0, changed: 1, removed: 2, unchanged: 3 };

function highestRisk(changes: readonly MigrationChange[]): MigrationRisk {
  return changes.reduce<MigrationRisk>((risk, change) => riskRank[change.risk] > riskRank[risk] ? change.risk : risk, "safe");
}

function columnSummary(column: MigrationSnapshotColumn | undefined): string | undefined {
  if (!column) return undefined;
  const attributes = [column.dataType];
  if (!column.nullable) attributes.push("NOT NULL");
  if (column.defaultExpression) attributes.push(`DEFAULT ${column.defaultExpression}`);
  if (column.primaryKey) attributes.push("PRIMARY KEY");
  else if (column.unique) attributes.push("UNIQUE");
  return attributes.join(" · ");
}

function payloadSummary(value: MigrationChangePayload | undefined): string | undefined {
  if (!value) return undefined;
  if ("dataType" in value) return columnSummary(value);
  if ("method" in value) return `${value.unique ? "UNIQUE · " : ""}${value.method ?? "btree"} (${value.columns.join(", ")})`;
  if ("expression" in value) return value.expression;
  if ("sourceColumn" in value) return `${value.sourceColumn} → ${value.targetTable}.${value.targetColumn}`;
  if ("definition" in value) return value.definition.replaceAll(/\s+/g, " ").trim();
  return undefined;
}

/** The display name of a payload, if it carries one (foreign keys are keyed, not named). */
function payloadName(value: MigrationChangePayload | undefined): string | undefined {
  return value && "name" in value ? value.name : undefined;
}

function stateForChange(change: MigrationChange): MigrationDiffState {
  if (change.kind.startsWith("rename-")) return "renamed";
  if (change.kind.startsWith("create-") || change.kind.startsWith("add-")) return "added";
  if (change.kind.startsWith("drop-")) return "removed";
  return "modified";
}

function labelForChange(change: MigrationChange): string {
  const before = payloadName("before" in change ? change.before : undefined);
  const after = payloadName("after" in change ? change.after : undefined);
  if (change.kind.startsWith("rename-") && before && after) return `${before} → ${after}`;
  if (after || before) return after ?? before!;
  const normalized = change.objectKey.replace(/:(replace|replacement)$/, "");
  return normalized.split(".").at(-1) ?? normalized;
}

function rowForChange(change: MigrationChange): MigrationDiffRow {
  return {
    id: `row:${change.id}`,
    changeId: change.id,
    kind: change.objectKind,
    label: labelForChange(change),
    before: payloadSummary("before" in change ? change.before : undefined),
    after: payloadSummary("after" in change ? change.after : undefined),
    state: stateForChange(change),
    risk: change.risk,
  };
}

function tableChanges(plan: MigrationPlan, key: string): MigrationChange[] {
  return plan.changes.filter((change) => change.tableKey === key || (change.objectKind === "table" && (change.objectKey === key || change.objectKey.includes(`${key}->`) || change.objectKey.includes(`->${key}`))));
}

function tableState(desired: MigrationSnapshotTable | undefined, target: MigrationSnapshotTable | undefined, changes: readonly MigrationChange[]): MigrationDiffState {
  if (!target) return "added";
  if (!desired) return "removed";
  if (changes.some((change) => change.kind === "rename-table")) return "renamed";
  return changes.length ? "modified" : "unchanged";
}

function unchangedColumnRows(desired: MigrationSnapshotTable | undefined, target: MigrationSnapshotTable | undefined, changes: readonly MigrationChange[]): MigrationDiffRow[] {
  if (!desired || !target) return [];
  const changedNames = new Set<string>();
  changes.forEach((change) => {
    const before = payloadName("before" in change ? change.before : undefined);
    const after = payloadName("after" in change ? change.after : undefined);
    if (before) changedNames.add(before.toLocaleLowerCase("en"));
    if (after) changedNames.add(after.toLocaleLowerCase("en"));
  });
  const targetByKey = new Map(target.columns.map((column) => [column.key, column]));
  return desired.columns.flatMap((column) => {
    const before = targetByKey.get(column.key);
    if (!before || before.fingerprint !== column.fingerprint || changedNames.has(column.name.toLocaleLowerCase("en"))) return [];
    return [{ id: `row:unchanged:${desired.key}:${column.key}`, kind: "column" as const, label: column.name, before: columnSummary(column), after: columnSummary(column), state: "unchanged" as const, risk: "safe" as const }];
  });
}

function tableCard(plan: MigrationPlan, key: string, desired?: MigrationSnapshotTable, target?: MigrationSnapshotTable): MigrationDiffCard {
  const changes = tableChanges(plan, key);
  const state = tableState(desired, target, changes);
  const rows = [...changes.filter((change) => change.objectKind !== "table").map(rowForChange), ...unchangedColumnRows(desired, target, changes)];
  if (state === "added" && desired) rows.unshift(...desired.columns.map((column) => ({ id: `row:added:${key}:${column.key}`, kind: "column" as const, label: column.name, after: columnSummary(column), state: "added" as const, risk: "safe" as const })));
  if (state === "removed" && target) rows.unshift(...target.columns.map((column) => ({ id: `row:removed:${key}:${column.key}`, kind: "column" as const, label: column.name, before: columnSummary(column), state: "removed" as const, risk: "blocked" as const })));
  const table = desired ?? target!;
  return {
    id: `migration-card:table:${key}`,
    key,
    title: table.name,
    subtitle: table.schema ?? "public",
    objectKind: "table",
    state,
    lane: state === "modified" || state === "renamed" ? "changed" : state,
    risk: highestRisk(changes),
    changeIds: changes.map((change) => change.id),
    rows,
  };
}

function objectCard(change: MigrationChange, object: MigrationSnapshotObject): MigrationDiffCard {
  const state = stateForChange(change);
  return {
    id: `migration-card:${object.kind}:${object.key}`,
    key: object.key,
    title: object.name,
    subtitle: object.kind,
    objectKind: object.kind,
    state,
    lane: state === "modified" || state === "renamed" ? "changed" : state,
    risk: change.risk,
    changeIds: [change.id],
    rows: [rowForChange(change)],
  };
}

export function projectMigrationDiff(plan: MigrationPlan): MigrationDiffProjection {
  const desiredTables = new Map(plan.desired.tables.map((table) => [table.key, table]));
  const targetTables = new Map(plan.target.tables.map((table) => [table.key, table]));
  const renamedTargetKeys = new Set<string>();
  const renamedTargetByDesired = new Map<string, MigrationSnapshotTable>();
  plan.changes.filter(isChangeKind("rename-table")).forEach((change) => {
    renamedTargetKeys.add(change.before.key);
    renamedTargetByDesired.set(change.after.key, change.before);
  });
  const tableKeys = [...new Set([...desiredTables.keys(), ...targetTables.keys()].filter((key) => !renamedTargetKeys.has(key)))];
  const cards = tableKeys.map((key) => tableCard(plan, key, desiredTables.get(key), renamedTargetByDesired.get(key) ?? targetTables.get(key)));
  plan.changes.forEach((change) => {
    const object = objectPayload(change);
    if (object) cards.push(objectCard(change, object));
  });
  cards.sort((left, right) => laneRank[left.lane] - laneRank[right.lane] || left.key.localeCompare(right.key));

  const cardById = new Map(cards.map((card) => [card.id, card]));
  const cardIdByKey = new Map(cards.map((card) => [card.key, card.id]));
  const cardIdByChangeId = new Map<string, string>();
  cards.forEach((card) => card.changeIds.forEach((changeId) => cardIdByChangeId.set(changeId, card.id)));
  const changeById = new Map(plan.changes.map((change) => [change.id, change]));
  const edges = plan.changes.flatMap((change): MigrationDiffEdge[] => {
    const payload = ("after" in change ? change.after : undefined) ?? ("before" in change ? change.before : undefined);
    const targetTable = payload && "targetTable" in payload ? payload.targetTable : undefined;
    const sourceKey = change.objectKind === "foreign-key" ? change.tableKey : change.objectKind === "trigger" ? change.objectKey : undefined;
    if (!sourceKey || !targetTable) return [];
    const sourceCardId = cardIdByKey.get(sourceKey);
    const targetCardId = cardIdByKey.get(targetTable);
    if (!sourceCardId || !targetCardId) return [];
    return [{ id: `migration-edge:${change.id}`, changeId: change.id, sourceCardId, targetCardId, state: stateForChange(change), risk: change.risk }];
  });
  return { cards, edges, cardById, cardIdByChangeId, changeById };
}
