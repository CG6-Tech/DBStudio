import { beforeEach, describe, expect, it } from "vitest";
import { useAiStore } from "./aiStore";
import type { DraftOutput } from "../domain/skills/draftMigrationChange";

const initial = useAiStore.getState();

beforeEach(() => {
  useAiStore.setState({ explanations: {}, drafts: {} }, false);
});

describe("aiStore drafts slice", () => {
  it("moves a draft through loading → done", () => {
    const output: DraftOutput = { expression: "0", rationale: "Zero", risks: [], alternatives: [] };
    initial.beginDraft("change:1");
    expect(useAiStore.getState().drafts["change:1"]).toEqual({ phase: "loading", output: null, error: null });
    initial.resolveDraft("change:1", output);
    expect(useAiStore.getState().drafts["change:1"]).toEqual({ phase: "done", output, error: null });
  });

  it("records a failure", () => {
    initial.beginDraft("change:2");
    initial.failDraft("change:2", "CLI not found");
    expect(useAiStore.getState().drafts["change:2"]).toEqual({ phase: "failed", output: null, error: "CLI not found" });
  });

  it("clears a draft without touching others", () => {
    initial.beginDraft("change:a");
    initial.beginDraft("change:b");
    initial.clearDraft("change:a");
    const { drafts } = useAiStore.getState();
    expect(drafts["change:a"]).toBeUndefined();
    expect(drafts["change:b"]).toBeDefined();
  });

  it("keeps drafts and explanations independent", () => {
    initial.beginDraft("shared-id");
    initial.beginExplain("shared-id");
    expect(useAiStore.getState().drafts["shared-id"].phase).toBe("loading");
    initial.resolveExplain("shared-id", { summary: "s", sideEffects: [], risks: [] });
    expect(useAiStore.getState().drafts["shared-id"].phase).toBe("loading");
    expect(useAiStore.getState().explanations["shared-id"].phase).toBe("done");
  });
});
