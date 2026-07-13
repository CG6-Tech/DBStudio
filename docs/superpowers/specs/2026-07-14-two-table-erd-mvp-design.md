# Two-Table PostgreSQL ER Editor MVP

## Purpose

Build a minimal but complete desktop application that validates the final architecture for a PostgreSQL ER editor. The MVP opens with a bundled two-table example, can open one local SQL file, renders two related tables, supports a deliberately narrow set of edits, previews the resulting SQL, and saves it safely.

The implementation must exercise the intended production boundaries rather than substitute temporary technologies that would later be discarded.

## Scope

### Included

- Tauri 2 desktop shell with a Rust backend.
- React and TypeScript application interface.
- PixiJS 8 ER-diagram canvas.
- RBush spatial indexing.
- ELK.js layout in a Web Worker.
- Zustand for UI state only.
- A custom canonical schema model and operation store.
- PostgreSQL parsing through Rust-side `pg_query`/`libpg_query`.
- A bundled `users` and `orders` schema with one foreign-key relationship.
- Native selection of one local `.sql` file.
- Parsing of `CREATE TABLE` statements, columns, primary keys, and single-column foreign keys.
- Pan, zoom, selection, and fit-to-diagram controls.
- Inspector editing of table names, column names, data types, and nullability.
- Undo and redo for supported edits.
- Pending-change and SQL previews.
- Reparse validation, timestamped backup, and atomic save.
- Detection of external changes before saving.

### Excluded

- Opening a folder or multi-file workspace.
- Adding or deleting tables, columns, keys, indexes, or relationships.
- Composite foreign keys.
- Schema moves and cross-file dependency resolution.
- Global search, validation dashboards, conflict resolution, and file watching.
- Persistent diagram metadata.
- Large-workspace virtualization and performance benchmarking.
- Full-file normalization or regeneration.

Unsupported SQL is retained unchanged. The interface identifies unsupported constructs and prevents visual editing of those constructs.

## Architecture

### Rust backend

The Tauri backend owns all filesystem and PostgreSQL parser operations. Its commands provide:

- access to the bundled example;
- a native SQL file picker;
- file reading with content hash and modification metadata;
- PostgreSQL parsing and normalized parser output;
- validation of generated SQL;
- external-change checks;
- timestamped backup creation; and
- temporary-file writing followed by atomic replacement.

The backend never accepts an unvalidated save payload. It reparses the proposed SQL before writing it.

### React shell

React renders the toolbar, status indicators, diagnostics, inspector, change preview, and save controls. It does not render ER table cards or relationship lines.

Zustand contains only interface state: current selection, viewport state, open panels, active file metadata, dirty/save status, diagnostics, and preferences.

### Canonical schema and operations

The TypeScript schema engine holds normalized maps for tables, columns, constraints, and relationships. Each parsed object receives an internal stable ID derived from its source binding for the lifetime of the opened document. Names remain editable properties rather than identities.

Supported edits are commands containing the target ID, previous value, new value, affected source binding, revision, and inverse command. Applying a command updates the canonical model, the change preview, and only the affected canvas object. Undo and redo execute the corresponding inverse or original command.

### Diagram canvas

PixiJS renders table cards, column rows, ports, and the relationship. RBush indexes table bounds and supplies visible objects to the renderer. Although only two tables are present, the projection boundary remains the same one intended for the large editor.

An ELK.js worker computes the initial left-to-right layout and orthogonal relationship route. Manual dragging updates the model position without rerunning global layout. Pan, zoom, and fit-to-diagram are handled by a dedicated viewport controller.

## Data flow

1. The app requests the bundled example or a user-selected local file.
2. Rust reads and parses the SQL, returning the source, file metadata, parser representation, and diagnostics.
3. TypeScript converts supported statements into the canonical schema and records source bindings.
4. The ELK worker lays out both tables.
5. RBush indexes their bounds and PixiJS renders the diagram.
6. Selecting a table or column opens its React inspector.
7. An inspector edit creates and applies an operation.
8. The SQL patcher updates the affected source spans and prepares a change preview.
9. Save sends the candidate SQL and original file identity to Rust.
10. Rust verifies that the source has not changed, reparses the candidate, creates a backup, and atomically replaces the source.
11. The frontend reparses the saved file and clears the operation history and dirty state.

## SQL editing policy

The MVP uses source-bound token patches for supported property edits:

- table and column rename;
- column data-type replacement; and
- adding or removing `NOT NULL` where the source form is supported.

Patches are applied from the end of the source toward the beginning so earlier source offsets remain valid. The app preserves whitespace, comments, statement order, and all unrelated SQL text.

If source bindings are missing, overlapping, or ambiguous, the app disables saving for that edit and reports a diagnostic. It does not fall back to full statement or full file regeneration.

## Interface

The window contains:

- a top toolbar with Open, Example, Undo, Redo, Fit, Preview, and Save actions;
- a central PixiJS canvas;
- a right-side inspector for the selected table or column;
- a collapsible SQL/change preview; and
- a status area for file identity, unsaved state, parser warnings, and save results.

The bundled example loads automatically on first launch. Saving the bundled example prompts for a destination; saving an opened local file updates that file after confirmation through the normal safe-save pipeline.

## Error handling

- Parse failures show PostgreSQL error text and source location; no editable diagram is produced.
- Unsupported constructs remain in the source and appear as warnings.
- Invalid or duplicate identifiers are rejected before an operation is committed.
- A candidate that fails PostgreSQL reparse validation cannot be saved.
- If the source hash or modification metadata changed since opening, save stops and asks the user to reopen the file. Automatic merging is outside this MVP.
- Backup or atomic-write failures preserve the original file and leave the editor dirty.
- Worker failures surface a diagnostic and allow retrying layout without losing schema edits.

## Testing

### Rust tests

- Parse the bundled example and return expected statements.
- Reject invalid candidate SQL.
- Detect a changed source file.
- Create a backup and atomically replace a temporary test file.
- Leave the original intact when backup or validation fails.

### TypeScript tests

- Convert the example into two tables and one relationship.
- Apply and invert rename, type, and nullability operations.
- Generate non-overlapping source patches.
- Preserve comments and unrelated statements.
- Reject ambiguous or unsupported patches.
- Index and query table bounds through RBush.
- Convert canonical objects into the ELK graph and accept layout results.

### UI and integration tests

- Select a Pixi table and display the correct inspector state.
- Edit a supported field and update the diagram and preview.
- Undo and redo the edit.
- Disable Save for validation errors or unsupported edits.
- End-to-end smoke flow: open a temporary copy of the example, rename a column, preview, save, reopen, and verify the renamed column and preserved relationship.

## Acceptance criteria

- The app launches as a Tauri desktop application and displays the bundled `users` and `orders` diagram.
- The foreign-key relationship is visible and correctly connected.
- Pan, zoom, selection, dragging, and fit-to-diagram work.
- A user can open a local SQL file containing exactly two supported related tables.
- Table names, column names, column types, and nullability can be edited through the inspector.
- Every supported edit can be undone and redone before saving.
- The preview clearly shows pending changes and candidate SQL.
- The saved SQL reparses successfully as PostgreSQL and retains unrelated source text.
- Existing files receive a timestamped backup and are replaced atomically.
- External changes are detected before overwriting a file.
- Automated tests cover the parser boundary, canonical model, operations, patching, safe save, and the principal UI flow.

## Future path

The MVP deliberately keeps production-shaped interfaces for document parsing, canonical schema storage, operations, rendering projection, layout, and safe saving. Later milestones can extend these boundaries to folder workspaces, multiple files, broader PostgreSQL syntax, structural edits, persistent layout metadata, file watching, three-way merge, and the performance targets for 3,000 tables without replacing the two-table sample's core architecture.
