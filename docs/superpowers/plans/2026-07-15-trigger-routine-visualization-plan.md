# Trigger and Routine Visualization Implementation Plan

## Phase 1: Logic domain and parsing

1. Add routine, trigger, reference, effect, and logic-edge types to the schema domain.
2. Extend the SQL tokenizer to preserve PostgreSQL dollar-quoted bodies and safely recognize routine-sized statements.
3. Parse PostgreSQL functions, procedures, and triggers.
4. Parse MySQL functions, procedures, and triggers, including delimiter-oriented files.
5. Infer conservative routine calls and table reads/writes from routine bodies.
6. Add focused parser tests for supported, partial, quoted, malformed, and dynamic definitions.

## Phase 2: Workspace linking and indexes

1. Namespace logic objects with stable workspace IDs.
2. Resolve trigger tables, executed routines, routine calls, and table effects across files.
3. Preserve unresolved references and emit object-level diagnostics without blocking load.
4. Add a logic index for search, adjacency, reverse adjacency, and cycle-safe path traversal.
5. Register logic entity source locations and cross-file dependencies.
6. Add workspace resolution, ambiguity, overload, cycle, and performance tests.

## Phase 3: Logic mode UI

1. Add independent ER/Logic canvas mode and logic selection state.
2. Add a read-only Logic sidebar with search, kind filters, edge controls, counts, and keyboard navigation.
3. Implement a dedicated logic layout module that orders tables, triggers, routines, and affected tables left to right.
4. Implement an SVG Logic canvas with viewport culling, semantic cards and edges, selection, path highlighting, zoom, pan, fit, and focus.
5. Add the read-only Logic inspector for object metadata, diagnostics, source location, original SQL, and edge inference details.
6. Keep existing ER components and schema editing operations isolated from Logic mode.

## Phase 4: Persistence and verification

1. Extend metadata with optional logic positions and viewport data while retaining backward compatibility.
2. Confirm SQL generation never rewrites logic definitions.
3. Add UI/state tests for switching, search, filters, selection, highlighting, empty/error states, and keyboard behavior.
4. Add regression tests for ER parsing, layout, metadata, editing, and SQL output.
5. Run type checking, unit tests, production build, and targeted performance tests.
