import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceCommandBar } from "./WorkspaceCommandBar";

afterEach(cleanup);

function props() {
  return {
    canUndo: true,
    canRedo: false,
    dialect: "postgresql" as const,
    title: "customers.sql",
    dirty: true,
    onImportWorkspaceData: vi.fn(),
    onExportWorkspaceData: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onFit: vi.fn(),
    onPreview: vi.fn(),
    onSave: vi.fn(),
    onDialectChange: vi.fn(),
  };
}

describe("WorkspaceCommandBar", () => {
  it("keeps document context, workspace data, history, and view commands in the secondary toolbar", () => {
    const handlers = props();
    const view = render(<WorkspaceCommandBar {...handlers}/>);
    fireEvent.click(view.getByLabelText("Import workspace data"));
    fireEvent.click(view.getByLabelText("Export workspace data"));
    fireEvent.click(view.getByLabelText("Undo"));
    fireEvent.click(view.getByLabelText("Expand diagram"));
    fireEvent.click(view.getByLabelText("Code preview"));
    fireEvent.click(view.getByText("Save"));
    expect(view.getByText("customers.sql")).toBeInTheDocument();
    expect(view.getByText("Unsaved")).toBeInTheDocument();
    expect(view.container.querySelector(".dirty-dot.active")).toBeInTheDocument();
    expect(handlers.onImportWorkspaceData).toHaveBeenCalledOnce();
    expect(handlers.onExportWorkspaceData).toHaveBeenCalledOnce();
    expect(handlers.onUndo).toHaveBeenCalledOnce();
    expect(handlers.onFit).toHaveBeenCalledOnce();
    expect(handlers.onPreview).toHaveBeenCalledOnce();
    expect(handlers.onSave).toHaveBeenCalledOnce();
    expect(view.getByLabelText("Redo")).toBeDisabled();
  });

  it("changes the SQL dialect", () => {
    const handlers = props();
    const view = render(<WorkspaceCommandBar {...handlers}/>);
    fireEvent.change(view.getByLabelText("SQL dialect"), { target: { value: "mysql" } });
    expect(handlers.onDialectChange).toHaveBeenCalledWith("mysql");
  });

  it("disables Save when the document has no changes", () => {
    const handlers = props();
    const view = render(<WorkspaceCommandBar {...handlers} dirty={false}/>);
    expect(view.getByText("Save").closest("button")).toBeDisabled();
    expect(view.getByText("Saved")).toBeInTheDocument();
  });
});
