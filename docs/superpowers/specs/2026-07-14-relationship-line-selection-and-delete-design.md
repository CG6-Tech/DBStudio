# Relationship Line Selection and Delete Design

## Goal

Allow users to select a relationship by clicking its routed line and delete it with the Delete key as one undoable operation.

## Selection

- Extend canvas selection with a relationship selection containing the relationship ID.
- Only the line is selectable; cardinality badges do not select the relationship.
- Index routed line segments in RBush and query a pointer-sized world rectangle on canvas clicks.
- Rank candidates by exact point-to-segment distance and choose the nearest line.
- Convert a fixed screen-space tolerance through viewport scale so selection feels consistent at every zoom level.
- Empty-canvas clicks clear relationship selection. Table and field clicks replace it normally.

## Rendering

- Render the selected line brighter and slightly thicker.
- Preserve existing cardinality badges and relationship animation behavior.
- When worker routing changes a path, replace only that relationship's segment entries in the index.

## Delete Behavior

- Listen for the Delete key while a relationship is selected.
- Ignore Delete when focus is inside an input, textarea, select, or content-editable element.
- Call the existing `deleteRelationship` domain action through `onReplace` with the label `Delete relationship`.
- Clear selection after deletion.
- Do not show a confirmation dialog; Undo restores the deleted relationship.

## Performance

- Hit testing is an RBush bounding-box query followed by distance checks against only nearby segments.
- The pointer path never scans every relationship.
- Segment entries are cached with rendered routes and updated incrementally.

## Testing

- Unit-test point-to-segment distance, nearest segment choice, and fixed screen-space tolerance conversion.
- Verify selection at multiple zoom levels, overlapping-line nearest selection, Delete behavior, editable-input protection, and Undo restoration.
- Run frontend tests, production build, Rust tests, and macOS packaging.

## Scope

This phase selects and deletes existing single-column relationships. Reconnecting endpoints, changing cardinality, and multi-select remain outside scope.
