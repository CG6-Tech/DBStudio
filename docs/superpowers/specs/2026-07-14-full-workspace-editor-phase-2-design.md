# ViewDB Phase 2: Full Workspace Editor

## Purpose

Evolve the two-table ViewDB sample into a complete visual PostgreSQL workspace editor. Phase 2 adds a scalable desktop workspace, full structural schema editing, relationship creation, free canvas organization, color-coded areas, advanced schema objects, validation, safe source-preserving SQL updates, and persistent diagram metadata.

The supplied ChartDB screenshots are visual and interaction references. ViewDB will retain its existing dark visual language and production architecture while adopting the reference patterns that improve dense schema navigation and editing.

## Product outcome

A user can open a PostgreSQL schema, create or modify its supported objects visually, arrange tables freely, group them into colored areas, inspect every pending SQL change, save safely, and reopen the workspace without losing either SQL meaning or diagram organization.

## Scope

### Included

- A narrow application navigation rail.
- Native opening of either one SQL file or a folder workspace containing multiple SQL files.
- A resizable and collapsible context sidebar.
- Searchable table, relationship, visual, type, validation, and change views.
- Complete supported table and field create, read, update, delete, duplicate, and reorder operations.
- Primary keys, unique constraints, foreign keys, indexes, check constraints, comments, PostgreSQL enums, and reusable custom types.
- PixiJS table cards with multiple detail levels, field ports, semantic indicators, multi-selection, and context actions.
- Relationship creation by field-port drag and by form.
- Free table movement with optional grid snapping.
- Named, resizable, movable, colored areas containing tables.
- Free-positioned notes.
- Minimap, search navigation, fit, zoom, and local or global layout controls.
- Undo and redo for schema and diagram operations.
- Source-preserving SQL patch, rewrite, insertion, and removal strategies.
- Continuous validation and a grouped change preview.
- Persistent visual metadata in `workspace.sql-erd.json`.
- Keyboard navigation, accessibility, performance, integration, and desktop save/reopen testing.

### Deferred

- Real-time multi-user collaboration.
- Cloud accounts or hosted workspaces.
- Database connection and live schema deployment.
- Migration execution against a database.
- Non-PostgreSQL dialects.
- Automatic three-way merging of external structural edits.

## Workspace information architecture

The desktop window uses three primary zones.

### Navigation rail

The narrow rail provides these destinations:

- Open
- Tables
- Relationships
- Visuals
- Types
- Validation
- Changes

The active destination controls the context sidebar. Icons come from a consistent icon library rather than text symbols or handcrafted approximations.

The Open destination shows workspace files, parse state, external-change state, and the file that owns the selected schema object.

### Context sidebar

The sidebar is resizable and collapsible. Its width persists in workspace preferences. It contains:

- Tables: searchable, expandable table editors.
- Relationships: searchable relationship list and creation form.
- Visuals: areas and notes.
- Types: enums and reusable custom types.
- Validation: errors and warnings linked to source objects.
- Changes: grouped schema operations and SQL preview.

Tables can be grouped or filtered by PostgreSQL schema and source file. Creating an object requires an owning file; ViewDB defaults to the active file and exposes that choice in the creation flow.

The current permanent right inspector is removed. Canvas selection opens and focuses the matching editor in the context sidebar, preventing two competing editing surfaces and increasing usable canvas width.

### Top bar and canvas controls

The top bar contains document-level actions:

- active file or workspace name;
- dirty and save state;
- undo and redo;
- validation status;
- SQL/change preview; and
- Save.

A floating bottom canvas toolbar contains:

- search;
- zoom out and zoom in;
- fit selection and fit workspace;
- layout selection and layout workspace;
- minimap toggle;
- selection mode; and
- undo and redo shortcuts.

## Workspace files

The native Open flow supports one `.sql` file or a folder workspace. A folder workspace discovers PostgreSQL files without concatenating them. Each file retains its AST, source map, diagnostics, hash, modified time, parsed revision, saved revision, and local operations.

The file view supports:

- filtering and locating files;
- showing parse errors and unsaved-object counts;
- setting the active destination for new objects;
- moving supported objects between files;
- reparsing only an externally changed file; and
- saving only affected files.

Cross-file references resolve through the canonical workspace model. Before a multi-file save, every affected candidate file is parsed and the workspace dependency graph is validated. ViewDB then stages every temporary file and backup before beginning replacement. If validation or staging fails, no affected file is replaced. If a replacement fails after the commit phase begins, ViewDB restores already-replaced files from their backups and reports the recovery result.

## Tables and fields

### Table list and editor

The Tables sidebar supports:

- filtering by table or field name;
- adding, duplicating, renaming, recoloring, collapsing, moving, and deleting a table;
- expanding a table into inline field and advanced-object editors;
- showing object errors and unsaved changes in place; and
- locating or centering a table on the canvas.

Sidebar hover highlights the corresponding canvas card. Sidebar selection selects the card. Canvas selection expands and scrolls the corresponding sidebar item into view.

### Field editor

Each field row supports:

- drag reordering;
- add, duplicate, rename, and delete;
- a searchable PostgreSQL type picker;
- nullable, primary-key, unique, identity, and generated settings;
- default and generated expressions;
- inline validation; and
- dependency-aware destructive confirmation.

Indexes, checks, and comments appear as collapsible sections inside their owning table editor.

### Destructive actions

Before destructive operations, the UI shows an impact summary including affected relationships, indexes, constraints, and dependent fields. Confirmation is required when the operation has dependencies. The resulting action remains undoable until Save resets the committed revision.

## Canvas table cards

Table cards include:

- a selectable accent color;
- table name and object indicators;
- field name and PostgreSQL type;
- primary-key, foreign-key, unique, generated, and nullability indicators;
- relationship ports aligned to fields;
- compact, normal, and detailed rendering levels;
- collapsed and expanded states;
- selection, hover, validation, and pending-change states; and
- a context menu for common actions.

Cards support click selection, modifier-key multi-selection, rectangle selection, and free dragging. New tables appear near the visible viewport instead of triggering a global layout.

## Relationships

Relationships can be created through either of two equivalent flows.

### Port drag

The user drags from a source field port to a compatible target field. During the drag, compatible targets highlight and incompatible targets show a concise reason. Dropping on a valid target opens a compact confirmation editor for constraint name, cardinality, and update or delete actions.

### Sidebar form

The Relationships sidebar supports source table and field, target table and field, constraint name, cardinality, and update or delete actions. It lists existing relationships with search, validation state, locate, edit, and delete controls.

### Canvas routes

Relationship lines provide:

- orthogonal routing at detailed zoom;
- simplified rendering at medium zoom;
- cardinality markers;
- hover and selected highlighting;
- focused mode that dims unrelated edges;
- selectable routes; and
- dependency-aware deletion.

Creating, editing, or deleting a relationship updates the canonical model, operation history, SQL preview, canvas route, and validation results together.

## Free movement, areas, and colors

Free canvas organization is a primary workflow, not optional polish.

### Table movement

- Every table can be freely dragged anywhere in world coordinates.
- Optional grid snapping is controlled from canvas settings.
- Multi-selected tables move as a group.
- Manual movement pins the affected tables so automatic layout does not move them unexpectedly.
- Local or global layout can be explicitly requested and previews its affected scope.
- Table positions persist across restarts.

### Areas

Users can:

- create, name, move, resize, recolor, hide, lock, collapse, focus, and delete an area;
- create an area around the current table selection;
- add a table by dragging it inside an unlocked area;
- move a table between areas or remove it from all areas;
- choose whether moving an area also moves its contained tables;
- run auto-layout only within one area; and
- fit the viewport to one area.

Area membership is explicit in metadata. A table visually inside an area becomes a member on drop; merely overlapping an area during a drag does not change membership until the user releases it.

A table belongs to at most one area. Areas may overlap visually; while dragging a table, ViewDB highlights the topmost unlocked target area so the membership result is unambiguous before drop.

An area renders behind relationships and table cards with a subtle tinted background, colored border, and title. A locked area cannot be moved, resized, or have its membership changed until unlocked.

### Colors

- Tables and areas each have a selectable accent color from the same accessible palette.
- Table color affects the header accent, selection treatment, and minimap marker.
- Area color affects its border, translucent background, title, sidebar marker, and minimap region.
- Color is visual metadata and never modifies SQL.
- The palette maintains sufficient contrast in default, hover, selected, and disabled states.

### Notes

Notes are free-positioned visual metadata with plain text, size, color, and locked state. They remain separate from PostgreSQL comments, which belong to schema objects and are written to SQL.

### Metadata persistence

`workspace.sql-erd.json` stores:

- stable object IDs;
- table positions, colors, collapsed states, hidden states, and pinning;
- area IDs, names, bounds, membership, colors, collapsed states, locked states, and move-contents preference;
- note content and geometry;
- sidebar state;
- viewport and minimap state;
- layout version; and
- source-file hashes.

Undo and redo cover table movement, area movement, area resizing, grouping, ungrouping, membership changes, colors, notes, visibility, and collapsed states.

## Advanced schema objects

### Indexes

The editor supports named indexes, selected and ordered fields, unique indexes, index method, partial predicates, and supported expressions. Validation detects missing fields, duplicate names, and invalid expressions.

### Check constraints

Checks include name, expression, enabled state, and source location. Candidate expressions are validated as part of the generated PostgreSQL document before Save.

### Comments

Tables, fields, constraints, indexes, and types support PostgreSQL comments. Comment editing is distinct from canvas notes.

### Enums and custom types

The Types view supports creating, renaming, editing, ordering, and deleting enum values and supported reusable custom types. Type deletion shows every dependent field before confirmation.

## Canonical model and operation engine

The canonical model expands to normalized maps for files, schemas, tables, fields, constraints, indexes, relationships, types, areas, notes, source bindings, diagnostics, and dependency indexes.

Schema operations include:

- table and field creation, deletion, duplication, movement, and reordering;
- primary, unique, foreign-key, and check constraints;
- indexes;
- comments;
- enums and supported custom types; and
- all diagram metadata operations.

Each operation contains its target IDs, previous state, next state, affected objects and files, inverse operation, revision, validation impact, and SQL-write strategy. React consumes small projections of this store; it does not own the canonical schema.

## Source-preserving SQL writer

The writer uses three levels.

### Token patch

Used for names, data types, nullability, comment text, and supported constraint options.

### Statement rewrite

Used for structural changes inside an existing table, index, constraint, or type. Rewrites preserve the original statement's surrounding comments and file position.

### Statement insertion or removal

Used for new or deleted objects. Placement follows deterministic rules based on object ownership and dependency order.

Every candidate SQL document is reparsed with `libpg_query` before Save. If a safe source binding or rewrite cannot be produced, Save is blocked with an object-specific explanation. ViewDB never silently regenerates unrelated SQL.

## Validation and change preview

Continuous validation covers:

- duplicate identifiers;
- missing or circular dependencies where unsupported;
- unresolved or incompatible relationship fields;
- invalid type, default, generated, index, or check expressions;
- orphaned indexes and constraints;
- unsafe or overlapping source patches;
- unsupported source constructs; and
- invalid visual metadata references.

The Changes view groups operations by object and file. It presents additions, modifications, deletions, generated SQL, validation state, and source locations. Users can inspect an individual operation, undo it, or navigate to the affected object.

## Delivery plan

### Milestone 1: Workspace foundation

Build single-file and folder opening, the per-file parse model, navigation rail, resizable context sidebar, file view, searchable table list grouped by schema or file, floating canvas toolbar, minimap shell, shared design tokens, and consistent icon system.

Exit criteria: the existing two-table open, select, edit, preview, undo, redo, and save workflow works entirely through the new layout, and a multi-file workspace opens without concatenating its files.

### Milestone 2: Table editor

Implement table and field CRUD, duplication, reordering, primary key, unique, nullability, identity, generated values, type picker, and destructive-impact dialogs. Extend the operation engine and SQL writer in the same slice.

Exit criteria: a supported schema can be created and structurally edited from scratch, undone, previewed, saved, and reopened.

### Milestone 3: Relationships

Implement relationship list and form, field-port dragging, cardinality markers, route highlighting, relationship operations, dependency handling, SQL persistence, and validation.

Exit criteria: relationships created through either UI path produce valid PostgreSQL and survive reopening.

### Milestone 4: Canvas organization

Implement free table movement, multi-selection, optional grid snapping, pinned positions, table colors, areas, area membership, area colors, notes, local and global layout, minimap, viewport persistence, and metadata undo or redo.

Exit criteria: a medium schema can be freely arranged, color-coded, grouped into movable and resizable areas, saved, and restored without modifying SQL.

### Milestone 5: Advanced schema and polish

Implement indexes, check constraints, comments, enums and custom types, the validation view, grouped change preview, keyboard shortcuts, accessibility, and performance polish.

Exit criteria: all supported operations pass parser validation, undo and redo, persistence, and end-to-end tests.

## Testing and quality gates

Every milestone includes:

- canonical model and operation tests;
- inverse-operation and history tests;
- SQL patch, rewrite, insertion, removal, and reparse tests;
- React interaction tests;
- PixiJS canvas integration tests;
- reference screenshot comparisons at matching viewport dimensions;
- keyboard navigation and accessibility checks;
- a desktop save and reopen scenario; and
- performance measurements against generated schemas of increasing size.

Area-specific tests cover membership on drop, overlapping areas, locked areas, moving an area with and without contents, multi-table grouping, ungrouping, color persistence, metadata recovery, and local layout isolation.

## Phase acceptance criteria

- Users can create, modify, and delete every supported schema object through the workspace UI.
- Tables can be moved freely and keep their positions after reopening.
- Tables and areas can be assigned accessible colors that persist independently of SQL.
- Users can create, resize, move, lock, collapse, focus, and delete areas.
- Tables can be grouped, moved between areas, or ungrouped through direct manipulation.
- Relationships can be created by dragging ports or using the sidebar.
- The minimap, search, selection, fit, zoom, and layout controls work with tables and areas.
- Every schema and visual operation supports undo and redo.
- The change preview explains the SQL impact by object and file.
- Single-file and folder workspaces preserve per-file source ownership and save only affected files.
- Valid candidate SQL is reparsed before an atomic save.
- Existing source text outside affected objects is preserved.
- Visual metadata survives save and reopen without being injected into SQL.
- The principal workflows pass automated and visually verified desktop tests.
