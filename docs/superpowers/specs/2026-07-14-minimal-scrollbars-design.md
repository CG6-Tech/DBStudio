# Minimal Scrollbars Design

## Goal

Replace the visually heavy native scrollbars with a compact, consistent treatment that fits ViewDB's dark interface without changing scrolling behavior.

## Design

- Apply the treatment to every scrollable application surface, including the table sidebar, panels, type dropdown, canvas search, relationship picker, inspector, and SQL preview.
- Use 6px vertical and horizontal scrollbars.
- Keep tracks and scrollbar corners transparent.
- Render the thumb as a fully rounded, muted gray-green shape.
- Brighten the thumb slightly on hover and active interaction.
- Remove the virtual table list's reserved scrollbar gutter so it does not create a wide dark strip.
- Keep a minimum visible contrast against dark panels while avoiding a high-contrast black pill.

## Compatibility

- Use `scrollbar-width` and `scrollbar-color` for standards-based engines.
- Use `::-webkit-scrollbar` selectors for the Tauri macOS webview and Chromium/WebKit-compatible rendering.
- Preserve trackpad, mouse wheel, keyboard, drag, and horizontal scrolling behavior.
- Do not hide the scrollbar or change overflow rules.

## Verification

- Run the production frontend build.
- Confirm the table list no longer reserves a wide gutter.
- Confirm scrollbars in popup lists and the SQL preview use the same 6px treatment.
- Confirm thumbs remain visible and become clearer on hover.
