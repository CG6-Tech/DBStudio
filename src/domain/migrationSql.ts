import type { MigrationSnapshotColumn, MigrationSnapshotForeignKey, MigrationSnapshotIndex, MigrationSnapshotTable } from "./migrationSnapshot";
import type { MigrationChange, MigrationPlan, MigrationPlanDecisions } from "./migrationPlanner";
import { changeNeedsBackfill } from "./migrationRequirements";

export interface MigrationSqlResult {
  sql: string;
  blockedChangeIds: string[];
  unresolvedRenameIds: string[];
  exportable: boolean;
}

function quote(value: string, dialect: MigrationPlan["desired"]["dialect"]): string {
  const wrapper = dialect === "mysql" ? "`" : '"';
  return `${wrapper}${value.replaceAll(wrapper, wrapper + wrapper)}${wrapper}`;
}

function qualified(key: string, dialect: MigrationPlan["desired"]["dialect"]): string {
  return key.split(".").map((part) => quote(part, dialect)).join(".");
}

function columnDefinition(column: MigrationSnapshotColumn, dialect: MigrationPlan["desired"]["dialect"], nullableOverride?: boolean): string {
  const parts = [quote(column.name, dialect), column.dataType];
  if (!(nullableOverride ?? column.nullable)) parts.push("NOT NULL");
  if (column.defaultExpression) parts.push(`DEFAULT ${column.defaultExpression}`);
  if (column.unique && !column.primaryKey) parts.push("UNIQUE");
  if (column.primaryKey) parts.push("PRIMARY KEY");
  return parts.join(" ");
}

function createTableSql(table: MigrationSnapshotTable, dialect: MigrationPlan["desired"]["dialect"]): string {
  const lines = table.columns.map((column) => `  ${columnDefinition(column, dialect)}`);
  table.checks.forEach((check) => lines.push(`  ${check.name ? `CONSTRAINT ${quote(check.name, dialect)} ` : ""}CHECK (${check.expression})`));
  return `CREATE TABLE ${qualified(table.key, dialect)} (\n${lines.join(",\n")}\n);`;
}

function indexSql(index: MigrationSnapshotIndex, tableKey: string, plan: MigrationPlan): string {
  const name = quote(index.name || index.key.replaceAll(/[^a-z0-9_]/gi, "_"), plan.desired.dialect);
  const columns = index.columns.map((column) => quote(column, plan.desired.dialect)).join(", ");
  if (plan.desired.dialect === "postgresql") return `CREATE ${index.unique ? "UNIQUE " : ""}INDEX${plan.strategy === "low-lock" ? " CONCURRENTLY" : ""} ${name} ON ${qualified(tableKey, plan.desired.dialect)} USING ${index.method} (${columns});`;
  return `CREATE ${index.unique ? "UNIQUE " : ""}INDEX ${name} ON ${qualified(tableKey, plan.desired.dialect)} (${columns})${plan.strategy === "low-lock" ? " ALGORITHM=INPLACE, LOCK=NONE" : ""};`;
}

function foreignKeySql(foreignKey: MigrationSnapshotForeignKey, tableKey: string, plan: MigrationPlan): string {
  const name = quote(foreignKey.key.replaceAll(/[^a-z0-9_]/gi, "_"), plan.desired.dialect);
  const base = `ALTER TABLE ${qualified(tableKey, plan.desired.dialect)} ADD CONSTRAINT ${name} FOREIGN KEY (${quote(foreignKey.sourceColumn, plan.desired.dialect)}) REFERENCES ${qualified(foreignKey.targetTable, plan.desired.dialect)} (${quote(foreignKey.targetColumn, plan.desired.dialect)})`;
  return plan.strategy === "low-lock" && plan.desired.dialect === "postgresql" ? `${base} NOT VALID;\nALTER TABLE ${qualified(tableKey, plan.desired.dialect)} VALIDATE CONSTRAINT ${name};` : `${base};`;
}

function renderChange(change: MigrationChange, plan: MigrationPlan, decisions: MigrationPlanDecisions): string[] {
  const dialect = plan.desired.dialect;
  if (change.kind === "create-table") return [createTableSql(change.after, dialect)];
  if (change.kind === "drop-table") return [`DROP TABLE ${qualified(change.objectKey, dialect)};`];
  if (change.kind === "rename-table") {
    const { before, after } = change;
    if ((before.schema ?? "public") !== (after.schema ?? "public")) return [`ALTER TABLE ${qualified(before.key, dialect)} SET SCHEMA ${quote(after.schema ?? "public", dialect)};`, `ALTER TABLE ${qualified(after.schema ? `${after.schema}.${before.name}` : `public.${before.name}`, dialect)} RENAME TO ${quote(after.name, dialect)};`];
    return [`ALTER TABLE ${qualified(before.key, dialect)} RENAME TO ${quote(after.name, dialect)};`];
  }
  if (change.kind === "add-column") {
    const column = change.after;
    const table = qualified(change.tableKey!, dialect);
    const backfill = decisions.backfills?.[change.id]?.trim();
    if (!column.nullable && !column.defaultExpression && backfill) {
      const enforce = dialect === "postgresql" ? `ALTER TABLE ${table} ALTER COLUMN ${quote(column.name, dialect)} SET NOT NULL;` : `ALTER TABLE ${table} MODIFY COLUMN ${columnDefinition(column, dialect)};`;
      if (plan.strategy === "expand-contract") return [`ALTER TABLE ${table} ADD COLUMN ${columnDefinition(column, dialect, true)};`, `-- Backfill phase`, `UPDATE ${table} SET ${quote(column.name, dialect)} = ${backfill} WHERE ${quote(column.name, dialect)} IS NULL;`, `-- Contract phase`, enforce];
      return [`ALTER TABLE ${table} ADD COLUMN ${columnDefinition(column, dialect, true)};`, `UPDATE ${table} SET ${quote(column.name, dialect)} = ${backfill} WHERE ${quote(column.name, dialect)} IS NULL;`, enforce];
    }
    return [`ALTER TABLE ${table} ADD COLUMN ${columnDefinition(column, dialect)};`];
  }
  if (change.kind === "drop-column") return [`ALTER TABLE ${qualified(change.tableKey!, dialect)} DROP COLUMN ${quote(change.before.name, dialect)};`];
  if (change.kind === "rename-column") return [`ALTER TABLE ${qualified(change.tableKey!, dialect)} RENAME COLUMN ${quote(change.before.name, dialect)} TO ${quote(change.after.name, dialect)};`];
  if (change.kind === "alter-column") {
    const { before, after } = change;
    const table = qualified(change.tableKey!, dialect);
    const sql: string[] = [];
    if (before.dataType.toLowerCase() !== after.dataType.toLowerCase()) sql.push(dialect === "postgresql" ? `ALTER TABLE ${table} ALTER COLUMN ${quote(after.name, dialect)} TYPE ${after.dataType} USING ${quote(after.name, dialect)}::${after.dataType};` : `ALTER TABLE ${table} MODIFY COLUMN ${columnDefinition(after, dialect)};`);
    if (before.nullable !== after.nullable && dialect === "postgresql") sql.push(`ALTER TABLE ${table} ALTER COLUMN ${quote(after.name, dialect)} ${after.nullable ? "DROP" : "SET"} NOT NULL;`);
    if (before.defaultExpression !== after.defaultExpression && dialect === "postgresql") sql.push(`ALTER TABLE ${table} ALTER COLUMN ${quote(after.name, dialect)} ${after.defaultExpression ? `SET DEFAULT ${after.defaultExpression}` : "DROP DEFAULT"};`);
    return sql;
  }
  if (change.kind === "create-index") return [indexSql(change.after, change.tableKey!, plan)];
  if (change.kind === "drop-index") {
    const index = change.before;
    return [dialect === "postgresql" ? `DROP INDEX${plan.strategy === "low-lock" ? " CONCURRENTLY" : ""} ${quote(index.name || index.key, dialect)};` : `DROP INDEX ${quote(index.name || index.key, dialect)} ON ${qualified(change.tableKey!, dialect)};`];
  }
  if (change.kind === "add-foreign-key") return [foreignKeySql(change.after, change.tableKey!, plan)];
  if (change.kind === "drop-foreign-key") {
    const foreignKey = change.before;
    const action = dialect === "mysql" ? "DROP FOREIGN KEY" : "DROP CONSTRAINT";
    return [`ALTER TABLE ${qualified(change.tableKey!, dialect)} ${action} ${quote(foreignKey.key.replaceAll(/[^a-z0-9_]/gi, "_"), dialect)};`];
  }
  if (change.kind === "add-check") {
    const check = change.after;
    const name = quote(check.name || check.key.replaceAll(/[^a-z0-9_]/gi, "_"), dialect);
    return [`ALTER TABLE ${qualified(change.tableKey!, dialect)} ADD CONSTRAINT ${name} CHECK (${check.expression});`];
  }
  if (change.kind === "drop-check") {
    const check = change.before;
    const name = quote(check.name || check.key.replaceAll(/[^a-z0-9_]/gi, "_"), dialect);
    return [`ALTER TABLE ${qualified(change.tableKey!, dialect)} DROP ${dialect === "mysql" ? "CHECK" : "CONSTRAINT"} ${name};`];
  }
  if (change.kind === "create-object" || change.kind === "replace-object") {
    const definition = change.after.definition;
    return [definition.endsWith(";") ? definition : `${definition};`];
  }
  if (change.kind === "drop-object") {
    const object = change.before;
    if (object.kind === "trigger" && dialect === "postgresql" && object.targetTable) return [`DROP TRIGGER ${quote(object.key.split(".").at(-1)!, dialect)} ON ${qualified(object.targetTable, dialect)};`];
    const kind = object.kind === "routine" ? (object.routineKind ?? "function") : object.kind;
    return [`DROP ${kind.toUpperCase()} ${qualified(object.key, dialect)};`];
  }
  return [];
}

export function generateMigrationSql(plan: MigrationPlan, decisions: MigrationPlanDecisions = {}): MigrationSqlResult {
  const blockedChangeIds = plan.changes.filter((change) => {
    if (changeNeedsBackfill(change)) return !decisions.backfills?.[change.id]?.trim();
    return change.risk === "blocked" && !decisions.approvals?.[change.id]?.approved;
  }).map((change) => change.id);
  const included = plan.changes.filter((change) => !blockedChangeIds.includes(change.id));
  const sections = new Map<MigrationChange["phase"], string[]>([["expand", []], ["migrate", []], ["contract", []]]);
  included.forEach((change) => sections.get(change.phase)!.push(...renderChange(change, plan, decisions)));
  const body: string[] = [`-- DBStudio migration plan`, `-- Desired: ${plan.desired.sourceLabel}`, `-- Target: ${plan.target.sourceLabel}`, `-- Strategy: ${plan.strategy}`, `-- Fingerprint: ${plan.fingerprint}`, ""];
  if (plan.strategy === "standard" && plan.desired.dialect === "postgresql") body.push("BEGIN;", "");
  (["expand", "migrate", "contract"] as const).forEach((phase) => {
    const sql = sections.get(phase)!;
    if (!sql.length) return;
    body.push(`-- ${phase.toUpperCase()} PHASE`, ...sql, "");
    if (plan.strategy === "expand-contract" && phase !== "contract") body.push("-- MANUAL CHECKPOINT: deploy and verify before continuing.", "");
  });
  if (plan.strategy === "standard" && plan.desired.dialect === "postgresql") body.push("COMMIT;", "");
  const unresolvedRenameIds = plan.unresolvedRenameIds;
  return { sql: body.join("\n").trimEnd() + "\n", blockedChangeIds, unresolvedRenameIds, exportable: blockedChangeIds.length === 0 && unresolvedRenameIds.length === 0 };
}
