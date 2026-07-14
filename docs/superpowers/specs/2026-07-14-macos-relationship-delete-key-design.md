# macOS Relationship Delete Key Design

## Goal

Make the physical macOS Delete key remove a selected relationship.

## Behavior

- Accept both `Backspace` and `Delete` keyboard events for relationship deletion.
- Preserve the existing requirement that a relationship is selected.
- Continue ignoring both keys when focus is inside an input, textarea, select, or content-editable element.
- Keep deletion immediate, undoable, and confirmation-free.

## Testing

- Unit-test the accepted deletion-key predicate for `Backspace`, `Delete`, and unrelated keys.
- Run frontend tests, production build, Rust tests, and macOS packaging.
