# DBStudio Floating Canvas Toolbar Design

## Goal

Turn the canvas command bar into a full-width floating control surface inspired by the supplied reference. Move Save into this bar so editing context and document actions live together while the main header remains focused on application-level actions.

## Placement and Dimensions

The toolbar overlays the top of the diagram canvas instead of occupying a workspace grid row. It is inset 12px from the canvas's top, left, and right edges, making it span the usable canvas width while retaining a clearly floating appearance.

The surface is 44px tall with rounded corners, a thin blue-grey border, a dark raised background, and a restrained shadow. The canvas continues behind the toolbar. The sidebar remains outside the toolbar and retains its full height.

## Command Layout

Controls are arranged left to right:

1. SQL dialect selector.
2. Divider.
3. Current document or workspace name and Saved/Unsaved state.
4. Flexible space.
5. Import workspace data.
6. Undo and Redo.
7. Expand/Fit diagram and Code/SQL preview.
8. Divider.
9. Primary Save button.

The filename is the flexible element and truncates with an ellipsis when space is constrained. All commands retain accessible labels and tooltips. Thin separators distinguish context, editing commands, view commands, and Save.

## Main Header

The main header retains:

- DBStudio logo, name, and Beta badge.
- Update-check action.
- Feedback action.

Save is removed from the main header. New, Open Folder, and Export remain absent from the floating toolbar. Open Folder stays available through the sidebar.

## Behavior

- Save keeps its existing green primary treatment and remains disabled when there are no unsaved changes.
- Undo and Redo keep their existing disabled-state rules.
- Import, Fit, Code preview, dialect selection, update checking, and feedback preserve their current callbacks and behavior.
- Canvas pan and zoom remain available beneath the overlay.
- The canvas receives top content padding or an equivalent safe initial viewport offset so newly fitted diagrams are not hidden behind the toolbar.

## Responsive Behavior

The floating rail stays one row. The dialect selector and command buttons remain visible. The filename and status area shrink first and the filename truncates. At the supported minimum window width, controls do not wrap or leave the canvas bounds.

## Components

- `Toolbar` owns branding, update checking, and Feedback.
- `WorkspaceCommandBar` owns dialect, document state, Import, Undo, Redo, Fit, Code preview, and Save.
- `App` passes Save state and behavior to `WorkspaceCommandBar` and renders it as an overlay inside `diagram-region`.
- CSS removes the dedicated toolbar row from the workspace grid and positions the command bar over the canvas.

## Verification

- Component tests verify every command, disabled state, filename state, dialect change, and Save callback.
- The production web build and complete automated test suite pass.
- A macOS application bundle builds successfully.
- Visual verification confirms the 12px inset, full-width floating appearance, rounded surface, command alignment, filename truncation, and unobstructed canvas interaction.
