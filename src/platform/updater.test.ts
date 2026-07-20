import type { DownloadEvent } from "@tauri-apps/plugin-updater";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkForAppUpdate, discardPendingUpdate, installPendingUpdate, type UpdaterBoundary } from "./updater";

function fakeBoundary(rawJson: Record<string, unknown> = {}): { boundary: UpdaterBoundary; close: ReturnType<typeof vi.fn>; download: ReturnType<typeof vi.fn>; relaunch: ReturnType<typeof vi.fn> } {
  const close = vi.fn(async () => undefined);
  const download = vi.fn(async (onEvent?: (event: DownloadEvent) => void) => {
    onEvent?.({ event: "Started", data: { contentLength: 100 } });
    onEvent?.({ event: "Progress", data: { chunkLength: 40 } });
    onEvent?.({ event: "Progress", data: { chunkLength: 60 } });
    onEvent?.({ event: "Finished" });
  });
  const relaunch = vi.fn(async () => undefined);
  const boundary: UpdaterBoundary = {
    check: vi.fn(async () => ({ version: "0.1.0-beta.2", currentVersion: "0.1.0-beta.1", body: "Safer migrations", rawJson, downloadAndInstall: download, close })),
    relaunch,
    exit: vi.fn(async () => undefined),
  };
  return { boundary, close, download, relaunch };
}

afterEach(async () => { await discardPendingUpdate(); });

describe("native updater adapter", () => {
  it("accepts a newer beta and validates custom mandatory metadata", async () => {
    const { boundary } = fakeBoundary({ channel: "beta", mandatory: true, size: 2048 });
    await expect(checkForAppUpdate(boundary)).resolves.toEqual({
      kind: "available",
      update: { version: "0.1.0-beta.2", currentVersion: "0.1.0-beta.1", notes: "Safer migrations", publishedAt: undefined, size: 2048, mandatory: true },
    });
  });

  it("closes resources for another release channel", async () => {
    const { boundary, close } = fakeBoundary({ channel: "stable" });
    await expect(checkForAppUpdate(boundary)).resolves.toEqual({ kind: "ignored" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("reports progress, installs, and relaunches", async () => {
    const { boundary, download, relaunch } = fakeBoundary({ channel: "beta" });
    await checkForAppUpdate(boundary);
    const progress = vi.fn();
    await installPendingUpdate(progress, boundary);
    expect(download).toHaveBeenCalledOnce();
    expect(progress).toHaveBeenLastCalledWith({ downloaded: 100, total: 100, percent: 100 });
    expect(relaunch).toHaveBeenCalledOnce();
  });
});
