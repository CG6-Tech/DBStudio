# Standard Flow Component Library Implementation Plan

1. Define normalized display-node and display-port interfaces independent of schema parsing, state management, metadata, and canvas implementations.
2. Extract shared dark-theme tokens for neutral blocks, semantic accents, circular ports, selection, pinning, dimming, and focus.
3. Build reusable `FlowBlock` and `FlowPort` foundations with stable node/port data attributes and consistent accessibility and interaction contracts.
4. Add configured Trigger, Condition, Operation, Exception, Merge, Return, and Reference primitives using the shared foundations.
5. Add primitive tests covering labels, icons, inputs, outputs, selection, dimming, pinning, dragging, activation, and circular-port markup.
6. Implement a canvas geometry registry for block rectangles and measured circular-port centers in zoom-independent canvas coordinates.
7. Refresh geometry after render, resize, drag, arrangement, inline expansion, collapse, and relevant viewport changes; batch drag updates with animation frames.
8. Update adaptive routing to consume immutable registry snapshots and use the actual registered output/input circle centers as exact endpoints.
9. Add deterministic curve, obstacle-track, parallel-track, merge-input, fallback, and missing-geometry behavior with focused routing tests.
10. Migrate `LogicCanvas` to the shared primitives while restoring its earlier compact dark appearance, circular indicators, inspector, minimap, pinning, and arrangement behavior.
11. Migrate `RoutineFlowCanvas` and inline routine expansion to the same primitives and remove rectangular port indicators and white Postman-specific styling.
12. Preserve normalized control flow, explicit Merge nodes, branch focus, source inspection, dragging, saved positions, and Arrange/Arrange all behavior.
13. Add regression fixtures for review validation and `audit_order_change()`, asserting separate operation tracks into distinct merge ports.
14. Run `git diff --check`, focused tests, the complete Vitest suite, `npm run build`, and `npm run tauri -- build`.
15. Visually verify both canvases in the macOS app, including exact circular endpoint anchoring during dragging and after arrangement.
