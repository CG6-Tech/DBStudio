import {
  flattenPrompt,
  nativeModelBoundary,
  type CompletionRequest,
  type CompletionResult,
  type ModelConnector,
} from "../modelConnector";

/**
 * Connectors that drive a locally installed agent CLI. Both flatten the request
 * to a single prompt and hand it to the CLI (via the boundary → Rust). They
 * differ only in id/label; the Rust side knows how to invoke each binary and
 * parse its reply. No API keys — the CLI is already authenticated by the user.
 */

function cliConnector(id: string, label: string): ModelConnector {
  return {
    id,
    label,
    async complete(request: CompletionRequest, options): Promise<CompletionResult> {
      const boundary = options?.boundary ?? nativeModelBoundary;
      const text = await boundary.run(id, flattenPrompt(request));
      return { text: text.trim(), agentId: id };
    },
  };
}

export const claudeCodeConnector = cliConnector("claude", "Claude Code");
export const codexConnector = cliConnector("codex", "Codex");
