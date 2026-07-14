# Multi-file SQL workspace design

## Goal

Allow ViewDB to open a root folder as one PostgreSQL or MySQL workspace, preserve its SQL-file hierarchy in an explorer, resolve schema objects across files, and safely save edits back to the files that own them.

The target workspace contains roughly 80 SQL files, 3,000 tables, and 1,500 relationships. The design must remain deterministic and responsive at that scale.

## Scope

This phase includes:

- Selecting a root folder and scanning its SQL files.
- Preserving the folder hierarchy while pruning branches without SQL files.
- A virtualized file explorer with deterministic ordering, selection, search, status, and diagnostics.
- One SQL dialect per workspace.
- Per-file parsing followed by global cross-file reference resolution.
- Source ownership for tables, fields, relationships, custom types, indexes, and constraints.
- Editing combined schema objects and saving only affected SQL files.
- Workspace-level diagram metadata.

This phase excludes:

- Manual file or folder ordering.
- Renaming, moving, creating, or deleting files and folders from ViewDB.
- Mixed-dialect workspaces.
- Dependency-based explorer ordering.
- Save All As and workspace export.

## User-visible behavior

### Opening a workspace

The primary Open action becomes **Open Folder**. The user selects a root folder, and ViewDB treats it as one workspace. The workspace header displays the root folder name and selected dialect.

The scan includes files with a case-insensitive `.sql` extension. It preserves their relative folder hierarchy exactly, except that any folder whose complete subtree contains no SQL file is removed from the explorer.

ViewDB does not follow directory symlinks. It skips its own metadata file, temporary save files, and timestamped backup files. An unreadable SQL file appears in the explorer with an error and does not prevent other files from loading.

### Explorer ordering

Within every folder, children use this stable order:

1. Folders.
2. SQL files.
3. Natural, case-insensitive name order, so `file2.sql` precedes `file10.sql`.
4. Normalized relative path as the deterministic tie-breaker.

The explorer never uses SQL dependency order and does not support manual reordering.

### Explorer interaction

Selecting a SQL file:

- Keeps the complete workspace visible on the canvas.
- Highlights the tables owned by that file.
- Makes that file the destination for newly created schema objects.
- Expands and reveals its ancestor folders.

If the user creates a table or custom type without a selected file, ViewDB opens an inline file selector before creation.

Explorer rows show an icon, name, dirty state, diagnostic count, selection state, and table count for SQL files. Search matches names and relative paths and retains ancestor folders around matching results.

## Architecture

The application boundary changes from one `OpenedDocument` to one `SqlWorkspace`. The existing canvas continues to consume one combined `SchemaDocument`, isolating most canvas, layout, selection, and editing code from the multi-file implementation.

```text
Root folder scan
      |
Pruned and indexed explorer tree
      |
Independent SQL file fragments
      |
Global symbol index and reference resolution
      |
Combined SchemaDocument for the canvas
```

### Workspace model

```ts
interface SqlWorkspace {
  rootPath: string;
  dialect: SqlDialect;
  explorer: ExplorerIndex;
  fragmentByFileId: Map<FileId, SqlFileFragment>;
  combinedDocument: SchemaDocument;
  entitySourceById: Map<EntityId, SourceLocation>;
  dependenciesByFileId: Map<FileId, Set<FileId>>;
  dependentsByFileId: Map<FileId, Set<FileId>>;
  dirtyFileIds: Set<FileId>;
}

interface SqlFileFragment {
  fileId: FileId;
  relativePath: string;
  source: string;
  originalHash: string;
  modifiedMs: number | null;
  tables: Table[];
  customTypes: CustomType[];
  unresolvedReferences: PendingReference[];
  diagnostics: Diagnostic[];
}

interface SourceLocation {
  fileId: FileId;
  range: SourceRange;
}
```

Entity IDs incorporate the normalized relative source path, entity kind, qualified identity, and the entity's occurrence index within that file. This prevents collisions across files and between duplicate declarations while remaining deterministic across asynchronous parsing. Source ranges remain file-local.

### Explorer index

```ts
interface ExplorerIndex {
  nodesById: Map<NodeId, ExplorerNode>;
  childrenByFolderId: Map<FolderId, readonly NodeId[]>;
  fileByRelativePath: Map<string, FileNode>;
  rootNodeIds: readonly NodeId[];
}
```

The UI stores expanded folders in `Set<FolderId>`. It derives visible rows with an iterative depth-first traversal and renders them through fixed-row-height virtualization. Folder children are sorted once when the scan result is indexed; renders do not repeat sorting.

## Native folder scanning

The Tauri layer owns folder selection and filesystem traversal. It performs iterative traversal rather than recursive calls, returns normalized relative paths, and does not follow directory symlinks.

The scan builds the tree bottom-up. A folder node is retained only if it directly contains a SQL file or has at least one retained child folder. This prunes irrelevant branches in `O(N)` after directory enumeration.

The native result includes file path, relative path, content, content hash, modification time, and any read error. Reading may use bounded concurrency, but results are normalized and sorted independently of completion order.

## Dialect selection

A root folder is a single-dialect workspace. ViewDB samples every readable SQL file with both dialect validators. It automatically selects a dialect only when the aggregate result is unambiguous. Otherwise, it shows a PostgreSQL/MySQL choice before schema parsing, defaulting to the dialect currently selected in ViewDB. Every fragment is then parsed using that one selected dialect.

Files that are invalid or strongly indicate the other dialect receive file diagnostics. They remain visible but do not silently change the workspace dialect.

## Parsing and global resolution

Import uses two phases.

### Phase 1: independent fragments

Each file is tokenized and parsed independently. Its declarations, local diagnostics, unresolved foreign keys, and source ranges remain associated with its `fileId`. Parsing may run through a small bounded worker pool. Fragment output is deterministic regardless of worker completion order.

### Phase 2: global linking

ViewDB builds these lookup structures in linear time:

```ts
tableByQualifiedName: Map<string, Table>
customTypeByQualifiedName: Map<string, CustomType>
columnByNameByTable: Map<TableId, Map<string, Column>>
entitySourceById: Map<EntityId, SourceLocation>
```

Foreign keys, custom-type usages, and standalone indexes resolve through the maps instead of scanning table arrays. Schema-qualified names resolve exactly. Unqualified names use the selected dialect's existing search rules.

Duplicate qualified declarations are errors on every conflicting file. Missing or ambiguous targets remain unresolved and produce diagnostics. A malformed file cannot suppress valid declarations from other files.

### Dependency graph

Cross-file references populate forward and reverse adjacency sets:

```ts
dependenciesByFileId: Map<FileId, Set<FileId>>
dependentsByFileId: Map<FileId, Set<FileId>>
```

Tarjan's strongly connected components algorithm identifies cycles in `O(V + E)`. The resulting condensation graph may be topologically sorted for validation and future export. It never changes explorer ordering.

Content hashes allow a future reload path to reuse unchanged fragments and relink only changed declarations and affected dependents. The first implementation must preserve the fragment boundary and indexes needed for that optimization, even if full filesystem watching is deferred.

## Editing and source ownership

Every editable schema entity has one owning `fileId`. Editing an existing entity updates the combined document and marks its owning file dirty.

Ownership rules are:

- Existing tables, columns, custom types, indexes, and constraints remain in their original files.
- New schema objects use the selected SQL file.
- A new relationship is written on its foreign-key/source side.
- Deleting an object removes its source statement or definition from its owning file.
- Cross-file references do not transfer ownership of either endpoint.

SQL generation runs independently for each dirty fragment using file-local source ranges. Patches for a file are validated, ordered by descending source offset, and applied in one pieces-and-join pass so offsets do not shift while editing.

## Safe multi-file save

Save writes only dirty files and behaves as a transaction as far as the filesystem permits:

1. Generate SQL for every dirty file.
2. Validate every generated file with the workspace dialect.
3. Re-read every dirty path and compare it with the imported hash.
4. If any validation or external-change check fails, write nothing.
5. Create a timestamped backup for every existing dirty file.
6. Write and flush a temporary file beside every destination.
7. Atomically rename temporary files into their destinations.
8. Update hashes and clear dirty state only after every replacement succeeds.

Multiple independent renames cannot form a true filesystem transaction. If final replacement fails partway through, ViewDB performs best-effort restoration from backups and reports which files were restored and which require manual attention. Temporary files are cleaned up on success and on recoverable failure.

## Workspace metadata

Diagram metadata is stored once at the selected root as `workspace.sql-erd.json`. Visual state uses stable qualified entity identities that include relative file ownership, rather than matching tables by array position.

The metadata includes table positions, colors, collapsed state, areas, and notes. Moving a SQL file outside ViewDB may prevent its old visual identity from matching until file-move support is introduced.

## Loading and diagnostics

Loading reports four stages:

1. Scanning files.
2. Parsing `n / total`.
3. Resolving references.
4. Arranging the canvas.

Diagnostics are grouped by file. Selecting a diagnostic selects its file, reveals it in the explorer, and highlights the associated table or column when an entity ID is available. The SQL editor receives the file and file-local source range.

Initial auto-layout runs once after global resolution completes, not once per fragment.

## Complexity and performance

For `F` filesystem entries, `S` total SQL bytes, `T` tables, `C` columns, and `R` references:

- Scan and prune: `O(F)`.
- Sorting: `O(sum(k_i log k_i))` across folder child lists.
- Parsing: `O(S)` under the existing tokenizer/parser model.
- Symbol indexing: `O(T + C)`.
- Reference resolution: expected `O(R)` map lookups.
- Dependency cycle detection: `O(files + dependency edges)`.
- Explorer flattening: `O(visible rows)` when expansion or search changes.

The feature targets responsive use with 80 files, 3,000 tables, and 1,500 relationships. No render path may rescan all schema columns or resort the explorer tree.

## Error handling

- A root with no SQL files produces a clear empty-workspace error.
- An unreadable file remains visible with a file diagnostic.
- An invalid file does not block valid fragments.
- Duplicate and ambiguous declarations remain unresolved and identify every involved file.
- External file changes block the entire save before writing begins.
- Mid-save failure triggers restoration and a detailed recovery report.
- Symlinks are not traversed, preventing cycles and scope escape.

## Testing

### Native tests

- Root scanning and relative-path normalization.
- Case-insensitive SQL extension matching.
- Empty-folder and empty-subtree pruning.
- Symlink exclusion.
- Unreadable-file reporting.
- Stable natural ordering.
- Multi-file conflict detection, backup creation, and restoration behavior.

### Domain tests

- Stable file-scoped entity IDs.
- Cross-file foreign keys and PostgreSQL custom types.
- Cross-folder references.
- Duplicate, missing, and ambiguous declarations.
- Dependency graph construction, cycles, and condensation ordering.
- Entity-to-source ownership for every editable entity kind.
- File-local patch generation.
- PostgreSQL and MySQL workspaces.

### UI tests

- Expand/collapse and hierarchy preservation.
- Fixed-height row virtualization.
- Search results with ancestor context.
- File selection, highlighting, and new-object destination.
- Dirty and diagnostic badges.
- Loading progress and partial-file failures.

### Performance fixture

A deterministic synthetic fixture contains 80 files, approximately 3,000 tables, and 1,500 cross-file relationships. It verifies stable output, bounded explorer rows, one global layout request, and the absence of repeated full-schema scans in the import and render paths.

## Acceptance criteria

- A user can select a root folder and see only SQL-containing branches in their original hierarchy.
- Explorer ordering is stable, natural, folder-first, and independent of dependency order.
- One workspace uses one explicit PostgreSQL or MySQL dialect.
- Tables and relationships spanning files appear together on the canvas.
- Selecting a file highlights rather than filters its tables.
- New objects go to the selected file, with an inline file choice when none is selected.
- All edits save back to the correct source files.
- Any preflight conflict prevents all writes.
- Diagram metadata persists at workspace root using stable entity identities.
- The synthetic target workspace imports and remains interactively usable.
