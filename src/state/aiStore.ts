import { create } from "zustand";
import type { ExplainOutput } from "../domain/skills/explainRoutine";
import type { DraftOutput } from "../domain/skills/draftMigrationChange";

/**
 * AI request lifecycle state, keyed by target id (a routine/trigger/flow-node id)
 * so multiple explanations can coexist and be cached. Provider/model config and
 * secrets live in the domain/platform layers (localStorage / Keychain), not here —
 * per the migrationConnections precedent. This store holds only UI/phase state.
 */

export type AiPhase = "idle" | "loading" | "done" | "failed";

export interface ExplanationEntry {
  phase: AiPhase;
  output: ExplainOutput | null;
  error: string | null;
}

/** Lifecycle of a migration-change draft (backfill or blocked), keyed by change id. */
export interface DraftEntry {
  phase: AiPhase;
  output: DraftOutput | null;
  error: string | null;
}

interface AiState {
  explanations: Record<string, ExplanationEntry>;
  drafts: Record<string, DraftEntry>;
  settingsOpen: boolean;
  beginExplain: (targetId: string) => void;
  resolveExplain: (targetId: string, output: ExplainOutput) => void;
  failExplain: (targetId: string, error: string) => void;
  clearExplain: (targetId: string) => void;
  beginDraft: (changeId: string) => void;
  resolveDraft: (changeId: string, output: DraftOutput) => void;
  failDraft: (changeId: string, error: string) => void;
  clearDraft: (changeId: string) => void;
  openSettings: () => void;
  closeSettings: () => void;
}

export const useAiStore = create<AiState>((set) => ({
  explanations: {},
  drafts: {},
  settingsOpen: false,
  beginExplain: (targetId) =>
    set((state) => ({
      explanations: { ...state.explanations, [targetId]: { phase: "loading", output: null, error: null } },
    })),
  resolveExplain: (targetId, output) =>
    set((state) => ({
      explanations: { ...state.explanations, [targetId]: { phase: "done", output, error: null } },
    })),
  failExplain: (targetId, error) =>
    set((state) => ({
      explanations: { ...state.explanations, [targetId]: { phase: "failed", output: null, error } },
    })),
  clearExplain: (targetId) =>
    set((state) => {
      const next = { ...state.explanations };
      delete next[targetId];
      return { explanations: next };
    }),
  beginDraft: (changeId) =>
    set((state) => ({
      drafts: { ...state.drafts, [changeId]: { phase: "loading", output: null, error: null } },
    })),
  resolveDraft: (changeId, output) =>
    set((state) => ({
      drafts: { ...state.drafts, [changeId]: { phase: "done", output, error: null } },
    })),
  failDraft: (changeId, error) =>
    set((state) => ({
      drafts: { ...state.drafts, [changeId]: { phase: "failed", output: null, error } },
    })),
  clearDraft: (changeId) =>
    set((state) => {
      const next = { ...state.drafts };
      delete next[changeId];
      return { drafts: next };
    }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
}));
