# Direct Relationship Creation Design

## Goal

Allow users to create SQL relationships directly on the canvas by dragging round connection points between tables and fields.

## Interaction

- Relationship-creation points are hidden normally and appear only while hovering a table.
- Each field row exposes left and right round points. The table header exposes a table-level point.
- Dragging a field point to a compatible field point creates the relationship immediately.
- Dragging a table point to another table opens a compact field-selection popup.
- The popup lists only compatible source/target field pairs and ranks primary-key or unique target fields first.
- During a drag, compatible targets highlight, incompatible targets dim, and a temporary rounded relationship route follows the pointer.
- `Escape`, dropping on empty canvas, or dropping on an invalid target cancels without changing the document.

## Relationship Semantics

- The drag origin is the source foreign-key field/table.
- The drop target is the referenced field/table.
- Compatible fields must have matching normalized SQL data types.
- Existing identical relationships, same-field relationships, and invalid table/field IDs are rejected.
- The existing relationship model and SQL generation remain authoritative.

## Architecture

- Add pure domain helpers for normalized type compatibility, candidate generation, ranking, and duplicate validation.
- Add a small relationship-drag state machine to the canvas with idle, dragging-field, dragging-table, and choosing-fields states.
- Pixi renders hover ports, target highlighting, and the temporary route. React renders the field-selection popup because it requires accessible buttons and keyboard interaction.
- Completed connections call the existing `addRelationship` action through `onReplace`, producing one undoable `Add relationship` operation.
- Existing rendered relationship routing, cardinality badges, selection animation, SQL preview, save behavior, and sidebar relationship editor continue unchanged.

## Popup and Keyboard Behavior

- The popup is positioned near the target table and constrained to the canvas viewport.
- Candidate rows show `source_table.source_field → target_table.target_field` and both data types.
- Arrow keys change the active candidate, Enter creates it, and Escape closes the popup.
- If no compatible pair exists, the popup is not opened and the target briefly shows an invalid state.

## Performance

- Ports are created only for currently rendered tables and toggled through Pixi visibility rather than rebuilding the diagram on every hover.
- Compatibility candidates are computed only when a drag begins or reaches a table target.
- Pointer movement updates only the temporary route and current target styling.

## Testing

- Unit-test normalized PostgreSQL and MySQL type matching, candidate ranking, duplicate detection, and self-field rejection.
- Verify immediate field-to-field creation, table-to-table popup creation, Escape cancellation, invalid drops, and undo/redo.
- Run frontend tests, production build, Rust tests, and desktop packaging.

## Scope

This phase creates relationships. Editing cardinality, changing delete/update actions, multi-column foreign keys, and reconnecting existing relationship endpoints remain outside scope.
