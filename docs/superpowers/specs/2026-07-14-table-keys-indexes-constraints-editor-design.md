# Table Keys, Indexes, and Constraints Editor Design

## Goal

Finish the compact table editor with consistent spacing and deletion controls, clear database-key semantics, and SQL-backed editing for indexes and check constraints.

## Layout and Spacing

- Keep the 46-pixel compact table header and one expanded table.
- Add 8 pixels between the header and Fields content.
- Add 10 pixels before the Indexes and Check Constraints sections.
- Each section uses a 34-pixel disclosure header and an 8-pixel internal content gap.
- Field, index, and constraint rows use the same separators, hover treatment, and 34-pixel minimum height.
- The measured expanded height continues to drive virtualization.

## Field State Controls

- Replace `N` with an `NN` toggle representing `NOT NULL`. The active state means `nullable === false`.
- Replace `K` with a Lucide key icon and compact `PK` label. It toggles the column's primary-key state.
- Show a second key/link icon with `FK` when the column is the source or target of a relationship.
- Clicking `FK` switches to the Relationships panel and preselects the relationship involving that field.
- PK columns remain not-null. Disabling PK does not automatically make the column nullable.
- All controls retain accessible labels and visible keyboard focus.

## Delete Controls

- Use the same Lucide `Trash2` icon button for tables, fields, indexes, and check constraints.
- Destructive controls use one shared size, hover background, foreground color, tooltip, and focus treatment.
- Field delete remains revealed on row hover or keyboard focus.
- Index and constraint delete remains visible inside their expanded editor rows.

## Index Model and Editing

Add a SQL-backed table index model containing:

- stable ID;
- optional name;
- ordered column IDs;
- unique flag;
- index method for PostgreSQL (`btree`, `hash`, `gist`, `spgist`, `gin`, or `brin`);
- source range when parsed from SQL;
- new/edited state for regeneration.

The Indexes section supports add, rename, unique toggle, method selection, ordered column selection, and delete. PostgreSQL generation uses `CREATE [UNIQUE] INDEX ... ON ... USING ... (...)`. MySQL generation uses table-level `[UNIQUE] KEY ... (...)`; unsupported PostgreSQL methods are not shown for MySQL.

## Check Constraint Model and Editing

Add a SQL-backed check-constraint model containing:

- stable ID;
- optional name;
- SQL expression without the outer `CHECK (...)` wrapper;
- source range when parsed;
- new/edited state for regeneration.

The Check Constraints section supports add, name editing, expression editing, and delete. Generated SQL uses optional `CONSTRAINT name CHECK (expression)` syntax for both supported dialects.

## Parsing and SQL Generation

- Parse table-level PostgreSQL and MySQL index/key definitions already inside `CREATE TABLE` statements.
- Parse standalone PostgreSQL `CREATE INDEX` statements associated with known tables.
- Parse named and unnamed table-level `CHECK` constraints.
- Parsed indexes and constraints populate their corresponding table models.
- Any index or check edit marks the owning table structural when it is table-level.
- Structural table regeneration includes columns, relationships, table-level indexes, and check constraints.
- Standalone PostgreSQL indexes are regenerated after the owning table and their original source ranges are replaced or removed safely.
- SQL expression text is preserved verbatim unless edited.

## Relationship Navigation

Extend shared UI state with an optional relationship-focus request containing the relationship ID and originating column ID. Clicking an FK badge activates the Relationships panel and focuses the matching relationship row. It does not mutate schema state or history.

## Failure Handling

- An index with no selected columns is kept in the editor but omitted from generated SQL and reported as a diagnostic.
- An empty check expression is kept in the editor but omitted from generated SQL and reported as a diagnostic.
- A relationship removed elsewhere immediately removes its FK indicator.
- Deleting a column also removes it from indexes; indexes left without columns remain editable and invalid until repaired or deleted.
- Unsupported or unrecognized index syntax remains preserved in source when no structural table rewrite is required.

## Verification

Per user request, do not run frontend or Rust test suites for this change. Build the macOS application with the normal Tauri production command, which performs the required TypeScript/Vite compilation before packaging.

## Scope

This phase covers compact spacing, NN/PK/FK controls, consistent delete styling, structured index editing, structured check-constraint editing, SQL parsing/generation, and relationship navigation. Broader constraint types, partial indexes, expression indexes, covering columns, deferrability, and foreign-key mutation from the field row remain outside this phase.
