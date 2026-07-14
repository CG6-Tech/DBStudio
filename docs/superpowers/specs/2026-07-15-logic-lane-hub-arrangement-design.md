# Logic Lane-and-Hub Arrangement Design

## Goal

Replace the current rank-and-stack Logic graph arrangement with a high-quality hybrid constrained ELK layout. The layout groups each trigger's complete dependency chain into a readable lane, centers shared routines and tables as hubs between participating lanes, minimizes crossings, respects semantic flow, supports cycles, and preserves pinned nodes.

## Layout Semantics

A trigger lane contains:

`source table → trigger → executed routine → called routines → read/written tables or unresolved references`

Every graph node records the set of trigger lanes that reach it. A node belonging to one lane is lane-local. A node belonging to multiple lanes is a shared hub. Shared nodes are never duplicated.

Semantic ranks are fixed:

1. Event-source tables.
2. Triggers.
3. Executed and called routines, with additional ranks for call depth.
4. Read, inserted, updated, or deleted tables and unresolved targets.

When one table is both a source and an effect, its placement uses the rank that minimizes backward edges while preserving a single node.

## Graph Preprocessing

Before layout:

1. Build adjacency and reverse-adjacency indexes.
2. Find strongly connected components and collapse each component into a temporary layout group.
3. Traverse forward from every trigger to calculate lane membership and semantic depth.
4. Mark multi-lane nodes as shared hubs.
5. Determine stable lane order from source-table qualified name, trigger qualified name, and stable ID.
6. Apply persisted pin state and validate pinned coordinates.

Traversal is cycle-safe. Unresolved nodes participate like terminal effect nodes.

## Hybrid ELK Layout

ViewDB supplies a constrained compound graph to an ELK worker.

- Layered direction is left to right.
- Semantic ranks constrain layers.
- Trigger lanes become partition/group hints.
- Shared hubs occupy semantic hub bands spanning their participating lanes.
- Port order is fixed by edge kind and stable label.
- Node order uses stable IDs as deterministic tie-breakers.
- Crossing minimization and compaction use ELK's layered phases.
- Edge routing is orthogonal and respects block bounds and port anchors.

Collapsed SCC groups are expanded after the global layout. Small cycles form compact vertical stacks; larger cycles use a compact ring inside the group's allocated bounds. External ports remain stable during expansion.

## Pinned Nodes

Each Logic block has persisted `pinned` state.

- Dragging a node pins it automatically.
- Pin/unpin is available from the block header and detail drawer.
- Normal `Arrange` treats pinned nodes as fixed obstacles and lays out only unpinned nodes.
- `Arrange all` asks for confirmation, clears all pins, and performs a complete layout.
- Invalid or non-finite pinned coordinates are ignored for layout but preserved only after replacement with valid coordinates.

Because ELK cannot fully solve arbitrary fixed-position constraints in this graph, the worker lays out unpinned lane and hub groups first. A deterministic reconciliation pass translates groups around pinned obstacles, removes overlaps with minimal displacement, and reconnects orthogonal routes to pinned ports.

## Lane and Hub Placement

Trigger lanes are stacked vertically. Lane-local nodes remain near their lane center. A shared hub is vertically centered across the lanes that use it, then adjusted by crossing-minimization output.

The layout performs forward and backward barycentric ordering passes around the ELK result. These passes may reorder unpinned lane-local nodes within the same semantic rank but never change rank, lane membership, hub identity, or pinned coordinates.

Shared hubs display a badge with their trigger-lane count. Selecting a lane highlights its full path. Selecting a hub highlights every participating lane.

## Incremental Reconciliation

Persist:

- Node position.
- Pinned state.
- Viewport.
- Layout algorithm version.

On workspace reload or graph change:

- Retained pinned nodes keep their saved coordinates.
- Retained unpinned nodes keep saved coordinates when the algorithm version is unchanged and the graph change does not invalidate their lane/rank.
- New nodes receive positions from an incremental constrained layout.
- Removed nodes and pins are discarded.
- An algorithm-version change re-lays out unpinned nodes while preserving pins.

Logic arrangement metadata remains independent of ER positions and does not mark SQL dirty.

## Routing and Density

Orthogonal routes connect semantic ports and avoid node bounds. Parallel paths share trunks where safe but separate before labels and ports. Selected routes are promoted visually and remain fully labeled.

Progressive density rules:

- At high zoom, show all port and edge labels.
- At medium zoom, show selected and high-priority labels.
- At low zoom, hide edge labels and compact repeated ports by kind.

No semantic information depends on color alone.

## Worker and Fallback

Layout runs in a dedicated worker and uses generation tokens so stale results cannot replace newer graphs. The UI keeps the prior valid layout while arranging and exposes a non-blocking progress state.

If worker creation, ELK, constraint processing, or result validation fails, use a deterministic custom lane-and-hub fallback. The fallback preserves semantic ranks, stable lane order, shared hubs, and pins, though it may produce more crossings.

## Error Handling

- Invalid coordinates fall back to automatic placement.
- Conflicting pinned nodes remain pinned; unpinned groups move around them and the UI reports the collision.
- Missing ports fall back to the closest compatible side and create a diagnostic.
- Cycles never cause recursive traversal or ranking failure.
- Layout failure never removes the last valid positions.
- Persistence failure retains the in-memory layout and reports a non-blocking status.

## Testing

Domain tests cover lane discovery, multi-lane hubs, semantic ranks, SCC collapse/expansion, deterministic ordering, incremental reconciliation, and invalid metadata.

Layout tests cover crossing count, lane cohesion, hub centering, pinned obstacles, overlap removal, orthogonal route/node intersections, stable ports, backward-edge minimization, fallback output, and deterministic repeated runs.

Interaction tests cover automatic pin-on-drag, explicit pin/unpin, Arrange preserving pins, Arrange all confirmation, lane/hub highlighting, density behavior by zoom, and progress/error states.

Persistence tests cover position/pin/version/viewport round trips, new and removed nodes, graph changes, algorithm upgrades, malformed metadata, and failed writes.

Performance tests cover thousands of nodes and edges, dense shared hubs, large SCCs, worker cancellation, incremental layout, and route updates.

Regression tests confirm dragging, selection, drawers, minimap, routine Open flow, routine-flow layout, ER layout, metadata, parsing, and SQL generation remain unchanged.

## Completion Criteria

Arrangement is complete when every trigger chain forms a readable lane, shared dependencies appear once as centered hubs, crossings and route length are materially reduced, semantic left-to-right flow remains clear, pinned blocks survive Arrange and reload, cycles and unresolved references remain stable, layout runs off the UI thread with a deterministic fallback, and all arrangement, interaction, persistence, performance, and regression tests pass.
