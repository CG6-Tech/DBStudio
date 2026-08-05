import { Sparkles, Loader2, AlertTriangle, Settings2 } from "lucide-react";
import { runSkill } from "../../domain/skills";
import { EXPLAIN_ROUTINE_SKILL_ID, type ExplainInput, type ExplainOutput } from "../../domain/skills/explainRoutine";
import { getActiveConnector } from "../../domain/modelConnector";
import { useAiStore } from "../../state/aiStore";
import { InspectorSection } from "../ui/InspectorPrimitives";

/**
 * AI "Explain" section for the logic inspectors. Runs the explainer skill for a
 * given target and renders summary / side effects / risks. Keyed by `targetId`
 * so an explanation persists (cached) while that object stays selected.
 */
export function ExplainSection({ targetId, input }: { targetId: string; input: ExplainInput }) {
  const entry = useAiStore((state) => state.explanations[targetId]);
  const beginExplain = useAiStore((state) => state.beginExplain);
  const resolveExplain = useAiStore((state) => state.resolveExplain);
  const failExplain = useAiStore((state) => state.failExplain);
  const openSettings = useAiStore((state) => state.openSettings);

  const phase = entry?.phase ?? "idle";

  const run = async () => {
    beginExplain(targetId);
    try {
      const output = await runSkill<ExplainInput, ExplainOutput>(EXPLAIN_ROUTINE_SKILL_ID, input);
      resolveExplain(targetId, output);
    } catch (error) {
      failExplain(targetId, error instanceof Error ? error.message : String(error));
    }
  };

  const configured = Boolean(getActiveConnector());

  return (
    <InspectorSection title="AI explanation" className="ai-explain">
      <button className="ai-explain-settings" onClick={openSettings} title="AI provider settings" aria-label="AI provider settings">
        <Settings2 size={13} />
      </button>
      {!configured && (
        <button className="ai-explain-configure" onClick={openSettings}>
          <Settings2 size={13} /> Choose an AI agent to explain this
        </button>
      )}
      {configured && phase !== "done" && (
        <button className="ai-explain-run" onClick={run} disabled={phase === "loading"}>
          {phase === "loading" ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
          {phase === "loading" ? "Explaining…" : phase === "failed" ? "Retry explanation" : "Explain this"}
        </button>
      )}
      {phase === "failed" && entry?.error && (
        <p className="ai-explain-error"><AlertTriangle size={13} /> {entry.error}</p>
      )}
      {phase === "done" && entry?.output && <ExplanationBody output={entry.output} onRegenerate={run} />}
    </InspectorSection>
  );
}

function ExplanationBody({ output, onRegenerate }: { output: ExplainOutput; onRegenerate: () => void }) {
  return (
    <div className="ai-explain-result">
      <p className="ai-explain-summary">{output.summary}</p>
      {output.sideEffects.length > 0 && (
        <div className="ai-explain-list">
          <h4>Side effects</h4>
          <ul>{output.sideEffects.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
      )}
      {output.risks.length > 0 && (
        <div className="ai-explain-list ai-explain-risks">
          <h4>Risks</h4>
          <ul>{output.risks.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
      )}
      <button className="ai-explain-regenerate" onClick={onRegenerate}><Sparkles size={12} /> Regenerate</button>
    </div>
  );
}
