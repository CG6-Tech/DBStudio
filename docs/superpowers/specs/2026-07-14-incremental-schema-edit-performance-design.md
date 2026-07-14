# Incremental Schema Edit Performance Design

## Goal

Complete the remaining schema performance work so editing remains responsive with approximately 3,000 tables while preserving the persisted `SchemaDocument`, SQL output, undo behavior, and UI design.

## Scope

This phase completes:

- schema access indexing for editor actions and sidebar consumers;
- incremental editor diagnostics;
- reverse custom-type usage and dependency indexing;
- localized custom-type propagation;
- lazy, keyed type-dropdown state and stable event handling.

It does not normalize or migrate saved documents, redesign controls, change dialect rules, or alter validation messages.

## Runtime Schema Index

Extend the derived runtime schema index with:

- `tablePositionById: Map<tableId, tableIndex>`;
- `columnLocationById: Map<columnId, { tableIndex, columnIndex }>`;
- `customTypeById: Map<customTypeId, CustomType>`;
- `customTypePositionById: Map<customTypeId, customTypeIndex>`;
- `customTypeUsages: Map<customTypeId, CustomTypeUsage[]>`;
- `customTypeDependencies: Map<customTypeId, Set<customTypeId>>`;
- `customTypeDependents: Map<customTypeId, Set<customTypeId>>`.

`CustomTypeUsage` is structured rather than display text. A usage identifies a table column, domain base, or composite field. Display strings are derived only at the UI boundary.

A `WeakMap<SchemaDocument, SchemaIndex>` caches one index per immutable document object. This avoids rebuilding indexes when several components or actions inspect the same document, while allowing garbage collection when undo history releases it. Index data is never serialized.

## Localized Immutable Updates

Add pure helpers that locate tables, columns, and custom types through index positions and replace only the affected array slots. Arrays are still shallow-copied because `SchemaDocument` remains immutable, but full predicate scans and nested searches are removed.

Column edits copy:

1. the tables array;
2. the affected table;
3. the affected columns array;
4. the affected column.

Custom-type edits use reverse usages to update only columns whose rendered data type depends on the edited type. Dependency traversal uses a queue with a head index and a visited `Set`, giving `O(V + E)` traversal of the affected custom-type subgraph.

Existing exported schema-action signatures remain compatible. Actions obtain the cached index internally, so callers do not need to manage runtime indexes.

## Incremental Diagnostics

Maintain an internal diagnostic cache in a `WeakMap<SchemaDocument, EditorDiagnosticIndex>`. Diagnostics are grouped by stable keys:

- `table:<tableId>` for unresolved fields, empty indexes, and empty checks;
- `custom:<customTypeId>` for local enum, domain, and composite validation;
- `custom:names` for duplicate qualified names;
- `custom:cycles` for recursive dependencies.

On the first validated edit for a document, build the complete diagnostic index. For subsequent actions, clone the previous keyed map and recompute only affected groups:

- a table edit recomputes that table;
- a custom-type edit recomputes that type and its reverse-dependent closure;
- add/delete/rename operations also recompute global name and cycle groups.

Cycle detection uses Tarjan strongly connected components over the custom-type dependency graph in `O(V + E)`. It runs only for structural custom-type dependency changes. This is more reliable than repeated per-node DFS and reports every member of a recursive component, including self-loops.

The public `document.diagnostics` array remains unchanged in shape. Non-editor parser diagnostics are preserved, and keyed editor diagnostics are flattened in deterministic key order.

## Reverse Custom-Type Usage

Build the reverse usage map in the same linear index pass that visits columns and custom-type definitions. Sidebar custom-type cards read usage information from this shared map instead of scanning all tables once per card.

Deletion checks use the same structured usages. Human-readable labels retain the current forms:

- `table.column`;
- `domain type_name`;
- `composite_name.field`.

## Type Dropdown

Replace eager per-option drafts with:

- a keyed option map built with `useMemo`;
- one active draft for the row currently being edited;
- direct render indexes rather than `filteredOptions.indexOf`;
- refs for the latest draft and commit callback so the outside-pointer listener is attached once per open session;
- memoized built-in/custom grouping from the already filtered option list.

Default parameters remain derived when a row first becomes active. Enter and outside-click commit behavior, validation, focus restoration, hover states, and displayed options remain unchanged.

## Error Handling and Compatibility

- If an indexed location is stale or missing, an action returns the original document rather than editing the wrong entity.
- Duplicate names and recursive custom-type dependencies remain warnings.
- Parser diagnostics are never removed by incremental editor validation.
- Runtime caches are advisory and can always be rebuilt from the document.
- Undo and redo remain correct because cache entries are keyed by immutable document identity.
- No runtime index or diagnostic metadata is persisted.

## Testing

Tests will cover:

- table, column, and custom-type position indexes;
- structured reverse usages and reverse dependency edges;
- localized column replacement without modifying unrelated table identities;
- custom-type edits touching only dependent tables and types;
- diagnostic equivalence between full and incremental validation;
- duplicate-name and Tarjan cycle reporting;
- preservation of parser diagnostics;
- deletion blocking through reverse usages;
- 3,000-table repeated localized edits without whole-schema validation;
- pure dropdown option/draft helpers where logic can be separated from React.

The full test suite and production build must pass. Tests will assert structural invariants and reference identity where relevant rather than fragile machine-specific timing.

## Success Criteria

- Every pending and partial item from the optimization audit is complete.
- Ordinary field edits do not validate unrelated tables or custom types.
- Custom-type usage is indexed once per document rather than once per rendered card.
- Entity lookup is map-based throughout schema actions covered by this phase.
- The type dropdown holds at most one editable option draft.
- Saved documents and generated SQL remain compatible.
