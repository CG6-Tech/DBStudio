# Incremental Table Drag Design

## Goal

Make table movement smooth and deterministic on large diagrams by eliminating layout reconciliation, viewport fitting, and full Pixi scene reconstruction from the drag lifecycle.

## Interaction Algorithm

Table dragging is a two-phase transaction.

### Live phase

- Pointer movement updates only the dragged Pixi card and its in-memory layout node.
- Pointer events are sampled through one `requestAnimationFrame` update, so at most one visual move is applied per rendered frame.
- Only relationships connected to the moved table are marked dirty and redrawn by the existing ticker.
- The table's RBush entry is updated incrementally after each applied frame.
- No React state, document history, automatic layout, metadata, or viewport Fit operation runs during this phase.

### Commit phase

- Pointer release flushes the final pending frame.
- One document operation stores the final table position and optional Area membership.
- The layout cache accepts the committed coordinate without creating a new initial-layout result.
- The viewport and zoom remain unchanged.
- Pointer cancellation restores the starting coordinate and produces no history operation.

## Layout Ownership

Automatic layout owns initial coordinates only when a new file loads. Manual table positions own coordinates after interaction.

The layout hook separates these responsibilities:

- `initialLayout` changes only when a new source load finishes.
- Structural reconciliation adds or removes nodes without re-running initial arrangement.
- Position-only document updates reuse the existing layout object.
- Table height changes update only affected node dimensions and do not trigger viewport Fit.
- A monotonically increasing load generation rejects worker messages from an older file or from a layout superseded by user interaction.

The canvas Fit effect responds to a dedicated initial-layout generation or an explicit Fit request. It does not depend on general layout object identity.

## Pixi Scene Updates

The current renderer may continue rebuilding for schema, selection, or viewport-culling changes outside a drag. A table drop must not cause a second layout reconciliation rebuild.

During a drag:

- Card containers remain mounted.
- Connected edge graphics remain mounted.
- Cardinality badges follow recalculated relationship geometry.
- Unrelated cards and edges are untouched.
- The current pointer capture remains valid during rapid motion and outside-card movement.

## Failure Handling

- A cancelled pointer restores the card, node, relationship geometry, and spatial index entry.
- If the dragged table disappears because of an external document replacement, the transaction terminates without committing.
- Pending animation frames are cancelled during canvas teardown.
- A stale layout-worker response cannot overwrite a manually moved position.

## Tests

- Position-only reconciliation returns the same layout object.
- Adding or removing a table changes the node set without moving retained nodes.
- Initial layout generation changes only for new source loads.
- Explicit Fit increments the viewport fit request; table commits do not.
- Frame coalescing applies the latest pointer coordinate once per animation frame.
- Pointer cancellation restores the start position and produces no commit.
- A completed drag produces exactly one history operation.
- Connected relationships are the only dirty edges during live movement.
- BlueG-scale movement does not trigger initial layout or full viewport fitting.

## Scope

This change fixes manual table dragging. It does not redesign note dragging, Area dragging, automatic clustering, or continuous relationship-based layout after edits.
