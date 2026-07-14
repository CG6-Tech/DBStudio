# Virtualized Table Sidebar Design

## Goal

Keep table navigation and inline schema editing responsive with approximately 3,000 tables while preserving direct coordination between canvas selection and the Tables sidebar.

## Interaction Model

The Tables panel displays every matching table as a compact row. At most one table is expanded at a time.

- A collapsed row shows its color, name, field count, expansion state, and table actions.
- Selecting a collapsed row selects the table on the canvas and expands its inline editor.
- Selecting another table collapses the previous editor and expands the new table.
- Clicking the currently expanded row collapses its editor without clearing canvas selection.
- Selecting a table or field on the canvas activates the Tables panel, expands the owning table, and scrolls it into view.
- The expanded editor retains the existing table, color, field, nullability, primary-key, delete, and add-field controls.
- Stable table and column IDs preserve selection through renames and other edits.

## Virtual List Architecture

Create a focused virtual-list model separate from React rendering. It receives the filtered table IDs, collapsed row height, expanded table ID, and expanded editor height. It returns:

- total scroll height;
- the first and last rendered indexes;
- the top offset for the rendered window;
- the offset for a requested table;
- the next keyboard-navigation index.

Collapsed rows use a fixed height. The one expanded row contributes an additional measured height. Prefix offsets account for that additional height, and binary search finds the first visible row in logarithmic time. The renderer mounts only the visible range plus a small overscan buffer.

The scroll container owns the full-height spacer. Visible rows are positioned inside one translated window, preserving a native scrollbar without mounting thousands of DOM elements. ResizeObserver updates the expanded editor height when fields are added, removed, or wrapped.

## Search

Build a memoized normalized search record for each table containing its table name and column names. Rebuild records only when table or column content changes.

- Empty search returns the document order.
- Search is case-insensitive and matches table or field names.
- Filtering produces table IDs consumed by the same virtual-list model.
- A field match does not automatically expand every matching table.
- When the user selects a matching table, its editor expands; field-name matches show a compact `field match` indicator on the collapsed row.
- If filtering removes the current expanded table, the editor closes but canvas selection remains unchanged.

## Canvas and Keyboard Coordination

Canvas table or column selection is the authoritative request to reveal an owning table. The sidebar switches to the Tables panel, expands that table, calculates its virtual offset, scrolls it into view, and focuses the row without stealing focus from an active text input.

When focus is within the table list:

- Arrow Down and Arrow Up move between filtered tables.
- Enter selects and expands the focused table.
- Escape collapses the expanded editor.
- Home and End move to the first and last filtered table.
- Keyboard navigation scrolls the focused row into the rendered window.

Search input keyboard behavior remains native and does not trigger list navigation.

## Editing and State

The expanded table ID is local sidebar UI state derived initially from the current table or column selection. It is not stored in the schema document and does not create history operations.

Schema edits continue through the existing `onReplace` boundary. Virtualization must never retain stale table objects in event handlers; visible rows resolve their current table by stable ID on each render. Deleting the expanded table clears expansion and moves keyboard focus to the nearest remaining row.

## Accessibility

The list uses listbox-style keyboard navigation with an active row and explicit expanded state. Buttons and form fields inside the expanded editor remain independently focusable. Table names, field counts, color controls, and destructive actions keep accessible labels. Reduced rendered DOM size must not remove access to off-screen tables because keyboard navigation and search scroll them into the mounted window.

## Failure and Recovery

- A missing expanded table clears expansion safely.
- A zero-height or unavailable measurement falls back to a deterministic estimated editor height based on field count.
- ResizeObserver is disconnected when the expanded editor changes or unmounts.
- Scroll offsets are clamped after filtering, deletion, or document replacement.
- If virtual range calculation detects invalid dimensions, it falls back to rendering a bounded initial range rather than the complete table collection.

## Performance Requirements

- With 3,000 tables, mounted collapsed table rows remain proportional to viewport height and overscan, normally fewer than 50.
- Visible-range lookup is logarithmic in table count.
- A selection change updates expansion and scroll position without rebuilding the search index.
- A query evaluates memoized normalized records and does not inspect React-rendered field controls.
- Adding or removing a field remeasures only the expanded editor.

## Tests

Add pure tests for:

- visible ranges at the beginning, middle, and end of a 3,000-table list;
- expanded-row prefix offsets before, inside, and after the expanded table;
- binary-search operation bounds;
- overscan and scroll clamping;
- table-name and field-name filtering;
- expansion changes after filtering or deletion;
- keyboard-navigation boundaries;
- canvas selection revealing a table outside the current rendered window.

Run the complete frontend test suite, TypeScript production build, Rust tests, and macOS application packaging.

## Scope

This phase covers only the Tables sidebar list, search, single-table expansion, keyboard navigation, and canvas-selection reveal behavior. Relationships-panel virtualization, minimap replacement, history compaction, SQL revision separation, layout-worker concurrency, and route-worker pooling remain separate phases.
