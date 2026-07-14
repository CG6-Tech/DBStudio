# Canvas Controls Implementation Plan

1. Add pure viewport geometry for adaptive dot levels, center-preserving zoom, snapping, and minimap projection with unit tests.
2. Add ranked table/column canvas search with deterministic bounded results and tests.
3. Extend the Zustand UI store with zoom publication, canvas command counters, search, snap, and minimap state.
4. Build the functional toolbar, search popover, active states, disabled states, and guarded keyboard shortcuts.
5. Make Pixi transparent over an O(1) CSS-variable grid and synchronize grid offset, dot size, zoom value, and minimap viewport during pan/zoom.
6. Implement toolbar zoom, Fit, focus selection, snap, and interactive minimap navigation.
7. Trigger manual clustered layout in the worker, preserve locked Area contents, commit unlocked coordinates once, and Fit after completion.
8. Run all unit tests, BlueG-scale verification, web/native builds, and package the macOS app.
