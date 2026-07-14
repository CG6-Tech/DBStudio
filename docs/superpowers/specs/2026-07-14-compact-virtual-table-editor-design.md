# Compact Virtual Table Editor Design

## Goal

Correct the visual hierarchy and overflow defects in the virtualized Tables sidebar while retaining single-table expansion and large-schema performance.

## Selected Visual Direction

Use visual companion Option A, **Compact inline**.

- The collapsed and expanded table header remains exactly 46 pixels high.
- The header contains, in order: expansion chevron, table color dot, truncated table name, field count, and one Actions button.
- All header controls remain on one line at the narrowest supported sidebar width.
- The expanded body begins directly with the Fields heading. It does not repeat the table name.
- The Actions button opens a compact menu containing Rename table, Change color, and Delete table.
- Delete is visually destructive and requires an explicit menu selection; it never occupies a separate virtual row.

## Field Editor

- Field rows are 34 pixels high and use a dense four-part layout: field name, data type, nullable flag, and primary-key flag.
- Field name and data type remain directly editable inputs but appear as text until focused.
- Delete field is available from a row action revealed on hover or keyboard focus, without permanently consuming a full column.
- Add field is a full-width 32-pixel text action below the fields.
- Indexes and Check constraints remain compact 34-pixel disclosure rows.
- The expanded card uses the existing table accent color, dark surfaces, borders, typography, and Lucide icon family.

## Virtualization Constraints

- The 46-pixel collapsed-row metric remains unchanged.
- Expanded height continues to be measured by ResizeObserver.
- Opening or closing the Actions menu does not change the measured row height.
- Menus render as overlays and are not clipped by the virtual row or scroll window.
- Only the expanded table mounts field controls.
- Selection, search, keyboard navigation, and canvas-to-sidebar reveal behavior remain unchanged.

## Interaction and Accessibility

- Clicking the header expands or collapses the table and selects it on the canvas.
- Clicking Actions does not toggle expansion.
- The menu supports Arrow Up, Arrow Down, Enter, and Escape, and closes on outside click.
- Rename moves focus into a table-name input at the top of the field section only while rename mode is active; the input disappears after Enter, blur, or Escape.
- Change color opens the native color input from the menu action.
- Delete table remains clearly labeled and keyboard accessible.
- Hover-only field deletion is also exposed when the row contains keyboard focus.
- Focus indicators meet the existing green-accent visual language.

## Responsive Behavior

- Table names truncate with ellipsis before action controls shrink or wrap.
- The field-name column receives remaining width; data type is capped and truncates when necessary.
- At the narrower 258-pixel sidebar breakpoint, nullable and primary-key flags remain visible while field delete moves entirely into the hover/focus action.
- No control may render below its owning 46-pixel collapsed header.

## Testing

- Verify header actions never wrap at 326-pixel and 258-pixel sidebar widths.
- Verify the Actions menu does not toggle table expansion.
- Verify menu keyboard behavior and outside-click dismissal.
- Verify rename commit and cancel behavior.
- Verify expanded height updates after field additions and deletions.
- Verify only one table editor is expanded and only visible virtual rows are mounted.
- Run the complete frontend tests, production build, Rust tests, and macOS packaging.

## Scope

This correction changes only the visual structure and actions of the virtualized table row and expanded editor. The windowing algorithm, search index, canvas rendering, SQL editing, relationship panels, and schema operation semantics remain unchanged.
