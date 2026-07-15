# Postman-style PL/pgSQL flow design

## Objective

Render PostgreSQL triggers and PL/pgSQL routines as an executable, Postman-inspired visual flow. The main Logic graph keeps routines compact by default, while inline expansion exposes conditions, assignments, SQL, exceptions, returns, and explicit branch convergence. The first release supports manual branch focus rather than evaluating SQL expressions against sample `NEW` and `OLD` values.

## Approved visual language

- Light dotted canvas with large white, draggable cards.
- Colored top accents and ports convey semantics without replacing the neutral card hierarchy.
- Orange represents trigger/control execution, violet conditions and merges, blue data and SQL results, red exceptions/failure paths, and green successful continuation.
- Input and output sockets sit on card edges. Connections start and end at the measured center of a visible socket.
- Condition blocks contain their expression and internal THEN, ELSIF, ELSE, or operation-specific rails.
- Connections render above the grid and below nodes. Curves leave and enter sockets horizontally and do not cross node bounds.
- A visible Merge node represents branch reconvergence. Multiple branches never silently enter one ordinary node port.

## Approaches considered

1. **Routine badge:** show only condition and exception counts in the routine block. This is compact but does not explain execution.
2. **Single summary diamond:** add one decision node per routine. This communicates branching but hides meaningful conditions and outputs.
3. **Postman-style executable blocks:** expose typed ports, expressions, branch rails, and explicit merge blocks. This is the approved approach because it remains readable while accurately describing execution.

## Architecture

The existing PL/pgSQL flow parser remains the source of conditions, assignments, SQL statements, exceptions, and returns. A flow-normalization stage converts parsed control flow into a display graph with typed ports and explicit merge nodes. Merge nodes are generated wherever two or more live branches reconverge.

A dedicated layout stage uses ELK for initial node placement. After placement, a connection router reads the measured node and socket geometry and produces paths that avoid node bounds. Dragging a node recalculates only incident and locally affected routes.

The main Logic graph renders routines as one block by default. Double-clicking a routine replaces that block with its normalized flow at the same logical location. Collapsing removes the inline nodes and restores the routine block. The standalone routine-flow view uses the same block and routing components.

## Flow model

Supported node roles are:

- trigger
- prepare-data
- condition
- SQL
- assignment
- exception
- return
- merge
- routine
- unresolved or unparsed

Every node exposes named ports with one semantic type: control, row/data, branch, error, or result. Condition ports retain source labels such as `THEN`, `ELSIF`, `ELSE`, `UPDATE`, `INSERT`, and `DELETE`.

Connections contain a stable ID, source node and port, target node and port, semantic type, and optional label. Focus is derived UI state rather than persisted graph data.

Every source-derived node retains its PL/pgSQL source range. Stable IDs derive from routine ID, source range, and node role. Generated merge IDs derive from their ordered incoming branch IDs and continuation target. This allows unchanged nodes to retain persisted positions after the routine is re-parsed.

Parsed flow data and layout metadata remain separate. Layout metadata stores position and pin state by stable node ID. Stale entries are ignored during reconciliation.

## Merge generation

The normalizer computes live tails for each branch. Terminal exception and return nodes do not contribute a tail. When two or more tails continue into the same successor, the normalizer inserts a merge node with one input per tail and one continuation output. A single live tail connects directly without a merge.

For the approved `audit_order_change()` example:

- the recursion guard's `THEN` branch terminates at an early return;
- its `ELSE` branch reaches the `TG_OP` condition;
- UPDATE, INSERT, and DELETE each calculate `changed` independently;
- those three results enter separate inputs on a merge node;
- the merge has one output to the shared `audit_log` insert;
- the insert continues to the final return.

## Connection routing

Socket centers are measured after layout and are the authoritative endpoints. Forward connections use cubic Bézier curves with horizontal source and target tangents. The router checks candidate paths against expanded node rectangles. When a curve would cross a node, reconverge ambiguously, or travel backward, it assigns an obstacle-free track outside the affected bounds.

Parallel connections receive distinct track offsets. Routes are deterministic for unchanged node positions. During dragging, the UI uses a lightweight live route and schedules precise local rerouting for the affected edges. Selected paths increase opacity and width; unrelated edges and nodes fade but remain visible.

## Interaction

- Double-click a routine block to expand it inline.
- Collapse an expanded routine to restore its compact block.
- Drag any block to reposition and automatically pin it.
- Normal Arrange preserves pins; Arrange all clears pins only after confirmation.
- Click a branch socket or rail to focus all nodes reachable from that output until a return or exception.
- Clicking the active branch again clears focus.
- Selecting a node opens its exact source and structured details in the inspector.
- The initial release does not evaluate PL/pgSQL conditions. Branch focus is manual.

## Error handling

Parser uncertainty becomes an `Unparsed SQL` block with its source range and diagnostic rather than disappearing. Unresolved table and routine references remain visible as warning blocks. A failed ELK or routing request falls back to deterministic layered placement and simple socket-to-socket curves. Stale asynchronous layout and routing responses are discarded using generation IDs.

## Testing

Domain tests cover nested `IF` and `ELSIF`, early return termination, exception termination, three-way `TG_OP` branching, merge insertion, no unnecessary single-tail merge, stable generated IDs, and source ranges.

Routing tests assert exact socket endpoints, horizontal tangents, obstacle avoidance, distinct parallel tracks, deterministic output, and valid fallback paths. UI tests cover inline expand/collapse, branch focus and clearing, fading unrelated paths, drag-to-pin, pin-preserving Arrange, confirmed Arrange all, and saved-layout reconciliation.

The production build and complete test suite must pass. The `audit_order_change()` example is the primary visual acceptance fixture.

## Out of scope

- Executing the database routine.
- Evaluating arbitrary PL/pgSQL expressions.
- Editing and regenerating SQL from visual blocks.
- Runtime tracing against a live PostgreSQL connection.
- Support beyond the current PL/pgSQL parser's statement set, except for visible unparsed fallbacks.
