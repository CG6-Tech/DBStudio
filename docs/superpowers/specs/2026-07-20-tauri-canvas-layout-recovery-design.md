# Tauri Canvas Layout Recovery Design

## Goal

Ensure database tables always appear on the diagram canvas in Tauri on macOS, Windows, and Linux. Preserve ELK's relationship-aware layout where it works, while treating ELK as an optional enhancement rather than a rendering dependency.

## Problem

The schema parser and application state load tables correctly, as shown by the sidebar, status counts, relationships, and minimap. The table cards disappear only in the Pixi canvas scene.

Two failures combine:

1. `layout.worker.ts` constructs ELK from `elk.bundled.js`. In macOS WKWebView, the bundled ELK worker shim attempts `new _Worker(url)` with an undefined constructor. The outer layout worker therefore fails during initialization.
2. `DiagramCanvas` builds its culled Pixi scene without directly depending on the effective node layout or layout generation. When layout fallback or initial fitting changes the table positions after the first scene pass, the table cards are not guaranteed to mount again.

## Design

### Optional ELK layout

The layout hook will always publish the synchronous clustered-grid layout first. ELK will run as an asynchronous enhancement only after its worker has confirmed that it initialized successfully.

The ELK worker will use a WebKit-compatible initialization path that does not create a broken nested worker. Any construction, startup, message, or runtime failure will terminate that worker and leave the already-published clustered-grid layout active. The application will not show a blocking error because a complete usable layout is available.

### Reliable canvas rebuilding

`DiagramCanvas` will derive a compact scene-layout key from each effective node's identifier and geometry. Its scene-building effect will depend on that key, ensuring that a fallback layout, ELK result, saved position, or geometry change rebuilds the Pixi cards.

After the initial or explicit Fit operation updates the viewport, canvas culling will be refreshed. If the fitted bounds extend outside the retained scene bounds, the existing viewport-version mechanism will rebuild the visible scene.

### Error handling

- Worker construction failure: keep clustered-grid layout.
- Worker startup/runtime failure: terminate the failed worker and keep clustered-grid layout.
- Stale ELK response: ignore it using the existing generation token.
- Pixi initialization failure: surface a controlled canvas error instead of leaving an indefinite preparing state.

## Testing

- Verify `useLayout` publishes fallback nodes when `Worker` construction throws.
- Verify a worker error does not replace or clear the fallback layout.
- Verify a successful worker result upgrades the initial layout.
- Verify the canvas scene-layout key changes when node geometry changes.
- Run the complete frontend and Rust test suites.
- Build the production frontend and launch the Tauri app with the two-table example to confirm both table cards and their relationship render.

## Scope

This fix does not change SQL parsing, stored schema data, Firebase configuration, update behavior, or visual styling. It only makes layout enhancement and canvas mounting resilient across Tauri webviews.
