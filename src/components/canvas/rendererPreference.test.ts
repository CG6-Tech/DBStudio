import { describe, expect, it } from "vitest";
import { CANVAS_RENDERER_PREFERENCE } from "./rendererPreference";

describe("canvas renderer preference", () => {
  it("uses WebGL for compatibility with Tauri system webviews", () => {
    expect(CANVAS_RENDERER_PREFERENCE).toBe("webgl");
  });
});
