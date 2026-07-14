# Shared Color Swatch Picker Design

## Goal

Replace native unrestricted color inputs with one consistent, accessible six-color picker for tables, areas, and notes.

## Approved Palette

The picker exposes only the existing application palette:

- Mint: `#7ee0b5`
- Blue: `#7fb1ff`
- Purple: `#bc78f0`
- Pink: `#ff6584`
- Yellow: `#f4c95d`
- Teal: `#52d5c8`

The palette remains defined once in the schema domain and is consumed by every picker instance.

## Shared Component

Create a reusable `ColorSwatchPicker` component with:

- current color;
- accessible object label;
- palette values;
- change callback;
- optional compact presentation for menus.

The trigger is a rounded swatch showing the current color. Activating it opens an anchored popover containing the six approved colors. Selecting a swatch applies the color immediately, displays the active-state checkmark, and closes the popover.

## Interaction

- Click or Enter/Space opens the picker.
- Arrow keys move focus through swatches.
- Enter or Space applies the focused swatch.
- Escape closes without changing the value.
- Clicking outside closes the popover.
- Focus returns to the trigger after keyboard dismissal or selection.
- Each swatch exposes its human-readable color name to assistive technology.
- Only one picker can remain open within a component tree at a time through normal outside-click behavior.

## Integrations

- Table action menus replace the invisible native color input with the shared swatch picker.
- Area cards replace their native color inputs with the same picker.
- Note cards replace their native color inputs with the same picker.
- The decorative palette row at the bottom of the Areas/Notes panel is removed.
- Existing update actions and history labels remain unchanged.

## Legacy Colors

Files may contain colors outside the approved palette. Their trigger continues to display the stored color so existing diagrams do not change merely by opening them. The popover shows no active checkmark until an approved color is selected. After selection, the object uses an approved palette color and cannot return to an arbitrary color through the UI.

## Layout

- Popover uses a compact single row or wrapping grid of six 28-pixel swatches.
- It uses the existing dark panel border, radius, shadow, and focus tokens.
- The popover stays inside the sidebar viewport and appears above the trigger when there is insufficient space below.
- Table menu integration does not close the table action menu until a color is selected or the menu is dismissed.

## Verification

- Confirm all three object kinds expose the same six colors.
- Confirm selecting a color updates the canvas and history immediately.
- Confirm active checkmarks and focus movement work.
- Confirm Escape and outside-click dismissal.
- Confirm legacy off-palette colors remain unchanged until selection.
- Confirm no native system color panel can be opened.
- Do not run automated tests unless explicitly requested.

## Scope

This change standardizes object color selection only. It does not add palette editing, opacity controls, gradients, custom color entry, or per-dialect palettes.
