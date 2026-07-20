# DBStudio Secondary Toolbar Design

## Goal

Reduce congestion in DBStudio's main header by moving workspace commands into a dedicated compact toolbar. Preserve all existing command behavior while making the document identity and Save action easier to scan.

## Layout

The application uses three top-level vertical regions:

1. A 50px main header.
2. The existing sidebar and canvas workspace.
3. The existing 30px status bar.

Inside the workspace, the left sidebar spans the full available height. The right canvas column contains a 36px docked secondary toolbar followed by the canvas. The toolbar therefore starts exactly at the canvas edge, does not cover tables, and never extends over the sidebar.

## Main Header

The main header retains:

- DBStudio logo, name, and Beta badge.
- Update-check action.
- Feedback action.
- Primary Save action.

Flexible space separates the brand from the right-side actions. Save remains the strongest control. Update and Feedback remain visually secondary.

## Secondary Toolbar

Commands and context are arranged left to right:

1. **Context:** SQL dialect selector, a divider, then the current document or workspace name with its unsaved-state indicator.
2. **Flexible space:** allows the current filename to use available width and separates context from commands.
3. **Import:** Import workspace data.
4. **History:** Undo and Redo.
5. **View:** Expand/Fit diagram and Code/SQL preview.

Thin separators appear between Import, History, and View. New, Open Folder, and Export are not shown in this toolbar. Open Folder remains available from the existing sidebar entry point.


## Visual Treatment

- Reuse the existing dark palette, Lucide icons, borders, and typography.
- Use 30–32px controls inside the 36px toolbar.
- Keep Import, Undo, Redo, Expand, and Code icon-first with accessible labels and tooltips.
- Give the secondary toolbar less contrast and no stronger shadow than the main header.
- Preserve the green primary treatment only for Save.
- Use clear hover and `focus-visible` states.

## Responsive Behavior

The secondary toolbar remains one row and never covers the canvas. At narrower widths, it automatically follows the reduced sidebar width. The dialect selector and commands stay visible while the current filename truncates with an ellipsis.

## Components

- `Toolbar` becomes the focused main header.
- A new `WorkspaceCommandBar` owns File, History, View, and Dialect controls.
- `App` renders `Toolbar` above the workspace. Within the workspace grid, `WorkspaceCommandBar` occupies the top-right cell, the sidebar spans both workspace rows, and the diagram occupies the lower-right cell.
- Shared toolbar-control styles are reused so the two bars remain visually related without duplicating behavior.

## Safety and State

- Disabled Undo, Redo, and Save behavior remains unchanged.
- Existing Import, Undo, Redo, Fit, Preview, and dialect callbacks remain unchanged.
- Update checking, feedback, dialogs, and unsaved-work handling remain unchanged.
- No canvas, parser, persistence, or release behavior changes are included.

## Verification

- Component tests confirm every command remains present and invokes its existing callback.
- Keyboard focus and accessible names are verified for icon-only controls.
- The production build and full test suite must pass.
- Layout is checked at the normal 1280px window and the 900px minimum window width.
