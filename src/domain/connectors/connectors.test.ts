import { describe, expect, it, vi } from "vitest";
import { claudeCodeConnector, codexConnector } from "./agentConnectors";
import type { CompletionRequest, ModelConnectorBoundary } from "../modelConnector";

const request: CompletionRequest = {
  system: "You are a senior DBA.",
  messages: [
    { role: "system", content: "ignored — belongs in system field" },
    { role: "user", content: "Explain this trigger." },
  ],
};

function captureBoundary(reply: string): { boundary: ModelConnectorBoundary; calls: Array<{ agentId: string; prompt: string }> } {
  const calls: Array<{ agentId: string; prompt: string }> = [];
  const boundary: ModelConnectorBoundary = {
    run: vi.fn(async (agentId, prompt) => {
      calls.push({ agentId, prompt });
      return reply;
    }),
  };
  return { boundary, calls };
}

describe("agent CLI connectors", () => {
  it("claude connector flattens the prompt (system first, no system-role turns) and tags the reply", async () => {
    const { boundary, calls } = captureBoundary("The trigger logs changes.");
    const result = await claudeCodeConnector.complete(request, { boundary });
    expect(calls[0].agentId).toBe("claude");
    expect(calls[0].prompt).toBe("You are a senior DBA.\n\nExplain this trigger.");
    expect(calls[0].prompt).not.toContain("belongs in system field");
    expect(result).toEqual({ text: "The trigger logs changes.", agentId: "claude" });
  });

  it("codex connector uses the codex agent id and trims the reply", async () => {
    const { boundary, calls } = captureBoundary("  Codex answer  ");
    const result = await codexConnector.complete(request, { boundary });
    expect(calls[0].agentId).toBe("codex");
    expect(result).toEqual({ text: "Codex answer", agentId: "codex" });
  });
});
