# Canvas table header and width design

## Goal

Update canvas table cards with explicit header controls, persisted width states, field-only relationship ports, and stable incremental geometry updates when fields are added.

## Header design

Each table header contains, from left to right:

1. Table icon.
2. Truncated table name.
3. Circular editor/focus button.
4. Width-cycle button using the `‹›` symbol.

The header retains the existing colored top accent, slightly rounded corners, and continuous outline. Header controls have independent hit targets and stop pointer propagation so they never initiate card movement.

## Interaction behavior

### Circular editor/focus button

Clicking the circular button performs one coordinated action:

- Select the table.
- Switch to the Tables sidebar.
- Expand the selected table's editor card.
- Center the table in the canvas viewport.

Clicking elsewhere on the table selects it without opening the sidebar. Dragging continues to move the table without triggering focus behavior after drop.

### Width cycle button

Each click advances exactly one state:

```text
1× → 1.5× → 2× → 1×
```

The base width remains 260 canvas units, producing widths of 260, 390, and 520. Width state is stored as table diagram metadata and participates in undo/redo. Missing or invalid values fall back to `1×`.

Changing width keeps the table's top-left position fixed, updates the spatial index and minimap, and reroutes connected relationships once after the new geometry is committed.

## Relationship ports

- Remove the two table-level/header relationship creation ports.
- Keep relationship creation ports on the left and right side of every field row.
- Field ports remain hidden until the table is hovered or a relationship drag requires compatible targets.
- Existing relationship endpoint markers and cardinality badges remain unchanged.

## Stable field insertion

Adding or removing a field changes the card height. The current retained canvas must not expose intermediate geometry.

The update is applied as one frame transaction:

1. Reconcile the layout node using persisted width and the new field-derived height.
2. Rebuild or resize the affected table card and its field rows.
3. Replace that table's field ports in the port lookup and spatial index.
4. Update the table's spatial bounds.
5. Invalidate only relationships adjacent to that table.
6. Render the committed frame and run high-quality routing once.

Stale ports must be removed before new ports are registered. Pointer interaction state for the affected table is cancelled if its structure changes mid-drag.

## Data model and layout

Add a constrained table width scale with supported values `1`, `1.5`, and `2`. SQL generation ignores this visual property. Workspace metadata persists it with other diagram state.

All layout producers and reconcilers use one shared table-width helper rather than hard-coded `260` values. This includes:

- Initial and manual layout workers.
- Cluster packing.
- Incremental layout reconciliation.
- Canvas geometry and routing obstacles.
- Minimap and viewport bounds.

Automatic clustering uses the persisted width when packing tables, preventing overlap after reload or relayout.

## Error handling

- Invalid width scale values normalize to `1`.
- If the selected table disappears before a focus request is handled, the request is ignored.
- If a structural update occurs during a table drag, pending drag-frame work for that table is cancelled before the card is rebuilt.
- Sidebar expansion uses table ID rather than name so duplicate or renamed table names remain safe.

## Verification

The implementation should cover:

- Width-state normalization and cycling.
- Reconciliation preserving width while field count changes.
- Header ports absent and field ports present.
- Circular control dispatching selection, Tables sidebar activation, table expansion, and canvas focus.
- Adding a field invalidating only the affected table geometry and adjacent relationships.
- Width persistence through metadata save and reload.

The user will decide when to run the macOS build after implementation.
