# Centered Inline Type Parameters Design

## Goal

Center the compact type dropdown within its owning editor and replace the separate configuration screen with inline parameter inputs inside the selected option row.

## Positioning

- Keep the responsive 220-pixel maximum width.
- For table fields, center the popover horizontally within the table card.
- For domain and composite fields, center the popover within the custom-type card.
- Fall back to centering within the context panel when no editor card exists.
- Clamp the centered position to an 8-pixel inset from both sidebar edges.
- Preserve above/below flipping and scroll-container awareness.

## Inline Configuration

- Simple types apply immediately when selected.
- Selecting a parameterized type expands that option in place within the searchable results list.
- The expanded option retains its canonical name and category header.
- Parameter inputs, validation, Cancel, and Apply render directly below the selected option.
- No separate configuration screen or Back action remains.
- Search remains visible while an option is expanded.
- Selecting a different option discards the previous uncommitted draft.
- Cancel collapses the draft without changing the schema.
- Apply commits the structured type and closes the dropdown.

## Dialect Defaults

Default parameter values are defined in the dialect data-type configuration, not in the UI component.

- MySQL integer display width: `10`
- Character length: `255`
- Numeric precision: `10`
- Numeric scale: `2`
- Time precision: `6`
- MySQL `ENUM` and `SET`: `value_1`, `value_2`
- PostgreSQL array dimensions: `0`
- MySQL unsigned: `false`

Selecting and applying a parameterized type persists its configured defaults, producing canonical labels such as `INT(10)`, `VARCHAR(255)`, and `NUMERIC(10, 2)`.

## Configuration Contract

Extend each dialect data-type definition with optional default parameters. Type parsing continues to preserve values already present in SQL. New selections copy configuration defaults into a local draft, so changing the draft cannot mutate shared settings.

## Keyboard and Focus

- Enter on a parameterized option expands its inline editor.
- Focus moves to the first parameter input.
- Tab moves through parameters, Cancel, and Apply.
- Escape cancels the draft and closes the dropdown without applying.
- Arrow navigation remains available when focus returns to search.
- Apply returns focus to the type trigger after committing.

## Validation

- Numeric parameters accept non-negative integers.
- Scale cannot exceed precision.
- `ENUM` and `SET` values must be non-empty and unique.
- Apply remains disabled while invalid, with an inline error message.

## Verification

- Confirm table popovers center within table cards.
- Confirm domain and composite popovers center within custom-type cards.
- Confirm edge clamping on narrow sidebars.
- Confirm defaults come from active dialect settings and persist on Apply.
- Confirm inline Cancel and Apply do not mutate SQL prematurely.
- Confirm simple types still apply immediately.
- Do not run automated tests unless explicitly requested.

## Scope

This change modifies type-picker positioning and parameter-selection interaction. It does not change SQL parsing syntax, custom-type dependency behavior, or the approved type catalog.
