# Multi-file SQL workspace implementation plan

## Objective

Replace ViewDB's single-file application boundary with a root-folder workspace that preserves SQL-containing folder hierarchy, parses files independently, resolves cross-file schema references through indexed lookups, and safely writes edits back to their owning files.

The implementation must preserve the current canvas contract by producing one combined `SchemaDocument`, while keeping every source range and generated patch scoped to its original file.

## Implementation sequence

### 1. Add workspace and source-ownership types

Files:

- Add `src/domain/workspaceTypes.ts`.
- Update `src/domain/types.ts` only where shared entity provenance or selection requires it.

Work:

- Define branded `FileId`, `FolderId`, and explorer node IDs.
- Define `WorkspaceFile`, `SqlFileFragment`, `SourceLocation`, `ExplorerNode`, `ExplorerIndex`, `WorkspaceDiagnostic`, and `SqlWorkspace`.
- Store runtime indexes as `Map` and `Set`; keep native command payloads serializable as arrays and plain records.
- Make file ownership explicit and separate from `SchemaDocument.source`.
- Add deterministic file-scoped ID helpers using normalized relative path, entity kind, qualified identity, and occurrence index.

Tests:

- Add `src/domain/workspaceTypes.test.ts` for normalized paths and deterministic, collision-free IDs.
- Verify equivalent paths produce equal IDs and duplicate declarations within one file remain distinct.

### 2. Implement native root scanning

Files:

- Add `src-tauri/src/workspace.rs`.
- Update `src-tauri/src/lib.rs` to register workspace commands.
- Update `src/platform/desktop.ts` with the folder dialog and typed command wrapper.

Work:

- Add `open_workspace(root_path)` returning root identity plus a flat list of SQL file records.
- Traverse directories iteratively, do not follow directory symlinks, and match `.sql` case-insensitively.
- Exclude `workspace.sql-erd.json`, ViewDB temporary files, and timestamped backup files.
- Return normalized relative paths, source, SHA-256 hash, modification time, and per-file read errors.
- Read files with bounded concurrency while sorting final results independently of completion order.
- Return a clear error when no SQL file path exists under the root.

Tests:

- Add Rust fixtures for nested folders, empty branches, uppercase extensions, symlinks, ignored files, and unreadable files.
- Assert deterministic relative-path results across repeated scans.

### 3. Build the pruned, naturally sorted explorer index

Files:

- Add `src/domain/explorerIndex.ts`.
- Add `src/domain/explorerIndex.test.ts`.

Work:

- Convert the scanner's flat SQL file list into `nodesById`, `childrenByFolderId`, `fileByRelativePath`, and `rootNodeIds`.
- Create only ancestor folders of included SQL files, which prunes empty subtrees by construction.
- Precompute natural sort keys and sort each child list once: folders first, files second, case-insensitive natural name, normalized relative-path tie-breaker.
- Add iterative visible-row flattening from `expandedFolderIds`.
- Add search projection that keeps ancestor folders for matching file names and relative paths.

Tests:

- Cover exact hierarchy preservation, recursive pruning, `file2` before `file10`, case ties, stable tie-breaking, expansion, and search ancestor retention.
- Add a large-tree test proving flattening visits visible nodes rather than every hidden descendant.

### 4. Split parsing into file fragments and global linking

Files:

- Refactor `src/domain/parser.ts` without changing the public behavior of `parseSchema`.
- Add `src/domain/workspaceParser.ts`.
- Extend `src/domain/parser.test.ts`.
- Add `src/domain/workspaceParser.test.ts`.

Work:

- Extract `parseSchemaFragment(source, dialect, fileIdentity)` from the existing parser.
- Export a stable fragment representation containing declarations, custom types, standalone-index intents, unresolved references, and file-local diagnostics.
- Namespace all parsed entity IDs with the file identity.
- Retain `parseSchema` as a one-fragment compatibility wrapper for existing tests and example loading.
- Build global symbol maps once for qualified tables, custom types, and per-table columns.
- Resolve foreign keys, standalone indexes, and custom-type usages through those maps.
- Emit diagnostics for duplicate qualified declarations, missing references, and ambiguous unqualified references.
- Produce one deterministic combined `SchemaDocument` plus `entitySourceById` and forward/reverse file dependency adjacency sets.
- Run Tarjan strongly connected components and expose the condensed dependency order for validation, without using it in the explorer.

Tests:

- Cover PostgreSQL and MySQL fragments, cross-folder foreign keys, PostgreSQL custom types, standalone indexes in separate files, duplicates, missing targets, ambiguous names, cycles, deterministic results under shuffled fragment order, and single-file compatibility.

### 5. Add bounded parse orchestration and progress

Files:

- Add `src/domain/workspaceLoader.ts`.
- Add `src/domain/workspaceLoader.test.ts`.
- Update the existing worker entry points or add `src/domain/workspace-parser.worker.ts` if measurement shows main-thread parsing exceeds the responsiveness budget.

Work:

- Orchestrate scan results through bounded concurrent fragment parsing.
- Preserve deterministic fragment and diagnostic order.
- Report `scanning`, `parsing n/total`, `resolving`, and `arranging` progress states.
- Cache fragments by `(fileId, contentHash, dialect)` so unchanged files can be reused on reload.
- Keep the worker boundary optional behind the loader interface; do not duplicate parsing logic.

Tests:

- Verify concurrency never exceeds the configured bound, progress is monotonic, completion order does not affect output, and cached fragments are reused.

### 6. Introduce workspace state at the application boundary

Files:

- Update `src/App.tsx`.
- Update `src/components/Toolbar.tsx`.
- Add `src/components/DialectWorkspaceDialog.tsx` if aggregate detection is ambiguous.
- Update `src/state/uiStore.ts`.

Work:

- Replace the active `FileIdentity` with `SqlWorkspace` state while retaining example/single-file compatibility during migration.
- Change Open to **Open Folder** and load the combined document once resolution finishes.
- Aggregate dialect validation across readable files; auto-select only an unambiguous dialect and otherwise require a PostgreSQL/MySQL choice before schema parsing.
- Store `selectedFileId`, `expandedFolderIds`, explorer search text, and loading progress in appropriate state boundaries.
- Run initial auto-layout exactly once after the combined workspace is ready.
- Preserve undo/redo for combined schema operations.

Tests:

- Add component/state tests for unambiguous detection, explicit dialect choice, cancellation, loading progress, and one layout request.

### 7. Add the virtualized SQL file explorer

Files:

- Add `src/components/FileExplorer.tsx`.
- Add `src/components/FileExplorer.test.tsx` if the current test stack supports component rendering; otherwise test projections in the domain layer.
- Update `src/components/WorkspaceSidebar.tsx`.
- Update `src/styles.css`.

Work:

- Add a Files section using the indexed flat visible-row projection and fixed-height virtualization.
- Render folder disclosure, file/folder icons, dirty marker, diagnostic count, selection state, and per-file table count.
- Keep the scanned hierarchy and deterministic order; do not support drag ordering.
- On file selection, reveal ancestors, set the new-object destination, and highlight owned tables without filtering the canvas.
- Add file/path search with ancestor context.
- Reuse the existing minimal scrollbar styling.

Tests:

- Verify expansion, selection, row range calculation, search, status badges, and that selecting a file does not remove other tables from the canvas.

### 8. Connect canvas highlighting and new-object destinations

Files:

- Update `src/components/DiagramCanvas.tsx`.
- Update `src/components/WorkspaceSidebar.tsx`.
- Update `src/domain/schemaActions.ts`.
- Extend `src/domain/schemaActions.test.ts`.

Work:

- Derive the selected file's table IDs from `entitySourceById` and render a restrained highlight without rebuilding canvas geometry.
- Route new tables, custom types, indexes, and constraints to `selectedFileId`.
- When no file is selected, show an inline searchable file choice before creating the object.
- Route a new relationship to its foreign-key/source-side file.
- Mark only affected file IDs dirty for every operation.

Tests:

- Cover destination selection for each entity kind, relationship ownership, delete ownership, dirty-file tracking, and highlight derivation.

### 9. Generate SQL patches per owning file

Files:

- Refactor `src/domain/schemaActions.ts` and `src/domain/operations.ts` to expose file-scoped patch planning.
- Add `src/domain/workspaceSql.ts`.
- Add `src/domain/workspaceSql.test.ts`.

Work:

- Generate patches from the combined document while filtering source edits by owning file.
- Keep target-table lookup global so cross-file relationships generate correct qualified references.
- Validate ranges against the owning fragment only.
- Use `Set` membership and shared workspace/schema indexes; never rescan every table for every file.
- Sort patches by descending start offset, reject overlaps, and apply each file's patches with one pieces-and-join pass.
- Return `Map<FileId, GeneratedFile>` only for dirty files.

Tests:

- Cover changes spanning several files, cross-file relationships, new/deleted objects, custom types, indexes, constraints, overlapping-patch rejection, untouched-source preservation, and PostgreSQL/MySQL quoting.

### 10. Implement preflighted multi-file save with recovery

Files:

- Extend `src-tauri/src/workspace.rs`.
- Update `src/platform/desktop.ts`.
- Update `src/App.tsx` save handling.

Work:

- Add `save_workspace_files` accepting generated source, original hash, path, and dialect for every dirty file.
- Validate every generated source and compare every on-disk hash before creating backups or writing.
- Abort the whole save when any preflight fails.
- Create all backups and flushed temporary files before replacing destinations.
- Replace destinations atomically one at a time and track completed replacements.
- On failure, restore replaced files from backups where possible and return a structured recovery report.
- Update frontend fragment sources/hashes and clear dirty IDs only after complete success.

Tests:

- Add Rust tests for validation failure, one external conflict among several files, backup failure, temporary-write failure, partial replacement, successful restoration, incomplete restoration reporting, successful save, and cleanup.

### 11. Move metadata ownership to the workspace root

Files:

- Update `src/platform/metadata.ts`.
- Update metadata commands in `src-tauri/src/workspace.rs` and `src-tauri/src/lib.rs`.
- Add or extend metadata tests.

Work:

- Read and write `<root>/workspace.sql-erd.json` once per workspace.
- Key table visuals by file-scoped stable identity rather than name plus array fallback.
- Persist table positions/colors/collapse state, areas, and notes.
- Migrate legacy single-file metadata when opening a one-file root, but do not silently match ambiguous duplicate table names.

Tests:

- Cover duplicate table names in different files, reordered parse results, metadata round trips, and safe legacy migration.

### 12. Add diagnostics navigation and failure isolation

Files:

- Update `src/components/WorkspaceSidebar.tsx` and/or add `src/components/WorkspaceDiagnostics.tsx`.
- Update `src/components/SqlPreview.tsx` to accept file-local content and ranges.
- Update `src/state/uiStore.ts`.

Work:

- Group diagnostics by file and keep unreadable/invalid files visible.
- Selecting a diagnostic reveals and selects its file, highlights its entity when available, and opens the file-local SQL range.
- Ensure one malformed fragment cannot suppress valid files or relationships unrelated to it.

Tests:

- Cover file reveal, entity selection, source-range navigation, unreadable-file diagnostics, and partial workspace loading.

### 13. Verify target-scale performance and regressions

Files:

- Add deterministic fixtures/helpers under `src/domain/testFixtures/` or test-local generators.
- Extend relevant performance-oriented tests.

Work:

- Generate 80 files containing about 3,000 tables and 1,500 cross-file relationships.
- Assert deterministic IDs, tree ordering, relationship output, and one layout request.
- Instrument development/test builds to assert folder sorting occurs only during indexing and reference resolution uses maps rather than repeated global scans.
- Confirm explorer flattening is proportional to visible rows.
- Review memory ownership so original SQL is stored once per fragment and large derived arrays are not duplicated in React state.

Verification commands:

- `npm test`
- `npm run build`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm run tauri build`

## Change boundaries

- Preserve existing single-file parser behavior through the `parseSchema` compatibility wrapper.
- Do not change canvas layout or relationship-routing algorithms except to consume the combined workspace and file highlight set.
- Do not add filesystem watching, manual file ordering, dependency-order display, file management, mixed dialects, or workspace export.
- Do not concatenate SQL sources or convert file-local offsets into one synthetic global offset space.
- Do not write any file until all dirty files pass validation and external-change preflight.
- Keep runtime indexes out of serialized workspace metadata.

## Completion criteria

- Open Folder imports every readable SQL file under one root and removes non-SQL branches from the explorer.
- Folder hierarchy and natural folder-first ordering are deterministic.
- Cross-file relationships and custom types resolve through indexed global lookups.
- The canvas displays the complete workspace; file selection highlights rather than filters.
- New objects are assigned to the selected file, with an inline file choice when necessary.
- Every edit generates SQL only for its owning file, and Save writes only dirty files.
- Any validation or external-change conflict prevents all writes.
- Multi-file replacement failures produce a structured restoration report.
- Workspace metadata persists at the root with file-scoped stable identities.
- PostgreSQL, MySQL, frontend, Rust, and synthetic target-scale tests pass.
