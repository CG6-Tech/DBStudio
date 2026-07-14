# Retained Canvas Scene Design

## Goal

Eliminate full Pixi scene reconstruction during selection, zoom, pan, and localized document changes while preserving current canvas behavior at approximately 3,000 tables and 1,500 relationships.

## Architecture

- Introduce a retained `DiagramScene` controller owned by `DiagramCanvas`.
- The controller owns Pixi containers, rendered table/area/note/relationship records, connection ports, RBush indexes, relationship adjacency, and route-segment indexes.
- React continues to own the schema document, history, popup UI, toolbar state, and accessibility-focused DOM.
- The controller exposes explicit methods for document reconciliation, viewport changes, selection changes, and destruction.

## Indexes

- Build and retain `tableById`, `columnById`, `nodeById`, and relationship adjacency maps.
- Maintain RBush indexes for table bounds, visible field ports, and routed relationship segments.
- Update index entries only when the owning object's geometry changes.
- Replace table-level pointer scans with bounded RBush point queries.

## Reconciliation

- Compare retained object versions with the next canvas snapshot.
- Classify changes as added, removed, geometry changed, content changed, style changed, selection changed, or unchanged.
- Added and removed objects create or destroy only their own Pixi records.
- Geometry changes update position, bounds, related ports, and connected routes.
- Content changes rebuild only the affected card's row children.
- Style and selection changes redraw only affected graphics.
- Unchanged objects retain their containers, event handlers, and indexes.

## Viewport and Culling

- Pan and zoom update the world transform and adaptive grid immediately.
- Viewport culling runs after the existing debounce and changes object visibility without destroying records.
- Relationship visibility is derived from visible endpoint tables and adjacency rather than scanning all relationships.
- Fit and focus continue to update the same retained viewport.

## Routing

- Table movement immediately updates connected relationships with the fast route.
- On drop, only dirty routes are sent to the routing worker.
- Existing route-cache generation and stale-result protection remain in place.
- Worker results update the retained relationship graphics and segment index in place.

## Fallback and Recovery

- Full scene rebuild is permitted only for renderer initialization, source-file replacement, or detected retained-state inconsistency.
- A failed incremental update leaves the previous scene visible and schedules one controlled rebuild.
- Destruction removes all event handlers, workers, Pixi children, and indexes.

## Performance Tests

- Add pure snapshot-diff tests covering additions, removals, geometry, content, style, and selection changes.
- Add synthetic snapshots for 3,000 tables and 1,500 relationships with operation-count assertions proving localized changes remain proportional to changed objects.
- Verify selection and viewport changes do not recreate table or relationship records.
- Run all frontend tests, production build, Rust tests, and macOS packaging.

## Scope

This phase covers the retained canvas core and table-point RBush queries. Sidebar virtualization, minimap replacement, compact history, SQL revision separation, indexed search, layout-worker concurrency, and route-worker pooling remain separate later phases.
