# References workspace design

## Goal

Replace the current four-dropdown relationship form and ungrouped list with a scalable References workspace for browsing, creating, editing, and analyzing relationships across large single-file and multi-file schemas.

The normal target is approximately 3,000 tables and 1,500 relationships. The design must remain responsive at 10,000 relationships.

## Scope

The References panel provides three modes:

- **Browse** for finding, grouping, inspecting, and navigating relationships.
- **Create** for guided relationship creation with ranked compatible endpoints.
- **Analyze** for dependency impact, cycles, paths, invalid references, and orphan fields.

The panel integrates with canvas selection, highlighting, focus, relationship-dot creation, undo/redo, SQL ownership, and multi-file saving.

Composite foreign keys remain visible but are only partially editable until the schema model supports multi-column relationship entities.

## Runtime relationship index

The panel uses one runtime-only `RelationshipIndex`, cached by document identity. It is not serialized into SQL or workspace metadata.

```ts
interface RelationshipIndex {
  relationshipById: Map<string, RelationshipRecord>;
  ordinalById: Map<string, number>;
  idByOrdinal: string[];

  incomingByTableId: Map<string, readonly number[]>;
  outgoingByTableId: Map<string, readonly number[]>;
  relationshipsByColumnId: Map<string, readonly number[]>;
  relationshipsByFileId: Map<FileId, readonly number[]>;

  filterBits: RelationshipFilterBits;
  tokenPostings: Map<string, Uint32Array>;
  searchTextByOrdinal: string[];
  graph: RelationshipGraph;
}
```

Dense relationship ordinals avoid duplicating string IDs in secondary structures. Maps provide constant-time identity lookup. Arrays preserve stable order and feed virtualized projections directly.

### Filter bitsets

Frequently combined predicates are represented as `Uint32Array` bitsets:

- Incoming
- Outgoing
- Cross-file
- Invalid
- Unresolved
- One-to-one
- One-to-many
- Selected-table membership

Filter composition uses word-level AND, OR, and NOT operations. The final set-bit ordinals are emitted in stable sort order.

### Index lifecycle

Relationship edits are infrequent relative to browsing. A complete index rebuild after a committed schema edit is deterministic and linear in tables, columns, and relationships. Search typing, grouping, filtering, selection, hovering, and scrolling reuse the same index.

The existing `SchemaIndex` remains authoritative for schema entity lookup. `RelationshipIndex` adds display, filtering, search, compatibility, and graph-analysis projections without duplicating table or column objects.

## Search and grouping

Normalized search records include:

- Constraint name
- Source schema, table, and field
- Target schema, table, and field
- Source and target relative SQL paths
- Area names
- Cardinality labels
- Validation status

Tokens populate sorted ordinal posting lists. A query intersects the smallest postings first, applies active filter bitsets, and ranks only the remaining relationships. Prefix and exact-token matches precede substring matches. Trigram similarity runs only when direct matching produces too few results.

Grouping options are:

- Source table
- Target table
- SQL file
- Database schema
- Diagram area
- No grouping

Group headings and relationship items share one flat virtual-row projection. Collapsing a group removes its descendants from that projection without rebuilding the relationship index.

Sorting is stable and deterministic. Natural, case-insensitive display keys are precomputed during index construction, with relationship ID as the final tie-breaker.

## Browse mode

Browse is the default mode.

The header contains:

- Search
- Group selector
- Filter popover and active-filter count
- Result count
- Collapse/expand-all action

A compact relationship row shows:

```text
orders.customer_id          N → 1
customers.id
sales/orders.sql → crm/customers.sql
```

Rows expose selected, hovered, keyboard-focused, invalid, unresolved, and cross-file states. Long qualified names truncate visually while remaining available through accessible names and tooltips.

Selecting a row:

- Selects the canvas relationship line.
- Highlights both endpoint fields.
- Opens the inline details drawer.
- Keeps the panel mode, filters, grouping, and scroll position.

The explicit **Show on canvas** action centers the entire relationship. Selection alone does not unexpectedly change viewport position.

Hover updates only a lightweight relationship-hover ID in UI state. It never modifies the schema document or creates undo history. The retained canvas scene updates the line and endpoint visuals directly.

## Relationship details and editing

The selected relationship opens a details drawer containing:

- Constraint name
- Searchable source endpoint
- Searchable target endpoint
- Cardinality
- Source ownership file
- Cross-file status
- Validation status and explanation
- Apply, Cancel, Reverse, and Delete actions

Editing uses a draft:

```text
Selected relationship
        |
Editable draft
        |
Compatibility validation
        |
Apply
        |
One undoable schema operation
```

Changing controls does not immediately update SQL. Apply is enabled only when the draft is valid and differs from the saved relationship. Escape and Cancel discard the draft. Selecting another relationship while a changed draft is open asks the user to discard it or remain on the current relationship.

Reverse swaps endpoints only when the resulting foreign-key direction passes validation. Delete is available through the icon action and macOS Delete/Backspace keys when focus is not inside an editable control.

For multi-file workspaces, the foreign-key/source file owns the relationship. Changing the source to a field in another file transfers ownership only on Apply. Both the former and new source files become dirty so SQL removal and insertion remain safe.

## Create mode

The current four native selects are replaced by two searchable endpoint comboboxes:

```text
From  [ Search table or field… ]
To    [ Ranked compatible fields… ]
```

Target results show the qualified field, data type, PK/unique status, source file, and compatibility reason. Invalid and already-connected candidates are disabled with explanations rather than silently removed.

The canvas relationship-dot workflow opens this same mode with the source endpoint prefilled. The sidebar and canvas therefore share validation and ranking code.

A preview presents direction and expected cardinality before **Create relationship** is enabled.

## Compatibility index and ranking

```ts
interface RelationshipCompatibilityIndex {
  columnsByTypeFamily: Map<TypeFamily, readonly ColumnOrdinal[]>;
  primaryColumns: Set<ColumnId>;
  uniqueColumns: Set<ColumnId>;
  connectedPairs: Set<string>;
}
```

For a selected source field, candidate generation visits only compatible type-family buckets. It rejects existing endpoint pairs in constant expected time and scores remaining candidates using:

1. Exact normalized field-name match.
2. `<target>_id` and singular/plural naming conventions.
3. Dialect-compatible SQL type.
4. Target primary or unique key.
5. Nullability and expected cardinality.
6. Same schema and nearby file ownership.

Only the best 20 candidates are retained with a bounded min-heap. Candidate selection is approximately `O(K log 20)`, where `K` is the compatible candidate count, instead of sorting every column.

## Validation

A relationship draft is valid only when:

- Both endpoints exist.
- The endpoints are different fields.
- Their types are compatible under the active dialect settings.
- The target satisfies the dialect's primary/unique requirements.
- The endpoint pair is not already connected.
- It does not duplicate an equivalent composite relationship.
- The source ownership file is writable.
- A cross-file target resolves unambiguously.

Validation returns structured reason codes and user-facing explanations. Invalid drafts cannot reach document operations or SQL generation.

Missing and ambiguous parsed relationships remain visible in Browse and Analyze modes under Invalid or Unresolved filters.

## Analyze mode

The selected table summary includes:

- Incoming and outgoing counts
- Direct dependencies and dependents
- Cross-file relationship count
- Circular dependency membership
- Invalid and unresolved references
- Orphan foreign-key-like fields

Analysis tools include:

- Upstream traversal with a depth limit
- Downstream traversal with a depth limit
- Shortest relationship path between two tables
- Circular dependency groups
- Invalid and unresolved relationship lists
- Show-on-canvas actions

### Compact graph representation

The index builds incoming and outgoing compressed sparse row graphs:

```ts
interface RelationshipGraph {
  outOffsets: Uint32Array;
  outNeighbors: Uint32Array;
  outRelationshipOrdinals: Uint32Array;
  inOffsets: Uint32Array;
  inNeighbors: Uint32Array;
}
```

CSR provides compact sequential storage and fast traversal. Table IDs map to dense ordinals through the existing schema index or a relationship-graph ordinal map.

Algorithms:

- Iterative Tarjan strongly connected components for cycles in `O(V + E)`.
- Bidirectional BFS for shortest relationship paths.
- Directional BFS for upstream and downstream impact.
- Generation-stamped typed arrays for visited state, avoiding a new object or `Set` allocation per visited table.
- Degree counts from adjacent CSR offsets.

Unresolved references are indexed diagnostics and do not become graph edges.

## UI state and accessibility

UI state stores:

- Active References mode
- Search query
- Grouping
- Active filters
- Collapsed group IDs
- Selected and hovered relationship IDs
- Draft relationship
- Analyze source/target tables and depth
- Per-mode scroll offsets

Schema entities remain in the document model. Derived rows, rankings, and analysis results remain memoized runtime projections.

Keyboard behavior:

- Arrow keys move through virtual rows.
- Enter opens details or activates an action.
- Escape closes popovers or discards a draft.
- Delete/Backspace deletes a selected relationship outside editable controls.
- Tab order reaches search, filters, rows, details, and actions predictably.

Every icon-only control has an accessible name. Status is not communicated by color alone.

## Performance

For `T` tables, `C` columns, and `R` relationships:

- Relationship index construction: `O(T + C + R)`.
- Filter composition: `O(R / 32)` per bitset operation.
- Token query: proportional to the intersected posting lists plus result ranking.
- Group projection: `O(matched relationships)` when query/filter/group state changes.
- Virtual rendering: `O(viewport rows + overscan)`.
- Compatibility suggestions: `O(compatible candidates log 20)`.
- Cycle detection: `O(T + R)`.
- BFS traversal: `O(visited tables + visited relationships)`.

No render, hover, or selection path may scan every table column or recreate the graph.

## Error handling

- Missing endpoints remain visible and inspectable.
- Ambiguous cross-file references display candidate files.
- Unsupported composite relationships are labeled partially editable.
- A failed analysis does not block Browse or Create modes.
- A changed draft is never discarded silently.
- File ownership transfer marks both affected files dirty before saving.
- Invalid drafts never create operations or SQL patches.

## Testing

### Domain tests

- Relationship index maps and stable ordinals.
- Bitset AND, OR, NOT, and combined filters.
- Token, prefix, substring, and trigram search.
- Stable sorting and grouping.
- Cardinality derivation.
- Compatibility buckets and top-20 heap ranking.
- Duplicate-pair and invalid-target rejection.
- CSR construction.
- Iterative SCC cycle detection.
- Bidirectional shortest path.
- Upstream and downstream traversal.
- Cross-file ownership transfer.

### UI tests

- Browse/Create/Analyze mode persistence.
- Virtual row ranges and grouped collapse behavior.
- Search, filters, and result counts.
- Row selection, hover, focus, and canvas integration.
- Draft Apply, Cancel, Escape, and discard confirmation.
- Keyboard navigation and deletion.
- Invalid-state explanations.
- Canvas-dot handoff into Create mode.

### Performance fixtures

- Existing 3,000-table and 1,500-relationship workspace fixture.
- A deterministic 10,000-relationship stress fixture.
- Index rebuild remains linear.
- Search and filter projection remains within one interaction frame after index construction.
- Rendered rows remain bounded to viewport plus overscan.
- Graph traversals allocate no per-visited-node objects.

## Acceptance criteria

- Browse is a searchable, grouped, filtered, virtualized relationship explorer.
- Selecting a row highlights the line and both endpoints without automatically moving the viewport.
- Details use an explicit draft and one-operation Apply flow.
- Create ranks compatible fields and explains disabled candidates.
- Canvas-dot creation and sidebar creation share the same workflow.
- Analyze reports dependencies, cycles, paths, invalid references, and orphan fields.
- Cross-file relationship ownership and transfers save safely.
- The 10,000-relationship fixture remains interactively usable.
