import { describe, expect, it } from "vitest";
import { adaptiveGrid, projectPoint, quantizeDevicePixel, snapPoint, zoomAround } from "./canvasGeometry";

describe("canvas geometry", () => {
  it("keeps adaptive dots visible while preserving power-of-two world levels", () => {
    expect(adaptiveGrid(0.1)).toMatchObject({ spacing: 11, level: 4 });
    expect(adaptiveGrid(1).radius).toBe(1);
  });

  it("uses hysteresis so tiny zoom changes do not flip grid density", () => {
    expect(adaptiveGrid(0.29, 1).level).toBe(1);
    expect(adaptiveGrid(0.28, 1).level).toBe(2);
    expect(adaptiveGrid(0.42, 2).level).toBe(2);
    expect(adaptiveGrid(0.43, 2).level).toBe(1);
  });

  it("aligns CSS values to physical device pixels", () => {
    expect(quantizeDevicePixel(10.26, 2)).toBe(10.5);
    expect(quantizeDevicePixel(-0.24, 2)).toBe(-0);
  });

  it("preserves the anchored world coordinate while zooming", () => {
    const next = zoomAround({ x: 20, y: 40, scale: 1 }, { x: 200, y: 160 }, 2);
    expect((200 - next.x) / next.scale).toBe(180);
    expect((160 - next.y) / next.scale).toBe(120);
  });

  it("snaps in world coordinates and projects minimap points", () => {
    expect(snapPoint({ x: 43, y: 69 })).toEqual({ x: 56, y: 56 });
    expect(projectPoint({ x: 50, y: 25 }, { minX: 0, minY: 0, maxX: 100, maxY: 50 })).toEqual({ x: 0.5, y: 0.5 });
  });
});
