# Retained Canvas Scene Implementation Plan

1. Add pure canvas snapshot/index builders and diff tests, including 3,000-table localized-change assertions.
2. Replace repeated table/column/node searches with retained maps and replace table-point scans with RBush queries.
3. Stabilize App document callbacks so unrelated React renders do not reconstruct the Pixi scene.
4. Separate selection styling updates from document geometry reconciliation and update retained graphics in place.
5. Separate viewport transform/culling from scene construction and retain visible object records across pan and zoom.
6. Keep controlled full rebuilds for source replacement and recovery only.
7. Run frontend, production, Rust, and macOS package verification.
