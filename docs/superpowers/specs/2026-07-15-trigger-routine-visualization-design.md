# Trigger and Routine Visualization Design

## Goal

Add a read-only Logic graph to ViewDB that visualizes database triggers, PostgreSQL functions and procedures, and MySQL functions and procedures alongside their table and routine dependencies. The existing ER diagram and SQL editing behavior must remain unchanged.

## Scope

The first version supports SQL-file workspaces in PostgreSQL and MySQL dialects.

- PostgreSQL: `CREATE FUNCTION`, `CREATE PROCEDURE`, and `CREATE TRIGGER`.
- MySQL: `CREATE FUNCTION`, `CREATE PROCEDURE`, and `CREATE TRIGGER`.
- Searchable and filterable read-only object browsing.
- A dedicated Logic canvas mode with first-class trigger and routine cards.
- Dependency paths from table events through triggers and routines to affected objects.
- Read-only object and edge details, source locations, diagnostics, and original SQL.

Creating, editing, deleting, or regenerating triggers and routines is outside this version. Live database introspection is also outside scope.

## Domain Model

Extend `SchemaDocument` with `triggers` and `routines`.

A routine records:

- Stable ID, qualified name, schema, and dialect.
- Kind: function or procedure.
- Parameters, return declaration when applicable, language when available, and routine body.
- Original definition SQL and source range.
- Parse completeness and diagnostics.

A trigger records:

- Stable ID, qualified name, schema, and dialect.
- Target table reference.
- Timing, one or more events, and row or statement scope.
- Optional condition.
- Executed routine reference when the dialect uses one.
- Inline body when applicable.
- Original definition SQL and source range.
- Parse completeness and diagnostics.

Workspace ownership continues to use the existing entity-to-source map. Logic IDs use the existing workspace entity ID strategy so reparsing unchanged files yields stable identities.

## Parsing

The dialect parsers extend the existing tokenization and statement parsing path rather than introducing a second parser.

Parsing must tolerate routine bodies that contain semicolons, quoted identifiers, dollar-quoted PostgreSQL bodies, and MySQL delimiter-oriented source files. It extracts normalized metadata where safe and always retains the original definition SQL.

Unsupported or malformed syntax does not prevent workspace loading. A partially parsed logic object is returned when its outer definition can be identified. Unknown fields remain explicit rather than receiving guessed values.

## Workspace Linking and Dependency Analysis

Workspace linking resolves qualified references before unqualified references. An unqualified reference resolves only when it has one valid candidate in the applicable namespace.

The logic dependency graph uses these edge kinds:

- `table-event`: a table event activates a trigger.
- `executes`: a trigger executes a routine.
- `calls`: a routine invokes another routine.
- `reads`: a routine reads from a table or view-like relation recognized by the parser.
- `inserts`, `updates`, and `deletes`: a routine mutates a table.

Trigger target and executed-routine edges come from trigger structure. Routine call and table-effect edges use conservative static analysis of the parsed routine body. Dynamic SQL is not interpreted. Ambiguous or dynamic references become unresolved dependencies and are never connected by guessing.

Cycles are valid, including recursive routine calls. Graph traversal and path highlighting must be cycle-safe.

## User Interface

Logic is a separate canvas mode. Switching modes preserves the existing ER viewport and positions independently from the Logic graph viewport and positions.

### Logic Sidebar

The sidebar provides:

- Search across qualified names, kinds, event names, table names, parameter text, and source files.
- Filters for all logic, triggers, functions, and procedures.
- Edge visibility controls for table events, trigger execution, routine calls, reads, and mutations.
- Counts and unresolved-state indicators.
- Keyboard-accessible selection that reveals and focuses the corresponding canvas card.

### Logic Canvas

Tables, triggers, and routines are first-class cards with distinct but compatible visual treatments.

- Table cards show the table name, a compact field summary, and inbound or outbound logic counts.
- Trigger cards show timing, events, scope, target table, and a shortened condition.
- Routine cards show kind, language, signature, return declaration, caller count, and effect count.
- Blue event edges connect tables to triggers.
- Amber execution edges connect triggers to routines.
- Green effect edges connect routines to affected tables.
- Routine-call and read edges remain visually distinguishable through labels and line treatment without introducing additional saturated colors.

Edge labels state their semantics, such as `ON UPDATE`, `EXECUTES`, `CALLS`, or `INSERTS`. Selecting any card or edge highlights the complete connected path and dims unrelated objects. Viewport culling applies to cards and edges.

The Logic graph is laid out independently in a worker. Automatic layout places event flow from left to right where possible: source tables, triggers, routines, then affected tables. Manual positions are stored separately from ER table positions.

### Read-Only Inspector

Selecting an object opens a read-only inspector containing all normalized metadata, diagnostics, source file and location, unresolved references, and the original definition SQL. Selecting an edge shows its kind, source, destination, inference basis, and resolution state.

## State and Persistence

UI state tracks the active canvas mode, Logic search and filters, selected logic object or edge, Logic viewport, and path-highlight state. ER selection and Logic selection are independent.

Metadata persistence gains a separate Logic layout section containing object positions and viewport data. Existing metadata remains valid when this section is absent. Trigger and routine definitions remain source-owned and are not emitted or modified by SQL generation.

## Error Handling and Diagnostics

- Duplicate qualified routine or trigger identities receive object diagnostics.
- Missing target tables or executed routines receive unresolved-reference diagnostics.
- Ambiguous unqualified names list candidate identities without selecting one.
- Dynamic SQL and unsupported body constructs receive informational unresolved-dependency diagnostics.
- A parser failure confined to one logic definition does not suppress tables or other logic objects in the file.
- Empty Logic mode explains that no supported triggers or routines were found and provides the active dialect and supported constructs.

## Performance

Logic parsing participates in the existing incremental workspace parsing flow. Dependency indexes support object lookup, search, adjacency traversal, and reverse adjacency without repeated full-document scans.

Logic layout runs in a worker. Canvas rendering uses viewport culling, batched graphics, and path calculation limited to visible or highlighted graph regions. Search and selection must remain responsive with thousands of logic objects.

## Testing

Parser tests cover both dialects, multi-event triggers, row and statement scope, quoted and schema-qualified names, PostgreSQL dollar-quoted bodies, MySQL delimiter-style files, overloads, malformed definitions, and unsupported clauses.

Workspace tests cover cross-file resolution, ambiguous names, unresolved references, overload identity, stable IDs, dependency cycles, recursive calls, dynamic SQL, and incremental reparsing.

UI and state tests cover mode switching, independent selection and viewport state, search and filters, object focusing, inspector content, edge controls, path highlighting, empty states, unresolved states, and keyboard navigation.

Performance tests cover parsing, indexing, layout, search, and viewport rendering with thousands of logic objects.

Regression tests confirm that existing ER parsing, layout, selection, editing, SQL generation, and saved metadata behavior remain unchanged when files also contain logic definitions. Generated SQL for currently supported editable objects must be byte-for-byte unaffected by the presence of read-only logic objects.

## Delivery Boundaries

Implementation is complete when supported trigger and routine definitions load from single files and workspaces, resolve conservative dependencies, appear in the dedicated Logic mode, expose searchable read-only details, preserve independent layout state, and pass parser, workspace, UI, performance, and ER regression tests.
