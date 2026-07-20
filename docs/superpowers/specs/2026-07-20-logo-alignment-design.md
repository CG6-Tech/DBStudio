# DBStudio Logo Alignment Design

## Objective

Correct the optical alignment of the existing DBStudio app mark without redesigning it. Preserve the dark rounded-square background, the three overlapping mint table outlines, their rotation, spacing, corner radius, stroke width, and opacity progression.

## Geometry

The three internal rectangles remain unchanged:

- size: `168 × 96`;
- corner radius: `18`;
- stroke width: `28`;
- positions: `(0, 0)`, `(80, 97)`, and `(0, 194)`;
- rotation: `30deg`;
- opacities: `1`, `0.8`, and `0.55`.

Keep the supplied group transform anchored at `(256, 256)` with its `30deg` rotation and `(-120, -132)` local translation. The updated middle and lower offsets are the approved production geometry.

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
