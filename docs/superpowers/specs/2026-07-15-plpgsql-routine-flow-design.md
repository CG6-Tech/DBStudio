# PL/pgSQL Routine Flow Visualization Design

## Goal

Add a read-only, Postman-style routine flow canvas that visualizes conditions, assignments, exceptions, returns, and SQL steps inside PostgreSQL PL/pgSQL functions and procedures. Users enter it from a routine in the existing Logic graph and return through a breadcrumb.

MySQL stored-program flow parsing and routine editing are outside the first version.

## Control-Flow Model

Add a `RoutineFlow` model with:

- Routine ID and body hash.
- Typed nodes with stable IDs, source ranges, labels, full source text, input ports, output ports, and optional diagnostics.
- Directed edges between semantic ports.
- Nested-block metadata for expandable groups.
- Flow-level diagnostics and parse-completeness state.

Version-one node kinds are Start, Condition, Assignment, Raise Exception, Return, SQL Statement, and End.

Condition outputs use semantic labels. A basic `IF` has True and False outputs. `ELSIF` branches use their source-derived labels and `ELSE` becomes the default output. Return and exception nodes terminate their branches.

## PL/pgSQL Parsing

Implement a focused structured parser over the already-extracted routine body. It tokenizes PL/pgSQL while retaining exact source offsets, comments, quoted strings, dollar-quoted content, and multiline expressions.

The recursive parser recognizes:

- `BEGIN ... END` blocks.
- `IF ... THEN`, zero or more `ELSIF ... THEN` branches, optional `ELSE`, and `END IF`.
- Assignments using `:=`.
- `RAISE EXCEPTION`, including `USING` fields such as `ERRCODE`, `MESSAGE`, `DETAIL`, and `HINT`.
- `RETURN` and `RETURN NEXT`.
- SQL statements and unsupported procedural statements as opaque nodes.

Unknown syntax is not interpreted. The parser creates an opaque SQL Statement node containing the exact source, attaches a warning when structure is uncertain, and resumes at the next safe statement boundary. A malformed routine produces the maximum safe partial flow rather than blocking the Logic workspace.

## Validation Grouping

The parsed AST remains a faithful representation of individual statements. A separate presentation transform may combine consecutive `IF` statements when every true branch terminates in a `RAISE` and the false path immediately continues to the next validation.

The grouped Condition block has one named failure output per validation and one Default continuation output. Every grouped rule retains its original AST node ID and source range so selection and source highlighting remain exact. Grouping never changes control-flow semantics.

## Lazy Parsing and Cache

Routine flows parse only when opened. Cache results by routine ID, body hash, parser version, and dialect. A body change invalidates the cached flow. Closing and reopening an unchanged flow reuses the cached model.

Parsing runs off the interaction path for large bodies. The UI initially shows a lightweight preparing state and publishes a partial diagnostic state if parsing fails.

## Navigation

Routine cards and routine inspector details expose an explicit keyboard-accessible `Open flow` action. Activating it switches the diagram region from the database Logic graph to the routine flow.

The flow header shows a breadcrumb:

`Logic graph / schema.routine_name / Flow`

The first breadcrumb returns to the Logic graph and restores its selection, viewport, and filters. ER diagram state remains independent and unchanged.

## Flow Canvas

The flow view is canvas-first and read-only.

- Compact modular blocks with input and output ports.
- Named failure outputs and a Default continuation for grouped Condition blocks.
- Full expressions inside condition and assignment blocks, with truncation only when the block is collapsed.
- Restrained type treatments: amber conditions, blue assignments/evaluations, red exceptions, green start/return/end, and neutral SQL steps.
- Curved semantic connections with visible direction.
- Automatic layout, pan, zoom, fit, and minimap.
- Local block dragging for inspection. Positions live only for the current session in version one and do not modify SQL or metadata.

Selecting a block opens a temporary drawer with node type, full SQL, source location, ports, diagnostics, and branch targets. Closing the drawer restores the full canvas width. Double-clicking a block focuses its source in the drawer; it does not enter edit mode.

## Layout

The automatic layout prioritizes the continuation path from left to right. Terminal exception branches fan vertically from their condition outputs. Shared continuation targets are not duplicated. Nested blocks may render as collapsible group frames without changing graph identity.

Layout inputs depend only on the presentation graph. Parser and AST tests therefore remain independent of layout, and layout tests can use synthetic flow models.

## Accessibility

- `Open flow`, breadcrumb navigation, blocks, ports, drawer controls, zoom, fit, and minimap controls are keyboard accessible.
- Arrow keys navigate spatially between blocks; Enter selects; Escape closes the drawer or returns focus to the selected block.
- Blocks expose their type, label, source summary, warning state, and output names through accessible labels.
- Color is never the only indicator of node or edge meaning.
- Reduced-motion preferences disable animated layout transitions.

## Error Handling

- Unsupported syntax creates an opaque node and warning.
- Unclosed blocks or conditions create a partial-flow diagnostic at the last reliable range.
- Invalid source ranges are discarded and reported rather than used for source highlighting.
- A flow parse failure affects only that routine and does not alter the database Logic graph.
- An empty routine displays Start connected to End with an empty-body explanation.

## Testing

Parser tests cover multiline expressions, nested blocks, `IF/ELSIF/ELSE`, consecutive validations, assignments, `RAISE USING`, returns, SQL statements, comments, dollar-quoted content, unsupported statements, malformed bodies, source ranges, and deterministic IDs.

Presentation tests cover validation grouping, semantic preservation, named outputs, shared continuation nodes, nested metadata, and no grouping across side effects.

Layout tests cover deterministic placement, exception fan-out, nested groups, cycles introduced by opaque loop statements, and large flows.

UI and state tests cover explicit opening, breadcrumbs, restored Logic state, lazy loading, caching, layout, selection, drawer content, keyboard navigation, drag, pan, zoom, fit, minimap, warnings, empty bodies, and reduced motion.

Regression tests confirm ER parsing/rendering, database Logic parsing/rendering, SQL generation, workspace linking, selection, and metadata behavior remain unchanged.

## Completion Criteria

The feature is complete when a user can open a supported PL/pgSQL routine from the Logic graph, see a faithful read-only block flow with grouped validations and explicit branches, inspect any block's exact SQL and source range, navigate and rearrange the canvas locally, return without losing Logic state, and receive clear partial-flow warnings for unsupported syntax.
