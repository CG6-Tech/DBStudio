import { describe, expect, it } from "vitest";
import { betaExpiryLabel, BETA_EXPIRES_AT, isBetaExpired } from "./betaExpiry";

describe("beta expiry lock", () => {
  it("allows the beta before September 1, 2026", () => {
    expect(isBetaExpired(new Date(2026, 7, 31, 23, 59, 59, 999))).toBe(false);
  });

  it("locks the beta from September 1, 2026 local time", () => {
    expect(isBetaExpired(new Date(2026, 8, 1, 0, 0, 0, 0))).toBe(true);
  });

  it("has a clear user-facing expiry date", () => {
    expect(BETA_EXPIRES_AT).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0));
    expect(betaExpiryLabel()).toBe("September 1, 2026");
  });
});
