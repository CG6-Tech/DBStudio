# Relationship Performance and Routing Design

## Goal

Keep relationship creation and rendering responsive with approximately 3,000 tables and 1,500 relationships while producing readable orthogonal routes that avoid table cards.

## Interaction Performance

- Store table bounds and field-port hit regions in RBush spatial indexes.
- Replace per-pointer full port scans and sorts with bounded spatial queries.
- Maintain normalized SQL-type buckets for compatible source/target lookup.
- Create visible connection points only for the hovered table and compatible targets during an active drag.
- Coalesce relationship pointer movement to one update per animation frame.
- Continue using the cheap Manhattan preview route during table and relationship dragging.

## Routing Engine

- Run high-quality routing in a dedicated Web Worker.
- Inflate table bounds by a fixed clearance to create routing obstacles.
- Build a sparse orthogonal visibility graph from relationship endpoints, obstacle corners, and nearest axis-visible neighbors.
- Route with A*. The cost function combines segment length, bend penalties, occupied-segment penalties, crossing penalties, and incorrect initial/final port direction penalties.
- Preserve deterministic ordering and tie-breaking so unchanged schemas produce stable routes.
- Route visible relationships first, followed by off-screen relationships in bounded batches.

## Incremental Updates

- Cache routes by relationship endpoints, endpoint sides, and obstacle-generation identifier.
- Moving a table immediately uses the cheap preview for its connected relationships.
- On drop, invalidate only relationships connected to the moved table and routes intersecting its old or new inflated bounds.
- Schema edits invalidate affected endpoint/type indexes and related routes rather than rebuilding every index.
- Generation tokens discard stale worker responses.

## Worker Protocol

- Requests contain a generation, obstacle changes, dirty relationships, endpoint geometry, and current segment-occupancy summary.
- Responses contain the same generation and routed point arrays keyed by relationship ID.
- The main thread applies only the newest matching generation and redraws only affected Pixi Graphics objects.
- Worker errors, timeouts, or unavailable workers retain the cheap route and report no destructive state change.

## Scale and Performance Targets

- Relationship hit-testing should avoid linear scans over all tables or ports.
- Pointer work should stay within one animation frame and allocate no large temporary arrays.
- High-quality routing must not block pan, zoom, table drag, relationship drag, SQL editing, or saving.
- Initial large-schema routing may refine progressively; interaction remains available throughout.

## Testing

- Unit-test RBush table/port queries and normalized-type bucket lookup.
- Unit-test obstacle inflation, route collision detection, deterministic A*, bend penalties, and congestion penalties.
- Test route-cache hits, dirty-route invalidation, and stale generation rejection.
- Add synthetic scale tests for 3,000 tables, thousands of ports, and 1,500 relationships with non-flaky operation-count assertions.
- Run frontend tests, production build, Rust tests, and macOS packaging.

## Scope

This phase optimizes single-column relationship creation and display. Multi-column foreign keys, editable referential actions, and global table rearrangement remain outside scope.
