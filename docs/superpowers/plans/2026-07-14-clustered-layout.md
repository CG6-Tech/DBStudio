# Clustered Layout Implementation Plan

1. Add a pure, deterministic graph-clustering module that treats Area membership as authoritative and splits only unassigned large connected components into balanced 8–20 table communities.
2. Add pure compact-grid and cluster-packing geometry with non-overlap and bounded-aspect tests.
3. Replace the worker's single global layered graph with per-cluster local layouts followed by balanced workspace packing.
4. Replace the linear timeout fallback with the same grouped compact fallback.
5. Mark documents that received saved workspace metadata and bypass automatic layout for them.
6. Trigger automatic clustering only when a new source document loads; reconcile later table additions/removals without rearranging existing nodes.
7. Verify Area precedence, stable input-order-independent communities, large-component splitting, isolated tables, packing, all frontend/native tests, production builds, and the packaged application.
