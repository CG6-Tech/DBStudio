# MySQL Support Implementation Plan

## Objective

Add automatically detected, user-correctable MySQL schema support without regressing PostgreSQL or weakening safe saves.

## Tasks

1. Add `SqlDialect` to the shared frontend document identity and propagate it through example loading, file opening, parsing, reparsing, and saving.
2. Add Rust dialect serialization, PostgreSQL/MySQL validation, deterministic detection, combined open errors, and dialect-specific save validation.
3. Extend the source tokenizer for backtick identifiers and update the parser to ignore MySQL index definitions, preserve MySQL clauses, and accept an explicit dialect.
4. Make identifier quoting and every SQL-generation path dialect-aware.
5. Add a compact toolbar dialect selector and reparse generated SQL when the user corrects the dialect.
6. Add frontend tests for MySQL parsing, relationships, indexes, and quoting; add Rust tests for validation, detection, and save behavior.
7. Run `npm test`, `npm run build`, `cargo test`, and the Tauri application build; verify a representative MySQL schema in the native app when automation is available.

## Change Boundaries

- Preserve the uncommitted area interaction work in `DiagramCanvas.tsx` and its new geometry files.
- Do not add dump/procedure/trigger modeling or a visual index editor.
- Do not normalize or rewrite untouched MySQL source clauses.
- Keep ambiguous portable DDL defaulting to PostgreSQL.

## Completion Criteria

- A common MySQL two-table schema opens with the correct detected dialect, tables, fields, and relationship.
- Visual renames/additions generate MySQL backticks when required.
- Save validates using the selected dialect and retains backups/conflict detection.
- Existing PostgreSQL tests and behavior pass unchanged.
