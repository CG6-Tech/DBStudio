import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdateDialog } from "./UpdateDialog";

const base = {
  phase: "available" as const,
  update: { version: "0.1.0-beta.2", currentVersion: "0.1.0-beta.1", notes: "Improved schema editing", mandatory: false },
  error: null,
  progress: null,
  downloaded: 0,
  total: null,
  dirty: false,
  onClose: vi.fn(), onInstall: vi.fn(), onLater: vi.fn(), onRetry: vi.fn(), onSave: vi.fn(), onExport: vi.fn(), onExit: vi.fn(),
};

afterEach(cleanup);

describe("update dialog", () => {
  it("offers install and deferral for an optional update", () => {
    const view = render(<UpdateDialog {...base}/>);
    fireEvent.click(view.getByText("Install now"));
    fireEvent.click(view.getByText("Later"));
    expect(base.onInstall).toHaveBeenCalledOnce();
    expect(base.onLater).toHaveBeenCalledOnce();
  });

  it("blocks install and exit while work is unsaved", () => {
    const view = render(<UpdateDialog {...base} dirty update={{ ...base.update, mandatory: true }}/>);
    expect(view.getByText("Install now")).toBeDisabled();
    expect(view.getByText("Exit DBStudio")).toBeDisabled();
    expect(view.getByText("Save changes")).toBeVisible();
    expect(view.getByText("Export SQL")).toBeVisible();
  });
});
