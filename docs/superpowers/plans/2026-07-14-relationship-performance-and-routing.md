# Relationship Performance and Routing Implementation Plan

1. Replace linear port hit-testing and per-frame resets with RBush queries, per-table collections, normalized-type buckets, and one active-target reference.
2. Add deterministic obstacle-routing primitives and tests for clearance, collisions, bends, and fallback behavior.
3. Add a generation-tagged routing Web Worker that returns progressive route batches.
4. Integrate cached worker routes into Pixi and retain fast Manhattan paths while dragging or awaiting refinement.
5. Invalidate and redraw only affected relationship routes after document/layout changes.
6. Add synthetic scale tests and run frontend, production, Rust, and macOS package verification.
