import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * Thin wrappers over the Rust `ai::*` commands. Follows the desktop-only pattern
 * in {@link ./desktop}: the API key lives in the macOS Keychain and never enters
 * the webview, so every function here throws in the browser preview.
 *
 * The actual completion HTTP call is {@link aiComplete} — it runs in the Rust
 * process (attaching the stored key), which is why no provider host needs to be
 * added to the webview CSP.
 */

const DESKTOP_ONLY = "AI features are available in the DBStudio desktop app.";

/** Store (or replace) the API key for a provider in the macOS Keychain. */
export async function saveAiSecret(providerId: string, apiKey: string): Promise<void> {
  if (!isTauri()) throw new Error(DESKTOP_ONLY);
  await invoke("save_ai_secret", { providerId, apiKey });
}

/** Remove a provider's stored API key. Safe to call when none exists. */
export async function deleteAiSecret(providerId: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("delete_ai_secret", { providerId });
}

/** Whether a provider currently has a key stored (never returns the key itself). */
export async function hasAiSecret(providerId: string): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("has_ai_secret", { providerId });
}

/**
 * POST a pre-built request body to a provider endpoint, attaching the stored key
 * in Rust, and return the raw response text for the connector to parse.
 */
export async function aiComplete(providerId: string, endpoint: string, body: unknown): Promise<string> {
  if (!isTauri()) throw new Error(DESKTOP_ONLY);
  return invoke<string>("ai_complete", { providerId, endpoint, body });
}
