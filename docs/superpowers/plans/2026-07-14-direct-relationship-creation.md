# Direct Relationship Creation Implementation Plan

1. Add pure relationship compatibility helpers and tests for normalized types, candidate ranking, duplicates, and invalid self-links.
2. Extend canvas interaction state with hover-only field/table ports and drag lifecycle state.
3. Render a temporary rounded route and compatible/incompatible target feedback without rebuilding the canvas during pointer movement.
4. Implement immediate field-to-field creation through the existing `addRelationship` domain action.
5. Add the accessible table-to-table compatible-field popup with keyboard selection and viewport-constrained positioning.
6. Verify cancellation, history integration, SQL generation, undo/redo, frontend tests, Rust tests, production build, and macOS packaging.
