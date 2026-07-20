# DBStudio Logo Alignment Design

## Objective

Correct the optical alignment of the existing DBStudio app mark without redesigning it. Preserve the dark rounded-square background, the three overlapping mint table outlines, their rotation, spacing, corner radius, stroke width, and opacity progression.

## Geometry

The three internal rectangles remain unchanged:

- size: `168 × 96`;
- corner radius: `18`;
- stroke width: `28`;
- positions: `(0, 0)`, `(72, 84)`, and `(0, 168)`;
- rotation: `30deg`;
- opacities: `1`, `0.8`, and `0.55`.

The current rotated mark sits high and slightly left inside the 512-pixel canvas. Move the group anchor from `(256, 256)` to `(264, 275)`, an optical correction of 8 pixels right and 19 pixels down. This retains the intended stagger while bringing the visual weight closer to the center.

## Assets

`src-tauri/icon-source.svg` remains the single source of truth. Regenerate the existing Tauri desktop, Windows, macOS, iOS, and Android icon outputs from that source. Do not independently edit generated raster files.

The in-app `BrandLogo` mark is outside this alignment correction because it is laid out by application CSS rather than rendered from the app-icon SVG.

## Validation

- Render the source at 512 pixels and confirm the symbol has balanced padding on all four sides.
- Inspect 16, 32, 64, 128, 256, and 512-pixel sizes for clipping, uneven stroke appearance, or loss of separation between rectangles.
- Confirm the background color remains `#101619` and the mark color remains `#7ee0b5`.
- Confirm every generated platform icon uses the corrected source.
- Confirm the icon remains recognizable in light and dark operating-system chrome.

## Scope

This change only corrects alignment. It does not introduce a new logo concept, wordmark, palette, animation, typography, or application UI change.
