import { aiComplete } from "../platform/aiSecrets";

/**
 * The model-connector seam.
 *
 * Mirrors the swappable-parser seam in {@link ./schemaParser}, but as a registry
 * keyed by provider id so additional providers are pure additions. Every skill
 * runs completions through {@link runCompletion} rather than importing a
 * connector directly.
 *
 * Connectors only shape the request/response for their wire format; the actual
 * HTTP call and API-key handling happen in Rust (via {@link ModelConnectorBoundary}),
 * so the key never enters the webview.
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
  model: string;
  stopReason?: string;
}

/**
 * The native side of a completion: POST a pre-built body to `endpoint` and
 * return the raw response text. Injectable so connectors are unit-testable with
 * a fake boundary (no network) — copies the pattern in {@link ../platform/updater}.
 */
export interface ModelConnectorBoundary {
  complete: (providerId: string, endpoint: string, body: unknown) => Promise<string>;
}

/** Default boundary — delegates to the Rust `ai_complete` command. */
export const nativeModelBoundary: ModelConnectorBoundary = {
  complete: aiComplete,
};

export interface ModelConnector {
  /** Stable provider id — also the Keychain account for the stored key. */
  readonly id: string;
  /** Human-readable label for settings UI. */
  readonly label: string;
  /** Selectable model ids; the first is the default. */
  readonly models: string[];
  /**
   * Run a completion. Implementations build the provider-specific body, call
   * `boundary.complete`, and parse the response into a {@link CompletionResult}.
   */
  complete(
    request: CompletionRequest,
    options: { model: string; boundary?: ModelConnectorBoundary },
  ): Promise<CompletionResult>;
}

const registry = new Map<string, ModelConnector>();
let activeConnectorId: string | null = null;

const ACTIVE_STORAGE_KEY = "dbstudio.ai.activeConnector.v1";
const MODEL_STORAGE_KEY = "dbstudio.ai.activeModel.v1";

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

/** The chosen model for the active provider, defaulting to its first model. */
export function getActiveModel(connector = getActiveConnector()): string | undefined {
  if (!connector) return undefined;
  const stored = safeGet(`${MODEL_STORAGE_KEY}.${connector.id}`);
  if (stored && connector.models.includes(stored)) return stored;
  return connector.models[0];
}

/** Set the chosen model for a provider, persisting per-provider. */
export function setActiveModel(providerId: string, model: string): void {
  safeSet(`${MODEL_STORAGE_KEY}.${providerId}`, model);
}

/**
 * Production entry point: run a completion through the active connector.
 * Throws a user-facing error when no provider is configured.
 */
export async function runCompletion(
  request: CompletionRequest,
  options: { boundary?: ModelConnectorBoundary } = {},
): Promise<CompletionResult> {
  const connector = getActiveConnector();
  if (!connector) {
    throw new Error("No AI provider is configured. Open AI settings to add one.");
  }
  const model = getActiveModel(connector);
  if (!model) throw new Error(`The provider ${connector.label} has no available models.`);
  return connector.complete(request, { model, boundary: options.boundary });
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
