import { describe, expect, it } from "vitest";
import { minimapViewportRect } from "./canvasViewport";

const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };

describe("minimapViewportRect", () => {
  it("maps an un-panned, unit-scale viewport to the top-left fraction of the workspace", () => {
    const rect = minimapViewportRect({ x: 0, y: 0, scale: 1 }, { width: 500, height: 500 }, bounds);
    expect(rect.left).toBe(0);
    expect(rect.top).toBe(0);
    expect(rect.width).toBeCloseTo(0.5, 5);
    expect(rect.height).toBeCloseTo(0.5, 5);
  });

  it("shifts the indicator right/down as the world is panned negative", () => {
    // Panning the world by -250px at scale 1 reveals workspace x/y starting at 250.
    const rect = minimapViewportRect({ x: -250, y: -250, scale: 1 }, { width: 500, height: 500 }, bounds);
    expect(rect.left).toBeCloseTo(0.25, 5);
    expect(rect.top).toBeCloseTo(0.25, 5);
    expect(rect.width).toBeCloseTo(0.5, 5);
    expect(rect.height).toBeCloseTo(0.5, 5);
  });

  it("clamps the indicator to the [0,1] workspace and never below the 3% minimum size", () => {
    // Zoomed far in on a tiny region: the visible window is a sliver of the workspace.
    const rect = minimapViewportRect({ x: 0, y: 0, scale: 100 }, { width: 100, height: 100 }, bounds);
    expect(rect.left).toBe(0);
    expect(rect.top).toBe(0);
    expect(rect.width).toBeCloseTo(0.03, 5);
    expect(rect.height).toBeCloseTo(0.03, 5);
  });

  it("clamps left/top to zero when the viewport is panned past the workspace origin", () => {
    const rect = minimapViewportRect({ x: 400, y: 400, scale: 1 }, { width: 500, height: 500 }, bounds);
    expect(rect.left).toBe(0);
    expect(rect.top).toBe(0);
  });
});
