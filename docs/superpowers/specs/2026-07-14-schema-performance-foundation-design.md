# Schema Performance Foundation Design

## Goal

Keep ViewDB responsive when loading, arranging, resolving, and saving schemas with approximately 3,000 tables and 1,500 relationships. This phase improves asymptotic behavior without changing the persisted `SchemaDocument` format or visible editor behavior.

## Scope

This phase includes:

- deterministic fallback clustering for tables that do not belong to an explicit area;
- reusable, derived schema lookup indexes;
- indexed SQL parser relationship and index resolution;
- indexed SQL generation and linear patch assembly;
- correctness and large-schema complexity regression tests.

This phase does not normalize application state, change the UI, alter explicit area membership, introduce a saved-file migration, or implement incremental diagnostics.

## Architecture

### Derived schema indexes

Add a focused domain module that builds temporary lookup structures from a `SchemaDocument` or parsed table collection:

- table by ID;
- table by normalized qualified and unqualified name;
- column by ID;
- column by normalized name for each table;
- relationships by source and target table;
- structural table IDs as a `Set`.

Indexes are derived runtime data. They are not added to serialized documents. Callers build one index per parse or generation operation and reuse it throughout that operation.

Name normalization must preserve current dialect behavior. Qualified names are preferred when a schema is available; unqualified lookup remains compatible with existing SQL files. Ambiguous unqualified names resolve according to the parser's current deterministic table order rather than silently changing existing results.

### Deterministic graph clustering

Explicit diagram areas remain authoritative and are emitted first. Only unassigned tables participate in fallback clustering.

Build a sparse adjacency map in `O(V + E)`, then find connected components with an array-backed queue and a head index. Avoid `Array.shift()` and repeated sorting of the unseen set.

Large connected components are partitioned into stable groups of 8–20 tables:

1. Compute balanced target sizes using the existing size policy.
2. Choose the highest-degree unassigned table as a seed, breaking ties by stable table ID.
3. Grow the group from a max-priority frontier. Priority is the number of links into the current group, followed by total degree and stable ID.
4. Update priorities only for neighbors affected by the newly added table.
5. If the frontier empties, choose the next deterministic seed from the component.

This produces relationship-dense groups in approximately `O((V + E) log V)` without a third-party graph dependency. Results must be stable when input table or relationship arrays are reordered.

### Parser optimization

Replace global `tokens.findIndex` calls that restart at token zero with bounded forward scans beginning at the current cursor and ending at the current statement boundary.

After tables are parsed, build table and column name maps once. Resolve standalone indexes and foreign-key references through those maps. Expected relationship-resolution complexity becomes `O(T + C + R)` rather than repeated `tables.find` and `columns.find` scans.

Parser diagnostics and accepted SQL syntax remain unchanged.

### SQL generation optimization

At the start of generation, construct the shared schema index and a `Set` of structural table IDs. Rendering relationships, references, and index columns uses constant-time lookup maps.

After validating and sorting source patches, assemble output in one pass using source slices and an array join. This avoids rebuilding the complete SQL string for every patch. Patch precedence, overlap detection, quoting, and output formatting remain unchanged.

## Error Handling and Compatibility

- Missing table or column references continue to produce the current warning or omission behavior.
- Duplicate or ambiguous names do not cause nondeterministic lookup results.
- Invalid or overlapping SQL patches continue to throw rather than risk corrupting the source.
- Existing saved layouts, areas, notes, IDs, source ranges, and dialect settings remain compatible.
- No new runtime dependency is required.

## Testing

Unit tests will cover:

- stable clustering when input arrays are reordered;
- large connected components constrained to 8–20 tables;
- many isolated tables without repeated-sort behavior;
- qualified and unqualified table-name lookup;
- foreign-key and standalone-index resolution through lookup maps;
- generated SQL equivalence for PostgreSQL and MySQL;
- multiple non-overlapping patches applied in one pass;
- rejection of overlapping patches.

A synthetic 3,000-table, 1,500-relationship test will validate completion and structural invariants. Timing assertions, if used, will have a generous ceiling and serve only as a gross complexity-regression guard, not as a machine-specific benchmark.

## Success Criteria

- Explicit areas are unchanged and fallback clustering runs only for unassigned tables.
- Cluster output is deterministic and every table appears exactly once.
- Every fallback community contains 8–20 tables except an unavoidable final small component or isolated remainder.
- Parser and generator output remains equivalent for existing fixtures.
- No persisted document or UI contract changes.
- The synthetic target schema completes clustering, parsing lookup resolution, and generation without quadratic table-by-relationship scans.
