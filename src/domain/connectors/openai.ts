import {
  nativeModelBoundary,
  type CompletionRequest,
  type CompletionResult,
  type ModelConnector,
} from "../modelConnector";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

/**
 * OpenAI connector (Chat Completions wire format). The `system` prompt is sent
 * as the first message with role "system". This wire format is also used by many
 * OpenAI-compatible gateways. Auth is a `Bearer` header attached in Rust.
 */
export const openaiConnector: ModelConnector = {
  id: "openai",
  label: "OpenAI",
  models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1"],
  async complete(request: CompletionRequest, options): Promise<CompletionResult> {
    const boundary = options.boundary ?? nativeModelBoundary;
    const messages = [
      ...(request.system ? [{ role: "system", content: request.system }] : []),
      ...request.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({ role: message.role, content: message.content })),
    ];
    const body = {
      model: options.model,
      max_tokens: request.maxTokens ?? 1024,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      messages,
    };
    const raw = await boundary.complete("openai", ENDPOINT, body);
    return parseOpenAiResponse(raw, options.model);
  },
};

export function parseOpenAiResponse(raw: string, fallbackModel: string): CompletionResult {
  const parsed = JSON.parse(raw) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    model?: string;
  };
  const choice = parsed.choices?.[0];
  const text = (choice?.message?.content ?? "").trim();
  return { text, model: parsed.model ?? fallbackModel, stopReason: choice?.finish_reason };
}
