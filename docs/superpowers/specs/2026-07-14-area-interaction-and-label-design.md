# Area Interaction and Label Design

## Goal

Make canvas areas reliable to move and resize, remove the heavy full-width area header, and provide a clear label that does not interfere with tables inside the area.

## Interaction Architecture

Use one Pixi stage-level interaction controller for all area movement and resizing. An active interaction records its pointer ID, area ID, starting pointer coordinates, and starting geometry. The stage receives `globalpointermove`, so the interaction continues when rapid movement carries the pointer outside the original handle. Pointer-up or pointer-up-outside commits exactly one history operation. Events from other pointers are ignored.

Area movement starts only from the floating label. The area background does not start movement, which keeps contained tables directly accessible. Locked areas expose no movement or resize interactions.

## Area Movement

Dragging the floating label updates the area position continuously. When `moveContents` is enabled, every contained table moves by the same delta during the gesture and connected relationship geometry is refreshed once per animation frame. Releasing commits the final area position and table positions in one document replacement. When `moveContents` is disabled, only the area moves.

## Area Resizing

The bottom-right corner uses a 28px transparent interaction target with a smaller visible corner indicator. Resizing updates the area outline and handle continuously through the stage-level controller. Width is clamped to at least 220px and height to at least 140px. Releasing commits one `Resize area` history operation.

## Canvas Appearance

Use the selected floating-label direction:

- A compact dark label sits at the upper-left edge of the area.
- The label contains a grip, area name, and contained-table count.
- The label border and grip use the area's color.
- The full-width colored header band is removed.
- The area retains a subtle tinted fill, thin colored outline, and bottom-right resize indicator.

## Safety and Cleanup

- Cancel active interaction state when the canvas render effect is torn down.
- Do not commit a history operation when geometry did not change.
- Preserve the existing area lock and `moveContents` options.
- Keep relationship redraw work indexed by table and batched through the Pixi ticker.

## Verification

- Unit-test area geometry clamping and movement deltas.
- Run the complete frontend test suite and production build.
- Run Rust tests and build the macOS application bundle.
- In the native app, rapidly drag an area from its label, resize it larger and smaller, verify minimum dimensions, test locked behavior, and verify live table and relationship movement when `moveContents` is enabled.
