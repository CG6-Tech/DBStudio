# References workspace implementation plan

## Objective

Replace the current relationship form and flat list with scalable Browse, Create, and Analyze workflows backed by indexed search, bitset filtering, compatibility ranking, compact graph algorithms, virtualized rows, explicit edit drafts, and canvas integration.

## Tasks

1. Add `src/domain/relationshipIndex.ts` with stable relationship ordinals, ID maps, incoming/outgoing table maps, column/file maps, cardinality/status records, normalized search records, token postings, and filter bitsets. Add deterministic index and filter tests.
2. Add `src/domain/relationshipSearch.ts` for token intersection, prefix ranking, optional trigram fallback, stable grouping, and flat virtual-row projections. Test search, grouping, collapse state, and combined filters.
3. Add `src/domain/relationshipCompatibility.ts` with dialect type-family buckets, PK/unique sets, connected-pair membership, structured validation reasons, bounded top-20 candidate ranking, and tests.
4. Add `src/domain/relationshipGraph.ts` with CSR incoming/outgoing storage, iterative Tarjan SCC, generation-stamped directional BFS, and bidirectional shortest path. Add cycle, path, and traversal tests.
5. Extend UI state with persistent References mode, selected/hovered relationship, filters, grouping, draft, analysis endpoints, depth, and scroll positions. Keep hover and projections outside document history.
6. Replace `RelationshipsPanel` with a focused component tree under `src/components/references/`: shared shell, Browse mode, virtualized grouped list, details draft, Create mode, searchable endpoint picker, and Analyze mode.
7. Connect Browse selection and hover to retained canvas line/endpoint styling, add explicit Show on canvas, and route canvas-dot creation into Create mode with a prefilled source.
8. Add atomic relationship update/reverse operations and cross-file ownership transfer handling. Make Apply one undoable operation and dirty both old/new source files when ownership moves.
9. Add component/domain fixtures for 1,500 and 10,000 relationships, keyboard behavior, deletion, draft discard, invalid endpoints, and multi-file ownership.
10. Run the complete frontend suite, TypeScript/Vite build, native Rust suite, and macOS Tauri build; review the final diff for accidental changes outside References integration.

## Change boundaries

- Preserve the new multi-file workspace implementation currently present in the worktree.
- Do not serialize relationship indexes or analysis caches.
- Do not replace the retained Pixi canvas or existing relationship routing.
- Preserve unsupported composite relationships as visible, partially editable records.
- Do not allow invalid drafts to create schema operations or SQL patches.

## Completion criteria

- Browse supports indexed search, filters, grouping, virtualization, selection, hover, details, deletion, and canvas focus.
- Create uses ranked compatible endpoint suggestions and shared validation.
- Analyze provides incoming/outgoing dependencies, SCC cycles, upstream/downstream traversal, and shortest paths.
- Relationship updates are explicit, undoable, and safe across source-file ownership changes.
- The 10,000-relationship fixture passes and interactive projections remain bounded.
