# Migration Diff Canvas Implementation Plan

1. Add a pure migration-diff projection that converts snapshots and migration changes into stable merged cards, rows, lanes, edges, and lookup indexes. Cover added, removed, modified, rename, and dependency cases with unit tests.
2. Lift migration view, plan, and selection state to `App` so the sidebar and main canvas stay synchronized without duplicating diff computation.
3. Add a paired source dialog for Current/Old and Desired/New SQL sources, including validation, swap, reset, and comparison gating.
4. Refactor the migration sidebar into Canvas/List modes and add a selected-change inspector while preserving rename, backfill, approval, generated SQL, and export behavior.
5. Add `MigrationDiffCanvas` using the shared viewport controller, minimap, grid, pan, zoom, drag, fit, selection, and stable lane layout.
6. Mount the diff canvas whenever the Migrate workspace is active and Canvas mode is selected; preserve the normal table canvas state independently.
7. Verify projection tests, existing migration tests, TypeScript, and the production build.
