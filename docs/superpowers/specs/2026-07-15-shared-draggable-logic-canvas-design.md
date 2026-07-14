# Shared Draggable Logic Canvas Design

## Goal

Redesign the database Logic graph to match the approved PL/pgSQL routine-flow canvas: compact modular blocks, semantic ports, clean routes, canvas-first controls, draggable nodes, minimap, and temporary detail drawers. Manual database Logic positions and viewport state persist independently from the ER diagram.

## Shared Canvas Foundation

Extract reusable canvas behavior used by both the database Logic graph and routine-flow view:

- Viewport coordinate transforms.
- Background panning and pointer-centered zoom.
- Fit-to-content calculation.
- Draggable nodes with live edge updates.
- Semantic input/output port anchors.
- Cubic connection paths and edge labels.
- Selection, connected-path highlighting, and keyboard focus.
- Zoom controls, minimap rendering/navigation, and temporary detail drawers.

Database Logic and routine flow retain separate graph models and layout algorithms. Shared code handles interaction and rendering mechanics rather than forcing both graphs into one domain model.

## Database Logic Blocks

Use the routine-flow block shell and neutral canvas styling while retaining semantic database colors:

- Blue table blocks.
- Amber trigger blocks.
- Green function/procedure blocks.
- Muted red unresolved-reference blocks.

### Tables

Table blocks show the qualified name, connected-logic count, and only fields directly relevant to visible logic when such field information is available. Otherwise they show a field-count summary. Ports represent incoming and outgoing reads or mutations.

### Triggers

Trigger blocks show qualified name, timing, events, and row/statement scope. Event input ports connect from the target table. Execution output ports connect to routines or inline effects.

### Routines

Routine blocks show kind, language, compact signature, caller count, and read/write effect count. Ports distinguish calls, reads, and mutations. Each routine exposes a keyboard-accessible `Open flow` action when PL/pgSQL flow parsing is available.

### Unresolved References

Every unresolved edge terminates at a generated unresolved block labeled with the unresolved qualified name and reference kind. Unresolved blocks participate in layout, selection, search, minimap, and diagnostics. They never masquerade as resolved database objects.

## Edges and Ports

Edges originate and terminate at semantic ports rather than card centers. Event, execution/call, read, and mutation connections use labels and line treatments; color is not the only differentiator.

Routes update continuously during dragging. Selecting a block or edge highlights its cycle-safe connected path and dims unrelated graph elements. Edge labels remain restrained and hide at low zoom levels to reduce clutter.

## Layout

The automatic layout prioritizes left-to-right dependency flow:

`source tables → triggers → routines → affected tables or unresolved references`

Routine calls may introduce additional ranks. Strongly connected components collapse into deterministic layout groups so recursive calls and mutation cycles remain stable. Within each rank, order is deterministic by qualified name and stable ID.

Saved manual positions override automatic positions by entity ID. New objects receive automatic positions without moving retained manually positioned objects. Removed objects and stale saved positions are discarded during reconciliation.

`Auto arrange` clears manual Logic positions only after explicit confirmation and applies the current automatic layout. Ordinary reload, reparse, or workspace changes preserve retained manual positions.

## Dragging

Dragging begins only from a block header or dedicated drag surface so buttons and ports remain interactive. Pointer movement updates the visual node and connected routes without committing application state on every frame. Pointer release commits one final position update. Escape cancels an active drag and restores its starting position.

Keyboard movement uses arrow keys and a larger Shift-modified increment. Keyboard moves use the same single-commit persistence path.

## Viewport

The database Logic graph has an independent viewport containing translation and scale.

- Background drag pans.
- Wheel or trackpad zoom is centered under the pointer.
- Controls provide zoom in, zoom out, fit, and auto-arrange.
- Fit includes all visible resolved and unresolved blocks with padding.
- The minimap shows semantic block colors and the current viewport rectangle; clicking or dragging the minimap recenters the viewport.

Routine-flow and ER viewports remain independent.

## Detail Drawer

Selecting a block or edge may open a temporary overlay drawer containing complete metadata, diagnostics, source location, and original SQL. The drawer overlays rather than permanently resizing the canvas. Closing it returns focus to the selected graph element.

Routine drawers include `Open flow`. Unresolved drawers explain the unresolved name, inference source, and candidate resolution state.

## Persistence

Extend workspace metadata with an optional database Logic section:

```json
{
  "logic": {
    "nodes": [{ "id": "...", "position": { "x": 0, "y": 0 } }],
    "viewport": { "x": 0, "y": 0, "scale": 1 }
  }
}
```

The section is optional and backward compatible. It never changes SQL dirty state because Logic layout is visualization metadata. ER positions remain in the existing table metadata and are not reused for Logic blocks.

Single-file and folder workspaces use the existing metadata save path. Position and viewport updates are debounced, while a final drag or keyboard move is flushed promptly.

## Accessibility

- Blocks, actions, ports, edges, drawer controls, zoom controls, auto-arrange, and minimap are keyboard accessible.
- Spatial arrow-key navigation selects neighboring blocks; Enter opens details; Escape closes details or cancels drag.
- Each block exposes kind, qualified name, summary, unresolved status, and port labels through accessible names.
- Focus indicators remain visible at every zoom level.
- Reduced-motion preferences disable animated layout transitions.

## Error Handling

- Unresolved references render explicitly.
- Missing saved IDs are ignored.
- Invalid or non-finite saved coordinates fall back to automatic positions and produce no crash.
- Cycles are layout-safe and traversal-safe.
- A layout failure falls back to deterministic columns and leaves manual positions intact.
- A persistence failure reports a non-blocking status and keeps the current in-memory layout.

## Testing

Domain tests cover graph projection, unresolved blocks, semantic ports, strongly connected components, deterministic ranking, saved-position reconciliation, invalid metadata, and fit geometry.

Interaction tests cover drag preview/commit/cancel, keyboard movement, pan, pointer-centered zoom, fit, minimap navigation, auto-arrange confirmation, selection, edge selection, connected-path highlighting, drawer focus return, and routine `Open flow`.

Persistence tests cover backward-compatible metadata, independent ER/Logic positions, viewport round trips, stale IDs, new nodes, removed nodes, and failed writes.

Performance tests cover thousands of blocks and edges, viewport culling, drag route updates, minimap rendering, and workspace reconciliation.

Regression tests confirm the PL/pgSQL routine-flow canvas, ER canvas, parser, workspace linking, SQL generation, and schema editing behavior remain unchanged.

## Completion Criteria

The redesign is complete when the database Logic graph visually matches the routine-flow canvas, uses compact semantic blocks and port-based edges, supports smooth local dragging and full viewport navigation, explicitly shows unresolved dependencies, persists manual positions and viewport state independently from ER metadata, preserves routine-flow entry, and passes domain, interaction, persistence, performance, and regression verification.
