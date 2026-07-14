# Type Option Row Inputs Design

## Goal

Remove all secondary type-configuration UI and place editable, default-prefilled parameter controls directly inside every parameterized dropdown option row.

## Option Rows

Every parameterized built-in type displays its controls at all times:

- `INTEGER` with display-width input `10`;
- `VARCHAR` with length input `255`;
- `NUMERIC` with precision `10` and scale `2` inputs;
- time types with precision `6`;
- MySQL `ENUM` and `SET` with a comma-separated values input;
- PostgreSQL array dimensions with a compact numeric input;
- MySQL unsigned support with a compact checkbox.

Simple types retain a standard option row without parameter controls. Canonical name and category remain visible, and the active type keeps its checkmark.

## Interaction

- Clicking a simple option applies it immediately and closes the dropdown.
- Clicking the name/category area of a parameterized option applies that option with the currently displayed defaults or edits and closes the dropdown.
- Clicking a parameter input focuses it without selecting the row.
- Enter inside an input validates and applies that option with the edited values.
- Clicking outside the dropdown while an input is active validates and applies the active option.
- Clicking another option applies the newly clicked option and does not commit the previously edited row.
- Escape closes the dropdown without applying the active edit.
- Invalid input keeps the dropdown open and displays an error directly beneath that row.

Pointer-down dismissal commits the active edited row before the dropdown unmounts. Internal pointer events clear pending outside-commit behavior so switching options cannot accidentally apply the previous row.

## Draft State

- Opening the dropdown creates independent local drafts for every option from dialect defaults.
- The currently selected type uses its saved values instead of defaults.
- Editing one option never mutates shared dialect configuration or other option drafts.
- Drafts are discarded when the dropdown closes.
- SQL and history update only when an option is committed.

## Hover and Focus

- Parameter inputs use a quiet default border and background.
- Hover increases border contrast and slightly raises the input background.
- Keyboard focus uses the application focus ring and clearer text color.
- Input cursor and numeric alignment make the controls visibly editable.

## Validation

- Numeric controls accept non-negative integer text.
- Scale cannot exceed precision.
- `ENUM` and `SET` values must be non-empty and unique.
- Invalid rows show one compact error and do not close or commit.

## Layout

- Preserve the centered responsive 220-pixel popover.
- Parameter controls occupy the right side of their option row.
- Numeric inputs use compact widths; precision and scale remain distinguishable.
- Comma-separated value inputs use the full row width beneath the type heading when necessary.
- No expanded configuration panel, extra dialog, Apply button, Cancel button, or Back action remains.

## Verification

- Confirm parameter controls are always visible on applicable rows.
- Confirm dialect defaults are prefilled.
- Confirm input hover and focus states.
- Confirm Enter and outside-click commit behavior.
- Confirm Escape cancels.
- Confirm switching options cannot commit the previous edit.
- Confirm invalid input stays open with a row-level message.
- Do not run automated tests unless explicitly requested.

## Scope

This change affects type-option parameter presentation and commit behavior only. Dialect catalogs, SQL formatting, custom-type dependencies, and parsing remain unchanged.
