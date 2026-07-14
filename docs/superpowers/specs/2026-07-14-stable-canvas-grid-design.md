# Stable Canvas Grid Design

## Goal

Remove visible dot jitter during zoom and pan while keeping the grid aligned with canvas world coordinates and maintaining constant-time rendering.

## Design

- Continue using one CSS radial-gradient background; do not create individual Pixi grid objects.
- Calculate grid spacing from the world grid size and viewport scale.
- Use hysteresis when selecting the power-of-two grid level so a small zoom delta cannot repeatedly switch density near a threshold.
- Keep dot radius stable in physical screen pixels instead of continuously resizing it for every wheel event.
- Quantize the CSS background offset and spacing to device-pixel boundaries before updating CSS variables.
- Preserve exact world anchoring by deriving the offset from the viewport transform and selected grid level.

## Performance

The update remains O(1) per viewport change and updates four CSS custom properties. No per-dot display objects, loops, textures, or additional animation tickers are introduced.

## Testing

- Unit-test hysteresis at both sides of a density threshold.
- Unit-test device-pixel quantization.
- Verify zoom anchoring remains unchanged.
- Run frontend tests and production build.

## Scope

This change affects only canvas grid presentation. Table geometry, zoom limits, relationship rendering, and snapping remain unchanged.
