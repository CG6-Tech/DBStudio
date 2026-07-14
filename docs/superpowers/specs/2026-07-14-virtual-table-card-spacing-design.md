# Virtual Table Card Spacing Design

## Goal

Add consistent breathing room between cards in the virtualized Tables panel without introducing overlap, scroll jumps, or incorrect focus positioning.

## Layout

- Keep each collapsed table card 46 pixels tall.
- Add an 8-pixel gap after every table card.
- Add an 8-pixel inset between each card and both horizontal edges of the virtual table list.
- Do not add an extra gap above the first card.
- Apply the same horizontal inset and following gap to expanded cards.

## Virtualization

- Increase the compact virtual row height from 46 to 54 pixels so the scroll model includes the 8-pixel vertical gap.
- Keep expanded-body measurement separate from the compact row height. An expanded row therefore occupies 54 pixels plus its measured body height.
- Retain the current overscan, keyboard navigation, reveal-on-focus, and binary-search range calculation.
- Apply horizontal spacing to the card width and margins only; it does not affect vertical calculations.

## Styling

- Each virtual table card uses `width: calc(100% - 16px)` with 8-pixel horizontal margins.
- Each card uses an 8-pixel bottom margin contained within its 54-pixel virtual slot.
- Existing borders, selection states, rounded corners, action menus, and table accent colors remain unchanged.

## Verification

- Confirm adjacent collapsed cards have an 8-pixel gap.
- Confirm cards are inset 8 pixels from both list edges.
- Confirm expanded cards do not overlap the card below.
- Confirm scrolling and keyboard navigation still reveal the correct table.
- Do not run automated tests unless the user requests them.

## Scope

This change only adjusts spacing and the corresponding virtual-row metric. It does not redesign table cards or alter schema behavior.
