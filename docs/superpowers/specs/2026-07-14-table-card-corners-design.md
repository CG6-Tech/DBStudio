# Table Card Corner Correction

## Problem

The table card used a rounded outer shape with a square full-width color accent. The accent therefore extended beyond the rounded top boundary and created visible protrusions at both corners.

## Approved Design

Use a 5px card radius and a 10px accent. Replace the square accent with an isolated closed vector path that follows the complete quadratic top corners and continues vertically to the accent's lower edge. The implementation adds no masks or display objects. Draw the outer border last so antialiasing remains continuous around the card.

## Verification

- Run the frontend tests and production build.
- Build the macOS application.
- Inspect selected and unselected table cards at native resolution and confirm both top corners are continuous, symmetric, and free of square protrusions.
