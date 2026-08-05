import {
  runCompletion,
  type CompletionRequest,
  type ModelConnectorBoundary,
} from "./modelConnector";

/**
 * The skills registry.
 *
 * A skill is a named unit of app-aware AI work: it builds a prompt from
 * structured app state, runs it through the active model connector, and parses
 * the response into a typed result. {@link runSkill} is the single choke point
 * every skill (explainer, and future schema critic / migration reviewer / NL
 * edits) flows through — skills are pure additions to this registry.
 */

export interface Skill<Input, Output> {
  /** Stable skill id. */
  readonly id: string;
  /** Human-readable label for UI. */
  readonly label: string;
  /** Build the provider-agnostic completion request from structured input. */
  buildPrompt(input: Input): CompletionRequest;
  /** Parse the raw completion text into the skill's typed output. */
  parseResult(raw: string, input: Input): Output;
}

// The registry stores skills with erased type parameters; runSkill re-applies
// the caller's types, which are guaranteed by the id → skill pairing at the
// registration site.
const registry = new Map<string, Skill<unknown, unknown>>();

/** Register (or replace) a skill. */
export function registerSkill<Input, Output>(skill: Skill<Input, Output>): void {
  registry.set(skill.id, skill as Skill<unknown, unknown>);
}

/** Look up a skill by id. */
export function getSkill(id: string): Skill<unknown, unknown> | undefined {
  return registry.get(id);
}

/** All registered skills, in registration order. */
export function listSkills(): Skill<unknown, unknown>[] {
  return [...registry.values()];
}

/** Test/reset helper — clears the registry. */
export function resetSkills(): void {
  registry.clear();
}

/**
 * Run a skill end-to-end: build its prompt, run the completion through the
 * active connector, and parse the result. Throws if the skill is unknown.
 */
export async function runSkill<Input, Output>(
  skillId: string,
  input: Input,
  options: { boundary?: ModelConnectorBoundary } = {},
): Promise<Output> {
  const skill = registry.get(skillId) as Skill<Input, Output> | undefined;
  if (!skill) throw new Error(`Unknown skill: ${skillId}`);
  const request = skill.buildPrompt(input);
  const result = await runCompletion(request, options);
  return skill.parseResult(result.text, input);
}
