# Active Table and Relationship States

## Goal

Give ViewDB tables and relationships two clearly distinct visual states. The default state stays calm and readable. Selecting a table reveals its relationship context through table-color highlighting, field ports, cardinality badges, live route movement, and animated dashed relationship lines.

This design follows the two supplied ChartDB screenshots while preserving ViewDB's existing dark palette, compact table dimensions, PixiJS canvas, ELK route data, and Zustand selection model.

## Scope

This slice includes:

- default and active table-card rendering;
- connected-field highlighting;
- connected relationship highlighting;
- cardinality badges anchored to actual relationship fields;
- animated dash movement on every relationship connected to the active table;
- live relationship rerouting while a table is dragged;
- reduced-motion behavior;
- focused rendering and interaction tests.

It does not add relationship creation by dragging ports, editable cardinality, crow's-foot notation, composite foreign keys, or new relationship metadata.

## Interaction states

### Default state

A table uses its current dark card, subtle border, and colored top accent. Relationship fields use the existing blue semantic text treatment, but field ports are hidden. Relationship lines are thin, solid, and muted. Cardinality badges remain visible so the schema meaning can be read without selecting anything.

### Active table state

Clicking a table header, body, or field makes that table active. The active state remains until another table is selected or the user clicks empty canvas.

The active table receives:

- a two-pixel border using the table color;
- a low-opacity table-color fill on every field participating in a relationship;
- table-color circular ports on the left and right edges of every field row;
- stronger field-name and type contrast on relationship fields.

Every relationship connected to the active table receives:

- a brighter route using a neutral blue-gray that remains legible against every table color;
- a dashed stroke with continuously advancing dash offset;
- a slightly heavier stroke than inactive relationships;
- highlighted endpoint fields on both the active and connected tables;
- cardinality badges above the line and outside the table bounds.

Connected target tables do not receive the full active border. Only their endpoint field row, text, and port highlight. This preserves a single obvious active table.

### Clearing and changing state

Clicking empty canvas clears the selection and returns all tables and lines to their default state. Clicking another table transfers the active state. Selecting a field also activates its owning table, while retaining field-level selection for the sidebar.

## Relationship geometry

Relationship endpoints attach to the center of the exact source and target field rows rather than the center of the table. The renderer chooses the left or right table edge based on the relative horizontal position of the connected table. Both endpoints use the same routing decision so lines do not cross through table bodies.

Routes are orthogonal with rounded visual corners. Existing ELK points may guide intermediate bends, but the first and last points are always replaced with current field anchors. During a table drag, the renderer recalculates the connected route on every pointer movement so the line visibly follows the moving card. Persisted table position is still written only when the drag ends.

## Cardinality

ViewDB derives visible cardinality from existing PostgreSQL constraints:

- The referenced endpoint always displays `1`.
- A foreign-key endpoint displays `N` by default.
- A foreign-key endpoint displays `1` when its column is unique or part of the table's primary key, producing `1 — 1`.

The badges use a compact circular shape, muted blue-gray fill, dark outline, and high-contrast text. They sit 18–24 pixels outside their field anchor so they remain associated with the endpoint without covering the port or table.

Nullable foreign keys do not change the badge in this slice. Optional cardinality such as `0..1` can be added when relationship semantics become editable.

## Animation

Only relationships connected to the active table animate. The dash pattern moves from the foreign-key endpoint toward the referenced endpoint, communicating dependency direction. All connected relationships animate together, as selected by the user.

Animation uses the PixiJS application ticker and updates only dash offset or segmented route positions. It must not rebuild the React component tree or create a new schema operation. Inactive routes remain static.

When `prefers-reduced-motion: reduce` is active, connected lines use the same bright dashed styling but do not move. Table dragging and live rerouting remain available because they are direct manipulation rather than decorative animation.

## Rendering architecture

`DiagramCanvas` will separate rendering into focused helpers:

- table geometry calculates header and field-row bounds;
- relationship geometry resolves endpoint fields, side selection, cardinality, and route points;
- relationship rendering draws inactive and active routes plus badges;
- table rendering draws default, active, connected-row, and selected-field treatments.

The relationship layer is rendered behind table cards, while ports and cardinality badges render above the route. A single Pixi ticker callback owns active-line motion and is removed whenever the canvas effect reruns or unmounts.

The canonical `Relationship` model remains unchanged because cardinality can be derived from existing columns. Zustand selection remains the source of truth for the active table.

## Performance

Only relationships whose source or target table is visible are rendered. Selection changes redraw visible canvas objects, while animation updates only active route graphics. Dragging recalculates routes connected to the moving table; unrelated routes and tables are not recomputed.

The design should remain responsive for the two-table sample and should avoid work proportional to all 1,500 relationships on every animation frame in future large workspaces.

## Accessibility

- Active state is not communicated by color alone: border weight, row fill, ports, and dashed routes also change.
- Cardinality uses text labels in addition to position.
- Motion respects the operating system's reduced-motion preference.
- Selection and relationship meaning remain available in the Refs sidebar for users who cannot use the canvas.

## Verification

Automated tests cover:

- `N — 1` derivation for an ordinary foreign key;
- `1 — 1` derivation for a unique or primary-key foreign key;
- exact source and target field-anchor positions;
- active relationship filtering for all edges connected to the selected table;
- route updates when a table position changes;
- reduced-motion animation disabling.

Native visual verification covers:

1. Default tables show solid muted routes and visible cardinality.
2. Selecting either table activates all its connected relationships.
3. Connected endpoint rows highlight while unrelated rows remain quiet.
4. Animated dashes travel from foreign key to referenced field.
5. Dragging the active table makes every connected line follow it continuously.
6. Clicking empty canvas returns to the default state.

## Acceptance criteria

- Default and active states match the supplied screenshots in hierarchy and behavior.
- Exactly one table is active at a time.
- All relationships connected to the active table animate together.
- Cardinality badges attach to the correct fields and display derived `1` or `N` values.
- Relationship routes follow tables during movement without lagging until pointer release.
- Inactive relationships remain visually quiet.
- Reduced-motion users receive the full active state without continuous animation.
- Table positions, SQL generation, undo history, and saved metadata continue to work unchanged.
