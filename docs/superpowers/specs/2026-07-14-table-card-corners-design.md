# Table Card Corner Correction

## Problem

The table card uses a 10px rounded outer shape, but its 5px color accent is a square full-width rectangle. The accent therefore extends beyond the rounded top boundary and creates visible protrusions at both corners.

## Approved Design

Replace the square accent with one closed vector path derived from the same quadratic corner curve as the card. The path follows only the top five pixels of both 10px corners, uses a straight inner edge, and adds no masks or display objects. Draw the outer border last so antialiasing remains continuous around the card.

## Verification

- Run the frontend tests and production build.
- Build the macOS application.
- Inspect selected and unselected table cards at native resolution and confirm both top corners are continuous, symmetric, and free of square protrusions.
