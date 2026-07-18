# PostgreSQL Migration Fixture Design

## Goal

Create a maintainable corpus of standalone PostgreSQL SQL files for testing DBStudio's schema import and migration-planning behavior. Database execution and Docker orchestration are deliberately deferred.

## Fixture Contract

Each test case is one independently executable `.sql` file. A fixture must:

- create and use a uniquely named schema;
- begin with `DROP SCHEMA IF EXISTS ... CASCADE` so repeated execution is deterministic;
- avoid extensions and external dependencies unless the case explicitly tests them;
- include a short header naming the scenario, expected planner concern, and expected risk level;
- use schema-qualified object names;
- include only the minimum objects and seed data needed to express the scenario;
- remain valid on a supported modern PostgreSQL release.

These files model database states and representative migration operations. They do not contain application-specific assertions or require DBStudio to execute them yet.

## Directory Structure

```text
tests/fixtures/postgresql/
  README.md
  basic/
  columns/
  indexes/
  constraints/
  relationships/
  routines/
  destructive/
  complex/
```

Files use a sortable numeric prefix and descriptive name, such as `01-create-table.sql` and `04-cyclic-foreign-keys.sql`. Schema names use the same scenario identity with a `fixture_` prefix.

## Coverage Matrix

### Basic

- Empty schema
- Single table with primary key
- Multiple related tables
- Multiple PostgreSQL schemas with duplicate table names
- Quoted and case-sensitive identifiers

### Columns

- Add nullable column
- Add required column with default/backfill
- Drop column
- Rename column
- Change compatible and incompatible types
- Add, remove, and change defaults
- Add and remove `NOT NULL`
- Identity and generated columns
- Array, JSONB, UUID, numeric, timestamp, and text types

### Indexes

- Create and drop indexes
- Unique and multi-column indexes
- Partial and expression indexes
- Replaced index definition
- Concurrent-index migration example

### Constraints

- Primary and unique constraints
- Check constraints
- Add and remove foreign keys
- Deferred foreign keys
- Composite foreign keys
- Constraint replacement

### Relationships

- One-to-one, one-to-many, and many-to-many structures
- Self-referencing foreign key
- Cyclic foreign keys
- Multiple foreign keys between the same tables
- Ordered dependency chain

### Routines

- SQL and PL/pgSQL functions
- Trigger function and trigger
- Function replacement
- Routine dependencies on tables and types

### Destructive

- Drop table
- Drop populated column
- Narrow a column type
- Add required column without a safe backfill
- Mixed safe and destructive changes
- Ambiguous rename candidates

### Complex

- Enum and domain types
- Audit-log expand/contract migration
- Cross-schema dependencies
- Tables, constraints, indexes, routines, and triggers in one fixture
- Dependency ordering and rollback-sensitive operations

## README Manifest

`README.md` lists every fixture with its category, purpose, expected risk (`safe`, `warning`, or `destructive`), and the migration-planner capability it exercises. This manifest is the source of truth for coverage and prevents silent duplicate or missing scenarios.

## Validation

For this phase, validation is static:

- every manifest entry resolves to exactly one SQL file;
- every SQL file has a unique schema name;
- every SQL file contains its required reset statement and fixture metadata;
- filenames and categories are deterministic and sortable;
- SQL remains free of Docker- or environment-specific assumptions.

A later database phase will execute every fixture against PostgreSQL in Docker, capture schema snapshots, and connect expected planner results to automated tests.

## Scope Boundaries

This phase does not add Docker configuration, provision PostgreSQL, compare live databases, produce expected JSON snapshots, or change migration-planner application code. It creates only PostgreSQL SQL fixtures and their manifest.
