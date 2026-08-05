import { runAgentCli } from "../platform/agentCli";

/**
 * The model-connector seam.
 *
 * Mirrors the swappable-parser seam in {@link ./schemaParser}, but as a registry
 * keyed by provider id so additional providers are pure additions. Every skill
 * runs completions through {@link runCompletion} rather than importing a
 * connector directly.
 *
 * A connector drives a locally installed agent CLI (Claude Code, Codex) that the
 * user has already authenticated. DBStudio manages no API keys: it flattens the
 * request into a single prompt, hands it to the CLI via {@link ModelConnectorBoundary},
 * and returns the reply. The boundary is injectable so connectors are unit-testable
 * without spawning a process — copies the pattern in {@link ../platform/updater}.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResult {
  text: string;
  agentId: string;
}

/**
 * The native side of a completion: run an agent CLI with `prompt` on stdin and
 * return its reply text. Injectable for tests (no process spawn).
 */
export interface ModelConnectorBoundary {
  run: (agentId: string, prompt: string) => Promise<string>;
}

/** Default boundary — delegates to the Rust `run_agent_cli` command. */
export const nativeModelBoundary: ModelConnectorBoundary = {
  run: runAgentCli,
};

export interface ModelConnector {
  /** Stable agent id — also the CLI binary name ("claude" | "codex"). */
  readonly id: string;
  /** Human-readable label for settings UI. */
  readonly label: string;
  /**
   * Run a completion by flattening the request into a prompt, invoking the CLI
   * through `boundary.run`, and returning the reply.
   */
  complete(
    request: CompletionRequest,
    options?: { boundary?: ModelConnectorBoundary },
  ): Promise<CompletionResult>;
}

const registry = new Map<string, ModelConnector>();
let activeConnectorId: string | null = null;

const ACTIVE_STORAGE_KEY = "dbstudio.ai.activeConnector.v1";

/**
 * Flatten a request into a single prompt string for a CLI agent. System prompt
 * first, then the conversation turns. Shared by all CLI connectors.
 */
export function flattenPrompt(request: CompletionRequest): string {
  const parts: string[] = [];
  if (request.system.trim()) parts.push(request.system.trim());
  for (const message of request.messages) {
    if (message.role === "system") continue;
    parts.push(message.content.trim());
  }
  return parts.join("\n\n");
}

/** Register (or replace) a connector. */
export function registerModelConnector(connector: ModelConnector): void {
  registry.set(connector.id, connector);
  if (activeConnectorId === null) activeConnectorId = connector.id;
}

/** Look up a connector by id. */
export function getModelConnector(id: string): ModelConnector | undefined {
  return registry.get(id);
}

/** All registered connectors, in registration order. */
export function listModelConnectors(): ModelConnector[] {
  return [...registry.values()];
}

/** Test/reset helper — clears the registry and active selection. */
export function resetModelConnectors(): void {
  registry.clear();
  activeConnectorId = null;
}

/** The active provider id, restoring a persisted choice when valid. */
export function getActiveConnectorId(): string | null {
  const stored = safeGet(ACTIVE_STORAGE_KEY);
  if (stored && registry.has(stored)) return stored;
  return activeConnectorId;
}

/** Set the active provider, persisting the choice. Ignores unknown ids. */
export function setActiveConnectorId(id: string): void {
  if (!registry.has(id)) return;
  activeConnectorId = id;
  safeSet(ACTIVE_STORAGE_KEY, id);
}

/** The active connector, or undefined if none is registered/selected. */
export function getActiveConnector(): ModelConnector | undefined {
  const id = getActiveConnectorId();
  return id ? registry.get(id) : undefined;
}

/**
 * Production entry point: run a completion through the active connector.
 * Throws a user-facing error when no agent is selected.
 */
export async function runCompletion(
  request: CompletionRequest,
  options: { boundary?: ModelConnectorBoundary } = {},
): Promise<CompletionResult> {
  const connector = getActiveConnector();
  if (!connector) {
    throw new Error("No AI agent is selected. Open AI settings to choose Claude Code or Codex.");
  }
  return connector.complete(request, { boundary: options.boundary });
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — fall back to in-memory active id */
  }
}
