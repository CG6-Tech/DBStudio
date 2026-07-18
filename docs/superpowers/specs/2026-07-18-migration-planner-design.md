# DBStudio Migration Planner Design

## Objective

Add a migration planner that compares a desired schema with a target schema, explains the differences, orders changes safely, and exports migration SQL without executing it.

The planner supports four input combinations:

- current edited DBStudio schema to its original schema;
- SQL workspace to SQL workspace;
- live database to SQL workspace, in either direction;
- live database to live database, including Development to Production.

Every comparison has an explicit **Desired -> Target** direction. The generated plan changes Target to match Desired. Users can swap the direction before comparison.

Version one plans and exports migrations only. Database execution is outside this design and must be introduced later as a separate safety-focused project.

## Product Workflow

The Migration Planner is a new workspace sidebar section with five stages.

### 1. Choose Inputs

Desired and Target can each be:

- the current edited schema;
- a local SQL workspace;
- a saved PostgreSQL or MySQL connection profile.

A swap control reverses Desired and Target. Live inputs show environment, host, database, engine, and server version prominently. Production targets retain a persistent warning throughout the workflow.

### 2. Compare

Each input is converted into the same normalized `SchemaSnapshot`. Introspection, comparison, rename matching, and ordering run in persistent cancellable workers. Stale results are discarded through generation tokens.

### 3. Review Plan

The plan groups changes into:

- Safe;
- Review required;
- Blocked destructive;
- Suggested renames.

Each step shows its object, reason, dependencies, risk, reversibility, and generated SQL. Rename candidates remain suggestions until accepted or rejected.

### 4. Configure Strategy

The user chooses Standard, Low-lock, or Expand/contract. Destructive operations require individual approval. Required columns and transformations require backfill expressions or an explicit manual checkpoint.

### 5. Export

The planner exports:

- ordered migration SQL;
- a portable JSON plan report containing source fingerprints, decisions, approvals, risks, and unresolved items.

Export is disabled while required rename decisions, destructive approvals, backfills, or unsupported transformations remain unresolved. Importing or applying a plan is one undoable workspace operation where applicable.

## Architecture

All input types converge on a normalized snapshot and one comparison pipeline:

```text
Edited schema ----+
SQL workspace ----+--> SchemaSnapshot --> Diff --> Rename resolution
PostgreSQL -------+                         |             |
MySQL ------------+                         +--> Risk --> Dependency graph
                                                        |
                                                        +--> Strategy --> SQL/report
```

The core modules are:

- `migration-snapshot`: normalized records, source fingerprints, string interning, and snapshot caches;
- `migration-introspection`: PostgreSQL and MySQL catalog adapters;
- `migration-diff`: exact matching, structural comparison, typed changes, and rename candidates;
- `migration-graph`: dependencies, cycle detection, phases, and deterministic ordering;
- `migration-risk`: safety classification, compatibility checks, and approval requirements;
- `migration-strategy`: Standard, Low-lock, and Expand/contract projections;
- `migration-sql`: dialect-specific lazy SQL generation and rollback guidance;
- `migration-state`: inputs, decisions, compact approvals, revisions, cancellation, and exports;
- `migration-ui`: input selection, plan list, filters, inspector, strategy controls, and export.

Dialect adapters isolate engine-specific introspection, compatibility rules, and SQL syntax. The shared planner never compares raw SQL text.

## Snapshot Model

`SchemaSnapshot` contains:

- engine, engine version, source identity, and source fingerprint;
- schemas, tables, columns, data types, defaults, generated expressions, and identity behavior;
- primary, unique, foreign, and check constraints;
- regular indexes and their engine-specific attributes;
- enums, domains, sequences, views, routines, and triggers where supported;
- estimated object sizes and available catalog statistics;
- unsupported objects preserved as explicit unresolved records.

Objects use qualified identities and stable structural fingerprints. SQL bodies and large definitions are stored once and referenced by compact IDs. Repeated schema names, type names, and common strings are interned inside a snapshot.

Snapshots are immutable. Cache keys combine source content hashes, connection identity, engine version, and a database schema fingerprint. Presentation state and credentials never participate in structural hashes.

## Difference Model

The diff engine emits typed changes rather than text patches:

- create, drop, or rename object;
- add, remove, rename, or alter column;
- change type, default, nullability, generated expression, or identity behavior;
- add, remove, validate, or replace constraints and indexes;
- replace view, routine, or trigger definitions;
- unresolved or unsupported transformation.

Exact qualified identities are matched first. Equal structural hashes skip deep comparison. Changed hashes invoke type-specific field comparison.

### Rename Detection

Renames are never accepted automatically. Candidate generation uses blocking indexes based on:

- object kind and schema;
- column-name tokens;
- data-type signatures;
- constraints and dependency neighborhoods;
- structural fingerprints.

Only candidates sharing meaningful features are scored. The score combines name similarity, field overlap, type compatibility, constraints, and dependency context. Maximum-weight bipartite matching resolves candidates inside bounded candidate groups. Low-confidence or close competing matches remain ambiguous. The user must accept or reject each suggestion before export.

Rejecting a suggestion leaves the corresponding add and drop operations visible, including their data-loss risk.

## Algorithms And Data Structures

The implementation prioritizes deterministic output, bounded work, and compact memory use.

- Qualified identity and fingerprint maps provide expected `O(1)` lookup.
- Structural hashes avoid deep comparisons for unchanged objects.
- Inverted indexes block rename candidates and prevent all-pairs matching.
- Sparse adjacency lists represent dependencies.
- Tarjan's algorithm finds strongly connected components in `O(V + E)`.
- Kahn's algorithm orders the acyclic component graph in `O(V + E)`.
- Stable object keys break ordering ties, making output deterministic.
- SQL is generated lazily for visible steps and exports rather than stored on every graph node.
- Workers receive compact records and changed IDs, not complete React documents.
- Decisions and approvals are compact patches keyed by stable plan-step IDs.
- Large plan lists and inspectors use indexed filtering and windowed rendering.

Expected comparison cost is approximately `O(objects + dependencies + rename candidates)`. Memory is proportional to snapshot objects, sparse graph edges, and actual candidate matches. Full snapshot duplication is avoided between worker and UI state.

## Dependency Planning

Every typed change declares prerequisites and affected dependents. Representative rules include:

- remove foreign keys before changing or dropping referenced keys;
- create schemas and types before dependent tables and columns;
- create tables before indexes, constraints, views, routines, and triggers that depend on them;
- remove dependent views, routines, and constraints before destructive object changes;
- split cyclic foreign keys into table creation and later constraint phases;
- recreate dependent definitions only after their prerequisites stabilize.

Strongly connected components become explicit phases. A cycle is never broken through arbitrary array order.

## Risk Classification

Every step receives one of three classifications.

### Safe

Examples include additive objects, compatible indexes, nullable columns, and constraints whose validation is deferred safely.

### Review Required

Examples include type changes, default changes, validation scans, table rewrites, large-table indexes, lock-sensitive operations, and changes whose impact depends on unavailable statistics.

### Blocked Destructive

Examples include drops, narrowing conversions, required columns without backfills, destructive add/drop pairs, unsupported transformations, and operations with credible data-loss risk.

Blocked steps are included in the plan but excluded from export until individually approved. Approval records the user decision and optional reason. It never weakens unrelated safety checks.

Missing statistics produce conservative warnings. The planner must not imply a low-lock or low-risk result when the engine version or table characteristics are unknown.

## Deployment Strategies

### Standard

Produces direct, dependency-ordered DDL with appropriate transaction boundaries.

### Low-lock

Uses supported engine-specific techniques, including PostgreSQL concurrent index operations, staged constraint validation, and suitable MySQL online DDL options. Operations that cannot satisfy the selected lock policy remain Review required or Blocked.

### Expand/Contract

Produces multiple explicit phases:

1. expand compatible schema;
2. deploy/backfill checkpoint;
3. compatibility period checkpoint;
4. contract obsolete schema.

The planner does not invent application code or backfill expressions. Missing information becomes a required user input or manual checkpoint.

## SQL Output

Dialect generators receive ordered typed steps and strategy metadata. Output can contain:

- transaction boundaries;
- lock and statement timeout setup where appropriate;
- preflight assertions;
- migration phases and manual checkpoints;
- forward SQL;
- rollback guidance when the operation is genuinely reversible;
- comments explaining approved destructive steps and unresolved operational risk.

Full row-by-row data comparison is excluded. Backfills are represented only when required by a schema transition and supplied or approved by the user.

## Live Connections And Security

Connection profiles store:

- profile ID and display name;
- Development, Staging, Production, or custom environment label;
- engine, host, port, database, and optional username;
- TLS and read-only introspection settings.

Passwords and secret material are stored through the macOS Keychain. They are never written to `.dbstudio/workspace.json`, exported workspace data, migration reports, logs, or error messages.

Introspection uses read-only sessions, statement timeouts, bounded concurrency, and engine-specific catalog queries. The exact server and database remain visible while inspecting and reviewing. Production targets retain a clear warning.

## Persistence

Workspace data may store:

- connection profile references without secrets;
- selected Desired and Target source references;
- source fingerprints;
- strategy choice;
- rename decisions;
- destructive approvals and reasons;
- backfill expressions and manual checkpoints;
- panel and filter state.

Cached live snapshots are local application cache data, not portable workspace data, unless explicitly exported as a sanitized snapshot. A changed source fingerprint invalidates its dependent plan while preserving user decisions that still map unambiguously to stable step IDs.

## Failure Handling

- Invalid inputs fail before plan mutation.
- One failed input does not overwrite its last valid snapshot.
- Cancellation stops catalog loading and marks pending worker generations stale.
- Worker failures preserve the last valid plan and report a recoverable error.
- Unsupported objects are visible unresolved items, not silently ignored.
- Ambiguous renames remain unresolved until the user decides.
- Export remains disabled while required decisions are unresolved.
- Failed report or SQL writes leave previous files untouched.
- Version one never executes generated SQL.

## User Interface

The sidebar entry is **Migrate**. Opening it shows the active planner rather than a marketing page.

The input header contains Desired, swap, and Target controls. The plan view uses compact rows suitable for large operational lists, with filters for phase, risk, object kind, and resolution state. Selecting a row opens a right-side inspector containing rationale, dependencies, risk, SQL, rollback guidance, and required decisions.

Risk is communicated with reusable status components already used by validation. Familiar icons are used for swap, compare, approve, block, export, and filters. SQL uses the existing reusable SQL text component. Lists are virtualized and expanded details do not resize unrelated rows.

## Testing

Unit and integration tests cover:

- edited-schema, SQL-to-SQL, database-to-SQL, SQL-to-database, and database-to-database inputs;
- PostgreSQL and MySQL snapshots;
- structural equality and every typed change class;
- exact matching, rename candidates, ambiguous matches, and rejected suggestions;
- deterministic rename scoring and bounded candidate counts;
- dependency ordering, cycles, phased constraints, and deterministic output;
- risk classification and compatibility rules by engine version;
- destructive approvals, required backfills, and export blocking;
- Standard, Low-lock, and Expand/contract output;
- credential exclusion from persistence, reports, logs, and exports;
- worker cancellation and stale-result rejection;
- snapshot cache invalidation;
- virtualized plan rendering;
- deterministic fixtures with thousands of tables and relationships.

Performance tests assert operation counts, candidate counts, graph complexity, transfer sizes, and bounded history growth rather than machine-specific frame timings.

## Delivery Plan

### Phase 1: Core Planner

- snapshot model and hashing;
- edited-schema and SQL-workspace inputs;
- exact structural diff;
- dependency graph and deterministic ordering;
- initial plan UI and SQL inspection;
- Standard PostgreSQL and MySQL output.

### Phase 2: Decisions And Strategies

- rename blocking, scoring, matching, and confirmation;
- risk classification and destructive approvals;
- backfill requirements;
- Low-lock and Expand/contract strategies;
- SQL and JSON report export.

### Phase 3: Live Introspection

- connection profile UI;
- macOS Keychain integration;
- PostgreSQL and MySQL catalog adapters;
- read-only cancellation-aware introspection;
- database-to-SQL comparisons.

### Phase 4: Database Comparison And Hardening

- database-to-database workflow;
- Development/Production safety presentation;
- large-schema worker and memory hardening;
- unsupported-object reporting;
- complete regression and target-scale verification.

Each phase is independently usable and retains the final normalized-snapshot architecture.

## Success Criteria

- All four comparison modes use the same Desired -> Target planner.
- Equal objects are skipped through indexed identities and structural hashes.
- Rename analysis avoids unbounded all-pairs comparison and never auto-accepts a rename.
- Dependency ordering is deterministic and cycle aware.
- Destructive operations are visible but cannot enter exported SQL without explicit approval.
- Standard, Low-lock, and Expand/contract plans clearly differ where supported.
- Live introspection is read-only and no credential reaches portable data or exports.
- Large plans remain responsive through workers, compact records, indexes, and virtualization.
- Exported SQL is never executed by this version of DBStudio.
