import { registerSkill, type Skill } from "../skills";
import type { CompletionRequest } from "../modelConnector";
import type { DatabaseTrigger, Routine, SqlDialect } from "../types";
import type { RoutineFlowNode } from "../routineFlow";

/**
 * PL/pgSQL Explainer — the first skill.
 *
 * Explains a routine, trigger, or a single flow-canvas step in plain English:
 * what it does, its side effects, and its risks. The prompt is built from the
 * already-parsed structured data (references, projections) rather than raw SQL,
 * so the model gets precise, pre-digested context.
 *
 * Three input shapes share one output shape and one skill id, dispatched on
 * `target.kind`.
 */

export interface ExplainOutput {
  summary: string;
  sideEffects: string[];
  risks: string[];
}

export type ExplainInput =
  | { kind: "routine"; dialect: SqlDialect; routine: Routine }
  | { kind: "trigger"; dialect: SqlDialect; trigger: DatabaseTrigger }
  | { kind: "flow-node"; dialect: SqlDialect; routineName: string; node: RoutineFlowNode };

export const EXPLAIN_ROUTINE_SKILL_ID = "explain-routine";

const SYSTEM_PROMPT =
  "You are a senior database engineer reviewing PL/pgSQL and SQL routines. " +
  "Explain the given database logic clearly and concisely for another engineer. " +
  "Focus on what it actually does, the data it changes (side effects), and any correctness, " +
  "performance, or safety risks. Do not invent behavior that is not present in the provided context. " +
  "Respond ONLY with a JSON object of the form " +
  '{"summary": string, "sideEffects": string[], "risks": string[]}. ' +
  "Keep summary to 1-3 sentences. Use empty arrays when there are no side effects or risks.";

function refList(label: string, refs: { name: string; schema?: string }[]): string | null {
  if (refs.length === 0) return null;
  const names = refs.map((ref) => (ref.schema ? `${ref.schema}.${ref.name}` : ref.name)).join(", ");
  return `${label}: ${names}`;
}

function routinePrompt(dialect: SqlDialect, routine: Routine): string {
  const params = routine.parameters
    .map((param) => `${param.name ?? "?"} ${param.dataType}${param.mode ? ` (${param.mode})` : ""}`)
    .join(", ");
  const facts = [
    `Dialect: ${dialect}`,
    `${routine.kind} ${routine.schema ? `${routine.schema}.` : ""}${routine.name}`,
    params ? `Parameters: ${params}` : null,
    routine.returnType ? `Returns: ${routine.returnType}` : null,
    routine.language ? `Language: ${routine.language}` : null,
    refList("Reads from", routine.reads),
    refList("Inserts into", routine.inserts),
    refList("Updates", routine.updates),
    refList("Deletes from", routine.deletes),
    refList("Calls", routine.calls),
    routine.partial ? "Note: the parser only partially recognized this routine." : null,
  ].filter(Boolean);
  return `${facts.join("\n")}\n\nDefinition:\n${routine.definitionSql}`;
}

function triggerPrompt(dialect: SqlDialect, trigger: DatabaseTrigger): string {
  const target = trigger.targetTable.schema
    ? `${trigger.targetTable.schema}.${trigger.targetTable.name}`
    : trigger.targetTable.name;
  const facts = [
    `Dialect: ${dialect}`,
    `Trigger ${trigger.schema ? `${trigger.schema}.` : ""}${trigger.name}`,
    trigger.timing ? `Timing: ${trigger.timing}` : null,
    trigger.events.length ? `Events: ${trigger.events.join(", ")}` : null,
    trigger.scope ? `Scope: per ${trigger.scope}` : null,
    `On table: ${target}`,
    trigger.condition ? `When: ${trigger.condition}` : null,
    trigger.executedRoutine ? `Executes: ${trigger.executedRoutine.name}` : null,
  ].filter(Boolean);
  return `${facts.join("\n")}\n\nDefinition:\n${trigger.definitionSql}`;
}

function flowNodePrompt(dialect: SqlDialect, routineName: string, node: RoutineFlowNode): string {
  const facts = [
    `Dialect: ${dialect}`,
    `Step in routine "${routineName}"`,
    `Step type: ${node.kind}`,
    `Title: ${node.title}`,
    node.diagnostic ? `Parser ${node.diagnostic.level}: ${node.diagnostic.message}` : null,
  ].filter(Boolean);
  const details = node.details ? `\n\nParsed details:\n${JSON.stringify(node.details, null, 2)}` : "";
  const source = node.source ? `\n\nSource:\n${node.source}` : "";
  return `${facts.join("\n")}${source}${details}`;
}

function buildUserPrompt(input: ExplainInput): string {
  switch (input.kind) {
    case "routine":
      return routinePrompt(input.dialect, input.routine);
    case "trigger":
      return triggerPrompt(input.dialect, input.trigger);
    case "flow-node":
      return flowNodePrompt(input.dialect, input.routineName, input.node);
  }
}

export function parseExplainOutput(raw: string): ExplainOutput {
  const text = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Model didn't return JSON — treat the whole response as the summary.
    return { summary: raw.trim(), sideEffects: [], risks: [] };
  }
  const object = (parsed ?? {}) as Record<string, unknown>;
  return {
    summary: typeof object.summary === "string" ? object.summary.trim() : raw.trim(),
    sideEffects: toStringArray(object.sideEffects),
    risks: toStringArray(object.risks),
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

export const explainRoutineSkill: Skill<ExplainInput, ExplainOutput> = {
  id: EXPLAIN_ROUTINE_SKILL_ID,
  label: "Explain database logic",
  buildPrompt(input): CompletionRequest {
    return {
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(input) }],
      maxTokens: 700,
      temperature: 0.2,
    };
  },
  parseResult(raw): ExplainOutput {
    return parseExplainOutput(raw);
  },
};

/** Register the explainer skill. Called from registerConnectors at startup. */
export function registerExplainRoutineSkill(): void {
  registerSkill(explainRoutineSkill);
}
