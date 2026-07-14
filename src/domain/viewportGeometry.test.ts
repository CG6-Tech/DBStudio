import { describe, expect, it } from "vitest";
import { MIN_CANVAS_ZOOM, scaleToFit } from "./viewportGeometry";

describe("scaleToFit", () => {
  it("fits a wide multi-table workspace below the old 35 percent limit", () => {
    expect(scaleToFit(900, 700, { minX: 0, minY: 0, maxX: 115_000, maxY: 900 })).toBeCloseTo(760 / 115_000);
  });

  it("keeps extremely large workspaces within a safe positive scale", () => {
    expect(scaleToFit(900, 700, { minX: 0, minY: 0, maxX: 10_000_000, maxY: 5_000_000 })).toBe(MIN_CANVAS_ZOOM);
  });
});
