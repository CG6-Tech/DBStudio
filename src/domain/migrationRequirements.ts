import type { MigrationChange, MigrationPlan, MigrationPlanDecisions, MigrationRenameSuggestion } from "./migrationPlanner";

export type MigrationRequirementKind = "rename" | "backfill" | "approval";

export interface MigrationRequirement {
  id: string;
  kind: MigrationRequirementKind;
  label: string;
  detail: string;
  resolved: boolean;
  changeId?: string;
  suggestionId?: string;
}

export function changeNeedsBackfill(change: MigrationChange): boolean {
  if (change.kind !== "add-column") return false;
  return !change.after.nullable && !change.after.defaultExpression;
}

function changeMatchesRename(change: MigrationChange, suggestion: MigrationRenameSuggestion): boolean {
  if (suggestion.kind === "table") {
    return change.objectKind === "table" && (change.objectKey === suggestion.targetKey || change.objectKey === suggestion.desiredKey);
  }
  if (change.objectKind !== "column" || change.tableKey !== suggestion.tableKey) return false;
  const before = "before" in change ? change.before : undefined;
  const after = "after" in change ? change.after : undefined;
  return before?.key === suggestion.targetKey || after?.key === suggestion.desiredKey;
}

function unresolvedRenameForChange(plan: MigrationPlan, decisions: MigrationPlanDecisions, change: MigrationChange): MigrationRenameSuggestion | undefined {
  return plan.renameSuggestions.find((suggestion) => decisions.renames?.[suggestion.id] === undefined && changeMatchesRename(change, suggestion));
}

function renameRequirement(suggestion: MigrationRenameSuggestion, decisions: MigrationPlanDecisions): MigrationRequirement {
  const decision = decisions.renames?.[suggestion.id];
  return {
    id: `requirement:${suggestion.id}`,
    kind: "rename",
    label: `Decide ${suggestion.targetKey} → ${suggestion.desiredKey}`,
    detail: decision === "accepted" ? "Rename confirmed" : decision === "rejected" ? "Keep as separate objects" : `${Math.round(suggestion.score * 100)}% structural match`,
    resolved: decision !== undefined,
    suggestionId: suggestion.id,
  };
}

export function migrationRequirements(plan: MigrationPlan, decisions: MigrationPlanDecisions): MigrationRequirement[] {
  const requirements = plan.renameSuggestions.map((suggestion) => renameRequirement(suggestion, decisions));
  plan.changes.forEach((change) => {
    if (unresolvedRenameForChange(plan, decisions, change)) return;
    if (changeNeedsBackfill(change)) {
      const value = decisions.backfills?.[change.id]?.trim() ?? "";
      requirements.push({
        id: `requirement:backfill:${change.id}`,
        kind: "backfill",
        label: `Backfill ${change.objectKey}`,
        detail: value ? value : "Provide a SQL expression for existing rows",
        resolved: Boolean(value),
        changeId: change.id,
      });
      return;
    }
    if (change.risk === "blocked") {
      const approved = Boolean(decisions.approvals?.[change.id]?.approved);
      requirements.push({
        id: `requirement:approval:${change.id}`,
        kind: "approval",
        label: `Approve ${change.objectKey}`,
        detail: approved ? "Destructive change approved" : change.reason,
        resolved: approved,
        changeId: change.id,
      });
    }
  });
  return requirements.sort((left, right) => Number(left.resolved) - Number(right.resolved) || left.kind.localeCompare(right.kind) || left.label.localeCompare(right.label));
}

export function migrationRequirementForChange(plan: MigrationPlan, decisions: MigrationPlanDecisions, changeId: string): MigrationRequirement | undefined {
  const change = plan.changes.find((item) => item.id === changeId);
  if (!change) return undefined;
  const rename = unresolvedRenameForChange(plan, decisions, change);
  if (rename) return renameRequirement(rename, decisions);
  return migrationRequirements(plan, decisions).find((requirement) => requirement.changeId === changeId && !requirement.resolved);
}
