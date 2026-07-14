# Schema Performance Foundation Implementation Plan

1. Add `src/domain/schemaIndex.ts` with normalized qualified/unqualified table lookups, per-table column-name maps, ID maps, relationship adjacency, and structural-table membership. Add focused unit tests for deterministic ambiguity handling and qualified names.
2. Replace fallback clustering's repeated global sorting and `Array.shift()` traversal with deterministic heap-frontier partitioning and array-head BFS. Extend tests for reordered relationships, dense components, isolated tables, uniqueness, and a 3,000-table synthetic graph.
3. Add bounded token-search helpers to the parser, replace statement-wide searches that restart at token zero, and use parser lookup maps for inline indexes, standalone indexes, and foreign-key resolution. Extend PostgreSQL/MySQL parser fixtures.
4. Refactor SQL generation to build one schema index, use structural membership sets and constant-time entity lookups, and apply source patches with a single pieces-and-join pass. Add equivalence, multiple-patch, and overlap tests.
5. Run the focused domain tests, the complete Vitest suite, TypeScript/Vite production build, and review the final diff for accidental persisted-format or UI changes.
