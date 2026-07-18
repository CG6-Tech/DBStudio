# Workspace Performance and Portable Data Design

## Goal

Make DBStudio responsive and memory-efficient at approximately 3,000 tables and 1,500 relationships while introducing a stable, importable workspace file for visual data and SQL-backed table comments.

The design preserves the current UI and canvas behavior. It separates SQL-derived schema state, portable workspace data, and runtime-only indexes so visual edits do not trigger unrelated schema work.

## Current Problems

- `SchemaDocument` combines parsed SQL, table visuals, annotations, canvas layouts, diagnostics, and transient editing state.
- Visual edits replace document-level arrays and can invalidate schema indexes, SQL generation, layout signatures, sidebar calculations, and canvas reconciliation.
- Undo entries retain complete previous and next document versions instead of compact changes.
- Layout signatures and scene keys serialize large collections to detect changes.
- Layout workers are created and terminated as broad document signatures change.
- Logic layout persistence can write repeatedly during interactive changes.
- `DiagramCanvas` and `WorkspaceSidebar` own several unrelated responsibilities, making focused updates difficult.
- The version-1 metadata file is coupled directly to `SchemaDocument`, uses parser-generated IDs and array fallback matching, and lacks explicit import validation or reporting.

## Scope

This work includes:

- a normalized workspace state model;
- compact command history;
- revision-based derived data and incremental canvas updates;
- persistent worker coordination;
- a versioned `.dbstudio/workspace.json` format;
- merge import and portable export;
- automatic migration from `.viewdb/sql-erd.json`;
- shared annotation, color, area, and pointer behavior;
- targeted component decomposition;
- correctness and performance regression coverage.

This work does not redesign the current UI, change SQL parsing semantics, replace PixiJS, add collaborative editing, or introduce an event-sourced database.

## Architecture

DBStudio will use three layers with explicit ownership.

### SQL schema model

The SQL model contains tables, columns, relationships, indexes, constraints, custom types, routines, triggers, source ranges, diagnostics, and SQL-backed table comments. SQL remains authoritative for database structure and for comment text during normal workspace loading.

The model has a `schemaRevision` that changes only when SQL-relevant state changes.

### Portable workspace model

The portable model contains table visual state, areas, notes, comment display state, portable comment text, logic layout, and routine-flow layouts. It has separate `visualRevision` and `logicRevision` values at runtime; revisions are not persisted.

Visual records are normalized by stable workspace identity. Areas reference portable table identities rather than parser-generated array positions.

### Runtime model

Runtime-only services own:

- table, column, relationship, search, and logic lookup indexes;
- relationship adjacency;
- Pixi display objects and object-version snapshots;
- RBush indexes for visible objects, ports, and relationship segments;
- viewport visibility sets;
- layout and routing worker caches;
- transient pointer, selection, hover, animation, and menu state.

Runtime data is never serialized or copied into undo history.

## State and Commands

All edits pass through typed commands such as `moveTable`, `resizeArea`, `changeTableColor`, `updateNote`, and `updateTableComment`.

Each command returns:

- the minimal normalized state patch;
- its inverse patch for undo;
- affected entity IDs;
- affected revision categories;
- whether SQL is dirty;
- whether portable workspace data is dirty.

Pointer movement updates retained render objects directly during a gesture. The completed gesture commits one command, so a drag produces one undo entry. Repeated text edits are coalesced while focus remains in the same field. History stores changed values rather than complete workspace versions and retains 200 entries by default.

## Portable Workspace File

The canonical location is `.dbstudio/workspace.json`.

```json
{
  "format": "dbstudio-workspace",
  "version": 2,
  "dialect": "postgresql",
  "tables": [],
  "areas": [],
  "notes": [],
  "canvases": {}
}
```

### Table records

Each table record contains:

- `ref`: optional same-workspace source identity, schema, table name, optional source file, and structural fingerprint;
- `visual`: position, color, collapsed state, and width scale;
- `comment`: text, visibility, offset, and color when a comment exists or has visual state.

The structural fingerprint is derived from normalized column names and types. It is a matching aid, not an authoritative identity.

### Areas and notes

Areas and notes use stable UUIDs. Areas store portable table references and note UUIDs, geometry, color, lock state, collapsed state, and movement behavior. Notes store text, position, and color.

Table comments and free notes remain distinct domain objects because table comments modify SQL. Both use the same annotation renderer, color control, pointer tracker, layering rules, and portable coordinate representation.

### Canvas layouts

The `canvases` object contains the schema viewport, logic graph layout, and routine-flow layouts. Logic nodes use qualified routine, trigger, and table identities rather than transient parser IDs. Each saved layout includes its algorithm version so incompatible automatic layouts can be reprojected while pinned manual positions are preserved where possible.

## Import and Merge

Import validates the complete file before changing state. It builds one merge patch and applies that patch as one undoable operation.

Table records match in this order:

1. exact source identity when importing into the same workspace;
2. normalized qualified `schema.table` name;
3. unqualified table name only when unique in both source and target;
4. structural fingerprint only when it resolves to exactly one target;
5. otherwise the record is skipped as missing or ambiguous.

Current visual records that are not mentioned by the import remain unchanged. Imported records with no unambiguous target are not created as phantom tables.

An import report includes matched, changed, unchanged, skipped, ambiguous, and invalid counts with record-level details.

During normal workspace loading, SQL comment text wins and portable data restores only its visibility, offset, and color. During explicit import, imported comment text updates the SQL-backed comment and marks the schema as unsaved. An imported empty comment removes the SQL comment after confirmation in the import summary.

## Migration and Persistence

DBStudio loads `.dbstudio/workspace.json` first. If absent, it reads `.viewdb/sql-erd.json`, validates the version-1 payload, and migrates it in memory.

The migrated file is written only during the next successful save. Writes use a synchronized temporary file and atomic rename. The old `.viewdb` metadata file is removed only after the new file is safely stored. Existing workspace recovery and symlink/path protections remain in force.

Unsupported future versions are refused without changing the workspace. Unknown optional fields are preserved when practical or ignored; unknown required format/version values are errors. Invalid optional records are skipped and reported. Invalid top-level structure aborts the import.

Browser preview uses the same serializer, validator, migrator, and merger. Automatic browser persistence uses local storage, while explicit export produces the same version-2 JSON bytes used by desktop.

## Performance Design

### Revision isolation

Schema, visuals, logic layouts, and transient UI state have independent revisions. A visual-only edit must not:

- regenerate SQL;
- rebuild schema or relationship indexes;
- recalculate diagnostics;
- restart layout workers;
- rebuild unchanged Pixi objects.

### Shared derived indexes

One schema-index service builds and caches lookup maps by `schemaRevision`. The sidebar, search, validation, SQL generator, layout input builder, and canvas reuse those indexes instead of rebuilding local maps.

### Retained canvas reconciliation

The canvas scene receives affected entity IDs and revision categories. It updates only changed objects and directly connected paths. Pan, zoom, hover, pointer movement, and path animation remain imperative and do not allocate workspace state or trigger React document renders.

A full scene rebuild is allowed only for initial renderer creation, complete source replacement, or detected retained-state inconsistency.

### Worker lifecycle

Layout and routing workers remain alive for the workspace session. Requests use generation tokens for cancellation and compact data-transfer objects containing only IDs and geometry needed by the worker. Visual metadata that cannot affect layout is not sent.

### Persistence scheduling

Interactive changes update memory immediately. Portable data writes are coalesced after a completed interaction and flushed on explicit save or workspace close. Writes are never performed for every pointer-move event.

### Large panels

Tables, references, validation issues, changes, and visual object lists use shared indexes and windowed rendering. Filtering works against prebuilt normalized search records and does not traverse the complete schema on every keystroke.

## Module Boundaries

- `workspace-data`: file types, validation, migration, stable identities, merge, and import reports.
- `workspace-state`: normalized records, revisions, commands, inverse patches, undo, and redo.
- `workspace-persistence`: desktop/browser load and save, atomic writes, migration, import, and export.
- `workspace-indexes`: shared schema, relationship, search, and logic indexes.
- `canvas-scene`: retained Pixi object registry and incremental reconciliation.
- `canvas-interactions`: shared gesture and pointer tracking for tables, notes, comments, and areas.
- `canvas-workers`: persistent layout and routing worker scheduling.
- `sidebar-panels`: focused panels using selectors instead of receiving the complete document.

The existing shared viewport controls, canvas grid, minimap behavior, standardized flow components, icon library, and visual styling remain in use.

## User Interface

Workspace/file controls provide:

- **Import workspace data** to merge a selected DBStudio JSON file;
- **Export workspace data** to write the portable version-2 file.

Import presents a summary before committing SQL comment removals and reports the final matched, changed, skipped, and ambiguous records. Import is one undoable operation. No new permanent panel or landing screen is introduced.

## Failure Handling

- Invalid top-level imports fail before mutation.
- Ambiguous and missing table references are skipped and reported.
- Invalid colors, coordinates, and dimensions are normalized only when a deterministic safe value exists; otherwise the record is skipped.
- Worker failure keeps the current diagram visible and invokes a controlled fallback.
- Retained-scene inconsistency schedules one full rebuild rather than repeatedly rebuilding.
- Failed persistence leaves the previous valid file untouched.
- Migration failure leaves legacy data untouched and opens the SQL workspace without applying unsafe visual data.

## Testing

Unit and integration tests cover:

- version-2 serialization round trips;
- version-1 migration;
- exact, qualified-name, unique-name, fingerprint, missing, and ambiguous matching;
- imported comments becoming SQL-backed edits;
- empty imported comments and confirmation behavior;
- area membership and note/comment coordinates;
- atomic import and single-step undo/redo;
- visual-only changes not invoking SQL generation, diagnostics, schema-index construction, or layout restart;
- incremental scene operation counts for localized changes;
- bounded and coalesced history;
- worker cancellation and stale-result protection;
- browser and desktop serializer equivalence;
- desktop atomic writes, recovery, migration cleanup, and path safety;
- a deterministic 3,000-table and 1,500-relationship fixture.

Performance tests assert operation counts and invalidation boundaries rather than machine-specific frame timings.

## Delivery Order

1. Introduce version-2 workspace types, validation, identity matching, migration, import/export, and compatibility tests.
2. Add normalized workspace state, revision categories, compact commands, and bounded history behind existing component APIs.
3. Separate SQL generation and diagnostics from visual revisions; centralize shared indexes.
4. Introduce persistent worker scheduling and compact worker payloads.
5. Complete retained canvas patch reconciliation and shared interaction controllers.
6. Split sidebar panels and apply indexed, windowed lists.
7. Enable canonical `.dbstudio/workspace.json` writes and remove legacy data only after verified migration.

## Success Criteria

- Existing SQL workspaces and version-1 visual metadata open without losing positions, colors, areas, notes, comments, or layouts.
- Exported version-2 data can be merged into another compatible workspace without relying on array order.
- Imported comments become explicit SQL-backed unsaved changes.
- A visual-only edit performs no SQL generation, diagnostic pass, schema-index rebuild, or layout-worker restart.
- Moving one table updates only that table and its directly connected relationships.
- Moving a note, comment, or empty area does not scan all relationships.
- Undo memory grows with changed values, not total workspace size.
- Pan and zoom allocate no workspace revisions.
- The 3,000-table and 1,500-relationship fixture loads, renders incrementally, imports, exports, and saves deterministically.
