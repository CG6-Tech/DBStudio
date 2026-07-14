# Field Type Combobox Design

## Goal

Replace the native browser datalist with a polished, app-rendered type combobox that provides reliable sizing, search, grouping, parameter editing, and keyboard behavior inside the virtualized table editor.

## Trigger

- The field type trigger displays the complete formatted value, such as `TEXT`, `VARCHAR(255)`, or `NUMERIC(10, 2)`.
- Activating the trigger opens an anchored popover without changing the field row height.
- Unresolved legacy types remain visible with a warning style but cannot be selected for other fields.
- The trigger exposes combobox semantics, expanded state, and the active value to assistive technology.

## List State

The first popover state contains:

- a sticky search input;
- a Built-in Types group;
- a Custom Types group when reusable types exist;
- an empty-result message when no option matches.

Each option displays its canonical name and category or custom-type kind. Search matches canonical names, aliases, categories, and custom-type names. Results preserve dialect-config order.

The active type is marked with a check icon. Hover, keyboard focus, and selected states are visually distinct.

## Configuration State

Selecting a simple type applies it immediately and closes the popover. Selecting a configurable type opens an internal configuration state without changing SQL yet.

Configuration controls come from dialect settings:

- length for character and length-bearing types;
- precision and scale for exact numeric types;
- time precision where supported;
- PostgreSQL array dimensions;
- MySQL unsigned mode where supported;
- ordered values for MySQL `ENUM` and `SET`.

The configuration state contains Back, Cancel, and Apply actions. Back returns to the filtered type list. Cancel closes without changing the field. Apply validates the draft, updates the structured type, formats the canonical SQL label, and closes.

## Positioning

- The popover is 280 pixels wide and has a bounded scrollable result area.
- It aligns to the type trigger while remaining inside the sidebar viewport.
- It opens below by default and flips above when space below is insufficient.
- It overlays adjacent rows and does not affect virtualization measurements.
- It uses a high local stacking context and is not clipped by table-card overflow.

## Keyboard and Focus

- Enter, Space, or ArrowDown opens the combobox.
- Typing in search filters results immediately.
- ArrowUp and ArrowDown move the active option.
- Enter selects the active option.
- Home and End move to the first and last result.
- Escape closes without applying a draft.
- Tab follows normal focus order through configuration controls and actions.
- Focus returns to the type trigger after closing.
- Outside-click dismissal behaves like Cancel.

## Data Flow

- Opening copies the current structured field type into local draft state.
- Searching and configuration never call schema actions.
- Simple selections call `updateColumnType` immediately.
- Configurable selections call it only after Apply.
- Composite-type fields reuse the same combobox and commit callback.
- Domain base-type editing reuses the same combobox.

## Validation

- Numeric parameters accept non-negative integers only.
- Scale cannot exceed precision when both are present.
- Required MySQL `ENUM`/`SET` values must be non-empty and unique.
- PostgreSQL array dimensions must be a non-negative integer.
- Apply is disabled while the draft is invalid, with an inline explanation.

## Visual Style

- Use existing dark panel, border, radius, shadow, typography, and focus tokens.
- Canonical type names use compact monospace text.
- Categories and custom kinds use muted labels.
- Parameter controls match other compact sidebar editors.
- No native datalist or operating-system dropdown UI remains.

## Verification

- Confirm the dropdown is not clipped in collapsed or expanded table cards.
- Confirm it flips and remains inside the sidebar viewport.
- Confirm search, grouping, aliases, and empty states.
- Confirm simple selection and configurable Apply/Cancel behavior.
- Confirm table, domain, and composite field integrations.
- Confirm canonical SQL labels and saved SQL update only on commit.
- Do not run automated tests unless explicitly requested.

## Scope

This change replaces the field type selection interaction. It does not change dialect type definitions, custom-type schema behavior, or SQL parsing rules.
