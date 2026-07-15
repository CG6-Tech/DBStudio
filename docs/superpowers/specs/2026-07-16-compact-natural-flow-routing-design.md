# Compact natural-flow routing design

## Objective

Replace the current collision-avoidance router, which creates extreme outer tracks and wastes canvas space, with compact node placement and natural smooth connections. Line overlap and crossing are acceptable. The design must remain responsive around 500 nodes and 1,500 connections.

## Approved approach

Use compact ELK layered placement followed by an O(E) local Bézier router. Layout decides node positions; routing connects measured circular-port centers without global obstacle searches.

Alternatives rejected:

- Force-directed placement is organic but unstable and less deterministic for saved layouts.
- Grid compaction with edge bundling is dense but makes individual trigger relationships difficult to trace.

## Layout algorithm

ELK remains the primary layout engine with rightward layered flow. Configuration favors compactness:

- layered algorithm and rightward direction;
- reduced same-layer and between-layer spacing;
- `NETWORK_SIMPLEX` node placement;
- layer-sweep crossing minimization;
- port-aware model ordering;
- compact component spacing;
- greedy model-order cycle breaking.

The existing preprocessing continues to identify trigger lanes, shared hubs, semantic ranks, and strongly connected components. Recursive components stay together. Shared routines and tables remain single central hubs.

Manually pinned nodes remain fixed. Movable nodes are arranged around them. A deterministic post-layout compaction pass removes unnecessary horizontal and vertical gaps while preserving a small minimum node separation. Layouts with extreme aspect ratios or invalid coordinates fall back to the deterministic lane layout.

## Connection routing

The measured centers of visible circular output and input ports remain authoritative endpoints.

Every connection is a smooth cubic Bézier:

- A forward edge uses horizontal source and target tangents with control distance proportional to its horizontal span and clamped to a compact range.
- A backward edge uses a compact S-curve. Its control points remain within a bounded margin around the endpoint rectangle; it never routes to the global graph boundary.
- A near-vertical edge uses symmetric horizontal tangents with a small minimum control distance.
- Parallel edges receive small deterministic tangent offsets based on stable edge ordering.

Edge overlap and crossing are explicitly allowed. The router does not scan node obstacles and does not generate global orthogonal tracks. Lines render beneath nodes. Hovered, selected, and focused paths gain opacity and width so users can trace them through overlaps.

## Performance

Full route generation is O(E). Route strings are cached using source coordinates, target coordinates, and the deterministic parallel offset. A graph or layout revision invalidates only affected cache entries.

During dragging, geometry measurement and incident-edge rerouting are batched once per animation frame. Only connections whose source or target is the moved node are recomputed. Full routing occurs after graph changes, Arrange, expansion, collapse, or a complete layout replacement.

No per-edge obstacle iteration is permitted in the normal route path. This avoids the prior O(E × N) behavior and eliminates extreme detours.

## Space efficiency

Default ELK spacing is reduced while maintaining non-overlapping nodes and usable labels. The compaction pass shifts entire layers and then nodes within layers toward occupied space. It preserves deterministic order and minimum separation.

The algorithm targets approximately 500 nodes and 1,500 connections without UI blocking. ELK continues to run in a worker. Connection paths remain a lightweight main-thread calculation because they are linear and local.

## Interaction

- Dragging preserves live attachment to circular ports.
- Natural curves update continuously without jumping to remote tracks.
- Selecting a block or branch highlights its related paths above overlapping lines.
- Arrange preserves pins; Arrange all clears pins after confirmation.
- Existing branch focus, inline expansion, minimap, inspector, and saved positions remain unchanged.

## Error handling

If measured port geometry is unavailable, the connection is temporarily omitted until both endpoints register. Invalid endpoint coordinates suppress the line and emit a development diagnostic. If curve construction fails, a direct cubic curve with fixed compact tangents is used.

Invalid or extreme ELK results fall back to the deterministic lane layout. Stale worker responses remain protected by generation IDs.

## Testing

Routing tests verify:

- exact circular-port endpoints;
- horizontal endpoint tangents;
- compact forward curves;
- bounded backward S-curves;
- near-vertical connections;
- deterministic parallel offsets;
- no control point outside the bounded endpoint margin;
- cache reuse and invalidation;
- linear route generation without obstacle scans.

Layout tests verify compact ELK configuration, deterministic compaction, minimum node separation, pinned-node preservation, stable shared hubs, recursive components, and fallback behavior.

A synthetic 500-node/1,500-edge fixture checks route and fallback-layout performance without using fragile wall-clock assertions. The screenshot scenario with two trigger edges entering `audit_order_change()` is a visual regression case: neither edge may escape to a distant outer track.

The full test suite, production web build, and macOS build must pass.

## Out of scope

- Avoiding all line crossings.
- Global shortest-path or maze routing.
- Edge bundling.
- Force-directed layout.
- Virtualizing graph nodes beyond the approved 500-node target.
