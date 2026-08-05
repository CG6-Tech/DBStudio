import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerSkill, resetSkills, runSkill, type Skill } from "./skills";
import {
  getActiveConnector,
  registerModelConnector,
  resetModelConnectors,
  setActiveConnectorId,
  type ModelConnector,
} from "./modelConnector";

function fakeConnector(reply: string): ModelConnector {
  return {
    id: "fake",
    label: "Fake",
    models: ["fake-1"],
    complete: vi.fn(async () => ({ text: reply, model: "fake-1" })),
  };
}

const echoSkill: Skill<{ value: string }, { echoed: string }> = {
  id: "echo",
  label: "Echo",
  buildPrompt: (input) => ({ system: "sys", messages: [{ role: "user", content: input.value }] }),
  parseResult: (raw) => ({ echoed: raw }),
};

beforeEach(() => {
  resetSkills();
  resetModelConnectors();
});

describe("skills registry", () => {
  it("runs a skill through the active connector and parses the result", async () => {
    registerModelConnector(fakeConnector("world"));
    setActiveConnectorId("fake");
    registerSkill(echoSkill);
    const result = await runSkill<{ value: string }, { echoed: string }>("echo", { value: "hello" });
    expect(result).toEqual({ echoed: "world" });
  });

  it("throws for an unknown skill id", async () => {
    registerModelConnector(fakeConnector("x"));
    setActiveConnectorId("fake");
    await expect(runSkill("missing", {})).rejects.toThrow(/Unknown skill/);
  });

  it("throws when no connector is configured", async () => {
    registerSkill(echoSkill);
    await expect(runSkill("echo", { value: "hi" })).rejects.toThrow(/No AI provider/);
  });
});

describe("connector registry", () => {
  it("defaults the active connector to the first registered, then honors an explicit switch", () => {
    registerModelConnector(fakeConnector("a"));
    registerModelConnector({ ...fakeConnector("b"), id: "second", label: "Second" });
    expect(getActiveConnector()?.id).toBe("fake");
    setActiveConnectorId("second");
    expect(getActiveConnector()?.id).toBe("second");
  });

  it("ignores an attempt to activate an unknown connector", () => {
    registerModelConnector(fakeConnector("a"));
    setActiveConnectorId("nope");
    expect(getActiveConnector()?.id).toBe("fake");
  });
});
