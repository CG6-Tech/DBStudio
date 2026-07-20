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
- Current document or workspace name.
- Unsaved-state indicator.
- Update-check action.
- Feedback action.
- Primary Save action.

The document name receives the flexible middle space. Save remains the strongest control. Update and Feedback remain visually secondary.

## Secondary Toolbar

Commands are arranged left to right in four groups:

1. **File:** New, Open Folder, Import workspace data, Export workspace data.
2. **History:** Undo and Redo.
3. **View:** Expand/Fit diagram and Code/SQL preview.
4. **Context:** SQL dialect selector aligned to the far right.

Thin separators appear only between the File, History, and View groups. Flexible space before the dialect selector keeps document context separate from commands.

The New control continues to load the existing starter schema in this change. Creating a truly blank schema is a separate feature because the current application requires at least one parsed table.

## Visual Treatment

- Reuse the existing dark palette, Lucide icons, borders, and typography.
- Use 30–32px controls inside the 36px toolbar.
- Use labels for New and Open Folder; keep Import, Export, Undo, Redo, Expand, and Code icon-first with accessible labels and tooltips.
- Give the secondary toolbar less contrast and no stronger shadow than the main header.
- Preserve the green primary treatment only for Save.
- Use clear hover and `focus-visible` states.

## Responsive Behavior

The secondary toolbar remains one row and never covers the canvas. At narrower widths, it automatically follows the reduced sidebar width; New and Open Folder labels collapse while their icons and accessible names remain. The dialect selector stays visible. The main header continues to hide the document title only when necessary after the command relocation has already freed space.

## Components

- `Toolbar` becomes the focused main header.
- A new `WorkspaceCommandBar` owns File, History, View, and Dialect controls.
- `App` renders `Toolbar` above the workspace. Within the workspace grid, `WorkspaceCommandBar` occupies the top-right cell, the sidebar spans both workspace rows, and the diagram occupies the lower-right cell.
- Shared toolbar-control styles are reused so the two bars remain visually related without duplicating behavior.

## Safety and State

- Disabled Undo, Redo, and Save behavior remains unchanged.
- Existing New, Open, Import, Export, Fit, Preview, and dialect callbacks remain unchanged.
- Update checking, feedback, dialogs, and unsaved-work handling remain unchanged.
- No canvas, parser, persistence, or release behavior changes are included.

## Verification

- Component tests confirm every command remains present and invokes its existing callback.
- Keyboard focus and accessible names are verified for icon-only controls.
- The production build and full test suite must pass.
- Layout is checked at the normal 1280px window and the 900px minimum window width.
