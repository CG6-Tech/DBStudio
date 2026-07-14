# Relationship Line Selection and Delete Implementation Plan

1. Add tested point-to-segment distance, segment indexing, and nearest-hit helpers.
2. Extend selection with relationship IDs and adapt table/column-only consumers.
3. Maintain an RBush of routed relationship segments and update entries on worker reroutes.
4. Intercept empty-stage clicks near lines before canvas panning and apply selected-line styling.
5. Add editable-safe Delete handling through the existing undoable document operation.
6. Run frontend, Rust, production, and macOS package verification.
