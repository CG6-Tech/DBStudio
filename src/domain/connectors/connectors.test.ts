import { describe, expect, it, vi } from "vitest";
import { anthropicConnector, parseAnthropicResponse } from "./anthropic";
import { openaiConnector, parseOpenAiResponse } from "./openai";
import type { CompletionRequest, ModelConnectorBoundary } from "../modelConnector";

const request: CompletionRequest = {
  system: "You are helpful.",
  messages: [
    { role: "system", content: "ignored — belongs in system field" },
    { role: "user", content: "Explain this." },
  ],
  maxTokens: 256,
  temperature: 0.1,
};

function captureBoundary(response: string): { boundary: ModelConnectorBoundary; calls: Array<{ providerId: string; endpoint: string; body: any }> } {
  const calls: Array<{ providerId: string; endpoint: string; body: any }> = [];
  const boundary: ModelConnectorBoundary = {
    complete: vi.fn(async (providerId, endpoint, body) => {
      calls.push({ providerId, endpoint, body });
      return response;
    }),
  };
  return { boundary, calls };
}

describe("anthropic connector", () => {
  it("puts system prompt at top level and excludes system-role messages", async () => {
    const { boundary, calls } = captureBoundary(
      JSON.stringify({ content: [{ type: "text", text: "Hello" }], model: "claude-opus-4-8", stop_reason: "end_turn" }),
    );
    const result = await anthropicConnector.complete(request, { model: "claude-opus-4-8", boundary });
    expect(calls[0].providerId).toBe("anthropic");
    expect(calls[0].endpoint).toContain("api.anthropic.com");
    expect(calls[0].body.system).toBe("You are helpful.");
    expect(calls[0].body.messages).toEqual([{ role: "user", content: "Explain this." }]);
    expect(calls[0].body.max_tokens).toBe(256);
    expect(result).toEqual({ text: "Hello", model: "claude-opus-4-8", stopReason: "end_turn" });
  });

  it("concatenates text blocks and ignores non-text blocks", () => {
    const parsed = parseAnthropicResponse(
      JSON.stringify({ content: [{ type: "text", text: "A" }, { type: "tool_use" }, { type: "text", text: "B" }] }),
      "fallback",
    );
    expect(parsed.text).toBe("AB");
    expect(parsed.model).toBe("fallback");
  });
});

describe("openai connector", () => {
  it("prepends system as a message and reads choices[0]", async () => {
    const { boundary, calls } = captureBoundary(
      JSON.stringify({ choices: [{ message: { content: "Hi" }, finish_reason: "stop" }], model: "gpt-4o" }),
    );
    const result = await openaiConnector.complete(request, { model: "gpt-4o", boundary });
    expect(calls[0].providerId).toBe("openai");
    expect(calls[0].endpoint).toContain("api.openai.com");
    expect(calls[0].body.messages[0]).toEqual({ role: "system", content: "You are helpful." });
    expect(calls[0].body.messages[1]).toEqual({ role: "user", content: "Explain this." });
    expect(calls[0].body.messages).toHaveLength(2);
    expect(result).toEqual({ text: "Hi", model: "gpt-4o", stopReason: "stop" });
  });

  it("falls back to the requested model when the response omits it", () => {
    const parsed = parseOpenAiResponse(JSON.stringify({ choices: [{ message: { content: "x" } }] }), "gpt-4o-mini");
    expect(parsed).toEqual({ text: "x", model: "gpt-4o-mini", stopReason: undefined });
  });
});
