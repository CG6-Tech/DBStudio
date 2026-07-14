# Canvas Controls and Adaptive Grid Design

## Goal

Make the canvas visually legible at every zoom level and make every canvas-toolbar control functional, responsive, and consistent with large-diagram performance requirements.

## Architecture

Pixi remains the owner of high-frequency viewport transforms. Zustand carries low-frequency public state and command counters between the sibling toolbar and canvas components.

The shared canvas state contains:

- current zoom
- zoom-in, zoom-out, Fit, focus-selection, and auto-layout request counters
- snap-to-grid enabled state
- minimap visible state
- canvas-search open state

Commands increment counters rather than storing transient callbacks. Pixi handles each new request exactly once. Pan and wheel events update Pixi immediately, then publish the resulting zoom without reconstructing the scene.

## Adaptive Dot Grid

Render the grid with a single CSS radial gradient on the canvas host. Do not create Pixi sprites or DOM elements per dot.

The base world grid is 28 units. For viewport scale `s`:

- screen spacing is `28 × s`, with a lower display clamp that prevents an unreadable solid texture
- dot radius is `clamp(0.55, 1.15 × sqrt(s), 2.2)` CSS pixels
- background offset is the viewport translation modulo the displayed spacing

When the raw spacing becomes too small, skip grid levels by powers of two until visible dots are separated by at least 10 pixels. This preserves world alignment while keeping the number of visible dots bounded. Grid variables update imperatively on pan and zoom.

## Zoom Controls

All zoom paths use the same affine transform and bounds.

- Wheel zoom preserves the world coordinate under the pointer.
- Toolbar zoom preserves the world coordinate at the viewport center.
- Zoom buttons multiply or divide scale by `1.25`.
- Toolbar value displays the actual zoom as a rounded percentage.
- Fit uses complete workspace bounds and publishes the fitted scale.
- Focus selection centers the selected table and chooses a readable scale capped by normal zoom bounds.

Zoom changes update Pixi, grid variables, minimap viewport, and toolbar value as one operation.

## Search

Canvas search indexes normalized table and column names. Ranking order is:

1. exact table match
2. table prefix
3. exact column match
4. column prefix
5. table substring
6. column substring

Results show table names and optional column context. Arrow keys move the active result, Enter selects and focuses it, and Escape closes search. Selecting a column applies the existing column selection so relationship highlighting continues to work.

`Command-F` opens canvas search when focus is not inside an editable control.

## Toolbar Actions

### Zoom out / value / zoom in

Apply center-preserving multiplicative zoom and show the live percentage.

### Fit workspace

Frame all tables, Areas, and notes. Shortcut: `0` outside editable controls.

### Focus selection

Center the selected table or selected column's table. Disable when nothing is selected. Shortcut: `F` outside editable controls.

### Auto layout

Run the approved Area-first clustered layout explicitly. Locked Areas and their member tables are fixed obstacles. Only unlocked content is rearranged. Apply the final positions as one undoable document operation, then Fit once. No continuous relayout follows.

### Snap to grid

Toggle world-coordinate snapping. Table, Area, and note movement quantizes final and live coordinates to the 28-unit base grid. The active button is visibly selected.

### Toggle minimap

Show or hide the minimap. The active button is visibly selected. Clicking the minimap converts its local coordinate through the workspace-bounds projection and centers the main viewport there.

## Minimap

Project actual table, Area, and note coordinates into a shared workspace-bounds rectangle. Do not derive positions from array indexes.

Render a viewport rectangle from the inverse main-canvas transform. Recompute bounds only when layout geometry changes; update the viewport rectangle imperatively during pan and zoom.

The minimap is interactive but does not intercept canvas controls when hidden.

## Keyboard and Accessibility

- `Command-F`: search
- `+` / `=`: zoom in
- `-`: zoom out
- `0`: Fit
- `F`: focus selection
- Escape: close search

Shortcuts do nothing when an input, textarea, select, or content-editable element owns focus. Every toolbar button has an accessible label, tooltip, active state, and disabled explanation where relevant.

## Performance

- Grid rendering and grid updates are O(1).
- Pan and zoom mutate transforms and CSS variables without React state per frame.
- Zoom publication is deduplicated by rounded display percentage.
- Search uses a memoized flat index and returns a bounded result list.
- Minimap projection is O(tables + Areas + notes) only when geometry changes; viewport updates are O(1).
- Auto layout stays in the worker and commits once.

## Failure Handling

- Empty workspace Fit resets to a safe default viewport.
- Focus selection ignores stale or missing table IDs.
- Search returns an explicit empty state.
- Auto-layout failure preserves existing positions and shows an error status.
- Minimap projection handles zero-width or zero-height bounds.
- Zoom and grid calculations reject non-finite values and enforce configured bounds.

## Testing

- Adaptive spacing remains world-aligned and dots stay within radius limits.
- Center- and pointer-preserving zoom retain the chosen world coordinate.
- Zoom percentage matches the viewport scale.
- Snap quantization works at multiple zoom levels.
- Search ranking follows the defined order and selects table/column targets.
- Fit and focus calculate correct transforms.
- Minimap projection and inverse click navigation round-trip.
- Position-only viewport commands do not reconstruct the layout.
- Auto layout preserves locked Area contents and commits unlocked positions once.
- Keyboard shortcuts ignore editable controls.
- All toolbar buttons expose working actions and correct active/disabled states.

## Scope

This phase completes canvas navigation and toolbar behavior. It does not add touch gestures beyond existing pointer and wheel support, semantic zoom card variants, saved per-user toolbar preferences, or continuous automatic layout.
