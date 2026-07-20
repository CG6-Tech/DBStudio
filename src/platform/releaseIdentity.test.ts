import { describe, expect, it } from "vitest";
import { APP_VERSION, IS_BETA, RELEASE_CHANNEL } from "./releaseIdentity";

describe("release identity", () => {
  it("uses the synchronized beta version supplied by the build", () => {
    expect(APP_VERSION).toBe("0.1.0-beta.1");
    expect(RELEASE_CHANNEL).toBe("beta");
    expect(IS_BETA).toBe(true);
  });
});
