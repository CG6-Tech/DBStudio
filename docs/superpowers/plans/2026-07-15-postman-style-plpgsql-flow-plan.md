# Postman-style PL/pgSQL Flow Implementation Plan

## Phase 1 — Control-flow normalization

1. Extend `src/domain/routineFlow.ts` with typed input/output ports, explicit control/data/branch/error/result semantics, and an `unparsed` fallback node kind.
2. Separate parsing from display normalization so parsed statements remain source-faithful while presentation rules can evolve independently.
3. Generate deterministic merge nodes when two or more non-terminal branch tails reconverge; do not generate a merge for a single live tail.
4. Preserve stable source-derived IDs and source ranges for parsed nodes, and derive merge IDs from ordered incoming branches plus the continuation target.
5. Add the supplied `audit_order_change()` routine as the primary fixture in `src/domain/routineFlow.test.ts`.
6. Test recursion-guard early return, UPDATE/INSERT/DELETE outputs, three-input merge generation, shared audit insert, final return, nested conditions, exceptions, and incomplete SQL fallbacks.

## Phase 2 — Shared geometry and connection routing

7. Add `src/domain/flowGeometry.ts` for card dimensions, port offsets, measured socket centers, expanded obstacle rectangles, and semantic color mapping.
8. Add `src/layout/flowRouting.ts` with deterministic socket-to-socket routing.
9. Use smooth cubic Bézier routes for unobstructed forward edges with horizontal source and target tangents.
10. Assign dedicated orthogonal tracks to backward, obstacle-crossing, parallel, and reconverging routes.
11. Ensure every route starts and ends at the exact supplied socket center and never intersects expanded node rectangles except at its endpoint node.
12. Add routing tests for exact endpoints, horizontal tangents, obstacle avoidance, stable parallel tracks, merge convergence, determinism, and fallback behavior.

## Phase 3 — Postman-style shared flow components

13. Extract the current routine-flow node rendering into focused shared components under `src/components/flow/`: `FlowBlock`, `FlowPort`, `FlowConnections`, and `FlowCanvasControls`.
14. Implement the approved light dotted canvas, white cards, semantic top accents, embedded edge sockets, condition editors, internal branch rails, merge block, SQL block, exception block, and return block.
15. Render connections between the grid and blocks, with semantic colors used for ports and focused paths.
16. Replace hard-coded port offsets with DOM measurements collected after render and resize.
17. During dragging, update incident lightweight curves each frame and schedule precise local rerouting after movement settles.
18. Retain source inspection, diagnostics, minimap, zoom, pan, fit, and keyboard focus behavior.

## Phase 4 — Branch focus and persistence

19. Add branch-focus state to `src/state/uiStore.ts` without persisting it into parsed graph data.
20. Compute reachable nodes from the selected output until terminal return/exception nodes, retaining shared downstream nodes after a merge.
21. Clicking an output socket or branch rail toggles focus; focused nodes and edges gain contrast while unrelated graph content fades but remains visible.
22. Extend routine-flow layout metadata with stable node positions and pin state, backward-compatible with documents that have no flow metadata.
23. Auto-pin a node after manual drag; Arrange preserves pinned positions and Arrange all clears pins only after confirmation.

## Phase 5 — Inline routine expansion

24. Add expanded-routine IDs to Logic graph UI state.
25. Double-clicking a routine replaces its compact Logic block with the normalized flow, anchored around the routine's prior position.
26. Reconnect the routine's external incoming and outgoing Logic edges to generated entry and terminal boundary ports.
27. Collapsing removes inline flow nodes, restores the compact routine block, and preserves its prior position.
28. Feed expanded nodes and boundary edges into the existing Logic ELK worker so lane/hub arrangement continues to work.
29. Ensure shared routines expand only once even when reached by multiple trigger lanes.

## Phase 6 — Verification and rollout

30. Add component tests for expand/collapse, socket and rail focus, focus clearing, source inspection, drag-to-pin, pin-preserving Arrange, and confirmed Arrange all.
31. Add regression tests ensuring compact Logic graphs, unresolved references, saved layouts, and existing validation flows remain functional.
32. Run focused domain and routing tests after each phase, then the complete Vitest suite.
33. Run `npm run build` and `npm run tauri -- build`.
34. Visually verify the supplied `audit_order_change()` fixture in the macOS app: accurate block sequence, exact port anchoring, isolated early return, three dedicated operation routes, explicit merge, one audit insert connection, final return, dragging, and branch focus.
