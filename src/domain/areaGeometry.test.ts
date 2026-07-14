import { describe, expect, it } from "vitest";
import { MIN_AREA_HEIGHT, MIN_AREA_WIDTH, moveArea, pointerDelta, resizeArea } from "./areaGeometry";

describe("area canvas geometry", () => {
  it("converts pointer movement into world-space movement at the current zoom", () => {
    const delta = pointerDelta({ x: 100, y: 80 }, { x: 160, y: 20 }, 1.5);
    expect(delta).toEqual({ x: 40, y: -40 });
    expect(moveArea({ x: 90, y: 120 }, delta)).toEqual({ x: 130, y: 80 });
  });

  it("resizes in both dimensions and enforces minimum area dimensions", () => {
    expect(resizeArea({ width: 620, height: 380 }, { x: 80, y: 45 })).toEqual({ width: 700, height: 425 });
    expect(resizeArea({ width: 300, height: 200 }, { x: -500, y: -500 })).toEqual({ width: MIN_AREA_WIDTH, height: MIN_AREA_HEIGHT });
  });
});
