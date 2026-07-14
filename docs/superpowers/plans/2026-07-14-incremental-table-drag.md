# Incremental Table Drag Implementation Plan

1. Add an initial-layout generation to `LayoutResult` and make canvas Fit depend on that generation rather than layout object identity.
2. Extract structural layout reconciliation as a pure function that returns the same object for position-only document changes.
3. Add load tokens to reject stale worker results after a newer file or an interaction supersedes them.
4. Coalesce table pointer moves through `requestAnimationFrame`, applying only the latest coordinate each frame.
5. Update the dragged card, layout node, connected edges, and RBush item in place.
6. Flush once and commit once on release; restore all live state without committing on cancellation.
7. Test layout identity, structural preservation, generation behavior, frame coalescing helpers, and complete frontend/native/package builds.
