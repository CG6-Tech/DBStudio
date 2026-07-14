# Compact inline relationship details design

## Goal

Fix the References sidebar's weak visual hierarchy, oversized controls, clipped relationship content, large unused space, and wrapped action buttons. Relationship details must appear directly beneath the selected relationship row rather than in a detached bottom drawer.

## Browse layout

- Keep Browse, Create, and Analyze as the three top-level modes.
- Reduce the height and font size of tabs, search, grouping, filters, and result rows to match the existing sidebar controls.
- Give the active tab an unambiguous accent background and dark foreground.
- Render each source-table group as one bordered accordion section.
- Render the selected relationship row with an accent inset and attach its details immediately below it.
- Keep endpoint names and the ratio readable at narrow widths. Truncate secondary file or schema metadata before endpoint names.
- Remove the flex-expanded virtual-list gap between the selected row and details.

## Inline relationship details

- Use a compact header with the title and icon-only delete action.
- Display From and To endpoint pickers in a two-column grid when the sidebar is wide enough, falling back to one column at narrow widths.
- Add a segmented cardinality control containing `N:1` and `1:1`.
- Keep Show on canvas, Reverse, and Apply on one action row. Icon-first labels may shorten at narrow widths, but buttons must not wrap internally.
- Keep validation feedback immediately above the action row.

## Cardinality and SQL behavior

One foreign-key relationship supports `N:1` and `1:1` only.

- Applying `1:1` adds or reuses uniqueness on the source field.
- Applying `N:1` removes uniqueness only when that uniqueness was introduced and is owned by the relationship-cardinality operation.
- User-authored unrelated indexes or constraints must not be removed.
- `1:N` remains available by reversing the relationship direction.
- `N:N` is outside this change because it requires a junction-table workflow and two foreign-key relationships.
- Endpoint and cardinality edits remain drafts until Apply.

## State and operations

- The selected relationship remains stored in the existing UI selection state.
- The draft stores source endpoint, target endpoint, and cardinality.
- Apply performs one undoable schema operation and marks the correct SQL ownership file dirty.
- Reverse swaps the endpoints in the draft and recalculates validation and displayed ratio.
- Delete continues to use the existing relationship deletion operation.

## Scope constraints

- No redesign of Create or Analyze beyond shared density and control styling.
- No many-to-many junction-table generation.
- No automated tests or build will be run for this change, per user request. The user will test the macOS app manually.

## Acceptance criteria

- No large empty gap appears between a selected relationship and its details.
- Relationship metadata no longer clips over endpoint content at the shown sidebar width.
- The active mode is clearly visible.
- The action row does not wrap.
- Cardinality can be changed between `N:1` and `1:1` before Apply.
- Applying cardinality changes updates the relevant SQL uniqueness safely.
