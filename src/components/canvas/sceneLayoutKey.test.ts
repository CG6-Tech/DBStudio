import { describe, expect, it } from "vitest";
import { sceneLayoutKey, shouldFitLayoutGeneration } from "./sceneLayoutKey";

describe("sceneLayoutKey", () => {
  const nodes = [{ id: "users", x: 70, y: 70, width: 280, height: 180 }];

  it("is stable for equivalent node geometry", () => {
    expect(sceneLayoutKey(nodes)).toBe(sceneLayoutKey(nodes.map((node) => ({ ...node }))));
  });

  it("changes when a table moves", () => {
    expect(sceneLayoutKey(nodes)).not.toBe(sceneLayoutKey([{ ...nodes[0], x: 420 }]));
  });

  it("changes when a table is resized", () => {
    expect(sceneLayoutKey(nodes)).not.toBe(sceneLayoutKey([{ ...nodes[0], width: 360 }]));
  });
});

describe("shouldFitLayoutGeneration", () => {
  it("fits every newly published layout generation", () => {
    expect(shouldFitLayoutGeneration(null, 1, false)).toBe(true);
    expect(shouldFitLayoutGeneration(1, 2, false)).toBe(true);
  });

  it("does not repeatedly fit an unchanged generation", () => {
    expect(shouldFitLayoutGeneration(2, 2, false)).toBe(false);
  });

  it("always honors an explicit fit request", () => {
    expect(shouldFitLayoutGeneration(2, 2, true)).toBe(true);
  });
});
