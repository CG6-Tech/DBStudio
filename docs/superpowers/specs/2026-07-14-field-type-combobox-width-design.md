# Field Type Combobox Width Design

## Goal

Reduce the field type combobox width so it fits the compact table editor while preserving search, grouped results, and parameter configuration usability.

## Width

- Use a 220-pixel maximum popover width.
- Constrain the actual width to the available inner width of the sidebar viewport.
- Preserve an 8-pixel minimum inset from both sidebar edges.
- Recalculate horizontal placement whenever the picker opens.
- Keep the existing above/below flip behavior.

## Content

- Search remains full width.
- Canonical type names truncate with ellipsis and retain their full value in a tooltip.
- Category labels remain visible below type names.
- Precision and scale remain a two-column row when space permits.
- Configuration fields stack to one column when the popover is narrower than 200 pixels.
- Ordered `ENUM` and `SET` value editors remain full width.

## Verification

- Confirm the popover does not extend beyond the table card/sidebar in the supplied layout.
- Confirm search and option labels remain readable.
- Confirm configuration inputs do not overflow.
- Confirm table, domain, and composite type pickers use the same sizing.
- Do not run automated tests unless explicitly requested.

## Scope

This change adjusts combobox width and responsive internal layout only. Search, selection, validation, and SQL behavior remain unchanged.
