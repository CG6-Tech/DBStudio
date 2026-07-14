# Incremental Schema Edit Performance Implementation Plan

1. Extend `schemaIndex` with entity positions, custom-type lookup, structured reverse usages, dependency/dependent graphs, and a document-identity `WeakMap` cache. Add index and graph tests.
2. Add localized immutable table/column/custom-type replacement helpers and migrate schema actions away from repeated entity scans while preserving exported APIs and reference identity for untouched tables.
3. Extract editor validation into keyed diagnostic groups, implement Tarjan cycle detection, and carry incremental diagnostic caches from previous to next immutable documents. Add full-versus-incremental equivalence and parser-diagnostic preservation tests.
4. Use reverse custom-type usages for deletion, sidebar counts/tooltips, and localized rendered-type propagation.
5. Refactor the type picker to a keyed option map, one active draft, indexed rendering, memoized grouping, and stable outside-pointer handling through refs.
6. Add a 3,000-table localized-edit regression test, run focused tests, the full Vitest suite, the production build, and review the diff for format or UI regressions.
