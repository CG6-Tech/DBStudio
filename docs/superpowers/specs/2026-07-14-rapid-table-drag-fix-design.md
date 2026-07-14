# Rapid Table Drag Fix

## Problem

Rapid table movement can outrun a table card's PixiJS `pointermove` hit area. The card then stops receiving movement events and commits an intermediate position. After the commit, the canvas fit effect also runs because it depends on the entire schema document, which makes the viewport jump. Relationship geometry is additionally rebuilt for every pointer event by scanning all relationships.

## Approved Design

Use one canvas-level drag controller for tables. A table card starts the drag and records the pointer ID, start pointer coordinates, and start table position. The PixiJS stage receives `globalpointermove`, so movement continues even when the pointer leaves the card. Stage-level pointer-up handling commits the final position and preserves click-to-select behavior when the movement threshold is not crossed.

Build a table-to-relationship index once per canvas render. Drag updates mark only the connected relationships dirty. The Pixi ticker flushes dirty relationship geometry once per frame and shares that redraw pass with active dashed-line animation.

Viewport fitting runs at renderer initialization and when the user explicitly requests Fit. Ordinary schema document updates, including table moves, do not alter the current pan or zoom.

## Error and Interaction Handling

- Ignore pointer events whose pointer ID does not match the active drag.
- Cancel the active drag safely when the render effect is torn down.
- Keep area assignment based on the table's final center point.
- Preserve table selection on a press-and-release that does not cross the movement threshold.
- Do not allow canvas panning to start from a table card.

## Verification

- Unit-test relationship indexing and dirty-route scheduling helpers.
- Run the existing Vitest suite and production TypeScript/Vite build.
- Run Rust tests and build the macOS application bundle.
- In the native app, move tables rapidly in multiple directions and confirm the card follows continuously, relationships remain attached, and the viewport does not refit after drop.
