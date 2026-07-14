# Canvas focus icon design

## Goal

Replace the table header's focus brackets with a compact circular target icon.

## Design

- Draw a complete 20 by 20 canvas-unit circular outline with a 2 canvas-unit stroke.
- Draw a small center dot inside the circle so the control reads as a focus target rather than a radio button.
- Use the existing muted header-control color at rest.
- Use the existing subtle green circular hover background.
- Preserve the current 34 by 34 pointer hit target.

## Behavior

The icon continues to perform the existing coordinated focus action:

- Select the table.
- Open the Tables sidebar.
- Expand the table editor.
- Center the table in the canvas viewport.

No width, relationship-port, routing, or selection behavior changes are included.

## Verification

- The previous focus brackets are no longer visible.
- The complete circular outline and center dot remain legible at normal canvas zoom.
- Hover and click behavior remain unchanged.
- Produce a fresh macOS app bundle after implementation, as requested.
