# Migration Diff Canvas Design

## Goal

Make schema comparisons understandable at a glance while preserving precise migration review and approval. Entering the Migrate workspace opens a dedicated canvas that visualizes old-to-new structural changes; the sidebar remains the control and inspection surface.

## Workspace Integration

Selecting **Migrate** replaces the normal table canvas with a Migration Diff Canvas. Leaving Migrate restores the normal canvas and its viewport unchanged. The migration canvas owns a separate viewport and layout.

A `Canvas / List` segmented control switches between the visual comparison and the existing virtualized operation list. Canvas is the default view. Both views use the same migration plan and decisions.

## Source Selection Dialog

When Migrate has no valid source pair, DBStudio opens a **Compare schemas** dialog with two slots:

- **Current / Old**
- **Desired / New**

Each slot accepts a SQL file, a folder, or drag and drop. Selecting a folder uses the existing workspace loader to discover its SQL files. A selected source shows its name, dialect, table count, routine count, and any parsing errors. A swap control exchanges the slots.

The Compare action is disabled until both sources parse successfully and use the same database engine. Successful comparison closes the dialog and opens the diff canvas. Recent source pairs are retained for quick reopening. Database connections can use the same source-slot model without changing the dialog structure.

## Diff Projection

The existing migration worker remains the source of truth. A dedicated projection layer transforms `MigrationPlan` changes and snapshots into canvas data:

- merged table cards;
- table groups and counts;
- changed rows;
- affected dependency edges;
- logic and custom-type cards;
- lookup indexes between canvas entities and migration change IDs.

Projection uses maps keyed by qualified object identity and change ID. It must not repeatedly scan the complete plan while rendering or selecting items.

## Merged Table Cards

One merged card represents each qualified table identity. Its header shows the table name, highest risk, and number of changes. Rows include columns, indexes, checks, and foreign keys.

Row states are:

- added: green with `+`;
- removed: red with `-`;
- modified: amber with old value to new value;
- confirmed rename: blue, represented as one row;
- unchanged: muted and hidden by default.

Added and removed tables use full-card added or removed states. Long values truncate without changing card geometry and expose full values in the inspector. A control reveals unchanged rows when context is needed.

Routines, triggers, and custom types reuse standardized card primitives already used by the logic canvases, with diff-state accents added by the projection.

## Layout And Edges

Automatic layout groups cards into stable lanes:

1. Added
2. Changed
3. Removed
4. Unchanged, when visible

Within a lane, dependency ordering and stable qualified-name ordering provide deterministic placement. Layout runs only when topology or grouping visibility changes. Filters, approvals, and selection do not rearrange cards.

Only affected foreign-key, routine, trigger, and type dependency edges are shown. Selecting a change highlights its card row, related cards, and relevant edges. Path animation is limited to the selected change.

The canvas reuses the shared viewport controller, grid, minimap, pointer tracking, pan, pinch zoom, mouse zoom, drag, fit, and rearrange behavior.

## Review Sidebar

The migration sidebar contains:

- source summary and change-source action;
- Canvas/List mode control;
- safe, review, and blocked counts;
- search and risk, object, and phase filters;
- selected-change inspector;
- ordered execution view;
- export actions.

The selected-change inspector shows the old value, new value, reason, phase, dependencies, reversibility, and generated SQL fragment. It also hosts rename decisions, backfill expressions, and destructive approvals where applicable.

Selection is synchronized across canvas cards, changed rows, list rows, and inspector. Clicking a card selects the table summary. Clicking a changed row selects its migration operation. Double-clicking a card fits it in the viewport.

Export remains disabled until unresolved renames, required backfills, and blocking approvals are resolved.

## Decision Gating

Risk communicates impact; explicit requirements control export readiness. A change must never require unrelated actions merely because its risk is `blocked`.

- A required added column without a default requires a backfill expression. A separate destructive approval is not required once the backfill is supplied.
- A destructive drop requires explicit approval.
- A rename candidate requires a Rename or Keep separate decision.
- Review-level type, index, constraint, routine, and trigger changes remain warnings and do not create approval gates.

The sidebar includes a **Required actions** checklist derived from these rules. Each row names one unresolved action, opens/selects the corresponding change or rename candidate, and switches to a completed state immediately after resolution. Export readiness is based on this checklist reaching zero.

Canvas change rows and risk icons expose requirement-specific tooltips. Tooltips distinguish `Approval required`, `Backfill required`, `Rename decision required`, and informational review risk, and direct the user to the matching sidebar action.

## Performance

- Diff computation stays in the existing migration worker.
- Projection is memoized by plan fingerprint and rename decisions that alter topology.
- Canvas rendering uses viewport culling for large comparisons.
- Edges outside the visible region are deferred.
- Selection and approval updates use indexed lookup and do not recompute layout.
- Card dimensions are stable so row expansion does not shift unrelated layout.
- The existing virtualized list remains available for dense review.

## Error Handling

Source parsing errors stay attached to the affected dialog slot and include the file identity. Dialect mismatch prevents comparison. Worker errors appear in the migration sidebar without replacing the current valid comparison. Unresolved or unsupported changes remain visible and cannot be silently exported.

## Persistence

The current source pair, mode, filters, decisions, canvas layout, and migration viewport persist for the active comparison. Normal table-canvas layout and viewport remain independent.

## Testing

Tests cover:

- source-slot file and folder validation;
- dialect mismatch and parse failures;
- diff projection for added, removed, modified, renamed, and unchanged objects;
- merged card grouping and stable ordering;
- affected dependency-edge projection;
- selection synchronization between canvas, list, and inspector;
- rename, backfill, and approval decisions;
- layout stability when filters or decisions change;
- viewport culling and large-schema projection performance;
- export gating.

## Scope Boundaries

This feature does not execute migrations, provision databases, or replace the existing migration planner and SQL generator. It adds a visual projection, source-pair dialog workflow, and synchronized review surface over the existing plan.
