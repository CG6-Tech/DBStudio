import { ArrowRight, Check, CircleAlert, ShieldAlert } from "lucide-react";
import type { MigrationChange, MigrationPlan } from "../domain/migrationPlanner";
import { useUiStore } from "../state/uiStore";

function title(change: MigrationChange): string {
  return change.kind.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function valueSummary(value: unknown): string {
  if (!value || typeof value !== "object") return value === undefined ? "—" : String(value);
  const item = value as Record<string, unknown>;
  if (typeof item.dataType === "string") return [item.dataType, item.nullable === false ? "NOT NULL" : null, item.defaultExpression ? `DEFAULT ${item.defaultExpression}` : null].filter(Boolean).join(" · ");
  if (Array.isArray(item.columns)) return `${item.unique ? "UNIQUE · " : ""}${item.method ?? "btree"} (${item.columns.join(", ")})`;
  if (typeof item.expression === "string") return item.expression;
  if (typeof item.sourceColumn === "string") return `${item.sourceColumn} → ${item.targetTable}.${item.targetColumn}`;
  if (typeof item.name === "string") return item.name;
  return "Schema object";
}

export function MigrationPlanWorkspace({ plan }: { plan: MigrationPlan }) {
  const selectedId = useUiStore((state) => state.migrationSelectedChangeId);
  const select = useUiStore((state) => state.setMigrationSelectedChangeId);
  return <div className="migration-plan-workspace">
    <header><div><strong>Migration plan</strong><span>{plan.target.sourceLabel} → {plan.desired.sourceLabel}</span></div><p>{plan.changes.length} ordered changes</p></header>
    <div className="migration-plan-table" role="list">
      {plan.changes.map((change, index) => <button role="listitem" key={change.id} className={`${change.risk}${selectedId === change.id ? " selected" : ""}`} onClick={() => select(change.id)}>
        <span className="migration-plan-order">{String(index + 1).padStart(2, "0")}</span>
        <i>{change.risk === "safe" ? <Check size={14} /> : change.risk === "review" ? <CircleAlert size={14} /> : <ShieldAlert size={14} />}</i>
        <span className="migration-plan-operation"><strong>{title(change)}</strong><small title={change.objectKey}>{change.objectKey}</small></span>
        <span className="migration-plan-value"><small>Old</small><b title={valueSummary(change.before)}>{valueSummary(change.before)}</b></span>
        <ArrowRight className="migration-plan-arrow" size={14} />
        <span className="migration-plan-value"><small>New</small><b title={valueSummary(change.after)}>{valueSummary(change.after)}</b></span>
        <span className="migration-plan-reason"><small>{change.phase}</small><b>{change.reason}</b></span>
      </button>)}
    </div>
  </div>;
}
