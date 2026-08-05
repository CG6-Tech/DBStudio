import {
  nativeModelBoundary,
  type CompletionRequest,
  type CompletionResult,
  type ModelConnector,
} from "../modelConnector";

const ENDPOINT = "https://api.anthropic.com/v1/messages";

/**
 * Anthropic (Claude) connector. Uses the Messages API: `system` is a top-level
 * field, only user/assistant turns go in `messages`. Auth headers (`x-api-key`,
 * `anthropic-version`) are attached in the Rust `ai_complete` command.
 */
export const anthropicConnector: ModelConnector = {
  id: "anthropic",
  label: "Anthropic (Claude)",
  models: ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5-20251001"],
  async complete(request: CompletionRequest, options): Promise<CompletionResult> {
    const boundary = options.boundary ?? nativeModelBoundary;
    const body = {
      model: options.model,
      max_tokens: request.maxTokens ?? 1024,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      system: request.system,
      messages: request.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({ role: message.role, content: message.content })),
    };
    const raw = await boundary.complete("anthropic", ENDPOINT, body);
    return parseAnthropicResponse(raw, options.model);
  },
};

export function parseAnthropicResponse(raw: string, fallbackModel: string): CompletionResult {
  const parsed = JSON.parse(raw) as {
    content?: Array<{ type?: string; text?: string }>;
    model?: string;
    stop_reason?: string;
  };
  const text = (parsed.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("")
    .trim();
  return { text, model: parsed.model ?? fallbackModel, stopReason: parsed.stop_reason };
}
