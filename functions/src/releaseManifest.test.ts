import { describe, expect, it } from "vitest";
import { decideManifest, updaterJson } from "./releaseManifest";

const release = {
  channel: "beta" as const,
  version: "0.1.0-beta.2",
  published: true,
  mandatory: false,
  notes: "Update notes",
  targets: {
    "darwin-aarch64": { storagePath: "updates/beta/0.1.0-beta.2/darwin-aarch64/DBStudio.app.tar.gz", signature: "s".repeat(80), size: 1024 },
  },
};

describe("release manifest", () => {
  it("returns no update for the current version", () => {
    expect(decideManifest({ channel: "beta", target: "darwin", arch: "aarch64", currentVersion: "0.1.0-beta.2" }, release)).toEqual({ kind: "current" });
  });

  it("selects the exact platform artifact", () => {
    const decision = decideManifest({ channel: "beta", target: "darwin", arch: "aarch64", currentVersion: "0.1.0-beta.1" }, release);
    expect(decision.kind).toBe("available");
    if (decision.kind === "available") expect(updaterJson(decision, "https://signed.example/artifact")).toMatchObject({ version: "0.1.0-beta.2", url: "https://signed.example/artifact", channel: "beta", size: 1024 });
  });

  it("rejects unsupported inputs without revealing release data", () => {
    expect(decideManifest({ channel: "stable", target: "darwin", arch: "aarch64", currentVersion: "0.1.0" }, release).kind).toBe("bad-request");
    expect(decideManifest({ channel: "beta", target: "ios", arch: "aarch64", currentVersion: "0.1.0-beta.1" }, release).kind).toBe("bad-request");
  });
});
