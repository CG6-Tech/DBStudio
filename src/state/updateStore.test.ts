import { beforeEach, describe, expect, it } from "vitest";
import { useUpdateStore } from "./updateStore";

beforeEach(() => useUpdateStore.setState({ phase: "idle", update: null, dialogOpen: false, progress: null, downloaded: 0, total: null, error: null, manual: false }));

describe("update store", () => {
  it("opens the dialog for an available update and tracks progress", () => {
    useUpdateStore.getState().setAvailable({ version: "0.1.0-beta.2", currentVersion: "0.1.0-beta.1", notes: "Fixes", mandatory: false, size: 100 });
    useUpdateStore.getState().setDownloading();
    useUpdateStore.getState().setProgress(25, 100, 25);
    expect(useUpdateStore.getState()).toMatchObject({ phase: "downloading", dialogOpen: true, downloaded: 25, total: 100, progress: 25 });
  });

  it("does not close a mandatory update", () => {
    useUpdateStore.getState().setAvailable({ version: "0.1.0-beta.2", currentVersion: "0.1.0-beta.1", notes: "Security update", mandatory: true });
    useUpdateStore.getState().closeDialog();
    expect(useUpdateStore.getState().dialogOpen).toBe(true);
  });
});
