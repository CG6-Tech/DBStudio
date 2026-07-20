import { describe, expect, it } from "vitest";
import { compareVersions, evaluateUpdate, isUpdateDeferred, shouldCheckForUpdate, UPDATE_CHECK_INTERVAL_MS, UPDATE_DEFERRAL_MS } from "./updatePolicy";

describe("beta update policy", () => {
  it("orders semantic prereleases", () => {
    expect(compareVersions("0.1.0-beta.1", "0.1.0-beta.2")).toBe(-1);
    expect(compareVersions("0.1.0-beta.2", "0.1.0")).toBe(-1);
    expect(compareVersions("invalid", "0.1.0-beta.2")).toBeNull();
  });

  it("rejects other channels and downgrades", () => {
    expect(evaluateUpdate("0.1.0-beta.1", { version: "0.1.0-beta.2", channel: "stable" }).kind).toBe("wrong-channel");
    expect(evaluateUpdate("0.1.0-beta.2", { version: "0.1.0-beta.1", channel: "beta" }).kind).toBe("downgrade");
  });

  it("marks explicit and minimum-version updates mandatory", () => {
    expect(evaluateUpdate("0.1.0-beta.1", { version: "0.1.0-beta.2", channel: "beta", mandatory: true })).toEqual({ kind: "available", mandatory: true });
    expect(evaluateUpdate("0.1.0-beta.1", { version: "0.1.0-beta.3", channel: "beta", minimumSupportedVersion: "0.1.0-beta.2" })).toEqual({ kind: "available", mandatory: true });
  });

  it("checks every six hours and lets manual checks bypass the interval", () => {
    expect(shouldCheckForUpdate(UPDATE_CHECK_INTERVAL_MS - 1, 0)).toBe(false);
    expect(shouldCheckForUpdate(UPDATE_CHECK_INTERVAL_MS, 0)).toBe(true);
    expect(shouldCheckForUpdate(1, 0, true)).toBe(true);
  });

  it("defers one version for 24 hours but never defers a manual check", () => {
    const deferred = { version: "0.1.0-beta.2", at: 0 };
    expect(isUpdateDeferred("0.1.0-beta.2", UPDATE_DEFERRAL_MS - 1, deferred)).toBe(true);
    expect(isUpdateDeferred("0.1.0-beta.2", UPDATE_DEFERRAL_MS, deferred)).toBe(false);
    expect(isUpdateDeferred("0.1.0-beta.2", 1, deferred, true)).toBe(false);
  });
});
