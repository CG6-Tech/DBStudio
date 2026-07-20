# PL/pgSQL Routine Flow Implementation Plan

1. Define flow node, port, edge, diagnostic, and source-range types independent of the database Logic graph.
2. Implement a source-preserving PL/pgSQL body scanner and recursive statement parser for blocks, conditions, assignments, raises, returns, and opaque SQL.
3. Compile parsed statements into deterministic control-flow nodes and edges, then group consecutive raise-only validations for presentation.
4. Add parser and grouping tests using realistic multiline trigger functions.
5. Extend UI state with routine-flow navigation while preserving Logic graph selection and state.
6. Add explicit `Open flow` actions to routine cards and the routine inspector.
7. Parse routine flows lazily and cache them by routine ID plus body content.
8. Build a read-only flow canvas with compact blocks, named ports, automatic layout, semantic edges, selection drawer, local dragging, pan, zoom, fit, and minimap.
9. Add navigation, empty-state, warning-state, and regression tests.
10. Run the full test suite and production/Tauri-compatible web build.
