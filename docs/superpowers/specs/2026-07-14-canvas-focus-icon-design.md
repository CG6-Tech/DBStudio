# Canvas focus icon design

## Goal

Replace the table header's dotted circular symbol, which resembles a loading indicator, with an immediately recognizable focus icon.

## Design

- Draw four separated corner brackets forming an 18 by 18 canvas-unit focus frame.
- Draw a small center dot inside the frame.
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

- The dotted ring is no longer visible.
- The four corner brackets and center dot remain legible at normal canvas zoom.
- Hover and click behavior remain unchanged.
- Produce a fresh macOS app bundle after implementation, as requested.
