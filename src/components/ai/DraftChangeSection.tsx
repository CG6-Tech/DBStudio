import { Sparkles, Loader2, AlertTriangle, Settings2, Wand2, Check } from "lucide-react";
import { runSkill } from "../../domain/skills";
import { DRAFT_MIGRATION_SKILL_ID, type DraftInput, type DraftOutput } from "../../domain/skills/draftMigrationChange";
import { getActiveConnector } from "../../domain/modelConnector";
import type { SqlDialect } from "../../domain/types";
import type { MigrationChange } from "../../domain/migrationPlanner";
import type { MigrationSnapshotTable } from "../../domain/migrationSnapshot";
import { useAiStore } from "../../state/aiStore";

/**
 * AI drafter for a single migration required-action. In `backfill` mode it drafts
 * a SQL expression for existing rows and offers it as an accept-able suggestion;
 * in `blocked` mode it explains why the change is unsafe and lists alternatives.
 * Keyed by `change.id` in the AI store so a draft persists across list/canvas
 * navigation. Mirrors {@link ../ai/ExplainSection}.
 */
export function DraftChangeSection({
  change,
  dialect,
  table,
  mode,
  onAccept,
}: {
  change: MigrationChange;
  dialect: SqlDialect;
  table?: MigrationSnapshotTable;
  mode: "backfill" | "blocked";
  onAccept?: (expression: string) => void;
}) {
  const entry = useAiStore((state) => state.drafts[change.id]);
  const beginDraft = useAiStore((state) => state.beginDraft);
  const resolveDraft = useAiStore((state) => state.resolveDraft);
  const failDraft = useAiStore((state) => state.failDraft);
  const openSettings = useAiStore((state) => state.openSettings);

  const phase = entry?.phase ?? "idle";
  const configured = Boolean(getActiveConnector());

  const run = async () => {
    // Backfill mode needs the new column and its table; without them there is
    // nothing to draft against, so fall back to a settings nudge.
    if (mode === "backfill" && (change.kind !== "add-column" || !table)) return;
    const input: DraftInput =
      mode === "backfill" && change.kind === "add-column" && table
        ? { kind: "backfill", dialect, column: change.after, table }
        : { kind: "blocked", dialect, change };
    beginDraft(change.id);
    try {
      const output = await runSkill<DraftInput, DraftOutput>(DRAFT_MIGRATION_SKILL_ID, input);
      resolveDraft(change.id, output);
    } catch (error) {
      failDraft(change.id, error instanceof Error ? error.message : String(error));
    }
  };

  const runLabel = mode === "backfill" ? "Draft backfill" : "Explain block";

  return (
    <div className="ai-draft">
      {!configured && (
        <button className="ai-draft-configure" onClick={openSettings}>
          <Settings2 size={13} /> Choose an AI agent
        </button>
      )}
      {configured && phase !== "done" && (
        <button className="ai-draft-run" onClick={() => void run()} disabled={phase === "loading"}>
          {phase === "loading" ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
          {phase === "loading" ? "Thinking…" : phase === "failed" ? "Retry" : runLabel}
        </button>
      )}
      {phase === "failed" && entry?.error && (
        <p className="ai-draft-error"><AlertTriangle size={13} /> {entry.error}</p>
      )}
      {phase === "done" && entry?.output && (
        <DraftBody output={entry.output} mode={mode} onAccept={onAccept} onRegenerate={() => void run()} />
      )}
    </div>
  );
}

function DraftBody({
  output,
  mode,
  onAccept,
  onRegenerate,
}: {
  output: DraftOutput;
  mode: "backfill" | "blocked";
  onAccept?: (expression: string) => void;
  onRegenerate: () => void;
}) {
  return (
    <div className="ai-draft-result">
      {mode === "backfill" && output.expression && (
        <div className="ai-draft-suggestion">
          <code>{output.expression}</code>
          {onAccept && (
            <button className="ai-draft-accept" onClick={() => onAccept(output.expression!)}>
              <Check size={12} /> Use this
            </button>
          )}
        </div>
      )}
      {output.rationale && <p className="ai-draft-rationale">{output.rationale}</p>}
      {output.risks.length > 0 && (
        <div className="ai-draft-list ai-draft-risks">
          <h4>Risks</h4>
          <ul>{output.risks.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
      )}
      {output.alternatives.length > 0 && (
        <div className="ai-draft-list">
          <h4>Safer alternatives</h4>
          <ul>{output.alternatives.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
      )}
      <button className="ai-draft-regenerate" onClick={onRegenerate}><Wand2 size={12} /> Regenerate</button>
    </div>
  );
}
