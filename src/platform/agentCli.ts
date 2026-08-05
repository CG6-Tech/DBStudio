import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * Thin wrappers over the Rust `ai::*` commands that shell out to a locally
 * installed agent CLI (`claude` = Claude Code, `codex` = Codex).
 *
 * DBStudio manages no credentials: it relies on the CLI the user has already
 * installed and authenticated. These are desktop-only (no CLI in the browser).
 */

const DESKTOP_ONLY = "AI features run a local agent CLI and require the DBStudio desktop app.";

/** Run an agent CLI headlessly with `prompt` on stdin; returns the reply text. */
export async function runAgentCli(agentId: string, prompt: string, programOverride?: string): Promise<string> {
  if (!isTauri()) throw new Error(DESKTOP_ONLY);
  return invoke<string>("run_agent_cli", { agentId, prompt, programOverride: programOverride ?? null, timeoutSecs: null });
}

/** Whether an agent CLI is installed and runnable (checks `--version`). */
export async function agentCliAvailable(agentId: string, programOverride?: string): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("agent_cli_available", { agentId, programOverride: programOverride ?? null });
}
