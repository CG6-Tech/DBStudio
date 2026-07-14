# Workspace recovery and hidden metadata design

## Goal

Make multi-file workspace saves recoverable without leaving permanent `.bak-*` files beside SQL files. Store ViewDB workspace metadata and temporary recovery data in a single hidden workspace directory.

## Scope

This design changes multi-file workspace saves and workspace metadata storage. Single-file SQL saves keep their existing behavior. Existing `.bak-*` files are not deleted automatically.

## Workspace structure

ViewDB stores workspace-owned files under:

```text
<workspace>/.viewdb/
  sql-erd.json
  recovery/
    <transaction-id>/
      schema/users.sql
      schema/orders.sql
      .viewdb/sql-erd.json
```

Each recovery transaction mirrors the workspace-relative path of every protected file. The transaction ID combines a timestamp with a UUID. Mirrored paths prevent collisions when different folders contain files with the same name.

All workspace and recovery paths are derived from the canonical workspace root. A path that cannot be represented safely beneath that root aborts the save before any write occurs.

## Metadata migration

New workspaces read and write `<workspace>/.viewdb/sql-erd.json`.

When loading an existing workspace, ViewDB checks the new path first and then falls back to `<workspace>/workspace.sql-erd.json`. On the next successful workspace save, ViewDB writes the metadata to the new path and deletes the legacy file. If migration fails, the legacy file remains untouched and the error is reported.

## Transaction boundary

The frontend sends the modified SQL files and current ERD metadata JSON in one workspace-save request. The Rust backend owns the complete transaction so SQL and metadata cannot be reported as successfully saved in inconsistent states.

The backend performs these steps:

1. Validate every modified SQL file.
2. Check every modified file for external changes using its original hash.
3. Resolve and validate all workspace-relative paths.
4. Create `.viewdb/recovery/<transaction-id>/`.
5. Copy every modified SQL file and any existing current or legacy metadata file into the recovery transaction, preserving relative paths.
6. Write all replacement SQL content to sibling temporary files and the metadata to a temporary file inside `.viewdb`.
7. Flush all temporary files before replacing destinations.
8. Atomically replace the modified SQL files and `.viewdb/sql-erd.json`.
9. Delete the legacy root metadata after the new metadata is safely installed.
10. Delete the complete recovery transaction after every replacement and migration step succeeds.
11. Remove `.viewdb/recovery/` when it is empty.

Only modified SQL files are included. A preflight failure occurs before the recovery directory or temporary files are created.

## Failure and cleanup behavior

If a replacement or metadata migration step fails, ViewDB attempts to restore every replaced file in reverse replacement order. The recovery transaction is retained whether rollback succeeds or fails, and the error includes its absolute path for manual recovery.

Recovery transactions from failed saves are never deleted automatically. Successful saves leave no transaction backups behind.

If the workspace save succeeds but deletion of its recovery transaction fails, ViewDB reports a cleanup warning while preserving the successful-save result. It must not misreport the schema save as failed.

## Interfaces and data structures

- Extend the workspace-save request with the serialized metadata document.
- Return a structured result containing saved-file hashes and timestamps plus an optional cleanup warning.
- Represent prepared replacements as an ordered vector. Each entry contains its destination, temporary path, recovery path, and replacement state.
- Use workspace-relative paths as stable recovery keys and a set to reject duplicate destinations.
- Keep rollback order deterministic by iterating the prepared replacement vector in reverse.

The single backend transaction command owns recovery creation, replacement, rollback, cleanup, and legacy metadata migration. The frontend updates its in-memory workspace only after this command succeeds.

## Verification

Verification should cover:

- A successful multi-file save leaves no recovery transaction.
- A replacement failure restores original SQL and metadata and retains recovery files.
- A rollback failure reports both the save error and the recovery directory.
- Files with identical names in different subfolders have distinct recovery paths.
- Metadata loads from the new path before falling back to the legacy path.
- Successful migration writes `.viewdb/sql-erd.json` and removes the legacy file.
- Failed migration leaves the legacy metadata intact.
- An external-change conflict creates no backup or temporary file.
- Unsafe or duplicate paths are rejected before writes.
- Recovery cleanup failure returns a warning without converting a completed save into a failure.

Do not automatically run tests or build the macOS app during implementation unless the user requests it.
