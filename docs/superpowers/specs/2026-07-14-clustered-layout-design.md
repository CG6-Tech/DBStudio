# User-Friendly Clustered Layout Design

## Goal

Replace the linear automatic table arrangement with a balanced, relationship-aware clustered layout that remains understandable for large schemas.

Automatic arrangement runs only while loading a file that does not already have saved table positions. After loading, the user controls table placement. Schema edits, relationship edits, and ordinary canvas interactions must not trigger automatic rearrangement.

## Grouping Priority

User-defined Areas are authoritative. Tables assigned to an Area remain in that group and are never reassigned by automatic relationship clustering.

Tables without an Area use relationship clustering as a fallback:

1. Build an undirected table graph from foreign-key relationships.
2. Keep small connected components together.
3. Split large connected components into deterministic relationship communities targeting 8–20 tables.
4. Place tables with no relationships into compact isolated-table groups instead of a single line.

Fallback communities are layout-only. They do not create Areas, do not appear in workspace metadata, and do not change schema state.

## Community Detection

Use a deterministic, bounded graph-community algorithm. Start from high-degree hub tables, expand through strongest local relationship neighborhoods, and stop a community near the target size. Merge undersized neighboring communities when the combined group remains within the upper bound. Split oversized results deterministically.

Tie-breaking uses stable table IDs so the same schema produces the same arrangement across loads and platforms.

The normal target is 8–20 tables. Components with fewer than eight tables remain intact. A component may exceed the target only when preserving a tightly connected small boundary is more readable than creating a nearly empty fragment.

## Hierarchical Layout

The layout pipeline has two levels.

### Inside each group

- Existing Areas and fallback communities are laid out independently.
- Highly connected hub tables are placed centrally or at the leading edge of the local flow.
- Related dependents remain close to their parent tables.
- Internal relationship lines use short orthogonal routes.
- The layout favors a compact, roughly rectangular footprint over a long horizontal chain.

### Across groups

- Group bounds include spacing for labels, edges, and existing Area frames.
- Groups are packed into balanced rows using their measured dimensions and the available viewport aspect ratio.
- Groups with cross-group relationships are placed nearer each other.
- Cross-group routes use the whitespace between group bounds to reduce line crossings.
- Isolated-table groups are placed after related groups in a compact grid.

Existing Areas retain their names, colors, and visible frames. Their bounds expand when necessary to contain the initial arranged tables with consistent padding. Locked Areas preserve their saved geometry and table positions.

## Load-Time Behavior

When a file opens:

1. Parse the schema and load workspace metadata.
2. If metadata contains saved table positions, use them without automatic rearrangement.
3. Otherwise, compute authoritative Area groups plus fallback relationship communities.
4. Run internal layouts, pack the groups, and return one complete layout result.
5. Fit the viewport to the complete workspace.

The layout worker must not publish the current linear timeout fallback while a clustered layout is still computing. If clustered layout fails, use a bounded multi-column grid grouped by Area/community, never a single-row sequence.

No automatic layout runs after the initial load. Moving tables, resizing Areas, changing relationships, undoing, and redoing preserve the user's current arrangement.

## Components

### `clusterGraph`

Pure domain logic that receives tables, relationships, and Area membership and returns stable group assignments. It has no rendering or ELK dependency.

### `layoutCluster`

Worker-side logic that creates a compact local ELK graph for one group and returns positioned nodes plus internal routes.

### `packClusters`

Pure geometry logic that places measured group rectangles into balanced rows and translates their nodes and edge routes into workspace coordinates.

### Layout worker coordinator

Builds authoritative and fallback groups, runs local layouts, packs results, and routes remaining cross-group relationships. It returns the existing `LayoutResult` interface so the canvas does not need a new rendering model.

## Failure and Performance Behavior

- Community detection and packing are linear or near-linear in the number of tables and relationships.
- Cluster layouts may run with bounded concurrency to avoid memory spikes on large schemas.
- Worker failures return a grouped multi-column fallback layout.
- A slow worker does not replace the schema with a linear placeholder.
- Viewport culling continues to render only nearby detailed cards while Fit can frame the complete workspace.
- Empty schemas and missing relationship endpoints are handled without throwing.

## Testing

### Domain tests

- Area membership overrides fallback clustering.
- Unassigned connected tables cluster together.
- Large connected graphs split into deterministic groups near the 8–20 target.
- Small components remain intact.
- Isolated tables use bounded compact groups.
- Reordered input produces the same stable assignments.
- Packing produces non-overlapping cluster rectangles with a balanced aspect ratio.

### Worker tests

- A representative multi-domain schema produces multiple rows rather than one horizontal chain.
- Internal relationships remain inside translated cluster bounds.
- Cross-cluster edges have valid translated routes.
- Grouped fallback remains multi-column when ELK fails or times out.

### Product verification

- Load `BlueG.sql` and confirm all 274 tables appear in compact relationship communities.
- Confirm its 87 relationships keep related tables close.
- Create or load saved Areas and confirm Area membership wins over fallback communities.
- Move tables after load and confirm no automatic rearrangement occurs.
- Reopen a workspace with saved positions and confirm those positions are preserved.
- Use Fit and navigate between communities without missing viewport-culling content.

## Scope

This phase changes initial automatic arrangement only. It does not create fallback Areas, infer business-domain names, continuously relayout after edits, or override user-saved positions.
